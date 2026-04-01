"use client";

import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const WorkspaceLayout = ({ children }) => {
  return (
    <AuthContextProvider>
      {children}
    </AuthContextProvider>
  );
};

export default WorkspaceLayout;
