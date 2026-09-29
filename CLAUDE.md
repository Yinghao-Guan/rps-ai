# CLAUDE.md

项目：**石头剪子布 AI**（目录名 clubAI）。学校 computer science club 社团展示日的摊位游戏：来的人对着摄像头和 AI 玩石头剪子布，赢了拿奖品，输了没有。展示日是**现场演示**，稳定压倒一切。

## 硬性规则

1. **跨平台、插盘即用**：项目放在 Samsung T7 移动硬盘（exFAT）上，须在 macOS / Windows / Linux 上运行且**不改代码**（目标设备已装好 Node 即可）。首选设备 ROG Strix SCAR 18（Windows，4090，摄像头 720p），备用 MacBook Pro 14" M4（1080p Center Stage 摄像头，可能外接 16" 4K 显示器）。
2. **Git 仅本地**：只有本地仓库，永远不建远程、不 push。何时提交由我判断；提交信息末尾带 Co-Authored-By 署名。
3. **前端 Next.js，包管理只用 npm**（不用 yarn / pnpm）。
4. **目前没有后端，也不要加。** AI 逻辑很轻，全部用 TypeScript 在浏览器里跑。用户不介意将来多开一个 Python 服务，但只有真出现重计算需求时才加（那时再决定框架，接口走同源 `/api/*` + Next rewrites）。
5. **现场可能没网**：运行时不得依赖任何 CDN / 在线字体 / 在线模型。MediaPipe 的 wasm 由 `/mediapipe/*` 路由从 node_modules 托管，模型在 `frontend/public/models/`，字体用 `@fontsource` 随包打包（不用 next/font/google、不用 CDN）。

## 产品需求（用户已确认）

**运行方式（用户已确认）**：默认停在 `standby`（待机，摄像头看到手也不会开始）。board 成员点侧栏 **Start match** 后，玩**一整场**（一位访客的一个 Bo3 / Series / Learning），场内各回合仍是“手一出现就自动倒数”；一场结束（或点 Stop）自动回到待机，必须再点 Start 才开始下一位。所有设置都在侧栏 **Settings** 按钮里（快捷键 `` ` `` / F2 仍可用），改任何设置都会中止当前场并回到待机。

三种对局模式，在 Settings 里切换：

| 模式 | 场景 | 规则 | AI |
|---|---|---|---|
| `quick` | 人多，要快 | Best-of-3（先赢 2 局），平局重打 | 只“略占优”：以 `quickEdge`(0.4) 的概率利用预测，其余随机 |
| `series` | 人少 | 打满 N 个有胜负的局（7–13，奇数，平局重打），胜局多者赢 | 全程在线学习，`deepEdge`(0.9) |
| `learning` | 人少 | 先 L 局（默认 10）**学习局**：AI 随机出招、只观察、不计分；再打最终局（1 局或 Bo3） | 学习局后用模型，`deepEdge` |

- **AI 算法**（`lib/ai/`）：层级平滑的条件频率模型（带时间衰减的变阶马尔可夫链）：人群先验 → 全局频率 → 条件于(上一局人的出招+结果) → 条件于最近两招。人群先验来自当天所有访客（localStorage 累积，越玩越准）。AI 出招 = 期望收益最大的招（以 edge 概率），否则均匀随机（对纯随机玩家不吃亏）。模拟见 `logic.test.ts`：对理想化的规律型玩家胜率很高，但**真人比模拟机器人随机得多，实际优势会小得多**，不要向用户承诺胜率。
- **AI 的招在 SHOOT 的同一时刻公开**（所有模式）：右上角常驻 AI 卡片，倒数时是 🔒 LOCKED，SHOOT 时翻出招式。因此存在“玩家看了再变招”的风险，已做两道防护：① 采集窗口缩到 SHOOT 后 `captureMs`(350ms)、只取最后 ~200ms（人看到→反应→变手形需 ~300–400ms）；② 读取失败后的重试回合 AI **强制纯随机**（`peekGuard`），否则玩家可故意藏手来偷看 AI 的（可预测的）出招。不要随意加大 `captureMs`。
- **可切回“经典版”**：Settings 里 “AI move timing” 开关，`revealAtShoot`（默认 true = 上面的 SHOOT 同时公开）；关掉 = 经典版：AI 的招采集结束后才揭晓、不显示 AI 卡片、用更长的采集窗口（`classicCaptureMs` 700 / `classicSettleMs` 300）、失败重试也不强制随机（因为没露出任何东西）。用户说倒数间隔很短时经典版更好用。
- **series 模式隐藏 AI 预测面板**（否则玩家看预测就能反制 AI，等于泄题）；整场结束时在摄像头区显示大比分。quick / learning 目前仍显示预测（用户只要求 series 隐藏）。
- **哈希锁定**：AI 在倒数前就锁定出招，右侧面板显示 `SHA-256(招式:nonce)`，揭晓时公开 nonce。用户明确说这主要是**视觉资产**（“很 CS、很 AI”），不是为了让人验证防作弊。
- **UI 设计（已定稿一版）**：风格取自社团 logo、秋季海报和官网 smccs.club，加上摊位装饰主题 **cmatrix**（摊位上有一台显示器一直跑 cmatrix）。要素：全屏**字符雨**背景（`MatrixRain`，半角片假名+数字；待机暗慢、对局中变亮、赢了爆亮、输了转红）；海报同款终端语言（面板标题 `$ cmd`、细描边圆角面板、斜体粗方标题+闪烁 `_` 光标、`FALL 2026` 描边药丸）；配色墨绿黑底 `#050d0a` + 薄荷绿 `#3fe0a0`（logo 青蓝 `#2bb8d6` 作辅色，输=红 `#ff5d73`，平=琥珀）；字体 **Russo One**（标题，斜体）+ **Roboto Mono**（正文），二者与官网一致，用 `@fontsource/*` 随包打包（离线可用）；emoji 手势用 CSS 滤镜调成薄荷单色（`.emoji-mint`）。侧栏有**动态神经网络**（`NeuralNet`）、哈希“解密”动画（`Scramble`）、预测条、识别遥测等 AI 感面板。设计令牌在 `globals.css` 顶部。
  - ⚠️ **神经网络只是装饰动画**（用户明确要“假装在运行”）：不反映真实模型内部，也不泄露预测；活跃度只随对局阶段变化，输出节点在 AI 的招公开后才亮。不要在文案里给它编造参数量、准确率等数字。
  - logo 用 `public/brand/logo.png`（用户提供的 180×180 透明 PNG，分辨率偏低，页眉里以 64px 显示；若拿到矢量/高清版应替换）。
  - 字符雨里的半角片假名依赖系统 CJK 字体回退（macOS/Windows 自带；Linux 需装 Noto CJK，否则显示方块）。
- 识别不出手势 → 本回合作废并提示重来（“Today”面板有误读率统计）；工作人员可按 R/P/S 人工录入。

## 目录结构

```
clubAI/
├── package.json         # 仅编排脚本，无依赖、无 lockfile
├── scripts/run.mjs      # 跨平台启动器（setup/dev/build/start）
└── frontend/            # Next.js 16 · App Router · TypeScript · Tailwind v4 · src/ · 别名 @/*
    ├── public/models/hand_landmarker.task     # MediaPipe 手部模型（Apache 2.0，已提交）
    └── src/
        ├── app/                  # page.tsx → GameLoader(ssr:false) → GameApp；mediapipe/[...path]/route.ts 托管 wasm
        ├── components/           # GameApp（摄像头循环+布局）/ Header / Stage（大字）/ SidePanel / AdminPanel / MatrixRain / NeuralNet / Scramble
        └── lib/
            ├── game/             # types, config(三种模式+参数), match(对局规则，纯函数)
            ├── ai/               # predictor(马尔可夫), population(人群先验), strategy(出招决策)
            ├── engine/engine.ts  # 一局的状态机：standby→idle→countdown→capturing→reveal→result(→retry/matchOver→standby)
            ├── vision/           # classify(21点→石头/剪刀/布), tracker(MediaPipe), draw(骨架)
            ├── sha256.ts, persist.ts
            └── *.test.ts
```

依赖方向：`components → engine → ai/game`；`vision` 只产出帧喂给 `engine.pushFrame`。`game/ ai/ engine/ sha256 vision/classify` 都是**纯 TS、无 DOM 依赖**，import 带 `.ts` 后缀，可在 Node 里直接测。

## 常用命令（项目根目录）

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 `http://localhost:3000`（缺依赖时自动装） |
| `npm run build` / `npm run start` | 生产构建 / 生产启动（**展示日建议用生产模式**） |
| `npm run setup` | 只装/校验依赖 |
| `cd frontend && npm run lint` | ESLint |
| `cd frontend && npm run test:logic` | 逻辑 + 引擎测试（Node 内置 runner 直接跑 TS，需 Node ≥ 22.18） |
| `cd frontend && node node_modules/typescript/bin/tsc --noEmit` | 类型检查 |

端口可用环境变量 `PORT` 覆盖。

## 视觉层要点

- 分类器用 **3D 世界坐标**里食指~小指 PIP 关节的弯曲角：伸直 ≈150–165°，握紧 ≈40–90°（用 MediaPipe 真实输出测得）。阈值 `UP_ANGLE=130 / DOWN_ANGLE=115` 在 `classify.ts` 顶部；右侧面板实时显示四个角度，现场可据此微调。石头=四指全弯，剪刀=食中伸+无名小指弯，布=至少三指伸，其余（如只伸食指）→ null。
- 多只手取包围盒最大的；`minHandArea` 过滤背景围观者。判定手势取 SHOOT 后采集窗口最后 `settleMs` 内的**众数**（≥3 帧、一致性 ≥60%）。
- **只在真实摄像头前验证过一半**：wasm/模型加载、GPU 检测、分类器在 emoji 手上跑通，但内置浏览器没有摄像头，真手、真实光照下的准确率**未测**。
- **手指朝向镜头（端对端出拳）时 MediaPipe 会读不准**（指尖互相遮挡，深度估计弱），用户决定**不做软件修复**，告诉玩家换角度（手掌/手背朝镜头）即可；斜上方外接摄像头是可选的硬件缓解。
- MacBook 的 Center Stage 会自动重构图，可能影响识别，现场建议在控制中心关掉；720p 摄像头在手离镜头较远时手偏小，需调小 `minHandArea`。

## exFAT 硬盘的坑（据此设计）

T7 是 **exFAT**：没有符号链接、没有可执行位；macOS 还会不停生成 `._*` 垃圾文件。

- **不要用符号链接，不要依赖 `chmod +x` / shebang 直接执行。** 脚本一律 `node scripts/x.mjs` 方式调用。
- `frontend/.npmrc` 里 `bin-links=false`：node_modules 里没有 `.bin`，所以 `package.json` 的脚本要写成 `node ./node_modules/<pkg>/...`，**不能直接写 `next` / `eslint`**。
- **node_modules 不跨平台**（含原生二进制）。启动器在 `node_modules/.clubai-platform` 记录平台，换系统后第一次运行会自动 `npm ci` 重装（需联网，**展示前务必在目标电脑上先跑一次**）。`package-lock.json` 含全平台条目，务必提交。
- **`._*` 文件会被 eslint/tsc 当源码解析而报错**（真发生过）。已在 `eslint.config.mjs` / `tsconfig.json` / `.gitignore` 里排除，启动器每次也会清理。看到奇怪解析错误先查 `._xxx`。
- `.gitattributes` 强制 LF（`.bat/.cmd/.ps1` 为 CRLF）。本地仓库已设 `core.fileMode=false`、`core.symlinks=false`、`core.autocrlf=false`。
- 路径处理：Node 用 `path.join`，不拼 `/` 或 `\`。引用文件时大小写必须与磁盘完全一致（exFAT 不区分大小写，macOS 上写错不报错，换到 Linux 才炸）。
- Linux 上若 git 报 “dubious ownership”：`git config --global --add safe.directory <项目路径>`。
- 键盘快捷键用 `e.code` 而不是 `e.key`（中文输入法开着时 `e.key` 是 "Process"）。

## 约定

- 沟通用中文；代码标识符、commit message 用英文。
- 写 Next.js 代码前先看 `frontend/AGENTS.md`（由 `next dev` 自动维护，已被 `frontend/CLAUDE.md` 引用）：这个版本与训练数据里的 Next 有破坏性差异，权威文档在 `frontend/node_modules/next/dist/docs/`。
- 先做用户要求的，不要顺手加没被要求的功能、依赖或抽象。
- 加依赖：`cd frontend && npm install <pkg>`（提交更新后的 `package-lock.json`）。
