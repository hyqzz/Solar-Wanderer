import puppeteer from 'puppeteer';

// 回归验证：移动版从地表自动着陆 → 起飞后，相机被抬升到星球半径 2.5 倍以上，
// GE 式单指拖拽灵敏度恢复到可用水平（>5°/150px）。
// 旧实现只抬升 ~半径的 0.2%，导致地表附近 drag/pinch 几乎无响应。

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3 },
    args: ['--touch-events=enabled', '--window-size=390,844'],
  });
  const page = await browser.newPage();
  const iPhone = puppeteer.KnownDevices?.['iPhone 14'] ?? {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false },
  };
  await page.emulate(iPhone);
  // 从地球表面启动，800ms 后自动进入行走模式
  await page.goto('http://localhost:5173/#earth,0,0,6371.002');

  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => document.getElementById('start-btn')?.click());
  await sleep(2500);

  const getState = async () => page.evaluate(() => {
    const g = window.__game;
    const f = g.builder.bodies.get(g.orbitCam.focusId);
    return {
      appMode: g.getMode(),
      focusId: g.orbitCam.focusId,
      dist: g.orbitCam.dist,
      distTarget: g.orbitCam.distTarget,
      altKm: g.orbitCam.dist - (f?.phys.radiusKm ?? 0),
      radiusKm: f?.phys.radiusKm ?? 0,
    };
  });

  function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  }

  const walkState = await getState();
  console.log('Walk state:', walkState);
  assert(walkState.appMode === 'walk', 'should be in walk mode');
  assert(walkState.altKm < 0.01, 'should be near surface');

  // 点击起飞按钮
  const takeoffBtn = await page.$('#tc-takeoff');
  assert(takeoffBtn, 'takeoff button should exist in walk mode');
  await page.evaluate(() => document.getElementById('tc-takeoff')?.click());
  await sleep(1500);
  const afterTakeoff = await getState();
  console.log('After takeoff:', afterTakeoff);
  assert(afterTakeoff.appMode === 'orbit', 'should return to orbit after takeoff');
  assert(afterTakeoff.dist > afterTakeoff.radiusKm * 2.4,
    `takeoff should lift to >2.4x radius, got dist=${afterTakeoff.dist.toFixed(1)}km`);

  // 灵敏度回归：150px 水平拖动应产生明显经度变化（>5°）
  const sens = await page.evaluate(() => {
    const g = window.__game;
    const oc = g.orbitCam;
    const env = {
      get: (id) => {
        const b = g.builder.bodies.get(id);
        if (!b) return null;
        return {
          posKm: b.posKm,
          radiusKm: b.phys.radiusKm,
          quat: b.mesh.quaternion,
          minDistKm: b.phys.minDistKm,
          viewDist: b.phys.viewDist,
          groundRadius: b.groundRadius,
        };
      },
      centerHit: () => null,
      centerDepth: () => null,
    };
    const lonBefore = oc.lon;
    g.input.drag.active = true;
    g.input.drag.dx = 150;
    g.input.drag.dy = 0;
    oc.update(0.016, g.input, env);
    g.input.drag.dx = 0;
    g.input.drag.dy = 0;
    return Math.abs(oc.lon - lonBefore) * 180 / Math.PI;
  });
  console.log(`Drag sensitivity: ${sens.toFixed(2)}° per 150px drag`);
  assert(sens > 5, `drag sensitivity too low: ${sens.toFixed(2)}°`);

  console.log('All mobile takeoff assertions passed.');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
