"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { GameEngine, type Snapshot } from "@/lib/engine/engine";
import type { GameConfig } from "@/lib/game/config";
import { loadPersisted, loadSettings, saveSettings, savePersisted, type Settings } from "@/lib/persist";
import { drawHand } from "@/lib/vision/draw";
import { createLandmarker, detectHand, type TrackedHand } from "@/lib/vision/tracker";
import AdminPanel from "./AdminPanel";
import Header from "./Header";
import MatrixRain, { type Mood } from "./MatrixRain";
import SidePanel, { type Telemetry } from "./SidePanel";
import Stage from "./Stage";

const INITIAL_TELE: Telemetry = {
  status: "starting",
  error: null,
  fps: 0,
  inferMs: 0,
  delegate: null,
  hands: 0,
  cls: null,
  handedness: null,
  video: "-",
};

type Live = { hand: TrackedHand | null; hands: number; inferMs: number; fps: number; delegate: "GPU" | "CPU" | null; video: string };

export default function GameApp() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [engine] = useState(
    () => new GameEngine({ config: loadSettings().config, persisted: loadPersisted(), save: savePersisted }),
  );
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  const [tele, setTele] = useState<Telemetry>(INITIAL_TELE);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Live>({ hand: null, hands: 0, inferMs: 0, fps: 0, delegate: null, video: "-" });
  const { cameraId, mirror } = settings;

  // ---------- 摄像头 + MediaPipe 循环 ----------
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let landmarker: Awaited<ReturnType<typeof createLandmarker>>["landmarker"] | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraId ? { exact: cameraId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60 },
          },
          audio: false,
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
        setCameras((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));

        const made = await createLandmarker();
        if (cancelled) {
          made.landmarker.close();
          return;
        }
        landmarker = made.landmarker;
        liveRef.current.delegate = made.delegate;
        liveRef.current.video = `${video.videoWidth}×${video.videoHeight}`;
        setTele((t) => ({ ...t, status: "running", error: null }));

        let lastVideoTime = -1;
        let lastTs = 0;
        let frames = 0;
        let fpsT = performance.now();
        const loop = () => {
          raf = requestAnimationFrame(loop);
          if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;
          const ts = Math.max(performance.now(), lastTs + 1);
          lastTs = ts;

          const r = detectHand(landmarker!, video, ts);
          const live = liveRef.current;
          live.hand = r.hand;
          live.hands = r.hands;
          live.inferMs = live.inferMs * 0.8 + r.inferMs * 0.2;
          engine.pushFrame({ t: ts, present: !!r.hand, area: r.hand?.area ?? 0, move: r.hand?.cls.move ?? null });

          if (ctx) {
            if (canvas.width !== video.videoWidth) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            drawHand(ctx, r.hand?.landmarks ?? null, r.hand?.cls.move ?? null);
          }

          frames++;
          const now = performance.now();
          if (now - fpsT >= 1000) {
            live.fps = (frames * 1000) / (now - fpsT);
            frames = 0;
            fpsT = now;
          }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setTele((t) => ({ ...t, status: "error", error: msg }));
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
    };
  }, [cameraId, engine]);

  // 遥测：以 4Hz 把 ref 里的实时数据同步到 React 状态给侧栏显示
  useEffect(() => {
    const id = setInterval(() => {
      const l = liveRef.current;
      setTele((t) => ({
        ...t,
        fps: l.fps,
        inferMs: l.inferMs,
        delegate: l.delegate,
        hands: l.hands,
        cls: l.hand?.cls ?? null,
        handedness: l.hand?.handedness ?? null,
        video: l.video,
      }));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ---------- 键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      // 用 e.code（物理按键）而不是 e.key：中文输入法开着时 e.key 会变成 "Process"
      if (e.code === "Space") {
        e.preventDefault();
        engine.startNow();
      } else if (e.code === "Backquote" || e.code === "F2") setAdminOpen((o) => !o);
      else if (e.code === "Escape") setAdminOpen(false);
      else if (e.code === "KeyR") engine.manual("rock");
      else if (e.code === "KeyP") engine.manual("paper");
      else if (e.code === "KeyS") engine.manual("scissors");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };
  const onConfig = (patch: Partial<GameConfig>) => {
    engine.setConfig(patch);
    update({ config: { ...settings.config, ...patch } });
  };

  const flip = mirror ? { transform: "scaleX(-1)" } : undefined;
  const cls = tele.cls;

  return (
    <div className="relative h-full overflow-hidden">
      <MatrixRain mood={moodOf(snap)} />
      <div className="relative z-10 flex h-full">
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <Header snap={snap} />

          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div
              className="relative aspect-video max-h-full max-w-full overflow-hidden rounded-2xl border border-line-strong bg-black/55 shadow-[0_0_60px_rgba(63,224,160,0.12)]"
              style={{ height: "100%" }}
            >
              <video ref={videoRef} muted playsInline className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${snap.phase === "standby" ? "opacity-30" : "opacity-100"}`} style={flip} />
              <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${snap.phase === "standby" ? "opacity-30" : "opacity-100"}`} style={flip} />
              <div className="scanlines pointer-events-none absolute inset-0" />
              <Stage snap={snap} cameraReady={tele.status === "running"} />

              {/* HUD 边角框 */}
              {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map((c) => (
                <div key={c} className={`pointer-events-none absolute h-6 w-6 border-accent ${c}`} />
              ))}
              <div className="pointer-events-none absolute left-9 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] tracking-wider text-dim">
                <span className={tele.status === "running" ? "text-accent" : "text-bad"}>●</span> CAM 01 · {tele.video} · {tele.fps.toFixed(0)} fps
              </div>
              <div className="pointer-events-none absolute bottom-3 left-9 rounded-md bg-black/55 px-2 py-1 text-[11px] tracking-wider text-dim">
                HAND ▸ <span className="text-accent">{cls?.move ? `${cls.move.toUpperCase()} ${(cls.confidence * 100).toFixed(0)}%` : "—"}</span>
              </div>

              {tele.status === "error" && (
                <div className="absolute inset-x-0 bottom-0 bg-bad/25 p-3 text-center text-sm text-fg backdrop-blur-sm">
                  Camera error: {tele.error}. Allow camera access, or pick another camera in Settings.
                </div>
              )}
            </div>
          </div>
        </main>

        <SidePanel
          snap={snap}
          tele={tele}
          onStart={() => engine.startMatch()}
          onStop={() => {
            const inProgress = snap.match.rounds.length > 0 && snap.match.stage !== "over";
            if (!inProgress || window.confirm("Stop the current match?")) engine.abort();
          }}
          onSettings={() => setAdminOpen((o) => !o)}
        />
      </div>

      {adminOpen && (
        <AdminPanel
          config={snap.config}
          onConfig={onConfig}
          cameras={cameras}
          cameraId={cameraId}
          onCamera={(id) => update({ cameraId: id })}
          mirror={mirror}
          onMirror={(m) => update({ mirror: m })}
          onResetStats={() => engine.resetStats()}
          onClose={() => setAdminOpen(false)}
        />
      )}
    </div>
  );
}

/** 字符雨的“情绪”：待机暗而慢，对局中变亮，赢了爆亮，输了转红 */
function moodOf(s: Snapshot): Mood {
  if (s.phase === "matchOver") return s.match.winner === "human" ? "win" : "lose";
  if (s.phase === "result") return s.outcome === "win" ? "win" : s.outcome === "lose" ? "lose" : "active";
  if (s.phase === "countdown" || s.phase === "capturing" || s.phase === "reveal") return "active";
  return "idle";
}
