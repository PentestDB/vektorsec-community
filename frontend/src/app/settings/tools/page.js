"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const Tools = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/capabilities");
  }, [router]);
  return null;
};

export default Tools;
