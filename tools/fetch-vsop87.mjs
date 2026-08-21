// 从 astronomia（commenthol/astronomia，官方 VSOP87D 转录）拉取完整 VSOP87D 序列，
// 按振幅阈值截断后生成 src/astro/vsop87Data.js。
// 用法：node tools/fetch-vsop87.mjs [振幅阈值rad，默认 5e-7]
//
// VSOP87D：日心球坐标 L/B/R，瞬时平黄道（dynamical ecliptic of date），
// 时间单位为儒略千年（millennia）。截断误差 ≪ 0.01°，远优于 0.1° 目标。

import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/commenthol/astronomia/master/data/';
const BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const THRESH = Number(process.argv[2] ?? 5e-7);

const out = {};
let kept = 0, dropped = 0;

for (const body of BODIES) {
  const url = `${BASE}vsop87D${body}.js`;
  const src = await (await fetch(url)).text();
  // 文件是 ESM（const m = {...}; export default m）——包一层函数安全求值
  const m = new Function(`${src.replace(/export\s+default\s+m;?\s*$/, '')}; return m;`)();
  const series = {};
  for (const key of ['L', 'B', 'R']) {
    const groups = m[key];
    series[key] = Object.keys(groups)
      .sort((a, b) => Number(a) - Number(b))
      .map((g) => groups[g].filter((t) => Math.abs(t[0]) >= THRESH));
    for (const g of Object.keys(groups)) {
      const before = groups[g].length;
      const after = series[key][Number(g)].length;
      kept += after; dropped += before - after;
    }
  }
  out[body] = series;
  const n = series.L.flat().length + series.B.flat().length + series.R.flat().length;
  console.log(`${body.padEnd(8)} 保留 ${n} 项`);
}

const banner = `// 本文件由 tools/fetch-vsop87.mjs 自动生成 — 请勿手改。
// 来源：commenthol/astronomia 的 VSOP87D 官方转录（瞬时平黄道球坐标，时间单位：儒略千年）。
// 截断：|A| < ${THRESH} 的项已剔除（生成于 ${new Date().toISOString()}）。
`;
const js = banner + 'export const VSOP87_DATA = ' + JSON.stringify(out) + ';\n';
writeFileSync(new URL('../src/astro/vsop87Data.js', import.meta.url), js);
console.log(`\n合计保留 ${kept} 项、剔除 ${dropped} 项，文件 ${(js.length / 1024).toFixed(0)}KB`);
