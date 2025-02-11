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

function Player({ isLocal, playerId, initialPosition, movement }) {
  const meshRef = useRef()
  const bulletRef = useRef()
  const { camera, gl } = useThree()
  const controls = useKeyboardControls(playerId)

  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
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
    if (meshRef.current) {
      if (isLocal) {
        const speed = 5
        const direction = new Vector3()

        if (controls.forward) direction.z -= 1
        if (controls.backward) direction.z += 1
        if (controls.left) direction.x -= 1
        if (controls.right) direction.x += 1
        direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0))
        direction.multiplyScalar(speed * delta)

        const newPosition = meshRef.current.position.clone().add(direction)
        const constrainedPosition = checkBoundary(newPosition.x, newPosition.z)
        meshRef.current.position.set(constrainedPosition.x, meshRef.current.position.y, constrainedPosition.z)

        meshRef.current.rotation.set(0, rotation.yaw, 0)

        const cameraOffset = new Vector3(0, 3, 5).applyEuler(new Euler(0, rotation.yaw, 0))
        camera.position.copy(meshRef.current.position).add(cameraOffset)
        camera.lookAt(meshRef.current.position)

        if (isShooting && bulletRef.current) {
          const bulletDirection = new Vector3(0, 0, -1).applyEuler(new Euler(0, rotation.yaw, 0))
          bulletRef.current.position.add(bulletDirection.multiplyScalar(delta * 50))

          if (bulletRef.current.position.distanceTo(meshRef.current.position) > 100) {
            setIsShooting(false)
            setBulletPosition(new Vector3(0, -10, 0))
          }
        }

        // Send player movement to the server
        sendPlayerMovement(meshRef.current.position)
      }
    }
  })

  useEffect(() => {
    if (isLocal && controls.shooting && !isShooting && meshRef.current) {
      setIsShooting(true)
      setBulletPosition(meshRef.current.position.clone().add(new Vector3(0, 1, 0)))
    }
  }, [controls, isShooting, isLocal])

  // Function to send player movement data to the server
  const sendPlayerMovement = (position) => {
    const movementData = {
      type: "playerMovement",
      playerId,
      movement: {
        position: position.toArray(),
        forward: controls.forward,
        backward: controls.backward,
        left: controls.left,
        right: controls.right,
      }
    }
    sendMessage(JSON.stringify(movementData))
  }

  return (
    <>
      <Box ref={meshRef} args={[1, 2, 1]} position={initialPosition} castShadow>
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
          <Player key={player.id} isLocal={player.isLocal} playerId={player.id} initialPosition={player.position} movement={player.movement} />
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
  );
}

export default function Game() {
  const [players, setPlayers] = useState([])
  const socket = useWebSocket()
  const localPlayerId = Math.random().toString(36).substr(2, 9)

  useEffect(() => {
    if (!socket) return

    const handleMessage = (event) => {
      const message = JSON.parse(event.data)
      console.log("Received from server:", message)

      if (message.type === "playerList") {
        setPlayers(
          message.players.map((player) => ({
            ...player,
            isLocal: player.id === localPlayerId,
          }))
        )
      } else if (message.type === "playerUpdate") {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === message.playerId ? { ...player, movement: message.movement } : player
          )
        )
      }
    }

    socket.addEventListener("message", handleMessage)

    // Ensure the WebSocket is actually open before sending messages
    socket.addEventListener("open", () => {
      console.log("WebSocket connection established.")
      socket.send(JSON.stringify({ type: "init", playerId: localPlayerId }))
    })

    return () => {
      socket.removeEventListener("message", handleMessage)
      socket.removeEventListener("open", () => {})
    }
  }, [socket])

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene players={players} />
      </Canvas>
    </div>
  )
}
