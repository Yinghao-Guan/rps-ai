import { emptyCounts, judge, normalize, type Move, type Outcome, type Pair, type Probs } from "../game/types.ts";

/**
 * 预测人类下一招：层级平滑的条件频率模型（本质是带时间衰减的变阶马尔可夫链）。
 *
 *   先验(人群) → 全局频率 → 条件于“上一局(人的出招, 结果)” → 条件于“人最近两招”
 *
 * 每一层都用 Dirichlet 平滑：p = (counts + k·p_上一层) / (Σcounts + k)，
 * 所以数据少时自动退回上一层，数据多了才信任高阶上下文。
 * 越近的局权重越大（decay^距今局数），适应人在对局中途改变套路。
 */
export type PredictorOptions = {
  decay: number;
  k: number;
};

export const DEFAULT_PREDICTOR_OPTIONS: PredictorOptions = { decay: 0.93, k: 2 };

export type Ctx1 = string; // `${humanMove}:${outcome}`

export function ctx1Key(human: Move, outcome: Outcome): Ctx1 {
  return `${human}:${outcome}`;
}

function smooth(counts: Probs, base: Probs, k: number): Probs {
  const n = counts.rock + counts.paper + counts.scissors;
  return {
    rock: (counts.rock + k * base.rock) / (n + k),
    paper: (counts.paper + k * base.paper) / (n + k),
    scissors: (counts.scissors + k * base.scissors) / (n + k),
  };
}

/**
 * @param history 本局对战至今的所有回合（含平局），按时间顺序
 * @param prior   人群先验：已条件于上一局（首局则是首招分布）
 */
export function predictNext(history: Pair[], prior: Probs, opts: PredictorOptions = DEFAULT_PREDICTOR_OPTIONS): Probs {
  const n = history.length;
  let p = normalize(prior);
  if (n === 0) return p;

  const w = (t: number) => Math.pow(opts.decay, n - 1 - t);
  const outcomeAt = (t: number) => judge(history[t].human, history[t].ai);

  // 第 0 层：全局频率
  const c0 = emptyCounts();
  for (let t = 0; t < n; t++) c0[history[t].human] += w(t);
  p = smooth(c0, p, opts.k);

  // 第 1 层：条件于上一局(人的出招, 结果)
  const q1 = ctx1Key(history[n - 1].human, outcomeAt(n - 1));
  const c1 = emptyCounts();
  for (let t = 1; t < n; t++) {
    if (ctx1Key(history[t - 1].human, outcomeAt(t - 1)) === q1) c1[history[t].human] += w(t);
  }
  p = smooth(c1, p, opts.k);

  // 第 2 层：条件于人最近两招
  if (n >= 2) {
    const q2 = `${history[n - 2].human}>${history[n - 1].human}`;
    const c2 = emptyCounts();
    for (let t = 2; t < n; t++) {
      if (`${history[t - 2].human}>${history[t - 1].human}` === q2) c2[history[t].human] += w(t);
    }
    p = smooth(c2, p, opts.k);
  }

  return normalize(p);
}
