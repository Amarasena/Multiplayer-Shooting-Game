//frontend/components/Game.js
"use client"

import { Physics } from "@react-three/cannon"
import { Box, PerspectiveCamera, Sky, Html } from "@react-three/drei"
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
  // Convert positions to Vector3 if they aren't already
  const bulletPos = new Vector3(...bulletPosition)
  const playerPos = new Vector3(...playerPosition)

  // Use a collision box that matches the player model
  const playerHeight = 2
  const playerWidth = 1

  // Check if bullet is within the player's bounding box
  const dx = Math.abs(bulletPos.x - playerPos.x)
  const dy = Math.abs(bulletPos.y - (playerPos.y + playerHeight / 2)) // Account for player height
  const dz = Math.abs(bulletPos.z - playerPos.z)

  const isColliding = dx < playerWidth / 2 && dy < playerHeight / 2 && dz < playerWidth / 2

  if (isColliding) {
    console.log('Bullet collision detected:', {
      bulletPosition: bulletPos,
      playerPosition: playerPos,
      dx,
      dy,
      dz
    })
  }

  return isColliding
}


function Player({ isLocal, playerId, initialPosition, initialRotation, players, setPlayers, setGameState }) {
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

  const [isHit, setIsHit] = useState(false)

  const [isDying, setIsDying] = useState(false)
  const deathRotation = useRef(0)
  const fallSpeed = useRef(0)

  const currentPlayer = players.find(p => p.id === playerId)



  // Consolidated shooting handler
  const handleShooting = useCallback(() => {
    if (!isLocal || !meshRef.current || !canShoot || socket?.readyState !== WebSocket.OPEN) return

    setCanShoot(false)

    const bulletDirection = new Vector3(0, 0, -1).applyEuler(new Euler(0, rotation.yaw, 0)).normalize()
    bulletDirection.y -= 0.05 // Add slight downward trajectory

    const bulletPosition = meshRef.current.position.clone().add(new Vector3(0, 0.8, 0))
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

  useEffect(() => {
    if (isHit) {
      setTimeout(() => setIsHit(false), 100)
    }
  }, [isHit])

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

    // Handle death animation
    const player = players.find(p => p.id === playerId)
    
    if (player?.health <= 0) {
      // Rotate and fall
      deathRotation.current += delta * 5 // Rotation speed
      fallSpeed.current += delta * 9.8 // Gravity
  
      meshRef.current.position.y = Math.max(0, meshRef.current.position.y - fallSpeed.current * delta)
  
      // If local player died, update game state
      if (isLocal && !isDying) {
        setIsDying(true)
        setGameState('dead')
      }
  
      return // Skip regular movement updates when dead
    }

    if (isDying) {
      // Rotate and fall
      deathRotation.current += delta * 5 // Rotation speed
      fallSpeed.current += delta * 9.8 // Gravity

      meshRef.current.rotation.z = deathRotation.current
      meshRef.current.position.y = Math.max(0, meshRef.current.position.y - fallSpeed.current * delta)

      // Log death animation
      console.log('Death animation:', {
        playerId,
        rotation: deathRotation.current,
        height: meshRef.current.position.y,
        fallSpeed: fallSpeed.current
      })

      return // Skip regular movement updates when dying
    }

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
            const hitPlayer = players.find(
              (target) =>
                target.id !== bullet.playerId && // Don't hit self
                target.health > 0 && // Only hit alive players
                checkBulletCollision(newPosition, target.position)
            )

            if (hitPlayer) { // Changed from hasCollided to hitPlayer

              console.log('Hit player:', {
                shooter: bullet.playerId,
                target: hitPlayer.id,
                damage: 20,
                targetCurrentHealth: hitPlayer.health
              });

              if (socket?.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    type: "playerHit",
                    shooterId: bullet.playerId,
                    targetId: hitPlayer.id,
                    damage: 20,
                    position: newPosition.toArray() // Add hit position for effects
                  }),
                )
              }

              setPlayers(currentPlayers =>
                currentPlayers.map(p =>
                  p.id === hitPlayer.id
                    ? {
                      ...p,
                      health: Math.max(0, p.health - 20),
                      isHit: true
                    }
                    : p
                )
              )

              return null // Remove bullet after hit
            }

            // Check if bullet hit environment (optional)
            if (checkEnvironmentCollision(newPosition)) {
              return null
            }

            return {
              ...bullet,
              position: newPosition.toArray(),
            }
          })
          .filter(Boolean) // Remove null bullets (those that hit something)

        return { ...player, bullets: updatedBullets }
      }),
    )
  })

  const checkEnvironmentCollision = (position) => {
    // Check if bullet hits ground
    if (position.y < 0) return true

    // Check if bullet hits blocks
    return BLOCK_POSITIONS.some(blockPos => {
      const dx = Math.abs(position.x - blockPos[0])
      const dy = Math.abs(position.y - blockPos[1])
      const dz = Math.abs(position.z - blockPos[2])
      return dx < 1 && dy < 1 && dz < 1
    })
  }

  // Update remote player position/rotation
  useEffect(() => {
    if (!isLocal) {
      if (initialPosition) targetPosition.current = new Vector3(...initialPosition)
      if (initialRotation) targetRotation.current = initialRotation
    }
  }, [initialPosition, initialRotation, isLocal])

  return (
    <>
      <Box
        ref={meshRef}
        args={[1, 2, 1]}
        position={currentPosition.current}
        rotation={[0, rotation.yaw, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={isLocal ? "hotpink" : "blue"}
          emissive={isHit ? "#ff0000" : "#000000"}
          emissiveIntensity={isHit ? 0.5 : 0}
          opacity={currentPlayer?.health <= 0 ? 0.5 : 1}
          transparent={currentPlayer?.health <= 0}
          />

        {/* Floating health bar */}
        {!isLocal && (
          <Html
            position={[0, 2.5, 0]}
            center
            style={{
              width: '50px',
              transform: 'scale(1.5)',
            }}
          >
            <div className="health-bar">
              <div
                className="health-bar-fill"
                style={{
                  width: `${players.find(p => p.id === playerId)?.health || 0}%`,
                  backgroundColor: players.find(p => p.id === playerId)?.health > 20 ? '#ff0000' : '#ff6b6b'
                }}
              />
            </div>
          </Html>
        )}
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

function Scene({ players, setPlayers, gameState, setGameState }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 3, 5]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <Physics>
        {gameState === 'playing' && players.map((player) => {
          if (!player?.id) {
            console.warn('Player without valid ID:', player)
            return null
          }
          return (
            <Player
              key={player.id.toString()}
              isLocal={player.isLocal}
              playerId={player.id}
              initialPosition={player.position}
              initialRotation={player.rotation}
              players={players}
              setPlayers={setPlayers}
              setGameState={setGameState}
            />
          )
        })}
        <Ground />
        {BLOCK_POSITIONS.map((position, index) => (
          <Block key={`block-${index}`} position={position} />
        ))}
        <Tree position={[-5, 0, -5]} key="tree-1" />
        <Tree position={[10, 0, -3]} key="tree-2" />
      </Physics>
      <Sky sunPosition={[100, 20, 100]} />
    </>
  )
}

export default function Game() {
  const [players, setPlayers] = useState([])
  const [gameState, setGameState] = useState('waiting') // 'waiting', 'countdown', 'playing'
  const [countdown, setCountdown] = useState(5)
  const socket = useWebSocket()
  const localPlayerId = useRef(Math.random().toString(36).substr(2, 9))
  const localPlayerPosition = useRef(null)

  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1)
      }, 1000)

      if (countdown === 1) {
        setTimeout(() => {
          setGameState('playing')
        }, 1000)
      }

      return () => clearTimeout(timer)
    }
  }, [gameState, countdown])

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
            if (message.position) {
              localPlayerPosition.current = message.position
            }
          }
          break

        case "playerList":
          if (Array.isArray(message.players)) {
            setPlayers(
              message.players.map(player => ({
                id: typeof player === 'object' ? player.id : player, // Handle both object and string cases
                isLocal: (typeof player === 'object' ? player.id : player) === localPlayerId.current,
                rotation: { yaw: 0, pitch: 0 },
                position: typeof player === 'object' ? player.position : [0, 0, 0],
                isShooting: false,
                bullets: [],
                health: 100,
              }))
            )

            if (message.players.length >= 2 && gameState === 'waiting') {
              setGameState('countdown')
              setCountdown(5)
            }
          }
          break;

        case "playerHit":
          if (message.targetId) {
            setPlayers(prev =>
              prev.map(player =>
                player.id === message.targetId
                  ? { ...player, health: Math.max(0, player.health - 20) } // Decrease health by 20
                  : player
              )
            );
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

        case "playerHit":
          if (message.targetId) {
            setPlayers(prev =>
              prev.map(player =>
                player.id === message.targetId
                  ? {
                    ...player,
                    health: Math.max(0, player.health - (message.damage || 20)), // Default to 20 if damage not specified
                    isHit: true // Trigger hit effect
                  }
                  : player
              )
            )

            // Add death check
            const hitPlayer = players.find(p => p.id === message.targetId)
            if (hitPlayer && hitPlayer.health <= 20) { // Check if this hit would kill the player
              // Handle player death
              socket.send(JSON.stringify({
                type: "playerDeath",
                playerId: message.targetId,
                killerId: message.shooterId
              }))
            }
          }
          break;

        case "playerDeath":
          if (message.playerId) {
            setPlayers(prev =>
              prev.map(player =>
                player.id === message.playerId
                  ? {
                    ...player,
                    health: 0,
                    isDead: true
                  }
                  : player
              )
            )

            // If local player died, show death screen
            if (message.playerId === localPlayerId.current) {
              setGameState('dead')
            }
          }
          break;
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
    <div className="w-full h-screen relative">
      {/* Game state overlays */}
      {gameState === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-white text-center">
            <h1 className="text-4xl mb-4">Waiting for players...</h1>
            <p className="text-xl">Players connected: {players.length}/2</p>
          </div>
        </div>
      )}

      {gameState === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-white text-center">
            <h1 className="text-8xl mb-4">{countdown}</h1>
            <p className="text-2xl">Get ready!</p>
          </div>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="player-health-container">
          <span className="player-health-text">HP:</span>
          <div className="player-health-bar">
            <div
              className="player-health-fill"
              style={{
                width: `${players.find(p => p.isLocal)?.health || 0}%`,
                opacity: players.find(p => p.isLocal)?.health > 20 ? 1 : 0.7
              }}
            />
          </div>
          <span className="player-health-text">
            {players.find(p => p.isLocal)?.health || 0}
          </span>
        </div>
      )}

      {gameState === 'dead' && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50 z-10">
          <div className="text-white text-center">
            <h1 className="text-6xl mb-4">You Died!</h1>
            <p className="text-2xl">Press R to respawn</p>
          </div>
        </div>
      )}

      <Canvas shadows>
        <Scene
          players={players}
          setPlayers={setPlayers}
          gameState={gameState}
          setGameState={setGameState}
        />
      </Canvas>
    </div>
  )
}