import { predictNext } from "./predictor.ts";
import { populationPrior, type PopulationStats } from "./population.ts";
import { MOVES, beats, counterTo, type Move, type Pair, type Probs } from "../game/types.ts";

export type Decision = {
  move: Move;
  /** 模型对人类下一招的预测（无论是否采用，都用于 UI 展示） */
  predicted: Probs;
  /** 本次是否“利用预测”出招（false = 随机） */
  exploited: boolean;
};

export type DecideArgs = {
  history: Pair[];
  population: PopulationStats;
  /** 0..1：采用“利用预测”的概率，其余时候均匀随机（保证对随机型玩家不吃亏、也不会被针对） */
  edge: number;
  /** 学习局：只观察，AI 均匀随机出招 */
  learning: boolean;
  rng: () => number;
};

export function predictHuman(history: Pair[], population: PopulationStats): Probs {
  return predictNext(history, populationPrior(population, history));
}

/** 期望收益最大的招：score(a) = P(人出 a 能赢的) − P(人出能赢 a 的) */
function bestResponse(p: Probs, rng: () => number): { move: Move; margin: number } {
  const scored = MOVES.map((a) => ({ a, s: p[beats(a)] - p[counterTo(a)] + rng() * 1e-9 }));
  scored.sort((x, y) => y.s - x.s);
  return { move: scored[0].a, margin: scored[0].s };
}

export function decide({ history, population, edge, learning, rng }: DecideArgs): Decision {
  const predicted = predictHuman(history, population);
  const random = MOVES[Math.floor(rng() * MOVES.length)];
  if (learning) return { move: random, predicted, exploited: false };

  const best = bestResponse(predicted, rng);
  // 预测几乎是均匀分布时没有可利用的信息，随机即可
  if (best.margin < 0.03 || rng() >= edge) return { move: random, predicted, exploited: false };
  return { move: best.move, predicted, exploited: true };
}
