//frontend/components/Game.js
"use client"

import { Physics } from "@react-three/cannon"
import { Box, PerspectiveCamera, Sky, Sphere } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, useState } from "react"
import { Euler, Vector3, PointLight } from "three"
import { useKeyboardControls } from "../hooks/useKeyboardControls"
import { useWebSocket } from "../hooks/WebSocketProvider"
import Block, { BLOCK_POSITIONS } from "./map/Block"
import { checkBoundary, Ground } from "./map/Ground"
import { Tree } from "./map/Tree"

function Player({ isLocal, playerId, initialPosition, initialRotation, players }) {
  const meshRef = useRef()
  const position = meshRef.current?.position?.toArray() || [0, 0, 0]
  const { camera, gl } = useThree()
  const { movement, rotation, setRotation, isShooting, handleShoot } = useKeyboardControls(playerId, position, isLocal)
  const socket = useWebSocket()

  // Use refs for position tracking to prevent re-renders
  const targetPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const currentPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const targetRotation = useRef(initialRotation || { yaw: 0, pitch: 0 })

  const [bullets, setBullets] = useState([])

  const handleShooting = () => {
    if (isLocal && meshRef.current && socket?.readyState === WebSocket.OPEN) {
      const bulletSpeed = 50
      const bulletDirection = new Vector3(0, 0, -1)
        .applyEuler(new Euler(0, rotation.yaw, 0))
        .normalize()

      const bulletPosition = meshRef.current.position.clone()
        .add(new Vector3(0, 1, 0))

      const newBullet = {
        id: Date.now(),
        position: bulletPosition,
        direction: bulletDirection,
        speed: bulletSpeed,
        playerId // Add player ID to track who shot
      }

      // Add bullet locally
      setBullets(prev => [...prev, newBullet])

      // Send bullet data to server
      socket.send(JSON.stringify({
        type: "playerShoot",
        playerId,
        bulletData: newBullet,
        position: meshRef.current.position.toArray(),
        rotation: rotation
      }))

      // Remove bullet after 2 seconds
      setTimeout(() => {
        setBullets(prev => prev.filter(bullet => bullet.id !== newBullet.id))
      }, 2000)
    }
  }

  // Add bullet effect to shooting
  useEffect(() => {
    if (isShooting) {
      handleShooting()
    }
  }, [isShooting])



  // Add visual feedback for shooting
  useEffect(() => {
    if (isShooting && meshRef.current) {
      const muzzleFlash = new PointLight(0xffff00, 1, 10) // Changed THREE.PointLight to PointLight
      const flashPosition = new Vector3(0, 1, 0)
      muzzleFlash.position.copy(flashPosition)
      meshRef.current.add(muzzleFlash)

      setTimeout(() => {
        if (meshRef.current) {
          meshRef.current.remove(muzzleFlash)
        }
      }, 100)
    }
  }, [isShooting])

  useEffect(() => {
    if (isLocal) {

      gl.domElement.requestPointerLock = gl.domElement.requestPointerLock || gl.domElement.mozRequestPointerLock
      gl.domElement.exitPointerLock = gl.domElement.exitPointerLock || gl.domElement.mozExitPointerLock

      const handleClick = () => {
        gl.domElement.requestPointerLock()
      }

      gl.domElement.addEventListener("click", handleClick)

      return () => {
        gl.domElement.removeEventListener("click", handleClick)
      }
    }
  }, [gl, isLocal])

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isLocal) {

      meshRef.current.rotation.set(0, rotation.yaw, 0)

      // Local player movement logic
      const speed = 5
      const direction = new Vector3()

      if (movement.forward) direction.z -= 1
      if (movement.backward) direction.z += 1
      if (movement.left) direction.x -= 1
      if (movement.right) direction.x += 1

      if (direction.length() > 0) {
        direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0))
        direction.multiplyScalar(speed * delta)

        const newPosition = meshRef.current.position.clone().add(direction)
        const constrainedPosition = checkBoundary(newPosition.x, newPosition.z)
        meshRef.current.position.set(constrainedPosition.x, meshRef.current.position.y, constrainedPosition.z)
      }

      // Update player rotation
      meshRef.current.rotation.set(0, rotation.yaw, 0)

      // Update and check bullet collisions
  setBullets(prev =>
    prev.map(bullet => {
      const newPosition = bullet.position.clone().add(
        bullet.direction.clone().multiplyScalar(bullet.speed * delta)
      )

      // Check collisions with other players
      players.forEach(player => {
        if (player.id !== bullet.playerId) { // Don't collide with shooter
          const playerPos = new Vector3(...player.position)
          if (newPosition.distanceTo(playerPos) < 1) {
            // Hit detected! Send hit event to server
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: "playerHit",
                shooterId: bullet.playerId,
                targetId: player.id
              }))
            }
            return null // Remove bullet
          }
        }
      })

      return {
        ...bullet,
        position: newPosition
      }
    }).filter(Boolean) // Remove null entries (bullets that hit)
  )

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
          playerMovement: {
            movement: movement // Update this to access movement correctly
          },
          rotation: {  // Send rotation as a separate object
            yaw: rotation.yaw,
            pitch: rotation.pitch
          }
        }))
      }
    } else {
      // Remote player movement with interpolation
      const INTERPOLATION_FACTOR = 0.2
      if (targetPosition.current) {
        currentPosition.current.lerp(targetPosition.current, INTERPOLATION_FACTOR)
        meshRef.current.position.copy(currentPosition.current)
      }

      // Interpolate rotation for smooth movement
      if (targetRotation.current) {
        rotation.yaw = rotation.yaw + (targetRotation.current.yaw - rotation.yaw) * INTERPOLATION_FACTOR;
        rotation.pitch = rotation.pitch + (targetRotation.current.pitch - rotation.pitch) * INTERPOLATION_FACTOR;
        meshRef.current.rotation.set(0, rotation.yaw, 0);
      }
    }
  })

  // Update both position and rotation for remote players
  useEffect(() => {
    if (!isLocal) {
      if (initialPosition) {
        targetPosition.current = new Vector3(...initialPosition);
      }
      if (initialRotation) {
        targetRotation.current = initialRotation;
      }
    }
  }, [initialPosition, initialRotation, isLocal]);

  return (
    <>
      <Box
        ref={meshRef}
        args={[1, 2, 1]}
        position={[
          currentPosition.current.x,
          currentPosition.current.y,
          currentPosition.current.z
        ]}
        castShadow
      >
        <meshStandardMaterial color={isLocal ? "hotpink" : "blue"} />
      </Box>

      {/* Add bullet rendering */}
      {bullets.map(bullet => (
        <mesh
          key={bullet.id}
          position={[
            bullet.position.x,
            bullet.position.y,
            bullet.position.z
          ]}
        >
          <sphereGeometry args={[0.1]} />
          <meshStandardMaterial color="yellow" emissive="orange" />
        </mesh>
      ))}

      {/* Existing muzzle flash */}
      {isShooting && (
        <pointLight
          position={[
            currentPosition.current.x,
            currentPosition.current.y + 1,
            currentPosition.current.z
          ]}
          color="yellow"
          intensity={2}
          distance={5}
        />
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
            initialRotation={player.rotation}
            players={players}
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
            rotation: { yaw: 0, pitch: 0 }, // Add initial rotation
            position: [0, 0, 0] // Initial position
          }));
          console.log("Updated players:", updatedPlayers); // Shows updated players state
          return updatedPlayers;
        });
      } else if (message.type === "playerUpdate") {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === message.playerId
              ? {
                ...player,
                position: message.position,
                rotation: message.rotation || player.rotation, // Preserve existing rotation if not provided
              }
              : player,
          ),
        );
      } else if (message.type === "playerShoot") {
        setPlayers(prevPlayers =>
          prevPlayers.map(player =>
            player.id === message.playerId
              ? {
                ...player,
                isShooting: true,
                position: message.position,
                rotation: message.rotation
              }
              : player
          )
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

