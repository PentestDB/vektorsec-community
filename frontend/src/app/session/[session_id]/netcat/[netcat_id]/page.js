"use client";

import NetcatMainPage from "@/components/pages/session/netcat/NetcatMainPage";
import { Spin } from "antd";
import { useSearchParams } from "next/navigation";

const NetCatPage = ({ params }) => {
  const searchParams = useSearchParams();

  const port = searchParams.get("port");

  if (!params.netcat_id) return <Spin />;

  return <NetcatMainPage netcat_id={params.netcat_id} port={port} />;
};

export default NetCatPage;
