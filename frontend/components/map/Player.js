import { useEffect, useRef, useState } from "react";
import { Box } from "@react-three/drei";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { Vector3 } from "three";

// WebSocket connection
const socket = new WebSocket("ws://192.168.56.1:12345"); // Replace with your server's IP

function Player({ playerId, isLocal }) {
  const meshRef = useRef();
  const { forward, backward, left, right } = useKeyboardControls();
  const [position, setPosition] = useState(new Vector3(0, 1, 0));

  useEffect(() => {
    if (!isLocal) {
      // Listen for remote player updates
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.playerId !== playerId) {
          setPosition(new Vector3(data.x, data.y, data.z));
        }
      };
    }
  }, [playerId, isLocal]);

  useEffect(() => {
    if (isLocal) {
      const movePlayer = () => {
        const newPos = position.clone();
        if (forward) newPos.z -= 0.1;
        if (backward) newPos.z += 0.1;
        if (left) newPos.x -= 0.1;
        if (right) newPos.x += 0.1;

        setPosition(newPos);

        // Send position update to server
        socket.send(JSON.stringify({ playerId, x: newPos.x, y: newPos.y, z: newPos.z }));
      };

      const interval = setInterval(movePlayer, 100);
      return () => clearInterval(interval);
    }
  }, [forward, backward, left, right, position, isLocal]);

  return (
    <Box ref={meshRef} args={[1, 2, 1]} position={position.toArray()} castShadow>
      <meshStandardMaterial color={isLocal ? "hotpink" : "blue"} />
    </Box>
  );
}

export default function Players() {
  return (
    <>
      <Player playerId="A" isLocal={true} /> {/* Local player */}
      <Player playerId="B" isLocal={false} /> {/* Remote player */}
    </>
  );
}