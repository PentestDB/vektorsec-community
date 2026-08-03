"use client";

import React, { use } from "react";
import { Spin } from "antd";
import VulnerabilitiesPage from "@/components/pages/session/vulnerabilities/VulnerabilitiesPage";

export default function VulnerabilitiesRoute({ params }) {
  const { session_id: sessionId } = use(params);
  if (!sessionId) return <Spin />;
  return <VulnerabilitiesPage sessionId={sessionId} />;
}
