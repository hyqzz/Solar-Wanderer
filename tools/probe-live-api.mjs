import puppeteer from 'puppeteer';
const url = process.env.PROBE_URL ?? 'https://sw.icodestar.net';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 480, height: 300 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));
console.log(url, JSON.stringify(await p.evaluate(() => {
  const g = window.__game ?? {};
  const keys = Object.keys(g);
  const has = (k) => (k in g);
  return {
    nKeys: keys.length,
    keys: keys.slice(0, 60),
    hasRenderer: has('renderer'), hasComposer: has('composer'), hasTerrain: has('terrainMgr'),
    hasOrbitCam: has('orbitCam'), hasBuilder: has('builder'), hasInput: has('input'),
    hasShip: has('ship'), hasSky: has('sky'), hasLabels: has('labels'),
    hasTnoScene: has('tnoScene'), hasComets: has('comets'), hasOort: has('oortCloud'),
    hasSmallBodies: has('smallBodies'), hasHeliosphere: has('heliosphere'),
    hasAudio: has('audioEngine'), hasCompass: has('compass'), hasScaleRef: has('scaleRef'),
    hasBookmarks: has('bookmarks'), hasTour: has('tourSystem'), hasNarrator: has('narrator'),
    hasTeacher: has('teacherToolkit'), hasEclipse: has('eclipseSystem'), hasWebxr: has('webxr'),
    hasEphem: has('ephemerisLoader'), hasApollo: has('apolloLandmarks'), hasRover: has('roverSites'),
    hasQuality: has('quality'), hasRegistry: has('registry'),
    bodies: g.builder?.bodies?.size ?? null,
    // 地形/相机内部量
    extents: g.terrainMgr?.active?.patches?.extents ?? null,
    fogDensity: null,
    mq: window.matchMedia('(pointer: fine)').matches,
  };
}), null, 1));
await b.close();
