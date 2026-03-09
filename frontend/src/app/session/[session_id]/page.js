"use client";

import SessionMainPage from "@/components/pages/session/sessionId/SessionMainPage";
import { Spin } from "antd";
import { use } from "react";

const SessionPage = ({ params }) => {
  const { session_id } = use(params);

  if (!session_id) return <Spin />;

  return <SessionMainPage session_id={session_id} />;
};

export default SessionPage;
