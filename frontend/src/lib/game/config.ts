/**
 * quick    : 人多时。Best-of-3（先赢 2 局），平局重打。AI 只略占优。
 * series   : 人少时。固定打 N 个“有胜负”的局（7–13，奇数），胜局多者赢。AI 全程在线学习。
 * learning : 人少时。先打 L 个“学习局”（AI 随机出招、只观察，不计胜负），
 *            再用学到的模型打最终局（1 局或 Best-of-3，平局重打）。
 */
export type MatchMode = "quick" | "series" | "learning";

export type GameConfig = {
  mode: MatchMode;
  seriesLength: number;
  learnRounds: number;
  finalBestOf: 1 | 3;
  /** quick 模式下 AI 采用“利用预测”的概率（其余时候随机），越小越接近纯随机 */
  quickEdge: number;
  /** series / learning 的正式局里 AI 采用“利用预测”的概率 */
  deepEdge: number;
  /** 倒数每一拍的间隔 (ms) */
  beatMs: number;
  /**
   * SHOOT 之后的采集窗口 (ms)；取窗口最后 settleMs 内的手势。
   * AI 的招在 SHOOT 时就公开，窗口必须短于“看到→反应→变手形”所需的时间(≈300–400ms)，防止玩家看了再变。
   */
  captureMs: number;
  settleMs: number;
  /**
   * true（默认）：SHOOT 的同一时刻公开 AI 的招，配短采集窗口 + 防偷看。
   * false（经典版）：AI 的招在玩家出手、采集结束后才揭晓，用下面更长的采集窗口，
   *                  倒数间隔很短时更好用。
   */
  revealAtShoot: boolean;
  classicCaptureMs: number;
  classicSettleMs: number;
  /** 手需要连续出现多久才自动开始 (ms) */
  dwellMs: number;
  /** 手在画面中的最小占比（包围盒面积/画面面积），过滤背景里的围观者 */
  minHandArea: number;
};

export const DEFAULT_CONFIG: GameConfig = {
  mode: "quick",
  seriesLength: 9,
  learnRounds: 10,
  finalBestOf: 3,
  quickEdge: 0.4,
  deepEdge: 0.9,
  beatMs: 700,
  captureMs: 350,
  settleMs: 200,
  revealAtShoot: true,
  classicCaptureMs: 700,
  classicSettleMs: 300,
  dwellMs: 500,
  minHandArea: 0.01,
};

export const MODE_LABEL: Record<MatchMode, string> = {
  quick: "Quick · Best of 3",
  series: "Series",
  learning: "Learning + Final",
};
