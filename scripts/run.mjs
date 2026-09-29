#!/usr/bin/env node
// 跨平台启动器（macOS / Windows / Linux），只依赖 Node 内置模块。
//   node scripts/run.mjs setup   安装/校验依赖（前端 node_modules + 后端 venv）
//   node scripts/run.mjs dev     同时启动 Next.js(:3000) 与 Python 后端(:8000)，热重载
//   node scripts/run.mjs build   构建前端
//   node scripts/run.mjs start   生产模式启动（缺少构建产物时自动先 build）
// 通常通过根目录 `npm run setup|dev|build|start` 调用。
//
// 设计要点（硬盘是 exFAT，要在三个系统间来回插拔）：
// - 依赖不跨平台：node_modules 含平台原生二进制，换系统后自动重装（需联网）；
//   Python venv 按 `.venv-<平台>-<架构>` 分开存放，互不影响。
// - 不使用符号链接、不依赖可执行位：一律 `node xxx.js` / `<venv>/python -m xxx` 调用。

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = join(ROOT, "frontend");
const BACKEND = join(ROOT, "backend");
const IS_WIN = process.platform === "win32";
const TAG = `${process.platform}-${process.arch}`;
const FRONTEND_PORT = process.env.FRONTEND_PORT ?? "3000";
const BACKEND_PORT = process.env.BACKEND_PORT ?? "8000";

const NODE_MODULES = join(FRONTEND, "node_modules");
const NODE_STAMP = join(NODE_MODULES, ".clubai-platform");
const NEXT_BIN = join(NODE_MODULES, "next", "dist", "bin", "next");

const VENV = join(BACKEND, `.venv-${TAG}`);
const VENV_PY = join(VENV, IS_WIN ? "Scripts" : "bin", IS_WIN ? "python.exe" : "python");
const REQUIREMENTS = join(BACKEND, "requirements.txt");
const REQ_STAMP = join(VENV, ".requirements-hash");

function fail(msg) {
  console.error(`\n[run] ${msg}`);
  process.exit(1);
}

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error || r.status !== 0) fail(`命令失败：${cmd} ${args.join(" ")}`);
}

// 通过 `npm run` 调用时 npm_execpath 指向 npm-cli.js，直接用 node 跑，避开 Windows 的 npm.cmd
function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (cli && basename(cli).startsWith("npm-cli")) runSync(process.execPath, [cli, ...args], { cwd });
  else runSync("npm", args, { cwd, shell: IS_WIN });
}

// macOS 往 exFAT 写文件时会生成 ._* 元数据文件，可能被 eslint/tsc/uvicorn 误当源码
function cleanAppleDouble(dir = ROOT) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".git" && e.name !== ".next" && !e.name.startsWith(".venv")) {
        cleanAppleDouble(p);
      }
    } else if (e.name.startsWith("._")) {
      rmSync(p, { force: true });
    }
  }
}

function ensureFrontend() {
  if (existsSync(NODE_STAMP) && readFileSync(NODE_STAMP, "utf8") === TAG) return;
  console.log(`[setup] 安装前端依赖（${TAG}）…`);
  const hasLock = existsSync(join(FRONTEND, "package-lock.json"));
  npm([hasLock ? "ci" : "install"], FRONTEND);
  writeFileSync(NODE_STAMP, TAG);
}

function findPython() {
  const candidates = IS_WIN ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  for (const [cmd, ...pre] of candidates) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys; print(sys.version_info >= (3, 10))"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "True") return [cmd, ...pre];
  }
  return fail("未找到 Python >= 3.10，请先安装 Python 并确保在 PATH 中。");
}

function ensureBackend() {
  if (!existsSync(VENV_PY)) {
    console.log(`[setup] 创建后端虚拟环境 ${basename(VENV)} …`);
    const [cmd, ...pre] = findPython();
    // --copies：不用符号链接（exFAT 在 Linux 上不支持）
    runSync(cmd, [...pre, "-m", "venv", "--copies", VENV]);
  }
  const hash = createHash("sha256").update(readFileSync(REQUIREMENTS)).digest("hex");
  if (existsSync(REQ_STAMP) && readFileSync(REQ_STAMP, "utf8") === hash) return;
  console.log("[setup] 安装后端依赖 …");
  runSync(VENV_PY, ["-m", "pip", "install", "--disable-pip-version-check", "-r", REQUIREMENTS]);
  writeFileSync(REQ_STAMP, hash);
}

function setup() {
  cleanAppleDouble();
  ensureFrontend();
  ensureBackend();
}

function build() {
  setup();
  runSync(process.execPath, [NEXT_BIN, "build"], { cwd: FRONTEND });
}

function serve(dev) {
  setup();
  if (!dev && !existsSync(join(FRONTEND, ".next", "BUILD_ID"))) build();

  const services = [
    {
      name: "web",
      cmd: process.execPath,
      args: [NEXT_BIN, dev ? "dev" : "start", "-p", FRONTEND_PORT],
      cwd: FRONTEND,
      env: { BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}` },
    },
    {
      name: "api",
      cmd: VENV_PY,
      args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", BACKEND_PORT, ...(dev ? ["--reload"] : [])],
      cwd: BACKEND,
      env: {},
    },
  ];

  console.log(`\n[run] 前端 http://localhost:${FRONTEND_PORT}   后端 http://127.0.0.1:${BACKEND_PORT}   Ctrl+C 退出\n`);

  let exitCode = null;
  let alive = services.length;
  const children = services.map((s) => {
    const child = spawn(s.cmd, s.args, { cwd: s.cwd, stdio: "inherit", env: { ...process.env, ...s.env } });
    child.on("error", (err) => {
      console.error(`[${s.name}] 启动失败：${err.message}`);
      stop(1);
    });
    child.on("exit", (code, signal) => {
      if (exitCode === null) console.log(`[${s.name}] 已退出（${code ?? signal}）`);
      stop(code ?? 1);
      if (--alive === 0) process.exit(exitCode);
    });
    return child;
  });

  function stop(code) {
    if (exitCode !== null) return;
    exitCode = code;
    for (const c of children) if (c.exitCode === null) c.kill();
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
}

const commands = { setup, build, dev: () => serve(true), start: () => serve(false) };
const cmd = commands[process.argv[2]];
if (!cmd) fail(`用法：node scripts/run.mjs <${Object.keys(commands).join("|")}>`);
cmd();
