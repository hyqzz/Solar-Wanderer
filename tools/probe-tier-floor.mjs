// 诊断：Medium 与 Low 在 SwiftShader 上都停在 ~71 ms，说明帧时间被某个与档位无关的
// 东西主导。逐个关掉候选，看地板是谁。
//
// 结论（第一次跑）：地板是后处理合成器（bloom + FXAA），约 55–70 ms，与档位无关；
// 去掉它之后 16.6 ms 正好是 60 Hz rAF 的上限——说明场景通道本身没跑满。
// 所以档位差异只能"贴近行星表面 + 关合成器"才量得到。
import puppeteer from 'puppeteer';

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const ms = (p) => p.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now(); let n = 0;
  const tick = () => {
    const now = performance.now(); t.push(now - last); last = now;
    if (++n < 90) requestAnimationFrame(tick);
    else { const s = t.slice(30).sort((a, c) => a - c); res(s[Math.floor(s.length * 0.5)]); }
  };
  requestAnimationFrame(tick);
}));

for (const tier of ['high', 'medium', 'low']) {
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 700 });
  await p.goto(`http://127.0.0.1:4199/?clean=1&quality=${tier}`,
    { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 9000));

  // 冻住守卫；贴近地球表面，让行星着色器铺满屏幕
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
  const withComposer = await ms(p);

  // 只留场景通道：把 composer.render 换成直出
  await p.evaluate(() => {
    const g = window.__game;
    const scene = g.registry?.scene;
    if (g.composer && scene) g.composer.render = () => g.renderer.render(scene, g.camera);
  });
  const sceneOnly = await ms(p);

  console.log(`${tier.padEnd(7)} 含合成器 ${withComposer.toFixed(1)}  仅场景 ${sceneOnly.toFixed(1)} ms`);
  await p.close();
}
await b.close();
