# Solar Wanderer 推广执行手册

> 目标：Demo 流量、GitHub Stars、个人品牌/影响力
> 核心受众：中文天文/科普爱好者、教育/教学场景
> 使用范围：英文开发者社区 + 中文科普/教育社区

---

## 项目一句话

**Solar Wanderer / 遨游太阳系**：基于 NASA JPL 星历的浏览器端 1:1 实时太阳系探索器。此刻行星就在真实位置，支持从轨道无缝登陆、行走、飞行、下潜，最远可达奥尔特云。无需安装，打开即用，完全开源。

---

## 核心卖点矩阵

| 受众 | 主打卖点 |
|---|---|
| 中文天文/科普爱好者 | 真实星历、此刻太阳系、21 颗亮星视差、奥尔特云、无缝登陆月球看地出 |
| 教育/教学场景 | 免费、无安装、课堂可用、1:1 尺度直观、NASA 官方数据、中文界面 |
| 开发者/Three.js 社区 | 浏览器端 1:1 km 尺度、对数深度、浮动原点、WebGL2、原生 ESM、~196 kB gzip |
| 太空模拟玩家 | 无缝降落到地表、水下、6DOF 飞行、时间加速、土星环影、气巨入气 |

---

## 英文推广文案

### Hacker News — Show HN

**Title:**

```
Show HN: Solar Wanderer – 1:1 real-time solar system in the browser, NASA JPL ephemerides
```

**Body:**

```
Solar Wanderer is a 1:1 scale, real-time solar system explorer that runs entirely in your browser.

Planets are positioned using NASA JPL ephemerides, so what you see is where they actually are right now. You can orbit any body, seamlessly descend to the surface, walk around (with real surface gravity), even dive underwater on Earth, then fly out to the Oort Cloud.

Tech highlights:
- Three.js + WebGL2, native ESM, Vite
- Floating-origin + logarithmic depth for 0.5 m → 100,000 AU without seams
- Ray-marched atmospheres (Rayleigh+Mie)
- 28 real TNOs + statistical Oort Cloud particles
- 21 real bright stars with actual 3D parallax
- ~196 kB gzipped JS, no backend

Live demo: https://sw.icodestar.net
Source: https://github.com/hyqzz/Solar-Wanderer

I built this to make the scale of the solar system feel immediate. Would love feedback, especially on performance and the camera controls.
```

### Reddit

**r/threejs**

```
Title: I built a 1:1 scale solar system in Three.js — real-time NASA JPL ephemerides, seamless landing, 0.5m to 100,000 AU

Link: https://sw.icodestar.net

Tech details:
- Floating origin + logarithmic depth buffer
- Ray-marched atmospheres
- Procedural terrain with per-LOD origin-relative coordinates to keep fp32 precision on planetary scales
- ~196 kB gzipped
- Source on GitHub

Would love feedback from the WebGL/Three.js crowd, especially on the camera/orbit controls.
```

**r/space**

```
Title: Explore the real solar system in your browser — planets are where they actually are right now

This uses NASA JPL ephemerides to place planets, moons, TNOs, and 21 real bright stars in real time. You can fly from Earth to the Moon, land and look up at Earthrise, fly through Saturn's rings, or go all the way to the Oort Cloud. No install needed.
```

**r/astronomy**

```
Title: A browser-based, real-time solar system model using JPL ephemerides — useful for teaching scale?

I built Solar Wanderer to give people an intuitive sense of just how big the solar system is. It uses real orbital elements and rotation models, so positions match reality. It also renders the asteroid belt, Kuiper belt, and a statistical Oort Cloud. Could be useful for classrooms or outreach.
```

### Twitter / X Thread

**Tweet 1**

```
🚀 Solar Wanderer — a 1:1 real-time solar system you can explore in your browser.

Planets are placed with NASA JPL ephemerides. They are exactly where they are right now.

Land on the Moon. Walk on Mars. Dive underwater on Earth. Fly to the Oort Cloud.

No install. Free. Open source.

🔗 https://sw.icodestar.net
```

**Tweet 2**

```
What does "1:1 scale" actually mean?

The Earth is 12,742 km across. The Moon is 384,400 km away. Saturn's rings are 282,000 km across.

In Solar Wanderer, all of that is true size. You can scroll from orbit all the way down to standing on the surface — no loading screens, no cuts.
```

**Tweet 3**

```
Tech stack:
• Three.js + WebGL2
• Floating origin + logarithmic depth
• Ray-marched atmospheres
• Native ESM, Vite
• ~196 kB gzipped

It turns out you can render 0.5 meters to 100,000 AU in a browser tab.
```

**Tweet 4**

```
Some things you can do:
• Stand on the Moon and watch Earthrise
• Fly through Saturn's rings and see their shadow on the planet
• Enter Jupiter's cloud deck
• Watch Phobos orbit Mars in real time
• Travel to Sedna, Eris, and the Oort Cloud
```

**Tweet 5**

```
Built by @hyqzz

Star it on GitHub if you find it cool — it really helps a solo open-source project get noticed.

⭐ https://github.com/hyqzz/Solar-Wanderer

#threejs #webgl #space #astronomy #opensource #nasa
```

### dev.to 文章

**Title:** Building a 1:1 Real-Time Solar System in the Browser with Three.js

**Outline:**
1. Why build it — the solar system is huge and most sims cheat on scale
2. The ephemeris layer — JPL Standish, truncated ELP, fitted moons
3. The rendering trick — floating origin + logarithmic depth
4. Atmospheres and terrain
5. Performance numbers
6. Lessons learned
7. Call to action: try demo, star repo

---

## 中文推广文案

### 知乎文章

**标题：** 我开源了一个浏览器里的 1:1 实时太阳系：从太阳表面走到奥尔特云

**开篇：**

```
如果你现在打开这个网页，看到的行星位置就是此刻真实太阳系里的位置。

不是动画、不是预设轨道回放，而是用 NASA JPL 星历算出来的。

项目叫 Solar Wanderer / 遨游太阳系，地址：https://sw.icodestar.net
开源地址：https://github.com/hyqzz/Solar-Wanderer
```

**正文要点：**
- 什么是 1:1 真实尺度：地球直径 12742 km、地月距离 38.4 万 km、土星环 28.2 万 km，这里都是真的。
- 无缝体验：轨道 → 大气 → 地表 → 行走 → 水下，没有加载、没有切换。
- 教育价值：课堂可用，免费，无需安装，中文界面。
- 技术亮点：Three.js + WebGL2、对数深度、浮动原点、光线步进大气、级原点相对坐标。

**结尾 CTA：**

```
如果你也觉得“在浏览器里站在月球上看地球升起”这件事很酷，欢迎：

1. 打开体验：https://sw.icodestar.net
2. 在 GitHub 点颗 ⭐，对独立开源项目帮助很大
3. 转发给身边对天文、编程或教育感兴趣的朋友
```

### 知乎回答（适配问题）

**适配问题：**
- “有哪些让人眼前一亮的网页/WebGL 项目？”
- “有哪些适合给学生讲太阳系的工具或网站？”
- “Three.js 能做出多酷的效果？”

**回答：**

```
推荐一个我最近开源的项目：Solar Wanderer / 遨游太阳系。

它是一个完全在浏览器里运行的 1:1 实时太阳系模拟器，基于 NASA JPL 星历，所以打开后看到的行星位置就是此刻真实位置。

几个我觉得最惊艳的体验：

1. 点“月球”→滚轮一路拉近→直接降落在月面，抬头能看到地球挂在黑天上。
2. 飞到土星，能看到环的影子投射在土星本体上（卡西尼号那种标志性视角）。
3. 在地球海面滚轮前进，会进入水下，有深海雾和光照衰减。
4. 一直往外飞，经过小行星带、柯伊伯带、28 颗真实海外天体，直到奥尔特云。

对教育场景也很友好：不用安装、中文界面、免费开源。

链接：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer
```

### B站 视频脚本（1 分钟）

**标题：** 我在浏览器里造了一个 1:1 太阳系，还能登陆月球

**脚本：**

```
【0-5s】
大家好，这是一个能在浏览器里直接打开的 1:1 实时太阳系。

【5-15s】
它的数据来自 NASA JPL，所以你看到的行星、卫星，此刻就在真实的位置上。

【15-35s】
（画面：点击月球，滚轮拉近，降落到月面，抬头看地球）
最惊艳的是无缝登陆。点一下月球，滚轮一路拉近，会直接站到月球表面，抬头就是地球挂在黑色的天空里。

【35-50s】
（画面：土星环影、木星云层、地球水下、奥尔特云）
你还能看到土星环的影子投在土星上，飞到木星云层上方，甚至潜入地球海底，一路飞到奥尔特云。

【50-60s】
不用安装，免费开源。链接在简介，欢迎体验。
```

**简介：**

```
Solar Wanderer / 遨游太阳系：基于 NASA JPL 星历的浏览器端 1:1 实时太阳系探索器。

🔗 在线体验：https://sw.icodestar.net
⭐ GitHub：https://github.com/hyqzz/Solar-Wanderer
📷 截图仓库 docs/sdlc/screenshots/

#太阳系 #NASA #WebGL #Threejs #天文 #科普 #开源
```

### V2EX

**节点：** 分享创造

**标题：** 开源了一个浏览器里的 1:1 实时太阳系探索器，基于 NASA JPL 星历

**正文：**

```
项目名：Solar Wanderer / 遨游太阳系

地址：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

特点：
- 浏览器端 1:1 km 真实尺度，从 0.5 米到 10 万 AU
- 行星位置用 NASA JPL 星历实时计算
- 无缝登陆月球/火星等地表，支持行走、跳跃、下潜
- 6DOF 自由飞行，时间加速
- 土星环影、大气散射、奥尔特云、21 颗真实亮星视差
- 原生 ESM + Three.js + Vite，~196 kB gzip

目前 0 star 状态，欢迎体验、吐槽、提 issue。
```

### 稀土掘金

**标题：** 用 Three.js 在浏览器里渲染 1:1 太阳系：从 0.5 米到 10 万 AU

**方向：** 偏技术，面向前端/图形开发者。重点讲对数深度、浮动原点、大气散射、LOD 地形精度。

### 小红书图文

**标题：** 在浏览器里登陆月球看地球升起🌍 这个网站太震撼了

**正文：**

```
发现了一个超酷的免费网站！

🔭 Solar Wanderer / 遨游太阳系
📍 不用下载，浏览器打开就能玩
🪐 太阳系是 1:1 真实大小，行星位置基于 NASA 数据
🌙 可以一路滚轮拉近，直接站到月球表面看地出
🌊 还能潜入地球海底，飞到土星环和奥尔特云

太适合天文爱好者和学生党了！

🔗 https://sw.icodestar.net
```

**标签：** #天文 #太阳系 #NASA #科普 #学生必备 #网站推荐 #Threejs #开源

**配图建议：** 6 张轮播：1 封面（地出）+ 土星环 + 木星 + 水下地球 + 奥尔特云 + 项目二维码/链接。

---

## 教育/科普 outreach 模板

### 给教师/教育工作者的邮件

**Subject:** 一个免费、免安装的实时太阳系教学工具

**Body:**

```
您好，

我是一名独立开发者，最近开源了一个浏览器端的太阳系模拟器 Solar Wanderer / 遨游太阳系。

它基于 NASA JPL 星历实时计算行星位置，完全免费、无需安装、支持中文界面。学生可以：

- 直观地理解 1:1 天文尺度
- 从地球无缝飞到月球、火星并“登陆”地表
- 观察土星环影、木星云层、奥尔特云等结构
- 用时间加速看卫星绕转

在线体验：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

如果您觉得它适合课堂或科普活动使用，我非常乐意根据教学需求继续优化。期待您的反馈。

Best,
hyqzz
```

### 建议联系的国内科普方向

- 星球研究所（微信公众号/微博）
- 知识类视频博主（回形针/混乱博物馆风格）
- 李永乐老师团队
- 各地科技馆/天文馆新媒体部门
- 学校信息技术/地理教研组
- B站天文区 UP 主

---

## Awesome List 投稿

每个 PR 标题统一：

```
Add Solar Wanderer: 1:1 real-time solar system explorer in the browser
```

**目标仓库：**
1. `vether/awesome-threejs` / `tbarr/awesome-threejs`
2. `Alakhdeeps/awesome-webgl`
3. `jbnicolai/awesome-space`
4. `melalj/awesome-astronomy`
5. `yrgo/awesome-educational-games`

**PR 描述模板：**

```
Add Solar Wanderer — a browser-based, 1:1 real-time solar system explorer.

- Uses NASA JPL ephemerides for real-time positions
- Built with Three.js + WebGL2
- Open source (MIT)
- Live demo: https://sw.icodestar.net
- Repo: https://github.com/hyqzz/Solar-Wanderer
```

---

## 7 天发布节奏

| 时间 | 动作 |
|---|---|
| Day 0 | GitHub Release v1.2.0；站点 SEO/分享优化；准备全部文案 |
| Day 1 | Hacker News Show HN；Reddit r/threejs + r/space |
| Day 2 | Twitter/X thread；dev.to 技术文章 |
| Day 3 | 知乎文章 + 知乎 3–5 个相关问题回答 |
| Day 4 | B站视频/动态；V2EX 分享创造 |
| Day 5 | 小红书 + 掘金文章 |
| Day 6 | 批量向 awesome list 提 PR |
| Day 7 | 给 10–20 位科普/教育博主发 outreach 邮件 |

---

## 数据跟踪

- **GitHub Stars**：仓库右上角直接看。
- **Demo 流量**：如果你用 Vercel/Netlify/Cloudflare，看 dashboard；自托管可接入 umami/Plausible。
- **Referrer 追踪**：在分享链接里加 UTM：
  - `https://sw.icodestar.net/?utm_source=zhihu`
  - `https://sw.icodestar.net/?utm_source=bilibili`
  - `https://sw.icodestar.net/?utm_source=twitter`
  - `https://sw.icodestar.net/?utm_source=reddit`

---

## 已完成的代码侧优化

- `index.html` Open Graph / Twitter Card / description 已改为中文优先，适配微信/知乎/小红书分享。
- 新增 `public/manifest.json`，支持 PWA 安装。
- 新增/更新 `public/preview.png`（1280×720，地出画面）。
- `npm run build` 通过，`npm test` 33/33 通过。

**注意：** 以上代码改动需要部署到 `sw.icodestar.net` 才能对线上生效。
