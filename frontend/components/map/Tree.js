//components/Tree.js
import React from 'react'
import { Cylinder, Cone } from '@react-three/drei'

export function Tree({ position }) {
  return (
    <group position={position}>
      <Cylinder args={[0.2, 0.2, 1, 8]} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="saddlebrown" />
      </Cylinder>
      <Cone args={[1, 2, 8]} position={[0, 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="forestgreen" />
      </Cone>
    </group>
  )
}

