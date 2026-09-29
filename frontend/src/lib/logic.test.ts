// 运行：npm run test:logic（Node 内置 test runner，直接执行 TS）
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { decide } from "./ai/strategy.ts";
import { emptyPopulation, recordPopulation, type PopulationStats } from "./ai/population.ts";
import { DEFAULT_CONFIG, type GameConfig } from "./game/config.ts";
import { newMatch, recordRound, winsNeeded, type MatchState } from "./game/match.ts";
import { MOVES, counterTo, judge, type Move, type Pair } from "./game/types.ts";
import { sha256Hex } from "./sha256.ts";
import { classifyHand, type P3 } from "./vision/classify.ts";

// ---------- 基础 ----------
test("sha256 matches node crypto", () => {
  for (const s of ["", "abc", "rock:1a2b3c4d5e6f7788", "x".repeat(55), "x".repeat(56), "x".repeat(64), "石头"]) {
    assert.equal(sha256Hex(s), createHash("sha256").update(s).digest("hex"), JSON.stringify(s));
  }
});

test("judge / counterTo", () => {
  assert.equal(judge("rock", "scissors"), "win");
  assert.equal(judge("rock", "paper"), "lose");
  assert.equal(judge("paper", "paper"), "tie");
  for (const m of MOVES) assert.equal(judge(counterTo(m), m), "win");
});

// ---------- 对局规则 ----------
const cfg = (o: Partial<GameConfig>): GameConfig => ({ ...DEFAULT_CONFIG, ...o });
const play = (m: MatchState, human: Move, ai: Move) => recordRound(m, human, ai);

test("quick: first to 2, ties replay", () => {
  let m = newMatch(cfg({ mode: "quick" }));
  assert.equal(winsNeeded(m), 2);
  m = play(m, "rock", "rock"); // tie
  assert.equal(m.humanWins + m.aiWins, 0);
  m = play(m, "rock", "scissors");
  m = play(m, "rock", "paper");
  assert.equal(m.stage, "scored");
  m = play(m, "paper", "rock");
  assert.equal(m.stage, "over");
  assert.equal(m.winner, "human");
});

test("series: plays exactly N decided rounds, majority wins, N forced odd within 7..13", () => {
  assert.equal(newMatch(cfg({ mode: "series", seriesLength: 8 })).seriesLength, 9);
  assert.equal(newMatch(cfg({ mode: "series", seriesLength: 3 })).seriesLength, 7);
  assert.equal(newMatch(cfg({ mode: "series", seriesLength: 99 })).seriesLength, 13);
  let m = newMatch(cfg({ mode: "series", seriesLength: 7 }));
  for (let i = 0; i < 6; i++) m = play(m, "rock", i % 2 ? "scissors" : "paper"); // 3 win, 3 lose
  m = play(m, "paper", "paper"); // tie doesn't count
  assert.equal(m.stage, "scored");
  m = play(m, "rock", "scissors");
  assert.equal(m.stage, "over");
  assert.equal(m.winner, "human");
});

test("learning: L learning rounds (ties count) then final bo3", () => {
  let m = newMatch(cfg({ mode: "learning", learnRounds: 10, finalBestOf: 3 }));
  assert.equal(m.stage, "learning");
  for (let i = 0; i < 9; i++) m = play(m, "rock", "rock");
  assert.equal(m.stage, "learning");
  m = play(m, "rock", "paper");
  assert.equal(m.stage, "scored");
  assert.equal(m.aiWins + m.humanWins, 0, "learning rounds are not scored");
  m = play(m, "rock", "paper");
  m = play(m, "rock", "scissors");
  assert.equal(m.stage, "scored");
  m = play(m, "rock", "paper");
  assert.equal(m.stage, "over");
  assert.equal(m.winner, "ai");
});

test("learning with final bo1", () => {
  let m = newMatch(cfg({ mode: "learning", learnRounds: 1, finalBestOf: 1 }));
  m = play(m, "rock", "rock");
  m = play(m, "rock", "rock"); // tie replays
  assert.equal(m.stage, "scored");
  m = play(m, "rock", "scissors");
  assert.equal(m.stage, "over");
  assert.equal(m.winner, "human");
});

// ---------- 分类器：用运动学合成手模型 ----------
function syntheticHand(flex: [number, number, number, number]): P3[] {
  // flex[i] = 该手指 PIP 关节的弯曲度（度）：0 伸直，100 握紧；MCP、DIP 随之联动
  const pts: P3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  // 拇指（随便放个位置，仅展示用）
  pts[1] = { x: -0.03, y: 0.03, z: 0 }; pts[2] = { x: -0.05, y: 0.05, z: 0 };
  pts[3] = { x: -0.065, y: 0.07, z: 0 }; pts[4] = { x: -0.075, y: 0.085, z: 0 };
  const lens = [0.045, 0.025, 0.02];
  const rad = (d: number) => (d * Math.PI) / 180;
  flex.forEach((pipFlex, i) => {
    const base = 5 + i * 4;
    let p: P3 = { x: -0.03 + i * 0.02, y: 0.09, z: 0 };
    pts[base] = p;
    const cum = [pipFlex * 0.9, pipFlex * 0.9 + pipFlex, pipFlex * 0.9 + pipFlex + pipFlex * 0.6];
    for (let s = 0; s < 3; s++) {
      const th = rad(cum[s]);
      p = { x: p.x, y: p.y + lens[s] * Math.cos(th), z: p.z - lens[s] * Math.sin(th) };
      pts[base + 1 + s] = p;
    }
  });
  return pts;
}

test("classifier: rock / paper / scissors on synthetic hands", () => {
  assert.equal(classifyHand(syntheticHand([100, 100, 100, 100])).move, "rock");
  assert.equal(classifyHand(syntheticHand([0, 0, 0, 0])).move, "paper");
  assert.equal(classifyHand(syntheticHand([5, 5, 5, 5])).move, "paper");
  assert.equal(classifyHand(syntheticHand([0, 0, 100, 100])).move, "scissors");
  assert.equal(classifyHand(syntheticHand([0, 0, 0, 100])).move, "paper"); // 3 up
  assert.equal(classifyHand(syntheticHand([0, 100, 100, 100])).move, null); // pointing
  assert.equal(classifyHand(syntheticHand([0, 0, 0, 0])).confidence > 0.8, true);
});

// ---------- AI 策略模拟 ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Human = (history: Pair[], rng: () => number) => Move;
const pickRandom = (rng: () => number) => MOVES[Math.floor(rng() * 3)];

const humans: Record<string, Human> = {
  uniform: (_h, rng) => pickRandom(rng),
  cycle: (h) => MOVES[h.length % 3],
  // win-stay / lose-shift（输了换成“能打败对手上一招”的招，赢了/平重复）
  wsls: (h, rng) => {
    if (h.length === 0) return pickRandom(rng);
    const last = h[h.length - 1];
    const o = judge(last.human, last.ai);
    return o === "lose" ? counterTo(last.ai) : last.human;
  },
  rockLover: (_h, rng) => (rng() < 0.5 ? "rock" : pickRandom(rng)),
};

/** 模拟大量“访客”打完整场，返回 AI 在有胜负局里的胜率 */
function simulate(mode: GameConfig["mode"], human: Human, matches: number, seed = 1) {
  const rng = mulberry32(seed);
  let pop: PopulationStats = emptyPopulation();
  let aiWins = 0, humanWins = 0, matchAi = 0;
  for (let i = 0; i < matches; i++) {
    let m = newMatch(cfg({ mode, seriesLength: 9, learnRounds: 10, finalBestOf: 3 }));
    const history: Pair[] = [];
    while (m.stage !== "over") {
      const edge = mode === "quick" ? DEFAULT_CONFIG.quickEdge : DEFAULT_CONFIG.deepEdge;
      const d = decide({ history, population: pop, edge, learning: m.stage === "learning", rng });
      const h = human(history, rng);
      if (m.stage === "scored") {
        const o = judge(h, d.move);
        if (o === "win") humanWins++;
        if (o === "lose") aiWins++;
      }
      pop = recordPopulation(pop, history, h);
      history.push({ human: h, ai: d.move });
      m = recordRound(m, h, d.move);
    }
    if (m.winner === "ai") matchAi++;
  }
  return { roundWinRate: aiWins / (aiWins + humanWins), matchWinRate: matchAi / matches };
}

test("AI simulation report", () => {
  const rows: string[] = [];
  const out: Record<string, { roundWinRate: number; matchWinRate: number }> = {};
  for (const mode of ["quick", "series", "learning"] as const) {
    for (const [name, h] of Object.entries(humans)) {
      const r = simulate(mode, h, 1500);
      out[`${mode}/${name}`] = r;
      rows.push(`${mode.padEnd(8)} vs ${name.padEnd(9)} AI round-win ${(r.roundWinRate * 100).toFixed(1)}%  AI match-win ${(r.matchWinRate * 100).toFixed(1)}%`);
    }
  }
  console.log("\n" + rows.join("\n"));

  // 对纯随机玩家：不吃亏（=50% 有胜负局胜率，允许统计噪声）
  for (const mode of ["quick", "series", "learning"]) {
    assert.ok(Math.abs(out[`${mode}/uniform`].roundWinRate - 0.5) < 0.03, `${mode} vs uniform ≈ 50%`);
  }
  // 对有规律的玩家：深度模式显著占优；quick 只略占优
  assert.ok(out["series/cycle"].roundWinRate > 0.7);
  assert.ok(out["learning/cycle"].roundWinRate > 0.85);
  assert.ok(out["quick/rockLover"].roundWinRate > 0.5);
  assert.ok(out["quick/rockLover"].roundWinRate < out["series/rockLover"].roundWinRate);
});
