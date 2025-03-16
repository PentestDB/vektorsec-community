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

  const [terminalLoading, setTerminalLoading] = useState(true);

  const { readyToConnect, status } = useSelector((state) => state.user);

  useEffect(() => {
    if (readyToConnect && status === "running") {
      console.log("Connecting to terminal...");
      const newSocket = io(BACKEND_URL, {
        transports: ["polling", "websocket"],
        withCredentials: true,
        query: {
          terminalId: session.id, // to identify the terminal
        },
      });

      console.log("Socket connected");
      dispatch(
        setSocket({
          socket: newSocket,
          id: session.id,
          type: session.type,
          is_main: session.is_main,
        })
      );

      setCurrentSocket(newSocket);

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        scrollback: 10000,
        fontSize: 13,
        cols: 100,
      });

      terminal.loadAddon(fitAddon);

      setTerminal(terminal);

      newSocket.on(`ssh-ready-${session.id}`, () => {
        console.log("SSH Ready");
        newSocket.emit(
          `terminal-input-${session.id}`,
          "echo 'Connected to terminal...'\n"
        );
        setTerminalLoading(false);
      });

      newSocket.on(`disconnect`, (data) => {
        terminal.dispose();
        setTerminal(null);
        message.info("Terminal session terminated due to inactivity");
        newSocket.disconnect();
      });
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

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToConnect, status]);

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
    if (sockets && sockets.length > 0) {
      const currentSessionSocket = sockets.find(
        (socket) => socket.id === session.id && socket.type === session.type
      );
      if (currentSessionSocket) {
        if (currentSessionSocket.socket.connected) {
          setCurrentSocket(currentSessionSocket.socket);
        } else {
          currentSessionSocket.socket.connect();
          setCurrentSocket(currentSessionSocket.socket);
        }
      }
    }
  }, [sockets, session, active_terminal]);

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
      <div ref={terminalRef} className="copilotTerminalContainer" />
    </>
  );
};

export default TerminalSession;
