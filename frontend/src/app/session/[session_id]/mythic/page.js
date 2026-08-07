"use client";

import Loader from "@/components/common/loader/Loader";
import MythicC2Page from "@/components/pages/session/mythic/MythicC2Page";
import { use } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";

const MythicPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user, sessions } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const mythicSession = sessions.find((session) => session.type === "mythic");

  if (!mythicSession) {
    const allSessions = sessions.map((session) => ({
      ...session,
      is_active: false,
    }));

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/mythic",
          is_main: false,
          is_active: true,
          type: "mythic",
        },
      ])
    );
  }

  if (!user) {
    return <Loader />;
  }

  return <MythicC2Page sessionId={sessionId} />;
};

export default MythicPage;
