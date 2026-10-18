// 诊断：月面 (-45°,88°E) 附近那些黑色斑块是真地貌还是地形数据缺口？
// 做法：在相机周围按固定角步采样 heightAt，看有没有突降/不连续。
import puppeteer from 'puppeteer';
const url = process.argv[2];
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 720, height: 450 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 14000));
const out = await p.evaluate(() => {
  const g = window.__game, oc = g.orbitCam;
  oc.focusId = 'moon'; oc.pendingFocusId = null; oc.flight = null;
  oc.lat = -45 * Math.PI / 180; oc.lon = 88 * Math.PI / 180;
  oc.heading = 0; oc.tilt = 0; oc.dist = oc.distTarget = 1737.4 + 3;
  const V = g.camera.position.constructor;
  const dirOf = (lat, lon) => new V(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
  const base = dirOf(oc.lat, oc.lon);
  // 以相机为中心，向北（+lat）与向东（+lon）各扫一条线，步长 0.02° ≈ 0.6km
  const line = (dLat, dLon, n) => {
    const a = [];
    for (let i = -n; i <= n; i++) {
      const lat = oc.lat + i * dLat * Math.PI / 180, lon = oc.lon + i * dLon * Math.PI / 180;
      a.push(+g.terrainMgr.heightAt('moon', dirOf(lat, lon)).toFixed(3));
    }
    return a;
  };
  // 也采一片二维网格，找"陡崖"
  const grid = [];
  for (let j = -12; j <= 12; j += 4) {
    const row = [];
    for (let i = -12; i <= 12; i += 4) {
      const lat = oc.lat + j * 0.02 * Math.PI / 180, lon = oc.lon + i * 0.02 * Math.PI / 180;
      row.push(+g.terrainMgr.heightAt('moon', dirOf(lat, lon)).toFixed(2));
    }
    grid.push(row);
  }
  return { hAtCam: +g.terrainMgr.heightAt('moon', base).toFixed(3),
    north: line(0.02, 0, 10), east: line(0, 0.02, 10), grid,
    demSources: Object.keys(g.terrainMgr.demSources ?? {}) };
});
console.log('相机处高程', out.hAtCam, 'DEM 源', JSON.stringify(out.demSources));
console.log('向北 0.6km 步长 (km):', JSON.stringify(out.north));
console.log('向东 0.6km 步长 (km):', JSON.stringify(out.east));
console.log('网格 (行=北向, 列=东向, 步长 0.6km):');
for (const r of out.grid) console.log('  ', JSON.stringify(r));
await b.close();
