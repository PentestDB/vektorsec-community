"use client";

import { connectToVNC } from "@/services/copilot.service";
import { updateSessions, updateVNC } from "@/store/user.slice";
import { Spin } from "antd";
import { use } from "react";
import { useQuery } from "react-query";
import { useDispatch, useSelector } from "react-redux";

const GUIpage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);

  const guiSession = sessions.find((session) => session.type === "gui");

  if (!guiSession) {
    const allSessions = sessions.map((session) => {
      return {
        ...session,
        is_active: false,
      };
    });

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/gui",
          is_main: false,
          is_active: true,
          type: "gui",
        },
      ])
    );
  }

  const { data, isLoading } = useQuery(
    ["connectVNC", sessionId],
    () => connectToVNC({ session_id: sessionId }),
    {
      onSuccess: (data) => {
        dispatch(
          updateVNC({
            host: data.vncURL,
            password: data.password,
            active: false,
          })
        );
      },
    }
  );

  if (isLoading)
    return (
      <div
        style={{
          padding: "2rem",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Spin />
      </div>
    );

  return (
    <>
      {data && (
        <div
          style={{
            height: "800px",
          }}
        >
          {" "}
          <iframe
            style={{
              position: "static",
            }}
            id="remote-connection-2"
            src={`http://${data.vncURL}/vnc.html?password=${data.password}&resize=remote&autoconnect=true`}
            width="100%"
            height="100%"
            frameborder="0"
            allow="fullscreen"
          >
            Browser not compatible.
          </iframe>
        </div>
      )}
    </>
  );
};

export default GUIpage;
