// 三档画质的运行时冒烟：确认 Medium 不只是"配置表里多了一行"。
//
// 需要回答三个问题：
//   1. ?quality=medium 真的被采纳（而不是被 GPU 分类覆盖回 high/low）
//   2. Medium 的实际渲染工作量确实落在 High 与 Low 之间——否则这一档没有意义
//   3. 三档都不报错、都能出画面
//
// 测法上踩过两个坑，都记在这里免得下次重犯：
//   · 帧率守卫每秒都在 change() 里重写 pixelRatio 并抹平 uDetailMode，直接量墙钟时间
//     得到的是"守卫调平后"的三档——第一次跑因此得出"Medium 比 Low 还快"的荒谬结论。
//     现在把 setPixelRatio 打成空操作，并按本档应有的值固定 uDetailMode。
//   · 默认远景视角下，后处理合成器（bloom+FXAA）独占 ~70 ms 而场景通道不到 1 ms，
//     档位差异全被盖住。所以测量要贴近行星表面（行星着色器铺满屏幕）并绕过合成器。
// 本机是 SwiftShader 软件渲染，绝对帧率无参考价值；有意义的是三档之间的比值。
import puppeteer from 'puppeteer';

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** 暖 30 帧丢掉着色器编译毛刺，再取 60 帧的中位帧间隔 */
const ms = (p) => p.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now(); let n = 0;
  const tick = () => {
    const now = performance.now(); t.push(now - last); last = now;
    if (++n < 90) requestAnimationFrame(tick);
    else { const s = t.slice(30).sort((a, c) => a - c); res(s[Math.floor(s.length * 0.5)]); }
  };
  requestAnimationFrame(tick);
}));

const rows = [];
for (const tier of ['high', 'medium', 'low']) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 900, height: 700 });
  await p.goto(`http://127.0.0.1:4199/?clean=1&quality=${tier}`,
    { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 9000));

  const info = await p.evaluate(() => {
    const q = window.__game?.quality;
    return q ? { tier: q.tier, atmoN: q.atmoN, cloudN: q.cloudN, terrainGrid: q.terrainGrid,
      shadowSize: q.shadowSize, textureSize: q.textureSize, pixelRatio: q.pixelRatio,
      detail: q.detail } : null;
  });

  // 冻住守卫 + 贴近地球表面 + 绕过合成器
  await p.evaluate(() => {
    const g = window.__game;
    g.renderer.setPixelRatio = () => {};
    g.renderer.setPixelRatio(1);
    for (const [, e] of g.builder.bodies) {
      const u = e.mat?.userData?.uniforms?.uDetailMode;
      if (u) u.value = g.quality.detail
        ? ((e.phys.type === 'gas' || e.phys.type === 'ice') ? 2 : (e.phys.landable ? 1 : 0))
        : 0;
    }
    g.select('earth');
    g.orbitCam.init(g.orbitEnv, 'earth', 1.35);
    g.orbitCam.lat = 0.2;
    g.orbitCam.compute(g.orbitEnv);
  });
  await new Promise((r) => setTimeout(r, 12000));
  await p.evaluate(() => {
    const g = window.__game;
    const scene = g.registry?.scene;
    if (g.composer && scene) g.composer.render = () => g.renderer.render(scene, g.camera);
  });
  rows.push({ tier, info, ms: await ms(p), errs: errs.length });
  await p.close();
}
await b.close();

console.log('档位   采纳   云/大气步进  地形网格  阴影   像素比  细节   场景中位帧间隔  错误');
for (const r of rows) {
  const i = r.info ?? {};
  console.log(
    `${r.tier.padEnd(7)}${String(i.tier ?? '?').padEnd(7)}` +
    `${String(`${i.cloudN ?? '?'}/${i.atmoN ?? '?'}`).padEnd(13)}` +
    `${String(i.terrainGrid ?? '?').padEnd(10)}${String(i.shadowSize ?? '?').padEnd(7)}` +
    `${String(i.pixelRatio ?? '?').padEnd(8)}${String(i.detail ? '开' : '关').padEnd(7)}` +
    `${r.ms.toFixed(1).padStart(9)} ms${String(r.errs).padStart(6)}`);
}

let bad = 0;
for (const r of rows) {
  if (r.info?.tier !== r.tier) { console.log(`✗ ${r.tier} 未被采纳（实际 ${r.info?.tier}）`); bad++; }
  if (r.errs) { console.log(`✗ ${r.tier} 有 ${r.errs} 个运行时错误`); bad++; }
}
const t = Object.fromEntries(rows.map((r) => [r.tier, r.ms]));
// 判据用比值而非绝对毫秒：软件渲染的绝对值没有意义，档位之间的相对关系才有。
if (!(t.high / t.medium > 1.25)) {
  console.log(`✗ High 仅为 Medium 的 ${(t.high / t.medium).toFixed(2)}×——两者几乎等价，Medium 偏贵`);
  bad++;
}
if (!(t.medium / t.low > 1.25)) {
  console.log(`✗ Medium 仅为 Low 的 ${(t.medium / t.low).toFixed(2)}×——这一档与 Low 无异，等于白加`);
  bad++;
}
console.log(bad
  ? `\n${bad} 项不通过`
  : `\n三档全部通过：档位被采纳、工作量严格单调（High ${(t.high / t.medium).toFixed(2)}× Medium ${(t.medium / t.low).toFixed(2)}× Low）、无报错`);
process.exit(bad ? 1 : 0);
