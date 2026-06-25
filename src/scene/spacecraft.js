// 航天器 3D 模型与任务时间线（Issue #30: Voyager 1/2, Issue #31: New Horizons）。
// 程序化低多边形几何体，1:1 真实尺度（探测器数米级），金色铝箔质感。
// 远距离可见性由调用方添加 billboard（本文件提供 makeSpacecraftGlow 工厂）。
// 位置计算与 heliosphere.js 的 Voyager 模型同源：线性外推 + 黄道坐标。

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

const DEG = Math.PI / 180;
const m = (v) => v * 0.001; // 米→千米（项目世界单位为 km）

// ── 材质工厂（每次创建独立实例，避免 dispose 冲突）──
// 金色铝箔：Voyager/New Horizons 的多层隔热毯（aluminized Kapton）
function goldFoilMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xd4af37, metalness: 0.8, roughness: 0.4,
  });
}
// 深色结构：碳纤维/钛合金支架
function darkStructMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, metalness: 0.6, roughness: 0.5,
  });
}
// 天线面：浅色反射面
function dishMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xe8e0d0, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide,
  });
}

// ── 几何工具 ──
// 抛物面天线碟：LatheGeometry 旋转抛物线母线 y = depth × (r/radius)²
// 物理上高增益天线的反射面为旋转抛物面，聚焦无线电波至馈源。
function parabolicDish(radiusKm, depthKm, radialSeg = 32, profileSeg = 12) {
  const points = [];
  for (let i = 0; i <= profileSeg; i++) {
    const t = i / profileSeg;
    points.push(new THREE.Vector2(t * radiusKm, depthKm * t * t));
  }
  return new THREE.LatheGeometry(points, radialSeg);
}

// ── Voyager 模型（旅行者号：1977 年发射，至今仍在星际空间运行）──
// 标志性特征：3.7m 高增益天线碟、十面体仪器舱、RTG 臂、13m 磁强计长杆
function createVoyagerModel() {
  const group = new THREE.Group();
  const gold = goldFoilMat();
  const dark = darkStructMat();
  const dish = dishMat();

  // 高增益天线：3.7m 直径抛物面，朝 +Y（地球/太阳方向）
  // 这是 Voyager 最显著的视觉特征，太空中的"金色碟形"
  const dishRadius = m(1.85);
  const dishDepth = m(0.30);
  const dishMesh = new THREE.Mesh(parabolicDish(dishRadius, dishDepth, 32, 12), dish);
  group.add(dishMesh);

  // 天线馈源支撑（碟背面的三脚架简化为中心柱）
  const hubGeo = new THREE.CylinderGeometry(m(0.12), m(0.15), m(0.40), 8);
  const hub = new THREE.Mesh(hubGeo, dark);
  hub.position.y = -m(0.20);
  group.add(hub);

  // 十面体仪器舱（bus）：天线下方，容纳电子设备
  const busGeo = new THREE.CylinderGeometry(m(0.80), m(0.80), m(0.50), 10);
  const bus = new THREE.Mesh(busGeo, gold);
  bus.position.y = -m(0.60);
  group.add(bus);

  // RTG 臂：向 -X 方向延伸，携带 3 个放射性同位素热源（钚-238）
  // RTG 提供 ~470W 电力，是 Voyager 在外太阳系唯一能源
  const rtgBoomLen = m(3.0);
  const rtgBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.04), m(0.04), rtgBoomLen, 6), dark);
  rtgBoom.rotation.z = Math.PI / 2;
  rtgBoom.position.set(-rtgBoomLen / 2, -m(0.60), 0);
  group.add(rtgBoom);
  // 3 个 RTG 圆筒
  for (let i = 0; i < 3; i++) {
    const rtg = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.12), m(0.12), m(0.30), 8), gold);
    rtg.rotation.z = Math.PI / 2;
    rtg.position.set(-rtgBoomLen - m(0.15), -m(0.60), (i - 1) * m(0.25));
    group.add(rtg);
  }

  // 磁强计长杆：向 +X 方向延伸 13m（最长的部件，折叠展开）
  // 远离航天器主体以避免磁场干扰
  const magBoomLen = m(13.0);
  const magBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), magBoomLen, 4), dark);
  magBoom.rotation.z = Math.PI / 2;
  magBoom.position.set(magBoomLen / 2, -m(0.60), 0);
  group.add(magBoom);
  // 磁强计传感器（杆端小球）
  const magSensor = new THREE.Mesh(
    new THREE.IcosahedronGeometry(m(0.10), 0), dark);
  magSensor.position.set(magBoomLen, -m(0.60), 0);
  group.add(magSensor);

  // 仪器臂：向 -Z 方向延伸，携带科学仪器包（IRIS、紫外光谱仪等）
  const instBoomLen = m(2.5);
  const instBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.05), m(0.05), instBoomLen, 6), dark);
  instBoom.rotation.x = Math.PI / 2;
  instBoom.position.set(0, -m(0.60), -instBoomLen / 2);
  group.add(instBoom);
  // 仪器包
  const inst = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.30), m(0.20), m(0.20)), gold);
  inst.position.set(0, -m(0.60), -instBoomLen);
  group.add(inst);

  return group;
}

// ── New Horizons 模型（新视野号：2006 年发射，2015 年飞越冥王星）──
// 标志性特征：2.1m 天线碟、六边形仪器舱、RTG、推进器组
function createNewHorizonsModel() {
  const group = new THREE.Group();
  const gold = goldFoilMat();
  const dark = darkStructMat();
  const dish = dishMat();

  // 高增益天线：2.1m 直径抛物面（比 Voyager 小，但形状相似）
  const dishRadius = m(1.05);
  const dishDepth = m(0.20);
  const dishMesh = new THREE.Mesh(parabolicDish(dishRadius, dishDepth, 32, 10), dish);
  group.add(dishMesh);

  // 六边形仪器舱（New Horizons 的标志性形状）
  const busGeo = new THREE.CylinderGeometry(m(0.70), m(0.70), m(0.50), 6);
  const bus = new THREE.Mesh(busGeo, gold);
  bus.position.y = -m(0.35);
  group.add(bus);

  // RTG：向 -X 方向延伸（与 Voyager 类似，钚-238 热源）
  const rtgArmLen = m(1.5);
  const rtgArm = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.03), m(0.03), rtgArmLen, 4), dark);
  rtgArm.rotation.z = Math.PI / 2;
  rtgArm.position.set(-rtgArmLen / 2, -m(0.35), 0);
  group.add(rtgArm);
  // RTG 圆筒
  const rtg = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.20), m(0.20), m(0.60), 8), gold);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(-rtgArmLen - m(0.30), -m(0.35), 0);
  group.add(rtg);

  // 推进器组（4 个小锥体，用于姿态控制与轨道修正）
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const thruster = new THREE.Mesh(
      new THREE.ConeGeometry(m(0.05), m(0.15), 6), dark);
    thruster.position.set(
      Math.cos(angle) * m(0.70), -m(0.60), Math.sin(angle) * m(0.70));
    thruster.rotation.x = Math.PI; // 朝下
    group.add(thruster);
  }

  // 仪器平台（+X 方向的小平板，携带 LORRI 远程成像仪等）
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.40), m(0.01), m(0.30)), dark);
  platform.position.set(m(0.90), -m(0.35), 0);
  group.add(platform);

  return group;
}

// ── 主导出：按类型创建航天器 3D 模型 ──
// type: 'voyager1' | 'voyager2' | 'newhorizons'
// 返回 THREE.Group，1:1 真实尺度（km），+Y 为天线指向
export function createSpacecraftModel(type) {
  switch (type) {
    case 'voyager1':
    case 'voyager2':
      return createVoyagerModel();
    case 'newhorizons':
      return createNewHorizonsModel();
    default:
      throw new Error(`Unknown spacecraft type: ${type}`);
  }
}

// ── 远距离可见性：辉光精灵（类似行星 glint）──
// 1:1 尺度的探测器在 AU 距离上不可见，需要 billboard 保持屏幕可见性。
export function makeSpacecraftGlow(color = 0x88ccff) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

// ════════════════════════════════════════════════════════════════════
// 任务时间线数据（用于点击探测器后弹出的信息面板）
// ════════════════════════════════════════════════════════════════════
export const SPACECRAFT_TIMELINES = {
  voyager1: {
    nameZh: '旅行者1号', nameEn: 'Voyager 1',
    events: [
      { date: '1977-09-05', titleZh: '发射', titleEn: 'Launch',
        descZh: '从卡纳维拉尔角发射，原定探访木星和土星。' },
      { date: '1979-03-05', titleZh: '木星飞越', titleEn: 'Jupiter Flyby',
        descZh: '最近距离 349,000 km，首次近距离拍摄木星环与伊俄火山活动。' },
      { date: '1980-11-12', titleZh: '土星飞越', titleEn: 'Saturn Flyby',
        descZh: '最近距离 124,000 km，拍摄泰坦大气后偏离黄道面。' },
      { date: '1990-02-14', titleZh: '暗淡蓝点', titleEn: 'Pale Blue Dot',
        descZh: '回望太阳系内行星，地球仅占 0.12 像素——卡尔·萨根以此为题写下《暗淡蓝点》。' },
      { date: '2012-08-25', titleZh: '穿越日球层顶', titleEn: 'Heliopause Crossing',
        descZh: '成为首个进入星际空间的人造物体，距日约 121 AU。' },
      { date: '2026-01-01', titleZh: '现状', titleEn: 'Current',
        descZh: '距日约 166 AU，仍可微弱通信，预计 2025–2030 年关闭科学仪器。' },
    ],
  },
  voyager2: {
    nameZh: '旅行者2号', nameEn: 'Voyager 2',
    events: [
      { date: '1977-08-20', titleZh: '发射', titleEn: 'Launch',
        descZh: '比旅行者1号早两周发射，走外行星大巡游路线。' },
      { date: '1979-07-09', titleZh: '木星飞越', titleEn: 'Jupiter Flyby',
        descZh: '最近距离 570,000 km，发现木星环与伊俄火山活动。' },
      { date: '1981-08-25', titleZh: '土星飞越', titleEn: 'Saturn Flyby',
        descZh: '最近距离 161,000 km，研究土星环结构与卫星。' },
      { date: '1986-01-24', titleZh: '天王星飞越', titleEn: 'Uranus Flyby',
        descZh: '首次也是唯一一次天王星近距离探测，发现 10 颗新卫星与环。' },
      { date: '1989-08-25', titleZh: '海王星飞越', titleEn: 'Neptune Flyby',
        descZh: '首次也是唯一一次海王星近距离探测，发现大暗斑与海卫一氮间歇泉。' },
      { date: '2018-11-05', titleZh: '穿越日球层顶', titleEn: 'Heliopause Crossing',
        descZh: '成为第二个进入星际空间的人造物体，距日约 119 AU。' },
      { date: '2026-01-01', titleZh: '现状', titleEn: 'Current',
        descZh: '距日约 139 AU，仍在传输科学数据。' },
    ],
  },
  newhorizons: {
    nameZh: '新视野号', nameEn: 'New Horizons',
    events: [
      { date: '2006-01-19', titleZh: '发射', titleEn: 'Launch',
        descZh: '以 16.26 km/s 的速度发射，是当时最快的航天器。' },
      { date: '2007-02-28', titleZh: '木星飞越', titleEn: 'Jupiter Flyby',
        descZh: '借力木星加速，同时测试科学仪器。' },
      { date: '2015-07-14', titleZh: '冥王星飞越', titleEn: 'Pluto Flyby',
        descZh: '最近距离 12,500 km，首次近距离拍摄冥王星，发现氮冰心形平原与水冰山脉。' },
      { date: '2019-01-01', titleZh: 'Arrokoth 飞越', titleEn: 'Arrokoth Flyby',
        descZh: '飞越柯伊伯带天体 Arrokoth（2014 MU69），最近距离 3,500 km，是迄今最近距离探测的最远天体。' },
      { date: '2026-01-01', titleZh: '现状', titleEn: 'Current',
        descZh: '距日约 59 AU，仍在柯伊伯带执行扩展任务。' },
    ],
  },
};

// ════════════════════════════════════════════════════════════════════
// New Horizons 轨道数据与位置计算（Issue #31）
// 与 heliosphere.js 的 Voyager 模型同源：线性外推 + 黄道坐标
// ════════════════════════════════════════════════════════════════════
export const NEW_HORIZONS = {
  id: 'newhorizons',
  nameZh: '新视野号', nameEn: 'New Horizons',
  // 2026.0 历元线性外推参数（误差 < 1 AU 量级，作探索地标）
  // 方向：朝冥王星/柯伊伯带方向（黄道 lon≈286°, lat≈-1.5°）
  r0AU: 58.6, rateAUyr: 2.95, lonDeg: 286.0, latDeg: -1.5, epochYear: 2026.0,
  desc: '2006 年发射，2015 年飞越冥王星，2019 年飞越 Arrokoth。目前仍在柯伊伯带扩展任务中，是第五个飞向星际空间的探测器。',
};

/** New Horizons 日心位置（km，黄道 J2000）——与 voyagerPosition 同构 */
export function newHorizonsPosition(jdTT) {
  const year = 2000 + (jdTT - 2451545.0) / 365.25;
  const r = (NEW_HORIZONS.r0AU + NEW_HORIZONS.rateAUyr * (year - NEW_HORIZONS.epochYear)) * KM_PER_AU;
  const lon = NEW_HORIZONS.lonDeg * DEG, lat = NEW_HORIZONS.latDeg * DEG;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

// ════════════════════════════════════════════════════════════════════
// 冥王星飞越回放轨迹（Issue #31）
// 2015-07-14 11:47 UTC 最近接近，距冥王星表面 ~12,500 km（中心 ~13,688 km）
// 相对速度 ~13.78 km/s，飞越窗口内近似直线（引力偏转 < 0.01°）
// ════════════════════════════════════════════════════════════════════
const NH_FLYBY_JD = 2457217.99;       // 2015-07-14 11:47 UTC
const NH_FLYBY_SPEED = 13.78;          // km/s 相对冥王星
const NH_FLYBY_CLOSEST = 13688;        // km，距冥王星中心

/** New Horizons 相对冥王星位置（km，黄道 J2000）
 *  飞越窗口（±数日）内有效；窗口外仍返回直线外推（用于回放预/尾声）。
 *  调用方将其与 planetPosition('pluto', jdTT) 相加得到日心位置。 */
export function newHorizonsPlutoRelativePosition(jdTT) {
  const dtSec = (jdTT - NH_FLYBY_JD) * 86400;
  // 速度方向（黄道系单位向量）：lon≈286°, lat≈0°
  // New Horizons 从太阳侧接近冥王星，飞越后继续向柯伊伯带深处
  const lon = 286 * DEG;
  const vx = Math.cos(lon), vy = Math.sin(lon);
  // 最近接近点：垂直于速度方向的偏移（黄道面内）
  const ox = -vy, oy = vx;
  return {
    x: vx * NH_FLYBY_SPEED * dtSec + ox * NH_FLYBY_CLOSEST,
    y: vy * NH_FLYBY_SPEED * dtSec + oy * NH_FLYBY_CLOSEST,
    z: 0,
  };
}

/** 飞越回放参数：调用方据此设置仿真时钟与相机跟随 */
export const NH_FLYBY = {
  jdStart: NH_FLYBY_JD - 1.0,   // 飞越前 1 天开始
  jdEnd: NH_FLYBY_JD + 1.0,     // 飞越后 1 天结束
  jdClosest: NH_FLYBY_JD,
  closestApproachKm: NH_FLYBY_CLOSEST,
  speedKmS: NH_FLYBY_SPEED,
  // 回放推荐时间倍率：飞越窗口 2 天压缩到 ~60 秒观看
  recommendedRate: (2.0 * 86400) / 60,
};
