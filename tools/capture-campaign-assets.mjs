import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'campaign/assets';
const BASE_URL = 'http://localhost:5173';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hideHUD(page) {
  await page.evaluate(() => {
    ['hud', 'directory', 'left-col'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const labels = document.getElementById('labels');
    if (labels) labels.style.display = 'none';
    const g = window.__game;
    if (g.setOrbitLinesVisible) g.setOrbitLinesVisible(false);
    if (g.builder?.orbitLines?.userData) {
      for (const line of Object.values(g.builder.orbitLines.userData)) {
        if (line) line.visible = false;
      }
    }
    g.camera?.scene?.traverse?.(obj => {
      if (obj.userData?.isOrbit) obj.visible = false;
      if (obj.userData?.isTrajectory) obj.visible = false;
    });
  });
}

async function showHUD(page) {
  await page.evaluate(() => {
    ['hud', 'directory', 'left-col'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    const labels = document.getElementById('labels');
    if (labels) labels.style.display = '';
    const g = window.__game;
    if (g.builder?.orbitLines) g.builder.orbitLines.visible = true;
    if (g.builder?.orbitLines?.traverse) {
      g.builder.orbitLines.traverse(c => { if (c.material) c.material.visible = true; });
    }
  });
}

async function captureScene(page, name, options = {}) {
  const { width = 1920, height = 1080, frames = 0, frameInterval = 100 } = options;
  await page.setViewport({ width, height });
  await sleep(800);
  const fileBase = path.join(OUT_DIR, 'screenshots', `${name}_${width}x${height}`);
  await page.screenshot({ path: `${fileBase}.png` });
  console.log(`Captured ${fileBase}.png`);

  if (frames > 0) {
    const seqDir = path.join(OUT_DIR, 'video-sequences', name);
    fs.mkdirSync(seqDir, { recursive: true });
    for (let i = 0; i < frames; i++) {
      await page.screenshot({ path: path.join(seqDir, `frame_${String(i).padStart(4, '0')}.png`) });
      await sleep(frameInterval);
    }
    console.log(`Captured ${frames} frames to ${seqDir}`);
  }
}

async function setSunlitOrbitView(page, focusId, distMul, latOffset = 0, lonOffset = 0) {
  await page.evaluate((args) => {
    const { focusId, distMul, latOffset, lonOffset } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const env = g.orbitEnv;
    const f = env.get(focusId);
    cam.focusId = focusId;
    cam.alignSunward(env);
    cam.lat += latOffset;
    cam.lon += lonOffset;
    cam.distTarget = f.radiusKm * distMul;
    cam.dist = cam.distTarget;
    cam.heading = 0;
    cam.tilt = 0;
    cam.flight = null;
    cam.transition = null;
    cam.pendingFocusId = null;
    cam.panOffset.set(0, 0, 0);
    cam.compute(env);
  }, { focusId, distMul, latOffset, lonOffset });
  await sleep(6000);
}

async function setMoonEarthrise(page, distMul) {
  await page.evaluate((args) => {
    const { distMul } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const env = g.orbitEnv;
    const body = g.registry.get('moon');
    const earth = g.registry.get('earth');
    const sun = g.registry.get('sun');
    const r = body.phys.radiusKm;

    function normalize(v) {
      const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) || 1;
      return [v[0]/len, v[1]/len, v[2]/len];
    }
    function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
    function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    function cross(a, b) {
      return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    }

    const sunDir = normalize(sub(sun.posKm, body.posKm));
    const earthDir = normalize(sub(earth.posKm, body.posKm));
    let R = normalize(sub(sunDir, earthDir.map(x => x * dot(sunDir, earthDir))));
    if (dot(R, sunDir) < 0) R = R.map(x => -x);

    const dist = r * distMul;
    const camPos = [body.posKm[0] + R[0]*dist, body.posKm[1] + R[1]*dist, body.posKm[2] + R[2]*dist];
    cam.adoptPosition(env, 'moon', camPos);

    const u = normalize(R);
    const view = earthDir;
    const cosT = Math.max(-1, Math.min(1, -dot(view, u)));
    const tiltTotal = Math.acos(cosT);
    let px = view[0] - u[0]*dot(view, u);
    let py = view[1] - u[1]*dot(view, u);
    let pz = view[2] - u[2]*dot(view, u);
    const pLen = Math.sqrt(px*px + py*py + pz*pz) || 1;
    px /= pLen; py /= pLen; pz /= pLen;

    const q = body.quatRef;
    let nx = 2*(q.x*q.y - q.w*q.z);
    let ny = 1 - 2*(q.x*q.x + q.z*q.z);
    let nz = 2*(q.y*q.z + q.w*q.x);
    const ndotu = nx*u[0] + ny*u[1] + nz*u[2];
    nx -= u[0]*ndotu; ny -= u[1]*ndotu; nz -= u[2]*ndotu;
    const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= nLen; ny /= nLen; nz /= nLen;

    const ex = cross(u, [nx, ny, nz]);
    const heading = Math.atan2(px*ex[0] + py*ex[1] + pz*ex[2], px*nx + py*ny + pz*nz);

    const ground = r;
    const alt = Math.max(dist - ground, 0);
    const autoTilt = Math.min(80 * Math.PI / 180, Math.atan2(alt * 0.8, dist));

    cam.heading = heading;
    cam.tilt = tiltTotal - autoTilt;
    cam.compute(env);
  }, { distMul });
  await sleep(6000);
}

async function setMarsSunset(page, latAddDeg, distMul, tiltDeg) {
  await page.evaluate((args) => {
    const { latAddDeg, distMul, tiltDeg } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const env = g.orbitEnv;
    const body = g.registry.get('mars');
    const r = body.phys.radiusKm;
    cam.focusId = 'mars';
    cam.alignSunward(env);
    cam.lat += latAddDeg * Math.PI / 180;
    cam.distTarget = cam.dist = r * distMul;
    cam.heading = 0;
    cam.tilt = tiltDeg * Math.PI / 180;
    cam.flight = null;
    cam.transition = null;
    cam.pendingFocusId = null;
    cam.panOffset.set(0, 0, 0);
    cam.compute(env);
  }, { latAddDeg, distMul, tiltDeg });
  await sleep(6000);
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'video-sequences'), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  await page.click('#start-btn');
  await sleep(10000);
  await hideHUD(page);
  await sleep(1000);

  // 1. Earth orbit wide (sunlit)
  await setSunlitOrbitView(page, 'earth', 6, 0.4, 0.2);
  await captureScene(page, 'earth-orbit');
  await captureScene(page, 'earth-orbit', { width: 1080, height: 1920 });

  // 2. Moon toward Earth (earthrise) on sunlit limb
  await setMoonEarthrise(page, 1.1);
  await captureScene(page, 'moon-earthrise');
  await captureScene(page, 'moon-earthrise', { width: 1080, height: 1920, frames: 60, frameInterval: 100 });

  // 3. Mars sunset — sun near horizon, surface sunlit
  await setMarsSunset(page, 45, 1.6, 45);
  await captureScene(page, 'mars-sunset');
  await captureScene(page, 'mars-sunset', { width: 1080, height: 1920, frames: 60, frameInterval: 100 });

  // 4. Saturn rings (sunlit, slightly above ring plane)
  await setSunlitOrbitView(page, 'saturn', 3.5, 0.35, 0.2);
  await captureScene(page, 'saturn-rings');
  await captureScene(page, 'saturn-rings', { width: 1080, height: 1920 });

  // 5. Jupiter red spot — sunlit side, Great Red Spot visible
  await setSunlitOrbitView(page, 'jupiter', 2.2, -0.25, 0.6);
  await captureScene(page, 'jupiter-redspot');
  await captureScene(page, 'jupiter-redspot', { width: 1080, height: 1920 });

  // 6. Pluto heart — sunlit side, heart centered and bright
  await setSunlitOrbitView(page, 'pluto', 2.0, 0.0, 0.0);
  await captureScene(page, 'pluto-heart');
  await captureScene(page, 'pluto-heart', { width: 1080, height: 1920 });

  // 7. Sun closeup
  await setSunlitOrbitView(page, 'sun', 3, 0.2, 0.5);
  await captureScene(page, 'sun-closeup');
  await captureScene(page, 'sun-closeup', { width: 1080, height: 1920 });

  // 8. Zoom out sequence is handled by tools/capture-earth-to-oort.mjs

  await showHUD(page);
  await browser.close();
  console.log('All campaign assets captured.');
}

main().catch(e => { console.error(e); process.exit(1); });
