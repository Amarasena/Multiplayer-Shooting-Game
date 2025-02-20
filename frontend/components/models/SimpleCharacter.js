import { Box } from "@react-three/drei";
import { useRef } from "react";

export function SimpleCharacter({ position, rotation, isMoving }) {
  const group = useRef();

  return (
    <group ref={group} position={position} rotation={rotation}>
      <Box args={[1, 2, 1]}>
        <meshStandardMaterial color={isMoving ? "#ff0000" : "#0000ff"} />
      </Box>
    </group>
  );
}