# 中文平台发帖内容（v2.0.0）

> 本次核心传播点：**手机上就能玩了**。掏出手机，双指一捏，从地球轨道一路降落到月球表面。
> 移动端对小红书 / B站 / 抖音 / 视频号这类手机原生平台是降维打击——读者正拿着可以立刻试的设备。
> 所有数字以 `FACTS.md` 为准（约 200 kB gzip，0.5 m–10 万 AU，21 颗卫星，19 颗可登陆）。

---

## V2EX（分享创造节点）

**标题：** 我的浏览器 1:1 太阳系更新了 v2.0：现在手机上也能登陆月球了

**正文：**
```
在线体验：https://sw.icodestar.net/?utm_source=v2ex
GitHub（MIT）：https://github.com/hyqzz/Solar-Wanderer

去年做了一个完全跑在浏览器里的 1:1 实时太阳系，这次 v2.0 把它搬上了手机——双指捏合就能从地球轨道一路缩放到站在月球表面，抬头地球挂在黑色天空里。

它能做到：
- 手机/桌面同一套：双指缩放、单指环绕、双指平移、点天体飞过去
- 19 颗固体天体可登陆行走，真实表面重力，月球上跳跃高 6 倍
- 飞进木星云层，在地球上下潜到海底
- 时间加速到每秒 10 年，看卫星绕行星转
- 一路向外飞过日球层顶（旅行者 1 号现在的位置），直到 10 万 AU 的奥尔特云

行星位置用 NASA JPL 星历（Standish 根数）实时算，每次打开都是此刻真实的太阳系，`npm run verify` 可实时和 JPL Horizons 对照，9 颗行星误差 ≤0.074°。

技术上这次最难的不是触控手势，而是在手机 GPU 上保持和桌面一样的浮动原点精度与无缝着陆——靠运行时 GPU 自适应分档（像素比/辉光/大气步进/网格密度动态调整）。

纯 Three.js + Vite，约 200 kB gzip，无后端、无账号、MIT 开源。
```

---

## 知乎（文章）

**标题：** 我的开源项目更新了：现在可以在手机浏览器里登陆月球看地球升起

**正文：**
```
一年前我开源了一个浏览器里的 1:1 实时太阳系 Solar Wanderer / 遨游太阳系。这次 v2.0 做了件我一直想做的事——让它在手机上也能完整运行。

现在你掏出手机，打开网页，双指一捏，就能从地球轨道一路缩放到月球表面，站定，抬头——地球完整地挂在黑色的天空里。没有 App，不用安装。

在线体验：https://sw.icodestar.net/?utm_source=zhihu
开源地址：https://github.com/hyqzz/Solar-Wanderer

【什么是 1:1 真实尺度】
地球直径 12742 km、地月距离 38.4 万 km、土星环 28.2 万 km，这里全是真的。从 0.5 米的地面细节到 10 万 AU 的奥尔特云，同一个画面里无缝缩放，不跳帧、不 z-fighting。

【手机上能做什么】
- 双指缩放、单指环绕、双指平移、点标签飞向天体
- 一路捏合放大，无缝降落月球/火星等 19 颗固体天体并行走
- 飞进木星云层，潜入地球海底
- 点右上角时间标签，展开时间加速（可倒退）和显示开关
- 点右下角 ☰ 打开天体目录

【数据是真的】
行星位置来自 NASA JPL 星历，实时计算，打开看到的就是此刻真实位置。9 颗行星与 JPL Horizons 误差 ≤0.074°，月球约 0.12°，21 颗卫星 10 天内 ≤0.22°。

【教育价值】
免费、免安装、中文界面、手机就能用——非常适合课堂演示和学生自己探索天文尺度。

【技术】
Three.js + WebGL2、浮动原点（Float64 存储，减相机位后降 Float32）、对数深度缓冲、光线步进大气散射、GPU 自适应分档。约 200 kB gzip，MIT 开源。

如果你也觉得"在手机上站在月球看地球升起"这件事很酷，欢迎：
1. 打开体验：https://sw.icodestar.net/?utm_source=zhihu
2. 在 GitHub 点颗 ⭐，对独立开源项目帮助很大
3. 转发给对天文、编程或教育感兴趣的朋友
```

**话题：** #天文 #太阳系 #NASA #Three.js #WebGL #开源 #科普 #前端

---

## 知乎（回答形式）

**目标问题：**
- "有哪些手机上就能玩、又很惊艳的网页？"
- "有哪些让你觉得「这也能用浏览器做」的项目？"
- "有哪些适合给学生讲太阳系的工具或网站？"
- "Three.js 能做到什么程度？"

**通用回答：**
```
推荐我自己做的开源项目：Solar Wanderer / 遨游太阳系。

一个完全跑在浏览器里的 1:1 实时太阳系，用 NASA JPL 星历，打开看到的行星位置就是此刻真实的。最新版手机上也能完整玩——双指捏合，从地球轨道一路缩放到站在月球表面，抬头地球就在黑色天空里。全程没有加载、没有切换。

还能：飞进木星云层、潜入地球海底、时间加速每秒 10 年看卫星绕转、一直飞到 10 万 AU 的奥尔特云。

免安装、中文界面、免费开源。
体验：https://sw.icodestar.net/?utm_source=zhihu
GitHub：https://github.com/hyqzz/Solar-Wanderer
```

---

## B站视频脚本（横屏，约 2 分钟）

**标题：** 我的浏览器太阳系更新了：现在手机上也能登陆月球

**简介：**
```
Solar Wanderer / 遨游太阳系：基于 NASA JPL 星历的浏览器端 1:1 实时太阳系探索器。v2.0 完整支持手机触控。

🔗 在线体验：https://sw.icodestar.net/?utm_source=bilibili
⭐ GitHub：https://github.com/hyqzz/Solar-Wanderer

#太阳系 #NASA #WebGL #Threejs #天文 #科普 #开源 #手机
```

**脚本：**
```
[0:00] 手机录屏，打开 sw.icodestar.net，地球轨道视角
旁白：这是此刻真实的太阳系，行星位置来自 NASA JPL 星历，而且——现在手机上就能玩。

[0:12] 双指捏合放大，无缝降落月球
旁白：双指一捏，从地球轨道一路缩放，没有加载、没有切换，直接站到月球表面。

[0:25] 抬头看地球
旁白：抬头，地球就在这里，完整的蓝色球体。这是阿波罗宇航员真实看到的视角。

[0:40] 点目录飞向土星，看环影
旁白：点一下目录飞到土星，能看到环的影子投在土星本体上。

[0:55] 飞进木星云层
旁白：飞进木星的云层——是的，可以进去。

[1:10] 地球潜水
旁白：回地球，潜到海底，看光线穿透水面。

[1:25] 时间加速
旁白：点右上角时间标签，加速到每秒 10 年，看太阳系运转。

[1:40] 一路向外到奥尔特云
旁白：一直往外飞，过小行星带、柯伊伯带、旅行者 1 号的位置，直到 10 万 AU 的奥尔特云。

[1:55] GitHub 页面
旁白：完全开源 MIT，纯网页，手机电脑都能用，不用装任何东西。链接在简介。
```

**封面建议：** 手机竖屏 + 月球地出画面，大字"手机上就能登陆月球"。

---

## 抖音 / 视频号 / B站竖屏（15–40 秒）

**钩子（前 3 秒最关键）：** "你手机上现在就能登陆月球，不用下载任何 App。"

**脚本（全程手机实拍录屏）：**
```
[0-3s] 手机打开网页，地球悬在画面里
字幕：手机浏览器打开，不用下载

[3-10s] 双指捏合放大，冲进大气，降落月面
字幕：双指一捏，从太空降落月球表面

[10-16s] 抬头，地球挂在黑色天空
字幕：抬头，地球就在这儿 🌍

[16-25s] 快切：土星环 / 木星云层 / 地球海底
字幕：还能飞土星、进木星、潜地球海底

[25-30s] 落在链接页
字幕：sw.icodestar.net｜真实 NASA 数据｜免费开源
```

**文案：** 这个网站太离谱了，手机浏览器直接登陆月球🌕 真实 NASA 数据做的 1:1 太阳系，免费不用下载。#天文 #太阳系 #NASA #冷知识 #科普 #好用的网站

---

## 小红书图文

**标题：** 手机直接登陆月球看地球升起🌍 这个网站零下载太震撼

**正文：**
```
被这个网站惊到了！手机浏览器打开就能玩，不用下载任何 App。

🔭 Solar Wanderer / 遨游太阳系
📱 手机双指捏合，从太空一路降落到月球表面
🌍 站在月面抬头，地球完整挂在黑色天空里
🪐 行星位置是 NASA 真实数据，此刻真实位置
🌊 还能潜进地球海底、飞进木星云层、看土星环影
🚀 一直飞到太阳系边缘的奥尔特云

太适合天文爱好者和学生党了，完全免费开源！

🔗 网址放评论区 / 主页
```

**标签：** #天文 #太阳系 #NASA #科普 #冷知识 #学生党必备 #网站推荐 #手机就能玩 #小众网站 #开源

**配图建议（6 张竖屏轮播）：** ① 封面（手机框 + 月球地出，大字）② 双指捏合降落过程 ③ 土星环 ④ 木星云层 ⑤ 地球水下 ⑥ 网址/二维码页。竖屏手机实拍最佳。

---

## 稀土掘金（技术长文）

**标题：** 把 1:1 太阳系搬上手机：Three.js 项目的移动端适配与精度保持实践

**正文：**
```
在线体验：https://sw.icodestar.net/?utm_source=juejin
源码（MIT）：https://github.com/hyqzz/Solar-Wanderer
```

**大纲：**
1. 背景：一个 0.5 m–10 万 AU 的浏览器端 1:1 太阳系，v2.0 要上手机
2. 触控层：Pointer Events 统一鼠标/触摸，双指捏合 → 复用桌面的 `dist` 缩放曲线，单指环绕、双指平移
3. 难点：手机 GPU 上保持浮动原点精度与无缝着陆不变
4. GPU 自适应分档：`WEBGL_debug_renderer_info` 探测 + 运行时 FPS 守卫，动态调像素比/辉光/大气步进/网格密度
5. 移动端 UI：常驻时间标签、底部目录抽屉、随模式出现的情境动作按钮、虚拟摇杆
6. 性能数据与踩坑总结

**核心代码片段：**
```js
// 双指捏合复用桌面缩放：把 pinch 比例映射到同一条 dist 曲线
const scale = curDist / prevDist;          // 两指间距变化
oc.distTarget = clamp(oc.distTarget / scale, minDist, maxDist);
// → 着陆/起飞手感与桌面滚轮完全一致
```

```js
// 浮动原点：Float64 存储，减相机位后才降 Float32（手机同样适用）
const rel = planet.posKm.clone().sub(camera.posKm); // Float64
mesh.position.set(rel.x, rel.y, rel.z);             // 仅偏移量用 Float32
```

---

## Twitter / X 推文系列（v2.0）

**推文 1（主推，附手机录屏）：**
```
The 1:1 real-time solar system in your browser now runs on your phone. 📱

Pinch to zoom from Earth orbit → standing on the Moon. Look up: Earth in the black sky.

Powered by NASA JPL. ~200 kB. No app.

🔗 https://sw.icodestar.net
⭐ https://github.com/hyqzz/Solar-Wanderer
```

**推文 2（技术角度）：**
```
The hard part of putting Solar Wanderer on mobile wasn't the touch gestures.

It was keeping floating-origin Float64 precision + seamless landing identical to desktop while staying smooth on a phone GPU.

Runtime GPU tiering does the heavy lifting.

https://github.com/hyqzz/Solar-Wanderer
```

**推文 3（互动）：**
```
Pull out your phone. Open this. Pinch to land on the Moon. 🌕

Which world do you visit first?

→ https://sw.icodestar.net
```
