"use client";

import { usePathname, useRouter } from "next/navigation";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const SessionLayout = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/session") {
    router.replace("/dashboard");
  }

  return (
    <AuthContextProvider>
      {children}
    </AuthContextProvider>
  );
};

export default SessionLayout;
