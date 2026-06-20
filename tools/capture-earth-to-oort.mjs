import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'campaign/assets';
const BASE_URL = 'http://localhost:5173';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hideUI(page) {
  await page.evaluate(() => {
    ['hud', 'directory', 'left-col'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const labels = document.getElementById('labels');
    if (labels) labels.style.display = 'none';
  });
}

async function main() {
  const seqDir = path.join(OUT_DIR, 'video-sequences', 'earth-to-oort');
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  await page.click('#start-btn');
  await sleep(10000);
  await hideUI(page);
  await sleep(1000);

  // Landscape viewport for the zoom sequence.
  await page.setViewport({ width: 1920, height: 1080 });

  // Focus the Sun and look slightly above the ecliptic so the planetary disk stays visible.
  await page.evaluate(() => {
    const g = window.__game;
    const cam = g.orbitCam;
    const env = g.orbitEnv;
    cam.focusId = 'sun';
    cam.lat = 0.35;
    cam.lon = 0.5;
    cam.heading = 0;
    cam.tilt = 0;
    cam.flight = null;
    cam.transition = null;
    cam.pendingFocusId = null;
    cam.panOffset.set(0, 0, 0);
    cam.compute(env);
  });
  await sleep(3000);

  const frameCount = 150;
  const fps = 30;
  // Start just outside Earth's orbit, end at the edge of the Oort cloud (100,000 AU).
  const start = 2.5e8;   // ~1.7 AU
  const end = 1.5e13;    // 100,000 AU
  for (let i = 0; i < frameCount; i++) {
    const t = i / (frameCount - 1);
    // Slow-start curve: spend more frames showing the inner solar system.
    const dist = start * Math.pow(end / start, Math.pow(t, 0.45));
    await page.evaluate((d) => {
      window.__game.orbitCam.distTarget = d;
      window.__game.orbitCam.dist = d;
    }, dist);
    await sleep(60);
    await page.screenshot({ path: path.join(seqDir, `frame_${String(i).padStart(4, '0')}.png`) });
  }
  console.log(`Captured zoom sequence to ${seqDir}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
