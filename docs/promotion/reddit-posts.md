# Reddit Posts

---

## r/InternetIsBeautiful

**Title:** A 1:1 real-time solar system you can explore in your browser — land on the Moon, walk to the edge of the solar system

**Body:**
https://sw.icodestar.net

Built this over the past few months. A few things you can do:

- Scroll from Earth orbit all the way down to walking on the Moon's surface (no loading screen, no cuts)
- Look up from the Moon's surface and see Earth hanging in the black sky
- Dive underwater on Earth
- Enter Jupiter's cloud deck
- Fast-forward time at 10 years/second and watch the planets orbit
- Fly out to the heliopause at 120 AU — where Voyager 1 crossed into interstellar space

Planet positions are computed from NASA JPL ephemerides so they're where they actually are right now. ~170 kB of JavaScript, no install.

GitHub (MIT): https://github.com/hyqzz/Solar-Wanderer

---

## r/space

**Title:** I made a browser-based solar system simulator with real NASA JPL positions — here's what standing on the Moon looks like

**Body:**
https://sw.icodestar.net

I've been building Solar Wanderer for the past few months — a real-time, 1:1 scale solar system explorer that runs purely in your browser.

The positions are computed from NASA JPL Standish planetary elements against your system clock, cross-checked against the Horizons API (≤0.074° accuracy for all 9 planets). So when you open it, the planets are actually where they are right now.

The coolest moment: scroll from Earth orbit continuously down to the lunar surface, then look up. The Earth is right there, full and blue, in the Moon's black sky. No cut, no loading, just one continuous zoom.

You can also:
- Walk around on 19 solid worlds with real surface gravity
- Dive into Jupiter's cloud deck
- Follow Voyager 1 and 2 to their current positions
- Time-warp at 10 years/second

MIT licensed, entirely open source: https://github.com/hyqzz/Solar-Wanderer

---

## r/threejs

**Title:** I built a 1:1 solar system in Three.js — floating origin, log depth, ray-marched atmospheres, 120 AU render range

**Body:**
https://sw.icodestar.net | Source: https://github.com/hyqzz/Solar-Wanderer

Some technical highlights that might be interesting to this community:

**Floating origin**: The scene is always recentered on the camera each frame. Planet positions are stored as Float64 and downcast to Float32 only after subtracting the camera position — this gives sub-meter precision at any distance up to 120 AU.

**Logarithmic depth buffer**: `gl_FragDepth = log2(1.0 + vLogZ) * logDepthBufFC` lets a single scene render from 0.5 m to 1.8×10¹⁰ km without z-fighting.

**Ray-marched atmospheres**: Rayleigh+Mie scattering with 16 view-ray steps + 8 sun-ray steps per fragment. Each planet has tuned coefficients — Earth's blue limb, Mars's butterscotch sky, Jupiter's thick cloud deck you can fly into.

**GPU auto-tiering**: `WEBGL_debug_renderer_info` detects discrete vs. integrated GPU and adjusts pixel ratio, bloom samples, atmosphere steps, and mesh density at runtime. Falls back gracefully on `?quality=lite`.

**Seamless landing**: The Google Earth-style `OrbitCamera` (parameterized as lat/lon/dist) continuously transitions into surface walking by monitoring altitude against a terrain `heightFn`. When altitude < 1.7 m, camera mode switches to `Walk` — same position, same orientation, no discontinuity.

Happy to go deep on any of these.

---

## r/webgl

**Title:** Show and tell: 0.5 m to 120 AU in one WebGL2 context — techniques I used for Solar Wanderer

**Body:**
https://sw.icodestar.net

I just open-sourced Solar Wanderer — a 1:1 real-time solar system explorer. The main WebGL challenges:

1. **Precision at scale**: 64-bit planet positions, floating-origin recentering, log depth buffer
2. **Atmosphere shaders**: ray-marched Rayleigh+Mie that work from orbit (blue limb), surface (color sky), and inside the atmosphere (haze)
3. **Saturn's rings**: ice-particle grazing scatter BRDF + shadow projected onto the planet via shadow map
4. **Terrain detail**: multi-octave height noise with per-LOD origin offsets to avoid fp32 quantization artifacts at the 6400 km Earth radius scale

Source: https://github.com/hyqzz/Solar-Wanderer (MIT)

---

## r/gamedev

**Title:** Show and tell: seamless planet landing in a browser space game — how I did it

**Body:**
https://sw.icodestar.net

I just finished and open-sourced Solar Wanderer — a 1:1 real-time solar system explorer in the browser.

The feature I'm most proud of technically: **seamless landing**. There's no "entering atmosphere" loading screen, no transition, no teleport. One continuous scroll gesture takes you from orbit (1000 km altitude) through atmosphere, to the ground, where you start walking — and another scroll takes you back up the same way.

Implementation: the camera is parameterized as (focusBody, lat, lon, dist). As `dist` approaches `radius + 1.7m`, it auto-tilts from top-down to horizon-level, then transitions to a `Walk` mode that shares the same position and quaternion. The `heightFn` for collision is the same function used by both the terrain vertex shader and the camera, so there's no mismatch.

Source: https://github.com/hyqzz/Solar-Wanderer (MIT, Three.js + Vite)
