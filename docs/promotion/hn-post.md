# Hacker News — Show HN

**Title:**
Show HN: I built a 1:1 real-time solar system explorer that runs in your browser

**Body:**
https://sw.icodestar.net

Solar Wanderer lets you freely explore the entire solar system — from the Sun's surface to the heliopause at 120 AU — in real time, in a browser tab, with no install.

A few things I'm particularly happy with:

**Real ephemerides.** Planet positions come from JPL Standish elements computed against your system clock (UTC → TT → JDE). You can run `npm run verify` and it cross-checks live against the NASA JPL Horizons API — currently ≤0.074° for all 9 planets. 21 major moons are fitted from Horizons state vectors with a dual-epoch velocity correction.

**True 1:1 scale.** Every distance and radius is in real kilometers. I use a floating-origin scene graph + logarithmic depth buffer to render seamlessly from 0.5 m (you can look at a pebble on Mars) to 120 AU (the heliopause fills your screen) in the same WebGL context.

**Seamless landing.** The Google Earth–style camera (lat/lon/dist anchor, drag inertia, exponential zoom) transitions continuously into a surface-walking mode. There are no cuts, no loading screens — the same scroll gesture that brings you from orbit to the atmosphere keeps going until you're standing on the ground. You can then scroll back out and take off the same way.

**Physically-based atmospheres.** Ray-marched Rayleigh+Mie scattering per planet: blue limb from space, red sunsets, butterscotch Martian sky. You can dive into Jupiter's cloud deck.

**The full heliosphere.** Asteroid belt, Kuiper belt, zodiacal light, 4 real comets with anti-sunward tails, termination shock, heliopause boundary, Voyager 1 & 2 at their current positions.

The whole thing is ~170 kB gzipped, pure Three.js + Vite, no backend, no account, MIT license.

GitHub: https://github.com/hyqzz/Solar-Wanderer

Happy to answer questions about the ephemeris math, the floating-origin trick, the atmosphere shaders, or anything else.
