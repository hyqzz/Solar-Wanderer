# Solar Wanderer v2.0.0 — Full Mobile Support

> Published: https://github.com/hyqzz/Solar-Wanderer/releases/tag/v2.0.0

The 1:1 real-time solar system now runs on your phone. Pinch to zoom from Earth orbit straight down to standing on the Moon — powered by NASA JPL ephemerides, no install, in any modern browser.

## 🌟 What's New

### Complete Mobile Experience
- **Touch controls** — pinch-to-zoom, one-finger orbit, two-finger pan, tap-to-fly
- **On-screen joystick** for surface walking and 6DOF flight
- **Persistent time widget** — always-visible simulation clock top-right; tap to expand time warp + display toggles
- **Directory bottom sheet** — full celestial body catalog via the ☰ button
- **Contextual action drawer** — Land / Fly / Jump / Run / Takeoff appear only when relevant
- **GPU auto-tiering for phones** — pixel ratio, bloom, atmosphere steps, and mesh density scale to the device, with a runtime FPS guard
- **Bilingual** — Chinese / English UI, auto-detected from browser language

### Why it was hard
Keeping floating-origin Float64 precision and the seamless orbit-to-surface landing **identical** to desktop while staying smooth on a phone GPU. The pinch gesture is mapped onto the exact same `dist` zoom curve the scroll wheel drives, so landing feels the same with a finger.

## ✨ The full picture

- **Scale** — true 1:1 km, 0.5 m surface detail to 100,000 AU Oort Cloud
- **Ephemeris** — NASA JPL: planets ≤0.074°, Moon ≈0.12°, 21 moons ≤0.22° (verified vs Horizons)
- **Bodies** — 8 planets, Moon, 21 fitted moons, asteroid belt, Kuiper belt, 28 real TNOs, 4 comets, 21 real stars with 3D parallax
- **Atmospheres** — ray-marched Rayleigh+Mie, gas-giant immersive entry
- **Modes** — Orbit (Google Earth-style), 6DOF Free Flight, Surface Walk, Underwater
- **Size** — ~200 kB gzipped JS, no backend, no account, MIT

## 🚀 Try it

**https://sw.icodestar.net** — open it on your phone right now.

## 🙏 Credits
- Ephemerides: NASA JPL (Standish elements + Horizons-fitted moon orbits)
- Textures: NASA/USGS, Solar System Scope CC-BY-4.0, Steve Albers SOS, JPL Photojournal
