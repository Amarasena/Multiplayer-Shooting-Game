"use client";

import { Physics } from "@react-three/cannon";
import { Box, PerspectiveCamera, Sky, Sphere } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Euler, Vector3 } from "three";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import Block, { BLOCK_POSITIONS } from "./map/Block";
import { checkBoundary, Ground } from "./map/Ground";
import { Tree } from "./map/Tree";

function Player() {
  const meshRef = useRef();
  const bulletRef = useRef(); // Fix: Initialize bulletRef

  const { camera, gl } = useThree();
  const { forward, backward, left, right, shooting } = useKeyboardControls();

  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 }); // Yaw and Pitch angles
  const [bulletPosition, setBulletPosition] = useState(new Vector3(0, -10, 0));
  const [isShooting, setIsShooting] = useState(false);

  // Mouse movement listener to update rotation

  useEffect(() => {
    const handleMouseMove = (event) => {
      const sensitivity = 0.002;
      setRotation((prev) => ({
        yaw: prev.yaw - event.movementX * sensitivity,
        pitch: Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, prev.pitch - event.movementY * sensitivity)
        ), // Clamp pitch to prevent flipping
      }));
    };

    gl.domElement.requestPointerLock =
      gl.domElement.requestPointerLock || gl.domElement.mozRequestPointerLock;
    gl.domElement.exitPointerLock =
      gl.domElement.exitPointerLock || gl.domElement.mozExitPointerLock;

    const handleClick = () => {
      gl.domElement.requestPointerLock();
    };

    gl.domElement.addEventListener("click", handleClick);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      gl.domElement.removeEventListener("click", handleClick);
    };
  }, [gl]);

  useFrame((state, delta) => {
    if (meshRef.current && camera) {
      const speed = 5;
      const direction = new Vector3();

      // Movement logic
      if (forward) direction.z -= 1;
      if (backward) direction.z += 1;
      if (left) direction.x -= 1;
      if (right) direction.x += 1;
      direction.normalize().applyEuler(new Euler(0, rotation.yaw, 0)); // Apply player yaw rotation
      direction.multiplyScalar(speed * delta);

      // Calculate new position
      const newPosition = meshRef.current.position.clone().add(direction);

      // Apply boundary constraints
      const constrainedPosition = checkBoundary(newPosition.x, newPosition.z);
      meshRef.current.position.set(
        constrainedPosition.x,
        meshRef.current.position.y,
        constrainedPosition.z
      );

      // Update player position
      meshRef.current.position.add(direction);

      // Update player's rotation
      meshRef.current.rotation.set(0, rotation.yaw, 0);

      // Update camera position and rotation
      const cameraOffset = new Vector3(0, 3, 5).applyEuler(
        new Euler(0, rotation.yaw, 0)
      );
      camera.position.copy(meshRef.current.position).add(cameraOffset);
      camera.lookAt(meshRef.current.position);

      // Shooting logic
      if (isShooting && bulletRef.current) {
        const bulletDirection = new Vector3(0, 0, -1).applyEuler(
          new Euler(0, rotation.yaw, 0)
        );
        bulletRef.current.position.add(
          bulletDirection.multiplyScalar(delta * 50)
        );

        // Reset bullet if too far
        if (
          bulletRef.current.position.distanceTo(meshRef.current.position) > 100
        ) {
          setIsShooting(false);
          setBulletPosition(new Vector3(0, -10, 0));
        }
      }
    }
  });

  useEffect(() => {
    if (shooting && !isShooting && meshRef.current) {
      setIsShooting(true);
      setBulletPosition(
        meshRef.current.position.clone().add(new Vector3(0, 1, 0))
      );
    }
  }, [shooting, isShooting]);

  return (
    <>
      <Box ref={meshRef} args={[1, 2, 1]} position={[0, 1, 0]} castShadow>
        <meshStandardMaterial color="hotpink" />
      </Box>
      <Sphere ref={bulletRef} args={[0.1, 16, 16]} position={bulletPosition}>
        <meshStandardMaterial color="yellow" />
      </Sphere>
    </>
  );
}

function Blocks() {
  return (
    <>
      {BLOCK_POSITIONS.map((position, index) => (
        <Block key={index} position={position} />
      ))}
    </>
  );
}

function GameGround() {
  return <Ground />;
}

function Trees() {
  return (
    <>
      <Tree position={[-5, 0, -5]} />
      <Tree position={[10, 0, -3]} />
      <Tree position={[-10, 0, -10]} />
    </>
  );
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
      <Physics>
        <Player />
        <GameGround />
        <Trees />
        <Blocks />
      </Physics>
      <Sky sunPosition={[100, 20, 100]} />
      <fog attach="fog" args={["#f0f0f0", 0, 100]} />
    </>
  );
}

export default function Game() {
  return (
    <div className="w-full h-screen">
      <Canvas shadows>
        <Scene />
      </Canvas>
    </div>
  );
}
