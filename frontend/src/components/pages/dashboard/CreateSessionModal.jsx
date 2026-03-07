import ModalComponent from "@/components/common/ModalComponent";
import PrimaryButton from "@/components/common/PrimaryButton";
import { Form, Input, message, Row } from "antd";
import styles from "@/styles/pages/Dashboard.module.scss";
import { useRouter } from "next/navigation";
import { useMutation } from "react-query";
import { createNewSession } from "@/services/copilot.service";

const CreateSessionModal = ({ show, setShow, close }) => {
  const router = useRouter();
  const [form] = Form.useForm();

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
