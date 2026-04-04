"use client";

import RacerChatView from "@/components/pages/session/sessionId/RacerChatView";
import { Spin } from "antd";
import { use } from "react";

const RacerPage = ({ params }) => {
  const { session_id, racer_id } = use(params);

  if (!session_id || !racer_id) return <Spin />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      <RacerChatView sessionId={session_id} racerId={racer_id} />
    </div>
  );
};

export default RacerPage;
