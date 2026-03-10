"use client";

import { Modal, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import styles from "@/styles/components/SSHTestModal.module.scss";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URI;
const TERMINAL_ID = "ssh-test-connectivity";

const SSHTestTerminalModal = ({ open, onClose }) => {
  const terminalRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [terminal, setTerminal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sshError, setSSHError] = useState(null);

  useEffect(() => {
    if (!open) return;

    const newSocket = io(BACKEND_URL, {
      transports: ["polling", "websocket"],
      withCredentials: true,
      query: { terminalId: TERMINAL_ID },
    });

    setSocket(newSocket);
    setLoading(true);
    setSSHError(null);

    const fitAddon = new FitAddon();
    const newTerminal = new Terminal({
      scrollback: 5000,
      fontSize: 12,
      cols: 80,
      rows: 20,
    });

    newTerminal.loadAddon(fitAddon);
    setTerminal(newTerminal);

    newSocket.on(`ssh-ready-${TERMINAL_ID}`, () => {
      newSocket.emit(
        `terminal-input-${TERMINAL_ID}`,
        "echo 'SSH connection successful. You can run commands to verify.'\n"
      );
      setLoading(false);
      setSSHError(null);
    });

    newSocket.on(`ssh-error-${TERMINAL_ID}`, (data) => {
      setLoading(false);
      setSSHError(data?.message || "SSH connection failed");
    });

    return () => {
      newSocket.disconnect();
      newTerminal.dispose();
      setSocket(null);
      setTerminal(null);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !socket || !terminal || loading) return;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    if (terminalRef.current) {
      terminal.open(terminalRef.current);
      fitAddon.fit();
      terminal.focus();
    }

    socket.on(`terminal-data-${TERMINAL_ID}`, (data) => {
      terminal.write(data);
      terminal.refresh(0, terminal.rows - 1);
    });

    terminal.onData((data) => {
      socket.emit(`terminal-input-${TERMINAL_ID}`, data);
    });

    return () => {
      socket.off(`terminal-data-${TERMINAL_ID}`);
    };
  }, [open, socket, terminal, loading]);

  const handleClose = () => {
    if (socket) {
      socket.disconnect();
    }
    if (terminal) {
      terminal.dispose();
    }
    setSocket(null);
    setTerminal(null);
    onClose();
  };

  return (
    <Modal
      title="Test SSH Connectivity"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={740}
      destroyOnClose
      className={styles.modal}
      styles={{
        body: { padding: 0, minHeight: 360 },
      }}
    >
      <div className={styles.terminalWrapper}>
        {sshError && (
          <div className={styles.errorState}>
            <div className={styles.errorMessage}>
              SSH Connection Error: {sshError}
            </div>
            <p className={styles.errorHint}>
              Ensure SSH is configured and the exploit box is reachable.
            </p>
          </div>
        )}
        {!sshError && loading && (
          <div className={styles.loadingState}>
            <Spin indicator={<LoadingOutlined style={{ color: "var(--lime-green)", fontSize: 18 }} />} />
            Connecting to exploit box...
          </div>
        )}
        {!sshError && !loading && (
          <div
            ref={terminalRef}
            className={styles.terminalInner}
          />
        )}
      </div>
    </Modal>
  );
};

export default SSHTestTerminalModal;
