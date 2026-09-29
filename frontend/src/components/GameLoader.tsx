"use client";

import dynamic from "next/dynamic";

// 摄像头 / MediaPipe / localStorage 都只在浏览器有意义，整个游戏跳过 SSR
const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-dim">Loading…</div>,
});

export default function GameLoader() {
  return <GameApp />;
}
