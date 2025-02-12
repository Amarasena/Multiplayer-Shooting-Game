"use client"

import { useEffect, useState } from "react"
import { useThree } from "@react-three/fiber"
import { useWebSocket } from "./WebSocketProvider"

export function useKeyboardControls(playerId) {
  const [movement, setMovement] = useState({ forward: false, backward: false, left: false, right: false })
  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const { camera } = useThree()
  const socket = useWebSocket(); // Now stable, coming from provider

  useEffect(() => {
    if (!socket) return; // Prevent errors if WebSocket is not ready

    const handleKeyDown = (event) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      const newMovement = { ...movement };
      let shouldSend = false;

      switch (event.code) {
        case "KeyW": newMovement.forward = true; shouldSend = true; break;
        case "KeyS": newMovement.backward = true; shouldSend = true; break;
        case "KeyA": newMovement.left = true; shouldSend = true; break;
        case "KeyD": newMovement.right = true; shouldSend = true; break;
      }

      if (shouldSend) {
        setMovement(newMovement);
        socket.send(JSON.stringify({ type: "keydown", key: event.code, playerId }));
      }
    };

    const handleKeyUp = (event) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      const newMovement = { ...movement };
      let shouldSend = false;

      switch (event.code) {
        case "KeyW": newMovement.forward = false; shouldSend = true; break;
        case "KeyS": newMovement.backward = false; shouldSend = true; break;
        case "KeyA": newMovement.left = false; shouldSend = true; break;
        case "KeyD": newMovement.right = false; shouldSend = true; break;
      }

      if (shouldSend) {
        setMovement(newMovement);
        socket.send(JSON.stringify({ type: "keyup", key: event.code, playerId }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [socket, movement, playerId]);

  useEffect(() => {
    camera.rotation.x = rotation.x;
    camera.rotation.y = rotation.y;
  }, [rotation]);

  return movement;
}
