import { useBox } from "@react-three/cannon";
import { Box } from "@react-three/drei";

const Block = ({ position }) => {
  const [ref] = useBox(() => ({
    type: "Static",
    position,
    args: [4, 2, 4],
  }));

  return (
    <Box ref={ref} args={[4, 2, 4]} position={position} castShadow>
      <meshStandardMaterial color="#D3D3D3" />
    </Box>
  );
};

export const BLOCK_POSITIONS = [
  // [-20, 0, -20], // Left back corner
  // [20, 0, 20], // Right front corner
  [0, 0, 0], // Center
  // [-20, 0, 20], // Left front corner
  // [20, 0, -20], // Right back corner
  [0, 0, -15], // Center back
  [0, 0, 15], // Center front
  [-15, 0, 3.5], // Center left
  [15, 0, 3.5], // Center right
];

export default Block;
