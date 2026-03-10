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
        background: "#111111",
        foreground: "#f3f3f3",
        cursor: "#8e35ff",
        selectionBackground: "rgba(142, 53, 255, 0.3)",
        black: "#111111",
        red: "#ff3e3e",
        green: "#10ca00",
        yellow: "#f5d600",
        blue: "#8e35ff",
        magenta: "#c10aad",
        cyan: "#39c5cf",
        white: "#f3f3f3",
        brightBlack: "#6d6d6d",
        brightRed: "#ff6b6b",
        brightGreen: "#9fef00",
        brightYellow: "#f5d600",
        brightBlue: "#a85cff",
        brightMagenta: "#d84cc0",
        brightCyan: "#56d4dd",
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

    requestAnimationFrame(() => {
      if (disposedRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        // container not visible yet
      }
    });

    terminal.onData((data) => {
      sendShellInput(shellId, data);
    });

    subscribeShell(shellId, { fullBuffer: true });

    const cleanup = onShellOutput(shellId, (data) => {
      if (!disposedRef.current) terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (disposedRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposedRef.current = true;
      cleanup?.();
      unsubscribeShell(shellId);
      resizeObserver.disconnect();
      try { webglAddon?.dispose(); } catch { /* already disposed */ }
      try { terminal.dispose(); } catch { /* already disposed */ }
    };
  }, [shellId, subscribeShell, unsubscribeShell, sendShellInput, onShellOutput]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        padding: "4px 0 0 4px",
        boxSizing: "border-box",
        backgroundColor: "#111111",
      }}
    />
  );
}
