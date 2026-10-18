import puppeteer from 'puppeteer';
const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 600 });
await p.goto(`${url}/?quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));
console.log(url, JSON.stringify(await p.evaluate(() => {
  const g = window.__game;
  const q = g.quality;
  return {
    quality: q ? { name: q.name, terrainGrid: q.terrainGrid, detail: q.detail, shadowSize: q.shadowSize,
      segHi: q.segHi, atmoN: q.atmoN, atmoNL: q.atmoNL, rockCount: q.rockCount, textureSize: q.textureSize } : null,
    dpr: g.renderer?.getPixelRatio?.() ?? null,
    gl: (() => { try { const gl = g.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch { return null; } })(),
    bodyClass: document.body.className,
  };
})));
await b.close();
