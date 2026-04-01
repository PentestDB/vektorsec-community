"use client";

import WorkspaceDetailPage from "@/components/pages/workspace/WorkspaceDetailPage";
import { Spin } from "antd";
import { use } from "react";

const WorkspacePage = ({ params }) => {
  const { workspace_id } = use(params);

  if (!workspace_id) return <Spin />;

  return <WorkspaceDetailPage workspaceId={workspace_id} />;
};

export default WorkspacePage;
