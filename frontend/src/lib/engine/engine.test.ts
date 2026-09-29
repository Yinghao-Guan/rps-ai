import assert from "node:assert/strict";
import { test } from "node:test";

import { GameEngine, type Phase } from "./engine.ts";
import { sha256Hex } from "../sha256.ts";
import type { Move } from "../game/types.ts";

const fast = { beatMs: 30, captureMs: 120, settleMs: 80, dwellMs: 40, minHandArea: 0.01 };
const timing = { revealMs: 20, resultMs: 20, retryMs: 300, matchOverMs: 100000 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 模拟摄像头：以 ~100fps 喂帧；hand() 决定当前帧内容 */
function camera(engine: GameEngine, hand: () => { present: boolean; move: Move | null }) {
  const id = setInterval(() => {
    const h = hand();
    engine.pushFrame({ t: performance.now(), present: h.present, area: h.present ? 0.1 : 0, move: h.move });
  }, 10);
  return () => clearInterval(id);
}

async function waitFor(engine: GameEngine, pred: (s: ReturnType<GameEngine["getSnapshot"]>) => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!pred(engine.getSnapshot())) {
    if (Date.now() - t0 > ms) throw new Error("timeout; phase=" + engine.getSnapshot().phase);
    await sleep(5);
  }
}

test("full quick match: auto-start on hand, sealed hash verifies on reveal", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing, matchOverMs: 150 });
  engine.startMatch();
  const phases: Phase[] = [];
  engine.subscribe(() => {
    const p = engine.getSnapshot().phase;
    if (phases[phases.length - 1] !== p) phases.push(p);
  });
  const stop = camera(engine, () => ({ present: true, move: "rock" }));

  await waitFor(engine, (s) => s.phase === "countdown");
  const s1 = engine.getSnapshot();
  assert.equal(s1.count, 3);
  assert.ok(s1.sealedHash && s1.sealedHash.length === 64);
  assert.equal(s1.aiMove, null, "AI move hidden during countdown");
  assert.equal(s1.nonce, null);

  await waitFor(engine, (s) => s.phase === "reveal");
  const s2 = engine.getSnapshot();
  assert.equal(s2.humanMove, "rock");
  assert.equal(s2.outcome, null, "outcome hidden until result phase");
  assert.equal(sha256Hex(`${s2.aiMove}:${s2.nonce}`), s1.sealedHash, "hash matches reveal");

  await waitFor(engine, (s) => s.phase === "matchOver", 10000);
  const s3 = engine.getSnapshot();
  assert.ok(s3.match.winner);
  assert.equal(s3.persisted.totals.matches, 1);
  assert.ok(phases.includes("capturing") && phases.includes("result"));
  // 整场结束后自动回到待机，即使手还在画面里也不会自己开始下一场
  await waitFor(engine, (s) => s.phase === "standby", 3000);
  await sleep(300);
  assert.equal(engine.getSnapshot().phase, "standby");
  assert.equal(engine.getSnapshot().match.rounds.length, 0, "fresh match waiting");
  stop();
  engine.dispose();
});

test("unreadable hand → retry → manual entry resolves the round", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
  engine.startMatch();
  let phase = "";
  engine.subscribe(() => (phase = engine.getSnapshot().phase));
  // 手在画面里但识别不出手势
  const stop = camera(engine, () => ({ present: true, move: null }));
  await waitFor(engine, (s) => s.phase === "retry");
  assert.ok(engine.getSnapshot().message);
  engine.manual("paper");
  await waitFor(engine, (s) => s.phase === "reveal");
  assert.equal(engine.getSnapshot().humanMove, "paper");
  assert.equal(engine.getSnapshot().persisted.population.rounds, 1);
  stop();
  engine.dispose();
  void phase;
});

test("default is standby: hand is ignored until staff starts a match", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
  assert.equal(engine.getSnapshot().phase, "standby");
  const stop = camera(engine, () => ({ present: true, move: "rock" }));
  await sleep(250);
  assert.equal(engine.getSnapshot().phase, "standby", "a hand alone must not start anything");
  engine.startNow(); // Space in standby starts a match, not a round
  assert.equal(engine.getSnapshot().phase, "idle");
  await waitFor(engine, (s) => s.phase === "countdown");
  stop();
  engine.dispose();
});

test("no hand → idle never starts; small background hand ignored; Space starts round; abort → standby", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
  engine.startMatch();
  const stopEmpty = camera(engine, () => ({ present: false, move: null }));
  await sleep(150);
  assert.equal(engine.getSnapshot().phase, "idle");
  stopEmpty();

  // 面积过小的手（背景围观者）不触发
  const id = setInterval(() => engine.pushFrame({ t: performance.now(), present: true, area: 0.001, move: "rock" }), 10);
  await sleep(150);
  clearInterval(id);
  assert.equal(engine.getSnapshot().phase, "idle");
  assert.equal(engine.getSnapshot().handInZone, false);

  engine.startNow();
  assert.equal(engine.getSnapshot().phase, "countdown");
  engine.abort(); // Stop：立刻中止倒数并回到待机，且之后不会再有残留定时器触发
  assert.equal(engine.getSnapshot().phase, "standby");
  await sleep(300);
  assert.equal(engine.getSnapshot().phase, "standby");
  assert.equal(engine.getSnapshot().persisted.population.rounds, 0);
  engine.dispose();
});

test("learning mode: AI is random & unscored during learning rounds; config change resets", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "learning", learnRounds: 2, finalBestOf: 1 }, ...timing });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: true, move: "scissors" }));
  await waitFor(engine, (s) => s.phase === "reveal");
  assert.equal(engine.getSnapshot().match.stage, "learning");
  assert.equal(engine.getSnapshot().exploited, false);
  await waitFor(engine, (s) => s.match.stage === "scored", 5000);
  assert.equal(engine.getSnapshot().persisted.totals.humanRounds + engine.getSnapshot().persisted.totals.aiRounds + engine.getSnapshot().persisted.totals.ties, 0, "learning rounds not counted in totals");
  stop();
  engine.setConfig({ mode: "series", seriesLength: 7 });
  assert.equal(engine.getSnapshot().phase, "standby");
  assert.equal(engine.getSnapshot().match.mode, "series");
  assert.equal(engine.getSnapshot().match.rounds.length, 0);
  engine.dispose();
});

test("AI move is public at SHOOT (capturing) but nonce is not; hidden during countdown", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: true, move: "rock" }));
  await waitFor(engine, (s) => s.phase === "countdown");
  assert.equal(engine.getSnapshot().aiMove, null);
  await waitFor(engine, (s) => s.phase === "capturing");
  const s = engine.getSnapshot();
  assert.ok(s.aiMove, "AI move shown at SHOOT");
  assert.equal(s.count, 0);
  assert.equal(s.humanMove, null);
  assert.equal(s.nonce, null);
  assert.equal(s.outcome, null);
  stop();
  engine.dispose();
});

test("after a misread the retried round is pure random (can't peek by hiding your hand)", async () => {
  // quickEdge=1 且首局预测有可利用的边际 → 正常情况下 AI 会“利用预测”
  const cfg = { ...fast, mode: "quick" as const, quickEdge: 1 };
  const normal = new GameEngine({ config: cfg, ...timing });
  normal.startMatch();
  normal.startNow();
  assert.equal(normal.getSnapshot().exploited, true, "baseline: exploits when it can");
  normal.dispose();

  const engine = new GameEngine({ config: cfg, ...timing });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: false, move: null })); // 故意藏手
  engine.startNow();
  await waitFor(engine, (s) => s.phase === "retry");
  await waitFor(engine, (s) => s.phase === "idle");
  engine.startNow();
  assert.equal(engine.getSnapshot().exploited, false, "retry round must not exploit");
  stop();
  engine.dispose();
});

test("classic timing (revealAtShoot=false): AI move hidden until after capture; retry NOT forced random", async () => {
  const cfg = { ...fast, mode: "quick" as const, quickEdge: 1, revealAtShoot: false, classicCaptureMs: 150, classicSettleMs: 90 };
  const engine = new GameEngine({ config: cfg, ...timing });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: true, move: "rock" }));
  await waitFor(engine, (s) => s.phase === "capturing");
  assert.equal(engine.getSnapshot().aiMove, null, "hidden at SHOOT in classic mode");
  await waitFor(engine, (s) => s.phase === "reveal");
  assert.ok(engine.getSnapshot().aiMove, "revealed after capture");
  stop();
  engine.dispose();

  // 经典版：读取失败后重试，AI 仍按预测出招（没有露出任何东西，无需强制随机）
  const e2 = new GameEngine({ config: cfg, ...timing });
  e2.startMatch();
  const stop2 = camera(e2, () => ({ present: false, move: null }));
  e2.startNow();
  await waitFor(e2, (s) => s.phase === "retry");
  await waitFor(e2, (s) => s.phase === "idle");
  e2.startNow();
  assert.equal(e2.getSnapshot().exploited, true);
  stop2();
  e2.dispose();
});

test("misread stats: attempts and misreads are counted", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: false, move: null }));
  engine.startNow();
  await waitFor(engine, (s) => s.phase === "retry");
  let t = engine.getSnapshot().persisted.totals;
  assert.deepEqual([t.attempts, t.misreads], [1, 1]);
  engine.manual("rock");
  await waitFor(engine, (s) => s.phase === "idle");
  stop();
  const stop2 = camera(engine, () => ({ present: true, move: "rock" }));
  engine.startNow();
  await waitFor(engine, (s) => s.phase === "reveal");
  t = engine.getSnapshot().persisted.totals;
  assert.deepEqual([t.attempts, t.misreads], [2, 1]);
  stop2();
  engine.dispose();
});

test("engine events fire in order: tick 3,2,1 → shoot → result → matchOver", async () => {
  const events: string[] = [];
  const engine = new GameEngine({
    config: { ...fast, mode: "quick" },
    ...timing,
    matchOverMs: 100000,
    onEvent: (e) => events.push(e.type === "tick" ? `tick${e.n}` : e.type === "result" ? `result:${e.outcome}` : e.type === "matchOver" ? `matchOver:${e.winner}` : e.type),
  });
  engine.startMatch();
  const stop = camera(engine, () => ({ present: true, move: "rock" }));
  await waitFor(engine, (s) => s.phase === "matchOver", 10000);
  stop();
  assert.deepEqual(events.slice(0, 5), ["tick3", "tick2", "tick1", "shoot", events[4]]);
  assert.match(events[4], /^result:(win|lose|tie)$/);
  assert.equal(events.filter((e) => e === "shoot").length, events.filter((e) => e.startsWith("result")).length, "one shoot per resolved round");
  assert.match(events[events.length - 1], /^matchOver:(human|ai)$/);
  engine.dispose();
});
