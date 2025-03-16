import { message, Row, Spin, Upload } from "antd";
import styles from "@/app/page.module.scss";
import PrimaryButton from "@/components/common/PrimaryButton";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  checkUserVPN,
  connectOpenVPN,
  disconnectOpenVPN,
  uploadOpenVPN,
} from "@/services/copilot.service";
import { FiEdit2 } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { AiFillCloseCircle } from "react-icons/ai";

const VPNMainPage = ({ sessionId }) => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { status, containerIP } = useSelector((state) => state.user);
  const isVpnConnected = useSelector((state) => state.vpn.isVpnConnected);
  const vpnLogs = useSelector((state) => state.vpn.vpnLogs);
  const vpnLoading2 = useSelector((state) => state.vpn.isLoading);

  const { data, isLoading: vpnLoading } = useQuery(
    ["vpnData", sessionId],
    checkUserVPN
  );

  const uploadOpenVPNmutation = useMutation(uploadOpenVPN, {
    onSuccess: async (data) => {
      await queryClient.invalidateQueries(["vpnData", sessionId]);
      message.success(
        data?.message ?? "OpenVPN config file uploaded successfully!"
      );
    },
    onError: (error) => {
      console.log(error);
      message.error(
        error?.response?.data?.message ?? "Failed to upload openvpn file!"
      );
    },
  });

  const connectVPNmutation = useMutation(connectOpenVPN, {
    onSuccess: (data) => {
      queryClient.invalidateQueries(["vpnData", sessionId]);
      queryClient.invalidateQueries(["check_vpn_status", sessionId]);
      message.success(data?.message ?? "VPN connected successfully!");
    },
  });

  const disconnectVPNmutation = useMutation(disconnectOpenVPN, {
    onSuccess: (data) => {
      queryClient.invalidateQueries(["vpnData", sessionId]);
      queryClient.invalidateQueries(["check_vpn_status", sessionId]);
      message.info(data?.message ?? "VPN disconnected successfully!");
    },
  });

  const props = {
    beforeUpload: async (file) => {
      const formData = new FormData();

      formData.append("openvpn", file);
      formData.append("session_id", sessionId);

      await uploadOpenVPNmutation.mutateAsync(formData);

      return true;
    },
  };

  const connectToVPN = async () => {
    if (status !== "running") {
      message.error("Exploit box is not running!");
      return;
    }
    await connectVPNmutation.mutateAsync({ session_id: sessionId });
  };

  const disconnectVPN = async () => {
    if (status !== "running") {
      message.error("Exploit box is not running!");
      return;
    }
    await disconnectVPNmutation.mutateAsync({ session_id: sessionId });
  };

  const renderLogs = () => {
    if (!vpnLogs) return null;

    return (
      <div className={styles.vpnLogs}>
        <p className={styles.logHeading}>VPN Logs</p>
        <pre className={styles.logContent}>{vpnLogs}</pre>
      </div>
    );
  };

  return (
    <Row justify="center" style={{ flexDirection: "column" }}>
      {vpnLoading || uploadOpenVPNmutation.isLoading ? (
        <Spin />
      ) : (
        <div className={styles.netcatInfo}>
          {isVpnConnected ? (
            <>
              <p className={styles.title}>Connected to VPN</p>
              <p className={styles.desc} style={{ marginBottom: "2rem" }}>
                You are now connected to the VPN. To disconnect, click the
                button below.
              </p>
              <PrimaryButton
                danger
                onClick={disconnectVPN}
                style={{ marginTop: "1rem" }}
                icon={<AiFillCloseCircle />}
                loading={
                  disconnectVPNmutation.isLoading ||
                  (!isVpnConnected && vpnLoading2)
                }
              >
                Disconnect VPN
              </PrimaryButton>
            </>
          ) : (
            <div className={styles.vpnFileLink}>
              <p className={styles.title}>Connect to VPN</p>
              <p className={styles.desc} style={{ marginBottom: "1rem" }}>
                Public IP: {containerIP ?? "N/A"}
              </p>
              <p className={styles.desc} style={{ marginBottom: "1rem" }}>
                Upload OpenVPN file to grant Sandbox direct subnet access or use
                chisel to browse the internet
              </p>

              {data ? (
                <>
                  <p>
                    <Upload {...props} fileList={[]}>
                      <PrimaryButton yellow icon={<FiEdit2 />}>
                        Upload a new config file
                      </PrimaryButton>
                    </Upload>
                  </p>
                  <p>
                    {data.message === "User openvpn file found"
                      ? "You have already uploaded a VPN config file. To connect to VPN, click the button below."
                      : "You have not uploaded a VPN config file. To connect to VPN, upload a config file by clicking the button below."}
                  </p>

                  <PrimaryButton
                    purple
                    onClick={connectToVPN}
                    style={{ marginTop: "1rem" }}
                    loading={
                      connectVPNmutation.isLoading ||
                      (isVpnConnected && vpnLoading2)
                    }
                    disabled={status !== "running"}
                  >
                    Connect to VPN
                  </PrimaryButton>
                </>
              ) : (
                <Upload {...props} fileList={[]}>
                  <PrimaryButton purple style={{ marginTop: "1rem" }}>
                    Upload VPN Config File
                  </PrimaryButton>
                </Upload>
              )}
            </div>
          )}
          {renderLogs()}
        </div>
      )}
    </Row>
  );
};

export default VPNMainPage;
