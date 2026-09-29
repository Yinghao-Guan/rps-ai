import type { Snapshot } from "@/lib/engine/engine";
import { progressLabel } from "@/lib/game/match";
import { MOVE_EMOJI, MOVE_NAME } from "./labels";

const OUTCOME_TEXT = { win: "YOU WIN", lose: "AI WINS", tie: "TIE" } as const;
const OUTCOME_CLASS = { win: "text-accent glow", lose: "text-bad glow-bad", tie: "text-warn glow-warn" } as const;

/** 摄像头画面上层的大字状态（待机 / 倒数 / 出手 / 揭晓 / 结果） */
export default function Stage({ snap, cameraReady }: { snap: Snapshot; cameraReady: boolean }) {
  const { phase, count, humanMove, aiMove, outcome, match } = snap;
  const big = "display drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]";
  const cmd = "text-[min(1.1rem,1.3vw)] tracking-wide text-dim";

  let body: React.ReactNode = null;

  if (phase === "standby") {
    body = (
      <div className="text-center">
        <div className={cmd}>
          <span className="text-accent">$</span> play --prize
        </div>
        <div className={`${big} cursor mt-2 text-[min(6.5rem,6.6vw)] leading-none`}>BEAT THE AI</div>
        <div className="mt-5 text-[min(1.3rem,1.6vw)] text-dim">win a prize · waiting for the next player</div>
      </div>
    );
  } else if (phase === "idle" && !cameraReady) {
    body = <div className={cmd}>waiting for camera…</div>;
  } else if (phase === "idle") {
    body = (
      <div className="text-center">
        <div className={cmd}>
          <span className="text-accent">$</span> {progressLabel(match).toLowerCase().replace(/ /g, "_")} --await-hand
        </div>
        <div className={`${big} cursor mt-2 text-[min(4.5rem,4.6vw)] leading-none`}>
          {snap.handInZone ? "HOLD STEADY" : "SHOW YOUR HAND"}
        </div>
        <div className="mx-auto mt-6 flex w-[min(24rem,30vw)] gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={`h-2 flex-1 rounded-sm ${snap.dwell * 10 > i ? "bg-accent shadow-[0_0_8px_#3fe0a0]" : "bg-white/10"}`} />
          ))}
        </div>
      </div>
    );
  } else if (phase === "countdown" || phase === "capturing") {
    body =
      count === 0 ? (
        <div className={`${big} glow text-[min(14rem,10vw)] leading-none text-accent`}>SHOOT!</div>
      ) : (
        <div key={count} className={`${big} glow pop text-[min(20rem,34vh)] leading-none`}>
          {count}
        </div>
      );
  } else if (phase === "matchOver" && match.mode === "series") {
    body = (
      <div className="text-center">
        <div className={cmd}>
          <span className="text-accent">$</span> cat final_score
        </div>
        <div className={`${big} mt-2 flex items-baseline justify-center gap-[min(3rem,3vw)] text-[min(13rem,11vw)] leading-none tabular-nums`}>
          <span className={match.winner === "human" ? "text-accent glow" : ""}>{match.humanWins}</span>
          <span className="text-dim">:</span>
          <span className={match.winner === "ai" ? "text-bad glow-bad" : ""}>{match.aiWins}</span>
        </div>
        <div className="mt-1 flex justify-center gap-[min(12rem,12vw)] text-[min(1.3rem,1.7vw)] tracking-[0.3em] text-dim">
          <span>YOU</span>
          <span>AI</span>
        </div>
        <Verdict human={match.winner === "human"} />
      </div>
    );
  } else if (phase === "reveal" || phase === "result" || phase === "matchOver") {
    body = (
      <div className="text-center">
        <div className="flex items-center justify-center gap-[min(4rem,4vw)]">
          <Hand label="YOU" move={humanMove} />
          <div className="display text-[min(2.5rem,3vw)] text-dim">VS</div>
          <Hand label="AI" move={aiMove} />
        </div>
        {outcome && <div className={`${big} mt-6 text-[min(6.5rem,6.6vw)] leading-none ${OUTCOME_CLASS[outcome]}`}>{OUTCOME_TEXT[outcome]}</div>}
        {phase === "matchOver" && <Verdict human={match.winner === "human"} />}
      </div>
    );
  } else if (phase === "retry") {
    body = (
      <div className="max-w-3xl text-center">
        <div className={cmd}>
          <span className="text-warn">!</span> read_error
        </div>
        <div className={`${big} glow-warn mt-2 text-[min(2.6rem,3.2vw)] leading-tight text-warn`}>{snap.message}</div>
      </div>
    );
  }

  const showAiCard = snap.config.revealAtShoot && (phase === "countdown" || phase === "capturing");
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(2,8,6,0.62)_0%,rgba(2,8,6,0.3)_70%)]">
      {body}
      {showAiCard && <AiCard snap={snap} />}
    </div>
  );
}

function Verdict({ human }: { human: boolean }) {
  return (
    <div className={`display mt-6 text-[min(3rem,3.2vw)] ${human ? "text-accent glow" : "text-fg"}`}>
      {human ? "YOU BEAT THE AI — CLAIM YOUR PRIZE" : "THE AI TAKES THIS MATCH"}
    </div>
  );
}

function Hand({ label, move }: { label: string; move: Snapshot["humanMove"] }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line-strong bg-black/50 px-[min(2.5rem,3vw)] py-[min(1.5rem,2vw)]">
      <div className="text-[min(1.1rem,1.4vw)] tracking-[0.35em] text-accent">{label}</div>
      <div className="emoji-mint text-[min(9rem,9vw)] leading-none">{move ? MOVE_EMOJI[move] : "❔"}</div>
      <div className="display text-[min(1.6rem,1.9vw)]">{move ? MOVE_NAME[move] : "…"}</div>
    </div>
  );
}

/** 右上角的 AI 出招卡：倒数时是 LOCKED，SHOOT 的同一时刻翻出招式 */
function AiCard({ snap }: { snap: Snapshot }) {
  const move = snap.aiMove;
  return (
    <div className="absolute right-[2%] top-[3%] flex w-[min(16rem,21%)] flex-col items-center rounded-2xl border-2 border-accent bg-black/75 px-3 py-4 shadow-[0_0_44px_rgba(63,224,160,0.4)]">
      <div className="text-[min(0.85rem,1vw)] tracking-[0.3em] text-accent">
        <span className="text-dim">$</span> ai --move
      </div>
      {move ? (
        <div key={move} className="pop mt-1 text-center">
          <div className="emoji-mint text-[min(7rem,8vw)] leading-none">{MOVE_EMOJI[move]}</div>
          <div className="display mt-1 text-[min(1.6rem,1.9vw)]">{MOVE_NAME[move]}</div>
        </div>
      ) : (
        <div className="mt-1 text-center">
          <div className="text-[min(5rem,6vw)] leading-none">🔒</div>
          <div className="display mt-1 text-[min(1.1rem,1.3vw)] tracking-widest text-dim">LOCKED</div>
          <div className="mt-1 text-[min(0.8rem,1vw)] text-accent/80">{snap.sealedHash?.slice(0, 12)}…</div>
        </div>
      )}
    </div>
  );
}
