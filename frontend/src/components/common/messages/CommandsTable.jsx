import { Table } from "antd";
import styles from "@/styles/components/Messages.module.scss";

const CommandsTable = ({ data }) => {
  const isMsfvenomPayloadPresent = data.some(
    (item) => item.tool_name === "msfvenom_payload"
  );

  const isGenericResponse = data.some(
    (item) => item.tool_name === "generic_response"
  );

  const isNetcatListener = data.some(
    (item) => item.tool_name === "netcat_listener"
  );

  const defaultColumns = [
    {
      title: "Tool",
      dataIndex: "tool_name",
      key: "tool_name",
    },
    {
      title: "Command",
      dataIndex: "args",
      key: "args",
      render: (args) => {
        if (args.command) {
          return args.command;
        } else if (args.query) {
          return args.query;
        } else if (args.response) {
          return args.response;
        } else {
          return JSON.stringify(args);
        }
      },
    },
  ];

  const genericColumns = [
    {
      title: "Tool",
      dataIndex: "tool_name",
      key: "tool_name",
    },
    {
      title: "Thoughts",
      dataIndex: "args",
      key: "args",
      render: (args) => {
        if (args.command) {
          return args.command;
        } else if (args.query) {
          return args.query;
        } else if (args.response) {
          return args.response;
        } else {
          return JSON.stringify(args);
        }
      },
    },
  ];

  const ncColumns = [
    {
      title: "Tool",
      dataIndex: "tool_name",
      key: "tool_name",
    },
    {
      title: "Listener Port Number",
      dataIndex: "args",
      key: "args",
      render: (args) => {
        return args.lport;
      },
    },
  ];

  const msfvenomColumns = [
    {
      title: "Tool",
      dataIndex: "tool_name",
      key: "tool_name",
    },
    {
      title: "LHOST",
      dataIndex: ["args", "lhost"],
      key: "lhost",
    },
    {
      title: "LPORT",
      dataIndex: ["args", "lport"],
      key: "lport",
    },
    {
      title: "Payload",
      dataIndex: ["args", "payload"],
      key: "payload",
    },
    {
      title: "File Format",
      dataIndex: ["args", "file_format"],
      key: "file_format",
    },
    {
      title: "File Name",
      dataIndex: ["args", "file_name"],
      key: "file_name",
    },
  ];

  return (
    <div style={{ margin: "1.5rem 0 2rem" }}>
      <Table
        className={styles.commandTableContainer}
        columns={
          isMsfvenomPayloadPresent && data.length === 1
            ? msfvenomColumns
            : isGenericResponse && data.length === 1
            ? genericColumns
            : isNetcatListener && data.length === 1
            ? ncColumns
            : defaultColumns
        }
        dataSource={data}
        pagination={false}
      />
    </div>
  );
};

export default CommandsTable;
