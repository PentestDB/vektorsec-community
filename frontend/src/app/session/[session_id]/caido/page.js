"use client";

import CaidoProxyPage from "@/components/pages/session/caido/CaidoProxyPage";
import { useRegisterSessionTab } from "@/hooks/useSessionTabs";
import { use } from "react";

const CaidoPage = ({ params }) => {
  const { session_id: sessionId } = use(params);

  // Register the Caido tab (now shares the same helper as the other routes).
  useRegisterSessionTab(sessionId, "caido");

  return <CaidoProxyPage sessionId={sessionId} />;
};

export default CaidoPage;
