"use client";

import { useEffect, useRef } from "react";

export type Mood = "idle" | "active" | "win" | "lose";

// cmatrix 同款：半角片假名 + 数字 + 少量符号
const CHARS = "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:.=*+-<>|Z".split("");
const FONT = '"Roboto Mono", "Hiragino Kaku Gothic ProN", "Yu Gothic", "MS Gothic", "Noto Sans Mono CJK JP", monospace';

// speed: 每帧下落行数的倍率；fade: 每帧的拖尾衰减（越小尾巴越长）
const PALETTE: Record<Mood, { head: string; body: string; speed: number; fade: number }> = {
  idle: { head: "#a6f0cf", body: "#178a5f", speed: 0.6, fade: 0.055 },
  active: { head: "#d8fff0", body: "#1fae74", speed: 1, fade: 0.07 },
  win: { head: "#ffffff", body: "#3fe0a0", speed: 1.9, fade: 0.07 },
  lose: { head: "#ffc2cb", body: "#a3243a", speed: 0.9, fade: 0.09 },
};

/** 全屏字符雨背景。mood 决定颜色和速度：待机暗而慢，对局中变亮，赢了爆亮，输了转红。 */
export default function MatrixRain({ mood }: { mood: Mood }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const FS = 18;
    let drops: number[] = [];
    let speeds: number[] = [];
    let raf = 0;
    let last = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.ceil(canvas.width / FS);
      drops = Array.from({ length: cols }, () => Math.random() * -30);
      speeds = Array.from({ length: cols }, () => 0.45 + Math.random() * 0.8);
      ctx.fillStyle = "#050d0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 42) return; // ~24fps，省 GPU 给手势识别
      last = t;
      const p = PALETTE[moodRef.current];
      ctx.fillStyle = `rgba(5, 13, 10, ${p.fade})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${FS}px ${FONT}`;
      for (let i = 0; i < drops.length; i++) {
        const x = i * FS;
        const y = drops[i] * FS;
        ctx.fillStyle = p.body;
        ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x, y - FS);
        ctx.fillStyle = p.head;
        ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x, y);
        drops[i] += speeds[i] * p.speed;
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0 opacity-70" />;
}
