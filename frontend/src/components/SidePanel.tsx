import type { Snapshot } from "@/lib/engine/engine";
import { MODE_LABEL } from "@/lib/game/config";
import { sha256Hex } from "@/lib/sha256";
import type { Classification } from "@/lib/vision/classify";
import { MOVE_EMOJI } from "./labels";
import NeuralNet from "./NeuralNet";
import Scramble from "./Scramble";

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

type Props = { snap: Snapshot; tele: Telemetry; onStart: () => void; onStop: () => void; onSettings: () => void };

const CORE_STATE: Record<Snapshot["phase"], string> = {
  standby: "STANDBY",
  idle: "LISTENING",
  countdown: "INFERRING",
  capturing: "DECIDED",
  reveal: "DECIDED",
  result: "COOLDOWN",
  retry: "RETRY",
  matchOver: "COOLDOWN",
};

export default function SidePanel({ snap, tele, onStart, onStop, onSettings }: Props) {
  const { match, persisted } = snap;
  const t = persisted.totals;
  const standby = snap.phase === "standby";
  const decided = t.humanRounds + t.aiRounds;
  const verified = !!(snap.nonce && snap.aiMove && snap.sealedHash && sha256Hex(`${snap.aiMove}:${snap.nonce}`) === snap.sealedHash);
  const hashLines = (snap.sealedHash ?? "").match(/.{1,16}/g);

  return (
    <aside className="slim-scroll flex w-[440px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-black/45 p-4 text-xs">
      <div className="flex gap-2">
        {standby ? (
          <button onClick={onStart} className="display flex-1 rounded-xl bg-accent px-4 py-3 text-lg text-[#03110b] shadow-[0_0_24px_rgba(63,224,160,0.35)] hover:brightness-110">
            ▶ START MATCH
          </button>
        ) : (
          <button onClick={onStop} className="display flex-1 rounded-xl border border-bad/70 px-4 py-3 text-lg text-bad hover:bg-bad/10">
            ■ STOP
          </button>
        )}
        <button onClick={onSettings} className="display rounded-xl border border-line-strong px-4 py-3 text-lg hover:border-accent hover:text-accent">
          ⚙ SETTINGS
        </button>
      </div>
      <div className="-mt-1 text-[11px] text-dim">
        <span className="text-accent">&gt;</span> {standby ? `ready · ${MODE_LABEL[match.mode]}` : "match in progress"}
      </div>

      <Panel cmd="model --run" title="NEURAL CORE" right={<Chip live={!standby}>{CORE_STATE[snap.phase]}</Chip>}>
        <NeuralNet phase={snap.phase} aiMove={snap.aiMove} />
      </Panel>

      <Panel cmd="vision --scan" title="HAND TRACKING" right={<Chip live={tele.status === "running"}>{tele.status === "running" ? `${tele.fps.toFixed(0)} FPS` : tele.status.toUpperCase()}</Chip>}>
        <Row k="camera" v={tele.status === "error" ? `error: ${tele.error}` : tele.video} />
        <Row k="inference" v={`${tele.inferMs.toFixed(1)} ms · ${tele.delegate ?? "-"}`} />
        <Row k="hands" v={`${tele.hands}${tele.handedness ? ` (${tele.handedness})` : ""}${snap.handInZone ? " · in zone" : ""}`} />
        <Row k="gesture" v={tele.cls?.move ? `${tele.cls.move} · ${(tele.cls.confidence * 100).toFixed(0)}%` : "—"} />
        <Row k="PIP° i m r p" v={tele.cls ? tele.cls.angles.map((a) => a.toFixed(0).padStart(3)).join(" ") : "—"} />
      </Panel>

      {/* 不显示 AI 对玩家下一招的预测（也不显示 exploiting/random 状态）：显示出来玩家就能反制 AI */}

      <Panel cmd="seal --sha256" title="LOCKED MOVE" right={verified ? <Chip live>✓ VERIFIED</Chip> : <Chip>{snap.sealedHash ? "SEALED" : "IDLE"}</Chip>}>
        <div className="font-medium leading-relaxed tracking-[0.06em] text-accent">
          {(hashLines ?? ["················", "················", "················", "················"]).map((_, i) => (
            <div key={i} className="whitespace-pre">
              <Scramble text={snap.sealedHash ? (hashLines ?? [])[i] : null} placeholder="················" />
            </div>
          ))}
        </div>
        <div className="mt-2 break-all text-[11px] text-dim">
          {snap.nonce ? `nonce ${snap.nonce} · move ${snap.aiMove}` : "nonce  hidden until you throw"}
        </div>
      </Panel>

      <Panel cmd="cat match.log" title={MODE_LABEL[match.mode].toUpperCase()}>
        <div className="mb-2 flex flex-wrap gap-1">
          {match.rounds.length === 0 && <span className="text-dim">no rounds yet</span>}
          {match.rounds.map((r, i) => (
            <span
              key={i}
              title={`${r.human} vs ${r.ai}${r.stage === "learning" ? " (learning)" : ""}`}
              className={`emoji-mint rounded-md border px-1.5 py-0.5 text-sm ${
                r.stage === "learning" ? "border-white/10 bg-white/5 opacity-60" : r.outcome === "win" ? "border-accent/60 bg-accent/15" : r.outcome === "lose" ? "border-bad/60 bg-bad/15" : "border-warn/50 bg-warn/10"
              }`}
            >
              {MOVE_EMOJI[r.human]}
              {MOVE_EMOJI[r.ai]}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-dim">left = you · right = AI · dim = learning round</div>
      </Panel>

      <Panel cmd="stats --today" title="TODAY">
        <Row k="matches" v={`${t.matches}  (players ${t.humanMatchWins} · AI ${t.aiMatchWins})`} />
        <Row k="rounds" v={`players ${t.humanRounds} · AI ${t.aiRounds} · ties ${t.ties}`} />
        <Row k="AI win rate" v={decided ? `${((t.aiRounds / decided) * 100).toFixed(1)}%` : "—"} />
        <Row k="misread rate" v={t.attempts ? `${((t.misreads / t.attempts) * 100).toFixed(1)}%  (${t.misreads} / ${t.attempts})` : "—"} />
        <Row k="crowd model" v={`${persisted.population.rounds} throws learned`} />
      </Panel>

      <div className="mt-auto pt-1 text-[11px] leading-relaxed text-dim">
        <span className="text-accent">&gt;</span> Space start / skip · R P S manual entry after a misread · ` or F2 settings
      </div>
    </aside>
  );
}

function Panel({ cmd, title, right, children }: { cmd: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] tracking-wider text-dim">
            <span className="text-accent">$</span> {cmd}
          </div>
          <h3 className="display text-sm tracking-wide">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Chip({ live, children }: { live?: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] tracking-wider ${live ? "border-accent/70 bg-accent/10 text-accent" : "border-line text-dim"}`}>
      {children}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-dim">{k}</span>
      <span className="text-right text-fg">{v}</span>
    </div>
  );
}
