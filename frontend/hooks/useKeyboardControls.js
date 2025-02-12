"use client"

import { useEffect, useState, useCallback } from "react"
import { useWebSocket } from "./WebSocketProvider"

export function useKeyboardControls(playerId) {
  const [movement, setMovement] = useState({ forward: false, backward: false, left: false, right: false })
  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const socket = useWebSocket()

  const sendMovement = useCallback(
    (newMovement) => {
      if (socket) {
        socket.send(JSON.stringify({ type: "playerMovement", playerId, movement: newMovement }))
      }
    },
    [socket, playerId],
  )

  useEffect(() => {
    const handleKeyDown = (event) => {
      setMovement((prev) => {
        const newMovement = { ...prev }
        switch (event.code) {
          case "KeyW":
            newMovement.forward = true
            break
          case "KeyS":
            newMovement.backward = true
            break
          case "KeyA":
            newMovement.left = true
            break
          case "KeyD":
            newMovement.right = true
            break
          default:
            return prev
        }
        sendMovement(newMovement)
        return newMovement
      })
    }

    const handleKeyUp = (event) => {
      setMovement((prev) => {
        const newMovement = { ...prev }
        switch (event.code) {
          case "KeyW":
            newMovement.forward = false
            break
          case "KeyS":
            newMovement.backward = false
            break
          case "KeyA":
            newMovement.left = false
            break
          case "KeyD":
            newMovement.right = false
            break
          default:
            return prev
        }
        sendMovement(newMovement)
        return newMovement
      })
    }

    const handleMouseMove = (event) => {
      if (document.pointerLockElement) {
        setRotation((prev) => {
          const newRotation = {
            x: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.x - event.movementY * 0.002)),
            y: prev.y - event.movementX * 0.002,
          }
          if (socket) {
            socket.send(JSON.stringify({ type: "playerRotation", playerId, rotation: newRotation }))
          }
          return newRotation
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [socket, playerId, sendMovement])

  return { movement, rotation }
}

