# r/webdev 帖子

## 标题

I built a 1:1 real-time solar system in the browser. Here’s how we handle precision, scale, and performance.

---

## 正文

Hey r/webdev,

I’ve been working on Solar Wanderer, a free open-source web app that renders the real solar system at true 1:1 scale in the browser.

Link: https://sw.icodestar.net  
Source: https://github.com/hyqzz/Solar-Wanderer

I thought this community might appreciate the technical challenges:

**1. Floating-point precision at planetary distances**
GPUs use 32-bit floats. Storing Jupiter at 778 million km eats precision. We use floating-origin rendering: store positions as Float64 on CPU, subtract camera position, upload only relative vectors to GPU.

**2. Depth range from 0.5 m to 10¹³ km**
Standard z-buffer fails. We use logarithmic depth buffer (`logarithmicDepthBuffer: true` in Three.js).

**3. Real ephemeris in JavaScript**
Planets from JPL Standish elements. Moon from truncated ELP. Moons fitted from Horizons state vectors. All verifiable with `npm run verify` against JPL Horizons.

**4. Mobile performance**
GPU auto-tiering based on renderer string. Automatic quality downgrade if fps < 28 for 4 seconds.

The gzipped bundle is ~200 KB. No backend.

Would love feedback on the architecture or the code.

---

## 配图

- 架构图（浮动原点示意）
- 性能对比图
- 站在月球看地球截图

---

## 标签

无特定标签，直接发帖。
