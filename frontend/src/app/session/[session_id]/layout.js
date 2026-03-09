"use client";

import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import Loader from "@/components/common/loader/Loader";
import React, { use, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "@/styles/pages/Session.module.scss";
import { Alert, Col, Row, message, notification } from "antd";
import Sidebar from "@/components/common/Sidebar";
import HeaderLinks from "@/components/common/HeaderLinks";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { downloadFiles, getSessionInfo } from "@/services/copilot.service";
import { useRouter } from "next/navigation";
import {
  expireContainer,
  updateDisclaimer,
  updateExpiry,
  updateExploitBox,
  updateSessions,
} from "@/store/user.slice";
import PrimaryButton from "@/components/common/PrimaryButton";
import { TbBrandCodesandbox } from "react-icons/tb";
import { confirmPopUp } from "@/components/common/ConfirmPopUp";
import {
  checkExploitBoxStatus,
  extendContainerTime,
  initiatePentestExploitBox,
  stopTask,
} from "@/services/task.service";
import {
  MdConnectWithoutContact,
  MdOutlineClose,
  MdOutlineStopCircle,
  MdOutlineVpnLock,
} from "react-icons/md";
import Image from "next/image";
import moment from "moment";
import vpn from "@/assets/sidebar/vpn.svg";
import { setVpnConnected, setVpnConnections, setIsLoading } from "@/store/vpn.slice";
import { getVPNStatus } from "@/services/copilot.service";

const SessionLayout = ({ children, params }) => {
  const { session_id } = use(params);
  const router = useRouter();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [serviceId, setServiceId] = useState(null);
  const [cpuUtilization, setCpuUtilization] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const isVpnConnected = useSelector((state) => state.vpn.isVpnConnected);
  const vpnConnections = useSelector((state) => state.vpn.connections) ?? [];

  const { user, status, sessions, vnc, disclaimer, readyToConnect } =
    useSelector((state) => state.user);

  const { isLoading: reduxLoading } = useQuery(
    ["check-vpn-status", session_id],
    () => getVPNStatus({ session_id }),
    {
      refetchInterval: 10000,
      onSuccess: (data) => {
        dispatch(setVpnConnections(data?.connections ?? []));
      },
      onError: () => {
        dispatch(setVpnConnections([]));
      },
    }
  );

  useEffect(() => {
    dispatch(setIsLoading(reduxLoading));
  }, [reduxLoading, dispatch]);

  const { data: sessionData } = useQuery(
    ["get-session-info", { session_id }],
    () => getSessionInfo({ session_id }),
    {
      onSuccess: () => {
        if (!sessions?.length) {
          dispatch(
            updateSessions([
              {
                id: session_id,
                is_main: true,
                is_active: true,
                type: "session",
              },
              {
                id: session_id + "/gui",
                is_main: false,
                is_active: false,
                type: "gui",
              },
              {
                id: session_id + "/vpn",
                is_main: false,
                is_active: false,
                type: "vpn",
              },
            ])
          );
        }
      },
    }
  );

  const { data: containerData, isLoading } = useQuery(
    ["exploit-box-status", sessionData?.mainSessionId],
    () =>
      checkExploitBoxStatus({
        session_id: sessionData?.mainSessionId,
      }),
    {
      enabled: !!sessionData?.mainSessionId,
      onSuccess: (data) => {
        if (data.success) {
          dispatch(updateExploitBox(data));
          setCpuUtilization(data.cpuUtilization);
          setLoading(false);
        } else {
          setLoading(false);
          dispatch(expireContainer());
        }
      },
      onError: (err) => {
        console.log(err);
        setServiceId(null);
        dispatch(expireContainer());
      },
      refetchInterval: 5000,
    }
  );

  // Start Container
  const initiateExploitBoxMutation = useMutation(initiatePentestExploitBox, {
    onSuccess: (data) => {
      setLoading(true);
      setServiceId(data.serviceId);
      dispatch(updateDisclaimer(true));
    },
    onError: (err) => {
      console.log(err);
      notification.error({
        message: "Failed to start exploit box",
        description: err?.response?.data?.message ?? "Something went wrong",
      });
    },
  });

  const terminateExloitBoxMutation = useMutation(stopTask, {
    onSuccess: () => {
      setServiceId(null);
      dispatch(expireContainer());
      dispatch(setVpnConnections([]));

      let filteredSession = sessions.filter(
        (session) =>
          session.id !== session_id + "/gui" &&
          session.id !== session_id + "/vpn"
      );

      filteredSession.map((session) => {
        return {
          ...session,
          socket: null,
        };
      });

      dispatch(updateSessions(filteredSession));
    },
  });

  const downloadFilesMutation = useMutation(downloadFiles, {
    onSuccess: async (data) => {
      message.success(data?.message ?? "Files downloaded successfully!");
    },
    onError: async (error) => {
      console.log(error);
      message.error(
        error?.response?.data?.message ?? "Failed to download files!"
      );
    },
  });

  const extendTimerMutation = useMutation(extendContainerTime, {
    onError: (err) => {
      console.log(err);
      message.error(
        err?.response?.data?.message ?? "Failed to extend task expiration!"
      );
    },
    onSuccess: async (data) => {
      message.success(
        data?.message ?? "Successfully extended task expiration!"
      );
      await queryClient.invalidateQueries([
        "exploit-box-status",
        sessionData?.mainSessionId,
      ]);
      dispatch(updateExpiry(data));
    },
  });

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds - hours * 3600) / 60);
    const secs = seconds - hours * 3600 - minutes * 60;

    return hours <= 0
      ? `${minutes}m ${secs}s`
      : `${hours}h ${minutes}m ${secs}s`;
  };

  const renderStatus = (status) => {
    return (
      <span
        style={{
          textTransform: "capitalize",
          color:
            status === "running"
              ? "#10ca00"
              : status === "stopped"
              ? "#ff2400"
              : "#ffc40c",
        }}
      >
        {status}
      </span>
    );
  };

  const handleStartExploitBox = async () => {
    confirmPopUp({
      className: "confirm-popup-large",
      okButtonBg: "#10ca00",
      okText: "I Agree & Start Exploit Box",
      title: "Start Exploit Box",
      content: (
        <div>
          <p>
            Welcome to the Exploit Box! Kindly note that this environment is
            exclusively intended for educational and ethical hacking purposes.
          </p>
          <p>
            Any misuse or unauthorized access to systems and networks beyond the
            scope of learning is strictly prohibited and may result in banning
            your account.
          </p>
          <p>
            We emphasize responsible usage of the provided tools to enhance your
            penetration testing skills and cybersecurity knowledge.
          </p>{" "}
          <p>
            Let&apos;s collectively contribute to a secure cyberspace. Happy
            hacking and learning!
          </p>
        </div>
      ),
      onOk: async () => {
        await initiateExploitBoxMutation.mutateAsync({
          sessionId: session_id,
        });
      },
    });
  };

  useEffect(() => {
    if (containerData && !isLoading) {
      const interval = setInterval(() => {
        const duration = moment(containerData?.expiresAt).diff(
          moment(),
          "seconds"
        );

        setTimeLeft(Math.round(duration));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [timeLeft, containerData, isLoading]);


  if (!user) {
    return <Loader />;
  }

  return (
    <AuthContextProvider>
      <Row>
        <Sidebar sessionId={session_id} />
        <Col span={20} className={styles.mainContent}>
          <HeaderLinks sessionId={session_id} />

          {containerData && status !== "stopped" && (
            <div className={styles.statusBar}>
              <div className={styles.status}>
                Exploit Box Status: {renderStatus(status)}
              </div>

              <div className={styles.status}>
                Connection:{" "}
                <span
                  style={{
                    color: readyToConnect ? "#10ca00" : "#ffc40c",
                  }}
                >
                  {readyToConnect ? "Ready" : "Initializing..."}
                </span>
              </div>

              {/* <div className={styles.status}>
                Expires in:
                <span
                  style={{
                    color: timeLeft <= 60 * 3 ? "#ff2400" : "#10ca00",
                  }}
                >
                  {formatTime(timeLeft ?? 0)}
                </span>
                <div
                  className={styles.addTimeBtn}
                  onClick={async () => {
                    await extendTimerMutation.mutateAsync({
                      serviceId: containerData?.serviceId,
                    });
                  }}
                >
                  Add time
                </div>
              </div>

              <div className={styles.status}>
                CPU Usage:
                <span
                  style={{
                    color: cpuUtilization > 60 ? "#ff2400" : "#10ca00",
                  }}
                >
                  {cpuUtilization?.toFixed(2) ?? 0}%
                </span>
              </div> */}
            </div>
          )}

          <Row
            align="middle"
            justify="space-between"
            className={styles.sessionHeaderContainer}
          >
            <Col
              xs={24}
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div className={styles.sessionName}>
                {sessionData?.sessionName}
              </div>
              <div className={styles.sessionActions}>
                {sessionData?.downloadExists && (
                  <PrimaryButton
                    green
                    onClick={async () => {
                      await downloadFilesMutation.mutateAsync({
                        session_id,
                      });
                    }}
                  >
                    Download Files
                  </PrimaryButton>
                )}

                {!serviceId && status === "stopped" ? (
                  <>
                    {/* <PrimaryButton
                      purple
                      icon={<TbBrandCodesandbox />}
                      loading={loading || initiateExploitBoxMutation.isLoading}
                      onClick={handleStartExploitBox}
                    >
                      Start Exploit Box
                    </PrimaryButton> */}
                  </>
                ) : (
                  <>
                    {/* <PrimaryButton
                      danger
                      loading={terminateExloitBoxMutation.isLoading}
                      onClick={async () => {
                        await terminateExloitBoxMutation.mutateAsync({
                          sessionId: session_id,
                        });
                      }}
                      icon={<MdOutlineStopCircle />}
                    >
                      Stop Exploit Box
                    </PrimaryButton> */}
                    {status === "running" && readyToConnect && (
                      <>
                        <PrimaryButton
                          {...(isVpnConnected ? { green: true } : { orange: true })}
                          onClick={() =>
                            router.push(`/session/${session_id}/vpn`)
                          }
                          icon={
                            isVpnConnected
                              ? <MdOutlineVpnLock />
                              : <Image src={vpn} width={16} height={16} alt="" />
                          }
                        >
                          {isVpnConnected
                            ? `VPN (${vpnConnections.length})`
                            : "Connect VPN"}
                        </PrimaryButton>
                        {vnc && vnc.host && vnc.password && (
                          <PrimaryButton
                            yellow
                            onClick={() => {
                              window.open(
                                `https://${vnc.host}/vnc.html?host=${vnc.host}&autoconnect=true&password=${vnc.password}`,
                                "_blank"
                              );
                            }}
                            icon={<MdConnectWithoutContact />}
                          >
                            Open GUI
                          </PrimaryButton>
                        )}{" "}
                      </>
                    )}
                  </>
                )}
              </div>
            </Col>
            {status && status !== "stopped" && disclaimer && (
              <Col
                xs={24}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                {/* <div className={styles.sessionDescription}> */}
                <Alert
                  closable
                  closeIcon={<MdOutlineClose color="#FFF" size={18} />}
                  className={styles.exploitBoxAlert}
                  message={<b>Exploit Box Usage Disclaimer</b>}
                  description={
                    <>
                      Violations of our resource utilization policies, including
                      but not limited to Crypto Mining, Brute Force Attacks,
                      DDoS attacks, or any operation causing excessive CPU
                      usage, will lead to{" "}
                      <b>
                        immediate suspension and termination of your account
                      </b>
                    </>
                  }
                  type="warning"
                  showIcon
                  onClose={() => {
                    dispatch(updateDisclaimer(false));
                  }}
                />
                {/* </div> */}
              </Col>
            )}
          </Row>

          {children}
        </Col>
      </Row>
    </AuthContextProvider>
  );
};

export default SessionLayout;
