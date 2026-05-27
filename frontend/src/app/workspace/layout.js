"use client";

import ModelSetupGate from "@/components/common/ModelSetupGate";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const WorkspaceLayout = ({ children }) => {
  return (
    <AuthContextProvider>
      <ModelSetupGate>{children}</ModelSetupGate>
    </AuthContextProvider>
  );
};

export default WorkspaceLayout;
