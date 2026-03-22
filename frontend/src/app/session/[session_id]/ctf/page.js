"use client";

import Loader from "@/components/common/loader/Loader";
import CTFPage from "@/components/pages/session/ctf/CTFPage";
import { use } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";

const CtfPageRoute = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user, sessions } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const ctfSession = sessions.find((session) => session.type === "ctf");

  if (!ctfSession) {
    const allSessions = sessions.map((session) => ({
      ...session,
      is_active: false,
    }));

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/ctf",
          is_main: false,
          is_active: true,
          type: "ctf",
        },
      ])
    );
  }

  if (!user) {
    return <Loader />;
  }

  return <CTFPage sessionId={sessionId} />;
};

export default CtfPageRoute;
