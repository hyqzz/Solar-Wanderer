<div align="center">

# 🚀 Solar Wanderer · 遨游太阳系

**The first stop on humanity's journey to becoming an interstellar civilization.**

A 1:1 real-time solar system explorer — entirely in your browser. Now on your phone.

Powered by NASA JPL ephemerides. The planets are where they are **right now**.

[![Live Demo](https://img.shields.io/badge/▶%20Live%20Demo-sw.icodestar.net-4a9eff?style=for-the-badge)](https://sw.icodestar.net)
[![中文 README](https://img.shields.io/badge/中文-README-red?style=for-the-badge)](README-zh.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-0.165-black?style=for-the-badge&logo=three.js)](https://threejs.org)
[![Stars](https://img.shields.io/github/stars/hyqzz/Solar-Wanderer?style=for-the-badge&color=yellow)](https://github.com/hyqzz/Solar-Wanderer/stargazers)

*Zero install · Zero account · Zero backend · Desktop **&** mobile · ~200 kB gzipped · MIT open source*

<br>

### ▶ Demo video

<a href="https://youtu.be/3rwShi6oF0o" title="Play Solar Wanderer demo on YouTube">
  <img src="docs/sdlc/screenshots/example/youtube-demo-poster.jpg" alt="▶ Click to play — Solar Wanderer demo video on YouTube" width="240">
</a>

<br>

[![Watch demo on YouTube](https://img.shields.io/badge/▶%20Watch%20Demo%20Video-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/3rwShi6oF0o)

</div>

---

## 🌌 Why this matters

We all learned the names of the planets as children. But have you ever **been** there?

Most space apps make you choose: either scientifically accurate, or beautiful and immersive. Solar Wanderer does both. It puts the real solar system — every planet, every moon, every AU — into a web page that anyone can open, on any device, for free.

Our mission is simple:

> **Before humanity becomes an interstellar species, we must first truly see our own backyard.**

When a child stands on the Moon, turns around, and sees Earth as a tiny blue marble in the black sky, something changes. When a student pulls back from Earth until the planets shrink to dots and the Oort Cloud appears, their sense of scale changes forever. When a teacher can take an entire classroom to Mars in five minutes, science education changes.

This is not just a simulation. It is an **invitation**.

---

## ✨ What makes it different

| | Solar Wanderer |
|---|---|
| **Scale** | True 1:1 km — every planet, every moon, every AU, from 0.5 m to 100,000 AU |
| **Accuracy** | NASA JPL Horizons verified · ≤0.074° for planets · 21 moons fitted from state vectors |
| **Immersion** | Seamless descent from orbit → atmosphere → surface → walking → underwater (no cuts, no loading) |
| **Scope** | Sun to the Oort Cloud (100,000 AU) · asteroid belt · Kuiper belt · 28 real TNOs · 4 comets · past the heliopause where Voyager 1 & 2 are now |
| **Anywhere** | Desktop keyboard/mouse **and** full mobile touch — same physics, same scale |
| **Size** | ~200 kB gzipped JS · no server · no GPU farm |
| **Open** | MIT licensed · all data from public NASA/IAU sources · verifiable against JPL Horizons |

---

## 🎯 The Road Ahead: Help us build the first interstellar stepping stone

Solar Wanderer already works. But to become *indistinguishable from reality* and reach billions of people, we need your help.

We are building toward four pillars:

1. **🪐 Realism that is indistinguishable from reality**
   - Real DEM terrain for the Moon (LOLA), Mars (MOLA/HiRISE), and Earth (SRTM)
   - Real solar/lunar/planetary eclipse shadows
   - Dynamic weather, clouds, dust storms, auroras
   - High-resolution 16K–32K textures
   - Real spacecraft with 3D models and mission histories

2. **🥽 Immersion that makes you feel you are there**
   - WebXR / VR support
   - First-person spacesuit HUD
   - Environmental storytelling: Apollo landing sites, rover tracks, landmarks
   - Dynamic time-of-day and seasonal visuals
   - Spatial orientation aids and scale references

3. **📚 A public science education system**
   - Structured guided tours and courses
   - Voice narration in multiple languages
   - Teacher/classroom/museum toolkits
   - Real-time astronomical event simulations
   - A scalable content platform for facts, stories, and lessons

4. **🌍 Reach: let the world know**
   - Multi-language support
   - Video content, blogs, SEO
   - Partnerships with schools, museums, planetariums, and space agencies
   - Community-driven content and translations

**👉 See the full master plan:** [`ROADMAP.md`](ROADMAP.md)

---

## 🙌 How to contribute

We welcome contributors of all kinds: developers, astronomers, educators, translators, designers, writers, video creators, and space enthusiasts.

### Quick start

```bash
git clone https://github.com/hyqzz/Solar-Wanderer.git
cd Solar-Wanderer
npm install
npm run dev      # → http://localhost:5173
npm test         # 33 precision tests (no network needed)
npm run verify   # live cross-check against NASA JPL Horizons (needs internet)
```

### Most wanted contributions

| Area | What's needed | Good first issue? |
|------|--------------|-------------------|
| **Real terrain** | USGS LOLA (Moon) / MOLA (Mars) DEM tile streaming | ⭐ Yes |
| **Eclipse shadows** | Sun–Moon–Earth shadow volumes | Advanced |
| **Sound** | Ambient radio hiss, surface crunch, underwater | ⭐ Yes |
| **Translations** | English/Chinese already done; Japanese, Spanish, French, Arabic… | ⭐ Yes |
| **Education content** | Guided tours, facts, quizzes, lesson plans | ⭐ Yes |
| **VR / WebXR** | Immersive headset support | Advanced |
| **Accuracy** | VSOP87 + ELP2000 for ±3000 year validity | Advanced |
| **Bookmarks** | Save/restore position + time | ⭐ Yes |
| **Spacecraft models** | Voyager, New Horizons, Juno, Cassini 3D models and trajectories | ⭐ Yes |
| **Outreach** | Blog posts, videos, social media, school partnerships | ⭐ Yes |

**Check our [Issues](https://github.com/hyqzz/Solar-Wanderer/issues) tab** — we are turning the master plan into actionable issues. Pick one, comment, and jump in.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for code style and PR process.

---

## 🎮 Try it now

**[https://sw.icodestar.net](https://sw.icodestar.net)**

No install. No account. Just open and go.

**Recommended first experiences:**
1. Open the directory → tap **Moon** → pinch all the way in → land → look up: the blue Earth hangs in the black sky.
2. Pull back from Earth until the planets become dots, then keep going until the Oort Cloud appears.
3. Double-click **Saturn** and zoom in until you can see the Cassini Division in the rings.

---

## 🛠 Tech stack

- Three.js 0.165 · Vite 5 · native ESM · WebGL2 · logarithmic depth buffer
- Pure-function ephemeris layer (Node-testable)
- Floating-origin rendering for 1:1 km scale
- GPU auto-tiering for mobile and low-end devices

---

## 📊 Accuracy

| Body | vs NASA JPL Horizons |
|------|----------------------|
| Planets (9) | 0.0007° – 0.074° |
| Moon | 0.12° (truncated ELP) |
| Moons (21) | 0° at epoch · ≤ 0.22° after 10 days |
| Earth rotation | Sub-second meridian · 23.4° summer solstice · 1 sidereal day |

---

## 📣 Spread the word

If Solar Wanderer made you feel small in a good way, please:

- ⭐ Star this repo
- 🔗 Share [sw.icodestar.net](https://sw.icodestar.net)
- 📺 Make a video or write a post about your experience
- 🏫 Tell a teacher, a student, or a museum curator

Together, we can make the solar system feel like home — and prepare humanity for the stars.

---

## Credits

| | |
|---|---|
| **Ephemerides** | NASA JPL (*Standish 1992* planetary elements · Horizons API state vectors) |
| **Textures** | [Solar System Scope](https://www.solarsystemscope.com/textures/) CC-BY-4.0 · Steve Albers SOS · NASA JPL Photojournal (public domain) |
| **Rotation models** | IAU/WGCCRE reports |
| **Bright stars** | Hipparcos catalog |

---

<div align="center">

MIT © 2026 [hyqzz](https://github.com/hyqzz)

*Built with Three.js · Verified against NASA JPL · Made to feel small*

</div>
