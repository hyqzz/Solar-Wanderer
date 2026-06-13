# 中文平台发帖内容

---

## V2EX（分享创造节点）

**标题：** 用 Three.js 做了一个 1:1 的太阳系，完全跑在浏览器里，开源了

**正文：**
在线体验：https://sw.icodestar.net
GitHub（MIT）：https://github.com/hyqzz/Solar-Wanderer

做这个项目的起点是想看看——如果把 Google Earth 的操控逻辑扩展到整个太阳系会是什么感觉。

现在它能做到：

- 鼠标滚轮一路拉近，从地球轨道无缝降落月球表面，抬头看地球就挂在黑色天空里（没有加载，没有切换，连续的）
- 19 颗固体天体可以登陆行走，有真实表面重力，月球上跳跃高 6 倍
- 飞进木星云层，在地球上下潜到海底
- 时间加速到每秒 10 年，看卫星绕行星转
- 飞到 120 AU 的日球层顶，旅行者 1 号在那个位置

行星位置用的 NASA JPL 星历（Standish 行星根数），每次启动都是此刻真实的太阳系，用 `npm run verify` 可以实时和 JPL Horizons 对照，9 颗行星误差 ≤0.074°。

技术上主要解决了几个问题：
- 0.5 米到 120 AU 的无缝渲染：浮动原点 + 对数深度缓冲
- 光线步进大气散射（Rayleigh+Mie），每颗行星独立参数
- 无缝着陆：OrbitCamera 和 Walk 模式共用同一个 heightFn，位置和视向严格连续

纯 Three.js + Vite，~170 kB gzip，无后端，无账号，MIT 开源。

---

## 掘金（技术文章）

**标题：** 我是怎么在浏览器里做出 1:1 真实比例太阳系的——Three.js 极限渲染实践

**正文：**

> 在线体验：**https://sw.icodestar.net** | GitHub：https://github.com/hyqzz/Solar-Wanderer

### 项目是什么

Solar Wanderer（遨游太阳系）是一个完全跑在浏览器里的太阳系 1:1 实时探索模拟器：

- 行星位置基于 NASA JPL 星历，此刻启动看到的就是此刻真实的太阳系
- 从太阳到 120 AU 日球层顶，真实千米单位，不缩放
- Google Earth 式操控：拖拽、滚轮缩放、双击飞向目标
- 无缝降落：滚轮一路推进，从轨道 → 大气 → 地表 → 行走，全程无加载无切换
- 19 颗固体天体可登陆行走，真实重力；地球可下潜到海底；木星可飞入云层

### 技术挑战 1：0.5 米到 120 AU 的精度

太阳系的尺度跨度是 2.4×10¹³ 倍。WebGL 的 float32 只有约 7 位有效数字，在地球半径（6400 km）这个量级下，精度已经只有约 1 米——连脚下的地形都会抖动。

解决方案：**浮动原点 + 对数深度缓冲**

```js
// 每帧把场景原点移到相机位置（双精度计算，单精度提交给 GPU）
const rel = planet.posKm.clone().sub(camera.posKm); // Float64
mesh.position.set(rel.x, rel.y, rel.z);             // Float32 offset only

// 对数深度缓冲（片元着色器）
gl_FragDepth = log2(1.0 + vLogZ) * logDepthBufFC;
```

这样，无论相机在 0.5 米高度还是 120 AU 外，渲染精度都保持在厘米级，不会 z-fight。

### 技术挑战 2：物理大气散射

每颗行星有自己的大气参数（Rayleigh 系数、Mie 散射系数、大气厚度）。着色器做光线步进：

```glsl
// 16 步视线采样 + 8 步太阳方向采样
for (int i = 0; i < 16; i++) {
    float h = length(pos) - uPlanetR;
    float density = exp(-h / uScaleH);
    // Rayleigh + Mie 累加
}
```

结果：地球轨道上看到蓝色大气弧光，地表看到蓝天和晨昏红霞，火星是奶油橙色天空，进入木星看到棕色云带。

### 技术挑战 3：无缝着陆

这是整个项目里交互设计最复杂的部分。

核心思路：把相机参数化为 `(focusBody, lat, lon, dist)`，dist 接近 `radius + 1.7m` 时，自动进入行走模式——**位置和四元数严格连续，不重置**。

```js
// OrbitCamera 监控高度
if (altitudeAboveSurface < 2.0 && !this.isWalking) {
  this.switchToWalk(); // 同一个 posKm 和 quat，只换控制模式
}
```

地形高度函数 `heightFn` 被相机碰撞和顶点着色器共用——这保证视觉和物理完全一致，没有"穿地板"的问题。

### 精度验证

```bash
npm run verify  # 实时与 JPL Horizons 对照
```

| 天体 | 与 JPL Horizons 误差 |
|------|---------------------|
| 9 颗行星 | 0.0007° – 0.074° |
| 月球 | 0.12° |
| 21 颗卫星 | 历元 0°，10 天后 ≤0.22° |

### 开源 & 贡献

MIT 协议完全开源：https://github.com/hyqzz/Solar-Wanderer

技术栈：Three.js 0.165 + Vite 5 + 原生 ESM，~170 kB gzip，无后端，无账号，任何现代浏览器可跑。

欢迎 Star、Issue 和 PR——特别期待：真实 DEM 地形（LOLA 月球/MOLA 火星）、日月食阴影、移动端触控。

---

## 知乎（回答形式）

**目标问题：**
- "有哪些让你觉得「这也能用浏览器做」的网页/WebGL 项目？"
- "Three.js 能做到什么程度？"
- "有哪些震撼的开源项目？"

**回答内容：**

推荐一个我自己做的开源项目：**Solar Wanderer（遨游太阳系）**

在线体验：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

这是一个完全跑在浏览器里的太阳系 1:1 实时模拟器，用的是 NASA JPL 的星历数据，你打开它看到的行星位置就是此刻真实的太阳系。

最直观的体验：把鼠标滚轮往前滚，从地球轨道一路推进，大气层越来越厚，然后是云，然后地面，然后你站在月球表面——抬起头，地球就在黑色的天空里，完整的蓝色球体。全程没有任何加载，没有任何切换。

技术上它做到了：
- 0.5 米到 120 AU（太阳到日球层顶）的无缝渲染，不跳帧不 z-fight
- 光线步进物理大气散射，每颗行星独立参数
- 19 颗天体可登陆行走，真实表面重力
- 时间加速到每秒 10 年，可以倒退

纯 Three.js + Vite，~170 kB gzip，MIT 开源。

---

## B 站视频脚本

**标题：** 我用浏览器做了整个太阳系，可以登陆每颗行星

**时长：** 约 2 分钟

**脚本：**

[0:00] 打开 sw.icodestar.net，展示初始地球轨道视角
旁白：这是此刻真实的太阳系。行星位置来自 NASA JPL 星历，实时计算。

[0:10] 滚轮一路推进，降落月球
旁白：滚轮往前推，从地球轨道一路进入月球——没有加载，没有切换。

[0:20] 站在月球表面，看地球
旁白：抬头，地球就在这里。这是 Apollo 宇航员真实看到的视角。

[0:35] 飞向土星，近距看土星环
旁白：飞到土星。NASA 实测贴图，卡西尼号拍摄数据。

[0:50] 飞进木星云层
旁白：飞进木星云层——是的，可以进去。

[1:05] 在地球潜水
旁白：在地球的海底走路，看光线穿透水面。

[1:20] 时间加速，看行星运动
旁白：时间加速到每秒一年，看太阳系运转。

[1:35] 飞到旅行者1号位置，看日球层
旁白：飞到 122 AU——旅行者 1 号现在的位置，太阳系的边界。

[1:50] 展示 GitHub 页面
旁白：完全开源，MIT 协议，纯浏览器，不需要安装任何东西。链接在简介。

---

## Twitter/X 推文系列

**推文 1（主推）：**
I built a 1:1 real-time solar system explorer that runs in your browser.

→ scroll from Earth orbit to walking on the Moon surface (no loading)
→ look up: Earth hangs in the Moon's black sky
→ dive into Jupiter's cloud deck
→ fast-forward time at 10 years/second

~170 kB JS. Powered by NASA JPL.

🔗 https://sw.icodestar.net
⭐ https://github.com/hyqzz/Solar-Wanderer

[附：moonwalk-earthrise.png GIF]

**推文 2（技术角度）：**
How do you render 0.5 m to 120 AU in one WebGL2 context without z-fighting?

Floating-origin scene graph + logarithmic depth buffer.

Planet positions stored as Float64, downcast to Float32 only after subtracting the camera position. Sub-meter precision at any distance.

Source: https://github.com/hyqzz/Solar-Wanderer

**推文 3（互动）：**
Which planet would you visit first?

Solar Wanderer lets you go there right now → https://sw.icodestar.net

(My answer: Moon. The earthrise moment never gets old.)
