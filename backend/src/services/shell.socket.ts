import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { sessionLifecycle } from "./session.lifecycle";
import { ShellManager } from "./shell.manager";
import SessionsModel from "../models/Sessions/Sessions.model";
import { forceResetAgent } from "./agent.service";

const WS_HEARTBEAT_INTERVAL_MS = 25_000;

interface ShellSocketClient {
  ws: WebSocket;
  sessionId: string;
  userId: string;
  subscribedShells: Set<string>;
  shellSentOffsets: Map<string, number>;
}

const clients = new Map<WebSocket, ShellSocketClient>();
const clientManagers = new Map<WebSocket, ShellManager>();
const shellListeners = new Map<string, Map<string, (...args: any[]) => void>>();

function send(ws: WebSocket, event: string, data: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ event, data }));
    } catch {
      // client gone
    }
  }
}

function subscribeToShellEvents(client: ShellSocketClient, shellManager: ShellManager): void {
  const sessionId = client.sessionId;
  const key = `${sessionId}:${clientKey(client.ws)}`;

  if (shellListeners.has(key)) return;

  const listeners = new Map<string, (...args: any[]) => void>();

  const onOutput = (info: { shellId: string; data: string; offset: number }) => {
    if (!client.subscribedShells.has(info.shellId)) return;
    const sentOffset = client.shellSentOffsets.get(info.shellId);
    if (sentOffset !== undefined && info.offset <= sentOffset) return;
    client.shellSentOffsets.set(info.shellId, info.offset);
    send(client.ws, "shell_output", info);
  };

  const onCreated = (info: { shellId: string; label: string; type: string; createdBy: string }) => {
    send(client.ws, "shell_created", info);
  };

  const onClosed = (info: { shellId: string }) => {
    send(client.ws, "shell_closed", info);
    client.subscribedShells.delete(info.shellId);
    client.shellSentOffsets.delete(info.shellId);
  };

  const onConnectionStatus = (status: { sshConnected: boolean; error?: string }) => {
    send(client.ws, "connection_status", status);
  };

  shellManager.on("shell_output", onOutput);
  shellManager.on("shell_created", onCreated);
  shellManager.on("shell_closed", onClosed);
  shellManager.on("connection_status", onConnectionStatus);

  listeners.set("shell_output", onOutput);
  listeners.set("shell_created", onCreated);
  listeners.set("shell_closed", onClosed);
  listeners.set("connection_status", onConnectionStatus);

  shellListeners.set(key, listeners);
}

function unsubscribeFromShellEvents(client: ShellSocketClient, shellManager: ShellManager): void {
  const key = `${client.sessionId}:${clientKey(client.ws)}`;
  const listeners = shellListeners.get(key);
  if (!listeners) return;

  for (const [event, handler] of listeners) {
    shellManager.removeListener(event, handler);
  }
  shellListeners.delete(key);
}

function clientKey(ws: WebSocket): string {
  return (ws as any).__shellSocketId ?? "unknown";
}

let nextClientId = 0;

export function setupShellWebSocket(server: Server, sessionMiddleware: any): void {
  const wss = new WebSocketServer({ server, path: "/ws/shell" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    (ws as any).__shellSocketId = `c${nextClientId++}`;

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      send(ws, "error", { message: "sessionId query parameter is required" });
      ws.close();
      return;
    }

    // Extract userId from session cookie
    let userId: string | null = null;
    try {
      const fakeRes = { end: () => {}, writeHead: () => {}, setHeader: () => {} } as any;
      await new Promise<void>((resolve) => {
        sessionMiddleware(req, fakeRes, () => {
          userId = (req as any).session?.user?.userId ?? null;
          resolve();
        });
      });
    } catch {
      // session parsing failed
    }

    if (!userId) {
      send(ws, "error", { message: "Unauthorized" });
      ws.close();
      return;
    }

    const ownedSession = await SessionsModel.exists({
      sessionId,
      uid: userId,
      status: "active",
    });
    if (!ownedSession) {
      send(ws, "error", { message: "Session not found" });
      ws.close();
      return;
    }

    const client: ShellSocketClient = {
      ws,
      sessionId,
      userId,
      subscribedShells: new Set(),
      shellSentOffsets: new Map(),
    };
    clients.set(ws, client);
    // Heartbeat bookkeeping (see wss heartbeat interval below).
    (ws as any).__isAlive = true;
    ws.on("pong", () => {
      (ws as any).__isAlive = true;
    });

    let shellManager: ShellManager;
    try {
      shellManager = await sessionLifecycle.getShellManager(sessionId);
    } catch (err: any) {
      send(ws, "error", { message: "Failed to get shell manager" });
      ws.close();
      return;
    }

    clientManagers.set(ws, shellManager);
    subscribeToShellEvents(client, shellManager);

    send(ws, "connection_status", { sshConnected: shellManager.isConnected });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(client, shellManager, msg);
      } catch (err: any) {
        console.warn(`[ShellSocket] Invalid message from client=${clientKey(ws)}:`, err?.message ?? err);
        send(ws, "error", { message: `Invalid message: ${err.message}` });
      }
    });

    ws.on("close", (code?: number, reason?: string) => {
      console.info(`[ShellSocket] ws closed (client=${clientKey(ws)}, code=${code ?? "n/a"}, reason=${reason || ""})`);
      unsubscribeFromShellEvents(client, shellManager);
      clients.delete(ws);
      clientManagers.delete(ws);
    });

    ws.on("error", (error?: Error) => {
      console.warn(`[ShellSocket] ws error (client=${clientKey(ws)}):`, error?.message ?? error);
      unsubscribeFromShellEvents(client, shellManager);
      clients.delete(ws);
      clientManagers.delete(ws);
    });
  });

  // ── Heartbeat: detect half-open / dead WebSocket connections ──────────
  // Every 25s ping all clients. A client that fails to answer with a pong
  // before the next tick (~25-30s later) is treated as dead and terminated so
  // its session never holds stale shell subscriptions.
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if ((ws as any).__isAlive === false) {
        console.warn(`[ShellSocket] Heartbeat timeout — terminating client ${clientKey(ws)} (session ${client.sessionId})`);
        const mgr = clientManagers.get(ws);
        if (mgr) {
          try {
            unsubscribeFromShellEvents(client, mgr);
          } catch {
            // ignore
          }
        }
        clientManagers.delete(ws);
        clients.delete(ws);
        try {
          ws.terminate();
        } catch {
          // already gone
        }
        continue;
      }
      (ws as any).__isAlive = false;
      try {
        ws.ping();
      } catch {
        // socket already closed
      }
    }
  }, WS_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();
}

async function handleMessage(
  client: ShellSocketClient,
  shellManager: ShellManager,
  msg: { event: string; data?: any },
): Promise<void> {
  const { event, data } = msg;

  switch (event) {
    case "request_shell_list": {
      const shells = shellManager.getShellList();
      send(client.ws, "shell_list", { shells });
      break;
    }

    case "subscribe_shell": {
      const { shellId } = data ?? {};
      if (!shellId) {
        send(client.ws, "error", { message: "shellId required" });
        return;
      }
      // Don't add to subscribedShells yet — wait for request_buffer so the
      // full buffer replay is sent first and the live listener doesn't race.
      send(client.ws, "shell_status", {
        shellId,
        status: shellManager.getShell(shellId)?.status ?? "closed",
      });
      break;
    }

    case "unsubscribe_shell": {
      const { shellId } = data ?? {};
      if (shellId) {
        client.subscribedShells.delete(shellId);
        client.shellSentOffsets.delete(shellId);
      }
      break;
    }

    case "shell_input": {
      const { shellId, input } = data ?? {};
      if (!shellId || input === undefined) {
        send(client.ws, "error", { message: "shellId and input required" });
        return;
      }
      try {
        await shellManager.writeToShell(shellId, input);
      } catch (err: any) {
        send(client.ws, "error", { message: err.message });
      }
      break;
    }

    case "request_buffer": {
      const { shellId, fromOffset } = data ?? {};
      if (!shellId) {
        send(client.ws, "error", { message: "shellId required" });
        return;
      }
      try {
        const { data: bufData, offset } = shellManager.readOutput(shellId, fromOffset);
        client.shellSentOffsets.set(shellId, offset);
        if (bufData) {
          send(client.ws, "shell_output", { shellId, data: bufData, offset });
        }
        // Activate live forwarding only after the buffer snapshot offset is recorded,
        // so the onOutput listener skips anything already covered by the replay.
        client.subscribedShells.add(shellId);
      } catch (err: any) {
        send(client.ws, "error", { message: err.message });
      }
      break;
    }

    case "spawn_shell": {
      const { label } = data ?? {};
      if (!label) {
        send(client.ws, "error", { message: "label required" });
        return;
      }
      try {
        if (!shellManager.isConnected) {
          await shellManager.connect();
        }
        const shellId = await shellManager.spawnShell({
          label,
          type: "pty",
          createdBy: "user",
        });
        send(client.ws, "shell_spawned", { shellId, label });
      } catch (err: any) {
        console.error(`[ShellSocket] spawn_shell failed for session ${client.sessionId}:`, err?.message ?? err);
        send(client.ws, "error", { message: `Failed to spawn shell: ${err.message}` });
      }
      break;
    }

    case "close_shell": {
      const { shellId } = data ?? {};
      if (!shellId) {
        send(client.ws, "error", { message: "shellId required" });
        return;
      }
      try {
        await shellManager.closeShell(shellId);
      } catch (err: any) {
        send(client.ws, "error", { message: err.message });
      }
      break;
    }

    case "resize_shell": {
      const { shellId, cols, rows } = data ?? {};
      if (!shellId || cols == null || rows == null) {
        send(client.ws, "error", { message: "shellId, cols, and rows required" });
        return;
      }
      shellManager.resizeShell(shellId, cols, rows);
      break;
    }

    case "ping": {
      // Application-level heartbeat. The server also sends protocol-level
      // pings, but replying here keeps the pong visible to the gateway proxy
      // and lets the client verify the round trip itself.
      send(client.ws, "pong", { t: data?.t ?? Date.now() });
      break;
    }

    case "force_reset_agent": {
      // User hit "stuck agent" — abort any in-flight run, clear Redis pause
      // flag and return the session to idle.
      try {
        const result = await forceResetAgent(client.sessionId);
        send(client.ws, "agent_state_changed", {
          sessionId: client.sessionId,
          agentState: result.agentState,
          reason: "force_reset_agent",
        });
        send(client.ws, "agent_reset", {
          sessionId: client.sessionId,
          message: "Agent state reset to idle",
        });
      } catch (err: any) {
        send(client.ws, "error", { message: `Force reset failed: ${err.message}` });
      }
      break;
    }

    default:
      console.warn(`[ShellSocket] Unknown event "${event}" from client=${clientKey(client.ws)}`);
      send(client.ws, "error", { message: `Unknown event: ${event}` });
  }
}
