import puppeteer from 'puppeteer';

// 回归验证：移动版从地表自动着陆 → 起飞后无缝回到探索模式（视向连续微抬升），
// 且近地表单指拖拽灵敏度下限生效（≥0.05°/150px，GE 式抓地拖动 ≈11km 地面滑移）。
// 旧实现（a7f7093 前）起飞后贴地灵敏度 2e-6 rad/px，几乎无响应；
// 中间方案抬升到 2.5R 已由 42cea26 废弃（瞬移破坏视向连续性）。

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
  // 42cea26 起：起飞不再瞬移到 2.5R，而是无缝微抬升（视向连续，R7 #1），
  // 触控可用性改由移动端灵敏度下限（orbitCamera sensMin 1.2e-5）保证
  assert(afterTakeoff.dist > afterTakeoff.radiusKm + 0.04,
    `takeoff should lift off surface, got dist=${afterTakeoff.dist.toFixed(1)}km`);
  assert(afterTakeoff.dist < afterTakeoff.radiusKm * 1.5,
    `takeoff should stay near surface (seamless), got dist=${afterTakeoff.dist.toFixed(1)}km`);

  // 灵敏度回归：150px 水平拖动应产生可用的地面位移。GE 式"抓地拖动"下近地表
  // 角量小而地面位移大：移动端下限 1.2e-5 rad/px × 150px ≈ 0.10°，在贴地高度
  // 对应 ~11km 地面滑移（约半屏）——断言下限生效即可（旧 2.5R 抬升方案已废弃）
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
  assert(sens > 0.05, `drag sensitivity below mobile floor: ${sens.toFixed(3)}°`);

  console.log('All mobile takeoff assertions passed.');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
