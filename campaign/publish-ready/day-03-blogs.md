# Day 3 · 技术博客与 Newsletter 素材包

> 发布日期：上线第 3 天
> 目标平台：个人技术博客、Dev.to、Medium、Hacker Noon、掘金、CSDN、知乎专栏、Substack/小报童 Newsletter

---

## 1. 英文技术博客（可直接发布到 Dev.to / Medium / Hacker Noon）

### 标题
`Building a Real-Time, True-Scale Solar System in the Browser with Three.js`

### 正文
```markdown
# Building a Real-Time, True-Scale Solar System in the Browser

*Live demo: https://sw.icodestar.net*
*Source: https://github.com/hyqzz/Solar-Wanderer*

## Motivation

Most solar system visualizations cheat. They compress distances, speed up orbits, or use hand-animated paths. I wanted something closer to reality: a simulator where every planet and moon is at its real distance, moving at its real speed, computed from real ephemeris data.

The result is **Solar Wanderer** — a browser app that runs entirely on the client and scales from 0.5 meters above a moon surface to 100,000 AU at the edge of the Oort Cloud.

## What “real” means here

- **Positions** come from NASA JPL Horizons ephemerides.
- **Planets** use the Standish orbital elements.
- **The Moon and 21 major satellites** use fitted orbital parameters that we re-fit to current-epoch state vectors.
- **Rotations** use IAU recommended models.
- **Scale** is 1:1. No artistic compression.

## The hard parts

### 1. Depth buffering across 15 orders of magnitude

A standard z-buffer dies beyond ~1e6 km. We use a logarithmic depth buffer:

```glsl
float logz = log(z * C + 1.0) / log(far * C + 1.0);
gl_FragDepth = logz;
```

Combined with a `camera.far` of 1e15 km, this lets us render Pluto and Proxima-style background stars in the same frame without z-fighting.

### 2. Floating-point precision

At Earth-radius scales, fp32 vertex positions start to jitter. The fix is origin-relative coordinates: high-frequency geometry is computed relative to the camera or local anchor and merged back into the world matrix at the last moment.

### 3. Time

UTC → Terrestrial Time → Julian Date is the gateway to every ephemeris function. We keep a `SimClock` driven by wall-clock time so the simulation keeps running even when the user is not interacting.

## User modes

- **Orbit mode**: Google-Earth-style drag/wheel, with click-to-focus and smooth transitions.
- **Ship mode**: 6DOF flight from 1 m/s to 2 AU/s.
- **Walking mode**: WASD on surfaces and underwater buoyancy.
- **Inertial anchor**: toggle between body-fixed and inertial frames to see true orbital motion.

## Testing

Because the ephemeris layer is pure functions, we can run it in Node with the built-in test runner:

```bash
npm test
```

Tests compare output against JPL Horizons. Current accuracy:

- Planets: ≤ 0.074°
- Moon: ≈ 0.12°
- Major moons over 10 days: ≤ 0.22°

## Try it

https://sw.icodestar.net

If you find an ephemeris edge case or a rendering bug, open an issue on GitHub. The project is MIT licensed and open to contributions.
```

### 建议配图
- 首图：`campaign/assets/screenshots/earth-orbit_1920x1080.png`
- 深度缓冲示意图（可引用代码截图）
- `campaign/assets/screenshots/moon-earthrise_1920x1080.png`
- `campaign/assets/screenshots/saturn-rings_1920x1080.png`
- 结尾视频：`main-demo-en.mp4`

---

## 2. 中文技术博客（可直接发布到掘金 / CSDN / 知乎专栏 / 个人公众号）

### 标题
`用 Three.js 在浏览器里建一个真实比例的实时太阳系`

### 正文
```markdown
# 用 Three.js 在浏览器里建一个真实比例的实时太阳系

> 在线体验：https://sw.icodestar.net
> 开源地址：https://github.com/hyqzz/Solar-Wanderer

## 为什么要做这个项目

市面上的天文 App 大多把行星距离压缩，或者用固定的轨道动画。我想做一个“真”的：真实距离、真实轨道、真实时间。

于是有了 **Solar Wanderer / 遨游太阳系**。

## 这里的“真实”指什么

- 行星位置来自 NASA JPL Horizons 星历，使用 Standish 轨道根数。
- 月球和 21 颗主要卫星使用拟合后的轨道参数，定期用 Horizons 状态向量重新拟合。
- 自转使用 IAU 推荐模型。
- 比例 1:1，范围从 0.5 米到 10 万 AU。

## 技术难点

### 1. 大尺度下的深度缓冲

普通 z-buffer 在 1e6 km 以上就失效。我们用了对数深度缓冲：

```glsl
float logz = log(z * C + 1.0) / log(far * C + 1.0);
gl_FragDepth = logz;
```

配合 WebGL2 的 `fragDepth`，可以在 1e15 km 范围内保持深度精度。

### 2. 浮点精度

在行星半径量级（如地球 6371 km）下，fp32 的表面坐标会抖动。我们把地形和相机附近物体用“原点相对坐标”计算，再拼回世界矩阵。

### 3. 时间系统

UTC → TT → JD 的换算看似简单，但闰秒和历书时会累积误差。我们用标准的 ΔT 插值表保证精度。

## 主要功能

- **探索模式**：GE 式拖拽、滚轮缩放、焦点切换
- **飞行模式**：6DOF 自由飞行
- **行走/水下模式**：地表漫游、下潜上浮
- **惯性锚定**：按 V 切换体固/惯性参考系

## 测试

项目 MIT 开源。星历层是纯函数，可以用 Node 原生 test runner 跑：

```bash
npm test
```

当前精度：

- 行星位置与 JPL 对比误差 ≤ 0.074°
- 月球约 0.12°
- 主要卫星 10 天内 ≤ 0.22°

## 结语

如果你也对真实尺度下的太阳系感兴趣，欢迎打开试试，或者在 GitHub 上 star/issue。
```

### 建议配图
- 首图：`campaign/assets/social-cards/intro_zh_1080x1350.png`
- 文中插图：earth-orbit、moon-earthrise、saturn-rings、jupiter-redspot 截图
- 结尾视频：`main-demo-zh.mp4`

---

## 3. Newsletter / 小报童文案

### 标题
`一个浏览器里的真实太阳系`

### 正文
```
最近上线了一个新项目：Solar Wanderer / 遨游太阳系。

它是一个完全在浏览器里运行的实时太阳系模拟器，数据来自 NASA JPL 真实星历，比例 1:1。

几个值得体验的视角：
• 月球看地球升起
• 火星蓝色日落
• 土星环（宽 28 万公里，厚 10-20 米）
• 木星大红斑
• 从地球缩放到奥尔特云

技术栈：Three.js + WebGL2 + Vite，MIT 开源。

链接：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

如果你转发或试用，欢迎告诉我体验如何。
```

---

## 4. Twitter/X 技术 Thread

### Tweet 1
```
I just open-sourced a real-time, true-scale solar system simulator that runs in the browser.

Here are the 3 hardest engineering problems I hit—and how I solved them.

Demo: https://sw.icodestar.net
Code: https://github.com/hyqzz/Solar-Wanderer
```

### Tweet 2
```
Problem 1: depth buffering across 15 orders of magnitude.

Standard z-buffers break beyond ~1e6 km. I used a logarithmic depth buffer with WebGL2 fragDepth, giving usable depth precision out to 1e15 km.
```

### Tweet 3
```
Problem 2: fp32 precision at planetary distances.

At Earth-radius scales, vertices jitter. The fix: origin-relative coordinates for terrain and nearby objects, merged back into world matrices at the last moment.
```

### Tweet 4
```
Problem 3: real ephemeris data in real time.

Planets use Standish orbital elements. The Moon + 21 major moons are fitted to NASA JPL Horizons state vectors. We re-fit them every quarter.
```

### Tweet 5
```
Accuracy today:
• Planets vs JPL Horizons: ≤ 0.074°
• Moon: ≈ 0.12°
• Major moons over 10 days: ≤ 0.22°

All tested with Node’s built-in test runner.
```

### Tweet 6
```
Modes: orbit (Google-Earth style), 6DOF ship, surface walking + underwater buoyancy, and an inertial anchor toggle so you can see how moons actually orbit.

Try it and let me know your favorite view.
```

---

## Day 3 发布检查清单

- [ ] Dev.to / Medium / Hacker Noon 发布英文博客
- [ ] 掘金 / CSDN / 知乎专栏发布中文博客
- [ ] Newsletter / 小报童推送
- [ ] Twitter/X 技术 Thread 发布
- [ ] 将博客链接分享到 Day 1 的 HN/Reddit 帖子评论区
- [ ] 收集读者反馈，整理到 Day 4-5 短视频选题
