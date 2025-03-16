"use client";

import React, { useCallback, useState } from "react";
import styles from "@/styles/pages/Settings.module.scss";
import {
  Alert,
  Avatar,
  Button,
  Col,
  Divider,
  Input,
  Row,
  Upload,
  message,
  notification,
  Tooltip,
  Form,
} from "antd";
import { useSelector } from "react-redux";
import { MdOutlineEmail, MdOutlineModeEditOutline } from "react-icons/md";
import PrimaryButton from "@/components/common/PrimaryButton";
import { PiIdentificationCardBold } from "react-icons/pi";
import { BiSolidEdit, BiUserCircle } from "react-icons/bi";
import { debounce } from "lodash";
import {
  getUserKycDetails,
  sendBugbaseLinkRequest,
  submitFinalKYC,
  submitUserKYCData,
  syncBugbaseKYCDetails,
  updateUserProfile,
  uploadUserProfileImage,
} from "@/services/user.service";
import { useMutation, useQuery, useQueryClient } from "react-query";
import Loader from "@/components/common/loader/Loader";

const MyAccount = () => {
  const queryClient = useQueryClient();

  const [personalDetailsComplete, setPersonalDetailsComplete] = useState(false);
  const [idVerificationComplete, setIdVerificationComplete] = useState(false);

  const { user } = useSelector((state) => state.user);

  const { data: kycDetails, isLoading } = useQuery(
    "kyc-details",
    getUserKycDetails,
    {
      onSuccess: async (data) => {
        if (data.kyc) {
          if (
            data.kyc.firstName &&
            data.kyc.lastName &&
            data.kyc.phoneNumber &&
            data.kyc.address &&
            data.kyc.dob
          ) {
            setPersonalDetailsComplete(true);
          } else {
            setPersonalDetailsComplete(false);
          }

          if (data.kyc.citizen === "INDIAN") {
            if (
              data.kyc.aadhaarStatus === "completed" &&
              data.kyc.panStatus === "completed"
            ) {
              setIdVerificationComplete(true);
            }
          } else {
            if (data.kyc.passportStatus === "completed") {
              setIdVerificationComplete(true);
            }
          }
        }
      },
    }
  );

  const updateUserProfileMutation = useMutation(updateUserProfile, {
    onSuccess: async (data) => {
      await queryClient.invalidateQueries("check-session");
    },
  });

  const uploadProfileImageMutation = useMutation(uploadUserProfileImage, {
    onSuccess: async (data) => {
      message.success(data?.message ?? "User profile updated successfully!");
      await queryClient.invalidateQueries(["check-session"]);
      await queryClient.invalidateQueries(["kyc-details"]);
      await queryClient.invalidateQueries(["check-session"]);
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to update user profile image!"
      );
    },
  });

  const sendLinkBugbaseRequestMutation = useMutation(sendBugbaseLinkRequest, {
    onSuccess: async (data) => {
      // await queryClient.invalidateQueries("check-session");
      notification.success({
        message: "BugBase Link Request Sent",
        description:
          "An email has been sent to your registered email address. Please check your inbox for further instructions",
      });
    },
    onSuccess: async (data) => {
      // await queryClient.invalidateQueries("check-session");
      notification.success({
        message: "BugBase Link Request Sent",
        description:
          "An email has been sent to your registered email address. Please check your inbox for further instructions",
      });
    },
    onError: async (data) => {
      notification.error({
        message: "Encountered an error",
        description:
          "An error occurred while sending the link request. Please try again later",
      });
    },
  });

  const syncKYCDataMutation = useMutation(syncBugbaseKYCDetails, {
    onSuccess: async (data) => {
      await queryClient.invalidateQueries("kyc-details");
      notification.success({
        message: "KYC Details Synced",
        description:
          "Your KYC details have been synced from your BugBase account",
      });
    },
    onError: async (data) => {
      notification.error({
        message: "KYC Details Not Found",
        description:
          "Looks like you haven't completed your KYC on BugBase yet. Please complete your KYC on BugBase and try again.",
      });
    },
  });

  const updateKYCMutation = useMutation(submitUserKYCData, {
    onSuccess: async () => {
      notification.success({
        message: "Details Updated",
        description: "Your KYC has been updated successfully.",
      });

      await queryClient.invalidateQueries(["kyc-details"]);
    },
    onError: (error) => {
      notification.error({
        message: "Error",
        description: error.response.data.message,
      });
    },
  });

  const submitFinalKYCMutation = useMutation(submitFinalKYC, {
    onSuccess: async () => {
      notification.success({
        message: "KYC Submitted",
        description: "Your KYC has been submitted successfully.",
      });

      await queryClient.invalidateQueries(["kyc-details"]);
    },
    onError: (error) => {
      notification.error({
        message: "Error",
        description: error.response.data.message,
      });
    },
  });

  const handleSubmitFinalKYC = async () => {
    if (!personalDetailsComplete || !idVerificationComplete) {
      notification.error({
        message: "KYC Incomplete",
        description: "Please complete your KYC details before submitting",
      });
      return;
    }

    await submitFinalKYCMutation.mutateAsync();
  };

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

  if (isLoading) {
    return <Loader />;
  }

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
