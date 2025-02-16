//frontend/components/Game.js
"use client"

import { Physics } from "@react-three/cannon"
import { Box, PerspectiveCamera, Sky, Sphere } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, useState } from "react"
import { Euler, Vector3 } from "three"
import { useKeyboardControls } from "../hooks/useKeyboardControls"
import { useWebSocket } from "../hooks/WebSocketProvider"
import Block, { BLOCK_POSITIONS } from "./map/Block"
import { checkBoundary, Ground } from "./map/Ground"
import { Tree } from "./map/Tree"

function Player({ isLocal, playerId, initialPosition }) {
  const meshRef = useRef()
  const bulletRef = useRef()
  const { camera, gl } = useThree()
  const movement = useKeyboardControls(playerId)
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
  const socket = useWebSocket()

  // Use refs for position tracking to prevent re-renders
  const targetPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const currentPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const lastUpdateTime = useRef(Date.now())

  const [bulletPosition, setBulletPosition] = useState(new Vector3(0, -10, 0))
  const [isShooting, setIsShooting] = useState(false)

  useEffect(() => {
    if (isLocal) {
      const handleMouseMove = (event) => {
        const sensitivity = 0.002
        setRotation((prev) => ({
          yaw: prev.yaw - event.movementX * sensitivity,
          pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.pitch - event.movementY * sensitivity)),
        }))
      }

      gl.domElement.requestPointerLock = gl.domElement.requestPointerLock || gl.domElement.mozRequestPointerLock
      gl.domElement.exitPointerLock = gl.domElement.exitPointerLock || gl.domElement.mozExitPointerLock

      const handleClick = () => {
        gl.domElement.requestPointerLock()
      }

      gl.domElement.addEventListener("click", handleClick)
      document.addEventListener("mousemove", handleMouseMove)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        gl.domElement.removeEventListener("click", handleClick)
      }
    }
  }, [gl, isLocal])

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isLocal) {
      // Local player movement logic
      const speed = 5
      const direction = new Vector3()

      if (movement.movement.forward) direction.z -= 1
      if (movement.movement.backward) direction.z += 1
      if (movement.movement.left) direction.x -= 1
      if (movement.movement.right) direction.x += 1

      if (direction.length() > 0) {
        direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0))
        direction.multiplyScalar(speed * delta)

        const newPosition = meshRef.current.position.clone().add(direction)
        const constrainedPosition = checkBoundary(newPosition.x, newPosition.z)
        meshRef.current.position.set(constrainedPosition.x, meshRef.current.position.y, constrainedPosition.z)
      }

      // Update player rotation
      meshRef.current.rotation.set(0, rotation.yaw, 0)

      // PUBG-style third-person camera setup
      const cameraDistance = 5    // Distance from player
      const cameraHeight = 2      // Height above player
      const lookAheadDistance = 5 // How far ahead to look

      // Position camera behind and above player
      const cameraOffset = new Vector3(
        Math.sin(rotation.yaw) * cameraDistance,
        cameraHeight,
        Math.cos(-rotation.yaw) * cameraDistance
      )

      // Add camera offset to player position
      camera.position.copy(meshRef.current.position).add(cameraOffset)

      // Look at point slightly above player
      const lookAtPoint = meshRef.current.position.clone().add(new Vector3(0, 1, 0))
      camera.lookAt(lookAtPoint)

      // Send updates to server
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "playerMovement",
          playerId,
          position: meshRef.current.position.toArray(),
          playerMovement: movement,
          rotation: rotation,
        }))
      }
    } else {
      // Remote player movement with interpolation
      const INTERPOLATION_FACTOR = 0.2
      if (targetPosition.current) {
        currentPosition.current.lerp(targetPosition.current, INTERPOLATION_FACTOR)
        meshRef.current.position.copy(currentPosition.current)
      }
    }

    // Update rotation for both local and remote players
    meshRef.current.rotation.set(0, rotation.yaw, 0)
  })

  // Update target position for remote players
  useEffect(() => {
    if (!isLocal && initialPosition) {
      targetPosition.current = new Vector3(...initialPosition)
    }
  }, [initialPosition, isLocal])

  const handleShoot = () => {
    if (isLocal && !isShooting && meshRef.current) {
      setIsShooting(true)
      setBulletPosition(meshRef.current.position.clone().add(new Vector3(0, 1, 0)))
    }
  }

  useEffect(() => {
    if (isLocal) {
      const handleMouseDown = () => handleShoot()
      window.addEventListener("mousedown", handleMouseDown)
      return () => window.removeEventListener("mousedown", handleMouseDown)
    }
  }, [isLocal, handleShoot]) // Added handleShoot to dependencies

  return (
    <>
      <Box ref={meshRef} args={[1, 2, 1]} position={currentPosition.current} castShadow>
        <meshStandardMaterial color={isLocal ? "hotpink" : "blue"} />
      </Box>
      {isLocal && (
        <Sphere ref={bulletRef} args={[0.1, 16, 16]} position={bulletPosition}>
          <meshStandardMaterial color="yellow" />
        </Sphere>
      )}
    </>
  )
}

function Scene({ players }) {
  return (
    <>
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
          />
        ))}
        <Ground />
        {BLOCK_POSITIONS.map((position, index) => (
          <Block key={index} position={position} />
        ))}
        <Tree position={[-5, 0, -5]} />
        <Tree position={[10, 0, -3]} />
      </Physics>
      <Sky sunPosition={[100, 20, 100]} />
    </>
  )
}

export default function Game() {
  const [players, setPlayers] = useState([])
  const socket = useWebSocket()
  const localPlayerId = useRef(Math.random().toString(36).substr(2, 9))

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received from server:", message);

      if (message.type === "init") {
        // Update the local player ID with the one assigned by the server
        localPlayerId.current = message.playerId;
        console.log("Local player ID updated:", localPlayerId.current);
      } else if (message.type === "playerList") {
        setPlayers((prevPlayers) => {
          console.log("Previous players:", prevPlayers);  // Shows previous players state before updating
          const updatedPlayers = message.players.map((player) => ({
            id: player,
            isLocal: player === localPlayerId.current,
          }));
          console.log("Updated players:", updatedPlayers); // Shows updated players state
          return updatedPlayers;
        });
      } else if (message.type === "playerUpdate") {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === message.playerId
              ? { ...player, position: message.position, rotation: message.rotation }
              : player,
          ),
        );
      }
    };

    socket.addEventListener("message", handleMessage);

    socket.addEventListener("open", () => {
      console.log("WebSocket connection established.");
      socket.send(JSON.stringify({ type: "init", playerId: localPlayerId.current }));
    });

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("open", () => { });
    };
  }, [socket]);  // Make sure to add socket in the dependency array

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene players={players} />
      </Canvas>
    </div>
  )
}

