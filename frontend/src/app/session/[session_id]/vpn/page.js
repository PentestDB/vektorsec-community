"use client";

import Loader from "@/components/common/loader/Loader";
import VPNMainPage from "@/components/pages/session/vpn/VPNMainPage";
import { use } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";

const VPNPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user, sessions } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const vpnSession = sessions.find((session) => session.type === "vpn");

  if (!vpnSession) {
    const allSessions = sessions.map((session) => {
      return {
        ...session,
        is_active: false,
      };
    });

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/vpn",
          is_main: false,
          is_active: true,
          type: "vpn",
        },
      ])
    );
  }

  if (!user) {
    return <Loader />;
  }

  return <VPNMainPage sessionId={sessionId} />;
};

export default VPNPage;
