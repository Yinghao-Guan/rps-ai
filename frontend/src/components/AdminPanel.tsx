import { MODE_LABEL, type GameConfig, type MatchMode } from "@/lib/game/config";

type Props = {
  config: GameConfig;
  onConfig: (patch: Partial<GameConfig>) => void;
  cameras: MediaDeviceInfo[];
  cameraId: string | null;
  onCamera: (id: string | null) => void;
  mirror: boolean;
  onMirror: (m: boolean) => void;
  onResetStats: () => void;
  onClose: () => void;
};

export default function AdminPanel(p: Props) {
  const c = p.config;
  return (
    <div className="slim-scroll absolute inset-y-0 right-0 z-20 w-[440px] overflow-y-auto border-l border-accent/50 bg-panel/97 p-5 text-sm shadow-[0_0_60px_rgba(0,0,0,0.8)]">
      <div className="mb-4 flex items-center justify-between">
        <div><div className="text-[10px] tracking-wider text-dim"><span className="text-accent">$</span> config --edit</div><h2 className="display text-lg">SETTINGS</h2></div>
        <button className="rounded border border-line px-2 py-1 text-dim hover:text-fg" onClick={p.onClose}>
          Close
        </button>
      </div>
      <p className="mb-4 text-xs text-dim">Changing anything here stops the current match and returns to standby.</p>

      <Label>Mode</Label>
      <div className="mb-4 grid gap-2">
        {(Object.keys(MODE_LABEL) as MatchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => p.onConfig({ mode: m })}
            className={`rounded border px-3 py-2 text-left ${c.mode === m ? "border-accent bg-accent/10" : "border-line hover:border-dim"}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {c.mode === "series" && <Slider label="Rounds in series" v={c.seriesLength} min={7} max={13} step={2} onChange={(v) => p.onConfig({ seriesLength: v })} />}
      {c.mode === "learning" && (
        <>
          <Slider label="Learning rounds" v={c.learnRounds} min={5} max={15} step={1} onChange={(v) => p.onConfig({ learnRounds: v })} />
          <Label>Final</Label>
          <div className="mb-4 flex gap-2">
            {([1, 3] as const).map((b) => (
              <button key={b} onClick={() => p.onConfig({ finalBestOf: b })} className={`flex-1 rounded border px-3 py-2 ${c.finalBestOf === b ? "border-accent bg-accent/10" : "border-line"}`}>
                {b === 1 ? "Single round" : "Best of 3"}
              </button>
            ))}
          </div>
        </>
      )}

      <Slider label="AI edge · Quick (0 = pure random)" v={c.quickEdge} min={0} max={1} step={0.05} onChange={(v) => p.onConfig({ quickEdge: v })} fmt={(v) => v.toFixed(2)} />
      <Slider label="AI edge · Series / Final" v={c.deepEdge} min={0} max={1} step={0.05} onChange={(v) => p.onConfig({ deepEdge: v })} fmt={(v) => v.toFixed(2)} />

      <hr className="my-4 border-line" />
      <Slider label="Beat interval (ms)" v={c.beatMs} min={400} max={1100} step={50} onChange={(v) => p.onConfig({ beatMs: v })} />
      <Label>AI move timing</Label>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {([true, false] as const).map((on) => (
          <button
            key={String(on)}
            onClick={() => p.onConfig({ revealAtShoot: on })}
            className={`rounded border px-3 py-2 text-left ${c.revealAtShoot === on ? "border-accent bg-accent/10" : "border-line hover:border-dim"}`}
          >
            {on ? "Shown at SHOOT" : "Classic"}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-dim">
        {c.revealAtShoot
          ? "AI's move flips over at SHOOT, and your hand is read within a short window. Default."
          : "Classic: AI's move stays hidden until you have thrown; longer read window. Better when the countdown beat is short."}
      </p>
      {c.revealAtShoot && (
        <Slider label="Read window after SHOOT (ms) · shorter = harder to peek" v={c.captureMs} min={250} max={700} step={50} onChange={(v) => p.onConfig({ captureMs: v })} />
      )}
      <Slider label="Auto-start hold (ms)" v={c.dwellMs} min={200} max={1500} step={100} onChange={(v) => p.onConfig({ dwellMs: v })} />
      <Slider label="Min hand size (frame fraction)" v={c.minHandArea} min={0.002} max={0.1} step={0.002} onChange={(v) => p.onConfig({ minHandArea: v })} fmt={(v) => v.toFixed(3)} />

      <hr className="my-4 border-line" />
      <Label>Camera</Label>
      <select
        className="mb-3 w-full rounded border border-line bg-black/40 px-2 py-2"
        value={p.cameraId ?? ""}
        onChange={(e) => p.onCamera(e.target.value || null)}
      >
        <option value="">Default</option>
        {p.cameras.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId.slice(0, 8)}
          </option>
        ))}
      </select>
      <label className="mb-4 flex items-center gap-2">
        <input type="checkbox" checked={p.mirror} onChange={(e) => p.onMirror(e.target.checked)} /> Mirror preview
      </label>

      <button
        className="w-full rounded border border-rose-500/50 px-3 py-2 text-rose-300 hover:bg-rose-500/10"
        onClick={() => {
          if (window.confirm("Reset today's stats and the crowd model?")) p.onResetStats();
        }}
      >
        Reset stats &amp; crowd model
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs uppercase tracking-wider text-dim">{children}</div>;
}

function Slider({ label, v, min, max, step, onChange, fmt }: { label: string; v: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-dim">
        <span>{label}</span>
        <span className="text-fg">{fmt ? fmt(v) : v}</span>
      </div>
      <input className="w-full accent-cyan-300" type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
