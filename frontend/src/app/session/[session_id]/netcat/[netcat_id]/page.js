"use client";

import NetcatMainPage from "@/components/pages/session/netcat/NetcatMainPage";
import { Spin } from "antd";
import { use } from "react";
import { useSearchParams } from "next/navigation";

const NetCatPage = ({ params }) => {
  const { netcat_id } = use(params);
  const searchParams = useSearchParams();

  const port = searchParams.get("port");

  if (!netcat_id) return <Spin />;

  return <NetcatMainPage netcat_id={netcat_id} port={port} />;
};

export default NetCatPage;
