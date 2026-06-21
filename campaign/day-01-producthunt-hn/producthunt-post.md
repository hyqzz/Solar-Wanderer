# Product Hunt 发布文案

## 标题（Tagline）

**Solar Wanderer** — A 1:1 real-time solar system in your browser, verified by NASA JPL.

---

## 一句话描述（One-liner）

Stand on the Moon and watch Earth rise. Fly to Saturn's rings. Walk on Mars. All in your browser, at true 1:1 scale, using real NASA ephemerides.

---

## 产品描述（Description）

Solar Wanderer is a free, open-source, browser-based exploration of the real solar system.

Most space apps shrink distances, speed up orbits, or fake positions for gameplay. We don't. Every planet, moon, and spacecraft is placed using NASA JPL ephemerides, meaning the view you see matches reality — right now.

You can:

- Zoom from Earth orbit straight down to the surface and walk around — no loading screens, no "enter planet" buttons.
- Land on the Moon, Mars, Europa, Titan, Pluto, and 13 other worlds with real surface gravity.
- Fly through Saturn's rings, dive into Jupiter's clouds, and pull back until the Oort Cloud appears.
- Compare every view against the live JPL Horizons API with `npm run verify`.

It's pure static HTML/JS, ~200 KB gzipped, works on desktop and mobile, and needs no account or backend.

We built this because we believe: **before humanity becomes an interstellar species, we must first truly see our own backyard.**

---

## Maker Comment（发布后的第一条评论）

Hi Product Hunt! 👋

I'm the maker of Solar Wanderer. This started as a wild experiment: could a single web page render the entire solar system at true 1:1 scale, from 0.5 meters to 100,000 AU, and still run on a phone?

The answer turned out to be yes. The core architecture — double-precision ephemeris, floating-origin rendering, logarithmic depth buffer — was built in about 48 hours with Claude Fable 5, and then refined over the following weeks.

The moment that hooked me: landing on the Moon, turning around, and seeing Earth as a tiny blue marble against the black sky. That's the experience I want everyone to have.

Everything is MIT open source. If you're into astronomy, WebGL, education, or just curious, I'd love your feedback and contributions.

Try it: https://sw.icodestar.net
Source: https://github.com/hyqzz/Solar-Wanderer

---

## 图片/GIF 说明（Gallery）

请按以下顺序上传 6 张素材：

1. **主图/视频**：[`main-demo-en.mp4`](../assets/videos/main-demo-en.mp4)（48 秒 demo，16:9）或 [`earth-orbit_1920x1080.png`](../assets/screenshots/earth-orbit_1920x1080.png)
2. **站在月球看地球升起**：[`moon-earthrise_1920x1080.png`](../assets/screenshots/moon-earthrise_1920x1080.png)
3. **土星环特写**：[`saturn-rings_1920x1080.png`](../assets/screenshots/saturn-rings_1920x1080.png)
4. **木星大红斑与云带**：[`jupiter-redspot_1920x1080.png`](../assets/screenshots/jupiter-redspot_1920x1080.png)
5. **火星蓝色日落**：[`mars-sunset_1920x1080.png`](../assets/screenshots/mars-sunset_1920x1080.png)
6. **奥尔特云回望太阳系**：[`earth-orbit_1920x1080.png`](../assets/screenshots/earth-orbit_1920x1080.png) 或 [`scale_en_1080x1350.png`](../assets/social-cards/scale_en_1080x1350.png)

Logo/Icon：暂无专用 `logo.png`，可用 [`sun-closeup_1920x1080.png`](../assets/screenshots/sun-closeup_1920x1080.png) 裁剪为 1:1 临时代替

---

## Topics / Categories

- Space
- Education
- Web App
- Open Source
- Developer Tools

---

## 发布按钮点击后

1. 立即在 Twitter 分享 Product Hunt 链接。
2. 回复前 10 条评论，建立早期互动。
3. 邀请朋友和同事 upvote（但不要用脚本或刷量）。

---

## 跟进评论模板

**有人夸画面时：**

> Thank you! The visuals are driven by real NASA textures and physical atmosphere scattering. If you land on Mars, the sunset is actually blue because of dust scattering — we tried hard to keep it scientifically grounded.

**有人问精度时：**

> We validate against NASA JPL Horizons. Planetary positions are within 0.074°, the Moon within ~0.12°. You can run `npm run verify` in the repo to see it cross-check live against Horizons.

**有人问商业模式时：**

> It's completely free and MIT open source. No ads, no accounts, no tracking. The goal is to make the solar system accessible to everyone.

**有人问移动端时：**

> Yes, it works on phones and tablets. Pinch to zoom, drag to orbit, tap a body to fly there. GPU auto-tiering keeps it smooth on mid-range devices.

---

## Sources / 素材引用

- **Saturn rings** (280,000 km wide, ~10 m thick): NASA Science https://science.nasa.gov/saturn/facts/
- **Jupiter Great Red Spot** (1.3× Earth, 350+ years): NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **Blue sunsets on Mars**: NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **Oort Cloud** (~100,000 AU): NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **Project accuracy**: tested vs NASA JPL Horizons; see `docs/sdlc/test-report.md`
