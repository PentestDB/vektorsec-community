"use client";

import React, { createContext, useContext, useRef } from "react";

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  // Use a ref to store sockets so updates don't cause rerenders
  const socketsRef = useRef({});

  // Set a socket for a session
  const setSocket = (sessionId, socketInstance) => {
    socketsRef.current[sessionId] = socketInstance;
  };

  // Get a socket for a session
  const getSocket = (sessionId) => {
    return socketsRef.current[sessionId];
  };

  // Optionally: remove a socket
  const removeSocket = (sessionId) => {
    delete socketsRef.current[sessionId];
  };

  const getAllSockets = () => {
    return Object.entries(socketsRef.current);
  };

  const clearAllSockets = () => {
    for (const [sessionId, socket] of Object.entries(socketsRef.current)) {
      if (socket) {
        socket.emit("disconnect_ssh");
        socket.disconnect();
      }
      delete socketsRef.current[sessionId];
    }
  };

  return (
    <SocketContext.Provider value={{ setSocket, getSocket, removeSocket, getAllSockets, clearAllSockets }}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook for easy usage
export const useSocketContext = () => useContext(SocketContext); 