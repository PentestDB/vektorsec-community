"use client";

import Loader from "@/components/common/loader/Loader";
import BurpProxyPage from "@/components/pages/session/burp/BurpProxyPage";
import { useRegisterSessionTab } from "@/hooks/useSessionTabs";
import { use } from "react";
import { useSelector } from "react-redux";

const BurpPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user } = useSelector((state) => state.user);

  // Register the Burp tab (this used to be dispatched during render).
  useRegisterSessionTab(sessionId, "burp");

  if (!user) {
    return <Loader />;
  }

  return <BurpProxyPage sessionId={sessionId} />;
};

export default BurpPage;
