# Hacker News — Show HN

> Post Tue–Thu, ~08:00–09:00 ET. No emoji in the title. Don't upvote/ask for upvotes. Drop a technical first comment right after posting, then sit in the thread for 2–3 hours replying to everything — early comment quality drives ranking.

---

## Title

```
Show HN: A 1:1 real-time solar system in your browser, now on mobile too
```

*(Alt title if you want to lead with tech instead of the mobile news:)*
```
Show HN: 1:1 real-time solar system in the browser – NASA JPL ephemerides, 0.5m to 100,000 AU
```

## Body

```
https://sw.icodestar.net

Solar Wanderer lets you freely explore the entire solar system — from the Sun's surface out to the Oort Cloud at 100,000 AU — in real time, in a browser tab, with no install. As of v2.0.0 it runs fully on phones too: pinch to zoom from Earth orbit straight down to standing on the Moon.

A few things I'm particularly happy with:

Real ephemerides. Planet positions come from JPL Standish elements computed against your system clock (UTC → TT → JDE). You can run `npm run verify` and it cross-checks live against the NASA JPL Horizons API — currently ≤0.074° for all 9 planets. 21 major moons are fitted from Horizons state vectors with a dual-epoch velocity correction.

True 1:1 scale. Every distance and radius is in real kilometers. I use a floating-origin scene graph + logarithmic depth buffer to render seamlessly from 0.5 m (look at a pebble on Mars) to 100,000 AU (the Oort Cloud) in the same WebGL context.

Seamless landing. The Google Earth–style camera (lat/lon/dist anchor, drag inertia, exponential zoom) transitions continuously into surface walking. No cuts, no loading screens — the same gesture that brings you from orbit through the atmosphere keeps going until you're standing on the ground, and reverses to take off.

Physically-based atmospheres. Ray-marched Rayleigh+Mie scattering per planet: blue limb from space, red sunsets, butterscotch Martian sky. You can dive into Jupiter's cloud deck.

Mobile (v2.0.0). The hard part wasn't the touch gestures — it was keeping the floating-origin precision and seamless landing identical to desktop while staying smooth on a phone GPU. Auto-tiering detects the GPU and scales pixel ratio, bloom, atmosphere steps, and mesh density at runtime.

The whole thing is ~200 kB gzipped, pure Three.js + Vite, no backend, no account, MIT license.

GitHub: https://github.com/hyqzz/Solar-Wanderer

Happy to answer questions about the ephemeris math, the floating-origin trick, the atmosphere shaders, or how the mobile perf tiering works.
```

## First comment (post immediately after, as the author)

```
A couple of implementation notes that didn't fit above:

- Precision: planet positions are kept as Float64 and only downcast to Float32 after subtracting the camera position each frame. That's what makes 0.5 m detail and a 100,000 AU render range coexist without z-fighting (combined with a log depth buffer).
- The heliopause (~120 AU, where Voyager 1 crossed into interstellar space) is a real waypoint you can fly to — Voyager 1 & 2 are placed at their current positions.
- Mobile auto-tiering uses WEBGL_debug_renderer_info to pick a quality tier, with a runtime FPS guard that downshifts if frames drop. `?quality=lite` forces the low tier.

Code's all MIT. Feedback on the camera/controls especially welcome.
```
