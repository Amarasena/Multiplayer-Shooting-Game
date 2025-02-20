import { useLoader } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useKeyboardControls } from "../hooks/useKeyboardControls";

// WebSocket connection
const socket = new WebSocket("ws://192.168.56.1:12345"); // Replace with your server's IP

function Player({ playerId, isLocal }) {
  const meshRef = useRef();
  const { forward, backward, left, right } = useKeyboardControls();
  const [position, setPosition] = useState(new Vector3(0, 1, 0));
  const { scene } = useLoader(GLTFLoader, "/models/character.gltf"); // Adjust the path as necessary

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
        socket.send(
          JSON.stringify({ playerId, x: newPos.x, y: newPos.y, z: newPos.z })
        );
      };

      const interval = setInterval(movePlayer, 100);
      return () => clearInterval(interval);
    }
  }, [forward, backward, left, right, position, isLocal]);

  return <primitive object={scene} position={position.toArray()} />;
}

export default function Players() {
  return (
    <>
      <Player playerId="A" isLocal={true} /> {/* Local player */}
      <Player playerId="B" isLocal={false} /> {/* Remote player */}
    </>
  );
}
