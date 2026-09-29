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
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
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
  stop();
  engine.dispose();
});

test("unreadable hand → retry → manual entry resolves the round", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
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

test("no hand at all → never starts; Space starts; background hand below area threshold ignored", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "quick" }, ...timing });
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
  engine.dispose();
});

test("learning mode: AI is random & unscored during learning rounds; config change resets", async () => {
  const engine = new GameEngine({ config: { ...fast, mode: "learning", learnRounds: 2, finalBestOf: 1 }, ...timing });
  const stop = camera(engine, () => ({ present: true, move: "scissors" }));
  await waitFor(engine, (s) => s.phase === "reveal");
  assert.equal(engine.getSnapshot().match.stage, "learning");
  assert.equal(engine.getSnapshot().exploited, false);
  await waitFor(engine, (s) => s.match.stage === "scored", 5000);
  assert.equal(engine.getSnapshot().persisted.totals.humanRounds + engine.getSnapshot().persisted.totals.aiRounds + engine.getSnapshot().persisted.totals.ties, 0, "learning rounds not counted in totals");
  stop();
  engine.setConfig({ mode: "series", seriesLength: 7 });
  assert.equal(engine.getSnapshot().phase, "idle");
  assert.equal(engine.getSnapshot().match.mode, "series");
  assert.equal(engine.getSnapshot().match.rounds.length, 0);
  engine.dispose();
});
