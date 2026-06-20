import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'campaign/assets';
const BASE_URL = 'http://localhost:5173';
const FPS = 30;
const DUR = 12;
const TOTAL_FRAMES = FPS * DUR;

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
    if (g.camera?.userData?.defaultFov) {
      g.camera.fov = g.camera.userData.defaultFov;
      g.camera.updateProjectionMatrix();
      delete g.camera.userData.defaultFov;
    }
    if (g.builder?.orbitLines) g.builder.orbitLines.visible = true;
    if (g.builder?.orbitLines?.traverse) {
      g.builder.orbitLines.traverse(c => { if (c.material) c.material.visible = true; });
    }
  });
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

async function setMoonEarthrise(page, distMul, fovDeg = 22, extraDownDeg = 10) {
  await page.evaluate((args) => {
    const { distMul, fovDeg, extraDownDeg } = args;
    const g = window.__game;
    const cam = g.orbitCam;
    const env = g.orbitEnv;
    // Use a longer lens so Earth appears larger against the lunar foreground.
    if (g.camera) {
      if (!g.camera.userData.defaultFov) g.camera.userData.defaultFov = g.camera.fov;
      g.camera.fov = fovDeg;
      g.camera.updateProjectionMatrix();
    }
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
    // Tilt slightly downward so the illuminated lunar surface fills the lower frame.
    cam.tilt = tiltTotal - autoTilt - extraDownDeg * Math.PI / 180;
    cam.compute(env);
  }, { distMul, fovDeg, extraDownDeg });
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

async function captureSequence(page, name, options) {
  const { width = 1080, height = 1920, setup, motion, showOrbits = false } = options;
  await page.setViewport({ width, height });
  await hideHUD(page);
  if (showOrbits) {
    await page.evaluate(() => {
      const g = window.__game;
      if (g.setOrbitLinesVisible) g.setOrbitLinesVisible(true);
    });
  }
  await setup(page);
  await sleep(3000);

  // Read the focused body's radius and current camera angles for motion baselines.
  const base = await page.evaluate(() => {
    const g = window.__game;
    const cam = g.orbitCam;
    const body = g.registry.get(cam.focusId);
    return {
      focusId: cam.focusId,
      radiusKm: body ? body.phys.radiusKm : 1,
      lat: cam.lat,
      lon: cam.lon,
      heading: cam.heading,
      tilt: cam.tilt
    };
  });

  const seqDir = path.join(OUT_DIR, 'video-sequences', name);
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir, { recursive: true });

  const frameInterval = Math.max(25, Math.floor(1000 / FPS));
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    const params = motion(t, base.radiusKm, base.lat, base.lon, base.heading, base.tilt);
    await page.evaluate((args) => {
      const { focusId, lat, lon, dist, heading, tilt } = args;
      const g = window.__game;
      const cam = g.orbitCam;
      const env = g.orbitEnv;
      cam.focusId = focusId;
      cam.lat = lat;
      cam.lon = lon;
      cam.dist = dist;
      cam.distTarget = dist;
      cam.heading = heading;
      cam.tilt = tilt;
      cam.compute(env);
    }, { focusId: base.focusId, ...params });
    await sleep(frameInterval);
    await page.screenshot({ path: path.join(seqDir, `frame_${String(i).padStart(4, '0')}.png`) });
  }
  console.log(`Captured ${TOTAL_FRAMES} frames to ${seqDir}`);
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'video-sequences'), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#start-btn', { visible: true, timeout: 30000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game && window.__game.orbitCam, { timeout: 30000 });
  await sleep(3000);

  const scenes = [
    {
      name: 'earth-orbit-vert',
      setup: p => setSunlitOrbitView(p, 'earth', 4.5, 0.05, 0.05),
      motion: (t, r, baseLat, baseLon) => ({
        lat: baseLat + 0.1 * t,
        lon: baseLon + 0.2 * t,
        dist: r * (4.5 - 0.7 * t),
        heading: 0.02 * t,
        tilt: 0.01 * t
      })
    },
    {
      name: 'moon-earthrise-vert',
      setup: p => setMoonEarthrise(p, 1.04, 22, 8),
      motion: (t, r, baseLat, baseLon, baseHeading, baseTilt) => ({
        lat: baseLat,
        lon: baseLon,
        dist: r * (1.04 + 0.04 * t),
        heading: baseHeading,
        tilt: baseTilt + 0.08 * t
      })
    },
    {
      name: 'mars-sunset-vert',
      setup: p => setMarsSunset(p, 30, 1.6, 45),
      motion: (t, r, baseLat, baseLon) => {
        const deg = Math.PI / 180;
        return {
          lat: baseLat + 4 * deg * t,
          lon: baseLon,
          dist: r * (1.6 - 0.1 * t),
          heading: 0.03 * t,
          tilt: (45 - 3 * t) * deg
        };
      }
    },
    {
      name: 'saturn-rings-vert',
      setup: p => setSunlitOrbitView(p, 'saturn', 3.5, 0.35, 0.2),
      motion: (t, r, baseLat, baseLon) => ({
        lat: baseLat - 0.1 * t,
        lon: baseLon + 0.15 * t,
        dist: r * (3.5 - 0.5 * t),
        heading: 0.02 * t,
        tilt: -0.01 * t
      })
    },
    {
      name: 'jupiter-redspot-vert',
      setup: p => setSunlitOrbitView(p, 'jupiter', 2.2, -0.25, 0.4),
      motion: (t, r, baseLat, baseLon) => ({
        lat: baseLat + 0.05 * t,
        lon: baseLon + 0.3 * t,
        dist: r * (2.2 - 0.3 * t),
        heading: 0.02 * t,
        tilt: 0.01 * t
      })
    },
    {
      name: 'pluto-heart-vert',
      setup: p => setSunlitOrbitView(p, 'pluto', 2.0, 0.0, 0.0),
      motion: (t, r, baseLat, baseLon) => ({
        lat: baseLat + 0.05 * t,
        lon: baseLon + 0.15 * t,
        dist: r * (2.0 - 0.25 * t),
        heading: 0.02 * t,
        tilt: 0.01 * t
      })
    },
    {
      name: 'sun-closeup-vert',
      setup: p => setSunlitOrbitView(p, 'sun', 2.5, 0.0, 0.0),
      motion: (t, r, baseLat, baseLon) => ({
        lat: baseLat + 0.05 * t,
        lon: baseLon + 0.1 * t,
        dist: r * (2.5 - 0.3 * t),
        heading: 0.02 * t,
        tilt: 0.01 * t
      })
    },
    {
      name: 'earth-to-oort-vert',
      setup: async p => {
        await p.evaluate(() => {
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
        await sleep(4000);
      },
      showOrbits: true,
      motion: (t) => {
        const start = 2.5e8;
        const end = 1.5e11;
        return {
          lat: 0.35 + 0.08 * t,
          lon: 0.5 + 0.05 * t,
          dist: start * Math.pow(end / start, Math.pow(t, 0.45)),
          heading: 0,
          tilt: 0
        };
      }
    }
  ];

  const targetScene = process.argv[2];

  for (const scene of scenes) {
    if (targetScene && scene.name !== targetScene) continue;
    try {
      await captureSequence(page, scene.name, scene);
    } catch (e) {
      console.error(`Failed to capture ${scene.name}:`, e);
    }
  }

  await showHUD(page);
  await browser.close();
  console.log('All campaign video sequences captured.');
}

main().catch(e => { console.error(e); process.exit(1); });
