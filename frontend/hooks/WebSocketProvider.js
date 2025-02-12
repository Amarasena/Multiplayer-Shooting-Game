//frontend/hooks/WebSocketProvider.js
"use client"

import React, { createContext, useContext, useEffect, useState } from "react";
import webSocketManager from "./webSocketManager";

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    webSocketManager.connect("ws://192.168.224.206:9090");
    const ws = webSocketManager.getSocket();
    setSocket(ws);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received from server:", message);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  return useContext(WebSocketContext);
};
