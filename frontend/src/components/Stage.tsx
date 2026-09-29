import type { Snapshot } from "@/lib/engine/engine";
import { progressLabel } from "@/lib/game/match";
import { MOVE_EMOJI, MOVE_NAME } from "./labels";

const OUTCOME_TEXT = { win: "YOU WIN", lose: "AI WINS", tie: "TIE" } as const;
const OUTCOME_COLOR = { win: "text-emerald-400", lose: "text-rose-400", tie: "text-amber-300" } as const;

/** 摄像头画面上层的大字状态（倒数 / 出手 / 揭晓 / 结果） */
export default function Stage({ snap, cameraReady }: { snap: Snapshot; cameraReady: boolean }) {
  const { phase, count, humanMove, aiMove, outcome, match } = snap;
  const big = "font-black tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]";

  let body: React.ReactNode = null;

  if (phase === "standby") {
    body = (
      <div className="text-center">
        <div className={`${big} text-[min(4.5rem,4.5vw)]`}>Beat the AI, win a prize</div>
        <div className="mt-4 text-[min(1.5rem,2vw)] text-dim">Waiting for the next player…</div>
      </div>
    );
  } else if (phase === "idle" && !cameraReady) {
    body = <div className="text-2xl text-dim">Waiting for camera…</div>;
  } else if (phase === "idle") {
    body = (
      <div className="text-center">
        <div className={`${big} text-[min(3.75rem,3.6vw)]`}>{snap.handInZone ? "Hold steady…" : "Show your hand to start"}</div>
        <div className="mt-3 text-xl text-dim">{progressLabel(match)}</div>
        <div className="mx-auto mt-5 h-2 w-72 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${snap.dwell * 100}%` }} />
        </div>
      </div>
    );
  } else if (phase === "countdown" || phase === "capturing") {
    body =
      count === 0 ? (
        <div className={`${big} text-[min(14rem,10vw)] leading-none text-accent`}>SHOOT!</div>
      ) : (
        <div key={count} className={`${big} text-[min(18rem,32vh)] leading-none`}>{count}</div>
      );
  } else if (phase === "reveal" || phase === "result" || phase === "matchOver") {
    body = (
      <div className="text-center">
        <div className="flex items-center justify-center gap-[min(4rem,4vw)]">
          <Hand label="YOU" move={humanMove} />
          <div className="text-4xl font-bold text-dim">VS</div>
          <Hand label="AI" move={aiMove} />
        </div>
        {outcome && (
          <div className={`${big} mt-6 text-[min(6rem,6vw)] ${OUTCOME_COLOR[outcome]}`}>{OUTCOME_TEXT[outcome]}</div>
        )}
        {phase === "matchOver" && (
          <div className={`${big} mt-6 text-[min(3rem,3vw)]`}>
            {match.winner === "human" ? "🎉 You beat the AI — claim your prize!" : "The AI takes this match"}
          </div>
        )}
      </div>
    );
  } else if (phase === "retry") {
    body = <div className={`${big} max-w-3xl text-center text-[min(2.25rem,3vw)] text-amber-300`}>{snap.message}</div>;
  }

  return <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">{body}</div>;
}

function Hand({ label, move }: { label: string; move: Snapshot["humanMove"] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-lg font-semibold tracking-widest text-dim">{label}</div>
      <div className="text-[min(9rem,9vw)] leading-none">{move ? MOVE_EMOJI[move] : "❔"}</div>
      <div className="text-xl font-bold">{move ? MOVE_NAME[move] : "…"}</div>
    </div>
  );
}
