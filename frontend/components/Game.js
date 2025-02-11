//frontend/components/Game.js
"use client"

import { Physics } from "@react-three/cannon"
import { Box, PerspectiveCamera, Sky, Sphere } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, useState } from "react"
import { Euler, Vector3 } from "three"
import { useKeyboardControls } from "../hooks/useKeyboardControls"
import Block, { BLOCK_POSITIONS } from "./map/Block"
import { checkBoundary, Ground } from "./map/Ground"
import { Tree } from "./map/Tree"

function LocalPlayer() {
  const meshRef = useRef()
  const bulletRef = useRef()
  const { camera, gl } = useThree()
  const { forward, backward, left, right, shooting } = useKeyboardControls()

  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
  const [bulletPosition, setBulletPosition] = useState(new Vector3(0, -10, 0))
  const [isShooting, setIsShooting] = useState(false)

  useEffect(() => {
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
  }, [gl])

  useFrame((state, delta) => {
    if (meshRef.current && camera) {
      const speed = 5
      const direction = new Vector3()

      if (forward) direction.z -= 1
      if (backward) direction.z += 1
      if (left) direction.x -= 1
      if (right) direction.x += 1
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
    }
  })

  useEffect(() => {
    if (shooting && !isShooting && meshRef.current) {
      setIsShooting(true)
      setBulletPosition(meshRef.current.position.clone().add(new Vector3(0, 1, 0)))
    }
  }, [shooting, isShooting])

  return (
    <>
      <Box ref={meshRef} args={[1, 2, 1]} position={[0, 1, 0]} castShadow>
        <meshStandardMaterial color="hotpink" />
      </Box>
      <Sphere ref={bulletRef} args={[0.1, 16, 16]} position={bulletPosition}>
        <meshStandardMaterial color="yellow" />
      </Sphere>
    </>
  )
}

function RemotePlayer({ position, rotation }) {
  return (
    <Box args={[1, 2, 1]} position={position} rotation={rotation} castShadow>
      <meshStandardMaterial color="blue" />
    </Box>
  )
}

function Blocks() {
  return (
    <>
      {BLOCK_POSITIONS.map((position, index) => (
        <Block key={index} position={position} />
      ))}
    </>
  )
}

function GameGround() {
  return <Ground />
}

function Trees() {
  return (
    <>
      <Tree position={[-5, 0, -5]} />
      <Tree position={[10, 0, -3]} />
      <Tree position={[-10, 0, -10]} />
    </>
  )
}

function Scene({ remotePlayerPosition, remotePlayerRotation }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 3, 5]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Physics>
        <LocalPlayer />
        <RemotePlayer position={remotePlayerPosition} rotation={remotePlayerRotation} />
        <GameGround />
        <Trees />
        <Blocks />
      </Physics>
      <Sky sunPosition={[100, 20, 100]} />
      <fog attach="fog" args={["#f0f0f0", 0, 100]} />
    </>
  )
}

export default function Game() {
  const [remotePlayerPosition, setRemotePlayerPosition] = useState([5, 1, 5])
  const [remotePlayerRotation, setRemotePlayerRotation] = useState([0, 0, 0])

  useEffect(() => {
    const socket = new WebSocket("ws://192.168.56.1:12345")

    socket.onopen = () => {
      console.log("Connected to the server")
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      console.log("Received from server:", message)

      if (message.type === "playerPosition") {
        setRemotePlayerPosition([message.x, message.y, message.z])
      }
      if (message.type === "playerRotation") {
        setRemotePlayerRotation([message.x, message.y, message.z])
      }
    }

    return () => {
      socket.close()
    }
  }, [])

  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene remotePlayerPosition={remotePlayerPosition} remotePlayerRotation={remotePlayerRotation} />
      </Canvas>
    </div>
  )
}

