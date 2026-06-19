# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Solar Wanderer · 遨游太阳系 — Claude Code 操作指南

项目名：**Solar Wanderer / 遨游太阳系**（2026-06-11 定名，仓库 github.com/hyqzz/Solar-Wanderer，MIT 协议）。代码中 `heliosphere` 仅指日球层物理结构，非旧项目名。

这是一个基于真实 NASA JPL 星历的浏览器端 1:1 太阳系实时探索应用，范围从太阳表面延伸至 10 万 AU 的奥尔特云。

- 在线演示： https://sw.icodestar.net
- GitHub Pages（main 分支自动部署）： https://hyqzz.github.io/Solar-Wanderer/
- 演示视频： https://youtu.be/3rwShi6oF0o

## 常用命令

```bash
npm install          # 安装 three + vite + puppeteer
npm run dev          # Vite 开发服务器 → http://localhost:5173
npm run build        # 生产构建 → dist/（纯静态部署）
npm run preview      # 预览构建产物（先 build）
npm test             # 33 项离线单元/星历精度测试（Node 原生 test runner）
node --test tests/ephemeris.test.mjs   # 运行单个测试文件
node --test tests/*.test.mjs           # 运行全部测试文件
npm run verify       # 在线与 NASA JPL Horizons 实时对照（需联网）
npm run fit-moons    # 重新拟合卫星轨道到当前历元
npm run fetch-textures # 重新下载贴图资产
```

构建失败时先跑 `npm test`；`npm run verify` 失败通常是网络或 JPL API 可达性问题。

## 构建与部署

- Vite 配置为 `base: './'`，产物是纯静态文件，可直接复制 `dist/` 到任意 CDN/静态服务器。
- 多入口构建：`index.html`（中文）和 `en/index.html`（英文）会分别输出到 `dist/` 和 `dist/en/`。
- GitHub Pages 自动部署由 `.github/workflows/deploy.yml` 处理，push 到 `main` 时自动触发：
  - `npm ci` → `npm test` → `npm run build` → `actions/deploy-pages@v4`
  - 部署地址：https://hyqzz.github.io/Solar-Wanderer/

## 运行时验证 / 探针工具

`tools/` 目录下的脚本按用途分为三类，多数需要本地 dev server 已启动：

- **离线生成/拟合/验证**
  - `node tools/verify-ephemeris.mjs` — 在线与 JPL Horizons 交叉验证（`npm run verify` 的入口）
  - `node tools/make-fixtures.mjs` — 重新生成 `tests/fixtures.json`（需联网）
  - `node tools/fit-moons.mjs` — 用 Horizons 状态向量重新拟合 21 颗卫星轨道
  - `node tools/fetch-textures.mjs` — 下载贴图资产
- **回归 / 冒烟（需 dev server）**
  - `node tools/repro-r8.mjs` — 屏幕中心缩放三场景断言
  - `node tools/repro-r9.mjs` — 镜头/地形/海洋/惯性模式断言
  - `node tools/repro-r10.mjs` — 焦点/水体/V 连续性断言
  - `node tools/repro-issue*.mjs` — 具体 issue 的回归验证
  - `node tools/repro-mobile-takeoff.mjs` — 移动版起飞后 GE 式拖拽/缩放灵敏度回归
  - `node tools/repro-fixbatch.mjs` — 批量修复回归
  - `node tools/smoke-i18n.mjs` — 中英双语 UI 冒烟
  - `node tools/smoke-mobile.mjs` — 移动端触控 UI 冒烟
- **主动探测 / 截图（需 dev server）**
  - `node tools/probe-r7.mjs` — 自动登陆/起飞/气巨入气
  - `node tools/probe-r8-shot.mjs` — 截图探测
  - `node tools/probe-maxdist.mjs` — 400 AU 远距标签可见性
  - `node tools/audit-visuals.mjs` — 视觉审查
  - `node tools/capture-demo.mjs` / `capture-mobile.mjs` — 生成演示截图

## 技术栈

- Three.js 0.165 + Vite 5 + 原生 ESM，无 TypeScript。
- WebGL2，对数深度缓冲（logarithmic depth buffer）。
- 星历层为纯函数，可在 Node 中独立测试。

## 高层架构

| 层 | 目录 | 核心职责 |
|---|---|---|
| 星历层 | `src/astro/` | 行星/月球/卫星/小天体/TNO 轨道、自转、时间换算、物理常数。纯函数，Node 可测。 |
| 引擎层 | `src/engine/` | 相机（GE 式轨道 + 行走/飞行）、飞船/行走物理、输入、浮动原点、质量分级。 |
| 渲染层 | `src/scene/` | 太阳、行星材质、大气散射、环、星空、彗星、TNO、小行星带、柯伊伯带、奥尔特云、地形。 |
| UI 层 | `src/ui/` | HUD、标签投影、搜索/目录、科教卡片、国际化。 |

关键文件：

- `src/astro/time.js` — UTC → TT → JD 换算，所有星历的输入时间基准。
- `src/astro/planets.js` / `moon.js` / `moons.js` / `tno.js` — 轨道根数与位置计算。
- `src/astro/bodies.js` — 天体物理/自转参数与 IAU 自转模型。
- `src/engine/orbitCamera.js` — 探索模式相机：体固系 `lat/lon/dist`、焦点管理、延迟焦点过渡、自动登陆/起飞。
- `src/engine/ship.js` — 6DOF 飞行 + 地表行走 + 水下浮力。
- `src/engine/world.js` / `floating.js` — 浮动原点场景图与远距离注册。
- `src/engine/quality.js` — GPU 自适应分档（high/lite）与运行时降档。
- `src/scene/builder.js` — 天体网格组装入口。
- `src/scene/terrain.js` — 多尺度地形与 LOD 原点相对坐标精度处理。
- `src/scene/atmosphere.js` — 光线步进大气（Nishita 风格）与气巨入气。
- `src/main.js` — 应用初始化与主循环。

## 坐标系约定

- **计算坐标系**：日心黄道 J2000，单位 km。
- **→ Three.js 世界**：`(x, y, z)_ecl → (x, z, -y)_three`，黄道北极对应 +Y。
- **体固系 → 世界**：同样映射；本初子午线指向本地 +X，北极指向 +Y。
- 太阳点光源强度 = `2.5 / dAU²`（StandardMaterial）；自定义着色器内按 `1/d²` 缩放。

## 尺度与精度

- 真 1:1 km 尺度；浮动原点 + 对数深度支撑 0.5 m 到 1.5×10¹³ km（10 万 AU）。
- `camera.far = 1e15 km`（约 106 光年），21 颗真实亮星以真实 3D 位置注册并产生视差。
- 精度基准（vs JPL Horizons）：行星 ≤0.074°，月球 ≈0.12°，卫星 +10 天 ≤0.22°。
- 地形/噪声使用级原点相对坐标以避免 fp32 在行星半径量级下的量化抖动。

## 交互模式（影响相机/输入代码）

1. **探索模式（OrbitCamera）**：默认；GE 式拖拽/滚轮缩放、焦点锁定、点击天体后滚轮平滑过渡、近地表自动登陆。
2. **飞行模式（Ship）**：按 `F`；6DOF 自由飞行，速度 1 m/s → 2 AU/s。
3. **行走模式（Ship）**：地表/水下；WASD 移动、鼠标视角、可下潜/上浮。
4. **惯性观察**：按 `V` 切换体固/惯性锚定，用于观察卫星绕转。

## 测试与验证

- 单元测试在 `tests/*.test.mjs`：
  - `tests/ephemeris.test.mjs` — 行星/月球/卫星/TNO 位置精度
  - `tests/kepler.test.mjs` — 开普勒轨道计算
  - `tests/physics.test.mjs` — 物理常数与运动学
  - `tests/rotation.test.mjs` — IAU 自转模型
  - `tests/time.test.mjs` — UTC/TT/JD 换算
- 离线基准数据在 `tests/fixtures.json`。
- 若 `npm test` 因 fixtures 缺失失败，可运行 `node tools/make-fixtures.mjs`（需联网）重新生成。
- 新增星历或轨道改动后，应跑 `npm run verify` 与 `npm test`。

## 已知限制（已接受）

1. 卫星长期 J2 进动未建模，数月后相位误差缓慢增长——建议每季度跑 `npm run fit-moons`。
2. 无日月食阴影投射（仅土星环影投射到行星本体已实现）。
3. 地形为噪声+真实反照率融合，非真实 DEM。
4. 无声音设计。
5. 气巨大红斑等特征为静态贴图，不随系统 III 经度对准。

## 代码风格（来自 CONTRIBUTING.md）

- 原生 ESM，不在源码里用打包器魔法。
- 能用函数就不用类。
- 注释应解释“为什么”，不要重复代码字面意思。
- 提交 PR 前确保 `npm test` 通过。

## 详细文档索引

- `docs/sdlc/change-document.md` — 全部迭代（R1–R12）的完整变更记录。
- `docs/sdlc/design-document.md` — 技术设计。
- `docs/sdlc/test-report.md` — 测试报告与基准。
- `docs/sdlc/screenshots/` — 冒烟与审查截图。
- `README.md` — 项目介绍、演示链接、控制说明。
- `CONTRIBUTING.md` — 贡献指南、PR 流程、最想要的贡献方向。
