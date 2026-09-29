// 纯逻辑模块：不依赖浏览器/React，import 一律带 .ts 后缀，方便 Node 直接跑模拟测试。

export type Move = "rock" | "paper" | "scissors";
export const MOVES: readonly Move[] = ["rock", "paper", "scissors"];

/** 从人类视角：win = 人赢 */
export type Outcome = "win" | "lose" | "tie";

export type Probs = Record<Move, number>;

const BEATS: Record<Move, Move> = { rock: "scissors", paper: "rock", scissors: "paper" };

/** a 能打败的招式 */
export function beats(a: Move): Move {
  return BEATS[a];
}

/** 能打败 m 的招式 */
export function counterTo(m: Move): Move {
  return MOVES.find((x) => BEATS[x] === m)!;
}

export function judge(human: Move, ai: Move): Outcome {
  if (human === ai) return "tie";
  return BEATS[human] === ai ? "win" : "lose";
}

export const UNIFORM: Probs = { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };

export function emptyCounts(): Probs {
  return { rock: 0, paper: 0, scissors: 0 };
}

export function normalize(p: Probs): Probs {
  const s = p.rock + p.paper + p.scissors;
  if (s <= 0) return { ...UNIFORM };
  return { rock: p.rock / s, paper: p.paper / s, scissors: p.scissors / s };
}

export function argmax(p: Probs): Move {
  return MOVES.reduce((best, m) => (p[m] > p[best] ? m : best), MOVES[0]);
}

/** 一局的记录（human/ai 已定，outcome 为人类视角） */
export type Pair = { human: Move; ai: Move };
