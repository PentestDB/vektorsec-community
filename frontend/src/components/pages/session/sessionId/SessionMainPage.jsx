import React from "react";
import ChatView from "./ChatView";

const SessionMainPage = ({ session_id }) => {
  return <ChatView sessionId={session_id} />;
};

export default SessionMainPage;
