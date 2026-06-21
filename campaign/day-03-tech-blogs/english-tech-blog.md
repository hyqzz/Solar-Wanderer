# English Technical Blog: How We Fit a 1:1 Solar System into a 200 KB Web Page

## Title Options

1. How We Rendered a 1:1 Real-Time Solar System in 200 KB of JavaScript
2. Building a NASA-Verified Solar System in the Browser: The Architecture Behind Solar Wanderer
3. From 0.5 Meters to 100,000 AU: Rendering the Real Solar System in WebGL

**Recommended**: #1

---

## Article

# How We Rendered a 1:1 Real-Time Solar System in 200 KB of JavaScript

**Try it**: https://sw.icodestar.net  
**Source**: https://github.com/hyqzz/Solar-Wanderer

The solar system is annoyingly large.

The Earth is 12,742 km across. Jupiter is 139,820 km. Saturn’s rings span 280,000 km. And the Oort Cloud, where long-period comets live, starts around 2,000 AU and extends to 100,000 AU — about 1.6 light-years from the Sun.

Rendering all of that in a browser, at true 1:1 scale, while letting a user land on the Moon and look back at Earth, sounds impossible. Most games cheat: they compress distances, fake orbits, or teleport the player behind loading screens.

We didn’t want to cheat.

Solar Wanderer is a free, open-source web app that renders the real solar system in your browser. Every planet and moon is positioned using NASA JPL ephemerides. The view you see matches reality — right now. And the whole thing ships as a ~200 KB gzipped static page.

Here’s how we did it.

---

## The Three Hard Problems

Building this revealed three fundamental problems:

1. **Precision**: Planetary positions must match NASA JPL Horizons. Off by a degree and Saturn won’t be where it should be.
2. **Scale range**: We need sub-meter precision at the surface and the ability to render objects 10¹³ km away.
3. **Performance**: It has to run on a phone, in a browser, without a GPU farm.

Get any of these wrong and the whole thing falls apart. We had to solve them at the architecture level, not with patches.

---

## Problem 1: Planetary Motion

We use the JPL Standish orbital elements for the major planets. These are essentially the “reference tables” NASA publishes for where each planet is at any given time. We solve Kepler’s equation with Newton-Raphson plus a bisection fallback to get eccentric anomaly, then convert orbital elements to heliocentric ecliptic coordinates.

For the Moon, we use a truncated ELP (Éphémérides Lunaires et Planétaires) theory. It’s not the full ELP2000, but it’s accurate to about 0.12° against JPL Horizons — good enough for visual exploration.

For the 21 major moons, we fit circular orbits from NASA Horizons state vectors. Each moon gets an orbital plane normal, a semi-major axis, and a phase offset at epoch. The result: within 0.22° after 10 days of propagation.

You can verify all of this yourself by running:

```bash
npm run verify
```

This cross-checks our positions against the live JPL Horizons API.

---

## Problem 2: Floating-Point Precision at Planetary Distances

Here’s the nasty thing about GPUs: they use 32-bit floats. A 32-bit float has about 7 significant digits of precision. If you store planetary positions in kilometers, Jupiter at 778 million km is already pushing the limit. By the time you get to Neptune or the Oort Cloud, precision is gone — planets jitter, surfaces tear, the camera shakes.

Our solution is **floating-origin rendering**:

- All positions are stored in **64-bit floats** on the CPU.
- Every frame, we subtract the camera position from every object position.
- Only the relative vector — now small enough to fit safely in a 32-bit GPU float — is uploaded.

So the GPU never knows it’s looking at Jupiter at 778 million km. It only knows Jupiter is 100,000 km to the left of the camera. That’s easy to render precisely.

This is the same technique used in space engines like Kerbal Space Program and Elite Dangerous.

---

## Problem 3: Rendering from 0.5 Meters to 100,000 AU

Even with floating-origin rendering, the depth range is absurd. Standard z-buffer precision would make distant objects flicker or disappear.

We use a **logarithmic depth buffer**. Instead of storing depth linearly, we store `log(depth)`. This gives us usable precision across the entire range from a foot in front of the camera to the edge of the Oort Cloud.

In Three.js, enabling this is one line:

```js
new THREE.WebGLRenderer({ logarithmicDepthBuffer: true })
```

But making it work correctly with atmosphere shaders, rings, and terrain required careful handling of depth in our custom shaders.

---

## Problem 4: Seamless Landing

The hardest user experience problem was the transition from orbit to surface.

In most apps, you select a planet and get a loading screen, or the camera teleports. We wanted a continuous descent: orbit → atmosphere → surface → walking, with no cuts.

The camera is defined in body-fixed coordinates: latitude, longitude, and distance from the center. As you scroll to zoom in, the distance decreases smoothly. When you get close to the surface, the camera auto-tilts from a top-down view toward the horizon. At about 2 meters above the terrain, the view switches to walking mode.

The walking mode preserves the camera quaternion, so the user’s view direction is continuous. You don’t notice the mode switch.

Terrain is generated procedurally with multi-octave simplex noise, blended with the global albedo texture. It’s not real DEM yet — that’s our next major milestone.

---

## The 48-Hour Skeleton

The core architecture — ephemeris layer, floating-origin world, camera system, and rendering pipeline — was built in about 48 hours using Claude Fable 5 in June 2026. The model was banned shortly after, so the rest of the work was done with other models.

Why was Fable 5 able to do this so fast? Because it could hold the entire system in context at once. Real-scale solar system rendering is full of subtle traps. If you solve precision first and camera second, you’re fine. If you do it the other way around, you rewrite everything. Fable 5 got the order right on the first try.

---

## Performance

The gzipped JavaScript bundle is about 200 KB. There is no backend. The app runs entirely in the browser.

On desktop, it easily hits 60 fps. On mobile, we use GPU auto-tiering: we detect the renderer string and reduce atmosphere samples, terrain detail, and pixel ratio on low-end devices. If frame rate drops below 28 fps for several seconds, we automatically downgrade quality once.

---

## What’s Next

We’re working on:

- Real DEM terrain streaming (LOLA for the Moon, MOLA/HiRISE for Mars).
- Solar/lunar/planetary eclipse shadows.
- WebXR/VR support.
- Guided educational tours.
- More languages.

If you’re interested, check out the [issues](https://github.com/hyqzz/Solar-Wanderer/issues) — we’d love contributors.

---

## Try It

https://sw.icodestar.net

Land on the Moon. Turn around. Look at Earth.

That tiny blue dot is home.

---

## About the Author

[Your name / bio / Twitter link]

---

## 发布建议

- 发布到个人博客、Medium、Dev.to、Hashnode。
- 在 Hacker News 上分享为 "How We Rendered a 1:1 Solar System in 200 KB of JS"。
- 在 Twitter 上发 10 条 thread（见 `twitter-tech-thread.md`）。
- 在 Reddit r/webdev, r/threejs, r/programming 分享。

---

## Sources / 素材引用

- **Saturn rings** (280,000 km wide, ~10 m thick): NASA Science https://science.nasa.gov/saturn/facts/
- **Jupiter Great Red Spot** (1.3× Earth, 350+ years): NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **Oort Cloud** (~100,000 AU): NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **Project accuracy**: `docs/sdlc/test-report.md`

