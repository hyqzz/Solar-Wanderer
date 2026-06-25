// 地标系统：Apollo 着陆点（Issue #34）与火星车着陆点/行驶路径（Issue #35）。
// 低多边形程序化模型，1:1 真实尺度，挂在天体网格之下（随自转旋转）。
// LOD：远距离 billboard 精灵，近距离 3D 模型，过渡区淡入淡出。
// 坐标系：天体本地系（+Y=北极, +X=本初子午线, 东经为正），
//   与 terrain.js HeightField.sampleMap 约定一致：lon = atan2(-dir.z, dir.x)。

import * as THREE from 'three';

const DEG = Math.PI / 180;
const m = (v) => v * 0.001; // 米→千米

// ── 坐标工具 ──
// 经纬度 → 天体本地系方向（单位向量）
// lat: 纬度（度），lon: 经度（度，东经为正）
function latLonToDir(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon)
  );
}

// 将组的 +Y 对齐到表面法向（方向向量 = 从天体中心指向表面）
function alignToNormal(group, normal) {
  const up = new THREE.Vector3(0, 1, 0);
  group.quaternion.setFromUnitVectors(up, normal);
}

// ── Billboard 精灵工厂 ──
// 远距离可见的十字标记，保持地标在轨道高度仍可定位
function makeBillboard(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const hex = '#' + color.toString(16).padStart(6, '0');
  // 十字线
  ctx.strokeStyle = hex;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 6); ctx.lineTo(32, 58);
  ctx.moveTo(6, 32); ctx.lineTo(58, 32);
  ctx.stroke();
  // 中心圆点（白色高亮）
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(32, 32, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.lineWidth = 2;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85,
    depthWrite: false, depthTest: true,
  }));
}

// ════════════════════════════════════════════════════════════════════
// Apollo 着陆点数据（Issue #34）
// 坐标来源：LRO NAC 精确测量（NASA PDS），经度东经为正
// ════════════════════════════════════════════════════════════════════
export const APOLLO_SITES = [
  {
    id: 'apollo11',
    nameZh: '阿波罗11号', nameEn: 'Apollo 11',
    latDeg: 0.6741, lonDeg: 23.4730,
    siteNameZh: '静海', siteNameEn: 'Mare Tranquillitatis',
    date: '1969-07-20',
    crewZh: '阿姆斯特朗、奥尔德林、柯林斯',
    descZh: '人类首次登月。阿姆斯特朗踏上月球："这是个人的一小步，人类的一大步。"',
    facts: ['停留 21.6 小时', '采集 21.5 kg 月岩', '月面行走 2.7 小时'],
    hasRover: false,
  },
  {
    id: 'apollo12',
    nameZh: '阿波罗12号', nameEn: 'Apollo 12',
    latDeg: -3.0128, lonDeg: -23.4219,
    siteNameZh: '风暴洋', siteNameEn: 'Oceanus Procellarum',
    date: '1969-11-19',
    crewZh: '康拉德、比恩、戈登',
    descZh: '精准着陆于 1967 年发射的勘测者3号附近，验证定点着陆能力。',
    facts: ['停留 31.5 小时', '采集 34.4 kg 月岩', '访问勘测者3号'],
    hasRover: false,
  },
  {
    id: 'apollo15',
    nameZh: '阿波罗15号', nameEn: 'Apollo 15',
    latDeg: 26.1324, lonDeg: 3.6330,
    siteNameZh: '哈德利月溪', siteNameEn: 'Hadley Rille',
    date: '1971-07-30',
    crewZh: '斯科特、艾尔文、沃登',
    descZh: '首次使用月球车，在哈德利月溪边缘探索，发现"创世岩"（15415 号斜长岩，约 41 亿年）。',
    facts: ['停留 66.9 小时', '采集 77.3 kg 月岩', '月球车行驶 27.9 km'],
    hasRover: true,
  },
  {
    id: 'apollo16',
    nameZh: '阿波罗16号', nameEn: 'Apollo 16',
    latDeg: -8.9734, lonDeg: 15.5008,
    siteNameZh: '笛卡尔高地', siteNameEn: 'Descartes Highlands',
    date: '1972-04-21',
    crewZh: '扬、杜克、马丁利',
    descZh: '探索笛卡尔高地，采集到表明月球早期火山活动的样本。',
    facts: ['停留 71.0 小时', '采集 95.7 kg 月岩', '月球车行驶 26.7 km'],
    hasRover: true,
  },
  {
    id: 'apollo17',
    nameZh: '阿波罗17号', nameEn: 'Apollo 17',
    latDeg: 20.1911, lonDeg: 30.7723,
    siteNameZh: '陶拉斯-利特罗谷', siteNameEn: 'Taurus-Littrow Valley',
    date: '1972-12-11',
    crewZh: '塞尔南、施密特、埃万斯',
    descZh: '最后一次阿波罗任务。地质学家施密特发现橙色月壤（火山玻璃珠），证明月球曾有火山气体喷发。',
    facts: ['停留 75.0 小时', '采集 110.5 kg 月岩', '月球车行驶 35.7 km'],
    hasRover: true,
  },
];

// ── Apollo 3D 模型构建器 ──
// LM 下降段：八边形棱柱 + 4 条着陆腿（阿波罗登月舱的标志性外观）
// 坐标约定：y=0 为地面（脚盘位置），主体悬空于腿之上
function createLMDescentStage() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });

  // 下降段主体：八边形棱柱（金箔包裹的仪器舱），底部离地 ~1.8m
  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(m(4.3), m(4.3), m(2.3), 8), gold);
  stage.position.y = m(2.95); // 1.8m(腿高) + 2.3m/2(主体半高)
  group.add(stage);

  // 4 条着陆腿（从主体底部向外向下延伸至地面）
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const hip = new THREE.Vector3(
      Math.cos(angle) * m(3.0), m(1.8), Math.sin(angle) * m(3.0));
    const foot = new THREE.Vector3(
      Math.cos(angle) * m(4.5), 0, Math.sin(angle) * m(4.5));
    const dir = foot.clone().sub(hip);
    const len = dir.length();
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.08), m(0.08), len, 4), dark);
    leg.position.copy(hip).addScaledVector(dir, 0.5);
    // 对齐圆柱 Y 轴到腿方向
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(leg);
    // 着陆脚盘
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.30), m(0.30), m(0.05), 8), dark);
    pad.position.copy(foot);
    group.add(pad);
  }

  return group;
}

// 旗帜：不锈钢杆 + 尼龙旗面（阿波罗任务均在月面插旗）
function createFlag() {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.4 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.8, side: THREE.DoubleSide });

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), m(2.4), 4), poleMat);
  pole.position.y = m(1.2);
  group.add(pole);

  // 旗面（顶部横杆支撑，模拟太空中的"展开"状态）
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(m(1.5), m(0.9)), flagMat);
  flag.position.set(m(0.75), m(1.9), 0);
  group.add(flag);

  return group;
}

// 月球车（LRV）：阿波罗 15/16/17 使用的电池月球车
function createLRV() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });

  // 底盘
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(3.0), m(0.3), m(1.5)), gold);
  chassis.position.y = m(0.8);
  group.add(chassis);

  // 两张座椅
  for (const z of [-m(0.4), m(0.4)]) {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(m(0.8), m(0.5), m(0.5)), dark);
    seat.position.set(0, m(1.2), z);
    group.add(seat);
  }

  // 4 个车轮（钢丝网轮）
  for (let i = 0; i < 4; i++) {
    const wx = (i < 2 ? -1 : 1) * m(1.2);
    const wz = (i % 2 === 0 ? -1 : 1) * m(0.6);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.4), m(0.4), m(0.3), 8), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.4), wz);
    group.add(wheel);
  }

  return group;
}

// 脚印贴花：平面网格 + 半透明纹理（简化为小圆点群）
function createFootprints() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x666666, transparent: true, opacity: 0.4, depthWrite: false,
  });
  // 沿一条短路径散布脚印（模拟宇航员行走轨迹）
  for (let i = 0; i < 12; i++) {
    const fp = new THREE.Mesh(
      new THREE.CircleGeometry(m(0.15), 6), mat);
    fp.rotation.x = -Math.PI / 2; // 平铺于地面
    fp.position.set(
      m(1) + i * m(0.4) + (Math.random() - 0.5) * m(0.2),
      m(0.01), // 1cm 悬浮防 z-fight
      (i % 2 === 0 ? 1 : -1) * m(0.15) + (Math.random() - 0.5) * m(0.1)
    );
    group.add(fp);
  }
  return group;
}

// ── Apollo 地标场景创建 ──
// 挂在月球网格之下，随月球自转。返回 { entries, group, update }
// update(camRelPosKm): LOD 切换，camRelPosKm 为相机在月球本地系中的位置
export function createApolloLandmarks(scene, terrainMgr) {
  const moonMesh = terrainMgr.meshOf('moon');
  const group = new THREE.Group();
  moonMesh.add(group);

  const entries = APOLLO_SITES.map((site) => {
    const dir = latLonToDir(site.latDeg, site.lonDeg);
    const h = terrainMgr.heightAt('moon', dir);
    const pos = dir.clone().multiplyScalar(h + m(0.05)); // 5cm 悬浮防 z-fight

    const siteGroup = new THREE.Group();
    siteGroup.position.copy(pos);
    alignToNormal(siteGroup, dir);

    // 3D 模型组（近距离显示）
    const model = new THREE.Group();
    model.add(createLMDescentStage());
    const flag = createFlag();
    flag.position.set(m(4), 0, m(1));
    model.add(flag);
    if (site.hasRover) {
      const lrv = createLRV();
      lrv.position.set(m(8), 0, m(2));
      model.add(lrv);
    }
    model.add(createFootprints());
    model.visible = false; // 默认隐藏，近距离淡入
    siteGroup.add(model);

    // Billboard（远距离可见）
    const billboard = makeBillboard(0xffaa44);
    billboard.scale.setScalar(m(15));
    siteGroup.add(billboard);

    group.add(siteGroup);

    return { site, group: siteGroup, model, billboard, dir, posLocal: pos };
  });

  // LOD 更新：根据相机距离切换 billboard / 3D 模型
  // camRelPosKm: 相机在月球本地系中的位置（Vector3，km）
  function update(camRelPosKm) {
    if (!camRelPosKm) return;
    for (const e of entries) {
      const dx = camRelPosKm.x - e.posLocal.x;
      const dy = camRelPosKm.y - e.posLocal.y;
      const dz = camRelPosKm.z - e.posLocal.z;
      const dist = Math.hypot(dx, dy, dz);
      // 3D 模型：5km 内可见，10km→5km 淡入
      const modelFade = THREE.MathUtils.clamp((10 - dist) / 5, 0, 1);
      e.model.visible = modelFade > 0.01;
      // Billboard：1km 外始终可见，保持 ~恒定屏幕尺寸
      e.billboard.visible = dist > 0.5;
      const bbScale = THREE.MathUtils.clamp(dist * 0.008, m(15), m(200));
      e.billboard.scale.setScalar(bbScale);
    }
  }

  return { entries, group, update };
}

// ════════════════════════════════════════════════════════════════════
// 火星车着陆点与行驶路径数据（Issue #35）
// 路径为简化但真实的关键航点（NASA/JPL 公开数据），含科学发现描述
// ════════════════════════════════════════════════════════════════════
export const ROVER_SITES = [
  {
    id: 'perseverance',
    nameZh: '毅力号', nameEn: 'Perseverance',
    latDeg: 18.4447, lonDeg: 77.4508,
    siteNameZh: '杰泽罗陨石坑', siteNameEn: 'Jezero Crater',
    landingDate: '2021-02-18',
    agency: 'NASA',
    descZh: '搜寻古生物迹象并采集样本供未来取回。携带机智号无人机完成首次地外动力飞行。',
    roverType: 'nuclear', // 核动力（MMRTG）
    path: [
      { latDeg: 18.4447, lonDeg: 77.4508, date: '2021-02-18',
        titleZh: '着陆', descZh: 'Octavia E. Butler 着陆点， Autonomous Landing 精度 < 10m。' },
      { latDeg: 18.4230, lonDeg: 77.4510, date: '2021-06-01',
        titleZh: 'Séítah 单元', descZh: '穿越橄榄石富集区域，用 SuperCam 激光分析岩石成分。' },
      { latDeg: 18.4000, lonDeg: 77.4400, date: '2022-04-01',
        titleZh: '三角洲前缘', descZh: '发现沉积岩，证实杰泽罗曾为古湖泊三角洲，是寻找生物标志物的关键区域。' },
      { latDeg: 18.3700, lonDeg: 77.4200, date: '2023-02-01',
        titleZh: 'Three Forks', descZh: '样本暂存点，首批管样放置于地表供未来 Mars Sample Return 取回。' },
      { latDeg: 18.3500, lonDeg: 77.4000, date: '2024-06-01',
        titleZh: 'Bright Angel', descZh: '探索富含碳酸盐的沉积层，碳酸盐利于保存生物标志物。' },
    ],
  },
  {
    id: 'curiosity',
    nameZh: '好奇号', nameEn: 'Curiosity',
    latDeg: -4.5895, lonDeg: 137.4417,
    siteNameZh: '盖尔陨石坑', siteNameEn: 'Gale Crater',
    landingDate: '2012-08-06',
    agency: 'NASA',
    descZh: '评估火星古环境宜居性，攀登夏普山（Aeolis Mons）研究沉积层序。',
    roverType: 'nuclear',
    path: [
      { latDeg: -4.5895, lonDeg: 137.4417, date: '2012-08-06',
        titleZh: '着陆', descZh: 'Bradbury Landing，"恐怖七分钟" Entry-Descent-Landing 成功。' },
      { latDeg: -4.5900, lonDeg: 137.4400, date: '2013-03-01',
        titleZh: 'Yellowknife Bay', descZh: '发现黏土矿物，证实远古时期存在 pH 中性的液态水环境，火星曾宜居。' },
      { latDeg: -4.5900, lonDeg: 137.3800, date: '2014-09-01',
        titleZh: 'Pahrump Hills', descZh: '首次钻探夏普山基层沉积岩，发现赤铁矿条带。' },
      { latDeg: -4.7500, lonDeg: 137.3000, date: '2016-09-01',
        titleZh: 'Murray Buttes', descZh: '穿越夏普山下层 Murray 地层，拍摄壮观的风蚀但tes 地貌。' },
      { latDeg: -4.8600, lonDeg: 137.2700, date: '2017-09-01',
        titleZh: 'Vera Rubin Ridge', descZh: '发现赤铁矿富集层，研究火星气候从湿润到干燥的转变。' },
      { latDeg: -4.9200, lonDeg: 137.3000, date: '2019-05-01',
        titleZh: 'Glen Torridon', descZh: '发现黏土矿物与有机分子（噻吩、苯环），火星曾具备生命化学基础。' },
      { latDeg: -5.0000, lonDeg: 137.3500, date: '2024-06-01',
        titleZh: 'Marker Band Valley', descZh: '发现波痕化石——火星上最清晰的古水波痕，此处曾存在浅水湖。' },
    ],
  },
  {
    id: 'zhurong',
    nameZh: '祝融号', nameEn: 'Zhurong',
    latDeg: 25.066, lonDeg: 109.926,
    siteNameZh: '乌托邦平原', siteNameEn: 'Utopia Planitia',
    landingDate: '2021-05-15',
    agency: 'CNSA',
    descZh: '中国首次火星巡视探测。使用探地雷达探测地下冰层，研究火星水分布。',
    roverType: 'solar',
    path: [
      { latDeg: 25.066, lonDeg: 109.926, date: '2021-05-15',
        titleZh: '着陆', descZh: '天问一号任务着陆点，中国成为第二个成功火星着陆的国家。' },
      { latDeg: 25.055, lonDeg: 109.920, date: '2021-07-01',
        titleZh: '巡视开始', descZh: '驶离着陆平台，开始火星表面巡视。' },
      { latDeg: 25.050, lonDeg: 109.915, date: '2021-09-01',
        titleZh: '探地雷达探测', descZh: '双频探地雷达发现地下 40m 深度内存在多层结构，揭示乌托邦平原沉积历史。' },
      { latDeg: 25.045, lonDeg: 109.910, date: '2022-05-01',
        titleZh: '水冰证据', descZh: '探地雷达数据揭示地下 35m 处可能存在富水冰层，支持火星中纬度存在地下冰的假说。' },
    ],
  },
  {
    id: 'opportunity',
    nameZh: '机遇号', nameEn: 'Opportunity',
    latDeg: -1.9462, lonDeg: 354.4734,
    siteNameZh: '子午线平原', siteNameEn: 'Meridiani Planum',
    landingDate: '2004-01-25',
    agency: 'NASA',
    descZh: '原定 90 天任务，实际运行 14 年，行驶 45 km。发现赤铁矿"蓝莓"证实古水环境。',
    roverType: 'solar',
    path: [
      { latDeg: -1.9462, lonDeg: 354.4734, date: '2004-01-25',
        titleZh: '着陆', descZh: 'Eagle Crater 内着陆，"hole in one" 精准落入小撞击坑。' },
      { latDeg: -1.9500, lonDeg: 354.3500, date: '2004-04-01',
        titleZh: 'Endurance Crater', descZh: '发现赤铁矿"蓝莓"结核——赤铁矿在水中沉淀形成，证实火星曾有液态水。' },
      { latDeg: -2.0500, lonDeg: 354.2500, date: '2007-09-01',
        titleZh: 'Victoria Crater', descZh: '探索直径 750m 的维多利亚撞击坑，研究沉积层序。' },
      { latDeg: -1.9500, lonDeg: 354.5000, date: '2011-08-01',
        titleZh: 'Endeavour Crater',
        descZh: '抵达 22km 直径的奋进撞击坑，发现石膏脉（水合硫酸钙），确证古液态水流过岩石裂隙。' },
      { latDeg: -1.9500, lonDeg: 354.5500, date: '2018-06-01',
        titleZh: 'Perseverance Valley', descZh: '最终位置。2018 年火星全球尘暴导致太阳能不足，机遇号失联，任务结束。行驶 45.16 km。' },
    ],
  },
];

// ── 火星车 3D 模型构建器 ──
// 通用火星车：底盘 + 桅杆 + 6 轮（好奇号/毅力号风格）
function createNuclearRover() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.7, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });

  // 底盘（盒形车身）
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(2.8), m(1.2), m(1.8)), body);
  chassis.position.y = m(1.0);
  group.add(chassis);

  // 桅杆相机（Mastcam/ZCam）
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.05), m(0.05), m(1.5), 6), dark);
  mast.position.set(0, m(2.3), 0);
  group.add(mast);
  // 桅杆顶部相机头
  const camHead = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.4), m(0.3), m(0.3)), body);
  camHead.position.set(0, m(3.0), 0);
  group.add(camHead);

  // 6 个车轮（摇臂转向架悬挂）
  for (let i = 0; i < 6; i++) {
    const wx = (i < 3 ? -1 : 1) * m(1.3);
    const wz = ((i % 3) - 1) * m(0.7);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.35), m(0.35), m(0.25), 10), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.35), wz);
    group.add(wheel);
  }

  // RTG（核动力源，好奇号/毅力号尾部）
  const rtg = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.25), m(0.25), m(0.6), 8), gold);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(m(1.7), m(1.0), 0);
  group.add(rtg);

  // 机械臂
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.04), m(0.04), m(1.5), 6), dark);
  arm.position.set(-m(1.0), m(1.5), m(0.5));
  arm.rotation.z = Math.PI / 4;
  group.add(arm);

  return group;
}

// 太阳能火星车（机遇号/祝融号风格）
function createSolarRover() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.7, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, metalness: 0.3, roughness: 0.2 });

  // 底盘
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(1.5), m(0.6), m(1.2)), body);
  chassis.position.y = m(0.6);
  group.add(chassis);

  // 太阳能板（三联式）
  for (const x of [-m(0.8), 0, m(0.8)]) {
    const sp = new THREE.Mesh(
      new THREE.BoxGeometry(m(0.7), m(0.02), m(1.0)), panel);
    sp.position.set(x, m(1.0), 0);
    group.add(sp);
  }

  // 桅杆
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.03), m(0.03), m(1.0), 6), dark);
  mast.position.set(0, m(1.5), 0);
  group.add(mast);
  const camHead = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.2), m(0.2), m(0.2)), body);
  camHead.position.set(0, m(2.0), 0);
  group.add(camHead);

  // 6 个车轮
  for (let i = 0; i < 6; i++) {
    const wx = (i < 3 ? -1 : 1) * m(0.7);
    const wz = ((i % 3) - 1) * m(0.4);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.20), m(0.20), m(0.15), 8), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.20), wz);
    group.add(wheel);
  }

  return group;
}

// 按类型创建火星车模型
function createRoverModel(site) {
  if (site.roverType === 'nuclear') return createNuclearRover();
  return createSolarRover();
}

// 行驶路径线
function createPathLine(waypoints, terrainMgr) {
  const points = [];
  for (const wp of waypoints) {
    const dir = latLonToDir(wp.latDeg, wp.lonDeg);
    const h = terrainMgr.heightAt('mars', dir);
    points.push(dir.clone().multiplyScalar(h + m(0.3))); // 30cm 悬浮
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.7, fog: true,
  });
  return new THREE.Line(geo, mat);
}

// 路径航点标记（可点击，显示科学发现）
function createWaypointMarker() {
  const geo = new THREE.OctahedronGeometry(m(0.5), 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  return new THREE.Mesh(geo, mat);
}

// ── 火星车地标场景创建 ──
// 挂在火星网格之下，随火星自转。返回 { entries, group, update }
// update(camRelPosKm): LOD 切换，camRelPosKm 为相机在火星本地系中的位置
export function createRoverSites(scene, terrainMgr) {
  const marsMesh = terrainMgr.meshOf('mars');
  const group = new THREE.Group();
  marsMesh.add(group);

  const entries = ROVER_SITES.map((site) => {
    const dir = latLonToDir(site.latDeg, site.lonDeg);
    const h = terrainMgr.heightAt('mars', dir);
    const pos = dir.clone().multiplyScalar(h + m(0.05));

    const siteGroup = new THREE.Group();
    siteGroup.position.copy(pos);
    alignToNormal(siteGroup, dir);

    // 火星车 3D 模型
    const model = createRoverModel(site);
    model.visible = false;
    siteGroup.add(model);

    // Billboard
    const billboard = makeBillboard(0xff6600);
    billboard.scale.setScalar(m(10));
    siteGroup.add(billboard);

    group.add(siteGroup);

    // 行驶路径（独立组，不随着陆点旋转——路径点各自对齐法向）
    const pathGroup = new THREE.Group();
    const pathLine = createPathLine(site.path, terrainMgr);
    pathGroup.add(pathLine);

    // 航点标记
    const waypointMeshes = [];
    for (const wp of site.path) {
      const wpDir = latLonToDir(wp.latDeg, wp.lonDeg);
      const wpH = terrainMgr.heightAt('mars', wpDir);
      const wpPos = wpDir.clone().multiplyScalar(wpH + m(0.5));
      const marker = createWaypointMarker();
      marker.position.copy(wpPos);
      marker.userData.waypoint = wp; // 供点击拾取后读取科学发现
      pathGroup.add(marker);
      waypointMeshes.push(marker);
    }

    group.add(pathGroup);

    return {
      site, group: siteGroup, model, billboard, dir, posLocal: pos,
      pathGroup, pathLine, waypointMeshes,
    };
  });

  // LOD 更新
  function update(camRelPosKm) {
    if (!camRelPosKm) return;
    for (const e of entries) {
      const dx = camRelPosKm.x - e.posLocal.x;
      const dy = camRelPosKm.y - e.posLocal.y;
      const dz = camRelPosKm.z - e.posLocal.z;
      const dist = Math.hypot(dx, dy, dz);
      // 3D 模型：3km 内可见，5km→3km 淡入
      const modelFade = THREE.MathUtils.clamp((5 - dist) / 2, 0, 1);
      e.model.visible = modelFade > 0.01;
      // Billboard：0.5km 外可见
      e.billboard.visible = dist > 0.3;
      const bbScale = THREE.MathUtils.clamp(dist * 0.008, m(10), m(150));
      e.billboard.scale.setScalar(bbScale);
      // 路径线：50km 内可见
      e.pathGroup.visible = dist < 50;
      // 航点标记：20km 内可见，近距离放大
      const wpScale = THREE.MathUtils.clamp(dist * 0.02, m(0.5), m(5));
      for (const wp of e.waypointMeshes) {
        wp.scale.setScalar(wpScale);
        wp.visible = dist < 20;
      }
    }
  }

  return { entries, group, update };
}
