"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const SessionLayout = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();

  // "/session" has no page of its own — it only exists so the nested routes
  // share this provider. Redirect from an effect instead of during render.
  useEffect(() => {
    if (pathname === "/session") {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  return (
    <AuthContextProvider>
      {children}
    </AuthContextProvider>
  );
};

export default SessionLayout;
