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
    const handleKeyDown = (event) => {
      switch (event.code) {
        case 'KeyW':
          setMovement((m) => ({ ...m, forward: true }))
          break
        case 'KeyS':
          setMovement((m) => ({ ...m, backward: true }))
          break
        case 'KeyA':
          setMovement((m) => ({ ...m, left: true }))
          break
        case 'KeyD':
          setMovement((m) => ({ ...m, right: true }))
          break
      }
    }

    const handleKeyUp = (event) => {
      switch (event.code) {
        case 'KeyW':
          setMovement((m) => ({ ...m, forward: false }))
          break
        case 'KeyS':
          setMovement((m) => ({ ...m, backward: false }))
          break
        case 'KeyA':
          setMovement((m) => ({ ...m, left: false }))
          break
        case 'KeyD':
          setMovement((m) => ({ ...m, right: false }))
          break
      }
    }

    const handleMouseMove = (event) => {
      if (document.pointerLockElement) {
        setRotation((r) => ({
          x: r.x - event.movementY * 0.002,
          y: r.y - event.movementX * 0.002,
        }))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  useEffect(() => {
    camera.rotation.x = rotation.x
    camera.rotation.y = rotation.y
  }, [rotation, camera])

  return movement
}

