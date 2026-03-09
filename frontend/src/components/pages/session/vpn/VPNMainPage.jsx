import { message, Row, Col, Spin, Upload, Tag, Empty, Popconfirm } from "antd";
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
import { useSelector } from "react-redux";
import { useState } from "react";

const VPNMainPage = ({ sessionId }) => {
  const queryClient = useQueryClient();
  const { status } = useSelector((state) => state.user);
  const vpnConnections = useSelector((state) => state.vpn.connections) ?? [];
  const [uploading, setUploading] = useState(false);
  const [activeConnectProfile, setActiveConnectProfile] = useState(null);

  const { data: profilesData, isLoading: profilesLoading } = useQuery(
    ["vpn-profiles"],
    listVPNProfiles,
    { refetchInterval: 15000 }
  );

  useQuery(
    ["check-vpn-status", sessionId],
    () => getVPNStatus({ session_id: sessionId }),
    { refetchInterval: 5000 }
  );

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

  const boxRunning = status === "running";

  const cardStyle = {
    backgroundColor: "var(--black-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    padding: "0.85rem 1rem",
  };

  const activeCardStyle = {
    ...cardStyle,
    border: "1px solid rgba(16, 202, 0, 0.35)",
    backgroundColor: "rgba(16, 202, 0, 0.04)",
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: "1.75rem" }}>
        <Col>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.2rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <MdOutlineVpnLock size={20} />
            VPN Connections
          </h2>
          <p style={{ margin: "0.35rem 0 0", color: "var(--secondary-text)", fontSize: "0.82rem" }}>
            Manage OpenVPN profiles and active connections on your exploit box
          </p>
        </Col>
        <Col>
          <Row style={{ gap: "0.75rem" }}>
            <Upload {...uploadProps}>
              <PrimaryButton purple icon={<FiUpload />} loading={uploading}>
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
                <PrimaryButton danger loading={disconnectAllMutation.isLoading}>
                  Disconnect All
                </PrimaryButton>
              </Popconfirm>
            )}
          </Row>
        </Col>
      </Row>

      {/* Active Connections */}
      {vpnConnections.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h3 style={{ color: "var(--secondary-text)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Active Connections
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {vpnConnections.map((conn) => (
              <div key={conn.pid} style={activeCardStyle}>
                <Row justify="space-between" align="middle" wrap={false}>
                  <Col style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Tag color="green" style={{ margin: 0, fontSize: "0.7rem", lineHeight: "1.4" }}>CONNECTED</Tag>
                      <span style={{ color: "#fff", fontWeight: 500, fontSize: "0.9rem" }}>
                        {conn.profile_name}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, color: "var(--secondary-text)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>PID: {conn.pid}</span>
                      {conn.tun_interface && (
                        <>
                          <span style={{ opacity: 0.4 }}>&bull;</span>
                          <span>{conn.tun_interface}</span>
                        </>
                      )}
                      {conn.tun_ip && (
                        <>
                          <span style={{ opacity: 0.4 }}>&bull;</span>
                          <span style={{ color: "var(--bugbase-green)" }}>{conn.tun_ip}</span>
                        </>
                      )}
                    </div>
                  </Col>
                  <Col>
                    <PrimaryButton
                      danger
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
                  </Col>
                </Row>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Profiles */}
      <div>
        <h3 style={{ color: "var(--secondary-text)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Saved Profiles
        </h3>

        {profilesLoading ? (
          <Row justify="center" style={{ padding: "2rem" }}>
            <Spin />
          </Row>
        ) : profiles.length === 0 ? (
          <Empty
            description={
              <span style={{ color: "var(--secondary-text)" }}>
                No VPN profiles yet. Upload an .ovpn file to get started.
              </span>
            }
            style={{ padding: "2.5rem 0" }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {profiles.map((profile) => {
              const connected = isProfileConnected(profile.name);
              const conn = getConnectionForProfile(profile.name);
              return (
                <div key={profile.filename} style={connected ? activeCardStyle : cardStyle}>
                  <Row justify="space-between" align="middle" wrap={false}>
                    <Col style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {connected ? (
                          <Tag color="green" style={{ margin: 0, fontSize: "0.7rem", lineHeight: "1.4" }}>ACTIVE</Tag>
                        ) : (
                          <Tag
                            style={{
                              margin: 0,
                              fontSize: "0.7rem",
                              lineHeight: "1.4",
                              backgroundColor: "var(--border-color)",
                              border: "none",
                              color: "var(--secondary-text)",
                            }}
                          >
                            IDLE
                          </Tag>
                        )}
                        <span style={{ color: "#fff", fontWeight: 500, fontSize: "0.9rem" }}>
                          {profile.name}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "var(--secondary-text)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{profile.filename}</span>
                        {conn?.tun_ip && (
                          <>
                            <span style={{ opacity: 0.4 }}>&bull;</span>
                            <span style={{ color: "var(--bugbase-green)" }}>{conn.tun_ip}</span>
                          </>
                        )}
                      </div>
                    </Col>
                    <Col>
                      <div style={{ display: "flex", gap: 8 }}>
                        {connected ? (
                          <PrimaryButton
                            danger
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
                            icon={<FiWifi />}
                            loading={
                              connectMutation.isLoading &&
                              activeConnectProfile === profile.name
                            }
                            disabled={!boxRunning}
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
                            icon={<FiTrash2 />}
                            loading={deleteMutation.isLoading}
                          />
                        </Popconfirm>
                      </div>
                    </Col>
                  </Row>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!boxRunning && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            backgroundColor: "rgba(255, 196, 12, 0.08)",
            border: "1px solid rgba(255, 196, 12, 0.25)",
            color: "#ffc40c",
            fontSize: "0.82rem",
          }}
        >
          Exploit box must be running to connect or disconnect VPN profiles.
        </div>
      )}
    </div>
  );
};

export default VPNMainPage;
