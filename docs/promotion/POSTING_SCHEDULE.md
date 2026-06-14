# Solar Wanderer 推广复制粘贴执行表

> 使用说明：按“发布时间（北京时间）”直接复制对应文案到平台发布。链接已加 UTM，方便追踪来源。

---

## 通用链接

| 用途 | 链接 |
|---|---|
| Demo 首页 | `https://sw.icodestar.net` |
| Demo + Reddit 来源 | `https://sw.icodestar.net/?utm_source=reddit` |
| Demo + Twitter 来源 | `https://sw.icodestar.net/?utm_source=twitter` |
| Demo + HN 来源 | `https://sw.icodestar.net/?utm_source=hackernews` |
| Demo + 知乎来源 | `https://sw.icodestar.net/?utm_source=zhihu` |
| Demo + B站来源 | `https://sw.icodestar.net/?utm_source=bilibili` |
| Demo + 小红书来源 | `https://sw.icodestar.net/?utm_source=xiaohongshu` |
| Demo + V2EX 来源 | `https://sw.icodestar.net/?utm_source=v2ex` |
| GitHub | `https://github.com/hyqzz/Solar-Wanderer` |

---

## 第 1 天（英文开发者社区）

### 09:00 — Hacker News Show HN

**标题：**
```
Show HN: Solar Wanderer – 1:1 real-time solar system in the browser, NASA JPL ephemerides
```

**正文：**
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

Live demo: https://sw.icodestar.net/?utm_source=hackernews
Source: https://github.com/hyqzz/Solar-Wanderer

I built this to make the scale of the solar system feel immediate. Would love feedback, especially on performance and the camera controls.
```

**备注：** 发布后 1 小时内活跃在评论区回复技术问题。

---

### 09:30 — Reddit r/space

**标题：**
```
Explore the real solar system in your browser — planets are where they actually are right now
```

**正文：**
```
This uses NASA JPL ephemerides to place planets, moons, TNOs, and 21 real bright stars in real time. You can fly from Earth to the Moon, land and look up at Earthrise, fly through Saturn's rings, or go all the way to the Oort Cloud. No install needed.

https://sw.icodestar.net/?utm_source=reddit
```

**标签/话题：** #space #astronomy #nasa #webgl

---

### 10:00 — Reddit r/threejs

**标题：**
```
I built a 1:1 scale solar system in Three.js — real-time NASA JPL ephemerides, seamless landing, 0.5m to 100,000 AU
```

**正文：**
```
Link: https://sw.icodestar.net/?utm_source=reddit

Tech details:
- Floating origin + logarithmic depth buffer
- Ray-marched atmospheres
- Procedural terrain with per-LOD origin-relative coordinates to keep fp32 precision on planetary scales
- ~196 kB gzipped
- Source on GitHub

Would love feedback from the WebGL/Three.js crowd, especially on the camera/orbit controls.
```

---

### 10:30 — Reddit r/astronomy

**标题：**
```
A browser-based, real-time solar system model using JPL ephemerides — useful for teaching scale?
```

**正文：**
```
I built Solar Wanderer to give people an intuitive sense of just how big the solar system is. It uses real orbital elements and rotation models, so positions match reality. It also renders the asteroid belt, Kuiper belt, and a statistical Oort Cloud. Could be useful for classrooms or outreach.

https://sw.icodestar.net/?utm_source=reddit
```

---

### 12:00 — V2EX 分享创造

**标题：**
```
开源了一个浏览器里的 1:1 实时太阳系探索器，基于 NASA JPL 星历
```

**正文：**
```
项目名：Solar Wanderer / 遨游太阳系

地址：https://sw.icodestar.net/?utm_source=v2ex
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

---

### 21:00 — Twitter / X Thread

**推文 1：**
```
🚀 Solar Wanderer — a 1:1 real-time solar system you can explore in your browser.

Planets are placed with NASA JPL ephemerides. They are exactly where they are right now.

Land on the Moon. Walk on Mars. Dive underwater on Earth. Fly to the Oort Cloud.

No install. Free. Open source.

🔗 https://sw.icodestar.net/?utm_source=twitter
```

**推文 2：**
```
What does "1:1 scale" actually mean?

The Earth is 12,742 km across. The Moon is 384,400 km away. Saturn's rings are 282,000 km across.

In Solar Wanderer, all of that is true size. You can scroll from orbit all the way down to standing on the surface — no loading screens, no cuts.
```

**推文 3：**
```
Tech stack:
• Three.js + WebGL2
• Floating origin + logarithmic depth
• Ray-marched atmospheres
• Native ESM, Vite
• ~196 kB gzipped

It turns out you can render 0.5 meters to 100,000 AU in a browser tab.
```

**推文 4：**
```
Some things you can do:
• Stand on the Moon and watch Earthrise
• Fly through Saturn's rings and see their shadow on the planet
• Enter Jupiter's cloud deck
• Watch Phobos orbit Mars in real time
• Travel to Sedna, Eris, and the Oort Cloud
```

**推文 5：**
```
Built by @hyqzz

Star it on GitHub if you find it cool — it really helps a solo open-source project get noticed.

⭐ https://github.com/hyqzz/Solar-Wanderer

#threejs #webgl #space #astronomy #opensource #nasa
```

---

## 第 2 天（中文图文社区）

### 20:00 — 知乎文章

**标题：**
```
我开源了一个浏览器里的 1:1 实时太阳系：从太阳表面走到奥尔特云
```

**正文：**
```
如果你现在打开这个网页，看到的行星位置就是此刻真实太阳系里的位置。

不是动画、不是预设轨道回放，而是用 NASA JPL 星历算出来的。

项目叫 Solar Wanderer / 遨游太阳系，地址：https://sw.icodestar.net/?utm_source=zhihu
开源地址：https://github.com/hyqzz/Solar-Wanderer

什么是 1:1 真实尺度

地球直径 12742 km、地月距离 38.4 万 km、土星环 28.2 万 km，这里都是真的。

最惊艳的体验

1. 点“月球”→滚轮一路拉近→直接降落在月面，抬头能看到地球挂在黑天上。
2. 飞到土星，能看到环的影子投射在土星本体上（卡西尼号那种标志性视角）。
3. 在地球海面滚轮前进，会进入水下，有深海雾和光照衰减。
4. 一直往外飞，经过小行星带、柯伊伯带、28 颗真实海外天体，直到奥尔特云。

教育价值

课堂可用，免费，无需安装，中文界面。

技术亮点

Three.js + WebGL2、对数深度、浮动原点、光线步进大气、级原点相对坐标。

如果你也觉得“在浏览器里站在月球上看地球升起”这件事很酷，欢迎：

1. 打开体验：https://sw.icodestar.net/?utm_source=zhihu
2. 在 GitHub 点颗 ⭐，对独立开源项目帮助很大
3. 转发给身边对天文、编程或教育感兴趣的朋友
```

**话题：** #天文 #NASA #Three.js #WebGL #开源 #科普

---

### 20:30 — 知乎回答（3 个问题）

**问题 1：** “有哪些让人眼前一亮的网页/WebGL 项目？”

**回答：**
```
推荐一个我最近开源的项目：Solar Wanderer / 遨游太阳系。

它是一个完全在浏览器里运行的 1:1 实时太阳系模拟器，基于 NASA JPL 星历，所以打开后看到的行星位置就是此刻真实位置。

几个我觉得最惊艳的体验：

1. 点“月球”→滚轮一路拉近→直接降落在月面，抬头能看到地球挂在黑天上。
2. 飞到土星，能看到环的影子投射在土星本体上。
3. 在地球海面滚轮前进，会进入水下。
4. 一直往外飞，直到奥尔特云。

对教育场景也很友好：不用安装、中文界面、免费开源。

链接：https://sw.icodestar.net/?utm_source=zhihu
GitHub：https://github.com/hyqzz/Solar-Wanderer
```

**问题 2：** “有哪些适合给学生讲太阳系的工具或网站？”

**回答：**
```
我开源了一个浏览器端的太阳系模拟器 Solar Wanderer / 遨游太阳系。

它基于 NASA JPL 星历实时计算行星位置，完全免费、无需安装、支持中文界面。学生可以：

- 直观地理解 1:1 天文尺度
- 从地球无缝飞到月球、火星并“登陆”地表
- 观察土星环影、木星云层、奥尔特云等结构
- 用时间加速看卫星绕转

在线体验：https://sw.icodestar.net/?utm_source=zhihu
GitHub：https://github.com/hyqzz/Solar-Wanderer
```

**问题 3：** “Three.js 能做出多酷的效果？”

**回答：**
```
可以做一个 1:1 真实尺度的太阳系。

我的开源项目 Solar Wanderer 用 Three.js + WebGL2 在浏览器里渲染从 0.5 米到 10 万 AU 的太阳系。技术上用了浮动原点、对数深度、光线步进大气、LOD 地形和级原点相对坐标来处理 fp32 精度问题。

体验：https://sw.icodestar.net/?utm_source=zhihu
源码：https://github.com/hyqzz/Solar-Wanderer
```

---

## 第 3 天（B站）

### 18:00 — B站视频

**标题：**
```
我在浏览器里造了一个 1:1 太阳系，还能登陆月球
```

**简介：**
```
Solar Wanderer / 遨游太阳系：基于 NASA JPL 星历的浏览器端 1:1 实时太阳系探索器。

🔗 在线体验：https://sw.icodestar.net/?utm_source=bilibili
⭐ GitHub：https://github.com/hyqzz/Solar-Wanderer
📷 截图仓库 docs/sdlc/screenshots/

#太阳系 #NASA #WebGL #Threejs #天文 #科普 #开源
```

**视频脚本：**
```
【0-5s】
大家好，这是一个能在浏览器里直接打开的 1:1 实时太阳系。

【5-15s】
它的数据来自 NASA JPL，所以你看到的行星、卫星，此刻就在真实的位置上。

【15-35s】
最惊艳的是无缝登陆。点一下月球，滚轮一路拉近，会直接站到月球表面，抬头就是地球挂在黑色的天空里。

【35-50s】
你还能看到土星环的影子投在土星上，飞到木星云层上方，甚至潜入地球海底，一路飞到奥尔特云。

【50-60s】
不用安装，免费开源。链接在简介，欢迎体验。
```

**封面建议：** 月球地出画面（docs/sdlc/screenshots/example/08.png）

---

### 20:00 — B站动态（不发视频时也可用）

**正文：**
```
发现一个超酷的免费网站！浏览器里就能登陆月球、看土星环影、潜入地球海底。

🔭 Solar Wanderer / 遨游太阳系
🪐 基于 NASA JPL 星历，1:1 真实尺度
🌙 支持无缝登陆、行走、飞行、下潜

链接：https://sw.icodestar.net/?utm_source=bilibili
GitHub：https://github.com/hyqzz/Solar-Wanderer

#太阳系 #NASA #Threejs #天文 #科普 #开源
```

**配图：** 6 张截图轮播。

---

## 第 4 天（中文短内容社区）

### 12:00 — 小红书

**标题：**
```
在浏览器里登陆月球看地球升起🌍 这个网站太震撼了
```

**正文：**
```
发现了一个超酷的免费网站！

🔭 Solar Wanderer / 遨游太阳系
📍 不用下载，浏览器打开就能玩
🪐 太阳系是 1:1 真实大小，行星位置基于 NASA 数据
🌙 可以一路滚轮拉近，直接站到月球表面看地出
🌊 还能潜入地球海底，飞到土星环和奥尔特云

太适合天文爱好者和学生党了！

🔗 https://sw.icodestar.net/?utm_source=xiaohongshu
```

**标签：** #天文 #太阳系 #NASA #科普 #学生必备 #网站推荐 #Threejs #开源

**配图：** 6 张轮播：地出 + 土星环 + 木星 + 水下地球 + 奥尔特云 + 链接页截图。

---

### 20:00 — 稀土掘金文章

**标题：**
```
用 Three.js 在浏览器里渲染 1:1 太阳系：从 0.5 米到 10 万 AU
```

**方向：** 技术文章，面向前端/图形开发者。重点讲对数深度、浮动原点、大气散射、LOD 地形精度。

**开头：**
```
最近开源了一个项目 Solar Wanderer / 遨游太阳系，用 Three.js + WebGL2 在浏览器里做了一个 1:1 真实尺度的太阳系模拟器。

在线体验：https://sw.icodestar.net/?utm_source=juejin
源码：https://github.com/hyqzz/Solar-Wanderer
```

**大纲：**
1. 为什么需要 1:1 尺度
2. 浮动原点 + 对数深度
3. 大气散射与光线步进
4. 地形 LOD 与 fp32 精度问题
5. 性能数据与总结

---

## 第 5 天（补充渠道）

### 21:00 — dev.to 英文文章

**标题：**
```
Building a 1:1 Real-Time Solar System in the Browser with Three.js
```

**正文要点：**
1. Why build it — the solar system is huge and most sims cheat on scale
2. The ephemeris layer — JPL Standish, truncated ELP, fitted moons
3. The rendering trick — floating origin + logarithmic depth
4. Atmospheres and terrain
5. Performance numbers
6. Lessons learned
7. Call to action

**链接：**
- Demo: `https://sw.icodestar.net/?utm_source=devto`
- GitHub: `https://github.com/hyqzz/Solar-Wanderer`

---

### 21:30 — Three.js Forum Showcase

**标题：**
```
Solar Wanderer — 1:1 real-time solar system in the browser (NASA JPL ephemerides)
```

**正文：**
```
Hi everyone,

I wanted to share a project I've been working on: Solar Wanderer, a browser-based 1:1 scale real-time solar system explorer.

Live: https://sw.icodestar.net/?utm_source=threejsforum
Source: https://github.com/hyqzz/Solar-Wanderer

It uses Three.js + WebGL2, floating origin + logarithmic depth to handle scales from 0.5 m to 100,000 AU, ray-marched atmospheres, and procedural terrain. Positions come from NASA JPL ephemerides, so planets are where they actually are right now.

Feedback from the Three.js community would be amazing — especially on the orbit camera and performance.
```

---

## 第 6 天（Awesome List 后续）

### 上午 — 已有 PR 跟进

** awesome-creative-coding PR #260 跟评（复制到该 PR 评论区）：**
```
Hi @terkelg,

Just wanted to gently bump this PR. I completely understand you're busy maintaining the list, so no rush at all.

If the description is too long, the section placement isn't ideal, or anything else needs adjusting, I'd be happy to make changes. Thanks a lot for curating this awesome resource!
```

### 下午 — 新 list 投稿

**目标列表（按优先级）：**

| 优先级 | 列表 | 原因 | 操作 |
|---|---|---|---|
| ⭐ 高 | `AxiomeCG/awesome-threejs` | Three.js 社区核心列表，Demonstrations 分区有先例 | 访问 compare URL 创建 PR |
| 中 | `radiovisual/awesome-interactive` | Experiments & Demos / Websites 分区高度契合 |  Fork → 加条目 → PR |
| 低 | `Housz/awesome-simulation` | 中文学术向，"代码与工具"可放，但偏物理仿真 | 可投但不强求 |

**AxiomeCG/awesome-threejs Compare URL：**
```
https://github.com/AxiomeCG/awesome-threejs/compare/main...hyqzz:awesome-threejs:add-solar-wanderer?expand=1
```

---

## 第 7 天（教育/科普 Outreach）

### 10:00 — 批量发送 outreach 邮件

**收件人方向：**
- 星球研究所、回形针风格知识博主、李永乐老师团队
- 各地科技馆/天文馆新媒体部门
- 学校信息技术/地理教研组
- B站天文区 UP 主

**邮件主题：**
```
一个免费、免安装的实时太阳系教学工具
```

**邮件正文：**
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

---

## 数据跟踪

- **GitHub Stars**：仓库右上角直接观察。
- **Demo 流量**：如果部署平台有 dashboard，查看 `?utm_source=*` 参数分布。
- **平台反馈**：每小时刷新一次评论/私信，前 24 小时最关键。

---

## 发布顺序总结

| 天数 | 英文渠道 | 中文渠道 | 其他 |
|---|---|---|---|
| Day 1 | HN、Reddit、Twitter/X、V2EX | — | — |
| Day 2 | — | 知乎文章 + 回答 | — |
| Day 3 | — | B站视频 + 动态 | — |
| Day 4 | — | 小红书、掘金 | — |
| Day 5 | dev.to、Three.js Forum | — | — |
| Day 6 | awesome list PR、PR follow-up | — | — |
| Day 7 | outreach 邮件 | outreach 邮件 | — |
