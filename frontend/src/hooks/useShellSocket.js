import { useCallback, useEffect, useRef, useState } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_BACKEND_URI?.replace(/^http/, "ws") ?? "ws://localhost:8080";
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
  const subscribedShells = useRef(new Set());
  const shellOffsets = useRef({});
  const outputCallbacks = useRef(new Map());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const send = useCallback((event, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
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

    ws.onclose = () => {
      const wasConnected = wsRef.current !== null;
      setWsConnected(false);
      wsRef.current = null;
      if (wasConnected && reconnectAttempt.current === 0) {
        onErrorRef.current?.("Shell connection lost. Reconnecting...", "warning");
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
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

      case "error":
        console.error("[ShellSocket] Error:", data.message);
        onErrorRef.current?.(data.message, "error");
        break;
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
    send("spawn_shell", { label });
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
    return () => {
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
