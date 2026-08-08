"use client";

import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

export default function ShellTerminal({
  shellId,
  subscribeShell,
  unsubscribeShell,
  sendShellInput,
  onShellOutput,
  resizeShell,
}) {
  const containerRef = useRef(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    disposedRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.15,
      fontFamily: "'Courier New', 'DejaVu Sans Mono', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#00f2fe",
        selectionBackground: "rgba(0, 242, 254, 0.25)",
        black: "#0d1117",
        red: "#ff5d5d",
        green: "#00e676",
        yellow: "#e5c07b",
        blue: "#00f2fe",
        magenta: "#00d2ff",
        cyan: "#00f2fe",
        white: "#e6edf3",
        brightBlack: "#6b7a90",
        brightRed: "#ff6b6b",
        brightGreen: "#00e676",
        brightYellow: "#f5d600",
        brightBlue: "#00d2ff",
        brightMagenta: "#00e676",
        brightCyan: "#00f2fe",
        brightWhite: "#ffffff",
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    let webglAddon = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
      });
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    const syncResize = () => {
      if (disposedRef.current || !resizeShell) return;
      try {
        fitAddon.fit();
        const { cols, rows } = terminal;
        if (cols > 0 && rows > 0) resizeShell(shellId, cols, rows);
      } catch {
        // container not visible yet
      }
    };

    requestAnimationFrame(syncResize);

    terminal.onData((data) => {
      sendShellInput(shellId, data);
    });

    subscribeShell(shellId, { fullBuffer: true });

    const isFirstWriteRef = { current: true };
    const cleanup = onShellOutput(shellId, (data) => {
      if (disposedRef.current) return;
      if (isFirstWriteRef.current && typeof data === "string") {
        isFirstWriteRef.current = false;
        // Strip zsh PROMPT_EOL_MARK — the "%" (possibly wrapped in ANSI reverse-video
        // escapes) followed by spaces and a carriage return. This appears when PTY and
        // terminal dimensions are briefly out of sync on spawn (xtermjs/xterm.js#2564).
        data = data.replace(/^(\x1b\[[0-9;]*m)*%(\x1b\[[0-9;]*m)*\s*\r/, "");
      }
      if (data) terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(syncResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      disposedRef.current = true;
      cleanup?.();
      unsubscribeShell(shellId);
      resizeObserver.disconnect();
      try { webglAddon?.dispose(); } catch { /* already disposed */ }
      try { terminal.dispose(); } catch { /* already disposed */ }
    };
  }, [shellId, subscribeShell, unsubscribeShell, sendShellInput, onShellOutput, resizeShell]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        padding: "4px 0 0 4px",
        boxSizing: "border-box",
        backgroundColor: "#0d1117",
      }}
    />
  );
}
