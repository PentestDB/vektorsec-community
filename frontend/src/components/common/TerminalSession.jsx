import { LoadingOutlined } from "@ant-design/icons";
import { Row, Spin, message } from "antd";
import React, { use, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import styles from "@/styles/components/CLIcomponent.module.scss";
import { useDispatch, useSelector } from "react-redux";
import { setSocket } from "@/store/socket.slice";

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

  const { readyToConnect, status } = useSelector((state) => state.user);

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

      dispatch(
        setSocket({
          id: session.id,
          type: session.type,
          is_main: session.is_main,
        })
      );

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
      });

      newSocket.on(`disconnect`, (data) => {
        newTerminal.dispose();
        setTerminal(null);
        message.info("Terminal session terminated due to inactivity");
        newSocket.disconnect();
        setDisconnected(true);
      });

      // Track if any data is received
      newSocket.on(`terminal-data-${session.id}`, (data) => {
        setTerminalHasOutput(true);
      });

      return () => {
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

  return (
    <>
      {(terminalLoading || !readyToConnect) && (
        <Row
          align="middle"
          justify="center"
          style={{ gap: 10 }}
          className={styles.loadBox}
        >
          <Spin indicator={<LoadingOutlined className={styles.loadIcon} />} />{" "}
          Establising secure connection with your exploit box... (This may take
          around 45-60 seconds)
        </Row>
      )}
      {/* Show Reconnect button if disconnected or no output after loading */}
      {(!terminalHasOutput && !terminalLoading && readyToConnect) || disconnected ? (
        <Row align="middle" justify="center" style={{ margin: '10px 0' }}>
          <button onClick={handleReconnect} style={{ padding: '6px 16px', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Reconnect Shell
          </button>
        </Row>
      ) : null}
      <div ref={terminalRef} className="copilotTerminalContainer" tabIndex={0} />
    </>
  );
};

export default TerminalSession;
