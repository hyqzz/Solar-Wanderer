import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const reqs = [];
p.on('request', (r) => { if (/\/dem\//.test(r.url())) reqs.push(r.url()); });
p.on('requestfailed', (r) => { if (/\/dem\//.test(r.url())) reqs.push('FAILED ' + r.url() + ' ' + r.failure()?.errorText); });
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));
await p.evaluate(() => { const g = window.__game; g.select('earth'); g.orbitCam.init(g.orbitEnv,'earth',1.9); g.orbitCam.lat=0.1; g.orbitCam.compute(g.orbitEnv); });
for (const t of [6000, 10000, 14000]) {
  await new Promise(r => setTimeout(r, t));
  const st = await p.evaluate(() => {
    const g = window.__game, tm = g.terrainMgr;
    const dem = tm.demSources?.get('earth');
    return {
      active: tm.active ? { bodyId: tm.active.bodyId, levels: tm.active.patches?.levels?.length } : null,
      fields: [...(tm.fields?.keys() ?? [])],
      demKeys: [...(tm.demSources?.keys() ?? [])],
      cacheSize: dem?.cache?.map?.size ?? -1, loading: dem?.loading?.size ?? -1,
      failures: dem ? [...dem._failures.entries()].slice(0,3) : null,
      offline: dem?._offline, sampleLevel: dem?.sampleLevel, revision: dem?.revision,
    };
  });
  console.log(JSON.stringify(st));
}
console.log('DEM 请求:', reqs.length);
for (const r of reqs.slice(0, 8)) console.log(' ', r.replace('http://127.0.0.1:4199', ''));
await b.close();
