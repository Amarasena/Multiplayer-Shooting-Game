"use client"

import { useEffect, useState } from "react"
import { useThree } from "@react-three/fiber"

export function useKeyboardControls(playerId) {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  })

  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const { camera } = useThree()

  useEffect(() => {
    const socket = new WebSocket("ws://192.168.224.206:12345")

    socket.onopen = () => {
      console.log("Connected to the server")
      // Send player ID to server
      socket.send(JSON.stringify({ type: "init", playerId }))
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      console.log("Received from server:", message)

      // Handle messages for other players
      if (message.playerId !== playerId) {
        // Update remote player state (handled in Game.js)
      }
    }

    const handleKeyDown = (event) => {
      const newMovement = { ...movement }
      let shouldSend = false

      switch (event.code) {
        case "KeyW":
          newMovement.forward = true
          shouldSend = true
          break
        case "KeyS":
          newMovement.backward = true
          shouldSend = true
          break
        case "KeyA":
          newMovement.left = true
          shouldSend = true
          break
        case "KeyD":
          newMovement.right = true
          shouldSend = true
          break
      }

      if (shouldSend) {
        setMovement(newMovement)
        socket.send(JSON.stringify({ type: "keydown", key: event.code, playerId }))
      }
    }

    const handleKeyUp = (event) => {
      const newMovement = { ...movement }
      let shouldSend = false

      switch (event.code) {
        case "KeyW":
          newMovement.forward = false
          shouldSend = true
          break
        case "KeyS":
          newMovement.backward = false
          shouldSend = true
          break
        case "KeyA":
          newMovement.left = false
          shouldSend = true
          break
        case "KeyD":
          newMovement.right = false
          shouldSend = true
          break
      }

      if (shouldSend) {
        setMovement(newMovement)
        socket.send(JSON.stringify({ type: "keyup", key: event.code, playerId }))
      }
    }

    const handleMouseMove = (event) => {
      if (document.pointerLockElement) {
        const newRotation = {
          x: rotation.x - event.movementY * 0.002,
          y: rotation.y - event.movementX * 0.002,
        }

        setRotation(newRotation)
        socket.send(JSON.stringify({ type: "mouseMove", rotation: newRotation, playerId }))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("mousemove", handleMouseMove)
      socket.close()
    }
  }, [movement, rotation, playerId])

  useEffect(() => {
    camera.rotation.x = rotation.x
    camera.rotation.y = rotation.y
  }, [rotation])

  return movement
}

