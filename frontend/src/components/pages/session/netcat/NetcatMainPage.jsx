import Loader from "@/components/common/loader/Loader";
import { getNetcatSessionData } from "@/services/copilot.service";
import { Form, Input, Row } from "antd";
import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import styles from "@/app/page.module.scss";
import PrimaryButton from "@/components/common/PrimaryButton";
import { useSelector } from "react-redux";

const NetcatMainPage = ({ netcat_id, port }) => {
  const [runningPort, setRunningPort] = useState(null);
  const [terminalSocket, setTerminalSocket] = useState(null);
  const { sockets: terminalSockets } = useSelector((state) => state.socket);

  const { isLoading } = useQuery(["get-netcat-session", netcat_id], () =>
    getNetcatSessionData({ netcat_id })
  );

  useEffect(() => {
    if (terminalSockets && terminalSockets.length > 0) {
      const currentSessionSocket = terminalSockets.find(
        (socket) => socket.id === `${netcat_id}` && socket.type === "netcat"
      );

      if (currentSessionSocket) {
        setTerminalSocket(currentSessionSocket.socket);
      }
    }
  }, [netcat_id, terminalSockets]);

  const onFormSubmit = async (values) => {
    const netcatCommand = `nc -lnvp ${values.netcat_port}\n`;
    setRunningPort(values.netcat_port);
    terminalSocket.emit("terminal-input", netcatCommand);
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <>
      {!runningPort ? (
        <>
          <Row
            justify="center"
            style={{ flexDirection: "column" }}
            className={styles.netcatInfo}
          >
            <p className={styles.title}>Start a netcat session</p>
            <p className={styles.desc}>
              Establish seamless low-level communication between computers and
              networks.
            </p>
          </Row>

          <Form
            layout="vertical"
            className={styles.netcatForm}
            onFinish={onFormSubmit}
            initialValues={{
              netcat_port: port,
            }}
          >
            <Form.Item
              className={styles.netcatFormItem}
              name="netcat_port"
              label="Enter the port number"
              rules={[
                {
                  required: true,
                  message: "Please provide a port number",
                },
              ]}
            >
              <Input placeholder="Enter port number" />
            </Form.Item>

            <PrimaryButton
              htmlType="submit"
              style={{
                background: "linear-gradient(135deg, #00f2fe, #00d2ff)",
                border: "1px solid #00f2fe",
                color: "#000000",
                fontWeight: 600,
                boxShadow: "0 0 10px rgba(0, 242, 254, 0.3)",
              }}
            >
              Start Netcat
            </PrimaryButton>
          </Form>
        </>
      ) : (
        <div></div>
      )}
    </>
  );
};

export default NetcatMainPage;
