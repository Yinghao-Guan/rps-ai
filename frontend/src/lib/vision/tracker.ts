import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classifyHand, type Classification } from "./classify.ts";

// 仅浏览器端使用。wasm 由 /mediapipe/* 路由提供，模型在 public/models/。
export type TrackedHand = {
  landmarks: NormalizedLandmark[];
  cls: Classification;
  /** 包围盒面积占整个画面的比例 */
  area: number;
  handedness: string;
};

export type TrackerResult = { hand: TrackedHand | null; hands: number; inferMs: number };

export type LandmarkerHandle = { landmarker: HandLandmarker; delegate: "GPU" | "CPU" };

export async function createLandmarker(): Promise<LandmarkerHandle> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
  const make = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return { landmarker: await make("GPU"), delegate: "GPU" };
  } catch {
    return { landmarker: await make("CPU"), delegate: "CPU" };
  }
}

function bboxArea(lm: NormalizedLandmark[]): number {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/** 检测一帧；多只手时取画面里最大的那只（最靠近镜头的人） */
export function detectHand(landmarker: HandLandmarker, video: HTMLVideoElement, ts: number): TrackerResult {
  const t0 = performance.now();
  const res = landmarker.detectForVideo(video, ts);
  const inferMs = performance.now() - t0;
  let best = -1;
  let bestArea = -1;
  res.landmarks.forEach((lm, i) => {
    const a = bboxArea(lm);
    if (a > bestArea) {
      bestArea = a;
      best = i;
    }
  });
  if (best < 0) return { hand: null, hands: 0, inferMs };
  return {
    hand: {
      landmarks: res.landmarks[best],
      cls: classifyHand(res.worldLandmarks[best]),
      area: bestArea,
      handedness: res.handedness[best]?.[0]?.categoryName ?? "?",
    },
    hands: res.landmarks.length,
    inferMs,
  };
}
