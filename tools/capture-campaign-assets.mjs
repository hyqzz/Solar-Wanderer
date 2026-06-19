import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'campaign/assets';
const BASE_URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function hideHUD(page) {
  await page.evaluate(() => {
    ['hud', 'directory', 'left-col'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const labels = document.getElementById('labels');
    if (labels) labels.style.display = 'none';
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

async function setOrbitView(page, focusId, distMul, lat, lon) {
  await page.evaluate((args) => {
    const { focusId, distMul, lat, lon } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const r = g.registry.get(focusId).phys.radiusKm;
    cam.focusId = focusId;
    cam.lat = lat;
    cam.lon = lon;
    cam.distTarget = r * distMul;
    cam.dist = cam.distTarget;
    cam.heading = 0;
    cam.tilt = 0;
    cam.flight = null;
    cam.transition = null;
    cam.pendingFocusId = null;
  }, { focusId, distMul, lat, lon });
  await sleep(5000);
}

async function setOrbitToward(page, focusId, targetId, distMul) {
  // Point camera from focus body toward target body (e.g. Moon toward Earth).
  await page.evaluate((args) => {
    const { focusId, targetId, distMul } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const body = g.registry.get(focusId);
    const target = g.registry.get(targetId);
    const r = body.phys.radiusKm;
    const dx = target.posKm[0] - body.posKm[0];
    const dy = target.posKm[1] - body.posKm[1];
    const dz = target.posKm[2] - body.posKm[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const wx = dx / len, wy = dy / len, wz = dz / len;
    // Rotate world direction by inverse of body-fixed → world quaternion.
    const q = body.quatRef;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qw * wx + qy * wz - qz * wy);
    const ty = 2 * (qw * wy + qz * wx - qx * wz);
    const tz = 2 * (qw * wz + qx * wy - qy * wx);
    const lx = wx + qw * tx + (qy * tz - qz * ty);
    const ly = wy + qw * ty + (qz * tx - qx * tz);
    const lz = wz + qw * tz + (qx * ty - qy * tx);
    cam.focusId = focusId;
    cam.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
    cam.lon = Math.atan2(-lz, lx);
    cam.distTarget = r * distMul;
    cam.dist = cam.distTarget;
    cam.heading = 0;
    cam.tilt = 0;
    cam.flight = null;
    cam.transition = null;
    cam.pendingFocusId = null;
  }, { focusId, targetId, distMul });
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

  // 1. Earth orbit wide
  await setOrbitView(page, 'earth', 6, 0.4, 0.2);
  await captureScene(page, 'earth-orbit');
  await captureScene(page, 'earth-orbit', { width: 1080, height: 1920 });

  // 2. Moon toward Earth (earthrise)
  await setOrbitToward(page, 'moon', 'earth', 1.5);
  await captureScene(page, 'moon-earthrise');
  await captureScene(page, 'moon-earthrise', { width: 1080, height: 1920, frames: 60, frameInterval: 100 });

  // 3. Mars toward Sun (sunset)
  await setOrbitToward(page, 'mars', 'sun', 1.4);
  await captureScene(page, 'mars-sunset');
  await captureScene(page, 'mars-sunset', { width: 1080, height: 1920, frames: 60, frameInterval: 100 });

  // 4. Saturn rings (orbit just above ring plane)
  await setOrbitView(page, 'saturn', 3.5, 1.55, 0.3);
  await captureScene(page, 'saturn-rings');
  await captureScene(page, 'saturn-rings', { width: 1080, height: 1920 });

  // 5. Jupiter red spot
  await setOrbitView(page, 'jupiter', 2.2, -0.35, -1.2);
  await captureScene(page, 'jupiter-redspot');
  await captureScene(page, 'jupiter-redspot', { width: 1080, height: 1920 });

  // 6. Pluto toward Sun
  await setOrbitToward(page, 'pluto', 'sun', 1.6);
  await captureScene(page, 'pluto-heart');
  await captureScene(page, 'pluto-heart', { width: 1080, height: 1920 });

  // 7. Sun closeup
  await setOrbitView(page, 'sun', 3, 0.2, 0.5);
  await captureScene(page, 'sun-closeup');
  await captureScene(page, 'sun-closeup', { width: 1080, height: 1920 });

  // 8. Zoom out sequence: earth to Oort cloud
  await setOrbitView(page, 'earth', 1.3, 0.2, 0.5);
  await sleep(2000);
  const seqDir = path.join(OUT_DIR, 'video-sequences', 'earth-to-oort');
  fs.mkdirSync(seqDir, { recursive: true });
  const frameCount = 150;
  for (let i = 0; i < frameCount; i++) {
    const t = i / (frameCount - 1);
    const start = 9000;
    const end = 2e11;
    const dist = start * Math.pow(end / start, t);
    await page.evaluate((d) => {
      window.__game.orbitCam.distTarget = d;
      window.__game.orbitCam.dist = d;
    }, dist);
    await sleep(60);
    await page.screenshot({ path: path.join(seqDir, `frame_${String(i).padStart(4, '0')}.png`) });
  }
  console.log(`Captured zoom sequence to ${seqDir}`);

  await showHUD(page);
  await browser.close();
  console.log('All campaign assets captured.');
}

main().catch(e => { console.error(e); process.exit(1); });
