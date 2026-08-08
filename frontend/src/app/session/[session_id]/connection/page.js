"use client";

import React, { use } from "react";
import { Spin } from "antd";
import SSHConnectionPage from "@/components/pages/session/connection/SSHConnectionPage";

export default function ConnectionRoute({ params }) {
  const { session_id: sessionId } = use(params);
  if (!sessionId) return <Spin />;
  return <SSHConnectionPage sessionId={sessionId} />;
}
