import { Physics } from "@react-three/cannon";
import { PerspectiveCamera, Preload, Sky, Sphere } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Euler, Vector3 } from "three";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { useWebSocket } from "../hooks/WebSocketProvider";
import Block, { BLOCK_POSITIONS } from "./map/Block";
import { checkBoundary, Ground } from "./map/Ground";
import { Tree } from "./map/Tree";
import { Character } from "./Models/Character";

function Player({
  isLocal,
  playerId,
  initialPosition,
  trees,
  bullets,
  setBullets,
}) {
  const meshRef = useRef();
  const pistolRef = useRef();
  const { camera, gl } = useThree();
  const movement = useKeyboardControls(playerId);
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 });
  const socket = useWebSocket();
  const [isMoving, setIsMoving] = useState(false);

  const targetPosition = useRef(
    initialPosition ? new Vector3(...initialPosition) : new Vector3()
  );
  const currentPosition = useRef(
    initialPosition ? new Vector3(...initialPosition) : new Vector3()
  );
  const lastUpdateTime = useRef(Date.now());

  const checkCollisionWithTrees = (newPosition) => {
    for (const tree of trees) {
      const treeBox = tree.userData.boundingBox;
      if (treeBox && treeBox.containsPoint(newPosition)) {
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    if (isLocal) {
      const handleMouseMove = (event) => {
        const sensitivity = 0.002;
        setRotation((prev) => ({
          yaw: prev.yaw - event.movementX * sensitivity,
          pitch: Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, prev.pitch - event.movementY * sensitivity)
          ),
        }));
      };

      gl.domElement.requestPointerLock =
        gl.domElement.requestPointerLock || gl.domElement.mozRequestPointerLock;
      gl.domElement.exitPointerLock =
        gl.domElement.exitPointerLock || gl.domElement.mozExitPointerLock;

      const handleClick = () => {
        gl.domElement.requestPointerLock();
      };

      gl.domElement.addEventListener("click", handleClick);
      document.addEventListener("mousemove", handleMouseMove);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        gl.domElement.removeEventListener("click", handleClick);
      };
    }
  }, [gl, isLocal]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isLocal) {
      const speed = 5;
      const direction = new Vector3();

      if (movement.movement.forward) direction.z -= 1;
      if (movement.movement.backward) direction.z += 1;
      if (movement.movement.left) direction.x -= 1;
      if (movement.movement.right) direction.x += 1;

      // Update isMoving state
      setIsMoving(direction.length() > 0);

      if (direction.length() > 0) {
        direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0));
        direction.multiplyScalar(speed * delta);

        const newPosition = meshRef.current.position.clone().add(direction);
        const constrainedPosition = checkBoundary(newPosition.x, newPosition.z);

        // Check for collisions with trees
        if (
          !checkCollisionWithTrees(
            new Vector3(
              constrainedPosition.x,
              meshRef.current.position.y,
              constrainedPosition.z
            )
          )
        ) {
          meshRef.current.position.set(
            constrainedPosition.x,
            meshRef.current.position.y,
            constrainedPosition.z
          );
        }
      }

      const cameraDistance = 5;
      const cameraHeight = 2;

      const cameraOffset = new Vector3(
        Math.sin(rotation.yaw) * cameraDistance,
        cameraHeight,
        Math.cos(-rotation.yaw) * cameraDistance
      );

      camera.position.copy(meshRef.current.position).add(cameraOffset);

      const lookAtPoint = meshRef.current.position
        .clone()
        .add(new Vector3(0, 1, 0));
      camera.lookAt(lookAtPoint);

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "playerMovement",
            playerId,
            position: meshRef.current.position.toArray(),
            playerMovement: movement,
            rotation: rotation,
          })
        );
      }
    } else {
      const INTERPOLATION_FACTOR = 0.2;
      if (targetPosition.current) {
        currentPosition.current.lerp(
          targetPosition.current,
          INTERPOLATION_FACTOR
        );
        meshRef.current.position.copy(currentPosition.current);
      }
    }

    meshRef.current.rotation.set(0, rotation.yaw, 0);

    // Move bullets
    setBullets((prevBullets) =>
      prevBullets.map((bullet) => {
        const newBulletPosition = bullet.position
          .clone()
          .add(bullet.direction.clone().multiplyScalar(delta * 10));
        return { ...bullet, position: newBulletPosition };
      })
    );
  });

  useEffect(() => {
    if (!isLocal && initialPosition) {
      targetPosition.current = new Vector3(...initialPosition);
    }
  }, [initialPosition, isLocal]);

  const handleShoot = () => {
    if (isLocal && pistolRef.current) {
      const bulletDirection = new Vector3(0, 0, -1).applyEuler(
        new Euler(0, rotation.yaw, 0)
      );
      const bulletPosition = pistolRef.current.getWorldPosition(new Vector3());
      setBullets((prevBullets) => [
        ...prevBullets,
        { position: bulletPosition, direction: bulletDirection },
      ]);
    }
  };

  useEffect(() => {
    if (isLocal) {
      const handleMouseDown = () => handleShoot();
      window.addEventListener("mousedown", handleMouseDown);
      return () => window.removeEventListener("mousedown", handleMouseDown);
    }
  }, [isLocal]);

  return (
    <>
      <group ref={meshRef} position={currentPosition.current}>
        <Character
          position={[0, 0, 0]}
          rotation={[0, rotation.yaw, 0]}
          isMoving={isMoving}
          isLocal={isLocal}
        />
        <mesh ref={pistolRef} position={[0.5, 1, -0.5]}>
          <boxGeometry args={[0.2, 0.2, 0.5]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>
    </>
  );
}

function Scene({ players }) {
  const treeRefs = useRef([]);
  const [bullets, setBullets] = useState([]);

  return (
    <>
      <Preload all />
      <PerspectiveCamera makeDefault position={[0, 3, 5]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <Physics>
        {players.map((player) => (
          <Player
            key={player.id}
            isLocal={player.isLocal}
            playerId={player.id}
            initialPosition={player.position}
            trees={treeRefs.current}
            bullets={bullets}
            setBullets={setBullets}
          />
        ))}
        <Ground />
        {BLOCK_POSITIONS.map((position, index) => (
          <Block key={index} position={position} />
        ))}
        <Tree ref={(el) => (treeRefs.current[0] = el)} position={[-5, 0, -5]} />
        <Tree ref={(el) => (treeRefs.current[1] = el)} position={[10, 0, -3]} />
        {bullets.map((bullet, index) => (
          <Sphere key={index} args={[0.1, 16, 16]} position={bullet.position}>
            <meshStandardMaterial color="yellow" />
          </Sphere>
        ))}
      </Physics>
      <Sky sunPosition={[100, 20, 100]} />
    </>
  );
}

export default function Game() {
  const [players, setPlayers] = useState([]);
  const socket = useWebSocket();
  const localPlayerId = useRef(Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received from server:", message);

      if (message.type === "init") {
        localPlayerId.current = message.playerId;
        console.log("Local player ID updated:", localPlayerId.current);
      } else if (message.type === "playerList") {
        setPlayers((prevPlayers) => {
          const updatedPlayers = message.players.map((player) => ({
            id: player,
            isLocal: player === localPlayerId.current,
          }));
          return updatedPlayers;
        });
      } else if (message.type === "playerUpdate") {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === message.playerId
              ? {
                  ...player,
                  position: message.position,
                  rotation: message.rotation,
                }
              : player
          )
        );
      }
    };

    socket.addEventListener("message", handleMessage);

    socket.addEventListener("open", () => {
      console.log("WebSocket connection established.");
      socket.send(
        JSON.stringify({ type: "init", playerId: localPlayerId.current })
      );
    });

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("open", () => {});
    };
  }, [socket]);

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene players={players} />
      </Canvas>
    </div>
  );
}
