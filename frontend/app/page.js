//app/page.js
'use client'

import Game from '../components/Game'
import { useState, useEffect } from 'react'

export default function Home() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <main className="relative w-full h-screen">
      {isMounted && <Game />}
      {/* <div className="absolute top-0 left-0 p-4 text-white bg-black bg-opacity-50 rounded-br-lg">
        <h1 className="text-2xl font-bold mb-2">3D FPS-style Game Frontend</h1>
        <p>Click on the game to enable mouse control</p>
        <p>Use WASD to move</p>
        <p>Move the mouse to look around</p>
        <p>Press ESC to release mouse control</p>
      </div> */}
    </main>
  )
}

