# Hacker News Show HN 帖子

## 标题

Show HN: Solar Wanderer – A 1:1 real-time solar system in the browser, verified by JPL

---

## 正文

Solar Wanderer is a free, open-source, browser-based explorer of the real solar system at true 1:1 km scale.

Link: https://sw.icodestar.net
Source: https://github.com/hyqzz/Solar-Wanderer

What it does:

- Renders the solar system from 0.5 m above a surface to 100,000 AU at the Oort Cloud using floating-origin rendering + logarithmic depth buffer.
- Computes planetary positions from NASA JPL Standish elements and fits moon orbits from Horizons state vectors.
- Lets you fly, orbit, and land on 19 solid worlds with real surface gravity (1.62 m/s² on the Moon, 3.71 on Mars, etc.).
- Supports seamless descent from orbit → atmosphere → surface → walking → underwater, with no loading screens.
- Verifies against JPL Horizons in real time via `npm run verify`.

Tech stack: Three.js 0.165, Vite 5, native ESM, WebGL2. The gzipped JS bundle is ~200 KB. No backend, no account, no GPU farm.

This started as a 48-hour experiment with Claude Fable 5 to see if a browser could handle the precision and scale. The core insight is that you have to get the architecture right on day one: Float64 CPU-side coordinates, camera-relative rendering, and logarithmic depth. Once the skeleton is wrong, everything else becomes a patch.

The part that still gives me chills: landing on the Moon, turning around, and seeing Earth as a tiny blue dot in the black sky.

I’d love feedback, especially on the ephemeris/graphics implementation and on what would make this more useful for education.

---

## 评论区预判与回复

**Q: How does the precision hold up over long time spans?**

A: The Standish elements are reliable roughly 1800–2050. Planetary positions match JPL Horizons within 0.074° in that range. Moons are fitted from Horizons state vectors and stay within ~0.22° over 10 days. Long-term accuracy is a known limitation; VSOP87 + ELP2000 is on the roadmap.

**Q: Why not use WebGPU?**

A: WebGL2 has much wider device support today, including mobile. We use logarithmic depth buffer to handle the scale. WebGPU is interesting for the future, especially for compute-heavy atmospheric simulation.

**Q: How do you handle floating point precision at planetary distances?**

A: CPU-side positions are Float64. We subtract the camera position before uploading to GPU, so the GPU only sees small relative vectors. This is the classic floating-origin technique.

**Q: Is there sound?**

A: Not yet. Ambient audio (radio hiss in space, surface crunch, atmospheric entry) is a highly wanted contribution.

**Q: What's the business model?**

A: None. MIT open source, no ads, no tracking. The mission is to make the solar system accessible to everyone.

---

## 发布技巧

- 选择美东时间周二/周三上午 8:00–9:00 发布（流量高峰）。
- 发布后 30 分钟内积极回复前几条评论，HN 算法看重早期互动。
- 如果帖子沉了，不要重复提交。
- 不要请求朋友帮你 upvote（HN 会检测并惩罚）。

---

## Sources / 素材引用

- **Saturn rings**: NASA Science https://science.nasa.gov/saturn/facts/
- **Jupiter Great Red Spot**: NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **Blue sunsets on Mars**: NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **Oort Cloud** (~100,000 AU): NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **Accuracy claims**: `docs/sdlc/test-report.md` / `npm run verify`
