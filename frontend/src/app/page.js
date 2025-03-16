"use client";

import LandingPage from "@/components/pages/Landing";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const Home = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const url = pathname + searchParams.toString();
  }, [pathname, searchParams]);

  return <LandingPage />;
};

export default Home;
