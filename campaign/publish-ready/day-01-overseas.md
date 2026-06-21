# Day 1 · 海外发布素材包

> 发布日期：建议上线首日 09:00–11:00（美西时间周二/周三早晨）
> 目标平台：Product Hunt、Hacker News、Reddit (r/webdev / r/space)、LinkedIn、Twitter/X

---

## 1. Product Hunt 发布

### 基本信息
- **Name**: Solar Wanderer / 遨游太阳系
- **Tagline**: A real-time 1:1 solar system in your browser, powered by NASA JPL ephemerides.
- **Topics**: Web App, Open Source, Space, Education, Three.js
- **Website**: https://sw.icodestar.net
- **GitHub**: https://github.com/hyqzz/Solar-Wanderer
- **Video**: [`main-demo-en.mp4`](campaign/assets/videos/main-demo-en.mp4)（48 秒，16:9，建议上传）
- **Gallery**:
  1. [`earth-orbit_1920x1080.png`](campaign/assets/screenshots/earth-orbit_1920x1080.png) — Earth orbit
  2. [`moon-earthrise_1920x1080.png`](campaign/assets/screenshots/moon-earthrise_1920x1080.png) — Earthrise from the Moon
  3. [`mars-sunset_1920x1080.png`](campaign/assets/screenshots/mars-sunset_1920x1080.png) — Blue sunset on Mars
  4. [`saturn-rings_1920x1080.png`](campaign/assets/screenshots/saturn-rings_1920x1080.png) — Saturn rings
  5. [`jupiter-redspot_1920x1080.png`](campaign/assets/screenshots/jupiter-redspot_1920x1080.png) — Great Red Spot
  6. [`sun-closeup_1920x1080.png`](campaign/assets/screenshots/sun-closeup_1920x1080.png) — Sun closeup
- **Icon/Logo**: [`logo.png`](campaign/assets/logo.png)（如尚未生成，可用太阳截图临时替代）

### Description
```
Solar Wanderer puts a real-time, true-scale solar system in your browser—no install, no signup, no ads.

Built from real NASA JPL ephemerides, every planet, moon, and major satellite moves in its actual orbit. The scale is 1:1, from 0.5 m above a moon surface to 100,000 AU at the edge of the Oort Cloud.

What you can do:
• Start at Earth, the Moon, Mars, Saturn, Jupiter, or the Sun
• Watch a blue sunset on Mars or Earth rise from the Moon
• Fly through Saturn’s rings—280,000 km wide but only 10–20 m thick
• Toggle inertial / body-fixed anchor to see how moons really orbit
• Fly in 6DOF ship mode from m/s to 2 AU/s

It’s open source (MIT), runs on Three.js + WebGL2, and works on desktop and mobile.

Explore: https://sw.icodestar.net
Code: https://github.com/hyqzz/Solar-Wanderer

Sources:
• Saturn rings (280,000 km wide, ~10 m thick): NASA Science https://science.nasa.gov/saturn/facts/
• Jupiter Great Red Spot (1.3× Earth, 350+ years): NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
• Blue sunsets on Mars: NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
• Oort Cloud outer edge ~100,000 AU: NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
• Accuracy: tested vs JPL Horizons; see docs/sdlc/test-report.md
```

### First Comment（发布后立即评论，增加互动）
```
Hi everyone, creator here. I built this because I wanted to feel how big the solar system actually is—most apps compress distances or use fake orbits.

Solar Wanderer uses real orbital elements and real rotation models. The positions match JPL Horizons within ~0.07° for planets and ~0.22° for major moons over 10 days.

Happy to answer questions about the ephemeris math, WebGL precision tricks (logarithmic depth buffer + floating origin), or why Mars sunsets are blue.
```

### Maker 评论回复模板
```
Thanks for checking it out! If anything feels slow on your device, the quality slider auto-downgrades. Let me know what GPU/frame rate you get.
```

---

## 2. Hacker News 发布

### Title
`Show HN: A real-time 1:1 solar system in the browser (NASA JPL ephemerides)`

### Body
```
https://sw.icodestar.net

Solar Wanderer is a browser-based, real-time solar system simulator built from real NASA JPL ephemerides. Scale is 1:1 from 0.5 m above a moon surface to 100,000 AU.

Tech notes:
• Three.js + WebGL2, logarithmic depth buffer
• Floating origin + camera-relative coordinates for fp32 precision at planetary distances
• Standish orbital elements + IAU rotation models
• 6DOF flight / walking / ship physics
• MIT open source: https://github.com/hyqzz/Solar-Wanderer

The thing I’m most proud of: the orbit paths and positions stay accurate across the full scale range, which is surprisingly hard because standard depth buffers fall apart beyond ~1e6 km.

I’d love feedback on performance on lower-end devices, any ephemeris edge cases, and whether the controls feel intuitive.

Sources for the astronomical claims:
- Saturn rings: https://science.nasa.gov/saturn/facts/
- Jupiter Great Red Spot: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- Mars blue sunsets: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- Oort Cloud: https://science.nasa.gov/solar-system/oort-cloud/facts/
```

### 评论回复要点
- 性能：自动 quality 降档，-log depth。
- 为什么不用 WebGPU：WebGL2 兼容性更广，后续可能加 WebGPU 后端。
- 数据来源：NASA JPL Horizons，Standish elements。

---

## 3. Reddit r/webdev 帖子

### Title
`I built a real-time 1:1 solar system in the browser with Three.js. No install, no signup.`

### Body
```
Demo: https://sw.icodestar.net
GitHub: https://github.com/hyqzz/Solar-Wanderer

It runs entirely in the browser and uses NASA JPL ephemerides for planet/moon positions. The camera can go from 0.5 m above a moon surface all the way out to 100,000 AU at the Oort Cloud without z-fighting, thanks to logarithmic depth buffer + floating origin.

I also added a 6DOF flight mode, surface walking/submarine-style underwater physics, and an inertial anchor toggle so you can see moons orbit their planets from a fixed frame.

Tech stack: Three.js, WebGL2, Vite, native ESM. Tests run with Node’s built-in test runner.

Would love your thoughts on the code structure or any rendering tricks I could add.

Astronomy sources:
- Saturn rings: https://science.nasa.gov/saturn/facts/
- Jupiter Great Red Spot: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- Mars blue sunsets: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- Oort Cloud: https://science.nasa.gov/solar-system/oort-cloud/facts/
```

---

## 4. Reddit r/space 帖子

### Title
`Solar Wanderer — a true-scale, real-time solar system you can explore in your browser`

### Body
```
https://sw.icodestar.net

I made a browser app that simulates the solar system in real time at 1:1 scale. Planets, moons, and major satellites use real NASA JPL ephemerides and real IAU rotation models.

Some things you can see:
• Earthrise from the Moon
• Blue sunsets on Mars
• Saturn’s rings—280,000 km wide, only 10–20 m thick
• Jupiter’s Great Red Spot
• The Sun out to the Oort Cloud (100,000 AU)

It’s free, open source, and works on mobile. Let me know what object or view you’d want to see next.

Sources:
- Saturn rings: https://science.nasa.gov/saturn/facts/
- Jupiter Great Red Spot: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- Mars blue sunsets: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- Oort Cloud: https://science.nasa.gov/solar-system/oort-cloud/facts/
```

---

## 5. LinkedIn 帖子

### Body
```
I just shipped Solar Wanderer — a real-time, true-scale solar system simulator that runs in your browser.

Why this project? Most space apps compress distances or use simplified orbits. I wanted to see the real thing: Saturn’s rings 280,000 km wide but only 10–20 m thick, a blue sunset on Mars, Earth rising over the Moon, all using actual NASA JPL ephemerides.

Tech highlights:
• 1:1 scale from 0.5 m to 100,000 AU
• WebGL2 + logarithmic depth buffer + floating origin
• 6DOF flight, surface walking, underwater physics
• MIT open source

Try it: https://sw.icodestar.net
Code: https://github.com/hyqzz/Solar-Wanderer

Sources:
- Saturn rings: https://science.nasa.gov/saturn/facts/
- Jupiter Great Red Spot: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- Mars blue sunsets: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- Oort Cloud: https://science.nasa.gov/solar-system/oort-cloud/facts/

#opensource #threejs #space #webgl #nasa
```

### 配图建议
- 1 张主图：[`intro_en_1080x1350.png`](campaign/assets/social-cards/intro_en_1080x1350.png)
- 可附加 4 张场景截图

---

## 6. Twitter/X Thread

### Tweet 1
```
I built a real-time, true-scale solar system in the browser.

No install. No signup. No ads.

Every planet, moon, and satellite moves according to real NASA JPL ephemerides.

→ https://sw.icodestar.net
```

### Tweet 2
```
The scale is 1:1.

You can stand on the Moon and watch Earth rise, then zoom out past Saturn, Pluto, and the Kuiper Belt all the way to the Oort Cloud at 100,000 AU.

Most apps fake the distances. This one doesn't.
```

### Tweet 3
```
Some views worth trying:

• Blue sunset on Mars
• Saturn’s rings (280,000 km wide, 10–20 m thick)
• Jupiter’s Great Red Spot
• Earthrise from the Moon

All rendered in real time.
```

### Tweet 4
```
Tech stack: Three.js + WebGL2, logarithmic depth buffer, floating origin, native ESM.

Open source under MIT:
https://github.com/hyqzz/Solar-Wanderer

If you try it, reply with your favorite view.
```

### Tweet 5 / Sources
```
Sources for the science claims in this thread:
• Saturn rings: https://science.nasa.gov/saturn/facts/
• Jupiter Great Red Spot: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
• Mars blue sunsets: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
• Oort Cloud: https://science.nasa.gov/solar-system/oort-cloud/facts/
```

### 配图/视频
- Tweet 1: 视频 `main-demo-en.mp4` 或 GIF
- Tweet 2-3: 对应场景截图
- Tweet 4: GitHub 截图或 logo

---

## Day 1 发布检查清单

- [ ] Product Hunt 提交（视频 + 6 张图）
- [ ] HN 帖子发布
- [ ] Reddit r/webdev + r/space 发布（间隔 2 小时避免 spam）
- [ ] LinkedIn 发布
- [ ] Twitter/X Thread 发布
- [ ] 回复前 10 条评论
- [ ] 置顶 GitHub 链接和 demo 链接

---

## 参考资料（发布时可选附在评论区或描述底部）

- **土星环尺寸** – NASA Science: https://science.nasa.gov/saturn/facts/
  - “Saturn's ring system extends up to 175,000 miles (282,000 kilometers) from the planet, yet the vertical height is typically about 30 feet (10 meters) in the main rings.”
- **木星大红斑** – NASA Science / Juno: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
  - “the Great Red Spot is 1.3 times as wide as Earth... possibly existed for more than 350 years”
- **火星蓝色日落** – NASA Science: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
  - “Fine dust in the atmosphere permits blue light to penetrate the atmosphere more efficiently than colors with longer wavelengths.”
- **奥尔特云** – NASA Science: https://science.nasa.gov/solar-system/oort-cloud/facts/
  - “outer edge being located somewhere between 10,000 and 100,000 AU from the Sun”
- **项目星历精度** – 见 `docs/sdlc/test-report.md` 与 `tests/ephemeris.test.mjs`（`npm test` 可复现）。
