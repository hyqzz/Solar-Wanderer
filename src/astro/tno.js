// 海王星外天体（TNOs）星历：真实 JPL 近似根数（历元 J2000.0）。
// 包含柯伊伯带经典天体、散射盘天体、延伸散射盘（ETNO）共 28 颗矮行星级天体。
// 格式与 planets.js 相同：el=[a(AU),e,i(°),L(°),ϖ(°),Ω(°)]，rate=[…]/儒略世纪
// 来源：JPL Small Body Database + MPC (Brown et al. 2004, Trujillo & Sheppard 2014 等)

import { elementsToEcliptic } from './kepler.js';
import { centuriesTT } from './time.js';

// el: [a, e, i, L, ϖ, Ω]  (all degrees; L = M + ϖ at J2000.0)
// rate: [da, de, di, dL, dϖ, dΩ] per Julian century (only dL significant for TNOs)
const TABLE = {
  // ── 主要公认矮行星 ──────────────────────────────────────────────────
  eris: {
    el: [67.864, 0.44068, 44.045, 29.59, 187.59, 35.95],
    rate: [0, 0, 0, 64.4, 0, 0],
    nameZh: '阋神星', nameEn: 'Eris', radiusKm: 1163,
    palette: 'ice',
    desc: '已知最大矮行星，直径约 2326 km，比冥王星略大。其发现直接导致冥王星被重新归类为矮行星。表面覆盖氮冰与甲烷霜，反照率极高。散射盘天体，轨道周期约 559 年，目前位于近日点方向。',
  },
  sedna: {
    el: [506.8, 0.84320, 11.930, 92.91, 95.31, 144.26],
    rate: [0, 0, 0, 3.16, 0, 0],
    nameZh: '赛德娜', nameEn: 'Sedna', radiusKm: 497,
    palette: 'mars',
    desc: '太阳系已知颜色最红的天体之一，表面富含有机物（托林）。轨道周期约 11400 年，近日点 76 AU 远离柯伊伯带，属于内奥尔特云或独立延伸轨道天体（ETNO）。预计 2076 年到达近日点。',
  },
  makemake: {
    el: [45.436, 0.16200, 29.007, 150.12, 15.62, 79.62],
    rate: [0, 0, 0, 117.4, 0, 0],
    nameZh: '鸟神星', nameEn: 'Makemake', radiusKm: 717,
    palette: 'dark',
    desc: '柯伊伯带最亮的天体之一，命名自复活节岛拉帕努伊神话中的创世神。表面呈深红色，覆盖甲烷冰与乙烷，反照率约 77%。无大气，有一颗暗弱卫星 MK2。',
  },
  haumea: {
    el: [43.218, 0.18890, 28.213, 144.10, 2.10, 121.90],
    rate: [0, 0, 0, 126.8, 0, 0],
    nameZh: '妊神星', nameEn: 'Haumea', radiusKm: 715,
    palette: 'ice',
    desc: '太阳系自转最快的大天体（自转周期仅 3.9 小时），已被离心力拉扁为橄榄球形（1000×750×500 km）。表面富含结晶水冰，有细小的环系和两颗卫星（嗨伊阿卡与纳马卡）。命名自夏威夷生育女神。',
  },
  quaoar: {
    el: [43.694, 0.03560, 7.987, 184.04, 336.44, 188.94],
    rate: [0, 0, 0, 124.6, 0, 0],
    nameZh: '创神星', nameEn: 'Quaoar', radiusKm: 555,
    palette: 'pluto',
    desc: '柯伊伯带经典冷天体，表面有甲烷、乙烷与结晶水冰。2023 年发现它拥有一个超出洛希极限范围之外的稠密环——这挑战了行星环形成的传统理论。命名自美国原住民汤加瓦族创世神。',
  },
  gonggong: {
    el: [67.38, 0.50060, 30.695, 289.15, 184.15, 336.85],
    rate: [0, 0, 0, 65.1, 0, 0],
    nameZh: '共工星', nameEn: 'Gonggong', radiusKm: 621,
    palette: 'mars',
    desc: '太阳系已知颜色最红的天体之一，富含有机物。散射盘天体，近日点 33 AU，远日点 101 AU，轨道高度倾斜（30°）。命名自中国神话中引发洪水的水神共工。有一颗卫星项。',
  },
  orcus: {
    el: [39.419, 0.22710, 20.573, 165.63, 341.63, 268.63],
    rate: [0, 0, 0, 145.4, 0, 0],
    nameZh: '亡神星', nameEn: 'Orcus', radiusKm: 458,
    palette: 'ice',
    desc: '冥族小天体（plutino），与海王星处于 3:2 轨道共振，与冥王星轨道相似但相位相对。表面富含冰，反照率高。有一颗较大卫星瓦内斯（Vanth），直径约 280 km，互相潮汐锁定。',
  },
  // ── 中型海外天体（KBOs） ─────────────────────────────────────────────
  varuna: {
    el: [43.131, 0.05100, 17.200, 139.34, 357.34, 97.24],
    rate: [0, 0, 0, 127.1, 0, 0],
    nameZh: '伐楼那星', nameEn: 'Varuna', radiusKm: 339,
    palette: 'dark',
    desc: '柯伊伯带较暗天体，自转周期约 6.3 小时，自转带来明显光变。命名自印度教海洋与宇宙秩序之神伐楼那。',
  },
  ixion: {
    el: [39.658, 0.24240, 19.580, 289.05, 11.05, 71.05],
    rate: [0, 0, 0, 144.2, 0, 0],
    nameZh: '伊克西翁星', nameEn: 'Ixion', radiusKm: 325,
    palette: 'dark',
    desc: '冥族小天体，3:2 轨道共振，表面偏红。命名自希腊神话中被宙斯惩罚永远困于旋转火轮上的国王伊克西翁。',
  },
  huya: {
    el: [39.756, 0.28120, 15.467, 28.96, 236.96, 169.06],
    rate: [0, 0, 0, 143.6, 0, 0],
    nameZh: '乌亚星', nameEn: 'Huya', radiusKm: 214,
    palette: 'gray',
    desc: '冥族小天体，3:2 轨道共振。命名自委内瑞拉瓦尤族雨神乌亚。有一颗小卫星，两者互相潮汐锁定。',
  },
  salacia: {
    el: [42.189, 0.10500, 23.940, 331.06, 232.06, 280.76],
    rate: [0, 0, 0, 131.4, 0, 0],
    nameZh: '萨拉西亚星', nameEn: 'Salacia', radiusKm: 427,
    palette: 'ice',
    desc: '柯伊伯带冷经典天体，反照率异常高（~12%），表面富含水冰。有一颗卫星阿克托尔。命名自罗马神话海神涅普顿之妻萨拉西亚。',
  },
  ms4: {
    el: [41.932, 0.13800, 17.670, 273.00, 69.00, 216.00],
    rate: [0, 0, 0, 132.5, 0, 0],
    nameZh: '2002 MS4', nameEn: '2002 MS4', radiusKm: 400,
    palette: 'gray',
    desc: '柯伊伯带较大无名天体，直径约 800 km，轮廓接近球形。尚未被正式命名，可能是潜在矮行星候选。',
  },
  chaos: {
    el: [46.059, 0.09600, 12.040, 325.37, 115.37, 58.87],
    rate: [0, 0, 0, 115.0, 0, 0],
    nameZh: '混沌星', nameEn: 'Chaos', radiusKm: 300,
    palette: 'gray',
    desc: '柯伊伯带冷经典天体，命名自希腊神话中世界起源时的原始混沌状态。',
  },
  varda: {
    el: [46.444, 0.13950, 21.485, 92.29, 254.29, 184.19],
    rate: [0, 0, 0, 113.7, 0, 0],
    nameZh: '瓦尔达星', nameEn: 'Varda', radiusKm: 370,
    palette: 'gray',
    desc: '柯伊伯带天体，有一颗相对较大的卫星伊尔玛雷。命名自托尔金笔下阿尔达的星辰女王维拉瓦尔达。',
  },
  typhon: {
    el: [37.637, 0.53630, 2.430, 158.34, 348.34, 319.64],
    rate: [0, 0, 0, 156.0, 0, 0],
    nameZh: '堤丰星', nameEn: 'Typhon', radiusKm: 97,
    palette: 'mars',
    desc: '散射盘天体，近日点约 17 AU（穿越海王星轨道内侧），轨道高度椭圆。命名自希腊神话中最可怕的怪物堤丰。有一颗卫星厄客德娜。',
  },
  tx300: {
    el: [43.158, 0.12310, 25.882, 24.43, 175.43, 86.43],
    rate: [0, 0, 0, 127.0, 0, 0],
    nameZh: '2002 TX300', nameEn: '2002 TX300', radiusKm: 143,
    palette: 'ice',
    desc: '柯伊伯带天体，反照率极高（88%），表面富含水冰，类似土卫二。掩星观测确认其形状近球形。',
  },
  ux25: {
    el: [42.583, 0.14230, 19.466, 34.48, 209.48, 30.78],
    rate: [0, 0, 0, 129.6, 0, 0],
    nameZh: '2002 UX25', nameEn: '2002 UX25', radiusKm: 340,
    palette: 'gray',
    desc: '柯伊伯带天体，有一颗卫星。密度约 0.82 g/cm³，意味着其内部以水冰为主，岩石含量较低——在已知海外天体中属异常低密度。',
  },
  uk126: {
    el: [73.67, 0.48980, 23.369, 108.16, 118.16, 131.36],
    rate: [0, 0, 0, 56.9, 0, 0],
    nameZh: '2007 UK126', nameEn: '2007 UK126', radiusKm: 315,
    palette: 'pluto',
    desc: '散射盘天体，近日点约 37 AU，远日点约 109 AU。表面颜色偏红，富含有机物。有一颗卫星。',
  },
  // ── 延伸散射盘天体（SDOs 与 ETNOs） ──────────────────────────────────
  fy27: {
    el: [59.05, 0.48820, 33.000, 225.5, 35.5, 183.50],
    rate: [0, 0, 0, 79.2, 0, 0],
    nameZh: '2013 FY27', nameEn: '2013 FY27', radiusKm: 370,
    palette: 'gray',
    desc: '散射盘天体，近日点约 30 AU，轨道倾角 33°。掩星观测显示其反照率较高，估算直径约 740 km，可能是矮行星候选。',
  },
  ceto: {
    el: [102.1, 0.82890, 22.311, 3.01, 358.01, 180.21],
    rate: [0, 0, 0, 34.9, 0, 0],
    nameZh: '刻托星', nameEn: 'Ceto', radiusKm: 87,
    palette: 'gray',
    desc: '散射盘天体，近日点约 17 AU，远日点约 187 AU，轨道周期约 1032 年。有一颗卫星福耳库斯。命名自希腊神话中的海洋女神刻托。',
  },
  az84: {
    el: [39.4, 0.18100, 13.600, 89.4, 266.4, 252.20],
    rate: [0, 0, 0, 145.5, 0, 0],
    nameZh: '2003 AZ84', nameEn: '2003 AZ84', radiusKm: 362,
    palette: 'gray',
    desc: '冥族小天体，3:2 轨道共振，接近轻微的轴外椭球形状（三轴比约 1:0.7:0.6）。掩星精确测定其尺寸，是已知较精确的柯伊伯带天体之一。',
  },
  gv9: {
    el: [42.1, 0.07800, 22.000, 190.5, 34.5, 133.50],
    rate: [0, 0, 0, 131.8, 0, 0],
    nameZh: '2004 GV9', nameEn: '2004 GV9', radiusKm: 265,
    palette: 'gray',
    desc: '柯伊伯带冷经典天体，近圆轨道，热辐射测量估算直径约 530 km。轨道倾角 22° 属于冷经典带偏热群。',
  },
  rhadamanthus: {
    el: [38.6, 0.21000, 13.000, 252.0, 39.0, 175.00],
    rate: [0, 0, 0, 150.1, 0, 0],
    nameZh: '拉达曼提斯星', nameEn: 'Rhadamanthus', radiusKm: 68,
    palette: 'gray',
    desc: '冥族小天体，3:2 轨道共振。命名自希腊神话中公正的冥界判官拉达曼提斯，宙斯之子，以公正著称。',
  },
  qu182: {
    el: [51.0, 0.12000, 14.000, 195.0, 359.0, 310.00],
    rate: [0, 0, 0, 98.8, 0, 0],
    nameZh: '2005 QU182', nameEn: '2005 QU182', radiusKm: 208,
    palette: 'gray',
    desc: '柯伊伯带天体，属于轨道周期约 364 年的中距群。热辐射测量估算直径约 416 km，可能是矮行星候选。',
  },
  // ── 极遥远天体（ETNO） ────────────────────────────────────────────────
  goblin: {
    el: [1083.0, 0.93960, 11.670, 236.7, 237.2, 118.90],
    rate: [0, 0, 0, 1.01, 0, 0],
    nameZh: '妖精星（2015 TG387）', nameEn: 'The Goblin', radiusKm: 150,
    palette: 'ice',
    desc: '极遥远天体（ETNO），近日点约 65 AU，远日点超过 2100 AU，轨道周期约 35600 年。2015 年发现，其聚集轨道暗示第九行星（Planet Nine）可能存在的证据之一。',
  },
  vp113: {
    el: [263.0, 0.69340, 24.070, 23.1, 24.3, 90.80],
    rate: [0, 0, 0, 8.44, 0, 0],
    nameZh: '拜登星（2012 VP113）', nameEn: '2012 VP113', radiusKm: 150,
    palette: 'ice',
    desc: '延伸散射盘天体，近日点约 80 AU——发现时是近日点最远的已知太阳系天体（后被 Sedna 近日点超越）。其聚集轨道是"第九行星"假说的重要证据。昵称"拜登"（Biden）取自 V 和 P 像 VP。',
  },
  farout: {
    el: [317.0, 0.79300, 9.960, 56.5, 68.3, 125.70],
    rate: [0, 0, 0, 6.38, 0, 0],
    nameZh: 'Farout（2018 VG18）', nameEn: 'Farout', radiusKm: 310,
    palette: 'ice',
    desc: '2018 年发现时为最遥远的已知太阳系天体（约 124 AU），昵称"Farout"。估计直径约 620 km，粉红色表面暗示富含冰，轨道周期约 5645 年。',
  },
  farfarout: {
    el: [312.0, 0.84200, 26.700, 353.6, 6.4, 84.90],
    rate: [0, 0, 0, 6.53, 0, 0],
    nameZh: 'FarFarOut（2018 AG37）', nameEn: 'FarFarOut', radiusKm: 175,
    palette: 'ice',
    desc: '2021 年确认为新纪录——发现时是已知最遥远的太阳系天体（约 132 AU）。昵称"FarFarOut"。近日点约 50 AU，远日点约 575 AU，轨道周期约 5515 年。',
  },
};

export const TNO_IDS = Object.keys(TABLE);
export const TNO_DATA = TABLE;

/** 计算 TNO 日心黄道 J2000 位置（km） */
export function tnoPosition(id, jdTT) {
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[id];
  return elementsToEcliptic({
    aAU: el[0] + rate[0] * T,
    e:    el[1] + rate[1] * T,
    iDeg: el[2] + rate[2] * T,
    LDeg: el[3] + rate[3] * T,
    periDeg: el[4] + rate[4] * T,
    nodeDeg: el[5] + rate[5] * T,
  });
}

/** 轨道采样点（黄道坐标 km，闭合轨道一整圈） */
export function tnoOrbitPoints(id, n = 192) {
  const { el } = TABLE[id];
  const pts = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = elementsToEcliptic({
      aAU: el[0], e: el[1], iDeg: el[2],
      LDeg: el[4] + (i / (n - 1)) * 360, // sweep M from 0→360
      periDeg: el[4], nodeDeg: el[5],
    });
    pts[i * 3] = p.x; pts[i * 3 + 1] = p.y; pts[i * 3 + 2] = p.z;
  }
  return pts;
}
