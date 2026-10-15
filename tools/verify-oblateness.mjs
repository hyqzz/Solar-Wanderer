// 扁率核验：确认渲染出来的椭球半轴与 NASA 实测值吻合，且大气壳没从极区"脱开"。
//
// 为什么要单独验：radiusKm 与 oblateness 口径不一致时，画面照出、看不出错——
// 四颗巨行星此前填的是体积平均半径，土星被画小了 2036 km 而无人察觉。
// 这里直接读运行时的网格缩放与大气 uniform，与实测值对表。
import puppeteer from 'puppeteer';

// NASA 行星实况表（1 bar 层赤道半径 a、极半径 b）
const REF = {
  jupiter: { a: 71492, b: 66854 },
  saturn: { a: 60268, b: 54364 },
  uranus: { a: 25559, b: 24973 },
  neptune: { a: 24764, b: 24341 },
};

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));

const got = await p.evaluate((ids) => {
  const out = {};
  for (const id of ids) {
    const e = window.__game.builder.bodies.get(id);
    if (!e) { out[id] = null; continue; }
    const g = e.mesh.geometry.parameters;
    const R = g.radius;
    const sx = e.mesh.scale.x, sy = e.mesh.scale.y, sz = e.mesh.scale.z;
    // 大气壳：uRg 是着色器眼里的"地表球半径"（拉伸空间里等于赤道半径），
    // uStretch 把椭球还原为球。两者必须与网格同一椭球，否则极区会出现双边界。
    const au = e.atmoMesh?.material?.userData?.uniforms;
    out[id] = {
      R, sx, sy, sz,
      a: R * sx, b: R * sy,
      uRg: au?.uRg?.value ?? null, uStretch: au?.uStretch?.value ?? null,
      uRa: au?.uRa?.value ?? null, atmoHeight: e.phys.atmosphere?.heightKm ?? null,
    };
  }
  return out;
}, Object.keys(REF));

let bad = 0;
console.log('天体      网格 a      实测 a    Δ      网格 b      实测 b    Δ       大气 uRg   拉伸    极区脱开');
for (const [id, ref] of Object.entries(REF)) {
  const r = got[id];
  if (!r) { console.log(`${id.padEnd(9)} 未找到`); bad++; continue; }
  const da = r.a - ref.a, db = r.b - ref.b;
  // 大气壳在拉伸空间里的地表球半径应等于赤道半径；拉伸因子应把 b 拉回 a
  const stretchOK = r.uStretch != null && Math.abs(r.uStretch - (1 / (1 - (1 - r.b / r.a)) - 1)) < 1e-6;
  // 极区脱开量：若 uRg 仍按赤道半径而网格极半径是 b，拉伸后应重合；
  // 重合与否的判据是 uRg 与 a 一致
  const gap = r.uRg == null ? NaN : Math.abs(r.uRg - r.a);
  const ok = Math.abs(da) < 2 && Math.abs(db) < 2 && gap < 2 && stretchOK;
  if (!ok) bad++;
  console.log(
    `${id.padEnd(9)}${r.a.toFixed(0).padStart(8)}${ref.a.toString().padStart(10)}` +
    `${da.toFixed(1).padStart(8)}${r.b.toFixed(0).padStart(11)}${ref.b.toString().padStart(10)}` +
    `${db.toFixed(1).padStart(8)}${String(r.uRg?.toFixed(0) ?? '—').padStart(11)}` +
    `${String(r.uStretch?.toFixed(5) ?? '—').padStart(9)}${gap.toFixed(1).padStart(11)}${ok ? '' : '   ✗'}`);
}
console.log('错误:', errs.length);
if (errs.length) bad++;
console.log(bad ? `\n${bad} 项不通过` : '\n四颗巨行星椭球与实测逐项吻合，大气壳与网格同一椭球');
await b.close();
process.exit(bad ? 1 : 0);
