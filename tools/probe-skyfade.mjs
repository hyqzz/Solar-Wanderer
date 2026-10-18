import puppeteer from 'puppeteer';
const url = process.env.PROBE_URL ?? 'http://127.0.0.1:4180';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 480, height: 300 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));
const out = await p.evaluate(async () => {
  const g = window.__game;
  const res = [];
  // 记录 setFade 的入参（sky 对象不暴露当前 fade 值）
  let lastFade = null;
  if (g.sky?.setFade) {
    const orig = g.sky.setFade.bind(g.sky);
    g.sky.setFade = (v) => { lastFade = v; return orig(v); };
  }
  const focus = async (id, dist) => {
    const oc = g.orbitCam;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = dist;
    await new Promise((r) => setTimeout(r, 7000));
    const sky = g.sky;
    return {
      id, distKm: Math.round(dist),
      skyFade: lastFade,
      skyFadeAlt: (() => { try { return g.__skyFade ?? null; } catch { return null; } })(),
      skyProps: g.sky ? Object.keys(g.sky).slice(0, 20) : null,
      objects: (() => { const out = []; sky?.group?.traverse?.((o) => {
        if (o.isPoints || o.isMesh) out.push({ t: o.isPoints ? 'pts' : 'mesh', n: o.name || o.type, vis: o.visible,
          op: +(o.material?.opacity ?? -1).toFixed(4), cnt: o.geometry?.attributes?.position?.count ?? 0 }); });
        return out; })(),
      groupVisible: sky?.group?.visible,
    };
  };
  for (const [id, R] of [['earth', 6371], ['mars', 3390], ['moon', 1737], ['io', 1821]]) {
    res.push(await focus(id, R * 3.2));
  }
  return { hasSky: !!g.sky, res, skyKeys: g.sky ? Object.keys(g.sky) : null };
});
console.log(url, JSON.stringify(out, null, 1));
await b.close();
