"use client";

import Loader from "@/components/common/loader/Loader";
import VPNMainPage from "@/components/pages/session/vpn/VPNMainPage";
import { useRegisterSessionTab } from "@/hooks/useSessionTabs";
import { use } from "react";
import { useSelector } from "react-redux";

const VPNPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user } = useSelector((state) => state.user);

  // Register the VPN tab (this used to be dispatched during render).
  useRegisterSessionTab(sessionId, "vpn");

  if (!user) {
    return <Loader />;
  }

  return <VPNMainPage sessionId={sessionId} />;
};

export default VPNPage;
