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
import { useTranslation } from "@/i18n/I18nProvider";

const MyAccount = () => {
  const { t } = useTranslation();
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
      message.success(t("myAccount.profileUpdated"));
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message ?? t("myAccount.profileUpdateFailed"),
      );
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
      message.error(err?.response?.data?.message ?? t("myAccount.setupFailed")),
  });

  const verifyMutation = useMutation(verify2FA, {
    onSuccess: async () => {
      message.success(t("myAccount.enabled"));
      setTwoFactorEnabled(true);
      setSetupData(null);
      setCode("");
      dispatch(update({ twoFactorEnabled: true }));
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) =>
      message.error(err?.response?.data?.message ?? t("myAccount.invalidCode")),
  });

  const disableMutation = useMutation(disable2FA, {
    onSuccess: async () => {
      message.success(t("myAccount.disabled"));
      setTwoFactorEnabled(false);
      dispatch(update({ twoFactorEnabled: false }));
      await queryClient.invalidateQueries("check-session");
    },
    onError: (err) =>
      message.error(
        err?.response?.data?.message ?? t("myAccount.disableFailed"),
      ),
  });

  return (
    <div className={styles.settingsContainer}>
      <Form
        initialValues={{ name: user.name }}
        onValuesChange={handleUpdateName}
        layout="vertical"
      >
        <Form.Item
          label={t("myAccount.name")}
          name="name"
          rules={[
            { required: true, message: t("myAccount.nameRequired") },
            { min: 3, message: t("myAccount.nameMin") },
            { max: 30, message: t("myAccount.nameMax") },
          ]}
        >
          <Input />
        </Form.Item>
      </Form>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>{t("myAccount.email")}</label>
        <div className={styles.fieldValue}>{user.email}</div>
      </div>

      <div className={styles.fieldGroup} style={{ marginTop: 28 }}>
        <label className={styles.fieldLabel}>{t("myAccount.twoFactor")}</label>
        <div className={styles.fieldValue} style={{ marginTop: 4 }}>
          {t("myAccount.twoFactorDescription")}
        </div>

        <div style={{ marginTop: 16 }}>
          {twoFactorEnabled ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Alert
                type="success"
                showIcon
                message={t("myAccount.enabledTitle")}
                description={t("myAccount.enabledDescription")}
              />
              <Popconfirm
                title={t("myAccount.disableTitle")}
                description={t("myAccount.disableDescription")}
                okText={t("myAccount.disableOk")}
                okButtonProps={{ danger: true }}
                cancelText={t("common.cancel")}
                onConfirm={() => disableMutation.mutate()}
              >
                <Button danger loading={disableMutation.isLoading}>
                  {t("myAccount.disableButton")}
                </Button>
              </Popconfirm>
            </Space>
          ) : setupData ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Alert
                type="info"
                showIcon
                message={t("myAccount.scanTitle")}
                description={t("myAccount.scanDescription")}
              />
              <QRCode value={setupData.otpAuthUri} size={180} />
              <div>
                <div style={{ fontSize: 13, color: "#8c8c8c", marginBottom: 4 }}>
                  {t("myAccount.manualSecret")}
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
                  {t("myAccount.verifyEnable")}
                </Button>
              </Space.Compact>
            </Space>
          ) : (
            <Button
              type="primary"
              loading={setupMutation.isLoading}
              onClick={() => setupMutation.mutate()}
            >
              {t("myAccount.enableButton")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyAccount;
