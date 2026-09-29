import { decide, type Decision } from "../ai/strategy.ts";
import { emptyPopulation, recordPopulation, type PopulationStats } from "../ai/population.ts";
import { DEFAULT_CONFIG, type GameConfig } from "../game/config.ts";
import { newMatch, recordRound, type MatchState } from "../game/match.ts";
import { judge, type Move, type Outcome, type Pair, type Probs } from "../game/types.ts";
import { randomNonce, sha256Hex } from "../sha256.ts";

/**
 * 对局引擎：一局的流程状态机，与 React / 浏览器无关。
 *
 *   standby ──工作人员点 Start──▶ idle ──手出现≥dwellMs 或 Space──▶ countdown(3,2,1) ──▶ capturing(SHOOT) ──▶ reveal ──▶ result
 *     ▲                                                      │读不出手势                │
 *     └────────────────── retry(2.2s，可按 R/P/S 人工录入) ◀──┘        下一局 idle / 整场结束 matchOver
 *
 * 默认停在 standby（不响应手）；一场（match）打完或工作人员 Stop 后也回到 standby，
 * 必须由工作人员再点 Start 才会开始下一位访客。
 *
 * AI 的出招在倒数开始时就已锁定（只公开 SHA-256(招式:nonce)），揭晓时才公开 nonce。
 */
export type Phase = "standby" | "idle" | "countdown" | "capturing" | "reveal" | "result" | "retry" | "matchOver";

export type Totals = {
  matches: number;
  humanMatchWins: number;
  aiMatchWins: number;
  humanRounds: number;
  aiRounds: number;
  ties: number;
  /** 手势采集次数 / 其中读不出的次数（用来观察识别的稳定性） */
  attempts: number;
  misreads: number;
};

export type Persisted = { population: PopulationStats; totals: Totals };

export function emptyPersisted(): Persisted {
  return {
    population: emptyPopulation(),
    totals: { matches: 0, humanMatchWins: 0, aiMatchWins: 0, humanRounds: 0, aiRounds: 0, ties: 0, attempts: 0, misreads: 0 },
  };
}

/** 视觉层每帧喂给引擎的最小信息 */
export type FrameInput = { t: number; present: boolean; area: number; move: Move | null };

export type Snapshot = {
  phase: Phase;
  config: GameConfig;
  match: MatchState;
  /** 3,2,1 倒数；0 = SHOOT；其余阶段为 null */
  count: number | null;
  sealedHash: string | null;
  /** 仅在 reveal 及之后公开（AI 的招在 SHOOT 时就公开，nonce 要等揭晓） */
  nonce: string | null;
  aiMove: Move | null;
  humanMove: Move | null;
  outcome: Outcome | null;
  /** AI 对“人类下一招”的预测（本局锁定时的预测，供 UI 展示） */
  prediction: Probs | null;
  exploited: boolean | null;
  handInZone: boolean;
  liveMove: Move | null;
  /** 自动开始的进度 0..1 */
  dwell: number;
  message: string | null;
  failures: number;
  /** 本场已发生的所有回合（含平局），供 UI 显示历史 */
  history: Pair[];
  persisted: Persisted;
};

/** 引擎在关键时刻发出的事件（音效等副作用挂在这上面，时间点与画面切换同步） */
export type EngineEvent =
  | { type: "tick"; n: number } // 倒数 3、2、1
  | { type: "shoot" }
  | { type: "result"; outcome: Outcome } // 一回合的结果（人类视角）
  | { type: "matchOver"; winner: "human" | "ai" | null };

export type EngineOptions = {
  onEvent?: (e: EngineEvent) => void;
  config?: Partial<GameConfig>;
  persisted?: Persisted;
  save?: (p: Persisted) => void;
  rng?: () => number;
  now?: () => number;
  revealMs?: number;
  resultMs?: number;
  retryMs?: number;
  matchOverMs?: number;
};

export class GameEngine {
  private config: GameConfig;
  private match: MatchState;
  private persisted: Persisted;
  private phase: Phase = "standby";
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private count: number | null = null;
  private decision: Decision | null = null;
  private nonce: string | null = null;
  private sealedHash: string | null = null;
  private humanMove: Move | null = null;
  private outcome: Outcome | null = null;
  private message: string | null = null;
  private failures = 0;
  /** 读取失败后的下一回合 AI 必须纯随机：否则玩家可故意藏手来“偷看” AI 的（可预测的）出招 */
  private peekGuard = false;

  private frames: FrameInput[] = [];
  private presentSince: number | null = null;
  private shootAt = 0;
  private liveMove: Move | null = null;
  private handInZone = false;
  private dwell = 0;

  private readonly rng: () => number;
  private readonly now: () => number;
  private readonly save: (p: Persisted) => void;
  private readonly onEvent: (e: EngineEvent) => void;
  private readonly revealMs: number;
  private readonly resultMs: number;
  private readonly retryMs: number;
  private readonly matchOverMs: number;

  constructor(o: EngineOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...o.config };
    this.persisted = o.persisted ?? emptyPersisted();
    this.save = o.save ?? (() => {});
    this.onEvent = o.onEvent ?? (() => {});
    this.rng = o.rng ?? Math.random;
    this.now = o.now ?? (() => performance.now());
    this.revealMs = o.revealMs ?? 1100;
    this.resultMs = o.resultMs ?? 2400;
    this.retryMs = o.retryMs ?? 2400;
    this.matchOverMs = o.matchOverMs ?? 9000;
    this.match = newMatch(this.config);
    this.snap = this.buildSnapshot();
  }

  // ---------- React 订阅接口（useSyncExternalStore） ----------
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;

  private emit() {
    this.snap = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private buildSnapshot(): Snapshot {
    const revealed = this.phase === "reveal" || this.phase === "result" || this.phase === "matchOver";
    const showOutcome = this.phase === "result" || this.phase === "matchOver";
    return {
      phase: this.phase,
      config: this.config,
      match: this.match,
      count: this.count,
      sealedHash: this.sealedHash,
      nonce: revealed ? this.nonce : null,
      // AI 的招在 SHOOT 的同时公开（此前只显示锁定的哈希）
      aiMove: revealed || (this.phase === "capturing" && this.config.revealAtShoot) ? (this.decision?.move ?? null) : null,
      humanMove: revealed ? this.humanMove : null,
      outcome: showOutcome ? this.outcome : null,
      prediction: this.decision?.predicted ?? null,
      exploited: this.decision?.exploited ?? null,
      handInZone: this.handInZone,
      liveMove: this.liveMove,
      dwell: this.dwell,
      message: this.message,
      failures: this.failures,
      history: this.match.rounds.map((r) => ({ human: r.human, ai: r.ai })),
      persisted: this.persisted,
    };
  }

  // ---------- 外部控制 ----------
  setConfig(patch: Partial<GameConfig>) {
    this.config = { ...this.config, ...patch };
    this.abort();
  }

  /** 工作人员开始一场：standby → idle（等手出现后自动开始第一回合） */
  startMatch() {
    if (this.phase !== "standby") return;
    this.match = newMatch(this.config);
    this.failures = 0;
    this.toIdle();
  }

  /** 放弃当前一场，回到 standby（等工作人员再点 Start） */
  abort() {
    this.clearTimer();
    this.match = newMatch(this.config);
    this.failures = 0;
    this.toStandby();
  }

  resetStats() {
    this.persisted = emptyPersisted();
    this.save(this.persisted);
    this.emit();
  }

  /** Space：standby 时开始一场；等手时立刻开始本回合；整场结果页时跳过 */
  startNow() {
    if (this.phase === "standby") this.startMatch();
    else if (this.phase === "idle") this.startRound();
    else if (this.phase === "matchOver") this.abort();
  }

  /** 识别失败时，工作人员人工录入人类的出招 */
  manual(move: Move) {
    if (this.phase !== "retry") return;
    this.clearTimer();
    this.peekGuard = false;
    this.resolve(move);
  }

  dispose() {
    this.clearTimer();
    this.listeners.clear();
  }

  // ---------- 视觉帧输入 ----------
  pushFrame(f: FrameInput) {
    const inZone = f.present && f.area >= this.config.minHandArea;
    this.frames.push(f.present ? { ...f } : { ...f, move: null });
    const cutoff = f.t - 3000;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();

    const live = inZone ? f.move : null;
    let changed = inZone !== this.handInZone || live !== this.liveMove;
    this.handInZone = inZone;
    this.liveMove = live;

    if (this.phase === "idle") {
      if (inZone) {
        this.presentSince ??= f.t;
        const dwell = Math.min(1, (f.t - this.presentSince) / this.config.dwellMs);
        if (Math.round(dwell * 10) !== Math.round(this.dwell * 10)) changed = true;
        this.dwell = dwell;
        if (dwell >= 1) {
          this.startRound();
          return;
        }
      } else {
        this.presentSince = null;
        if (this.dwell !== 0) changed = true;
        this.dwell = 0;
      }
    }
    if (changed) this.emit();
  }

  // ---------- 状态机 ----------
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private after(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  private toStandby() {
    this.phase = "standby";
    this.resetRoundState();
    this.emit();
  }

  private toIdle() {
    this.phase = "idle";
    this.resetRoundState();
    this.emit();
  }

  private resetRoundState() {
    if (this.phase === "standby") this.peekGuard = false;
    this.count = null;
    this.decision = null;
    this.nonce = null;
    this.sealedHash = null;
    this.humanMove = null;
    this.outcome = null;
    this.message = null;
    this.presentSince = null;
    this.dwell = 0;
  }

  private startRound() {
    const m = this.match;
    const history: Pair[] = m.rounds.map((r) => ({ human: r.human, ai: r.ai }));
    const learning = m.stage === "learning" || this.peekGuard;
    this.peekGuard = false;
    const edge = m.mode === "quick" ? this.config.quickEdge : this.config.deepEdge;
    this.decision = decide({ history, population: this.persisted.population, edge, learning, rng: this.rng });
    this.nonce = randomNonce();
    this.sealedHash = sha256Hex(`${this.decision.move}:${this.nonce}`);
    this.humanMove = null;
    this.outcome = null;
    this.message = null;
    this.presentSince = null;
    this.dwell = 0;

    const beat = this.config.beatMs;
    const tick = (n: number) => {
      this.phase = "countdown";
      this.count = n;
      this.emit();
      this.onEvent({ type: "tick", n });
      if (n > 1) this.after(beat, () => tick(n - 1));
      else this.after(beat, () => this.shoot());
    };
    tick(3);
  }

  private shoot() {
    this.phase = "capturing";
    this.count = 0;
    this.shootAt = this.now();
    this.emit();
    this.onEvent({ type: "shoot" });
    this.after(this.captureWindow().captureMs, () => this.evaluate());
  }

  /** 采集窗口：SHOOT 同时公开 AI 招时用短窗口（防看了再变），经典版用长窗口 */
  private captureWindow() {
    const c = this.config;
    return c.revealAtShoot ? { captureMs: c.captureMs, settleMs: c.settleMs } : { captureMs: c.classicCaptureMs, settleMs: c.classicSettleMs };
  }

  private bump(patch: Partial<Totals>) {
    const t = { ...this.persisted.totals };
    for (const k of Object.keys(patch) as (keyof Totals)[]) t[k] += patch[k] ?? 0;
    this.persisted = { ...this.persisted, totals: t };
    this.save(this.persisted);
  }

  /** 取采集窗口最后一段(settleMs)内的手势众数；样本不足或分歧太大则判读取失败 */
  private evaluate() {
    const cap = this.captureWindow();
    const end = this.shootAt + cap.captureMs;
    const start = end - Math.min(cap.settleMs, cap.captureMs * 0.6);
    const win = this.frames.filter((f) => f.t >= start && f.t <= end && f.present && f.area >= this.config.minHandArea);
    const votes: Record<string, number> = {};
    let n = 0;
    for (const f of win) {
      if (f.move) {
        votes[f.move] = (votes[f.move] ?? 0) + 1;
        n++;
      }
    }
    const [top, topN] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (top && n >= 3 && topN / n >= 0.6 && n / Math.max(1, win.length) >= 0.5) {
      this.failures = 0;
      this.bump({ attempts: 1 });
      this.resolve(top as Move);
    } else {
      this.fail();
    }
  }

  private fail() {
    this.failures++;
    this.bump({ attempts: 1, misreads: 1 });
    // 只有 AI 的招已经公开时才需要防偷看；经典版此时什么都没露出
    this.peekGuard = this.config.revealAtShoot;
    this.phase = "retry";
    this.count = null;
    this.message = this.failures >= 2 ? "Still can't read it — staff can press R / P / S" : "Couldn't read your hand — hold it clear of the frame edge";
    this.emit();
    this.after(this.retryMs, () => this.toIdle());
  }

  private resolve(human: Move) {
    const d = this.decision!;
    const before: Pair[] = this.match.rounds.map((r) => ({ human: r.human, ai: r.ai }));
    this.humanMove = human;
    this.outcome = judge(human, d.move);
    this.match = recordRound(this.match, human, d.move);

    const p = this.persisted;
    const scored = this.match.rounds[this.match.rounds.length - 1].stage === "scored";
    const totals = { ...p.totals };
    if (scored) {
      if (this.outcome === "win") totals.humanRounds++;
      else if (this.outcome === "lose") totals.aiRounds++;
      else totals.ties++;
    }
    if (this.match.stage === "over") {
      totals.matches++;
      if (this.match.winner === "human") totals.humanMatchWins++;
      else totals.aiMatchWins++;
    }
    this.persisted = { population: recordPopulation(p.population, before, human), totals };
    this.save(this.persisted);

    this.phase = "reveal";
    this.count = null;
    this.emit();
    this.after(this.revealMs, () => {
      this.phase = "result";
      this.emit();
      this.onEvent({ type: "result", outcome: this.outcome! });
      this.after(this.resultMs, () => {
        if (this.match.stage === "over") {
          this.phase = "matchOver";
          this.emit();
          this.onEvent({ type: "matchOver", winner: this.match.winner });
          this.after(this.matchOverMs, () => this.abort());
        } else {
          this.toIdle();
        }
      });
    });
  }
}
