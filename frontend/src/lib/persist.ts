import type { GameConfig } from "./game/config.ts";
import { emptyPersisted, type Persisted } from "./engine/engine.ts";

// localStorage 读写全部 try/catch：隐私模式或被禁用时静默降级为内存态
const KEY_STATS = "clubai.stats.v1";
const KEY_SETTINGS = "clubai.settings.v1";

export type Settings = { config: Partial<GameConfig>; cameraId: string | null; mirror: boolean };
export const DEFAULT_SETTINGS: Settings = { config: {}, cameraId: null, mirror: true };

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadPersisted(): Persisted {
  const p = read<Persisted>(KEY_STATS);
  if (p?.population?.first && p.population.ctx && p.totals) {
    // 合并默认值：旧版本存下的统计里没有后来新增的字段
    return { population: p.population, totals: { ...emptyPersisted().totals, ...p.totals } };
  }
  return emptyPersisted();
}
export const savePersisted = (p: Persisted) => write(KEY_STATS, p);

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(KEY_SETTINGS) ?? {}) };
}
export const saveSettings = (s: Settings) => write(KEY_SETTINGS, s);
