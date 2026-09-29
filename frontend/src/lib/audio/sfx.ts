import type { EngineEvent } from "../engine/engine.ts";

/**
 * 音效：全部用 Web Audio 实时合成（不依赖任何音频文件，离线可用）。
 * 现场很吵，所以倒数用方波（穿透力强）、音量偏大；可在 Settings 里整体关闭。
 *
 * 浏览器的自动播放策略要求 AudioContext 必须由用户手势（点击 / 按键）唤醒，
 * 所以 unlockAudio() 挂在窗口的 pointerdown / keydown 上；board 成员点 “Start match” 就完成了唤醒。
 */
let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.8;
    // 压缩器防止几个音叠加时爆音
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

type ToneOpts = { type?: OscillatorType; gain?: number; slideTo?: number; lowpass?: number };

/** 在 t0 秒（相对现在）开始，播放一个带起音/衰减包络的音 */
function tone(freq: number, t0: number, dur: number, o: ToneOpts = {}) {
  if (!ctx || !out) return;
  const t = ctx.currentTime + t0;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "square";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lowpass;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** 一小段高通白噪声，给 SHOOT 加“啪”的冲击感 */
function noiseBurst(t0: number, dur: number, gain: number) {
  if (!ctx || !out) return;
  const t = ctx.currentTime + t0;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(hp);
  hp.connect(g);
  g.connect(out);
  src.start(t);
}

const tick = (n: number) => {
  // 3、2、1 音高逐拍升高，制造紧张感
  const freq = n === 3 ? 587 : n === 2 ? 659 : 740;
  tone(freq, 0, 0.13, { type: "square", gain: 0.28, lowpass: 3800 });
};

const shoot = () => {
  tone(1047, 0, 0.32, { type: "square", gain: 0.3, lowpass: 5000 });
  tone(1568, 0, 0.32, { type: "sine", gain: 0.3 });
  noiseBurst(0, 0.09, 0.35);
};

const win = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: "triangle", gain: 0.34 }));
const lose = () => {
  tone(330, 0, 0.22, { type: "sawtooth", gain: 0.2, lowpass: 1800, slideTo: 300 });
  tone(262, 0.2, 0.34, { type: "sawtooth", gain: 0.2, lowpass: 1600, slideTo: 200 });
};
const tie = () => {
  tone(440, 0, 0.11, { type: "triangle", gain: 0.3 });
  tone(440, 0.16, 0.11, { type: "triangle", gain: 0.3 });
};
const matchWin = () => {
  [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.08, 0.26, { type: "triangle", gain: 0.32 }));
  [1047, 1319, 1568].forEach((f) => tone(f, 0.55, 0.9, { type: "triangle", gain: 0.24 }));
};
const matchLose = () => [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.17, 0.3, { type: "sawtooth", gain: 0.2, lowpass: 1700 }));

/** 引擎事件 → 音效 */
export function playEngineEvent(e: EngineEvent) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  switch (e.type) {
    case "tick":
      return tick(e.n);
    case "shoot":
      return shoot();
    case "result":
      return e.outcome === "win" ? win() : e.outcome === "lose" ? lose() : tie();
    case "matchOver":
      return e.winner === "human" ? matchWin() : matchLose();
  }
}

/** 在 Settings 里打开声音时播一声试听 */
export function playPreview() {
  if (!ctx || ctx.state !== "running") return;
  tick(1);
}
