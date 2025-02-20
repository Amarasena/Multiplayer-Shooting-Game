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
import { useCallback } from "react"

function Player({ isLocal, playerId, initialPosition, initialRotation, players, setPlayers }) {
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

  const [canShoot, setCanShoot] = useState(true)
  const SHOOT_COOLDOWN = 250 // milliseconds between shots

  const handleShooting = useCallback(() => {
    if (!isLocal || !meshRef.current || !canShoot || socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    setCanShoot(false);

    const bulletSpeed = 50;
    const bulletDirection = new Vector3(0, 0, -1)
      .applyEuler(new Euler(0, rotation.yaw, 0))
      .normalize();

    const bulletPosition = meshRef.current.position.clone()
      .add(new Vector3(0, 1.2, 0));

    bulletDirection.y -= 0.05;

    const newBullet = {
      id: `${playerId}-${Date.now()}`, // More unique ID
      position: bulletPosition.toArray(),
      direction: bulletDirection.toArray(),
      speed: bulletSpeed,
      playerId,
      timestamp: Date.now()
    };

    // Update local bullets immediately
    setBullets(prev => [...prev, newBullet]);

    // Send to server
    socket.send(JSON.stringify({
      type: "playerShoot",
      playerId,
      bulletData: newBullet,
      position: meshRef.current.position.toArray(),
      rotation
    }));

    // Clean up after 2 seconds
    setTimeout(() => {
      setBullets(prev => prev.filter(b => b.id !== newBullet.id));
    }, 2000);

    // Reset cooldown
    setTimeout(() => {
      setCanShoot(true);
    }, SHOOT_COOLDOWN);
  }, [isLocal, canShoot, socket, playerId, rotation, meshRef]);

  // Update shooting effect hook
  useEffect(() => {
    if (isShooting && canShoot && isLocal) {
      handleShooting();
    }
  }, [isShooting, canShoot, isLocal, handleShooting]);


  // Update the shooting effect hook
  useEffect(() => {
    if (isShooting && canShoot) {
      handleShooting()
    }
  }, [isShooting, canShoot]) // Add canShoot to dependencies



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

    const allBullets = [
      ...bullets,
      ...(players.find(p => p.id === playerId)?.bullets || [])
    ];

    // Update all bullets positions (both local and remote)
    const updatedBullets = allBullets.map(bullet => {
      if (!bullet?.position || !bullet?.direction) return null;

      // Convert array position and direction to Vector3
      const bulletPos = Array.isArray(bullet.position)
        ? new Vector3(...bullet.position)
        : new Vector3(bullet.position[0], bullet.position[1], bullet.position[2]);

      const bulletDir = Array.isArray(bullet.direction)
        ? new Vector3(...bullet.direction)
        : new Vector3(bullet.direction[0], bullet.direction[1], bullet.direction[2]);

      // Calculate new position using initial direction
      const newPosition = bulletPos.clone().add(
        bulletDir.normalize().multiplyScalar(bullet.speed * delta)
      );

      // Check collisions with other players
      for (const player of players) {
        if (player.id !== bullet.playerId) {
          const playerPos = new Vector3(...player.position);
          if (newPosition.distanceTo(playerPos) < 1) {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: "playerHit",
                shooterId: bullet.playerId,
                targetId: player.id
              }));
            }
            return null;
          }
        }
      }

      return {
        ...bullet,
        position: newPosition.toArray()
      };
    }).filter(Boolean);

    if (isLocal) {

      setBullets(updatedBullets.filter(b => b.playerId === playerId));

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
          if (!bullet?.position || !bullet?.direction) return null;

          // Convert array position and direction to Vector3
          const bulletPos = Array.isArray(bullet.position)
            ? new Vector3(...bullet.position)
            : new Vector3(bullet.position[0], bullet.position[1], bullet.position[2]);

          const bulletDir = Array.isArray(bullet.direction)
            ? new Vector3(...bullet.direction)
            : new Vector3(bullet.direction[0], bullet.direction[1], bullet.direction[2]);

          // Calculate new position using initial direction
          const newPosition = bulletPos.clone().add(
            bulletDir.normalize().multiplyScalar(bullet.speed * delta)
          );

          // Check collisions with other players
          for (const player of players) {
            if (player.id !== bullet.playerId) {
              const playerPos = new Vector3(...player.position);
              if (newPosition.distanceTo(playerPos) < 1) {
                if (socket?.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: "playerHit",
                    shooterId: bullet.playerId,
                    targetId: player.id
                  }));
                }
                return null;
              }
            }
          }

          return {
            ...bullet,
            position: newPosition.toArray()
          };
        }).filter(Boolean)
      );

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

      setPlayers(prev =>
        prev.map(p =>
          p.id === playerId
            ? {
              ...p,
              bullets: updatedBullets.filter(b => b.playerId === playerId)
            }
            : p
        )
      );

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
      {[...bullets, ...(players.find(p => p.id === playerId)?.bullets || [])].map(bullet => {
        if (!bullet?.position) return null

        const bulletPosition = Array.isArray(bullet.position)
          ? bullet.position
          : [bullet.position.x, bullet.position.y, bullet.position.z]

        return (
          <mesh
            key={bullet.id}
            position={bulletPosition}
          >
            <sphereGeometry args={[0.1]} />
            <meshStandardMaterial color="yellow" emissive="orange" />
          </mesh>
        )
      })}


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
    if (!socket) return;

    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
        console.log("Received from server:", message);
      } catch (error) {
        console.error("Failed to parse message:", error);
        return;
      }

      if (!message || !message.type) {
        console.error("Invalid message format:", message);
        return;
      }

      switch (message.type) {
        case "init":
          if (message.playerId) {
            localPlayerId.current = message.playerId;
            console.log("Local player ID updated:", localPlayerId.current);
          }
          break;

        case "playerList":
          if (Array.isArray(message.players)) {
            setPlayers(prevPlayers => {
              const updatedPlayers = message.players.map(player => ({
                id: player,
                isLocal: player === localPlayerId.current,
                rotation: { yaw: 0, pitch: 0 },
                position: [0, 0, 0],
                isShooting: false,
                bullets: []
              }));
              return updatedPlayers;
            });
          }
          break;

        case "playerUpdate":
        case "playerMovement":
          if (message.playerId) {
            setPlayers(prevPlayers =>
              prevPlayers.map(player => {
                if (player.id !== message.playerId) return player;

                return {
                  ...player,
                  position: message.position || player.position,
                  rotation: message.rotation || player.rotation
                };
              })
            );
          }
          break;

        case "playerShoot":
          if (message.playerId && message.bulletData) {
            const bulletData = message.bulletData;

            setPlayers(prevPlayers =>
              prevPlayers.map(player => {
                if (player.id !== message.playerId) return player;

                // Filter out any existing bullets with the same ID
                const existingBullets = player.bullets?.filter(b => b.id !== bulletData.id) || [];

                const newBullet = {
                  ...bulletData,
                  timestamp: Date.now()
                };

                // Remove bullet after 2 seconds
                setTimeout(() => {
                  setPlayers(prev =>
                    prev.map(p =>
                      p.id === player.id
                        ? {
                          ...p,
                          bullets: (p.bullets || []).filter(b => b.id !== newBullet.id)
                        }
                        : p
                    )
                  );
                }, 2000);

                return {
                  ...player,
                  isShooting: true,
                  position: message.position || player.position,
                  rotation: message.rotation || player.rotation,
                  bullets: [...existingBullets, newBullet]
                };
              })
            );

            // Reset shooting state after short delay
            setTimeout(() => {
              setPlayers(prev =>
                prev.map(player =>
                  player.id === message.playerId
                    ? { ...player, isShooting: false }
                    : player
                )
              );
            }, 100);
          }
          break;

        default:
          console.log("Unknown message type:", message.type);
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
  }, [socket]);

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene players={players} setPlayers={setPlayers} />
      </Canvas>
    </div>
  )
}

