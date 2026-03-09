"use client";

import React, { useCallback } from "react";
import styles from "@/styles/pages/Settings.module.scss";
import {
  Col,
  Divider,
  Input,
  Row,
  Upload,
  Form,
  App,
} from "antd";
import { useSelector } from "react-redux";
import { MdOutlineEmail, MdOutlineModeEditOutline } from "react-icons/md";
import { debounce } from "lodash";
import {
  updateUserProfile,
  uploadUserProfileImage,
} from "@/services/user.service";
import { useMutation, useQueryClient } from "react-query";

const MyAccount = () => {
  const queryClient = useQueryClient();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();

  const updateUserProfileMutation = useMutation(updateUserProfile, {
    onSuccess: async (data) => {
      await queryClient.invalidateQueries("check-session");
    },
  });

  const uploadProfileImageMutation = useMutation(uploadUserProfileImage, {
    onSuccess: async (data) => {
      message.success(data?.message ?? "User profile updated successfully!");
      await queryClient.invalidateQueries(["check-session"]);
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to update user profile image!"
      );
    },
  });

  const updateUserProfileName = async (data) => {
    const { name } = data;

    if (name.length < 3 || name.length > 30) {
      return;
    }

    await updateUserProfileMutation.mutateAsync({
      name,
    });
  };

  const handleUpdateName = useCallback(
    debounce(updateUserProfileName, 500),
    []
  );

  const beforeUpload = (file) => {
    const isJpgOrPng = file.type === "image/jpeg" || file.type === "image/png";

    if (!isJpgOrPng) {
      message.error("You can only upload JPG/PNG file!");
    }

    const isLt2M = file.size / 1024 / 1024 < 2;

    if (!isLt2M) {
      message.error("Image must smaller than 2MB!");
    }

    return false;
  };

  const onUpload = async (file) => {
    const formData = new FormData();

    formData.append("file", file.file);

    await uploadProfileImageMutation.mutateAsync(formData);
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.accountContainer}>
        {/* Personal Details */}
        <Row align="middle" className={styles.accountDetailsSection}>
          <div className={styles.accountDetails}>
            <div className={styles.label}>Name</div>
            <Form onValuesChange={handleUpdateName}>
              <Form.Item
                name="name"
                rules={[
                  {
                    required: true,
                    message: "Please enter your name",
                  },
                  {
                    min: 3,
                    message: "Name must be minimum 3 characters.",
                  },
                  {
                    max: 30,
                    message: "Name must be maximum 30 characters.",
                  },
                ]}
              >
                <Input
                  className={styles.accountInput}
                  defaultValue={user.name}
                />
              </Form.Item>
            </Form>
          </div>
        </Row>

        {/* Account Security */}
        <div className={styles.settingSectionHeader}>
          <h3 className={styles.heading}>Account Details</h3>
          <Divider className={styles.divider} />
        </div>
        <div className={styles.accountSecuritySection}>
          <Row
            align="middle"
            justify="space-between"
            className={styles.accountSecurityItem}
          >
            <Col span={18} className={styles.item}>
              <MdOutlineEmail className={styles.icon} />
              <div>
                <div className={styles.label}>Email</div>
                <div className={styles.value}>{user.email}</div>
              </div>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};

export default MyAccount;
