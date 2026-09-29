# CLAUDE.md

项目：**石头剪子布 AI**（目录名 clubAI）。具体需求由用户后续逐步给出，此文件只记录长期有效的规则与工程约定。

## 硬性规则

1. **跨平台、插盘即用**：项目放在 Samsung T7 移动硬盘上，须在 macOS / Windows / Linux 上运行，且**不改代码**（目标设备已装好 Node、Python 环境即可）。写任何代码、脚本、路径处理前先想三个系统会不会都行。
2. **Git 仅本地**：只有本地仓库，永远不建远程仓库、不 push。何时提交由我判断；提交信息末尾带 Co-Authored-By 署名。
3. **前端 Next.js，包管理只用 npm**（不用 yarn / pnpm）。**后端单独用 Python**，与前端是两个独立进程，允许多开一个服务。

## 目录结构

```
clubAI/
├── package.json        # 仅编排脚本，无依赖、无 lockfile
├── scripts/run.mjs     # 跨平台启动器（setup/dev/build/start）
├── frontend/           # Next.js 16 · App Router · TypeScript · Tailwind v4 · src/ · 别名 @/*
└── backend/            # Python · FastAPI + uvicorn
    ├── requirements.txt
    └── app/main.py     # ASGI 入口 app.main:app，路由统一挂在 /api/*
```

## 常用命令（在项目根目录）

| 命令 | 作用 |
|---|---|
| `npm run setup` | 装/校验依赖（前端 node_modules + 后端 venv），其余命令会自动先执行 |
| `npm run dev` | 同时启动前端 `:3000`（热重载）与后端 `:8000`（`--reload`），Ctrl+C 一并退出 |
| `npm run build` / `npm run start` | 生产构建 / 生产启动 |
| `cd frontend && npm run lint` | ESLint |

端口可用环境变量 `FRONTEND_PORT` / `BACKEND_PORT` 覆盖。

前后端通信：浏览器只请求前端同源的 `/api/*`，由 `frontend/next.config.ts` 的 rewrites 转发到 Python 后端（默认 `http://127.0.0.1:8000`，由 `BACKEND_URL` 覆盖）。所以前端代码里写相对路径 `fetch("/api/...")`，不要写死后端地址，也就无需 CORS。新增后端路由必须以 `/api/` 开头。

## 为什么有这些“怪”设计（exFAT 硬盘的坑）

T7 是 **exFAT**：没有符号链接、没有可执行位；macOS 还会不停生成 `._*` 元数据垃圾文件。据此：

- **不要用符号链接，不要依赖 `chmod +x` / shebang 直接执行。** 脚本一律 `node scripts/x.mjs` / `<venv>/python -m x` 方式调用。
- `frontend/.npmrc` 里 `bin-links=false`：node_modules 里没有 `.bin`，所以 `package.json` 的脚本要写成 `node ./node_modules/<pkg>/...`，**不能直接写 `next` / `eslint`**。新增依赖需要 CLI 时同理（先确认它的入口 js 路径）。
- **node_modules 不跨平台**（含原生二进制）。启动器在 `node_modules/.clubai-platform` 记录平台，换系统后第一次运行会自动 `npm ci` 重装（需联网）。`package-lock.json` 含全平台条目，务必提交。
- **Python venv 按平台分开**：`backend/.venv-<platform>-<arch>`，用 `python -m venv --copies` 创建，互不覆盖；`requirements.txt` 变化时自动重装。Python 需 ≥ 3.10；Windows 上命令名可能是 `py -3` / `python`，启动器已探测，自己写脚本时别硬写 `python3`。
- `._*` 已在 `.gitignore`，启动器每次运行会清理项目里的（不含 node_modules / venv）。看到奇怪的解析报错先查是不是 `._xxx.ts` / `._xxx.py`。
- `.gitattributes` 强制 LF（`.bat/.cmd/.ps1` 为 CRLF）。本地仓库已设 `core.fileMode=false`、`core.symlinks=false`、`core.autocrlf=false`（这些在 `.git/config`，不随盘外克隆走；仓库就在盘上，所以没问题）。
- 路径处理：Node 用 `path.join`，Python 用 `pathlib`；不要拼 `/` 或 `\`，引用文件时大小写必须与磁盘上完全一致（exFAT 不区分大小写，macOS 上写错不报错，换到 Linux 的 Node/Python 才会炸）。
- 在 Linux 上若 git 报 “dubious ownership”，用 `git config --global --add safe.directory <项目路径>`（exFAT 无属主信息）。

## 约定

- 写 Next.js 代码前先看 `frontend/AGENTS.md`（由 `next dev` 自动维护，已被 `frontend/CLAUDE.md` 引用）：这个版本与训练数据里的 Next 有破坏性差异，权威文档在 `frontend/node_modules/next/dist/docs/`。

- 沟通用中文；代码、标识符、commit message 用英文。
- 先做用户要求的，不要顺手加没被要求的功能、依赖或抽象。
- 加依赖：前端 `cd frontend && npm install <pkg>`（提交更新后的 `package-lock.json`）；后端写进 `backend/requirements.txt`。
