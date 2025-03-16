"use client";

import SessionMainPage from "@/components/pages/session/sessionId/SessionMainPage";
import { updateSessions } from "@/store/user.slice";
import { Spin } from "antd";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

const SessionPage = ({ params }) => {
  const dispatch = useDispatch();
  const session_id = params.session_id;
  const { sessions } = useSelector((state) => state.user);

  useEffect(() => {
    const newSessions = sessions.map((session) => {
      return {
        ...session,
        is_active:
          session.type === "session" && session.id === session_id
            ? true
            : false,
      };
    });

    dispatch(updateSessions(newSessions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  if (!session_id) return <Spin />;

  return <SessionMainPage session_id={session_id} />;
};

export default SessionPage;
