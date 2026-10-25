"use client";

import Loader from "@/components/common/loader/Loader";
import MythicC2Page from "@/components/pages/session/mythic/MythicC2Page";
import { useRegisterSessionTab } from "@/hooks/useSessionTabs";
import { use } from "react";
import { useSelector } from "react-redux";

const MythicPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user } = useSelector((state) => state.user);

  // Register the Mythic C2 tab (this used to be dispatched during render).
  useRegisterSessionTab(sessionId, "mythic");

  if (!user) {
    return <Loader />;
  }

  return <MythicC2Page sessionId={sessionId} />;
};

export default MythicPage;
