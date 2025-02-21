import { useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useRef } from "react";

export function Character({ position, rotation, isMoving, isLocal }) {
  const group = useRef();

  const { scene, animations } = useGLTF(
    "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
  );
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (!animations || !actions) return;

    // Apply colors to players
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        // Local player is red, remote player is blue
        child.material.color.setHex(isLocal ? 0xff0000 : 0x0000ff);
      }
    });

    Object.values(actions).forEach((action) => action.stop());

    try {
      if (isMoving) {
        const runAction = actions["Running"] || actions["Walk"];
        if (runAction) {
          runAction.reset().fadeIn(0.2).play();
        }
      } else {
        const idleAction = actions["Idle"] || actions["idle"];
        if (idleAction) {
          idleAction.reset().fadeIn(0.2).play();
        }
      }
    } catch (error) {
      console.error("Animation error:", error);
    }
  }, [actions, isMoving, animations, isLocal, scene]);

  if (!scene) return null;

  return (
    <group ref={group} position={position} rotation={rotation}>
      <primitive object={scene} scale={[0.5, 0.5, 0.5]} />
    </group>
  );
}

useGLTF.preload(
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
);