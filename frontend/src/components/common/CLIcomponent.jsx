import { ResizableBox } from "react-resizable";
import styles from "@/styles/components/CLIcomponent.module.scss";
import Image from "next/image";
import cliSVG from "@/assets/cli.svg";
import { Terminal } from "xterm";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";

let terminal;

const CLIcomponent = ({ show, title, socket, terminalHeight }) => {
  const terminalRef = useRef(null);

  useEffect(() => {
    if (show) {
      terminal = new Terminal({
        fontSize: 13,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalRef.current);
      fitAddon.fit();

      socket.on("connect", () => { });

      socket.on("terminal-data", (data) => {
        terminal.write(data);
      });

      terminal.onData((data) => {
        socket.emit("terminal-input", data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <div className={styles.fixedOverlay}>
      <div className={styles.CLIHeader}>
        <div className={show ? styles.CLIWrapper : styles.CLIWrapperHide}>
          <ResizableBox
            className={styles.CLIcontainer}
            height={terminalHeight ? terminalHeight : 40}
            resizeHandles={["n"]}
            handle={
              <div className={styles.resizeHandle}>
                <Image src={cliSVG} width={20} height={20} alt="" />
                {title ? title : "Command Line Interface"}
                <div className={styles.dragIcon} />
              </div>
            }
          >
            <div ref={terminalRef} />
          </ResizableBox>
        </div>
      </div>
    </div>
  );
};

export default CLIcomponent;
