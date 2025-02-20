import { Cone, Cylinder } from "@react-three/drei";
import { useRef, useEffect } from "react";
import { Box3, Vector3 } from "three";

export function Tree({ position }) {
  const treeRef = useRef();

  useEffect(() => {
    if (treeRef.current) {
      const box = new Box3().setFromObject(treeRef.current);
      treeRef.current.userData.boundingBox = box;
    }
  }, []);

  return (
    <group ref={treeRef} position={position}>
      <Cylinder
        args={[0.2, 0.2, 1, 8]}
        position={[0, 0.5, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="saddlebrown" />
      </Cylinder>
      <Cone args={[1, 2, 8]} position={[0, 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="forestgreen" />
      </Cone>
    </group>
  );
}