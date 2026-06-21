# Day 2 · 中文开发者/科普平台发布素材包

> 发布日期：上线第 2 天 10:00–12:00 或 19:00–21:00（北京时间）
> 目标平台：V2EX、知乎、B站、小红书、即刻/微博

---

## 1. V2EX 帖子

### 节点
`分享创造` / `程序员`

### 标题
`做了一个浏览器里的真实 1:1 太阳系，用 NASA JPL 星历实时计算`

### 正文
```
网站：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

Solar Wanderer（遨游太阳系）是一个完全在浏览器里运行的实时太阳系探索应用。行星、月球和主要卫星的位置都来自 NASA JPL Horizons 的真实星历，比例是 1:1。

可以做的事情：
• 从地球轨道、月球、火星、土星、木星或太阳出发
• 在月球上看地球升起
• 看火星的蓝色日落
• 穿越土星环（宽 28 万公里，厚仅 10-20 米）
• 切换到惯性参考系观察卫星真实绕转
• 按 F 进入飞船模式，速度从 1 m/s 到 2 AU/s

技术栈：Three.js + WebGL2，对数深度缓冲，浮动原点，原生 ESM，Node 原生 test runner。

源码 MIT 开源。欢迎提 issue/pr，也欢迎抓 bug。

参考资料：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
```

### 配图
- 首图：`campaign/assets/social-cards/intro_zh_1080x1350.png`
- 二楼可发 3-4 张场景截图

---

## 2. 知乎回答（推荐问题）

### 适合回答的问题
- “有哪些相见恨晚的网页应用？”
- “Three.js 能做出多惊艳的效果？”
- “有没有真实比例的太阳系模拟？”

### 回答全文
```
推荐一下我自己做的 Solar Wanderer / 遨游太阳系：
https://sw.icodestar.net

这是一个在浏览器里实时运行的 1:1 太阳系，行星、月球和主要卫星的位置都按 NASA JPL 星历计算。

你不需要安装任何东西，打开网页就能用。

几个我觉得最震撼的视角：
1. 月球看地球升起。不是贴图动画，是真实位置算出来的。
2. 火星日落。火星大气里的尘埃把红光散射掉，留下蓝光，所以日落是蓝色的。
3. 土星环。宽 28 万公里，但厚度只有 10-20 米，比 A4 纸还薄（按比例）。
4. 木星大红斑。一个存在至少 350 年的风暴，直径能装下地球。
5. 从地球一直缩放到奥尔特云。10 万 AU，也就是太阳系边缘。

技术方面：
• 用 Three.js + WebGL2 渲染
• 对数深度缓冲 + 浮动原点，解决远距离 z-fighting 和 fp32 精度问题
• 6DOF 飞船、地表行走、水下浮力
• 自动 GPU 分档，低端设备也能跑
• MIT 开源：https://github.com/hyqzz/Solar-Wanderer

另外写了一些单元测试和星历精度回归测试，行星位置与 JPL Horizons 对比误差 ≤0.074°。

如果你试用了，欢迎在评论里告诉我最想加的功能。

参考资料：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
```

### 配图
- 每张场景图对应插入一张截图
- 可插入主 demo 视频

---

## 3. 知乎专栏文章

### 标题
`在浏览器里建一个真实比例的太阳系：从 JPL 星历到 WebGL 渲染`

### 正文
```
# 在浏览器里建一个真实比例的太阳系

> 在线体验：https://sw.icodestar.net
> GitHub：https://github.com/hyqzz/Solar-Wanderer

## 为什么做这个项目

大部分天文 App 要么把行星距离压缩，要么用固定轨道动画。我想做一个“真”的：真实比例、真实轨道、真实时间。

于是有了 Solar Wanderer。

## 什么是“真实”

- 行星位置来自 NASA JPL Horizons 星历，使用 Standish 轨道根数。
- 月球和 21 颗主要卫星使用拟合后的轨道参数，定期用 Horizons 状态向量重新拟合。
- 自转使用 IAU 推荐模型。
- 比例 1:1，范围从 0.5 米到 10 万 AU。

## 技术难点

### 1. 大尺度下的深度缓冲

普通 z-buffer 在 1e6 km 以上就失效。我们用了对数深度缓冲：

```
z_log = log(z * C + 1) / log(far * C + 1)
```

配合 WebGL2 的 `fragDepth`，可以在 1e15 km 范围内保持深度精度。

### 2. 浮点精度

在行星半径量级（如地球 6371 km）下，fp32 的表面坐标会抖动。我们把地形和相机附近物体用“原点相对坐标”计算，再拼回世界矩阵。

### 3. 时间系统

UTC → TT → JD 的换算看似简单，但闰秒和历书时会累积误差。我们用标准的 ΔT 插值表保证精度。

## 主要功能

- 探索模式：GE 式拖拽、滚轮缩放、焦点切换
- 飞行模式：6DOF 自由飞行
- 行走/水下模式：地表漫游、下潜上浮
- 惯性锚定：按 V 切换体固/惯性参考系

## 开源与测试

项目 MIT 开源。测试覆盖：
- 时间换算
- 开普勒轨道
- 行星/月球/卫星位置精度
- 物理常数与运动学
- IAU 自转模型

## 结语

如果你也对真实尺度下的太阳系感兴趣，欢迎打开试试，或者在 GitHub 上 star/issue。

## 参考资料

- 土星环：NASA Science – Saturn Facts https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science – Oort Cloud Facts https://science.nasa.gov/solar-system/oort-cloud/facts/
- 项目星历精度：见 `docs/sdlc/test-report.md` 与 `tests/ephemeris.test.mjs`
```

### 配图
- 首图：`intro_zh_1080x1350.png`
- 文中插图：`earth-orbit`、`moon-earthrise`、`mars-sunset`、`saturn-rings`、`jupiter-redspot` 截图
- 结尾视频：`main-demo-zh.mp4`

---

## 4. B站 视频投稿

### 标题
`【真实1:1太阳系】在浏览器里遨游太阳系是什么体验？`

### 简介
```
Solar Wanderer / 遨游太阳系 是一个完全在浏览器里运行的实时太阳系模拟器。

行星、月球、卫星的位置都来自 NASA JPL 真实星历，比例 1:1，范围从 0.5 米到 10 万 AU。

可以体验：
• 在月球上看地球升起
• 火星的蓝色日落
• 穿越土星环
• 木星大红斑
• 从地球缩放到奥尔特云

在线体验：https://sw.icodestar.net
开源地址：https://github.com/hyqzz/Solar-Wanderer

参考资料：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/

#太阳系 #NASA #Threejs #WebGL #开源 #遨游太阳系
```

### 视频文件
- 主投稿视频：`campaign/assets/videos/main-demo-zh.mp4`（48 秒，16:9）
- 短视频（可选分 P 或动态）

### 封面
- `campaign/assets/social-cards/intro_zh_1080x1350.png` 或 `intro_zh_1080x1920.png`

---

## 5. 小红书笔记

### 标题
`我在浏览器里造了一个真实太阳系🪐`

### 正文
```
不用下载 App，打开网页就能遨游太阳系。

✨ 真实 NASA JPL 星历，行星位置实时计算
✨ 1:1 真实比例，从月球表面到 10 万 AU
✨ 月球看地球升起、火星蓝色日落、土星环、木星大红斑
✨ 还能按 F 开飞船

网址：sw.icodestar.net

技术栈 Three.js + WebGL2，MIT 开源。

#天文 #太阳系 #NASA #Threejs #浏览器 #小众网站 #知识科普 #独立开发
```

### 评论区置顶（复制发布时粘贴）
```
天文事实参考：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
```

### 配图（9 张）
1. `social-cards/intro_zh_1080x1350.png`
2. `screenshots/moon-earthrise_1920x1080.png`
3. `screenshots/mars-sunset_1920x1080.png`
4. `screenshots/saturn-rings_1920x1080.png`
5. `screenshots/jupiter-redspot_1920x1080.png`
6. `screenshots/earth-orbit_1920x1080.png`
7. `screenshots/sun-closeup_1920x1080.png`
8. `screenshots/pluto-heart_1920x1080.png`
9. GitHub 二维码或 logo

---

## 6. 即刻/微博帖子

### 即刻
```
做了一个浏览器里的真实 1:1 太阳系。

行星、月球位置按 NASA JPL 星历实时算，不用安装，打开即玩。

月球看地球升起、火星蓝色日落、穿越土星环、飞船模式……

🔗 sw.icodestar.net
📦 github.com/hyqzz/Solar-Wanderer

天文事实参考：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/

#独立开发 #Threejs #NASA #太阳系
```

### 微博
```
【在浏览器里遨游真实太阳系】

Solar Wanderer（遨游太阳系）上线了，完全免费、无需安装。

✅ NASA JPL 星历驱动
✅ 真实 1:1 比例
✅ 月球地球升起 / 火星蓝色日落 / 土星环 / 木星大红斑
✅ 可开飞船、可行走、可下潜

🔗 https://sw.icodestar.net
📦 https://github.com/hyqzz/Solar-Wanderer

参考来源：
- 土星环：NASA Science https://science.nasa.gov/saturn/facts/
- 木星大红斑：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- 火星蓝色日落：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- 奥尔特云：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/

转发抽 3 位送项目纪念贴纸（如有）。

#SolarWanderer #遨游太阳系 #独立开发 #开源 #NASA
```

---

## Day 2 发布检查清单

- [ ] V2EX 发布 + 回复前 10 楼
- [ ] 知乎 1 篇专栏 + 3-5 个相关回答
- [ ] B站 视频投稿（封面、标题、标签、简介）
- [ ] 小红书 1 篇笔记（9 图）
- [ ] 即刻 1 条 + 微博 1 条
- [ ] 将各平台链接汇总到发布跟踪表

---

## 参考资料（发布时可选附在评论区或描述底部）

- **土星环** – NASA Science: https://science.nasa.gov/saturn/facts/
- **木星大红斑** – NASA Science / Juno: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **火星蓝色日落** – NASA Science: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **奥尔特云** – NASA Science: https://science.nasa.gov/solar-system/oort-cloud/facts/
- **项目星历精度** – 见 `docs/sdlc/test-report.md` 与 `tests/ephemeris.test.mjs`。
