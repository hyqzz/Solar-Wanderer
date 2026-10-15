// 诊断：地球近景出现一条硬边亮带，形状像矩形瓦片。查是不是 DEM 瓦片接缝
// （相邻瓦片的 uFade 不同 → 同一片地表亮度不一致）。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-seam/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
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
// 接缝是"DEM 未覆盖区回退程序化噪声"造成的硬边界。关键问题：它是加载瞬态
// （瓦片到齐就消失）还是持久存在？分别在 8/20/40 秒各拍一张。
for (const t of [8000, 12000, 20000]) {
  await new Promise((r) => setTimeout(r, t));
  const cov = await p.evaluate(() => {
    const g = window.__game;
    const tm = g.terrainMgr;
    const src = tm.demSources?.get('earth');
    return src ? { sampleLevel: src.sampleLevel, cached: src.cache?.size ?? src.cache?.map?.size ?? -1,
      loading: src.loading?.size ?? -1, failures: src._failures?.size ?? -1 } : null;
  });
  await p.screenshot({ path: `${OUT}00-t${t / 1000}s.png` });
  console.log(`t=${t / 1000}s  DEM 状态:`, JSON.stringify(cov));
}

const info = await p.evaluate(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  const out = { hasMgr: !!tm, keys: tm ? Object.keys(tm).slice(0, 30) : [] };
  // 地形瓦片对象
  const e = g.builder.bodies.get('earth');
  out.earthTerrain = e?.terrain ? {
    type: e.terrain.type, visible: e.terrain.visible,
    children: e.terrain.children?.length ?? 0,
    fade: e.terrain.material?.userData?.uniforms?.uFade?.value,
  } : null;
  // 场景里所有名字里带 terrain/dem 的对象
  let root = e?.mesh; while (root?.parent) root = root.parent;
  const found = [];
  root?.traverse?.((o) => {
    const n = (o.name || '') + (o.userData?.bodyId || '');
    if (/terrain|dem|tile/i.test(n) || o.userData?.isTerrain) {
      found.push({ name: o.name || '(无名)', type: o.type, visible: o.visible,
        fade: o.material?.userData?.uniforms?.uFade?.value,
        level: o.userData?.level, tile: o.userData?.tile });
    }
  });
  out.tiles = found.slice(0, 30);
  return out;
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));

// 关地形对比
await p.evaluate(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  if (e.terrain) e.terrain.visible = false;
  g.terrainMgr?.setEnabled?.(false);
});
await new Promise((r) => setTimeout(r, 2000));
await p.screenshot({ path: `${OUT}01-no-terrain.png` });
console.log('错误:', errs.length);
await b.close();
