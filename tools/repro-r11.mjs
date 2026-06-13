/**
 * R11 验证脚本：TNO 轨道、奥尔特云、引擎距离扩展、恒星视差
 * 无浏览器，Node 纯计算断言。
 * 运行：node tools/repro-r11.mjs
 */

import assert from 'assert/strict';
import { tnoPosition, TNO_IDS, TNO_DATA } from '../src/astro/tno.js';
import { centuriesTT } from '../src/astro/time.js';
import { LY_KM, KM_PER_AU, formatDist } from '../src/config.js';

let pass = 0, fail = 0;
function ok(label, cond, extra = '') {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label} ${extra}`); fail++; }
}

const jd2025 = 2460676.5; // 2025-01-01 TT

// ── 1. TNO 数量 ──────────────────────────────────────────────────────────────
console.log('\n【1】TNO 数量检查');
ok('TNO 表包含 28 颗天体', TNO_IDS.length === 28, `actual=${TNO_IDS.length}`);
const required = ['eris','sedna','makemake','haumea','quaoar','gonggong','orcus',
                  'varuna','ixion','goblin','vp113','farout','farfarout'];
for (const id of required) {
  ok(`TNO 表包含 ${id}`, id in TNO_DATA);
}

// ── 2. TNO 距离合理性 ─────────────────────────────────────────────────────────
console.log('\n【2】TNO 日心距离合理性（2025-01-01）');
const distChecks = [
  { id: 'eris',       min: 88,  max: 100, note: '~95.9 AU' },
  { id: 'sedna',      min: 80,  max: 92,  note: '~87 AU，近日点 2076' },
  { id: 'makemake',   min: 48,  max: 57,  note: '~52 AU' },
  { id: 'haumea',     min: 47,  max: 56,  note: '~51 AU' },
  { id: 'quaoar',     min: 40,  max: 48,  note: '~44 AU' },
  { id: 'gonggong',   min: 85,  max: 100, note: '~87-93 AU' },
  { id: 'goblin',     min: 55,  max: 80,  note: '~65 AU（近日点附近）' },
  { id: 'vp113',      min: 75,  max: 88,  note: '~80 AU（近日点附近）' },
  { id: 'farout',     min: 110, max: 135, note: '~124 AU（2018 发现距离）' },
  { id: 'farfarout',  min: 115, max: 145, note: '~132 AU（2018 发现距离）' },
];
for (const { id, min, max, note } of distChecks) {
  const p = tnoPosition(id, jd2025);
  const rAU = Math.hypot(p.x, p.y, p.z) / KM_PER_AU;
  ok(`${id} 距离 ${rAU.toFixed(1)} AU 在 [${min},${max}] AU  ${note}`,
     rAU >= min && rAU <= max, `actual=${rAU.toFixed(2)}`);
}

// ── 3. 全部 TNO 轨道有限 ─────────────────────────────────────────────────────
console.log('\n【3】全部 TNO 轨道不发散');
for (const id of TNO_IDS) {
  const p = tnoPosition(id, jd2025);
  const finite = isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
  const rAU = Math.hypot(p.x, p.y, p.z) / KM_PER_AU;
  ok(`${id.padEnd(14)} r=${rAU.toFixed(1)} AU 有限`, finite && rAU > 10 && rAU < 800);
}

// ── 4. 高离心率 TNO 轨道采样（近/远日点物理正确） ────────────────────────────
console.log('\n【4】Sedna 轨道端点距离物理正确');
import { tnoOrbitPoints } from '../src/astro/tno.js';
const sednaPts = tnoOrbitPoints('sedna', 360);
let minR = Infinity, maxR = 0;
for (let i = 0; i < 360; i++) {
  const r = Math.hypot(sednaPts[i*3], sednaPts[i*3+1], sednaPts[i*3+2]) / KM_PER_AU;
  if (r < minR) minR = r; if (r > maxR) maxR = r;
}
ok(`Sedna 近日点 ≈ 76 AU（实际 ${minR.toFixed(1)} AU）`, minR > 70 && minR < 85);
ok(`Sedna 远日点 ≈ 937 AU（实际 ${maxR.toFixed(1)} AU）`, maxR > 850 && maxR < 1050);

// ── 5. 引擎常量 / formatDist 光年单位 ────────────────────────────────────────
console.log('\n【5】引擎常量与 formatDist');
ok(`LY_KM ≈ 9.46e12 km`, LY_KM > 9.4e12 && LY_KM < 9.5e12, `actual=${LY_KM.toExponential(3)}`);

// 1 光年 = 63241 AU → 应显示光年
const lyStr = formatDist(1 * LY_KM);
ok(`formatDist(1 ly) 含"光年"`, lyStr.includes('光年'), `got="${lyStr}"`);

// 100 AU → 应显示 AU
const auStr = formatDist(100 * KM_PER_AU);
ok(`formatDist(100 AU) 含"AU"`, auStr.includes('AU'), `got="${auStr}"`);

// 1 km → 应显示 km
const kmStr = formatDist(1);
ok(`formatDist(1 km) 含"km"`, kmStr.includes('km'), `got="${kmStr}"`);

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`R11 验证：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
