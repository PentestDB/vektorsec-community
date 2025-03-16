"use client";

import TerminalSession from "@/components/common/TerminalSession";
import { updateTerminalHeight } from "@/store/socket.slice";
import { updateSessions } from "@/store/user.slice";
import { message } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { validate as uuidValidate } from "uuid";

const TerminalPage = ({ params }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { terminal_id, session_id } = params;
  const { sessions } = useSelector((state) => state.user);

  useEffect(() => {
    const exists = sessions.find(
      (s) => s.id === terminal_id && s.type === "terminal"
    );

    if (!exists || !uuidValidate(terminal_id)) {
      message.error("Invalid Terminal ID!");
      router.replace("/session/" + session_id);
    } else {
      const newSessions = sessions.map((session) => {
        return {
          ...session,
          is_active:
            session.type === "terminal" && session.id === terminal_id
              ? true
              : false,
        };
      });

      dispatch(updateSessions(newSessions));
      dispatch(updateTerminalHeight(window.innerHeight));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal_id, session_id]);

  return <></>;
};

export default TerminalPage;
