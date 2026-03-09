"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SettingsLayout = ({ children }) => {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
};

export default SettingsLayout;
