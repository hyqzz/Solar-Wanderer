# Solar Wanderer v1.2.0 Release Notes

## Highlights

- **1:1 real-time solar system** in the browser, from the Sun's surface to the Oort Cloud (~100,000 AU).
- **NASA JPL ephemerides** for planets, the Moon, and 21 fitted natural satellites.
- **28 real TNOs** plus a statistical Oort Cloud particle field.
- **Seamless exploration**: orbit → atmosphere → surface → walking → underwater, no loading screens.
- **Ray-marched atmospheres** with Rayleigh+Mie scattering.
- **21 real bright stars** with actual 3D positions and parallax.
- **GPU auto-tiering** with `?quality=high|lite` override.
- **Chinese/English i18n**.

## Links

- Live demo: https://sw.icodestar.net
- Full source: https://github.com/hyqzz/Solar-Wanderer
- Documentation: `docs/sdlc/`

## Verification

- `npm test`: 33/33 offline ephemeris and physics tests pass.
- `npm run verify`: live cross-check against NASA JPL Horizons.

## Assets

- Source code (zip)
- Source code (tar.gz)
