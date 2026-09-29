"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "@/lib/engine/engine";
import { MOVES, type Move } from "@/lib/game/types";

/**
 * 装饰性的“神经网络”动画（视觉效果，并不反映真实模型的内部状态，也不泄露任何预测）。
 * 活跃度随对局阶段变化：待机微弱 → 倒数拉高 → SHOOT 峰值 → 揭晓后回落。
 * 输出层三个节点对应 R/P/S；AI 的招一旦公开，对应节点会亮起。
 */
const LAYERS = [6, 9, 9, 3];
const ACTIVITY: Record<Phase, number> = {
  standby: 0.1,
  idle: 0.28,
  countdown: 0.75,
  capturing: 1,
  reveal: 0.6,
  result: 0.3,
  retry: 0.2,
  matchOver: 0.15,
};
const LABELS = ["R", "P", "S"];

type Pulse = { l: number; i: number; j: number; t: number; dur: number };

export default function NeuralNet({ phase, aiMove }: { phase: Phase; aiMove: Move | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const moveRef = useRef(aiMove);

  useEffect(() => {
    phaseRef.current = phase;
    moveRef.current = aiMove;
  }, [phase, aiMove]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const energy = LAYERS.map((n) => new Array<number>(n).fill(0));
    const pulses: Pulse[] = [];
    let act = 0.1;
    let raf = 0;
    let prev = performance.now();

    const pos = (l: number, i: number) => {
      const padX = 26;
      const padY = 16;
      const n = LAYERS[l];
      return { x: padX + (l * (w - 2 * padX)) / (LAYERS.length - 1), y: padY + ((i + 0.5) * (h - 2 * padY)) / n };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - prev);
      prev = now;
      act += (ACTIVITY[phaseRef.current] - act) * 0.05;

      // 生成脉冲
      if (Math.random() < act * 0.55) {
        const l = Math.floor(Math.random() * (LAYERS.length - 1));
        pulses.push({ l, i: Math.floor(Math.random() * LAYERS[l]), j: Math.floor(Math.random() * LAYERS[l + 1]), t: 0, dur: 380 + Math.random() * 380 });
      }

      ctx.clearRect(0, 0, w, h);

      // 连线
      ctx.lineWidth = 1;
      for (let l = 0; l < LAYERS.length - 1; l++) {
        for (let i = 0; i < LAYERS[l]; i++) {
          for (let j = 0; j < LAYERS[l + 1]; j++) {
            const a = pos(l, i);
            const b = pos(l + 1, j);
            const e = (energy[l][i] + energy[l + 1][j]) * 0.5;
            ctx.strokeStyle = `rgba(63, 224, 160, ${0.035 + act * 0.045 + e * 0.18})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // 脉冲
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.t += dt;
        const f = p.t / p.dur;
        if (f >= 1) {
          energy[p.l + 1][p.j] = Math.min(1, energy[p.l + 1][p.j] + 0.7);
          pulses.splice(k, 1);
          continue;
        }
        const a = pos(p.l, p.i);
        const b = pos(p.l + 1, p.j);
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        ctx.fillStyle = "rgba(216, 255, 240, 0.95)";
        ctx.shadowColor = "#3fe0a0";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 节点
      const chosen = moveRef.current ? MOVES.indexOf(moveRef.current) : -1;
      for (let l = 0; l < LAYERS.length; l++) {
        for (let i = 0; i < LAYERS[l]; i++) {
          energy[l][i] *= 0.955;
          const idle = 0.12 + 0.1 * Math.sin(now / 700 + i * 1.7 + l * 2.3) * (0.4 + act);
          const e = Math.min(1, energy[l][i] + idle);
          const { x, y } = pos(l, i);
          const isOut = l === LAYERS.length - 1;
          const isChosen = isOut && i === chosen;
          const r = (isOut ? 7.5 : 4) + e * 2 + (isChosen ? 3 : 0);
          ctx.fillStyle = isChosen ? "#d8fff0" : `rgba(63, 224, 160, ${0.2 + e * 0.8})`;
          ctx.shadowColor = "#3fe0a0";
          ctx.shadowBlur = isChosen ? 22 : e * 12;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(63, 224, 160, 0.55)";
          ctx.stroke();
          if (isOut) {
            ctx.fillStyle = isChosen ? "#04140d" : "rgba(232,255,246,0.85)";
            ctx.font = 'bold 9px "Roboto Mono", monospace';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(LABELS[i], x, y + 0.5);
          }
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="block h-[170px] w-full" />;
}
