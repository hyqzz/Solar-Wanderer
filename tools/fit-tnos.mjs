// TNO 真实轨道数据：28 颗海外天体从 JPL SBDB 拉取当前历元密切轨道根数
// （含 epoch），固化到 src/astro/tnoOrbits.generated.js。
// 替代原 tno.js 中"J2000 冻结手录值 + 仅 dL 线性率"的近似（历元落后 26 年）。
// 用法：node tools/fit-tnos.mjs
//
// 说明：SBDB 根数为当前历元最佳拟合（DE441 基准），开普勒传播在当前历元
// 附近目视无差；长期共振进动未建模，建议每年重新运行本工具刷新历元。

import { writeFileSync } from 'node:fs';
import { TNO_IDS, TNO_DATA } from '../src/astro/tno.js';

const KM_PER_AU = 149597870.7;
const GM_SUN = 1.32712440018e11; // km³/s²
const RAD2DEG = 180 / Math.PI;

/** SBDB 名称 → 根数；先按官方名查，失败时用别名表 */
const ALIASES = {
  goblin: '2015 TG387',     // "The Goblin"
  farout: '2018 VG18',      // "Farout"
  farfarout: '2018 AG37',   // "FarFarOut"
};

async function elementsOf(id, nameEn) {
  const tries = [nameEn, ALIASES[id]].filter(Boolean);
  for (const s of tries) {
    try {
      const resp = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(s)}&full-prec=true`);
      if (!resp.ok) continue;
      const json = await resp.json();
      const els = json.orbit?.elements;
      if (!els) continue;
      const get = (k) => Number(els.find((x) => x.name === k)?.value);
      const a = get('a'), e = get('e'), i = get('i'), om = get('om'), w = get('w'), ma = get('ma');
      const epoch = Number(json.orbit.epoch);
      if (![a, e, i, om, w, ma, epoch].every(Number.isFinite)) continue;
      return { a, e, i, om, w, ma, epoch };
    } catch { /* 尝试下一个别名 */ }
  }
  throw new Error(`SBDB 无有效根数 (${nameEn})`);
}

const out = {};
let epochJd = null;
const failed = [];

for (const id of TNO_IDS) {
  const name = TNO_DATA[id].nameEn;
  try {
    const el = await elementsOf(id, name);
    const aKm = el.a * KM_PER_AU;
    const nDegPerDay = Math.sqrt(GM_SUN / (aKm * aKm * aKm)) * RAD2DEG * 86400;
    if (!epochJd) epochJd = el.epoch;
    out[id] = {
      aAU: el.a, e: el.e, iDeg: el.i,
      nodeDeg: el.om, periDeg: ((el.om + el.w) % 360), M0Deg: el.ma,
      nDegPerDay,
      nodeDotDegPerDay: 0, // SBDB 不提供长期率；年度刷新历元兜底
      periDotDegPerDay: 0,
    };
    console.log(`${id.padEnd(12)} a=${el.a.toFixed(2).padStart(8)} AU  e=${el.e.toFixed(3)}  i=${el.i.toFixed(1)}°  epoch=${el.epoch}`);
  } catch (err) {
    failed.push(id);
    console.log(`${id.padEnd(12)} 失败: ${err.message.slice(0, 50)}`);
  }
}

const banner = `// 本文件由 tools/fit-tnos.mjs 自动生成 — 请勿手改。
// 数据来源：JPL SBDB 密切轨道根数（日心黄道 J2000，DE441 基准），历元见 TNO_EPOCH_JD。
// 生成时刻：${new Date().toISOString()}
// 模型：密切根数 + 开普勒传播；长期共振进动未建模，建议每年重新运行刷新历元。
// 失败回退：缺 id 时 tno.js 退回内置近似表。
`;
writeFileSync(
  new URL('../src/astro/tnoOrbits.generated.js', import.meta.url),
  banner + `export const TNO_EPOCH_JD = ${epochJd};\n` +
  `export const TNO_ORBITS = ${JSON.stringify(out, null, 2)};\n`
);
console.log(`\n已写入 src/astro/tnoOrbits.generated.js：成功 ${Object.keys(out).length} 颗，失败 ${failed.length} 颗${failed.length ? '（' + failed.join(',') + '）' : ''}`);
