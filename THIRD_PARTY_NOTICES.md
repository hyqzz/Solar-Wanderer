# Third party notices

## Astronomia — lunar coefficient transcription

The scientific coefficient tables in `src/astro/moonTerms.js` were checked and
transcribed against https://github.com/commenthol/astronomia/blob/master/src/moonposition.js.

The MIT License (MIT)

Copyright (c) 2013 Sonia Keys
Copyright (c) 2016 Commenthol

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Planetary surface textures

Surface maps are redistributed unmodified or resampled from the sources below.
They are **not** covered by this project's MIT licence; each keeps its own terms.

### NASA Solar System Treks (WMTS)

Global mosaics for six Saturnian satellites, assembled from map tiles by
`tools/fetch-moon-textures.mjs`.

| Texture | Layer | Source data |
|---|---|---|
| `mimas.jpg` | `MI_170630_DLR_basemap` | Cassini ISS |
| `enceladus.jpg` | `Enceladus_Cassini_mosaic_global_110m` | Cassini ISS |
| `tethys.jpg` | `Tethys_Cassini_mosaic_global_293m` | Cassini ISS |
| `dione.jpg` | `Dione_Cassini_Voyageglobal_154m` | Cassini + Voyager |
| `rhea.jpg` | `RH_120803_DLR_basemap` | Cassini ISS |
| `iapetus.jpg` | `Iapetus_Cassini_Voyager_mosaic_global_783m` | Cassini + Voyager |

Service: <https://trek.nasa.gov/> · NASA / USGS / DLR · public domain.

### USGS Astrogeology / JPL global mosaics

| Texture | Original | Credit |
|---|---|---|
| `phobos.jpg` | Phobos Viking Mosaic (DLR-controlled) | NASA / JPL / USGS / DLR · public domain |
| `miranda.jpg` | Miranda global map | NASA / JPL / USGS · public domain |
| `ariel.jpg` | Ariel global map | NASA / JPL / USGS · public domain |
| `umbriel.jpg` | Umbriel global map | NASA / JPL / USGS · public domain |
| `titania.jpg` | Titania global map | NASA / JPL / USGS · public domain |
| `oberon.jpg` | Oberon global map | NASA / JPL / USGS · public domain |
| `deimos.jpg` | Deimos global map | NASA / USGS mosaic, derived by Askaniy · **CC BY-SA 3.0** |

`deimos.jpg` is the only texture under a share-alike licence. It is redistributed
under CC BY-SA 3.0; the rest of this repository remains MIT.

### Earlier textures

The remaining maps in `public/textures/` come from Solar System Scope
(CC BY 4.0, derived from NASA/USGS/SDO imagery) and Steve Albers' NASA Science
on a Sphere cylindrical maps. See `tools/fetch-textures.mjs`.
