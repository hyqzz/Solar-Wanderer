// 导航过程的"动态对比"：从地球飞往木星，按相同时间点抓 6 帧，拼成一张接触表。
// 没有 ffmpeg，用帧序列代替视频——同样能看出"有没有推进过程"。
import puppeteer from 'puppeteer';
const [url, out] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 480, height: 300 });
await p.goto(`${url}/?quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 10000));
await p.evaluate(() => {
  const g = window.__game, oc = g.orbitCam;
  g.select('earth'); oc.focusId = 'earth'; oc.flight = null;
  oc.dist = oc.distTarget = 6371 * 4; oc.lat = 0; oc.lon = 0;
});
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => window.__game.flyTo('jupiter'));
const shots = [];
for (const t of [0, 700, 1400, 2100, 3000, 4200]) {
  const now = shots.length ? shots[shots.length - 1].t : 0;
  await new Promise((r) => setTimeout(r, Math.max(0, t - now)));
  const f = `${out}-${t}.png`;
  await p.screenshot({ path: f });
  shots.push({ t, f });
  console.log('帧', t, 'ms');
}
console.log(shots.map((s) => s.f).join('\n'));
await b.close();
