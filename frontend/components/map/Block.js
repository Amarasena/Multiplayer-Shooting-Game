import { useBox } from "@react-three/cannon"
import { Box } from "@react-three/drei"

// Define block positions for the map
export const BLOCK_POSITIONS = [
  [-4, 1, -4],  // Block 1
  [4, 1, -4],   // Block 2
  [-4, 1, 4],   // Block 3
  [4, 1, 4],    // Block 4
  [0, 1, 0],    // Center block
]

export default function Block({ position }) {
  const [ref] = useBox(() => ({
    type: "Static",
    position,
    args: [2, 2, 2],
    mass: 0,
  }))

  return (
    <Box ref={ref} position={position} args={[2, 2, 2]}>
      <meshStandardMaterial color="gray" />
    </Box>
  )
}