import type { GameConfig } from "./config.ts";
import { judge, type Move, type Outcome } from "./types.ts";

export type Stage = "learning" | "scored" | "over";

export type RoundRecord = {
  human: Move;
  ai: Move;
  outcome: Outcome;
  stage: "learning" | "scored";
  /** 是否计入有效局数（平局重打时为 false；学习局一律为 true） */
  counted: boolean;
};

export type MatchState = {
  mode: GameConfig["mode"];
  seriesLength: number;
  learnRounds: number;
  finalBestOf: 1 | 3;
  rounds: RoundRecord[];
  stage: Stage;
  learned: number;
  humanWins: number;
  aiWins: number;
  winner: "human" | "ai" | null;
};

function oddClamp(n: number): number {
  const c = Math.min(13, Math.max(7, Math.round(n)));
  return c % 2 === 0 ? c + 1 : c;
}

export function newMatch(c: GameConfig): MatchState {
  return {
    mode: c.mode,
    seriesLength: oddClamp(c.seriesLength),
    learnRounds: Math.max(1, Math.round(c.learnRounds)),
    finalBestOf: c.finalBestOf,
    rounds: [],
    stage: c.mode === "learning" ? "learning" : "scored",
    learned: 0,
    humanWins: 0,
    aiWins: 0,
    winner: null,
  };
}

/** 先赢几局即获胜；series 模式返回 null（打满固定局数） */
export function winsNeeded(m: MatchState): number | null {
  if (m.mode === "quick") return 2;
  if (m.mode === "learning") return m.finalBestOf === 3 ? 2 : 1;
  return null;
}

export function recordRound(m: MatchState, human: Move, ai: Move): MatchState {
  if (m.stage === "over") return m;
  const outcome = judge(human, ai);
  const stage = m.stage;
  const counted = stage === "learning" ? true : outcome !== "tie";
  const next: MatchState = {
    ...m,
    rounds: [...m.rounds, { human, ai, outcome, stage, counted }],
  };

  if (stage === "learning") {
    next.learned = m.learned + 1;
    if (next.learned >= m.learnRounds) next.stage = "scored";
    return next;
  }

  if (outcome === "win") next.humanWins = m.humanWins + 1;
  if (outcome === "lose") next.aiWins = m.aiWins + 1;

  const need = winsNeeded(m);
  if (need !== null) {
    if (next.humanWins >= need) return { ...next, stage: "over", winner: "human" };
    if (next.aiWins >= need) return { ...next, stage: "over", winner: "ai" };
  } else if (next.humanWins + next.aiWins >= m.seriesLength) {
    return { ...next, stage: "over", winner: next.humanWins > next.aiWins ? "human" : "ai" };
  }
  return next;
}

/** 给 UI 的进度描述 */
export function progressLabel(m: MatchState): string {
  if (m.stage === "over") return "Match over";
  if (m.stage === "learning") return `Learning round ${m.learned + 1} / ${m.learnRounds}`;
  if (m.mode === "series") return `Round ${m.humanWins + m.aiWins + 1} / ${m.seriesLength}`;
  const need = winsNeeded(m)!;
  if (m.mode === "learning") return need === 1 ? "Final round" : `Final · first to ${need}`;
  return `First to ${need}`;
}
