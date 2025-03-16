import { InfoMessage } from "@/components/common/messages/Messages";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { Divider, message, Row, Spin, Table } from "antd";
import styles from "@/styles/pages/Dashboard.module.scss";
import PrimaryButton from "@/components/common/PrimaryButton";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SubprocessTableComponent = ({
  data,
  allSubprocessesCompleted,
  loading,
}) => {
  const router = useRouter();

  const columns = [
    {
      title: "Sub Workspace ID",
      dataIndex: "id",
      key: "id",
      render: (subprocess_id) => (
        <Link className={styles.Link} href={`/session/${subprocess_id}`}>
          {subprocess_id}
        </Link>
      ),
    },
    {
      title: "Plugin Running",
      dataIndex: "command",
      key: "command",
      render: (command) => (
        <Row style={{ gap: 10 }} align="middle">
          <div
            style={{
              maxWidth: 400,
            }}
          >
            {command?.plugin_name}
          </div>
          {/* <CopyOutlined
            onClick={() => {
              navigator.clipboard.writeText(command?.plugin_name);
              message.success("Copied to clipboard!");
            }}
          /> */}
        </Row>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status) => (
        <Row style={{ gap: 10 }} align="middle">
          {status === "running" ? <Spin size={"small"} /> : <CheckOutlined />}
          <div
            style={{
              textTransform: "capitalize",
            }}
          >
            {status}
          </div>
        </Row>
      ),
    },
  ];

  const renderContinue = () => {
    if (!data) return;
    // check if all the status are finished
    let all_finished = true;
    data.forEach((subprocess) => {
      if (subprocess.status !== "completed") {
        all_finished = false;
      }
    });

    if (all_finished) {
      return (
        <>
          <Divider />
          <PrimaryButton
            purple
            onClick={allSubprocessesCompleted}
            loading={loading}
          >
            Continue
          </PrimaryButton>
        </>
      );
    }
  };

  return (
    <div>
      <InfoMessage>Running Subprocesses</InfoMessage>
      <div className={styles.subprocessTable}>
        <Table
          columns={columns}
          dataSource={data}
          pagination={false}
          onRow={(record, rowIndex) => {
            return {
              onClick: (event) => {
                router.push(`/session/${record.id}`);
              },
            };
          }}
        />
      </div>
      {renderContinue()}
    </div>
  );
};

export default SubprocessTableComponent;
