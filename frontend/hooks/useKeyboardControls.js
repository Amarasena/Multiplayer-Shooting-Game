"use client"

import { useEffect, useState, useCallback } from "react"
import { useWebSocket } from "./WebSocketProvider"

export function useKeyboardControls(playerId) {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  })
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
  const socket = useWebSocket()

  const sendMovement = useCallback(
    (newMovement) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify(
            {
              type: "playerMovement",
              playerId,
              movement: newMovement,
              playerMovement: movement,
              rotation: rotation,
            }
          )
        )
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

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [sendMovement])

  return { movement, rotation, setRotation }
}

