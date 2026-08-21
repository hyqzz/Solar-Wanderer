// 真实小天体数据管线：从 JPL SBDB 拉取主带小行星/近地天体/周期彗星的真实轨道根数，
// 生成 public/data/smallbodies.json，供运行时按需后台加载渲染（替代纯统计点云）。
//
// 用法：node tools/fetch-small-bodies.mjs
//
// 选取策略（兼顾真实性与体积）：
//   MBA   主带：H ≤ 12.5（约 3.2k 颗，直径大致 >10–15 km 的亮天体）
//   NEO   近地：H ≤ 17（约 0.5k 颗，较大的近地天体）
//   COMET 彗星：e < 1 的全部周期彗星（约 1.8k 颗；含恩克、哈雷等）
// 数据字段：[spkid, a(AU), e, i(°), Ω(°), ω(°), M(°), epoch(JD TDB), H, 名称]
// 轨道为历元密切根数；小行星轨道长期稳定，开普勒传播足够目视精度。

import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = 'spkid,full_name,a,e,i,om,w,ma,epoch,H';

async function query(where, label) {
  const url = `${API}?fields=${FIELDS}&limit=20000&${where}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${label}: HTTP ${resp.status}`);
  const json = await resp.json();
  const rows = json.data ?? [];
  console.log(`${label}: ${rows.length} 颗`);
  return rows;
}

const enc = (s) => encodeURIComponent(JSON.stringify(s));

const mba = await query(`sb-kind=a&sb-class=MBA&sb-cdata=${enc({ AND: ['H|LE|12.5'] })}`, '主带 H≤12.5');
const neo = await query(`sb-group=neo&sb-cdata=${enc({ AND: ['H|LE|17'] })}`, '近地 H≤17');
const comets = await query(`sb-kind=c&sb-cdata=${enc({ AND: ['e|LT|1'] })}`, '周期彗星 e<1');

/** 行 → 紧凑数组；数值保留足够精度（a/e 6 位有效，角度 4 位小数） */
function pack(rows, kind) {
  const out = [];
  for (const r of rows) {
    const [spkid, name, a, e, i, om, w, ma, epoch, H] = r;
    const an = Number(a), en = Number(e);
    if (!Number.isFinite(an) || !Number.isFinite(en) || en >= 1 || an <= 0) continue;
    out.push([
      Number(spkid),
      Math.round(an * 1e6) / 1e6, Math.round(en * 1e6) / 1e6,
      Math.round(Number(i) * 1e4) / 1e4, Math.round(Number(om) * 1e4) / 1e4,
      Math.round(Number(w) * 1e4) / 1e4, Math.round(Number(ma) * 1e4) / 1e4,
      Math.round(Number(epoch) * 10) / 10,
      Number.isFinite(Number(H)) ? Math.round(Number(H) * 100) / 100 : null,
      name.trim(),
      kind,
    ]);
  }
  return out;
}

const data = {
  generated: new Date().toISOString(),
  source: 'NASA/JPL SBDB Query API',
  bodies: [...pack(mba, 0), ...pack(neo, 1), ...pack(comets, 2)], // kind: 0=MBA 1=NEO 2=彗星
};

mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
const file = new URL('../public/data/smallbodies.json', import.meta.url);
writeFileSync(file, JSON.stringify(data));
const kb = JSON.stringify(data).length / 1024;
console.log(`\n写入 public/data/smallbodies.json：${data.bodies.length} 颗，${kb.toFixed(0)}KB`);
