import { readFile } from "node:fs/promises";
import path from "node:path";

// 把 @mediapipe/tasks-vision 的 wasm 运行时从 node_modules 直接托管出来，
// 不需要拷贝进 public，也不依赖 CDN（现场没网也能跑）。
const WASM_DIR = path.join(process.cwd(), "node_modules", "@mediapipe", "tasks-vision", "wasm");
const ALLOWED = /^vision_wasm[a-z_]*\.(js|wasm)$/;

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const name = parts.length === 1 ? parts[0] : "";
  if (!ALLOWED.test(name)) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(WASM_DIR, name));
    return new Response(body, {
      headers: {
        "Content-Type": name.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
