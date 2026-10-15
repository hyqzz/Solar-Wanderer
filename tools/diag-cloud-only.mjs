// 云层点状弧的成因排查。
//
// 已知：关掉云层即消失；把云贴图换成纯白 1×1 也消失（但那是弱证据——纯白抹掉了
// 一切纹理变化，任何"贴图采样类"成因都会消失）。所以继续做定向对照：
//   A. 关 mipmap（minFilter 改 Linear）——若消失，是 LOD/走样问题
//   B. wrapS 改 Repeat——若消失，是反经线 clamp 接缝问题
//   C. 云壳段数翻倍——若消失，是几何接缝顶点列问题
// 注意云层网格是行星网格的子节点，隐藏 mesh 会连它一起隐藏。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-line/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const CASES = [
  ['40-base', () => {}],
  ['41-no-mipmap', () => {
    const m = window.__game.builder.bodies.get('earth').cloudMat.userData.uniforms.uMap.value;
    m.generateMipmaps = false; m.minFilter = 1006; m.needsUpdate = true;
  }],
  ['42-repeat-wrap', () => {
    const m = window.__game.builder.bodies.get('earth').cloudMat.userData.uniforms.uMap.value;
    m.wrapS = 1000; m.needsUpdate = true;
  }],
  ['43-aniso-off', () => {
    const m = window.__game.builder.bodies.get('earth').cloudMat.userData.uniforms.uMap.value;
    m.anisotropy = 1; m.needsUpdate = true;
  }],
];

for (const [name, apply] of CASES) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 900, height: 700 });
  await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 8000));
  await p.evaluate(() => {
    const g = window.__game;
    g.select('earth');
    g.orbitCam.init(g.orbitEnv, 'earth', 1.9);
    g.orbitCam.lat = 0.1;
    g.orbitCam.compute(g.orbitEnv);
  });
  await new Promise((r) => setTimeout(r, 10000));
  await p.evaluate(apply);
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${OUT}${name}.png` });
  console.log(`${name}  错误 ${errs.length}`);
  await p.close();
}
await b.close();
