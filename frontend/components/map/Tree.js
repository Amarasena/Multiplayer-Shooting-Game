import { useCylinder } from "@react-three/cannon"

export function Tree({ position }) {
  const [ref] = useCylinder(() => ({
    type: "Static",
    position,
    args: [0.5, 0.5, 3],
  }))

  return (
    <group position={position}>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.5, 0.5, 3]} />
        <meshStandardMaterial color="brown" />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <coneGeometry args={[1.5, 3]} />
        <meshStandardMaterial color="darkgreen" />
      </mesh>
    </group>
  )
}