import { ctx1Key } from "./predictor.ts";
import { emptyCounts, judge, normalize, type Move, type Pair, type Probs } from "../game/types.ts";

/**
 * 人群统计：把当天所有访客的出招累积起来，作为“对陌生人的先验”。
 * 存在 localStorage（由页面层负责读写），越玩越准。
 */
export type PopulationStats = {
  first: Probs; // 首招计数
  ctx: Record<string, Probs>; // 条件于“上一局(人的出招:结果)”的下一招计数
  rounds: number;
};

// 弱先验：常见的“新手偏爱石头”倾向，仅在现场数据很少时起作用，会被真实数据迅速覆盖
const DEFAULT_FIRST: Probs = { rock: 0.36, paper: 0.32, scissors: 0.32 };
const K_FIRST = 8;
const K_CTX = 10;

export function emptyPopulation(): PopulationStats {
  return { first: emptyCounts(), ctx: {}, rounds: 0 };
}

function smooth(counts: Probs, base: Probs, k: number): Probs {
  const n = counts.rock + counts.paper + counts.scissors;
  return normalize({
    rock: (counts.rock + k * base.rock) / (n + k),
    paper: (counts.paper + k * base.paper) / (n + k),
    scissors: (counts.scissors + k * base.scissors) / (n + k),
  });
}

/** 人群先验：给定本局至今的历史，人类下一招的分布 */
export function populationPrior(pop: PopulationStats, history: Pair[]): Probs {
  if (history.length === 0) return smooth(pop.first, DEFAULT_FIRST, K_FIRST);
  const last = history[history.length - 1];
  const counts = pop.ctx[ctx1Key(last.human, judge(last.human, last.ai))] ?? emptyCounts();
  return smooth(counts, { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 }, K_CTX);
}

/** 记录一局（history 为该局之前的历史，human 为这一局人的出招），返回新对象 */
export function recordPopulation(pop: PopulationStats, history: Pair[], human: Move): PopulationStats {
  const next: PopulationStats = {
    first: { ...pop.first },
    ctx: { ...pop.ctx },
    rounds: pop.rounds + 1,
  };
  if (history.length === 0) {
    next.first[human] += 1;
  } else {
    const last = history[history.length - 1];
    const key = ctx1Key(last.human, judge(last.human, last.ai));
    const c = { ...(next.ctx[key] ?? emptyCounts()) };
    c[human] += 1;
    next.ctx[key] = c;
  }
  return next;
}
