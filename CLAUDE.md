# Solar Wanderer 遨游太阳系（原 Heliosphere）— 项目交接与恢复指南

> 项目名：**遨游太阳系 Solar Wanderer**（2026-06-11 定名，开源仓库 github.com/hyqzz/Solar-Wanderer，MIT 协议）。代码中 heliosphere 字样均指物理日球层结构，非旧项目名。

> 创建：2026-06-10 ｜ 环境：Windows 11 + Node v24 + npm 11 ｜ 最后完整构建通过 ✅

## 快速恢复（迁移到新电脑后）

```bash
cd <项目目录>
npm install          # 安装 three + vite
npm run dev          # 启动开发服务器 → http://localhost:5173
npm test             # 验证星历精度（33/33 通过）
npm run verify       # 与 NASA JPL Horizons 实时对照（需联网）
```

构建产物：`npm run build` → `dist/` 静态部署；JS 598kB（gzip 169kB）。

## 项目目标

太阳系 **1:1** 实时自由探索游戏：基于系统时间（UTC→TT→JD）精确还原此刻的太阳系，从太阳表面到 120 AU 的日球层顶，自由飞行、登陆行走、身临其境。核心体验参考 Google Earth（GE）扩展到全日球层 + SpaceEngine 视觉级精细度。

## 技术栈

Three.js 0.165 + Vite 5 + 原生 ESM（无 TypeScript）。纯浏览器 WebGL2，对数深度缓冲。

## 架构（四层）

| 层 | 文件 | 说明 |
|----|------|------|
| 星历层 | `src/astro/` | 纯函数模块（Node 可测），含 JPL Standish 行星元素、截断 ELP 月球、IAU 自转、Horizons 拟合卫星根数、天体物理库 |
| 引擎层 | `src/engine/` | OrbitCamera（GE 式环绕+极点穿越翻转）、Ship（6DOF+行走）、Input（拖拽/键盘/指针锁定）、World（浮动原点） |
| 渲染层 | `src/scene/` | 太阳着色器、行星材质（昼夜/海洋/环影）、大气散射（光线步进 Nishita）、环、星空（银河+真实亮星）、带、彗星、日球层、地形 |
| UI 层 | `src/ui/` | HUD、标签投影、搜索框+目录侧栏、科教知识卡片（eduFacts.js） |

## 星历验证（NASA JPL Horizons 对照）

| 天体 | 精度 |
|------|------|
| 行星（9 个） | 角差 0.0007°–0.074° |
| 月球 | 0.12°（截断 ELP） |
| 卫星（21 颗） | 历元处 0°，+10 天 ≤0.22°（双历元速率修正） |
| 自转 | 地球日下点 12UTC≈0°、夏至纬度 +23.4°、1 恒星日回归 |

离线验证：`tests/fixtures.json`（2026-06-10 历元 JPL 基准）。

## 已交付的关键功能（按迭代轮次）

### R1：基础（分析→设计→实现→测试→交付）
- 9 行星 + 21 卫星 + 冥王星 + 月/火/土卫等精确轨道（拟合+JPL 验证）
- 浮动原点 + 对数深度 → 1:1 km 真值，0.5m–120 AU 无缝
- NASA/USGS 实测贴图 20/23（8K 地/月/火/木，新视野冥王星等）
- 飞船 6DOF（1 m/s → 2 AU/s）、自动驾驶、登陆行走（真实 g）

### R2：Google Earth 范式
- 默认探索模式：体固系 (lat/lon/dist) 锚定、拖拽惯性、滚轮指数缩放、焦点居中
- GE 签名弧线飞行动画（1.8–7s 墙钟驱动）、搜索框/天体目录侧栏
- 日球层边界地标（终止激波/日球层顶）

### R3：逼真度修复 + 交互升级
- 半屏发亮 bug：日心结构（带/尘光/日球层壳）**必须 world.register**
- GE 完整键盘：WASD 平移、Shift+A/D 航向、Shift+W/S 倾斜、PageUp/Down、R 复位
- 极点穿越翻转（chart flip）：所有视角全部 360° 无限循环
- NMS/SE 地表：多尺度高度 + 片元凹凸 + 三尺度细节噪声 + 岩石散布
- 浮动原点精度乱纹：片元噪声坐标改用"噪声原点相对坐标"

### R4：用户反馈修复
- 土星环 NASA 淡金褐色调 + 冰粒掠射散射；天王星环暗炭灰
- 行走 360° 俯仰（无钳制无快速旋转）
- 右键/中键拖拽 = 空间平移（无旋转）
- 搜索下拉默认列表含轨道线开关
- 科教知识卡片（60+ 条真实知识，换一条交互）

### R5：全局 NASA 审查
- **环影投射到行星本体**（卡西尼标志性特征）
- **21 颗真实亮星**（依巴谷 RA/Dec/星等，中文星名+光年距离）
- **白昼星空淡出**（大气内日光散射淹没星光，物理正确）
- **标签球体遮挡**（地平线下/背面隐藏）
- 地球海面深蓝（无岩石）、火星奶油黄褐天空、太阳特写曝光保留细节

### R7：无缝着陆连续体 + SpaceEngine 级视觉 + GPU 自适应（2026-06-11）
- **NMS 式无缝降落**：滚轮一路拉近→近地自动倾斜（俯视→平视）→贴地 2.2m 自动转行走（位置/视向严格连续）；行走中滚轮后退=无缝起飞。相机下限=地形高度+1.7m（与行走碰撞同源 heightFn）
- ~~指针中心缩放~~（R8 按用户修订移除：滚轮与 PageUp/Down 统一为**屏幕中心**缩放）
- **行走视角**：鼠标方向与探索一致（yaw +=）、灵敏度 0.0011+τ=50ms 平滑、输入层尖峰钳制±150px/事件、360° 全维度无钳制
- **外行星 SE 级**：行星材质片元程序化细节（气巨纬向湍流+风暴涡+临边昏暗；按视半径淡入，uDetailMode=0 零开销）；**人眼暗适应补偿** I<1→I^0.55（仅太阳光照通道，地球处恒等，星空/曝光不受影响）
- **气巨入气**：可下潜至云甲板上空（R×1.0012）；大气 uBoost 密度增幅（大气外恒 1=零回归）+ 全屏浸没层 #immersion
- **GPU 自适应**：`quality.js` — powerPreference 选独显、debug_renderer_info 分档（lite：像素比1/泛光¼/大气步进8/网格48/细节关）、`?quality=high|lite` 强制、FPS<28×4s 运行时降档
- 操控补充：拖拽灵敏度∝离地高度、Ctrl+左键拖拽=航向/倾斜、模式切换 adoptPosition(quat) 视向连续

### R8：气巨大气边界修复 + 屏幕中心缩放（2026-06-11）
- **气巨双边界/外圈线修复**：大气抖动项×alpha（旧实现全盘叠加，高曝光显形为 Ra 圆圈线）；射线求交椭球化（uAxis/uStretch 拉伸空间法，t 参数与真实空间共享；可登陆体 uStretch=0 数学恒等）—— 大气辉光贴合压扁的真实轮廓
- **屏幕中心缩放**：滚轮/PageUp/Down 统一屏幕中心语义。倾斜或右键平移后（视线不指向轨道锚点）缩放改为**沿视线推拉**：深度=屏幕中心命中天体（orbitEnv.centerDepth 全天体探测，太阳居中即收敛到日面）或锚点投影（捕获后随推进递减——位移吸收进 panOffset 后锚点随相机同移，深度必须独立跟踪否则匀速冲越）；滚轮按 deltaY/100 归一化+按帧钳制 ±3 防高速滚轮离散跳跃
- 验证：`node tools/repro-r8.mjs`（3 场景量化断言）；截图对照 `docs/sdlc/screenshots/r8-{before,after}-*.png`

### R9：镜头系统深度修复 + 地表/海洋/天体真实性（2026-06-12）
- **焦点交接**：平移把其他天体居中后滚轮拉近 → 手势起点 `env.centerHit` 命中即 `adoptPosition` 交接焦点（视向连续），登陆链路（minDist/自动倾斜/自动行走）全部随焦点切换——根治"平移后缩放跳回原焦点"（旧实现每帧实时重定推拉目标，视线漂移扫过近处天体时参考深度突变猛冲）；推拉手势全程锁定单一目标不换靶
- **缩放灵敏度由低到高**：轻拨 ×1.12/格 → 连滚渐加速至 ×1.38/格；PageUp/Down 按住 0.55→2.2/s；**远离上限 250 AU**（日球层顶 121 AU 完整入画即停，MAX_DIST=3.74e10 km，飞行模式同界）
- **行走视角彻底防快速旋转**：每帧累计输入钳制 ±260px（事件堆积）+ 卡顿帧平滑系数按 dt≤33ms 计（积压分帧释放）+ 指针锁定切换 150ms 静默（Chromium 突发事件串）+ 灵敏度 0.00085
- **惯性观察模式（V）**：`frameQuat()` 切换体固/惯性锚定，切换经 adoptPosition 位置视向严格连续；加速时间观赏卫星绕转
- **登陆闪烁根治**：地形顶点改"级原点相对坐标"（旧实现顶点模≈R，fp32 在 6400km 模长下量化 0.5m 与眼高同量级）——每 LOD 级独立 origin（fround 取 fp32 精确值）+ uPatchRel（CPU 双精度差值）供片元噪声；LOD 环带重叠区按级 polygonOffset 后推消 z-fight；新增最内 30m 级（格距 ~1m）
- **海洋可下潜**（R9-2b）：`heightSolid`=海床（水非固体），相机/行走碰撞用之；水面顶点 water attribute → 低粗糙度+时变波纹法线；水下深海雾+光照指数衰减+浸没层；行走浮力 g×0.12、Space 上浮、终端下沉 2.5 m/s；穿云薄纱（云甲板高度白雾）
- **天体真实性**：火卫一/二三轴椭球（27×22×18 / 15×12×11 km，`shape.dims`+HeightField 变形网格=碰撞视觉同源）；pluto.jpg 原为 HTML 错误页→换新视野号真实拼图（心形平原可见）；titan/callisto 真实贴图补齐；小天体地形激活半径改按半径比例（火卫一远处不再见地形色块）
- 验证：`node tools/repro-r9.mjs` + `node tools/probe-r9.mjs`（水下/惯性/形态端到端）；全回归 repro-r7 6/6、repro-r8 5/5、单元 33/33

### R10：焦点显式化 + 任意高度/深度定位 + 按键修复（2026-06-12）
- **焦点只显式切换**（撤销 R9 滚轮隐式交接）：单击天体 = 锁定焦点（pickBody 屏幕拾取 ~0.7° 容差，adoptPosition 位置/视向连续）；滚轮/PageUp/Down 严格沿屏幕中心推拉；推拉目标=焦点时下限用地形高度 → 点击后滚轮一路直达自动登陆
- **高度等比缩放**：缩放步长 ∝ 离地高度（base=minDist−2m），贴地米级精度可悬停任意高度（旧实现按中心距等比，贴地一格外推 700 km）；键盘平移/旋转按住渐加速（0.45→1.65）
- **水体交互**：默认登陆水面站立；水面滚轮下/PageDown = 下潜；水中**中性浮力**——滚轮低灵敏度升降（浅 0.4m/格、深处按深度 12%），停止即悬停任意深度；浮出水面自动恢复（submerged 状态消 1.7m 死区）；水面滚轮上 = 起飞
- **GE 按键失效修复**：指针锁定切换会 clear 按键集，按住的键被 `e.repeat` 早退丢弃 → repeat 事件重新 add（登陆/起飞后按住的 WASD 立即恢复）
- **V 键跳跃根治**：`groundRadiusOf` 惯性换算曾复用 `_qf`，覆盖 setInertial 待恢复视向（仅可登陆天体触发——地球/火星/冥王星跳、木星正常的原因）→ 专用 `_qg`
- 验证：`node tools/repro-r10.mjs`（12 断言）+ `node tools/probe-r10.mjs`（起飞后按键/点击拾取/V 连续性端到端）

### R10-fix（2026-06-12）：修复返回探索模式 GE 操控失效 + 右键平移后滚轮跳回原空间
- **问题 1**：登陆后按 G 或滚轮起飞返回探索模式，GE 键盘/滚轮感觉"失效"。
  - 根因：相机在体表面上方 1.7 m，平移速率被压到极低；滚轮已触地下限；adoptPosition
    把 `this.tilt` 设为 `-autoTilt`，抬升后 auto-tilt 消失导致视线指向地平线下方，
    滚轮进入 dolly 分支而不再改变距离。
  - 修复：`switchToOrbit()` 中把 `this.tilt` 复位为 0，并把 `distTarget` 抬升
    `max(dist×0.002, 0.05) km`，让相机回到有响应的高度，同时由 auto-tilt 自然接管。
- **问题 2**：右键平移空间后再滚轮缩放，look-at 点被甩回焦点方向（"跳回原空间"）。
  - 根因：旧实现把"有 panOffset"一律判为 offAxis 并走 dolly；dolly 在视线仍径向时
    把径向位移吸收进 panOffset，导致 look-at 点漂移；近地 auto-tilt 出现后
    viewRadial 变假，手势中途中断切 dolly，进一步放大漂移。
  - 修复：
    - 径向/dolly 选择改为基于实际视线与平移方向：典型横向平移（垂直于径向）且
      视线径向时走径向缩放，保持 panOffset / look-at 点固定；平移带径向分量或
      用户倾斜导致视线偏离径向时才走 dolly。
    - 引入 `_radialGesture` 手势锁：一旦开始径向缩放，连续 0.35 s 内无缩放输入才
      清空标记，防止滚轮多格之间的短暂停顿误判为新手势。
    - 外部设置 `distTarget` 后（如起飞/返回探索的抬升）即使没有缩放输入也走径向
      平滑过渡。
- 新增验证：`tools/repro-issue1.mjs`（返回探索后 WASD/Shift+W/滚轮生效）+
  `tools/repro-issue2.mjs`（右键平移后滚轮缩放 look-at 点不漂移）。

### R10-fix-2（2026-06-12）：点击目标后镜头先不动，滚动/PageUpDown 再平滑切换焦点并居中
- **问题**：探索模式下点击天体（或标签）后，用户希望镜头保持不动；只有滚动鼠标滚轮
  或按 PageUp/Down 接近/远离时，才平滑切换到新焦点并移动相机，同时把目标持续保持在
  屏幕中心；过程中可随时停止，也能随时改点其他目标重新定位。
- **根因**：原实现点击天体/标签后立即调用 `adoptPosition` 切换焦点，不符合
  "先不动再平滑过渡" 的交互预期；早期过渡实现仅对相机位置/朝向做线性/slerp 插值，
  目标在过渡过程中会偏离屏幕中心，导致接近时误差过大。
- **修复**：
  - 探索模式下单击天体/标签不再立即切换焦点，而是调用 `orbitCam.setPendingFocus(id,
    localDir?, localDist?)` 设置延迟焦点，相机位置/朝向严格保持不动。
  - `OrbitCamera` 新增 `pendingFocusId`、`pendingTargetLocal` 与 `transition` 状态。
    当检测到缩放输入且存在延迟焦点时，启动世界位姿插值过渡：
    - 起点 = 点击瞬间的 `posKm/quat`；
    - 终点 = 沿初始方向、按当前缩放距离定位到目标附近；
    - 位置进度 `t` 由缩放方向驱动（滚轮下/PageDown = 接近，滚轮上/PageUp = 远离），
      停止输入即暂停；
    - 朝向进度 `faceT` 独立推进：滚动后 0.35s 内平滑转向目标，且一旦开始接近即使停止
      滚动也会继续收敛，确保目标在过渡中后期始终位于屏幕中心；
    - 只有 `t >= 1` 且 `faceT >= 0.99` 时才提交新焦点，避免焦点已切换但相机还没对准目标。
  - 点击天体本体时，`pickBody` 返回命中点的体固系方向 `localDir` 与距离 `localDist`，
    过渡期间持续看向该表面点（随天体自转更新），实现精确瞄准；标签点击使用天体中心。
  - 恒星标签（`star_*`）不设置延迟焦点；标签双击前往仍从原始焦点起飞（保留 250 ms
    窗口记录双击前焦点；`OrbitCamera.flyTo` 支持 `fromIdOverride`）。
- 新增验证：`node tools/repro-label-focus.mjs`（点击后不动、滚动平滑切焦点并居中、
  停止后可重选）。

- **计算**：日心黄道 J2000，单位 km。
- **→ Three 世界**：`(x, y, z)_ecl → (x, z, -y)_three`（黄道北极 = +Y）。
- **体固系 → 世界**：体固基矢经相同映射（本初子午线=本地+X，北极=+Y）。
- 太阳点光源强度 = 2.5/(dAU²)，供 StandardMaterial 用；自定义着色器内按 1/d² 缩放。

## 关键已知限制（已在测试/审查中确认接受）

1. 卫星长期 J2 进动未建模（数月后相位误差缓慢增长）→ 建议每季度跑 `npm run fit-moons` 刷新历元。
2. 无日月食阴影投射（仅环→行星本体已做）。
3. 地形为风格化噪声+真实反照率融合，非真实 DEM（GB 级数据不可行）。
4. 无声音设计。
5. 气巨大红斑等特征为静态贴图，不随系统 III 经度对准。

## 常用脚本

```bash
npm run dev              # 开发
npm run build            # 生产构建
npm test                 # 33 项单元/精度测试（含离线 JPL 基准）
npm run verify           # 在线 Horizons 对照（行星 ≤0.1°，月球 ≤0.5°）
npm run fit-moons        # 重新拟合卫星轨道（刷新历元到现在）
npm run fetch-textures   # 重新下载贴图资产
node tools/audit-visuals.mjs   # 全行星视觉审查截图
node tools/repro-r7.mjs        # R7 缺陷复现/修复验证（量化断言，Node 无浏览器）
node tools/repro-r8.mjs        # R8 屏幕中心缩放验证（倾斜/平移/常规三场景）
node tools/repro-r9.mjs        # R9 镜头/地形/天体真实性验证（11 断言，Node 无浏览器）
node tools/probe-r9.mjs        # R9 运行时探针（海洋下潜/海床行走/惯性模式/形态截图）
node tools/repro-r10.mjs       # R10 焦点/缩放/水体/V 连续性验证（12 断言）
node tools/probe-r10.mjs       # R10 运行时探针（起飞后按键/点击拾取/V 连续性）
node tools/repro-issue1.mjs    # R10-fix：返回探索模式后 GE 操控生效验证
node tools/repro-issue2.mjs    # R10-fix：右键平移后滚轮缩放不跳回原空间验证
node tools/repro-label-focus.mjs # R10-fix-2：点击标签切换焦点后滚轮以新焦点缩放验证
node tools/probe-r7.mjs        # R7 运行时探针（自动登陆/起飞/气巨入气，需 dev server）
node tools/probe-r7-visual.mjs # R7 高画质档外行星近景视检截图
```

## 如果测试失败

- `npm run verify` 失败：检查网络 → JPL Horizons API 可达性。
- `npm test` 失败：可能是 `tests/fixtures.json` 缺失 → `node tools/make-fixtures.mjs`（需联网）。
- 浏览器冒烟黑屏：SwiftShader 无 WebGL → 检查 GPU/ANGLE 后端。

## 后续建议（未实现）

- USGS DEM 瓦片真实地形（月/火星 LOLA/MOLA）
- 日月食阴影体
- 声音（无线电氛围/登陆脚步按介质）
- 存档系统（位置/时间书签）
- VSOP87 + ELP2000 完整理论扩展有效期至 ±3000 年

## 项目记忆索引

- `docs/sdlc/analysis-document.md` — 需求分析
- `docs/sdlc/design-document.md` — 技术设计
- `docs/sdlc/change-document.md` — 全部迭代变更记录
- `docs/sdlc/review-document.md` — 代码评审
- `docs/sdlc/test-report.md` — 测试报告
- `docs/sdlc/delivery-summary.md` — 交付总结
- `docs/sdlc/screenshots/` — 冒烟/审查截图存档
- `memory/heliosphere-project.md` — 跨会话关键事实
