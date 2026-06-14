# Reddit Posts

> One subreddit at a time, spaced out (not all the same hour). Read each sub's rules first — some require flair, some ban link-only posts. Always reply to comments fast in the first 2–3 hours. The mobile angle is the fresh hook: people are often *reading Reddit on the phone they can immediately test it with.*

---

## r/InternetIsBeautiful

**Title:** A 1:1 real-time solar system you can explore in your browser — now works on your phone (land on the Moon, fly to the edge of the solar system)

**Body:**
```
https://sw.icodestar.net

Open it on your phone right now — pinch to zoom from Earth orbit all the way down to standing on the Moon's surface, then look up and Earth is hanging in the black sky. No app, no install.

A few things you can do:
- Pinch from orbit down to the surface (no loading screen, no cuts)
- Walk around on 19 worlds with real surface gravity
- Dive underwater on Earth
- Enter Jupiter's cloud deck
- Fast-forward time at 10 years/second and watch the planets orbit
- Fly past the heliopause where Voyager 1 crossed into interstellar space, out to the Oort Cloud

Planet positions come from NASA JPL ephemerides, so they're where they actually are right now. ~200 kB of JavaScript, no backend.

GitHub (MIT): https://github.com/hyqzz/Solar-Wanderer
```

---

## r/space

**Title:** I made a browser solar system simulator with real NASA JPL positions — v2.0 now runs on phones, so you can land on the Moon from your pocket

**Body:**
```
https://sw.icodestar.net

I've been building Solar Wanderer for the past few months — a real-time, 1:1 scale solar system explorer that runs purely in your browser. The new v2.0 release adds full mobile support, so you can do all of this from the phone you're probably holding right now.

Positions are computed from NASA JPL Standish planetary elements against your system clock, cross-checked against the Horizons API (≤0.074° for all 9 planets). So when you open it, the planets are actually where they are right now.

The coolest moment: zoom from Earth orbit continuously down to the lunar surface, then look up. Earth is right there, full and blue, in the Moon's black sky. No cut, no loading — one continuous zoom.

You can also:
- Walk on 19 solid worlds with real surface gravity
- Dive into Jupiter's cloud deck
- Follow Voyager 1 and 2 to their current positions, then on to the Oort Cloud
- Time-warp at 10 years/second

MIT licensed, fully open source: https://github.com/hyqzz/Solar-Wanderer
```

---

## r/threejs

**Title:** Shipped mobile support for my 1:1 Three.js solar system — floating origin, log depth, ray-marched atmospheres, now with touch + GPU auto-tiering

**Body:**
```
https://sw.icodestar.net | Source: https://github.com/hyqzz/Solar-Wanderer

I just released v2.0 of Solar Wanderer (1:1 real-time solar system, 0.5 m → 100,000 AU). The headline is full mobile support, and the interesting part was *not* breaking any of the precision/landing tech while staying smooth on a phone GPU.

Technical highlights for this community:

Floating origin: the scene is recentered on the camera every frame. Planet positions are Float64, downcast to Float32 only after subtracting the camera position — sub-meter precision at any distance up to 100,000 AU.

Logarithmic depth buffer: `gl_FragDepth = log2(1.0 + vLogZ) * logDepthBufFC` lets one scene render 0.5 m to 1.5×10¹³ km without z-fighting.

Ray-marched atmospheres: Rayleigh+Mie, 16 view-ray steps + 8 sun-ray steps per fragment, per-planet tuned coefficients — Earth's blue limb, Mars's butterscotch sky, Jupiter's cloud deck you can fly into.

GPU auto-tiering: `WEBGL_debug_renderer_info` detects discrete vs. integrated/mobile GPU and adjusts pixel ratio, bloom samples, atmosphere steps, and mesh density at runtime, with an FPS guard that downshifts live. `?quality=lite` forces low tier. This is what makes the phone version viable.

Seamless landing on touch: the GE-style OrbitCamera (lat/lon/dist) transitions to surface walking when altitude < ~1.7 m against a terrain heightFn — same position, same orientation, no discontinuity — and the pinch gesture drives the same zoom path the scroll wheel does on desktop.

Happy to go deep on any of these.
```

---

## r/webgl

**Title:** 0.5 m to 100,000 AU in one WebGL2 context, on desktop and mobile — techniques from Solar Wanderer

**Body:**
```
https://sw.icodestar.net

Solar Wanderer is a 1:1 real-time solar system explorer (MIT). v2.0 just added mobile. The main WebGL challenges:

1. Precision at scale: 64-bit planet positions, floating-origin recentering, log depth buffer.
2. Atmosphere shaders: ray-marched Rayleigh+Mie that work from orbit (blue limb), surface (colored sky), and inside the atmosphere (haze).
3. Saturn's rings: ice-particle grazing-scatter BRDF + shadow projected onto the planet via shadow map.
4. Terrain detail: multi-octave height noise with per-LOD origin offsets to avoid fp32 quantization at the 6400 km Earth-radius scale.
5. Mobile perf: runtime GPU tiering (pixel ratio, bloom, atmosphere steps, mesh density) so a phone GPU stays above ~30 fps without changing any of the above.

Source: https://github.com/hyqzz/Solar-Wanderer
```

---

## r/gamedev

**Title:** Seamless planet landing in a browser space game — and keeping it identical on mobile touch

**Body:**
```
https://sw.icodestar.net

Solar Wanderer is a 1:1 real-time solar system explorer in the browser (MIT, Three.js + Vite). The feature I'm most proud of: seamless landing. No "entering atmosphere" loading screen, no transition, no teleport. One continuous gesture takes you from orbit through atmosphere to the ground, where you start walking — and reverses to take off.

Implementation: the camera is parameterized as (focusBody, lat, lon, dist). As `dist` approaches `radius + 1.7 m`, it auto-tilts from top-down to horizon-level, then switches to a Walk mode that shares the same position and quaternion. The collision heightFn is the same function the terrain vertex shader uses, so there's no mismatch.

For v2.0 (mobile) the trick was mapping the pinch gesture onto the exact same `dist` zoom curve the scroll wheel drives — so landing feels identical with a finger.

Source: https://github.com/hyqzz/Solar-Wanderer
```

---

## r/astronomy *(softer, education-framed — read rules, this sub is strict on self-promo; consider posting as a comment in relevant threads instead)*

**Title:** A browser-based, real-time solar system model using JPL ephemerides — now mobile-friendly for classrooms

**Body:**
```
I built Solar Wanderer to give people an intuitive sense of how big the solar system actually is. It uses real Standish orbital elements and IAU rotation models, so positions match reality (verified ≤0.074° vs JPL Horizons). It renders the asteroid belt, Kuiper belt, 28 real TNOs, and the Oort Cloud. v2.0 added full phone support, so it works on student devices without any install. Free, open source, bilingual EN/中文.

https://sw.icodestar.net — source: https://github.com/hyqzz/Solar-Wanderer
```
