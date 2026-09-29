import type { Snapshot } from "@/lib/engine/engine";
import { MODE_LABEL } from "@/lib/game/config";
import { progressLabel } from "@/lib/game/match";

/** 页眉：社团 logo + 名称（同海报页眉）、当前进度、比分 */
export default function Header({ snap }: { snap: Snapshot }) {
  const { match, phase } = snap;
  return (
    <header className="flex items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="CS Club" className="h-16 w-16 object-contain drop-shadow-[0_0_14px_rgba(43,184,214,0.45)]" />
        <div>
          <div className="display text-2xl tracking-wide">CS CLUB @ SMC</div>
          <div className="text-[11px] tracking-[0.35em] text-dim">SANTA MONICA COLLEGE</div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-[11px] tracking-[0.3em] text-dim">
          <span className="text-accent">$</span> {MODE_LABEL[match.mode].toUpperCase()}
        </div>
        <div className="display text-xl">{phase === "standby" ? "STANDBY" : progressLabel(match).toUpperCase()}</div>
      </div>

      <div className="flex items-center gap-5">
        <div className="display flex items-baseline gap-4 text-5xl tabular-nums leading-none">
          <span>
            <span className="mr-2 align-middle text-xs tracking-[0.25em] text-dim not-italic">YOU</span>
            <span className={match.humanWins > match.aiWins ? "text-accent glow" : ""}>{match.humanWins}</span>
          </span>
          <span className="text-dim">:</span>
          <span>
            <span className={match.aiWins > match.humanWins ? "text-accent glow" : ""}>{match.aiWins}</span>
            <span className="ml-2 align-middle text-xs tracking-[0.25em] text-dim not-italic">AI</span>
          </span>
        </div>
        <span className="rounded-md border border-line-strong px-3 py-1 text-xs tracking-[0.25em] text-accent">FALL 2026</span>
      </div>
    </header>
  );
}
