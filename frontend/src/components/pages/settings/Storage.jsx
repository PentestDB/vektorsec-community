"use client";

import { confirmPopUp } from "@/components/common/ConfirmPopUp";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  createEBSvolume,
  formatVolume,
  getVolumeStatus,
} from "@/services/task.service";
import styles from "@/styles/pages/Settings.module.scss";
import { message, notification, Skeleton } from "antd";
import moment from "moment";
import Image from "next/image";
import { AiOutlineCloudUpload } from "react-icons/ai";
import { useMutation, useQuery, useQueryClient } from "react-query";
import emptyCart from "@/assets/emptyCart.svg";
import { useRouter } from "next/navigation";
import Loader from "@/components/common/loader/Loader";

const UserStorage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: ebsVolume, isLoading } = useQuery(
    ["get-ebs-volume-status"],
    getVolumeStatus
  );

  const activateEBSVolumeMutation = useMutation(createEBSvolume, {
    onSuccess: (data) => {
      queryClient.invalidateQueries("get-ebs-volume-status");
      message.success(
        data?.message ?? "Personal volume activated successfully!"
      );
    },
    onError: (error) => {
      notification.error({
        message: "Error activating volume",
        description: error?.response?.data?.message || "Something went wrong",
      });
    }
  });

  const activateEBSVolume = async () => {
    await activateEBSVolumeMutation.mutateAsync();
  };

  const formatVolumeMutation = useMutation(formatVolume, {
    onSuccess: (data) => {
      queryClient.invalidateQueries("get-ebs-volume-status");
      message.success(
        data?.message ?? "Personal volume formatted successfully!"
      );
    },
    onError: (error) => {
      notification.error({
        message: "Error formatting volume",
        description: error?.response?.data?.message || "Something went wrong",
      });
    }
  });

  const formatEBSVolume = async () => {
    confirmPopUp({
      title: "Format volume?",
      content:
        "This will delete all the data stored in the volume. Are you sure you want to continue?",
      okText: "Yes",
      cancelText: "No",
      onOk: async () => {
        await formatVolumeMutation.mutateAsync();
      },
    });
  };

  return (
    <div className={styles.storageContainer}>
      {isLoading ? (
        <Loader />
      ) : (
        <>
          {ebsVolume?.disabled === true ? (
            <>
              <div className={styles.disableVolumeWrapper}>
                <Image
                  src={emptyCart}
                  alt="upgrade plan"
                  width={400}
                  height={340}
                />
                <p>
                  Upgrade your plan to use Persistent Volume and store your data
                  in a secure and reliable way.
                </p>
                <PrimaryButton
                  purple
                  onClick={() => router.push("/settings/billing/choose-plan")}
                >
                  Upgrade Plan
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <div className={styles.ebsActivation}>
                <div className={styles.labelSection}>
                  <AiOutlineCloudUpload className={styles.icon} />
                  <div className={styles.label}>
                    <h3>Activate Your Persistent Volume</h3>
                    <p>
                      Activate Persistent Volume to store your data in a secure
                      and reliable way.
                    </p>
                  </div>
                </div>
                {ebsVolume?.volumeCreatedAt ? (
                  <div className={styles.createdAt}>
                    Activated on{" "}
                    {moment(ebsVolume?.volumeCreatedAt).format("Do MMM YYYY")}
                  </div>
                ) : (
                  <PrimaryButton
                    white
                    onClick={activateEBSVolume}
                    loading={activateEBSVolumeMutation.isLoading}
                  >
                    Activate Persistent Volume
                  </PrimaryButton>
                )}
              </div>

              {ebsVolume && (
                <div className={styles.volumeDetails}>
                  <div className={styles.header}>Your Volume Details</div>
                  <div className={styles.infoLabel}>
                    <h3>Storage Size</h3>
                    <p>1 GB</p>
                  </div>
                  <div className={styles.infoLabel}>
                    <h3>Status</h3>
                    <p
                      style={{
                        textTransform: "capitalize",
                      }}
                    >
                      {ebsVolume?.volumeStatus}
                    </p>
                  </div>
                  <div className={styles.infoLabelDanger}>
                    <div className={styles.infoLabel}>
                      <h3>Format my volume</h3>
                      <p>
                        Permanently delete the account and remove access from
                        all workspaces.
                      </p>
                    </div>
                    <PrimaryButton
                      danger
                      onClick={formatEBSVolume}
                      loading={formatVolumeMutation.isLoading}
                    >
                      Format Volume
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default UserStorage;
