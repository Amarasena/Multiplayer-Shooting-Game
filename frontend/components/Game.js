'use client'

import React, { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Box, Plane, Sky, PerspectiveCamera, Sphere } from '@react-three/drei'
import { Vector3, Euler } from 'three'
import { useKeyboardControls } from '../hooks/useKeyboardControls'
import { Tree } from './Tree'

function Player() {
    const meshRef = useRef()
    const bulletRef = useRef() // Fix: Initialize bulletRef
    const { camera, gl } = useThree()
    const { forward, backward, left, right, shooting } = useKeyboardControls()

    const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 }) // Yaw and Pitch angles
    const [bulletPosition, setBulletPosition] = useState(new Vector3(0, -10, 0))
    const [isShooting, setIsShooting] = useState(false)

    // Mouse movement listener to update rotation
    useEffect(() => {
        const handleMouseMove = (event) => {
            const sensitivity = 0.002
            setRotation((prev) => ({
                yaw: prev.yaw - event.movementX * sensitivity,
                pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.pitch - event.movementY * sensitivity)) // Clamp pitch to prevent flipping
            }))
        }

        gl.domElement.requestPointerLock = gl.domElement.requestPointerLock || gl.domElement.mozRequestPointerLock
        gl.domElement.exitPointerLock = gl.domElement.exitPointerLock || gl.domElement.mozExitPointerLock

        const handleClick = () => {
            gl.domElement.requestPointerLock()
        }

        gl.domElement.addEventListener('click', handleClick)
        document.addEventListener('mousemove', handleMouseMove)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            gl.domElement.removeEventListener('click', handleClick)
        }
    }, [gl])

    useFrame((state, delta) => {
        if (meshRef.current && camera) {
            const speed = 5
            const direction = new Vector3()

            // Movement logic
            if (forward) direction.z -= 1
            if (backward) direction.z += 1
            if (left) direction.x -= 1
            if (right) direction.x += 1
            direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0)) // Apply player yaw rotation
            direction.multiplyScalar(speed * delta)

            // Update player position
            meshRef.current.position.add(direction)

            // Update player's rotation
            meshRef.current.rotation.set(0, rotation.yaw, 0)

            // Update camera position and rotation
            const cameraOffset = new Vector3(0, 3, 5).applyEuler(new Euler(0, rotation.yaw, 0))
            camera.position.copy(meshRef.current.position).add(cameraOffset)
            camera.lookAt(meshRef.current.position)

            // Shooting logic
            if (isShooting && bulletRef.current) {
                const bulletDirection = new Vector3(0, 0, -1).applyEuler(new Euler(0, rotation.yaw, 0))
                bulletRef.current.position.add(bulletDirection.multiplyScalar(delta * 50))

                // Reset bullet if too far
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

function Ground() {
    return (
        <Plane args={[1000, 1000]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#4caf50" />
        </Plane>
    )
}

function Trees() {
    return (
        <>
            <Tree position={[-5, 0, -5]} />
            <Tree position={[5, 0, -7]} />
            <Tree position={[-7, 0, 3]} />
            <Tree position={[8, 0, 5]} />
            <Tree position={[2, 0, 8]} />
            <Tree position={[-3, 0, 10]} />
            <Tree position={[10, 0, -3]} />
            <Tree position={[-10, 0, -10]} />
        </>
    )
}

function Scene() {
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
            <Player />
            <Ground />
            <Trees />
            <Sky sunPosition={[100, 20, 100]} />
            <fog attach="fog" args={['#f0f0f0', 0, 100]} />
        </>
    )
}

export default function Game() {
    return (
        <div className="w-full h-screen">
            <Canvas shadows>
                <Scene />
            </Canvas>
        </div>
    )
}
