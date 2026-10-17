import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/?clean=1&quality=low', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
const out = await p.evaluate(() => {
  const g = window.__game, res = [];
  for (const id of ['moon','enceladus','mars','europa']) {
    const e = g.builder.bodies.get(id) ?? [...g.registry.values()].find(t=>t.id===id);
    const u = e?.mat?.userData?.uniforms;
    res.push({ id, hapke: u?.uHapke?.value, norm: u?.uHapkeNorm ? +u.uHapkeNorm.value.toFixed(3) : null,
      w: u?.uW ? u.uW.value : null, grade: u?.uGrade ? u.uGrade.value.toArray().map(v=>+v.toFixed(3)) : null,
      albedoScale: u?.uAlbedoScale ? u.uAlbedoScale.value : null });
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
