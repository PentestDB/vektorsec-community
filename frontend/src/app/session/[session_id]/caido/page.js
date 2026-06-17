"use client";

import CaidoProxyPage from "@/components/pages/session/caido/CaidoProxyPage";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";

const CaidoPage = ({ params }) => {
  const routeParams = useParams();
  const sessionId = params?.session_id || routeParams?.session_id;
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);

  useEffect(() => {
    const caidoSession = sessions.find((session) => session.type === "caido");
    if (!caidoSession) {
      dispatch(updateSessions([
        ...sessions,
        {
          id: sessionId + "/caido",
          is_main: false,
          is_active: true,
          type: "caido",
        },
      ]));
    }
  }, [dispatch, sessionId, sessions]);

  return <CaidoProxyPage sessionId={sessionId} />;
};

export default CaidoPage;
