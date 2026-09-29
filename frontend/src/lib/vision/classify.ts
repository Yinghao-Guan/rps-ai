import type { Move } from "../game/types.ts";

export type P3 = { x: number; y: number; z: number };

export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export const FINGER_NAMES: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

export type Classification = {
  move: Move | null;
  /** 0..1，越大越确定（基于关节角离阈值的余量） */
  confidence: number;
  /** 食指~小指 PIP 关节的弯曲角（度）：≈180 伸直，≈60–90 握紧 */
  angles: [number, number, number, number];
  /** 五指是否伸出（拇指仅用于展示，不参与判定） */
  fingers: Record<FingerName, boolean>;
};

// 阈值集中放这里，现场可对着摄像头微调（管理面板里会实时显示 angles）
// 实测（MediaPipe 输出）：伸直 ≈ 150–165°，握紧 ≈ 40–90°，阈值取两类的中间偏宽
export const UP_ANGLE = 130; // PIP 角大于此值 → 明确伸直
export const DOWN_ANGLE = 115; // PIP 角小于此值 → 明确弯曲（介于两者之间视为不确定）

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: P3) => Math.sqrt(dot(a, a));

/** 以 v 为顶点，a→v 与 b→v 之间的夹角（度） */
export function angleAt(a: P3, v: P3, b: P3): number {
  const va = sub(a, v);
  const vb = sub(b, v);
  const d = len(va) * len(vb);
  if (d === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot(va, vb) / d))) * 180) / Math.PI;
}

// MediaPipe 手部 21 点：0 腕；食指 5-8；中指 9-12；无名指 13-16；小指 17-20（MCP, PIP, DIP, TIP）
const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
] as const;

/** 用 3D 世界坐标（米）判定，手指朝向镜头时也不会被透视缩短误导 */
export function classifyHand(world: P3[]): Classification {
  const angles = FINGERS.map(([mcp, pip, tip]) => angleAt(world[mcp], world[pip], world[tip])) as Classification["angles"];
  const [ia, ma, ra, pa] = angles;

  const up = (a: number) => a > UP_ANGLE;
  const down = (a: number) => a < DOWN_ANGLE;

  // 拇指仅展示：指尖到小指 MCP 的距离 vs IP 到小指 MCP 的距离
  const thumbOut = len(sub(world[4], world[17])) > len(sub(world[3], world[17])) * 1.05;
  const fingers: Classification["fingers"] = {
    thumb: thumbOut,
    index: up(ia),
    middle: up(ma),
    ring: up(ra),
    pinky: up(pa),
  };

  const upCount = angles.filter(up).length;
  let move: Move | null = null;
  let margin = 0; // 距离“不确定区”的最小余量（度）

  if (angles.every(down)) {
    move = "rock";
    margin = DOWN_ANGLE - Math.max(...angles);
  } else if (up(ia) && up(ma) && down(ra) && down(pa)) {
    move = "scissors";
    margin = Math.min(ia - UP_ANGLE, ma - UP_ANGLE, DOWN_ANGLE - ra, DOWN_ANGLE - pa);
  } else if (upCount >= 3) {
    move = "paper";
    const ups = angles.filter(up).map((a) => a - UP_ANGLE);
    margin = Math.min(...ups);
  }

  const confidence = move ? Math.max(0.35, Math.min(1, 0.5 + margin / 30)) : 0;
  return { move, confidence, angles, fingers };
}
