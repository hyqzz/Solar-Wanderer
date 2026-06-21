# Twitter Thread: 10 tweets on the tech behind Solar Wanderer

## Tweet 1/10

I built a browser app that renders the entire solar system at true 1:1 scale — from 0.5 m above a surface to 100,000 AU at the Oort Cloud.

Here is the architecture behind Solar Wanderer. 🧵

→ https://sw.icodestar.net

## Tweet 2/10

Problem 1: Planetary positions must match NASA JPL Horizons.

We use JPL Standish elements for planets, truncated ELP for the Moon, and Horizons-fitted orbits for 21 moons.

Result: planetary error ≤0.074°, moon error ≤0.22° after 10 days.

## Tweet 3/10

You can verify this yourself:

```bash
npm run verify
```

This cross-checks our ephemeris against the live JPL Horizons API in real time.

## Tweet 4/10

Problem 2: GPUs use 32-bit floats. At planetary distances (10⁸ km), precision collapses — planets jitter and surfaces tear.

Solution: floating-origin rendering.

Store positions as Float64 on CPU. Subtract camera position before uploading to GPU. GPU only sees small relative vectors.

## Tweet 5/10

Problem 3: Depth range from 0.5 m to 10¹³ km.

Standard z-buffer fails at this scale.

Solution: logarithmic depth buffer.

We store log(depth) instead of linear depth, giving usable precision across the entire solar system.

## Tweet 6/10

Problem 4: Seamless landing.

We wanted orbit → atmosphere → surface → walking with no loading screens.

The camera lives in body-fixed (lat, lon, dist). As you scroll, distance decreases. Near the surface, auto-tilt kicks in. At ~2m, walking mode takes over — preserving view direction.

## Tweet 7/10

The whole app is ~200 KB gzipped. No backend. No account. No GPU farm.

It uses Three.js 0.165 + Vite 5 + native ESM + WebGL2.

MIT open source: https://github.com/hyqzz/Solar-Wanderer

## Tweet 8/10

On mobile, GPU auto-tiering detects the renderer string.

Low-end devices get fewer atmosphere samples, simpler terrain, and lower pixel ratio. If fps stays below 28 for 4 seconds, we automatically downgrade once.

## Tweet 9/10

The core skeleton was built in ~48 hours with Claude Fable 5.

Not because it wrote fast, but because it held the whole architecture in context at once. Scale, precision, and camera had to be designed together. Once the skeleton was right, everything else followed.

## Tweet 10/10

What’s next:

- Real DEM terrain (Moon LOLA, Mars MOLA)
- Eclipse shadows
- WebXR/VR
- Guided educational tours

If any of that excites you, check the issues. We need contributors.

→ https://github.com/hyqzz/Solar-Wanderer/issues

🌌

---

## 发布建议

- 逐条发布，不要一次性发 10 条 thread（Twitter 的 thread 功能可以一次性发，但更好是边写边发，保持互动）。
- 每条配一张图或 GIF 效果更好。
- 第 1 条配主视频。
- 第 4、5、6 条可以配架构示意图（可以手绘或用 Excalidraw）。

---

## Sources / 素材引用

- **Oort Cloud** (~100,000 AU): NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **Project accuracy**: `docs/sdlc/test-report.md`

