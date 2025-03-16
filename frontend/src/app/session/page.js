"use client";

import { usePathname, useRouter } from "next/navigation";

const Session = () => {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/session") {
    router.replace("/dashboard");
  }
};

export default Session;
