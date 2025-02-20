//frontend/components/Game.js
"use client"

import { Physics } from "@react-three/cannon"
import { Box, PerspectiveCamera, Sky } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, useState, useCallback } from "react"
import { Euler, Vector3 } from "three"
import { useKeyboardControls } from "../hooks/useKeyboardControls"
import { useWebSocket } from "../hooks/WebSocketProvider"
import Block, { BLOCK_POSITIONS } from "./map/Block"
import { checkBoundary, Ground } from "./map/Ground"
import { Tree } from "./map/Tree"

const SPAWN_POINTS = [
  [-8, 0, -8],  // Left back corner
  [8, 0, -8],   // Right back corner
  [-8, 0, 8],   // Left front corner
  [8, 0, 8],    // Right front corner
  [0, 0, -8],   // Middle back
  [0, 0, 8],    // Middle front
  [-8, 0, 0],   // Middle left
  [8, 0, 0],    // Middle right
];

// Bullet management utilities
const createBullet = (playerId, position, direction, speed = 50) => ({
  id: `${playerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  position: position.toArray(),
  direction: direction.toArray(),
  speed,
  playerId,
  timestamp: Date.now(),
})

const updateBulletPosition = (bullet, delta) => {
  const position = new Vector3(...bullet.position)
  const direction = new Vector3(...bullet.direction)
  return position.add(direction.multiplyScalar(bullet.speed * delta))
}

const checkBulletCollision = (bulletPosition, playerPosition) => {
  return bulletPosition.distanceTo(new Vector3(...playerPosition)) < 1
}

function Player({ isLocal, playerId, initialPosition, initialRotation, players, setPlayers }) {
  const meshRef = useRef()
  const { camera, gl } = useThree()
  const { movement, rotation, setRotation, isShooting } = useKeyboardControls(
    playerId,
    meshRef.current?.position?.toArray() || [0, 0, 0],
    isLocal,
  )
  const socket = useWebSocket()

  const targetPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const currentPosition = useRef(initialPosition ? new Vector3(...initialPosition) : new Vector3())
  const targetRotation = useRef(initialRotation || { yaw: 0, pitch: 0 })

  const [canShoot, setCanShoot] = useState(true)
  const SHOOT_COOLDOWN = 250

  // Consolidated shooting handler
  const handleShooting = useCallback(() => {
    if (!isLocal || !meshRef.current || !canShoot || socket?.readyState !== WebSocket.OPEN) return

    setCanShoot(false)

    const bulletDirection = new Vector3(0, 0, -1).applyEuler(new Euler(0, rotation.yaw, 0)).normalize()
    bulletDirection.y -= 0.05 // Add slight downward trajectory

    const bulletPosition = meshRef.current.position.clone().add(new Vector3(0, 1.2, 0))
    const newBullet = createBullet(playerId, bulletPosition, bulletDirection)

    // Update local player's bullets
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, bullets: [...(p.bullets || []), newBullet], isShooting: true } : p)),
    )

    // Send to server
    socket.send(
      JSON.stringify({
        type: "playerShoot",
        playerId,
        bulletData: newBullet,
        position: meshRef.current.position.toArray(),
        rotation,
      }),
    )

    // Reset shooting state and cooldown
    setTimeout(() => {
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, isShooting: false } : p)))
    }, 100)

    setTimeout(() => setCanShoot(true), SHOOT_COOLDOWN)

    // Clean up bullet after 2 seconds
    setTimeout(() => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, bullets: (p.bullets || []).filter((b) => b.id !== newBullet.id) } : p,
        ),
      )
    }, 2000)
  }, [isLocal, canShoot, socket, playerId, rotation, setPlayers])

  // Handle shooting trigger
  useEffect(() => {
    if (isShooting && canShoot && isLocal) {
      handleShooting()
    }
  }, [isShooting, canShoot, isLocal, handleShooting])

  // Mouse lock handling
  useEffect(() => {
    if (!isLocal) return

    const handleClick = () => gl.domElement.requestPointerLock()
    gl.domElement.addEventListener("click", handleClick)
    return () => gl.domElement.removeEventListener("click", handleClick)
  }, [gl, isLocal])

  // Main game loop
  useFrame((state, delta) => {
    if (!meshRef.current) return

    if (isLocal) {
      // Local player movement
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

      // Update camera
      const cameraOffset = new Vector3(Math.sin(rotation.yaw) * 5, 2, Math.cos(-rotation.yaw) * 5)
      camera.position.copy(meshRef.current.position).add(cameraOffset)
      camera.lookAt(meshRef.current.position.clone().add(new Vector3(0, 1, 0)))

      // Send position update
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "playerMovement",
            playerId,
            position: meshRef.current.position.toArray(),
            playerMovement: { movement },
            rotation: { yaw: rotation.yaw, pitch: rotation.pitch },
          }),
        )
      }
    } else {
      // Remote player interpolation
      const INTERPOLATION_FACTOR = 0.2
      if (targetPosition.current) {
        currentPosition.current.lerp(targetPosition.current, INTERPOLATION_FACTOR)
        meshRef.current.position.copy(currentPosition.current)
      }
      if (targetRotation.current) {
        rotation.yaw += (targetRotation.current.yaw - rotation.yaw) * INTERPOLATION_FACTOR
        meshRef.current.rotation.y = rotation.yaw
      }
    }

    // Update all bullets
    setPlayers((prev) =>
      prev.map((player) => {
        if (!player.bullets?.length) return player

        const updatedBullets = player.bullets
          .map((bullet) => {
            const newPosition = updateBulletPosition(bullet, delta)

            // Check collisions with other players
            const hasCollided = players.some(
              (target) => target.id !== bullet.playerId && checkBulletCollision(newPosition, target.position),
            )

            if (hasCollided) {
              if (socket?.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    type: "playerHit",
                    shooterId: bullet.playerId,
                    targetId: player.id,
                  }),
                )
              }
              return null
            }

            return {
              ...bullet,
              position: newPosition.toArray(),
            }
          })
          .filter(Boolean)

        return { ...player, bullets: updatedBullets }
      }),
    )
  })

  // Update remote player position/rotation
  useEffect(() => {
    if (!isLocal) {
      if (initialPosition) targetPosition.current = new Vector3(...initialPosition)
      if (initialRotation) targetRotation.current = initialRotation
    }
  }, [initialPosition, initialRotation, isLocal])

  return (
    <>
      <Box ref={meshRef} args={[1, 2, 1]} position={currentPosition.current} rotation={[0, rotation.yaw, 0]} castShadow>
        <meshStandardMaterial color={isLocal ? "hotpink" : "blue"} />
      </Box>

      {/* Render bullets */}
      {players
        .find((p) => p.id === playerId)
        ?.bullets?.map((bullet) => (
          <mesh key={bullet.id} position={bullet.position}>
            <sphereGeometry args={[0.1]} />
            <meshStandardMaterial color="yellow" emissive="orange" />
          </mesh>
        ))}

      {/* Muzzle flash */}
      {players.find((p) => p.id === playerId)?.isShooting && (
        <pointLight
          position={[currentPosition.current.x, currentPosition.current.y + 1, currentPosition.current.z]}
          color="yellow"
          intensity={2}
          distance={5}
        />
      )}
    </>
  )
}

function Scene({ players, setPlayers }) {
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
            setPlayers={setPlayers}
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
    if (!socket) return

    const handleMessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch (error) {
        console.error("Failed to parse message:", error)
        return
      }

      if (!message?.type) return

      switch (message.type) {
        case "init":
          if (message.playerId) {
            localPlayerId.current = message.playerId
          }
          break

        case "playerList":
          if (Array.isArray(message.players)) {
            setPlayers(
              message.players.map((player, index) => ({
                id: player,
                isLocal: player === localPlayerId.current,
                rotation: { yaw: 0, pitch: 0 },
                // Assign spawn point based on player index, wrap around if more players than spawn points
                position: SPAWN_POINTS[index % SPAWN_POINTS.length],
                isShooting: false,
                bullets: [],
              })),
            )
          }
          break;

        case "playerUpdate":
        case "playerMovement":
          if (message.playerId) {
            setPlayers((prev) =>
              prev.map((player) =>
                player.id === message.playerId
                  ? {
                    ...player,
                    position: message.position || player.position,
                    rotation: message.rotation || player.rotation,
                  }
                  : player,
              ),
            )
          }
          break

        case "playerShoot":
          if (message.playerId && message.bulletData) {
            setPlayers((prev) =>
              prev.map((player) =>
                player.id === message.playerId
                  ? {
                    ...player,
                    isShooting: true,
                    position: message.position || player.position,
                    rotation: message.rotation || player.rotation,
                    bullets: [
                      ...(player.bullets || []),
                      {
                        ...message.bulletData,
                        timestamp: Date.now(),
                      },
                    ],
                  }
                  : player,
              ),
            )

            // Reset shooting state after delay
            setTimeout(() => {
              setPlayers((prev) =>
                prev.map((player) => (player.id === message.playerId ? { ...player, isShooting: false } : player)),
              )
            }, 100)
          }
          break
      }
    }

    socket.addEventListener("message", handleMessage)
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "init", playerId: localPlayerId.current }))
    })

    return () => {
      socket.removeEventListener("message", handleMessage)
      socket.removeEventListener("open", () => { })
    }
  }, [socket])

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene players={players} setPlayers={setPlayers} />
      </Canvas>
    </div>
  )
}

