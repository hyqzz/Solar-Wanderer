// 降到地形激活高度以下，确认 DEM 真的在加载（缓存增长、请求发出、高程生效）。
// 此前在 5700 km 高度测到 cache=0，那不是 bug——地形激活阈值是 actDist(6371)=1147 km。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const reqs = [];
p.on('request', r => { if (/\/dem\//.test(r.url())) reqs.push(r.url()); });
p.on('response', r => { if (/\/dem\//.test(r.url())) reqs[reqs.length-1] += ' → ' + r.status(); });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

for (const body of ['earth', 'moon', 'mars']) {
  reqs.length = 0;
  await p.evaluate((id) => {
    const g = window.__game;
    g.select(id);
    // 降到 ~50 km 高度：远低于 actDist
    g.orbitCam.init(g.orbitEnv, id, 1.008);
    g.orbitCam.lat = 0.2; g.orbitCam.lon = 0.4;
    g.orbitCam.compute(g.orbitEnv);
  }, body);
  await new Promise(r => setTimeout(r, 22000));
  const st = await p.evaluate((id) => {
    const g = window.__game, tm = g.terrainMgr;
    const dem = tm.demSources?.get(id);
    const f = tm.fields?.get(id);
    // 取几个方向的真实高程，看是否走了 DEM 分支（DEM 命中时与噪声回退值不同）
    const dirs = [[1,0,0],[0.7,0.3,0.5],[0.2,-0.6,0.75]];
    const hs = dirs.map(d => {
      const L = Math.hypot(...d);
      return +f.height({ x: d[0]/L, y: d[1]/L, z: d[2]/L }).toFixed(3);
    });
    return {
      active: tm.active?.bodyId ?? null,
      cached: dem?.cache?.map?.size ?? -1,
      loading: dem?.loading?.size ?? -1,
      failures: dem ? [...dem._failures.entries()].slice(0,2) : null,
      offline: dem?._offline, revision: dem?.revision,
      sampleLevel: dem?.sampleLevel,
      heights: hs,
      heightFnIsDEM: dem ? (dem.getHeightSync({ x: 1, y: 0, z: 0 }) !== null) : null,
    };
  }, body);
  console.log(body.padEnd(7), JSON.stringify(st));
  console.log('   DEM 请求', reqs.length, reqs.slice(0,2).map(u => u.replace('http://127.0.0.1:4199','')).join('  '));
}
console.log('错误:', errs.length);
await b.close();
