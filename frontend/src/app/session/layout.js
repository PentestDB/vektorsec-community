"use client";

import { useEffect } from "react";
import { resetSessions } from "@/store/user.slice";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import TerminalComponent from "@/components/common/TerminalComponent";
import { useBeforeunload } from "react-beforeunload";
import { resetToInitialState } from "@/store/socket.slice";
import RefreshAlert from "@/components/common/RefreshAlert";

const SessionLayout = ({ children }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const pathname = usePathname();
  const { session_id } = useParams();
  const { sessions, status, readyToConnect } = useSelector(
    (state) => state.user
  );
  const { sockets } = useSelector((state) => state.socket);

  useBeforeunload(
    sockets.length > 0 ? (event) => event.preventDefault() : null
  );

  const validSession = sessions.find((session) => session.id === session_id);

  useEffect(() => {
    if (sessions.length && !validSession) {
      dispatch(resetSessions());

      router.replace("/dashboard");
    }

    return () => {
      dispatch(resetToInitialState());
      sockets.forEach((socket) => {
        if (socket.socket) {
          socket.socket.emit("disconnect_ssh");
          socket.socket.disconnect();
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id, router]);

  return (
    <AuthContextProvider>
      <RefreshAlert />
      {children}
      <TerminalComponent
        show={status === "running" && !pathname.includes("/gui")}
        readyToConnect={readyToConnect}
      />
    </AuthContextProvider>
  );
};

export default SessionLayout;
