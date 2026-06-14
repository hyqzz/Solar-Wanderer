# Solar Wanderer v2.0.0 — 复制即发执行表

> 直接复制对应文案到平台发布。链接已加 UTM 便于追踪来源。
> 本次主线：**v2.0.0 完整移动端支持**——"手机上就能登陆月球"。
> 完整长文案见 `hn-post.md` / `reddit-posts.md` / `chinese-posts.md`；本表是按时间排好的精简版。

---

## 通用链接（带 UTM）

| 用途 | 链接 |
|---|---|
| Demo 首页 | `https://sw.icodestar.net` |
| Reddit | `https://sw.icodestar.net/?utm_source=reddit` |
| Twitter | `https://sw.icodestar.net/?utm_source=twitter` |
| HN | `https://sw.icodestar.net/?utm_source=hackernews` |
| 知乎 | `https://sw.icodestar.net/?utm_source=zhihu` |
| B站 | `https://sw.icodestar.net/?utm_source=bilibili` |
| 小红书 | `https://sw.icodestar.net/?utm_source=xiaohongshu` |
| 抖音 | `https://sw.icodestar.net/?utm_source=douyin` |
| V2EX | `https://sw.icodestar.net/?utm_source=v2ex` |
| 掘金 | `https://sw.icodestar.net/?utm_source=juejin` |
| GitHub | `https://github.com/hyqzz/Solar-Wanderer` |

> 时区：英文社区用美东（ET），中文社区用北京时间（CST）。ET + 12h ≈ 次日 CST。
> **不要同一天全平台齐发**——分散，每个平台发完蹲守评论 2–3 小时。

---

## 第 1 天（英文开发者社区，ET）

### 08:30 ET — Hacker News Show HN
> 完整正文 + 首评见 `hn-post.md`。标题不堆 emoji，发完立刻补一条技术首评，蹲守 2–3 小时。

**标题：**
```
Show HN: A 1:1 real-time solar system in your browser, now on mobile too
```

### 10:00 ET — Reddit r/InternetIsBeautiful
> 附手机录屏或 GIF。完整正文见 `reddit-posts.md`。

**标题：**
```
A 1:1 real-time solar system you can explore in your browser — now works on your phone (land on the Moon, fly to the edge of the solar system)
```

### 11:30 ET — Reddit r/space
**标题：**
```
I made a browser solar system simulator with real NASA JPL positions — v2.0 now runs on phones, so you can land on the Moon from your pocket
```

### 13:00 ET — Reddit r/threejs
**标题：**
```
Shipped mobile support for my 1:1 Three.js solar system — floating origin, log depth, ray-marched atmospheres, now with touch + GPU auto-tiering
```

### 21:00 ET（≈次日 09:00 CST）— Twitter/X 推文串
> 完整 5 推见 `chinese-posts.md` 末尾「Twitter/X 推文系列」。主推 1 附手机录屏 MP4。

**主推：**
```
The 1:1 real-time solar system in your browser now runs on your phone. 📱

Pinch to zoom from Earth orbit → standing on the Moon. Look up: Earth in the black sky.

Powered by NASA JPL. ~200 kB. No app.

🔗 https://sw.icodestar.net/?utm_source=twitter
⭐ https://github.com/hyqzz/Solar-Wanderer
```

---

## 第 2 天（中文社区，CST）

### 12:30 CST — V2EX 分享创造
**标题：**
```
我的浏览器 1:1 太阳系更新了 v2.0：现在手机上也能登陆月球了
```
> 正文见 `chinese-posts.md`「V2EX」。

### 20:00 CST — 知乎文章
**标题：**
```
我的开源项目更新了：现在可以在手机浏览器里登陆月球看地球升起
```
> 正文见 `chinese-posts.md`「知乎（文章）」。话题：#天文 #太阳系 #NASA #Three.js #WebGL #开源 #科普 #前端

### 20:30 CST — 知乎回答（挑 3 个相关问题）
> 通用回答见 `chinese-posts.md`「知乎（回答形式）」。优先答"手机上就能玩的惊艳网页"类问题。

---

## 第 3 天（短视频，CST）—— 本次最大流量点

### 18:00 CST — 抖音 / 视频号 / B站竖屏
> 脚本 + 文案见 `chinese-posts.md`「抖音 / 视频号 / B站竖屏」。**必须手机实拍录屏**，前 3 秒钩子："你手机上现在就能登陆月球，不用下载任何 App。"

**文案：**
```
这个网站太离谱了，手机浏览器直接登陆月球🌕 真实 NASA 数据做的 1:1 太阳系，免费不用下载。#天文 #太阳系 #NASA #冷知识 #科普 #好用的网站
```

### 20:00 CST — B站横屏视频（可选，2 分钟完整版）
> 标题/简介/脚本见 `chinese-posts.md`「B站视频脚本」。

---

## 第 4 天（中文图文，CST）

### 12:00 CST — 小红书
**标题：**
```
手机直接登陆月球看地球升起🌍 这个网站零下载太震撼
```
> 正文 + 标签见 `chinese-posts.md`「小红书图文」。6 张竖屏轮播，封面用手机框 + 月球地出。

### 20:00 CST — 掘金技术长文
**标题：**
```
把 1:1 太阳系搬上手机：Three.js 项目的移动端适配与精度保持实践
```
> 大纲 + 代码片段见 `chinese-posts.md`「稀土掘金」。

---

## 第 5 天（英文补充渠道，ET）

### 09:00 ET — dev.to 技术文章
**标题：**
```
Putting a 1:1 Real-Time Solar System on Mobile with Three.js
```
**要点：** 1) 项目是什么 2) 浮动原点 + 对数深度 3) 触控层（pinch 复用 dist 曲线）4) GPU 自适应分档 5) 性能数据 6) CTA。
链接：`https://sw.icodestar.net/?utm_source=devto`

### 10:00 ET — Three.js Forum（Showcase 板块）
**标题：**
```
Solar Wanderer v2.0 — 1:1 real-time solar system in the browser, now with full mobile support
```
**正文：**
```
Hi everyone — I just released v2.0 of Solar Wanderer, a browser-based 1:1 real-time solar system explorer. The big new thing is full mobile support: pinch to zoom from orbit to surface, on-screen joystick for walk/fly, GPU auto-tiering for phones — while keeping the floating-origin precision and seamless landing identical to desktop.

Live: https://sw.icodestar.net/?utm_source=threejsforum
Source: https://github.com/hyqzz/Solar-Wanderer

Feedback from this community would be amazing — especially on touch camera feel and mobile performance.
```

---

## 第 6 天（Awesome List + 收录）

> 见 `LAUNCH-PLAYBOOK.md`「Awesome 清单提交」一节——已备好分支与一键开 PR 链接，你点 Create pull request 即可。
> 一个清单只提一次；被拒就坦然接受，别催。

---

## 第 7 天（教育 / 科普 Outreach，CST）

### 10:00 CST — 批量发 outreach 邮件
> 收件人方向与邮件模板见 `PROMOTION_PLAN.md`「教育/科普 outreach」。本次邮件强调"学生手机即可访问，无需机房"。

---

## 数据跟踪

- **GitHub Stars**：仓库右上角。
- **Demo 流量**：部署平台 dashboard 看 `?utm_source=*` 分布（哪个渠道最有效，下一轮加码）。
- **前 24 小时最关键**：每小时刷新评论/私信并回复。
