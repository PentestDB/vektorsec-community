import { LoadingOutlined } from "@ant-design/icons";
import { Row, Spin, message } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import styles from "@/styles/components/CLIcomponent.module.scss";
import { useDispatch, useSelector } from "react-redux";
import { useSocketContext } from "@/context/SocketContext";
import { closeSession } from "@/store/user.slice";
import { updateActiveTerminal } from "@/store/socket.slice";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URI;

const TerminalSession = ({
  session,
  show,
  active_terminal,
  // readyToConnect,
}) => {
  const terminalRef = useRef(null);
  const [socket, setCurrentSocket] = useState(null);
  const dispatch = useDispatch();
  const { sockets, terminal_height } = useSelector((state) => state.socket);
  const [terminal, setTerminal] = useState(null);
  const [disconnected, setDisconnected] = useState(false);
  const [forceReconnect, setForceReconnect] = useState(0); // NEW
  const [terminalHasOutput, setTerminalHasOutput] = useState(false); // NEW

  const [terminalLoading, setTerminalLoading] = useState(true);
  const [sshError, setSSHError] = useState(null);
  const autoRanRef = useRef(false);

  const { readyToConnect, status } = useSelector((state) => state.user);
  const { setSocket, removeSocket } = useSocketContext();

  useEffect(() => {
    autoRanRef.current = false;
  }, [session.id, session.commandToRun, session.commandId]);

  useEffect(() => {
    if (readyToConnect && status === "running") {
      // Clean up any previous terminal/socket
      if (terminal) {
        terminal.dispose();
        setTerminal(null);
      }
      if (socket) {
        socket.disconnect();
        setCurrentSocket(null);
      }

      // Initialize new socket and terminal
      const newSocket = io(BACKEND_URL, {
        transports: ["polling", "websocket"],
        withCredentials: true,
        query: {
          terminalId: session.id, // to identify the terminal
        },
      });

      // Store the socket in context
      setSocket(session.id, newSocket);

      setCurrentSocket(newSocket);

      const fitAddon = new FitAddon();
      const newTerminal = new Terminal({
        scrollback: 10000,
        fontSize: 13,
        cols: 100,
      });

      newTerminal.loadAddon(fitAddon);
      setTerminal(newTerminal);
      setTerminalHasOutput(false); // reset output state

      newSocket.on(`ssh-ready-${session.id}`, () => {
        newSocket.emit(
          `terminal-input-${session.id}`,
          "echo 'Connected to terminal...'\n"
        );
        setTerminalLoading(false);
        setDisconnected(false);
        setSSHError(null);
      });

      newSocket.on(`ssh-error-${session.id}`, (data) => {
        setTerminalLoading(false);
        setSSHError(
          data.message ||
            "SSH connection failed"
        );
      });

      newSocket.on(`disconnect`, (data) => {
        newTerminal.dispose();
        setTerminal(null);
        message.info("Terminal session disconnected due to page navigation/refresh/connection lost");
        newSocket.disconnect();
        setDisconnected(true);
      });

      // Track if any data is received
      newSocket.on(`terminal-data-${session.id}`, (data) => {
        setTerminalHasOutput(true);
      });

      return () => {
        removeSocket(session.id);
        newTerminal.dispose();
        newSocket.disconnect();
      };
    } else {
      if (terminal) {
        terminal.dispose();
        setTerminal(null);
      }
      if (socket) {
        socket.disconnect();
        setCurrentSocket(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToConnect, status, session.id, forceReconnect]); // add forceReconnect

  useEffect(() => {
    if (disconnected && readyToConnect && status === "running") {
      setDisconnected(false);
    }
  }, [disconnected, readyToConnect, status, session.id]);

  // Handler for manual reconnect
  const handleReconnect = () => {
    setForceReconnect((prev) => prev + 1);
    setTerminalHasOutput(false);
    setDisconnected(false);
    setTerminalLoading(true);
    setSSHError(null);
  };

  console.log("Terminal", terminalLoading, readyToConnect);

  useEffect(() => {
    if (!socket || !terminal || terminalLoading || !readyToConnect) {
      return;
    }

    const terminalId = session.id;
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();
    terminal.focus();

    console.log("Terminal connected", socket);

    socket.on("connect", () => {});

    socket.on(`terminal-data-${terminalId}`, (data) => {
      terminal.write(data);
      terminal.refresh(0, terminal.rows - 1);
    });

    terminal.onData((data) => {
      socket.emit(`terminal-input-${terminalId}`, data);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket, terminal, terminalLoading, readyToConnect, session.id]);

  useEffect(() => {
    if (terminal && terminal_height) {
      terminalRef.current.style.height = `${terminal_height - 60}px`;
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      fitAddon.fit();
      terminal.refresh(0, terminal.rows - 1);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal_height, active_terminal]);

  useEffect(() => {
    // No longer syncing socket from Redux; socket is managed locally
  }, []);

  useEffect(() => {
    if (terminal && terminalRef.current) {
      terminal.focus();
    }
  }, [terminal]);

  useEffect(() => {
    if (
      !session.temporary ||
      !socket ||
      !terminal ||
      terminalLoading ||
      !readyToConnect ||
      autoRanRef.current ||
      !session.commandToRun ||
      !session.commandId
    ) {
      return;
    }

    autoRanRef.current = true;
    terminal.write(`\r\n$ ${session.commandToRun}\r\n\r\n`);
    socket.emit(`exec_command-${session.id}`, {
      command: session.commandToRun,
      commandId: session.commandId,
    });
  }, [
    session.commandId,
    session.commandToRun,
    session.id,
    session.temporary,
    socket,
    terminal,
    terminalLoading,
    readyToConnect,
  ]);

  useEffect(() => {
    if (!socket || !session.temporary) {
      return;
    }

    const handleTempCommandComplete = () => {
      setTimeout(() => {
        removeSocket(session.id);
        dispatch(closeSession(session.id));
        dispatch(updateActiveTerminal(session.sourceSessionId ?? null));
      }, 1200);
    };

    socket.on(`command_executed-${session.id}`, handleTempCommandComplete);

    return () => {
      socket.off(`command_executed-${session.id}`, handleTempCommandComplete);
    };
  }, [dispatch, removeSocket, session.id, session.sourceSessionId, session.temporary, socket]);

  return (
    <>
      {sshError && (
        <div className={styles.sshErrorContainer}>
          <div className={styles.sshErrorMessage}>
            SSH Connection Error: {sshError}
          </div>
          <button className={styles.sshReconnectBtn} onClick={handleReconnect}>
            Reconnect
          </button>
        </div>
      )}
      {!sshError && (terminalLoading || !readyToConnect) && (
        <Row
          align="middle"
          justify="center"
          style={{ gap: 10 }}
          className={styles.loadBox}
        >
          <Spin indicator={<LoadingOutlined className={styles.loadIcon} />} />{" "}
          Establishing secure connection with your exploit box...
        </Row>
      )}
      {!sshError &&
      ((!terminalHasOutput && !terminalLoading && readyToConnect) || disconnected) ? (
        <Row align="middle" justify="center" style={{ margin: '10px 0' }}>
          <button className={styles.sshReconnectBtn} onClick={handleReconnect}>
            Reconnect Shell
          </button>
        </Row>
      ) : null}
      <div
        ref={terminalRef}
        className="copilotTerminalContainer"
        tabIndex={0}
        style={{ display: sshError || !terminal ? "none" : undefined }}
      />
    </>
  );
};

export default TerminalSession;
