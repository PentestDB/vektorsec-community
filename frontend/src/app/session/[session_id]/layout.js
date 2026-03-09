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
import {
  checkExploitBoxStatus,
  extendContainerTime,
  initiatePentestExploitBox,
  stopTask,
} from "@/services/task.service";
import {
  MdConnectWithoutContact,
  MdOutlineClose,
  MdOutlineVpnLock,
} from "react-icons/md";
import Image from "next/image";
import moment from "moment";
import vpn from "@/assets/sidebar/vpn.svg";
import { setVpnConnections, setIsLoading } from "@/store/vpn.slice";
import { getVPNStatus } from "@/services/copilot.service";
import TerminalComponent from "@/components/common/TerminalComponent";
import { usePathname } from "next/navigation";

const SessionLayout = ({ children, params }) => {
  const { session_id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
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
    ["exploit-box-status", session_id],
    () =>
      checkExploitBoxStatus({
        session_id,
      }),
    {
      enabled: !!session_id,
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
        return { ...session, socket: null };
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
        session_id,
      ]);
      dispatch(updateExpiry(data));
    },
  });

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
      <div className={styles.sessionPage}>
        <Sidebar sessionId={session_id} />
        <div className={styles.sessionMainArea}>
          <HeaderLinks sessionId={session_id} sessionName={sessionData?.sessionName} />
          {status && status !== "stopped" && disclaimer && (
            <Alert
              closable
              closeIcon={<MdOutlineClose color="#FFF" size={16} />}
              className={styles.exploitBoxAlert}
              message={<b>Exploit Box Usage Disclaimer</b>}
              description="Violations of resource utilization policies (crypto mining, DDoS, etc.) will lead to immediate account suspension."
              type="warning"
              showIcon
              banner
              onClose={() => dispatch(updateDisclaimer(false))}
            />
          )}
          <div className={styles.sessionContent}>
            {children}
          </div>
          <TerminalComponent
            show={status === "running" && !pathname.includes("/gui")}
            readyToConnect={readyToConnect}
          />
        </div>
      </div>
    </AuthContextProvider>
  );
};

export default SessionLayout;
