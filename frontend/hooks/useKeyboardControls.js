//frontend/hooks/useKeyboardControls.js
import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'

export function useKeyboardControls() {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  })

  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const { camera } = useThree()

  useEffect(() => {
    const socket = new WebSocket('ws://192.168.56.1:12345')

    socket.onopen = () => {
      console.log('Connected to the server')
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      console.log('Received from server:', message)

      // Example: Handling player positions from the server
      if (message.type === 'playerPosition') {
        camera.position.set(message.x, message.y, message.z)
      }
    }

    const handleKeyDown = (event) => {
      let newMovement = { ...movement }
      let shouldSend = false

      switch (event.code) {
        case 'KeyW':
          newMovement.forward = true
          shouldSend = true
          break
        case 'KeyS':
          newMovement.backward = true
          shouldSend = true
          break
        case 'KeyA':
          newMovement.left = true
          shouldSend = true
          break
        case 'KeyD':
          newMovement.right = true
          shouldSend = true
          break
      }

      if (shouldSend) {
        setMovement(newMovement)
        socket.send(JSON.stringify({ type: 'keydown', key: event.code }))
      }
    }

    const handleKeyUp = (event) => {
      let newMovement = { ...movement }
      let shouldSend = false

      switch (event.code) {
        case 'KeyW':
          newMovement.forward = false
          shouldSend = true
          break
        case 'KeyS':
          newMovement.backward = false
          shouldSend = true
          break
        case 'KeyA':
          newMovement.left = false
          shouldSend = true
          break
        case 'KeyD':
          newMovement.right = false
          shouldSend = true
          break
      }

      if (shouldSend) {
        setMovement(newMovement)
        socket.send(JSON.stringify({ type: 'keyup', key: event.code }))
      }
    }

    const handleMouseMove = (event) => {
      if (document.pointerLockElement) {
        const newRotation = {
          x: rotation.x - event.movementY * 0.002,
          y: rotation.y - event.movementX * 0.002,
        }

        setRotation(newRotation)
        socket.send(JSON.stringify({ type: 'mouseMove', rotation: newRotation }))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousemove', handleMouseMove)
      socket.close()
    }
  }, [movement, rotation, camera]) // Ensure dependencies are handled properly

  useEffect(() => {
    camera.rotation.x = rotation.x
    camera.rotation.y = rotation.y
  }, [rotation, camera])

  return movement
}
