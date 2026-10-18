// 点击/双击前往的过渡过程：从地球飞往木星，采样相机状态。
import puppeteer from 'puppeteer';
const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
if (process.env.REDUCED === '1') {
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
}
await p.setViewport({ width: 640, height: 400 });
await p.goto(`${url}/?quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));
const res = await p.evaluate(async () => {
  const g = window.__game, oc = g.orbitCam;
  g.select('earth'); oc.focusId = 'earth'; oc.flight = null;
  oc.dist = oc.distTarget = 6371 * 4; oc.lat = 0; oc.lon = 0;
  await new Promise((r) => setTimeout(r, 1500));
  const S = [];
  const start = performance.now();
  const t0 = oc.posKm.slice();
  g.flyTo('jupiter');
  await new Promise((resolve) => {
    const id = setInterval(() => {
      S.push({ t: Math.round(performance.now() - start), focus: oc.focusId,
        pend: oc.pendingFocusId ?? null, flight: !!oc.flight,
        d: Math.round(oc.dist), p: Array.from(oc.posKm).map((v) => Math.round(v / 1e6)) });
      if (performance.now() - start > 7000) { clearInterval(id); resolve(); }
    }, 300);
  });
  return { hasFly: typeof oc.flyTo === 'function', start: Array.from(t0).map((v) => Math.round(v / 1e6)), S };
});
console.log('URL', url, ' flyTo:', res.hasFly, ' 起点(百万km):', res.start.join(','));
for (const s of res.S) console.log(`  t=${String(s.t).padStart(4)} focus=${String(s.focus).padEnd(8)} pend=${String(s.pend).padEnd(8)} flight=${s.flight} d=${String(s.d).padStart(10)} p=(${s.p})`);
await b.close();
