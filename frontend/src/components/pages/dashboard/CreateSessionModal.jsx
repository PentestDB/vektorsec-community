import ModalComponent from "@/components/common/ModalComponent";
import PrimaryButton from "@/components/common/PrimaryButton";
import { Form, Input, message, Radio, Row, Tooltip } from "antd";
import styles from "@/styles/pages/Dashboard.module.scss";
import { useRouter } from "next/navigation";
import { useMutation } from "react-query";
import { createNewSession } from "@/services/copilot.service";
import { FileSearchOutlined, ToolOutlined } from "@ant-design/icons";

const CreateSessionModal = ({ show, setShow, close }) => {
  const router = useRouter();
  const [form] = Form.useForm();

  const engagementType = Form.useWatch("engagementType", form);

  const createSessionMutation = useMutation(createNewSession, {
    onSuccess: (data) => {
      message.success(data?.message ?? "Workspace created successfully!");
      router.push(`/session/${data.session_id}`);
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to create workspace!"
      );
    },
  });

  const handleCreateSession = async (values) => {
    await createSessionMutation.mutateAsync(values);
  };

  return (
    <ModalComponent
      show={show}
      setShow={setShow}
      heading="Create new workspace"
      subheading="Navigate the path to security excellence with Pentest Copilot"
      onCancel={close}
      footer={false}
      destroyOnClose
      width={"80%"}
    >
      <div className={styles.createSession}>
        <Form form={form} layout="vertical" onFinish={handleCreateSession}>
          <Form.Item
            name={"name"}
            label={"Workspace name"}
            rules={[
              {
                required: true,
                message: "Workspace name is required",
              },
            ]}
          >
            <Input placeholder="Example : My TryHackMe box" />
          </Form.Item>
          <Form.Item name={"description"} label={"Workspace description"}>
            <Input.TextArea
              placeholder="Example : Completing CTF on TryHackMe"
              rows={4}
            />
          </Form.Item>

          <Form.Item
            name="engagementType"
            label="Engagement type"
            rules={[
              {
                required: true,
                message: "Engagement type is required",
              },
            ]}
          >
            <Radio.Group className={styles.cutomRadio}>
              <Tooltip
                color="#000"
                title="Generic Q/A is an engagment that is not based on a specific target but a general question and answer session."
                placement="bottomLeft"
              >
                <Radio value="generic">
                  <div
                    className={
                      engagementType === "generic"
                        ? styles.engagementBoxActive
                        : styles.engagementBox
                    }
                  >
                    <FileSearchOutlined /> <p>Generic Q/A</p>
                  </div>
                </Radio>
              </Tooltip>
              <Tooltip
                color="#000"
                title="Formal Pentest is an engagment that is based on a specific target starting from recon to exploitation."
                placement="bottomLeft"
              >
                <Radio value="formal">
                  <div
                    className={
                      engagementType === "formal"
                        ? styles.engagementBoxActive
                        : styles.engagementBox
                    }
                  >
                    <ToolOutlined />
                    <p>Formal Pentest</p>
                  </div>
                </Radio>
              </Tooltip>
            </Radio.Group>
          </Form.Item>

          <Row justify={"end"}>
            <PrimaryButton
              purple
              htmlType="submit"
              loading={createSessionMutation.isLoading}
            >
              Create Workspace
            </PrimaryButton>
          </Row>
        </Form>
      </div>
    </ModalComponent>
  );
};

export default CreateSessionModal;
