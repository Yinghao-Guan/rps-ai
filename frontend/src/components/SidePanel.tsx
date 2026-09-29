import type { Snapshot } from "@/lib/engine/engine";
import { MODE_LABEL } from "@/lib/game/config";
import { MOVES } from "@/lib/game/types";
import type { Classification } from "@/lib/vision/classify";
import { MOVE_EMOJI } from "./labels";

export type Telemetry = {
  status: "starting" | "running" | "error";
  error: string | null;
  fps: number;
  inferMs: number;
  delegate: "GPU" | "CPU" | null;
  hands: number;
  cls: Classification | null;
  handedness: string | null;
  video: string;
};

export default function SidePanel({ snap, tele }: { snap: Snapshot; tele: Telemetry }) {
  const { match, persisted } = snap;
  const t = persisted.totals;
  const decided = t.humanRounds + t.aiRounds;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-4 font-mono text-xs">
      <Section title="AI // sealed move">
        <div className="break-all text-[11px] leading-snug text-accent">
          {snap.sealedHash ? `SHA-256  ${snap.sealedHash}` : "SHA-256  ················································"}
        </div>
        <div className="mt-1 break-all text-[11px] text-dim">
          {snap.nonce ? `nonce ${snap.nonce} · move ${snap.aiMove}` : "nonce  (revealed after you throw)"}
        </div>
      </Section>

      <Section title={`AI // prediction of your next move${snap.exploited === null ? "" : snap.exploited ? " · exploiting" : " · random"}`}>
        {MOVES.map((m) => {
          const p = snap.prediction?.[m] ?? 1 / 3;
          return (
            <div key={m} className="mb-1 flex items-center gap-2">
              <span className="w-6 text-base">{MOVE_EMOJI[m]}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-white/10">
                <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${p * 100}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums">{(p * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </Section>

      <Section title="Vision">
        <Row k="camera" v={tele.status === "error" ? `error: ${tele.error}` : `${tele.status} · ${tele.video}`} />
        <Row k="fps / infer" v={`${tele.fps.toFixed(0)} fps · ${tele.inferMs.toFixed(1)} ms · ${tele.delegate ?? "-"}`} />
        <Row k="hands" v={`${tele.hands}${tele.handedness ? ` (${tele.handedness})` : ""}${snap.handInZone ? " · in zone" : ""}`} />
        <Row k="gesture" v={tele.cls?.move ? `${tele.cls.move} · conf ${(tele.cls.confidence * 100).toFixed(0)}%` : "—"} />
        <Row k="PIP angles" v={tele.cls ? tele.cls.angles.map((a) => a.toFixed(0).padStart(3)).join(" ") + "  (idx mid ring pnk)" : "—"} />
      </Section>

      <Section title={`Match // ${MODE_LABEL[match.mode]}`}>
        <div className="mb-2 flex flex-wrap gap-1">
          {match.rounds.length === 0 && <span className="text-dim">no rounds yet</span>}
          {match.rounds.map((r, i) => (
            <span
              key={i}
              title={`${r.human} vs ${r.ai}${r.stage === "learning" ? " (learning)" : ""}`}
              className={`rounded px-1.5 py-0.5 text-sm ${
                r.stage === "learning" ? "bg-white/10 text-dim" : r.outcome === "win" ? "bg-emerald-500/20" : r.outcome === "lose" ? "bg-rose-500/20" : "bg-amber-400/20"
              }`}
            >
              {MOVE_EMOJI[r.human]}
              {MOVE_EMOJI[r.ai]}
            </span>
          ))}
        </div>
        <div className="text-dim">left = you · right = AI · grey = learning round</div>
      </Section>

      <Section title="Today">
        <Row k="matches" v={`${t.matches}  (players ${t.humanMatchWins} · AI ${t.aiMatchWins})`} />
        <Row k="rounds" v={`players ${t.humanRounds} · AI ${t.aiRounds} · ties ${t.ties}`} />
        <Row k="AI win rate" v={decided ? `${((t.aiRounds / decided) * 100).toFixed(1)}%` : "—"} />
        <Row k="crowd model" v={`${persisted.population.rounds} throws learned`} />
      </Section>

      <div className="mt-auto text-[11px] leading-relaxed text-dim">
        Space start / skip · R P S manual entry (after a misread) · ` or F2 admin panel
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-black/20 p-3">
      <h3 className="mb-2 text-[11px] uppercase tracking-wider text-dim">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-dim">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
