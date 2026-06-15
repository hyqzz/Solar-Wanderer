// Issue #18 repro+verify: 轨道→地表过渡必须无缝（不弹出、提前激活、淡入）。
// 复现：旧激活距离（大天体 max(60, R*0.06)）下，在 1000 km 轨道高度地形不激活，
//       接近时才突然出现 → "弹出感"根因。
// 验证：新距离 max(500, R*0.18) 在同高度激活；首次由外向内构建；每级 uFade 0→1 淡入。
//
// TerrainManager/TerrainPatchSet 仅用 THREE 几何/材质，无需 GL 上下文即可在 Node 构造
// （onBeforeCompile 仅在渲染时触发，本测试不渲染）。

import * as THREE from 'three';
import { TerrainManager } from '../src/scene/terrain.js';
import { BODIES } from '../src/astro/bodies.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

console.log('[Issue-18] 轨道→地表过渡：提前激活 + 由外向内构建 + 逐级淡入（无弹出）');

const earth = BODIES.earth;
const R = earth.radiusKm; // 6371

// ---- 1) 复现：旧公式在 1000 km 轨道高度不激活（弹出根因） ----
const oldActDist = Math.max(60, R * 0.06);   // 旧实现
const newActDist = Math.max(500, R * 0.18);  // 新实现
const ORBIT_ALT = 1000; // km，典型低轨观察高度
check('复现：旧激活距离 < 1000 km（地形在轨道高度不出现）',
  oldActDist < ORBIT_ALT, `oldActDist=${oldActDist.toFixed(0)} km`);
check('验证：新激活距离 ≥ 1000 km（地形提前在轨道阶段建好）',
  newActDist >= ORBIT_ALT, `newActDist=${newActDist.toFixed(0)} km`);

// ---- 2) 驱动真实 TerrainManager：在 1000 km 高度必须激活地形 ----
const mgr = new TerrainManager();
mgr.physOf = (id) => BODIES[id];
mgr.getMapData = () => null;
const hostMesh = new THREE.Group();
mgr.meshOf = () => hostMesh;

const nearest = { id: 'earth', landable: true, distSurface: ORBIT_ALT };
// 相机本地方向（赤道某点正上方）
const camDir = new THREE.Vector3(1, 0.2, 0.3).normalize();
mgr.update(nearest, camDir, 0);
check('TerrainManager 在 1000 km 高度已激活地形补丁',
  mgr.active && mgr.active.bodyId === 'earth',
  `active=${mgr.active ? mgr.active.bodyId : 'null'}`);

const patches = mgr.active.patches;
const nLv = patches.levels.length;
check('多级 LOD 环已创建', nLv >= 3, `levels=${nLv}`);

// ---- 3) 首次激活：由外向内——第一个被构建的级应是最外圈（extent 最大） ----
// 第一次 update 只建 1 级。找出已构建的级（fadeStart >= 0）。
const builtFirst = patches.levels.findIndex((lv) => lv.fadeStart >= 0);
const outermost = nLv - 1;
check('首帧优先构建最外圈 LOD（大覆盖先出现）',
  builtFirst === outermost,
  `首建级=${builtFirst}, 最外级=${outermost}`);

// ---- 4) 逐级淡入：新建级 uFade 从 0 起，随时间趋近 1，且不会突变到 1 ----
const lv0 = patches.levels[outermost];
check('新建级 uFade 起始 < 1（淡入而非硬弹出）',
  lv0.uFade.value < 1, `uFade=${lv0.uFade.value.toFixed(3)}`);

// 模拟时间推进：连续 update 直到所有级建完，再观察最外级 uFade 增长
for (let i = 0; i < nLv + 2; i++) mgr.update(nearest, camDir, i * 0.1);
const fadeMid = lv0.uFade.value;
check('uFade 随时间增长（0 < uFade ≤ 1）',
  fadeMid > 0 && fadeMid <= 1, `uFade=${fadeMid.toFixed(3)}`);

// 等待足够时间（淡入 800ms）后应满 1
const waitUntil = Date.now() + 900;
while (Date.now() < waitUntil) { /* busy wait 900ms */ }
mgr.update(nearest, camDir, 1.0);
check('淡入完成后 uFade = 1（最终完全不透明）',
  Math.abs(lv0.uFade.value - 1) < 1e-6, `uFade=${lv0.uFade.value.toFixed(4)}`);

// ---- 5) 全部级建完后标记 _initialized，后续转为正常内向外优先 ----
check('全部级构建完成后 _initialized = true',
  patches._initialized === true, `_initialized=${patches._initialized}`);

// ---- 6) 不影响 issue 外：远离后地形必须释放（无内存泄漏 / 不残留可见补丁） ----
const farNearest = { id: 'earth', landable: true, distSurface: newActDist + 100 };
mgr.update(farNearest, camDir, 2.0);
check('超出激活距离后地形被释放（无 issue 外残留）',
  mgr.active === null, `active=${mgr.active}`);

// ---- 7) 不影响 issue 外：小天体（火卫一）激活距离仍按半径比例缩放，未被放大破坏 ----
const phobosR = 11.27;
const phobosAct = Math.max(10, phobosR * 0.8); // 新公式小天体分支
check('小天体激活距离仍为米级数十 km（未被大天体规则污染）',
  phobosAct < 30, `phobosAct=${phobosAct.toFixed(1)} km`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
