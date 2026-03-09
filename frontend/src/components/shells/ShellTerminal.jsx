"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export default function ShellTerminal({
  shellId,
  subscribeShell,
  unsubscribeShell,
  sendShellInput,
  onShellOutput,
}) {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const fitAddonRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
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

    try {
      fitAddon.fit();
    } catch {
      // container not visible yet
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      sendShellInput(shellId, data);
    });

    subscribeShell(shellId);

    const cleanup = onShellOutput(shellId, (data) => {
      terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      mountedRef.current = false;
      cleanup?.();
      unsubscribeShell(shellId);
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [shellId, subscribeShell, unsubscribeShell, sendShellInput, onShellOutput]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111111",
      }}
    />
  );
}
