import { message, Spin, Upload, Tag, Empty, Popconfirm } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  listVPNProfiles,
  uploadVPNProfile,
  deleteVPNProfile,
  connectVPNProfile,
  disconnectVPNConnection,
  disconnectAllVPNConnections,
  getVPNStatus,
} from "@/services/copilot.service";
import { FiUpload, FiTrash2, FiWifi, FiWifiOff } from "react-icons/fi";
import { MdOutlineVpnLock } from "react-icons/md";
import { useState } from "react";
import styles from "@/styles/components/VPN.module.scss";

const VPNMainPage = ({ sessionId }) => {
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [activeConnectProfile, setActiveConnectProfile] = useState(null);

  const { data: profilesData, isLoading: profilesLoading } = useQuery(
    ["vpn-profiles"],
    listVPNProfiles,
    { refetchInterval: 15000 }
  );

  const { data: vpnStatusData } = useQuery(
    ["check-vpn-status", sessionId],
    () => getVPNStatus({ session_id: sessionId }),
    { refetchInterval: 5000 }
  );

  const vpnConnections = vpnStatusData?.connections ?? [];

  const uploadMutation = useMutation(uploadVPNProfile, {
    onSuccess: (data) => {
      message.success(data?.message ?? "Profile uploaded");
      queryClient.invalidateQueries(["vpn-profiles"]);
      setUploading(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Upload failed");
      setUploading(false);
    },
  });

  const deleteMutation = useMutation(deleteVPNProfile, {
    onSuccess: () => {
      message.success("Profile deleted");
      queryClient.invalidateQueries(["vpn-profiles"]);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Delete failed");
    },
  });

  const connectMutation = useMutation(connectVPNProfile, {
    onSuccess: (data) => {
      setActiveConnectProfile(null);
      message.success(data?.message ?? "Connected");
      queryClient.invalidateQueries(["check-vpn-status", sessionId]);
    },
    onError: (err) => {
      setActiveConnectProfile(null);
      message.error(err?.response?.data?.message ?? "Connection failed");
    },
  });

  const disconnectMutation = useMutation(disconnectVPNConnection, {
    onSuccess: () => {
      message.success("Disconnected");
      queryClient.invalidateQueries(["check-vpn-status", sessionId]);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Disconnect failed");
    },
  });

  const disconnectAllMutation = useMutation(disconnectAllVPNConnections, {
    onSuccess: () => {
      message.success("All VPN connections terminated");
      queryClient.invalidateQueries(["check-vpn-status", sessionId]);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Failed to disconnect all");
    },
  });

  const profiles = profilesData?.profiles ?? [];

  const isProfileConnected = (profileName) => {
    return vpnConnections.some((c) => c.profile_name === profileName);
  };

  const getConnectionForProfile = (profileName) => {
    return vpnConnections.find((c) => c.profile_name === profileName);
  };

  const uploadProps = {
    accept: ".ovpn,.conf",
    showUploadList: false,
    beforeUpload: async (file) => {
      setUploading(true);
      const formData = new FormData();
      formData.append("openvpn", file);
      formData.append("profile_name", file.name.replace(/\.(ovpn|conf)$/, ""));
      await uploadMutation.mutateAsync(formData);
      return false;
    },
  };

  return (
    <div className={styles.vpnContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.headerTitle}>
            <MdOutlineVpnLock size={18} style={{ marginRight: 6, verticalAlign: "middle" }} />
            VPN Connections
          </h2>
          <p className={styles.headerSubtitle}>
            Manage OpenVPN profiles and active connections on this workspace host
          </p>
        </div>
        <div className={styles.headerRight}>
          <Upload {...uploadProps}>
            <PrimaryButton className={styles.primaryBtn} icon={<FiUpload />} loading={uploading} size="small">
              Add VPN Profile
            </PrimaryButton>
          </Upload>
          {vpnConnections.length > 1 && (
            <Popconfirm
              title="Disconnect all VPN connections?"
              onConfirm={() => disconnectAllMutation.mutate({ session_id: sessionId })}
              okText="Disconnect All"
              cancelText="Cancel"
            >
              <PrimaryButton danger size="small" loading={disconnectAllMutation.isLoading}>
                Disconnect All
              </PrimaryButton>
            </Popconfirm>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {vpnConnections.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Active Connections</h3>
            <div className={styles.cardList}>
              {vpnConnections.map((conn) => (
                <div key={conn.pid} className={styles.cardActive}>
                  <div className={styles.cardRow}>
                    <div className={styles.cardLeft}>
                      <div className={styles.cardTitle}>
                        <Tag color="green" className={styles.tagConnected}>CONNECTED</Tag>
                        <span style={{ color: "var(--primary-text)", fontWeight: 500, fontSize: "0.8rem" }}>
                          {conn.profile_name}
                        </span>
                      </div>
                      <div className={styles.cardMeta}>
                        <span>PID: {conn.pid}</span>
                        {conn.tun_interface && (
                          <>
                            <span className={styles.cardMetaDot}>&bull;</span>
                            <span>{conn.tun_interface}</span>
                          </>
                        )}
                        {conn.tun_ip && (
                          <>
                            <span className={styles.cardMetaDot}>&bull;</span>
                            <span className={styles.cardMetaIp}>{conn.tun_ip}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <PrimaryButton
                        danger
                        size="small"
                        icon={<FiWifiOff />}
                        loading={disconnectMutation.isLoading}
                        onClick={() =>
                          disconnectMutation.mutate({
                            session_id: sessionId,
                            pid: conn.pid,
                            profile_name: conn.profile_name,
                          })
                        }
                      >
                        Disconnect
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Saved Profiles</h3>

          {profilesLoading ? (
            <div style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
              <Spin />
            </div>
          ) : profiles.length === 0 ? (
            <Empty
              description={
                <span style={{ color: "var(--secondary-text)", fontSize: "0.75rem" }}>
                  No VPN profiles yet. Upload an .ovpn file to get started.
                </span>
              }
              className={styles.emptyState}
            />
          ) : (
            <div className={styles.cardList}>
              {profiles.map((profile) => {
                const connected = isProfileConnected(profile.name);
                const conn = getConnectionForProfile(profile.name);
                return (
                  <div
                    key={profile.filename}
                    className={connected ? styles.cardActive : styles.card}
                  >
                    <div className={styles.cardRow}>
                      <div className={styles.cardLeft}>
                        <div className={styles.cardTitle}>
                          {connected ? (
                            <Tag color="green" className={styles.tagConnected}>ACTIVE</Tag>
                          ) : (
                            <Tag className={styles.tagIdle}>IDLE</Tag>
                          )}
                          <span style={{ color: "var(--primary-text)", fontWeight: 500, fontSize: "0.8rem" }}>
                            {profile.name}
                          </span>
                        </div>
                        <div className={styles.cardMeta}>
                          <span>{profile.filename}</span>
                          {conn?.tun_ip && (
                            <>
                              <span className={styles.cardMetaDot}>&bull;</span>
                              <span className={styles.cardMetaIp}>{conn.tun_ip}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className={styles.cardRight}>
                        <div className={styles.actionGroup}>
                          {connected ? (
                            <PrimaryButton
                              danger
                              size="small"
                              icon={<FiWifiOff />}
                              loading={disconnectMutation.isLoading}
                              onClick={() =>
                                disconnectMutation.mutate({
                                  session_id: sessionId,
                                  profile_name: profile.name,
                                })
                              }
                            >
                              Disconnect
                            </PrimaryButton>
                          ) : (
                            <PrimaryButton
                              green
                              size="small"
                              icon={<FiWifi />}
                              loading={
                                connectMutation.isLoading &&
                                activeConnectProfile === profile.name
                              }
                              onClick={() => {
                                setActiveConnectProfile(profile.name);
                                connectMutation.mutate({
                                  session_id: sessionId,
                                  profile_name: profile.name,
                                });
                              }}
                            >
                              Connect
                            </PrimaryButton>
                          )}
                          <Popconfirm
                            title={`Delete profile "${profile.name}"?`}
                            onConfirm={() =>
                              deleteMutation.mutate({ profile_name: profile.name })
                            }
                            okText="Delete"
                            cancelText="Cancel"
                          >
                            <PrimaryButton
                              danger
                              size="small"
                              icon={<FiTrash2 />}
                              loading={deleteMutation.isLoading}
                            />
                          </Popconfirm>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default VPNMainPage;
