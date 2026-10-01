import { useCallback, useEffect, useRef, useState } from "react";

// Same-origin WebSocket through the black-box gateway (server.js proxies
// /ws/* to the backend). The backend host is never known to the browser.
const WS_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "ws://localhost:3001";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const RECONNECT_MAX_ATTEMPTS = 10;

export default function useShellSocket({ sessionId, onError }) {
  const [shells, setShells] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({ hostConnected: false });
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempt = useRef(0);
  const lastPongRef = useRef(Date.now());
  const subscribedShells = useRef(new Set());
  const shellOffsets = useRef({});
  const outputCallbacks = useRef(new Map());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const send = useCallback((event, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/ws/shell?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const wasReconnect = reconnectAttempt.current > 0;
      setWsConnected(true);
      reconnectAttempt.current = 0;
      lastPongRef.current = Date.now();
      if (wasReconnect) {
        onErrorRef.current?.("Shell connection restored", "success");
      }
      send("request_shell_list", {});

      for (const shellId of subscribedShells.current) {
        send("subscribe_shell", { shellId });
        const offset = shellOffsets.current[shellId] ?? 0;
        send("request_buffer", { shellId, fromOffset: offset });
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // invalid message
      }
    };

    ws.onclose = (event) => {
      const code = event?.code;
      const reason = event?.reason || "";
      console.info(`[ShellSocket] WS closed: code=${code} reason="${reason}"`);
      const wasConnected = wsRef.current !== null;
      setWsConnected(false);
      wsRef.current = null;
      if (wasConnected && reconnectAttempt.current === 0) {
        const detail =
          code === 1006
            ? " (abnormal closure — gateway or backend restarted)"
            : reason
              ? ` (${reason})`
              : "";
        onErrorRef.current?.(`Shell connection lost${detail}. Reconnecting...`, "warning");
      }
      scheduleReconnect();
    };

    ws.onerror = (event) => {
      // onclose will fire right after this; keep a breadcrumb for debugging.
      console.warn("[ShellSocket] WS error:", event?.message || event?.type || "unknown");
    };
  }, [sessionId]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (reconnectAttempt.current >= RECONNECT_MAX_ATTEMPTS) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
      RECONNECT_MAX_MS,
    );
    reconnectAttempt.current++;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, delay);
  }, [connect]);

  const handleMessage = useCallback((msg) => {
    const { event, data } = msg;

    switch (event) {
      case "shell_list":
        setShells(data.shells || []);
        break;

      case "shell_created":
        setShells((prev) => {
          if (prev.find((s) => s.shellId === data.shellId)) return prev;
          return [...prev, { ...data, status: "active", createdAt: new Date().toISOString(), bufferLength: 0 }];
        });
        break;

      case "shell_spawned":
        setShells((prev) => {
          if (prev.find((s) => s.shellId === data.shellId)) return prev;
          return [...prev, { ...data, status: "active", type: "pty", createdBy: "user", createdAt: new Date().toISOString(), bufferLength: 0 }];
        });
        break;

      case "shell_closed":
        setShells((prev) =>
          prev.map((s) => (s.shellId === data.shellId ? { ...s, status: "closed" } : s)),
        );
        break;

      case "shell_output": {
        const { shellId, data: outputData, offset } = data;
        if (offset) shellOffsets.current[shellId] = offset;
        const cb = outputCallbacks.current.get(shellId);
        if (cb) cb(outputData);
        break;
      }

      case "shell_status":
        setShells((prev) =>
          prev.map((s) => (s.shellId === data.shellId ? { ...s, status: data.status } : s)),
        );
        break;

      case "connection_status":
        setConnectionStatus(data);
        break;

      case "pong":
        // Application-level heartbeat reply from the backend.
        lastPongRef.current = Date.now();
        break;

      case "error": {
        // Session หมดอายุ/ยังไม่ login → backend ปฏิเสธ WS ก่อนเปิด. เป็น
        // สถานะที่คาดได้บนหน้า public/หลัง logout — อย่า toast/log สแปม
        // และหยุด reconnect ลูป (ถ้า login ใหม่แล้ว mount hook ใหม่จะ connect ใหม่)
        // เพิ่ม "Session not found" (session ถูกลบ/เก็บเข้าคลังไปแล้ว หรือ URL
        // เก่าค้าง) — retry ไปก็ไม่มีทางสำเร็จ จึงหยุด reconnect ลูปแทนการ log
        // ทุกครั้ง (mount ใหม่ = login ใหม่/session ใหม่ จะ connect เอง)
        if (data?.message === "Unauthorized" || data?.message === "Session not found") {
          console.info(`[ShellSocket] ${data?.message}: skipping reconnect`);
          reconnectAttempt.current = RECONNECT_MAX_ATTEMPTS;
          setWsConnected(false);
          try {
            wsRef.current?.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
          break;
        }
        console.error("[ShellSocket] Error:", data.message);
        onErrorRef.current?.(data.message, "error");
        break;
      }
    }
  }, []);

  const subscribeShell = useCallback((shellId, opts) => {
    subscribedShells.current.add(shellId);
    send("subscribe_shell", { shellId });
    const offset = opts?.fullBuffer ? 0 : (shellOffsets.current[shellId] ?? 0);
    send("request_buffer", { shellId, fromOffset: offset });
  }, [send]);

  const unsubscribeShell = useCallback((shellId) => {
    subscribedShells.current.delete(shellId);
    send("unsubscribe_shell", { shellId });
  }, [send]);

  const sendShellInput = useCallback((shellId, input) => {
    send("shell_input", { shellId, input });
  }, [send]);

  const spawnShell = useCallback((label) => {
    return send("spawn_shell", { label });
  }, [send]);

  const closeShell = useCallback((shellId) => {
    send("close_shell", { shellId });
  }, [send]);

  const resizeShell = useCallback((shellId, cols, rows) => {
    send("resize_shell", { shellId, cols, rows });
  }, [send]);

  const onShellOutput = useCallback((shellId, callback) => {
    outputCallbacks.current.set(shellId, callback);
    return () => {
      outputCallbacks.current.delete(shellId);
    };
  }, []);

  const refreshShellList = useCallback(() => {
    send("request_shell_list", {});
  }, [send]);

  useEffect(() => {
    connect();

    // Application-level heartbeat with the backend: send `ping` every 15s and
    // expect a `pong` event. If no pong arrives for >45s the connection is
    // treated as dead (gateway/browser stuck) and closed to force a reconnect
    // (the server, in turn, cleans up shell subscriptions after 25-30s).
    const appPing = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "ping", data: { t: Date.now() } }));
      }
    }, 15000);

    const staleCheck = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastPongRef.current > 45000) {
        console.warn("[ShellSocket] No pong for 45s — closing to force reconnect");
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }, 10000);

    return () => {
      clearInterval(appPing);
      clearInterval(staleCheck);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    shells,
    setShells,
    connectionStatus,
    wsConnected,
    subscribeShell,
    unsubscribeShell,
    sendShellInput,
    spawnShell,
    closeShell,
    resizeShell,
    onShellOutput,
    refreshShellList,
  };
}
