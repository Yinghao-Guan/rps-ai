#!/usr/bin/env node
// 跨平台启动器（macOS / Windows / Linux），只依赖 Node 内置模块。
//   node scripts/run.mjs setup   安装/校验前端依赖
//   node scripts/run.mjs dev     启动 Next.js 开发服务器（:3000）
//   node scripts/run.mjs build   构建前端
//   node scripts/run.mjs start   生产模式启动（缺少构建产物时自动先 build）
// 通常通过根目录 `npm run setup|dev|build|start` 调用。
//
// 设计要点（硬盘是 exFAT，要在三个系统间来回插拔）：
// - node_modules 含平台原生二进制，不能跨平台共用：换系统后第一次运行自动重装（需联网）。
// - 不使用符号链接、不依赖可执行位：一律 `node xxx.js` 调用。

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = join(ROOT, "frontend");
const IS_WIN = process.platform === "win32";
const TAG = `${process.platform}-${process.arch}`;
const PORT = process.env.PORT ?? "3000";

const NODE_MODULES = join(FRONTEND, "node_modules");
const NODE_STAMP = join(NODE_MODULES, ".clubai-platform");
const NEXT_BIN = join(NODE_MODULES, "next", "dist", "bin", "next");
const NEXT_DIR = join(FRONTEND, ".next");
const NEXT_STAMP = join(NEXT_DIR, ".clubai-stamp");
// .next 里有平台相关内容和绝对路径（盘符/挂载点），所以按“平台 + 项目路径”打标记
const NEXT_STAMP_VALUE = `${TAG}|${FRONTEND}`;

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

// macOS 往 exFAT 写文件时会生成 ._* 元数据文件，可能被 eslint/tsc 误当源码
function cleanAppleDouble(dir = ROOT) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".git" && e.name !== ".next") cleanAppleDouble(p);
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

// 硬盘换了系统 / 换了盘符后，旧的 .next（开发缓存、构建产物）不能复用，直接清掉重建
function ensureNextDir() {
  if (!existsSync(NEXT_DIR)) return;
  if (existsSync(NEXT_STAMP) && readFileSync(NEXT_STAMP, "utf8") === NEXT_STAMP_VALUE) return;
  console.log("[setup] 平台或路径变了，清理旧的 .next 构建缓存…");
  rmSync(NEXT_DIR, { recursive: true, force: true });
}

function stampNextDir() {
  mkdirSync(NEXT_DIR, { recursive: true });
  writeFileSync(NEXT_STAMP, NEXT_STAMP_VALUE);
}

function setup() {
  cleanAppleDouble();
  ensureFrontend();
  ensureNextDir();
}

function build() {
  setup();
  runSync(process.execPath, [NEXT_BIN, "build"], { cwd: FRONTEND });
  stampNextDir(); // next build 会清空 .next，所以构建完再打标记
}

function serve(dev) {
  setup();
  if (!dev && !existsSync(join(FRONTEND, ".next", "BUILD_ID"))) build();

  if (dev) stampNextDir();
  console.log(`\n[run] http://localhost:${PORT}   Ctrl+C 退出\n`);
  // 只监听本机回环：Windows 上不会弹“允许 Node.js 访问网络”的防火墙提示，现场也不对局域网暴露
  const child = spawn(process.execPath, [NEXT_BIN, dev ? "dev" : "start", "-p", PORT, "-H", "127.0.0.1"], { cwd: FRONTEND, stdio: "inherit" });
  child.on("error", (err) => fail(`启动失败：${err.message}`));
  child.on("exit", (code) => process.exit(code ?? 0));
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const commands = { setup, build, dev: () => serve(true), start: () => serve(false) };
const cmd = commands[process.argv[2]];
if (!cmd) fail(`用法：node scripts/run.mjs <${Object.keys(commands).join("|")}>`);
cmd();
