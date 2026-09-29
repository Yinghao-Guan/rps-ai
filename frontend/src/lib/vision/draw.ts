import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Move } from "../game/types.ts";

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const COLORS: Record<Move | "none", string> = {
  rock: "#ffb020",
  paper: "#38e8ff",
  scissors: "#ff5ca8",
  none: "#9aa4b2",
};

/** 在（已按视频原始分辨率设置好尺寸的）canvas 上画手部骨架；镜像由 CSS 负责 */
export function drawHand(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[] | null, move: Move | null) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const color = COLORS[move ?? "none"];
  ctx.lineWidth = Math.max(2, w / 320);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  const r = Math.max(3, w / 220);
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
