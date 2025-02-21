import { Box } from "@react-three/drei";

const FenceWall = ({ position, rotation }) => {
  return (
    <Box
      args={[0.9, 3, 50]}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#8B4513" roughness={0.5} />
    </Box>
  );
};

const Fence = () => {
  return (
    <>
      <FenceWall position={[-24.5, 0.5, 0]} rotation={[0, 0, 0]} />
      <FenceWall position={[24.5, 0.5, 0]} rotation={[0, 0, 0]} />
      <FenceWall position={[0, 0.5, -24.5]} rotation={[0, Math.PI / 2, 0]} />
      <FenceWall position={[0, 0.5, 24.5]} rotation={[0, Math.PI / 2, 0]} />
    </>
  );
};

export default Fence;