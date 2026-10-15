// 渲染真实度回归：DEM 层级上限、太阳临边昏暗、大气臭氧层。
//
// 这三项都属于"静默出错"的类型——画面照样出来，只是物理不对，
// 所以既要锁定数值行为，也要检查着色器源码里确实有这些项。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEM_SOURCES, levelExceedsSource } from '../src/scene/demTiles.js';
import { BODIES } from '../src/astro/bodies.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── 批次 4：DEM 层级上限必须由源数据分辨率决定 ──────────────────────────────

test('DEM 上限层级与上游源分辨率一致（不是随手取的常数）', () => {
  for (const [id, cfg] of Object.entries(DEM_SOURCES)) {
    assert.ok(cfg.sourcePx > 0, `${id} 缺少 sourcePx`);
    // 本方案瓦片网格是 2^z×2^z 方块覆盖 360°×180°，所以第 z 层经度分辨率 = 360/(256·2^z)
    const lonDegPerPx = 360 / (cfg.tileSize * 2 ** cfg.maxLevel);
    const srcLonDegPerPx = 360 / cfg.sourcePx;
    assert.ok(lonDegPerPx >= srcLonDegPerPx * 0.74,
      `${id}: L${cfg.maxLevel} 的经度分辨率 ${lonDegPerPx.toFixed(5)}°/px 明显细于源 ${srcLonDegPerPx.toFixed(5)}°/px，等于在上采样`);
    assert.ok(!levelExceedsSource(cfg, cfg.maxLevel), `${id}: maxLevel 已经超出源分辨率`);
  }
});

test('levelExceedsSource 能识别越界层级', () => {
  const cfg = DEM_SOURCES.moon;
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel), false);
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel + 2), true);
  assert.equal(levelExceedsSource({ tileSize: 256 }, 9), false, '无 sourcePx 时不应误报');
});

test('火星已用到源允许的上限，地球/月球没有无谓上采样', () => {
  assert.equal(DEM_SOURCES.mars.maxLevel, 5, '火星源 11520px 支撑到 L5');
  assert.equal(DEM_SOURCES.moon.maxLevel, 4, '月球源 5760px 只到 L4');
  assert.equal(DEM_SOURCES.earth.maxLevel, 4);
});

test('地形按数据上限钳制 DEM 层级（不再去预取不存在的瓦片）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/_demLevelForDistance\(distKm, ceiling = 8\)/.test(src), '缺少 ceiling 形参');
  assert.ok(/Math\.min\(want, ceiling\)/.test(src), '缺少钳制');
  assert.ok(/_demLevelForDistance\(dist, dem\.config\?\.maxLevel/.test(src),
    '调用点未传入该天体的实际上限');
});

// ── 批次 6：太阳临边昏暗 ────────────────────────────────────────────────────

/** Neckel & Labs (1994) 五阶临边昏暗多项式的镜像实现 */
const limbPoly = (mu) => 0.30 + 0.93 * mu - 0.23 * mu ** 2 + 0.14 * mu ** 3
  - 0.16 * mu ** 4 + 0.02 * mu ** 5;

test('太阳临边昏暗为五阶多项式：中心归一、边缘趋暗且单调', () => {
  assert.ok(Math.abs(limbPoly(1) - 1) < 1e-9, '日面中心必须归一为 1');
  assert.ok(limbPoly(0) > 0.25 && limbPoly(0) < 0.35, `边缘 ${limbPoly(0).toFixed(3)} 应在 0.3 附近`);
  let prev = limbPoly(1.0);
  for (let mu = 0.95; mu >= 0; mu -= 0.05) {
    const v = limbPoly(mu);
    assert.ok(v < prev, `μ=${mu.toFixed(2)} 处不单调`);
    prev = v;
  }
});

test('临边红化：蓝通道衰减快于红通道（边缘有效温度低约 1000 K）', () => {
  const mu = 0.25;
  const ld = limbPoly(mu);
  const r = ld, g = ld ** 1.10, b = ld ** 1.30;
  assert.ok(g < r && b < g, '逐通道幂次应使蓝端更暗');
  assert.ok(b / r < 0.88, `边缘 B/R = ${(b / r).toFixed(3)}，红化不足`);
});

test('着色器源码确实使用五阶多项式与分光临边昏暗', () => {
  const src = read('src/scene/sun.js');
  assert.ok(src.includes('0.30 + 0.93 * mu - 0.23 * mu * mu'), '缺少 Neckel & Labs 多项式');
  assert.ok(/vec3\(ld, pow\(ld, 1\.10\), pow\(ld, 1\.30\)\)/.test(src), '缺少分光临边昏暗');
  assert.ok(!/0\.35 \+ 0\.65 \* mu/.test(src), '一阶线性近似应已被替换');
});

test('日冕在非日食时也有基准可见度（人眼可见，相机不可见）', () => {
  const src = read('src/scene/sun.js');
  const m = /uVisibility\.value = occulted \? 1 : ([0-9.e-]+);/.exec(src);
  assert.ok(m, '未找到日冕可见度设置');
  const base = Number(m[1]);
  assert.ok(base > 0 && base < 0.2, `基准可见度 ${base} 应在 (0, 0.2) 之间`);
});

// ── 批次 6：臭氧层 ──────────────────────────────────────────────────────────

test('大气着色器含臭氧吸收，且是 Chappuis 带的分光系数', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(src.includes('uniform float uOzone;'), '缺少 uOzone 声明');
  assert.ok(/exp\(-pow\(\(h - 25\.0\) \/ 8\.0, 2\.0\)\)/.test(src), '缺少 25 km 高斯臭氧层剖面');
  const m = /vec3 betaO = vec3\(([^)]+)\) \* uOzone;/.exec(src);
  assert.ok(m, '缺少臭氧消光系数');
  const [r, g, b] = m[1].split(',').map((x) => Number(x));
  assert.ok(r > g && g > b, `Chappuis 带应红端吸收最强，实际 ${r}/${g}/${b}`);
  assert.ok(b < r * 0.05, '蓝端几乎不吸收（这正是暮光蓝色带的成因）');
  assert.ok(/betaO \* \(odO \+ olO\)/.test(src), '臭氧未进入透射率积分');
});

test('臭氧只给确有臭氧层的天体开启', () => {
  assert.ok((BODIES.earth.atmosphere.ozone ?? 0) > 0.5, '地球应有完整臭氧层');
  assert.ok((BODIES.mars.atmosphere.ozone ?? 0) > 0 && BODIES.mars.atmosphere.ozone < 0.3,
    '火星臭氧层极薄');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune', 'titan']) {
    const o = BODIES[id]?.atmosphere?.ozone ?? 0;
    assert.ok(o === 0, `${id} 不应有臭氧层（实际 ${o}）`);
  }
});

// ── 批次 6：云层（体积步进 + 面剔除） ────────────────────────────────────────

test('云层体积步进：解析求壳区间 + 自阴影 + 银边', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/vec2 raySphere\(vec3 ro/.test(src), '缺少射线-球求交');
  assert.ok(/float t1 = min\(tRt\.y, \(tRb\.x > 0\.0 \? tRb\.x : tRt\.y\)\)/.test(src),
    '缺少壳体区间解析求解');
  assert.ok(/for \(int j = 1; j <= NL; j\+\+\)/.test(src), '缺少自阴影步进');
  assert.ok(/silver/.test(src), '缺少前向散射银边项');
  assert.ok(/smoothstep\(0\.0, 0\.18, hFrac\)/.test(src), '缺少云层垂直廓线（云顶才会锐）');
});

test('云壳面剔除：按相机在壳内/壳外保留正确的一面', () => {
  const src = read('src/scene/planetMaterial.js');
  // 只用 FrontSide 或只用 BackSide 都只能覆盖一半视角：球外要看正面（近半球在行星之前，
  // 深度测试能过），球内要看背面（正面朝后会被整体剔除——那正是"从地面看不到云"）。
  assert.ok(/if \(uCameraInside > 0\.5\) \{ if \(gl_FrontFacing\) discard; \}/.test(src),
    '缺少按相机内外切换保留面');
  assert.ok(/side: THREE\.DoubleSide/.test(src), '云材质应为 DoubleSide');
  assert.ok(!/side: THREE\.BackSide/.test(src), '不应退回单面渲染');
  assert.ok(/premultipliedAlpha: true/.test(src), '体积累加是预乘颜色，必须声明');
});

test('云层 UV 与 Three.js 球面 uv 一致（v 轴不得写反）', () => {
  const src = read('src/scene/planetMaterial.js');
  // SphereGeometry 的 uv.y = 1 在北极；写成 0.5 - asin(...)/π 会把云图上下翻转采样
  assert.ok(/0\.5 \+ asin\(clamp\(rel\.y \/ rl, -1\.0, 1\.0\)\) \/ 3\.14159265/.test(src),
    'latLonOf 的 v 轴方向不对');
  assert.ok(!/0\.5 - asin\(clamp\(rel\.y \/ rl/.test(src), 'v 轴仍为翻转写法');
});

test('体积云只在 High 档开启（代价实测 +27%，集显会被拖垮）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uVolumetric: \{ value: \(opts\.volumetric \?\? \(QUALITY\.tier === 'high' && QUALITY\.detail\)\)/.test(src),
    '档位门控缺失');
  assert.ok(/if \(uVolumetric == 0\)/.test(src), '缺少轻量回退路径');
  assert.ok(/cloudN: 10, cloudNL: 4/.test(read('src/engine/quality.js')), 'High 档云步进数不对');
});

// ── 批次 6：水面菲涅尔反射 ──────────────────────────────────────────────────

test('地形水面含菲涅尔环境反射（水的 F0 = 0.02）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/float fres = 0\.02 \+ 0\.98 \* pow\(1\.0 - cosT, 5\.0\)/.test(src),
    '缺少 Schlick 菲涅尔（水的 F0 应为 0.02）');
  assert.ok(/vec3 refl = reflect\(-V, normal\)/.test(src), '缺少反射方向');
  assert.ok(/outgoingLight \+= skyCol \* fres/.test(src), '反射未叠加到出射光');
  assert.ok(/uniform vec3 uSunDir;/.test(src), '缺少体固系太阳方向 uniform');
});

test('水面的太阳方向以体固系传入（否则日落反射会错位）', () => {
  const terrain = read('src/scene/terrain.js');
  const main = read('src/main.js');
  assert.ok(/update\(dirLocal, timeSec = 0, sunDirLocal = null\)/.test(terrain), 'update 未接收太阳方向');
  assert.ok(/if \(sunDirLocal\) this\.uSunDir\.value\.copy\(sunDirLocal\)/.test(terrain), '未写入 uniform');
  assert.ok(/_sunLocal\.copy\(e\.mat\.userData\.uniforms\.uSunDir\.value\)\.applyQuaternion\(_q\)/.test(main),
    'main.js 未把世界太阳方向转到体固系');
});

// ── 批次 6：大气地面反照率反弹 ──────────────────────────────────────────────

test('大气含地面反照率反弹项（低空天光提亮的主因）', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/uniform float uGroundAlbedo;/.test(src), '缺少 uGroundAlbedo 声明');
  assert.ok(/uGroundAlbedo: \{ value: a\.groundAlbedo \?\? 0\.0 \}/.test(src), 'uniform 未接线');
  assert.ok(/vec3 twoWay = exp\(-\(uBetaR \* odR \+ uBetaM \* 1\.1 \* odM\) \* 1\.5\)/.test(src),
    '缺少双程（下行+上行）光学深度近似');
  assert.ok(/\(0\.35 \+ 0\.65 \* below\)/.test(src), '缺少朝向地表以下的加权');
  assert.ok(/if \(uGroundAlbedo > 0\.0\)/.test(src), '缺少零值短路（气巨没有地面）');
});

test('地面反照率只给有固体表面或云顶的天体', () => {
  assert.ok(BODIES.earth.atmosphere.groundAlbedo > 0.05, '地球应有海陆反照率');
  assert.ok(BODIES.mars.atmosphere.groundAlbedo > BODIES.earth.atmosphere.groundAlbedo,
    '火星（沙尘覆盖）反照率应高于以海洋为主的地球');
  assert.ok(BODIES.venus.atmosphere.groundAlbedo > 0.5, '金星可见面是硫酸云顶，反照率很高');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    const g = BODIES[id]?.atmosphere?.groundAlbedo ?? 0;
    assert.equal(g, 0, `${id} 没有固体表面，不应有地面反弹（实际 ${g}）`);
  }
});

// ── 批次 10：音频层 ─────────────────────────────────────────────────────────

test('音频引擎含引擎、再入与着陆冲击三层', () => {
  const src = read('src/engine/audio.js');
  assert.ok(/this\._engine = this\._createNoiseLayer\(this\._pinkBuf, 'lowpass', 90, 0\)/.test(src),
    '缺少引擎/推进器层');
  assert.ok(/this\._reentry = this\._createNoiseLayer\(this\._whiteBuf, 'bandpass', 620, 0\)/.test(src),
    '缺少再入层');
  assert.ok(/playLandingImpact\(strength = 0\.5\)/.test(src), '缺少着陆冲击音');
  // 再入强度 ∝ 密度 × 速度²（与动压 q = ½ρv² 同量级）
  assert.ok(/reentryTarget = dens \* vFrac \* vFrac \* 0\.22/.test(src),
    '再入强度未按动压量级（密度×速度²）建模');
});

test('音效状态在 HUD 上可见（默认静音但必须能发现怎么开）', () => {
  const hud = read('src/ui/hud.js');
  const i18n = read('src/ui/i18n.js');
  const main = read('src/main.js');
  assert.ok(/audioOn/.test(hud), 'HUD 未显示音效状态');
  assert.ok(/'hud\.audioOn'/.test(i18n) && /'hud\.audioOff'/.test(i18n), '缺少音效状态文案');
  assert.ok(/audioOn: audioEngine\?\.enabled/.test(main), '未把状态传给 HUD');
  assert.ok(/tip\.audioOn/.test(main), '切换音效时没有反馈提示');
});

// ── 批次 11：背景星场的统计真实性 ────────────────────────────────────────────

/** 与 starfield.js 中采样逻辑逐项对应的镜像实现 */
function sampleStarField(count, seed) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const ngp = { x: 0.5, y: 0.78, z: 0.38 };   // 任意单位向量即可，只验证分布形状
  const n = Math.hypot(ngp.x, ngp.y, ngp.z);
  ngp.x /= n; ngp.y /= n; ngp.z /= n;
  const B0 = 12 * Math.PI / 180;
  const out = [];
  for (let i = 0; i < count; i++) {
    let dx = 1, dy = 0, dz = 0;
    for (let k = 0; k < 24; k++) {
      const z = rnd() * 2 - 1, phi = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      const px = r * Math.cos(phi), pz = r * Math.sin(phi);
      const sinB = Math.abs(px * ngp.x + z * ngp.y + pz * ngp.z);
      const b = Math.asin(Math.min(1, sinB));
      if (rnd() < (0.35 + Math.exp(-b / B0)) / 1.35) { dx = px; dy = z; dz = pz; break; }
    }
    const u = rnd();
    const I = Math.min(1, Math.max(0.12, 0.12 * Math.pow(1 - u * 0.999, -2 / 3)));
    out.push({ x: dx, y: dy, z: dz, I });
  }
  return out;
}

test('背景星向银道面集中（银河之所以是一条带）', () => {
  const stars = sampleStarField(20000, 12345);
  const ngp = { x: 0.5, y: 0.78, z: 0.38 };
  const n = Math.hypot(ngp.x, ngp.y, ngp.z);
  ngp.x /= n; ngp.y /= n; ngp.z /= n;
  let near = 0, far = 0;
  for (const st of stars) {
    const sinB = Math.abs(st.x * ngp.x + st.y * ngp.y + st.z * ngp.z);
    if (sinB < Math.sin(12 * Math.PI / 180)) near++;          // |b| < 12°
    if (sinB > Math.sin(60 * Math.PI / 180)) far++;           // |b| > 60°
  }
  // 球面均匀时 |b|<12° 占 1−cos12° ≈ 2.2%，|b|>60° 占 cos60° = 50%
  const nearFrac = near / stars.length, farFrac = far / stars.length;
  assert.ok(nearFrac > 0.08, `银道面附近占比仅 ${(nearFrac * 100).toFixed(1)}%，集中不足`);
  assert.ok(farFrac < 0.32, `高银纬占比 ${(farFrac * 100).toFixed(1)}%，仍接近球面均匀`);
  assert.ok(nearFrac / farFrac > 0.5, '银道面与高银纬的密度比过低');
});

test('背景星流量服从幂律（少数很亮 + 大量很暗）', () => {
  const stars = sampleStarField(20000, 999);
  const bright = stars.filter((s) => s.I > 0.6).length / stars.length;
  const dim = stars.filter((s) => s.I < 0.2).length / stars.length;
  assert.ok(dim > 0.4, `暗星占比 ${(dim * 100).toFixed(1)}% 过低，层次不足`);
  assert.ok(bright > 0.02 && bright < 0.25,
    `亮星占比 ${(bright * 100).toFixed(1)}% 不在合理区间（真实天空亮星是少数）`);
  assert.ok(dim / Math.max(bright, 1e-6) > 4, '亮暗层次比不足');
});

test('星场源码确实按银极方向做密度集中、按幂律抽流量', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(/ngpWorld = raDecToWorld\(192\.8595 \* DEG, 27\.1284 \* DEG/.test(src),
    '缺少银极方向（NGP）');
  assert.ok(/0\.35 \+ Math\.exp\(-b \/ B0\)/.test(src), '缺少银道面密度函数');
  assert.ok(/Math\.pow\(1 - u \* 0\.999, -2 \/ 3\)/.test(src), '缺少幂律流量抽样');
});

// ── 批次 6：行星环系 ────────────────────────────────────────────────────────

test('四颗巨行星都有环，且内半径不小于母星半径', () => {
  const R = { jupiter: 71492, saturn: 60268, uranus: 25362, neptune: 24764 };
  for (const [id, rKm] of Object.entries(R)) {
    const r = BODIES[id].rings;
    assert.ok(r, `${id} 缺少环系`);
    assert.ok(r.innerKm > rKm, `${id} 环内半径 ${r.innerKm} 不应小于母星半径 ${rKm}`);
    assert.ok(r.outerKm > r.innerKm, `${id} 环外半径应大于内半径`);
  }
});

test('木星与海王星的暗环用极低弥漫基底（不能套用天王星的 0.03）', () => {
  assert.ok((BODIES.jupiter.rings.diffuse ?? 0.03) < 0.01,
    '木星环光学深度 ~10⁻⁶，弥漫基底必须极低，否则会假亮成第二条土星环');
  assert.ok((BODIES.neptune.rings.diffuse ?? 0.03) < 0.01, '海王星环同样极暗');
  assert.ok((BODIES.uranus.rings.diffuse ?? 0.03) >= 0.02, '天王星环相对亮，应保留默认基底');
});

test('木星环分层与真实结构一致（Halo / Main / 两条 Gossamer）', () => {
  const n = BODIES.jupiter.rings.narrow;
  assert.equal(n.length, 4, '木星环应为 4 层');
  // Main 层（1.72–1.81 R_J ≈ 126,000 km）是木星环里最亮的一层
  const main = n.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.ok(Math.abs(main[0] - 126000) < 3000, `最亮层应在 Main 环附近，实际 ${main[0]}`);
});

test('海王星环含五条命名环（Galle/Le Verrier/Lassell/Arago/Adams）', () => {
  const n = BODIES.neptune.rings.narrow;
  assert.equal(n.length, 5);
  const radii = n.map((x) => x[0]).sort((a, b) => a - b);
  assert.ok(Math.abs(radii[0] - 41900) < 200, 'Galle 环应在 41,900 km');
  assert.ok(Math.abs(radii[4] - 62930) < 200, 'Adams 环应在 62,930 km');
});

// ── 月球天平动 ──────────────────────────────────────────────────────────────

test('月球走 IAU 自转模型而非硬潮汐锁定（天平动的前提）', () => {
  const rot = read('src/astro/rotation.js');
  const builder = read('src/scene/builder.js');
  assert.ok(/moon:\s*\[269\.9949, 0\.0031, 66\.5392, 0\.0130, 38\.3213, 13\.17635815\]/.test(rot),
    '缺少月球 IAU 2015 自转常数');
  assert.ok(/if \(!e\.isMoon \|\| id === 'moon'\)/.test(builder),
    '月球仍走硬潮汐锁定——天平动不会出现，可见面会永远是 50%');
});

// ── 日食阴影 ────────────────────────────────────────────────────────────────

test('日食遮蔽在接收体着色器内逐片元计算（而非只插一个黑锥网格）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uniform int uEclOn;/.test(src) && /uniform vec3 uEclPos;/.test(src), '缺少日食 uniform');
  assert.ok(/float aOcc = asin\(clamp\(uEclR \/ dOcc/.test(src), '缺少遮挡体角半径');
  assert.ok(/float aSun = asin\(clamp\(SUN_RADIUS_KM \/ max\(uSunDistKm/.test(src), '缺少太阳角半径');
  // 重叠下界必须是 |aOcc−aSun|：写成 aSun−aOcc 时，遮挡体角半径远大于太阳
  // （木星遮木卫，9.6° vs 0.05°）正对时只给 50%，而物理上是全遮。
  assert.ok(/float lo = abs\(aOcc - aSun\)/.test(src),
    '重叠下界应为 |aOcc−aSun|（写成 aSun−aOcc 会让大角径遮挡体只给 50%）');
  assert.ok(/float cover = 1\.0 - smoothstep\(lo, hi, sep\)/.test(src),
    '缺少两圆盘重叠的遮蔽判据');
  assert.ok(/uSunI \* ringSh \* cloudShadow \* eclSh/.test(src), '遮蔽未进入最终着色');
  // 除零保护：片元与遮挡体重合时不能出 NaN
  assert.ok(/max\(length\(toOcc\), 1\.0\)/.test(src), '缺少与遮挡体重合时的除零保护');
});

test('日食遮挡体既在地球侧设置（日食）也在月球侧设置（月食），且每帧先清除', () => {
  const src = read('src/scene/eclipses.js');
  assert.ok(/pushOccluder\(earth, moon, camPosKm, distTo\(earth\)\)/.test(src), '缺少日食遮挡体');
  assert.ok(/pushOccluder\(moon, earth, camPosKm, distTo\(moon\)\)/.test(src), '缺少月食遮挡体');
  assert.ok(/pushOccluder\(bodies\.get\(id\), null, camPosKm, 1\)/.test(src),
    '缺少每帧清除——食结束后阴影会永久留在表面上');
});

// ── 批次 12：可访问性 ───────────────────────────────────────────────────────

test('缩放未被禁用（WCAG 1.4.4）', () => {
  for (const f of ['index.html', 'en/index.html']) {
    const html = read(f);
    const vp = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? '';
    assert.ok(vp, `${f} 缺少 viewport`);
    assert.ok(!/user-scalable\s*=\s*no/.test(vp), `${f} 仍禁用缩放`);
    assert.ok(!/maximum-scale\s*=\s*1\b/.test(vp), `${f} 仍把最大缩放锁在 1`);
  }
});

test('焦点样式与 aria-live 播报区存在', () => {
  const css = read('src/style.css');
  assert.ok(/:focus-visible\s*\{/.test(css), '缺少 :focus-visible——纯键盘用户看不到焦点在哪');
  assert.ok(/\.sr-only\s*\{/.test(css), '缺少屏幕阅读器专用文本类');
  for (const f of ['index.html', 'en/index.html']) {
    assert.ok(/aria-live="polite"/.test(read(f)), `${f} 的提示条缺少 aria-live`);
  }
});

test('prefers-reduced-motion 在 CSS 与 JS 两侧都生效', () => {
  const css = read('src/style.css');
  assert.ok(/animation-duration: 0\.001ms !important/.test(css),
    'CSS 只关了启动页动画——界面过渡仍会动');
  const cfg = read('src/config.js');
  assert.ok(/export function prefersReducedMotion/.test(cfg), '缺少共享查询');
  // JS 驱动的相机动画 CSS 管不到，必须在 JS 里判
  const cam = read('src/engine/orbitCamera.js');
  assert.ok(/if \(prefersReducedMotion\(\)\) dur = 0\.01;/.test(cam),
    '飞行动画未受 reduced-motion 影响');
  assert.ok(/const damp = prefersReducedMotion\(\) \? 0 : /.test(cam),
    '拖拽惯性未受 reduced-motion 影响');
  const feel = read('src/engine/cameraFeel.js');
  assert.ok(/if \(prefersReducedMotion\(\)\) \{/.test(feel), '相机语言未受 reduced-motion 影响');
});
