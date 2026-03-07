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
import { useSocketContext } from "@/context/SocketContext";

const SessionLayout = ({ children }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const pathname = usePathname();
  const { session_id } = useParams();
  const { sessions, status, readyToConnect } = useSelector(
    (state) => state.user
  );
  const { getAllSockets, clearAllSockets } = useSocketContext();

  useBeforeunload(
    getAllSockets().length > 0 ? (event) => event.preventDefault() : null
  );

  const validSession = sessions.find((session) => session.id === session_id);

  if (pathname === "/session") {
    router.replace("/dashboard");
  }

  useEffect(() => {
    if (sessions.length && !validSession) {
      dispatch(resetSessions());

      router.replace("/dashboard");
    }

    return () => {
      dispatch(resetToInitialState());
      clearAllSockets();
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
