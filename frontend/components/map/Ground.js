import { Plane } from "@react-three/drei";
import { BLOCK_POSITIONS } from "./Block";
import Fence from "./Fence";

const Ground = ({ position = [0, -1, 0] }) => {
  return (
    <>
      <Plane
        args={[50, 50]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={position}
        receiveShadow
      >
        <meshStandardMaterial color="#4caf50" roughness={1} />
      </Plane>
      <Fence />
    </>
  );
};

const checkBoundary = (x, z) => {
  // Check map boundaries
  const boundX = Math.min(Math.max(x, -23.4), 23.4);
  const boundZ = Math.min(Math.max(z, -23.4), 23.4);

  // Check block collisions
  for (const [blockX, _, blockZ] of BLOCK_POSITIONS) {
    if (Math.abs(x - blockX) < 2.5 && Math.abs(z - blockZ) < 2.5) {
      return {
        x: x > blockX ? x + 0.1 : x - 0.1,
        z: z > blockZ ? z + 0.1 : z - 0.1,
      };
    }
  }

  return { x: boundX, z: boundZ };
};

export { checkBoundary, Ground };
export default Ground;
