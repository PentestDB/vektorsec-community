import ModalComponent from "../ModalComponent";
import { Form, Input, Row, Upload, message } from "antd";
import { useMutation, useQueryClient } from "react-query";
import styles from "@/styles/components/Messages.module.scss";
import { uploadAnalysisFile } from "@/services/session.service";
import PrimaryButton from "../PrimaryButton";
import { UploadOutlined } from "@ant-design/icons";

const FileAnalysisModal = ({ show, close, sessionId }) => {
  const queryClient = useQueryClient();

  const uploadAnalyzeFileMutation = useMutation(uploadAnalysisFile, {
    onSuccess: async () => {
      await queryClient.invalidateQueries(["get-session-data", sessionId]);
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        sessionId,
      ]);
      close();
    },
    onError: (error) => {
      message.error(error?.response?.data?.message ?? "Failed to upload file!");
    },
  });

  const uploadProps = {
    beforeUpload: async (file) => {
      // size can not be more than 50MB
      if (file.size > 50 * 1024 * 1024) {
        message.error("File size can not be more than 50MB!");
        return false;
      }
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      // set time out
      setTimeout(() => {
        onSuccess("ok");
      }, 0);
    },
  };

  const submitForm = async (values) => {
    const File = values.file.file.originFileObj;

    const formData = new FormData();
    formData.append("file", File);
    formData.append("session_id", sessionId);
    formData.append("comment", values.comment);

    await uploadAnalyzeFileMutation.mutateAsync(formData);
  };

  return (
    <ModalComponent
      show={show}
      heading="Upload and Analyze File"
      subheading="Upload a file to analyze it using our AI model."
      onCancel={close}
      footer={false}
      destroyOnClose
      maxWidth={600}
      className={styles.messageBoxContainer}
    >
      <div className={styles.divider} />
      <Form className={styles.messageBoxForm} onFinish={submitForm}>
        <Form.Item
          name="file"
          label="Upload your file"
          className={styles.messageBoxFormItem}
          rules={[
            {
              required: true,
              message: "Please upload a file!",
            },
          ]}
        >
          <Upload {...uploadProps} maxCount={1}>
            <PrimaryButton
              icon={<UploadOutlined />}
              className={styles.submitBtn}
            >
              Choose File
            </PrimaryButton>
          </Upload>
        </Form.Item>
        <Form.Item name="comment" label="Comment">
          <Input.TextArea placeholder="Add some context about the file" />
        </Form.Item>

        <Row justify="end">
          <PrimaryButton
            green
            htmlType="submit"
            loading={uploadAnalyzeFileMutation.isLoading}
          >
            Submit
          </PrimaryButton>
        </Row>
      </Form>
    </ModalComponent>
  );
};

export default FileAnalysisModal;
