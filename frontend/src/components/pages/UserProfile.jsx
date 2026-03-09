import { App, Avatar, Form, Input, Row } from "antd";
import styles from "@/styles/pages/Billings.module.scss";
import PrimaryButton from "../common/PrimaryButton";
import { useSelector } from "react-redux";
import { useMutation, useQueryClient } from "react-query";
import { updateUserProfile } from "@/services/user.service";

const UserProfile = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();

  const updateProfileMutation = useMutation(updateUserProfile, {
    onSuccess: (data) => {
      queryClient.invalidateQueries(["check-session"]);
      message.success(data?.message ?? "User profile updated successfully!");
    },
    onError: (error) => {
      console.log(error);
      message.error(
        error?.response?.data?.message ?? "Failed to update user profile!"
      );
    },
  });

  const submitForm = (values) => {
    updateProfileMutation.mutate(values);
  };

  return (
    <div className={`${styles.billingsContainer} ${styles.profileContainer}`}>
      <div className={styles.header}>
        <h1>Profile</h1>
        <p>Manage your personal information</p>
      </div>
      <Row className={styles.profileCardWrapper}>
        <Avatar
          src={user.profilePicture}
          size={128}
          className={styles.profileImage}
        />
        <div className={styles.profileDetails}>
          <Form form={form} layout="vertical" onFinish={submitForm}>
            <Form.Item
              label="Name"
              name="name"
              initialValue={user?.name ?? ""}
              rules={[
                {
                  required: true,
                  message: "Please enter your name",
                },
              ]}
            >
              <Input placeholder="Your Name" />
            </Form.Item>

            <PrimaryButton
              green
              htmlType="submit"
              style={{ marginTop: "2.5rem" }}
              loading={updateProfileMutation.isLoading}
            >
              Save
            </PrimaryButton>
          </Form>
        </div>
      </Row>
    </div>
  );
};

export default UserProfile;
