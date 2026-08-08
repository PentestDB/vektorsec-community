"use client";

import React, { useCallback, useState } from "react";
import styles from "@/styles/pages/Settings.module.scss";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Popconfirm,
  QRCode,
  Space,
} from "antd";
import { useSelector, useDispatch } from "react-redux";
import { debounce } from "lodash";
import { updateUserProfile } from "@/services/user.service";
import { setup2FA, verify2FA, disable2FA } from "@/services/auth.service";
import { useMutation, useQueryClient } from "react-query";
import { update } from "@/store/user.slice";

const MyAccount = () => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    user?.twoFactorEnabled || false
  );
  const [setupData, setSetupData] = useState(null); // { secret, otpAuthUri }
  const [code, setCode] = useState("");

  const updateUserProfileMutation = useMutation(updateUserProfile, {
    onSuccess: async () => {
      message.success("Profile updated");
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Failed to update profile");
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

  const setupMutation = useMutation(setup2FA, {
    onSuccess: (data) => setSetupData(data),
    onError: (err) =>
      message.error(
        err?.response?.data?.message ?? "Failed to start 2FA setup"
      ),
  });

  const verifyMutation = useMutation(verify2FA, {
    onSuccess: async () => {
      message.success("Two-factor authentication enabled");
      setTwoFactorEnabled(true);
      setSetupData(null);
      setCode("");
      dispatch(update({ twoFactorEnabled: true }));
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) =>
      message.error(
        err?.response?.data?.message ?? "Invalid code, please try again"
      ),
  });

  const disableMutation = useMutation(disable2FA, {
    onSuccess: async () => {
      message.success("Two-factor authentication disabled");
      setTwoFactorEnabled(false);
      dispatch(update({ twoFactorEnabled: false }));
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) =>
      message.error(
        err?.response?.data?.message ?? "Failed to disable two-factor"
      ),
  });

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

      <div className={styles.fieldGroup} style={{ marginTop: 28 }}>
        <label className={styles.fieldLabel}>
          Two-Factor Authentication
        </label>
        <div className={styles.fieldValue} style={{ marginTop: 4 }}>
          Add an extra layer of security to your account using Google
          Authenticator, Authy, or any other TOTP-compatible app.
        </div>

        <div style={{ marginTop: 16 }}>
          {twoFactorEnabled ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Alert
                type="success"
                showIcon
                message="Two-factor authentication is enabled"
                description="You will be asked for a 6-digit code every time you sign in."
              />
              <Popconfirm
                title="Disable two-factor authentication?"
                description="Your account will lose this extra layer of security."
                okText="Yes, disable"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
                onConfirm={() => disableMutation.mutate()}
              >
                <Button danger loading={disableMutation.isLoading}>
                  Disable 2FA
                </Button>
              </Popconfirm>
            </Space>
          ) : setupData ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Alert
                type="info"
                showIcon
                message="Scan the QR code with your authenticator app"
                description="Then enter the 6-digit code below to activate two-factor authentication."
              />
              <QRCode value={setupData.otpAuthUri} size={180} />
              <div>
                <div style={{ fontSize: 13, color: "#8c8c8c", marginBottom: 4 }}>
                  Or enter this secret manually:
                </div>
                <Input.TextArea
                  value={setupData.secret}
                  readOnly
                  rows={2}
                  autoSize={{ minRows: 2, maxRows: 3 }}
                />
              </div>
              <Space.Compact block>
                <Input
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  inputMode="numeric"
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                  }
                />
                <Button
                  type="primary"
                  loading={verifyMutation.isLoading}
                  disabled={code.length !== 6}
                  onClick={() => verifyMutation.mutate({ code })}
                >
                  Verify &amp; Enable
                </Button>
              </Space.Compact>
            </Space>
          ) : (
            <Button
              type="primary"
              loading={setupMutation.isLoading}
              onClick={() => setupMutation.mutate()}
            >
              Enable 2FA
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyAccount;
