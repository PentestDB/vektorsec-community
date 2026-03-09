"use client";

import React, { useCallback } from "react";
import styles from "@/styles/pages/Settings.module.scss";
import { Input, Form, App } from "antd";
import { useSelector } from "react-redux";
import { debounce } from "lodash";
import { updateUserProfile } from "@/services/user.service";
import { useMutation, useQueryClient } from "react-query";

const MyAccount = () => {
  const queryClient = useQueryClient();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();

  const updateUserProfileMutation = useMutation(updateUserProfile, {
    onSuccess: async () => {
      await queryClient.invalidateQueries("check-session");
    },
  });

  const updateUserProfileName = async (data) => {
    const { name } = data;
    if (name.length < 3 || name.length > 30) return;
    await updateUserProfileMutation.mutateAsync({ name });
  };

  const handleUpdateName = useCallback(
    debounce(updateUserProfileName, 500),
    []
  );

  return (
    <div className={styles.settingsContainer}>
      <Form onValuesChange={handleUpdateName} layout="vertical">
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: "Please enter your name" },
            { min: 3, message: "Name must be minimum 3 characters." },
            { max: 30, message: "Name must be maximum 30 characters." },
          ]}
        >
          <Input defaultValue={user.name} />
        </Form.Item>
      </Form>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Email</label>
        <div className={styles.fieldValue}>{user.email}</div>
      </div>
    </div>
  );
};

export default MyAccount;
