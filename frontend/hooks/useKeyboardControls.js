"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { useWebSocket } from "./WebSocketProvider"

export function useKeyboardControls(playerId, currentPosition, isLocal) {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  })
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
  const socket = useWebSocket()
  const movementRef = useRef(movement)
  const rotationRef = useRef(rotation)
  const updateIntervalRef = useRef(null)
  const [isShooting, setIsShooting] = useState(false)
  const isShootingRef = useRef(false)
  const shootingCooldownRef = useRef(false)

  // Update refs when state changes
  useEffect(() => {
    movementRef.current = movement
  }, [movement])

  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  const handleShoot = useCallback(() => {
    if (!shootingCooldownRef.current && socket?.readyState === WebSocket.OPEN) {
      setIsShooting(true)

      // Send shoot event
      socket.send(
        JSON.stringify({
          type: "playerShoot",
          playerId,
          position: currentPosition,
          rotation: rotationRef.current
        })
      )

      // Set cooldown
      shootingCooldownRef.current = true
      setTimeout(() => {
        shootingCooldownRef.current = false
        setIsShooting(false)
      }, 500) // 500ms cooldown between shots
    }
  }, [socket, playerId, currentPosition])

  // Mouse click handler for shooting
  useEffect(() => {
    if (!isLocal) return

    const handleMouseDown = (event) => {
      if (event.button === 0 && document.pointerLockElement) {
        handleShoot()
      }
    }

    window.addEventListener("mousedown", handleMouseDown)
    return () => window.removeEventListener("mousedown", handleMouseDown)
  }, [handleShoot, isLocal])


  // Mouse click handler for shooting
  useEffect(() => {
    if (!isLocal) return; // Only add click handler for local player

    const handleMouseDown = (event) => {
      if (event.button === 0 && document.pointerLockElement) { // Left click and pointer is locked
        handleShoot()
      }
    }

    window.addEventListener("mousedown", handleMouseDown)
    return () => window.removeEventListener("mousedown", handleMouseDown)
  }, [handleShoot, isLocal])

  // Continuous update interval
  useEffect(() => {
    if (!updateIntervalRef.current) {
      updateIntervalRef.current = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "playerMovement",
              playerId,
              playerMovement: {
                movement: movementRef.current
              },
              rotation: rotationRef.current,
              position: currentPosition || [0, 0, 0],
              isShooting
            })
          )
        }
      }, 16)
    }

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
        updateIntervalRef.current = null
      }
    }
  }, [socket, playerId, currentPosition, isShooting])

  // Handle keyboard input
  useEffect(() => {
    const keysPressed = new Set()

    const handleKeyDown = (event) => {
      if (event.repeat) return
      keysPressed.add(event.code)

      setMovement(prev => {
        const newMovement = { ...prev }
        if (keysPressed.has('KeyW')) newMovement.forward = true
        if (keysPressed.has('KeyS')) newMovement.backward = true
        if (keysPressed.has('KeyA')) newMovement.left = true
        if (keysPressed.has('KeyD')) newMovement.right = true
        return newMovement
      })
    }

    const handleKeyUp = (event) => {
      keysPressed.delete(event.code)
      setMovement(prev => {
        const newMovement = { ...prev }
        if (!keysPressed.has('KeyW')) newMovement.forward = false
        if (!keysPressed.has('KeyS')) newMovement.backward = false
        if (!keysPressed.has('KeyA')) newMovement.left = false
        if (!keysPressed.has('KeyD')) newMovement.right = false
        return newMovement
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [socket]) // Add socket to dependencies

  // Handle mouse input
  useEffect(() => {
    const handleMouseMove = (event) => {
      if (document.pointerLockElement) {
        const sensitivity = 0.002
        setRotation(prev => {
          const newRotation = {
            yaw: prev.yaw - event.movementX * sensitivity,
            pitch: Math.max(
              -Math.PI / 2,
              Math.min(Math.PI / 2, prev.pitch - event.movementY * sensitivity)
            )
          }
          rotationRef.current = newRotation
          return newRotation
        })
      }
    }

    document.addEventListener("mousemove", handleMouseMove)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
    }
  }, [socket]) // Add socket to dependencies

  return {
    movement,
    rotation,
    setRotation,
    isShooting,
    handleShoot
  }
}