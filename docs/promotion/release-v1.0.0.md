## 🚀 Solar Wanderer v1.1.0 — Now the *entire* solar system, in a browser tab

> **What's new in v1.1.0:** the simulation now spans the whole solar system out to ~2 light-years — **28 real trans-Neptunian objects** (Eris, Sedna, Makemake, Haumea, Quaoar…) on true JPL orbits, the **Oort Cloud** as a statistical particle shell, **real 3D stellar parallax** for 21 bright stars, and light-year distance units.


A **1:1 real-time** solar system explorer that runs entirely in your browser. The planets are computed from **NASA JPL ephemerides** against your system clock — so when you open it, everything is where it actually is *right now*.

**▶ Try it instantly: https://sw.icodestar.net** — zero install, zero account, ~180 kB gzipped.

### What you can do

- 🌍 **Scroll from Earth orbit down to walking on the Moon** — no loading screen, no cut. Look up: Earth hangs full and blue in the black lunar sky.
- 🚶 **Land and walk** on 19 solid worlds with real surface gravity. Jump 6× higher on the Moon. Dive underwater on Earth.
- 🌅 **Ray-marched atmospheres** — blue limb from space, red sunsets, butterscotch Martian sky. Fly *into* Jupiter's cloud deck.
- 🪐 **Saturn's rings** with ice-particle scatter and a shadow cast onto the planet body.
- ☄️ **The full solar system** — asteroid belt, Kuiper belt, 28 real trans-Neptunian objects (Eris, Sedna, Makemake…), the Oort Cloud, out to ~2 light-years.
- 🚀 **6DOF free flight** 1 m/s → 2 AU/s, time-warp ×10 years/s, freeze anywhere.
- 🔭 **21 real bright stars** at true 3D positions — you see real parallax as you move through the solar system.

### Why it's different

| | |
|---|---|
| **Scale** | True 1:1 km — floating-origin + log depth renders 0.5 m to 100,000 AU seamlessly |
| **Accuracy** | JPL Horizons verified — ≤0.074° for planets, 21 moons fitted from state vectors. Run `npm run verify` yourself. |
| **Immersion** | Continuous orbit → atmosphere → surface → walking → underwater, no cuts |
| **Footprint** | Pure Three.js + Vite, no backend, no account, MIT |

### Under the hood

Floating-origin scene graph (Float64 positions, downcast to Float32 only after camera subtraction), logarithmic depth buffer, ray-marched Rayleigh+Mie atmospheres, GPU auto-tiering. All ephemeris code is pure functions, Node-testable, cross-checked against the live NASA JPL Horizons API.

### Get started

```bash
git clone https://github.com/hyqzz/Solar-Wanderer.git
cd Solar-Wanderer && npm install && npm run dev
```

Or just open **https://sw.icodestar.net**.

---

**Contributions welcome** — translations, real DEM terrain, eclipse shadows, sound, mobile touch. See [CONTRIBUTING.md](https://github.com/hyqzz/Solar-Wanderer/blob/main/CONTRIBUTING.md) and the `good first issue` label.

⭐ Star it if it made you feel small in a good way.
