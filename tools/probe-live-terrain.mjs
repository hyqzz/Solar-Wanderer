import puppeteer from 'puppeteer';
const url = process.env.PROBE_URL ?? 'https://sw.icodestar.net';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 400, height: 260 });
await p.goto(`${url}/?quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));
console.log(JSON.stringify(await p.evaluate(() => {
  const g = window.__game, tm = g.terrainMgr;
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(tm));
  return {
    tmKeys: Object.keys(tm),
    tmProto: proto,
    ocProto: Object.getOwnPropertyNames(Object.getPrototypeOf(g.orbitCam)).slice(0, 40),
    ocKeys: Object.keys(g.orbitCam).slice(0, 40),
    shipKeys: Object.keys(g.ship),
  };
}), null, 1));
await b.close();
