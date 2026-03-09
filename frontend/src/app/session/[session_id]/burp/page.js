"use client";

import Loader from "@/components/common/loader/Loader";
import BurpProxyPage from "@/components/pages/session/burp/BurpProxyPage";
import { use } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";

const BurpPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const { user, sessions } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const burpSession = sessions.find((session) => session.type === "burp");

  if (!burpSession) {
    const allSessions = sessions.map((session) => ({
      ...session,
      is_active: false,
    }));

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/burp",
          is_main: false,
          is_active: true,
          type: "burp",
        },
      ])
    );
  }

  if (!user) {
    return <Loader />;
  }

  return <BurpProxyPage sessionId={sessionId} />;
};

export default BurpPage;
