// 天体物理数据库：真实半径 / GM / 扁率 / 大气 / 地表 / 环系 / 贴图 / 中文资料。
// 半径单位 km，GM 单位 km³/s²（重力 g = GM/r²，得 km/s² → ×1000 为 m/s²）。
//
// ── 半径口径（radiusKm 与 oblateness 必须配对） ────────────────────────────────
// 渲染器对非可登陆天体施加 mesh.scale.y = 1 − oblateness，即
//     赤道半径 = radiusKm，极半径 = radiusKm × (1 − oblateness)
// 所以 `oblateness` 是标准扁率 f = (a−b)/a，`radiusKm` 就必须是**赤道半径 a**。
// 两者口径不一致会直接算错天体大小——四颗巨行星此前填的是体积平均半径
// （木星 69911、土星 58232、天王星 25362、海王星 24622），
// 于是土星被画小了 3.4%（2036 km）、木星 2.2%（1581 km），且极半径也一并偏小。
// 现已改为标准赤道半径（1 bar 层），与扁率配对后极半径与实测值逐位吻合：
//     木星 71492 × (1−0.06487) = 66854 ✓   土星 60268 × (1−0.09796) = 54364 ✓
//     天王星 25559 × (1−0.02293) = 24973 ✓  海王星 24764 × (1−0.01708) = 24341 ✓
// 可登陆的岩质天体（地球 6371、火星 3389.5）保留**体积平均半径**并渲染为正球：
// 地形瓦片、行走碰撞、高度查询全建立在正球 R 上，单独压扁网格会让地表与碰撞错位；
// 而 0.3%–0.6% 的扁率在正球近似下不可辨，用等体积球半径才是更好的球近似。
// 这类天体的 `oblateness` 因此只作数据保留，不参与渲染。

export const BODIES = {
  sun: {
    id: 'sun', nameZh: '太阳', nameEn: 'Sun', type: 'star', parent: null,
    radiusKm: 695700, gm: 1.32712440018e11, oblateness: 0.00005,
    rotation: 'iau', landable: false,
    textures: { map: 'sun.jpg' },
    desc: 'G2V 型主序星，占太阳系总质量的 99.86%。表面温度约 5772K，核心通过氢核聚变每秒释放 3.8×10²⁶ 瓦特能量。',
  },
  mercury: {
    id: 'mercury', nameZh: '水星', nameEn: 'Mercury', type: 'rocky', parent: 'sun',
    radiusKm: 2439.7, gm: 2.2032e4, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 4, roughness: 0.55, craters: 1.0, palette: 'gray' },
    textures: { map: 'mercury.jpg' },
    desc: '最靠近太阳的行星，3:2 自旋轨道共振。无大气，昼夜温差达 600°C，表面布满撞击坑。',
  },
  venus: {
    id: 'venus', nameZh: '金星', nameEn: 'Venus', type: 'rocky', parent: 'sun',
    radiusKm: 6051.8, gm: 3.24859e5, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 3, roughness: 0.45, craters: 0.2, palette: 'venus' },
    atmosphere: {
      // 金星可见的"地面"就是硫酸云顶，反照率约 0.7
      groundAlbedo: 0.7,
      // 太空视角：multiplier 从 6 降到 1.5，使云层贴图不被散射光淹没，终结线可见
      heightKm: 90, rayleighScaleKm: 15.9, mieScaleKm: 5,
      // Rayleigh 橙色偏向：CO₂ + H₂SO₄ 云层优先吸收蓝光（Venera 着陆器实拍：橙琥珀色天空）
      rayleigh: [8e-6, 4.5e-6, 1.0e-6],
      // 分光 Mie（橙色加权）：旧版灰色 mie 使地表仰望的厚霾单散射呈奶油白；
      // 真实金星：阳光穿过 90km CO₂+硫酸霾后蓝光被吸收殆尽，天空为橙琥珀色（Venera 实拍）。
      mie: [4.5e-6, 2.6e-6, 0.9e-6],
      mieG: 0.65,  // 降低：厚云层使散射更均匀，消除太阳方向过亮
      multiplier: 1.5,
      haze: 0.90,  // 极厚气溶胶层
      // 地表视角：橙色弥散天空（太阳完全遮蔽），能见度约 5~20 km
      // interiorBoost=5：L.r≈0.93 → ACES≈0.73，橙色保留（boost过高则全通道ACES压缩为白）
      interiorBoost: 5,
      interiorBoostM: 0.6,  // Mie 低值：无方向性光晕（太阳不可见于地表）
      fogDensityMult: 5,    // 地表能见度约 5~20 km（Venera 实测数据）
      // 地表光照穿霾色滤：92 bar CO₂ + 硫酸云把直射阳光滤成橙琥珀色并大幅衰减
      // （Venera 13/14 实拍：橙褐色玄武岩原野，照度仅地球阴天窗边水平）
      groundTint: [1.0, 0.50, 0.14], groundDim: 0.55,
    },
    textures: { map: 'venus_surface.jpg', clouds: 'venus_atmosphere.jpg', cloudsOpaque: true },
    desc: '大小与地球相仿的”姊妹星”，却被 92 倍地球气压的 CO₂ 浓密大气与硫酸云覆盖，表面 465°C，自转方向逆行且一天长于一年。',
  },
  earth: {
    id: 'earth', nameZh: '地球', nameEn: 'Earth', type: 'rocky', parent: 'sun',
    radiusKm: 6371.0, gm: 3.986004418e5, oblateness: 0.0033528,
    rotation: 'iau', landable: true,
    surface: { ampKm: 2.5, roughness: 0.5, craters: 0, palette: 'earth', ocean: true },
    atmosphere: {
                        groundAlbedo: 0.12,
                        ozone: 1,
      heightKm: 60, rayleighScaleKm: 8.5, mieScaleKm: 1.2,
      // multiplier 0.72：太空视角减弱盘面内散射（真实 Blue Marble 观感为深蓝海洋，
      // 强 Rayleigh 内散射把整个白昼面罩上一层淡青纱）；地表天空亮度由 interiorBoost 补偿回 1.0
      rayleigh: [5.802e-6, 13.558e-6, 33.1e-6], mie: 3.996e-6, mieG: 0.76, multiplier: 0.66,
      interiorBoost: 1.52, // ≈1/0.66：补偿 multiplier 降低对地表/低空无散射天空亮度的影响
    },
    textures: { map: 'earth_day.jpg', night: 'earth_night.jpg', clouds: 'earth_clouds.jpg' },
    desc: '已知唯一存在生命的行星。71% 表面被液态水覆盖，氮氧大气，一颗大卫星稳定着自转轴。你的家园。',
  },
  mars: {
    id: 'mars', nameZh: '火星', nameEn: 'Mars', type: 'rocky', parent: 'sun',
    radiusKm: 3389.5, gm: 4.282837e4, oblateness: 0.00589,
    rotation: 'iau', landable: true,
    surface: { ampKm: 8, roughness: 0.6, craters: 0.6, palette: 'mars' },
    atmosphere: {
                        groundAlbedo: 0.2,
                        ozone: 0.12,
      // 白昼：Rayleigh 红>蓝（模拟尘埃主导的黄褐色调）+ Mie 漫射 → 奶油黄褐色天空。
      // 日落：Fe₂O₃ 尘埃（~1.5 µm）分光 mieG 使蓝光前向散射峰远强于红光，
      //       太阳周围形成标志性蓝色/青色光晕——Curiosity Sol-956、Perseverance Sol-257 实拍印证。
      heightKm: 80, rayleighScaleKm: 11.1, mieScaleKm: 9,
      // Rayleigh 保持物理量级（CO₂ 稀薄大气，太空看仅极薄气雾）
      rayleigh: [5.0e-7, 3.0e-7, 1.2e-7],
      // betaM [R,G,B]：蓝光消光略高，对应 ~1.5µm 尘埃的 Mie 消光谱
      mie: [1.2e-6, 1.5e-6, 1.8e-6],
      // mieG [R,G,B]：物理合理范围（实测 Fe₂O₃ g≈0.55–0.75），蓝通道峰略尖产生蓝色日落光晕
      mieG: [0.60, 0.65, 0.72],
      multiplier: 3.0,
      haze: 0.70,   // 较高尘埃雾霾：地平线橘黄色带 + 大气纵深感
      // 分离式 interiorBoost：仅在相机进入大气内部后生效，探索模式太空视角完全不受影响
      // uBoost（Rayleigh）= 8 → 白昼天空明亮琥珀色（地球参考级亮度的约 1/4）
      // uBoostM（Mie）= 1.5 → 适度前向散射光晕，太阳盘面仍清晰可见
      interiorBoost: 8,
      interiorBoostM: 1.5,
    },
    textures: { map: 'mars.jpg' },
    desc: '红色行星。拥有太阳系最高的火山（奥林帕斯山 21.9 km）与最长的峡谷（水手谷 4000 km）。稀薄 CO₂ 大气，尘暴可席卷全球。',
  },
  jupiter: {
    id: 'jupiter', nameZh: '木星', nameEn: 'Jupiter', type: 'gas', parent: 'sun',
    // 赤道半径（1 bar 层），不是体积平均半径——见文件顶部「半径口径」说明
    radiusKm: 71492, gm: 1.26686534e8, oblateness: 0.06487,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 350, rayleighScaleKm: 27, mieScaleKm: 27,
      rayleigh: [4e-7, 3.5e-7, 2.5e-7], mie: 3e-7, mieG: 0.7, multiplier: 0.8,
    },
    // 木星暗环：Halo 1.40–1.71 R_J、Main 1.72–1.81 R_J、Amalthea/Thebe Gossamer 至 3.11 R_J。
    // 与土星环完全不同：由微米级尘埃构成，光学深度 ~10⁻⁶，正面几乎不可见，
    // 逆光（伽利略号）才显形——所以 diffuse 取得极低，不能套用天王星的基底。
    rings: { innerKm: 100000, outerKm: 222000, texture: null, opacity: 0.18, diffuse: 0.004,
      tint: [0.62, 0.55, 0.48],
      narrow: [
        [111000, 22000, 0.006],   // Halo（垂直方向很厚的弥漫晕）
        [126000, 6400, 0.014],    // Main（薄而密，木星环里最亮的一层）
        [155000, 52000, 0.005],   // Amalthea Gossamer
        [202000, 40000, 0.003],   // Thebe Gossamer
      ] },
    textures: { map: 'jupiter.jpg' },
    desc: '太阳系最大的行星，质量为其他行星总和的 2.5 倍。大红斑是持续数百年的反气旋风暴。强磁场与致命辐射带环绕。',
  },
  saturn: {
    id: 'saturn', nameZh: '土星', nameEn: 'Saturn', type: 'gas', parent: 'sun',
    radiusKm: 60268, gm: 3.7931187e7, oblateness: 0.09796,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 300, rayleighScaleKm: 40, mieScaleKm: 40,
      rayleigh: [3.5e-7, 3.0e-7, 2.0e-7], mie: 2.5e-7, mieG: 0.7, multiplier: 0.8,
    },
    // tint 接近中性偏亮：真实环以水冰为主呈亮灰白色（卡西尼实拍），
    // 旧值 [1.35,1.16,0.88] 暖棕化过度，整环呈现均一黄褐
    rings: { innerKm: 74500, outerKm: 140220, texture: 'saturn_ring.png', tint: [1.18, 1.15, 1.06] },
    textures: { map: 'saturn.jpg' },
    desc: '拥有壮丽冰质环系的气态巨行星，密度低于水。环厚度平均仅约 20 米，却宽达数万公里。',
  },
  uranus: {
    id: 'uranus', nameZh: '天王星', nameEn: 'Uranus', type: 'ice', parent: 'sun',
    radiusKm: 25559, gm: 5.793939e6, oblateness: 0.02293,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 250, rayleighScaleKm: 28, mieScaleKm: 28,
      rayleigh: [2.0e-7, 3.2e-7, 3.6e-7], mie: 1.5e-7, mieG: 0.65, multiplier: 0.9,
    },
    rings: { innerKm: 37000, outerKm: 51140, texture: null, opacity: 0.55, tint: [0.45, 0.45, 0.48],
      // 真实窄环结构（中心半径 km、宽度 km、相对光学深度）：主环 6/5/4/α/β/η/γ/δ/ε
      narrow: [
        [41837, 2, 0.35], [42234, 3, 0.4], [42570, 2, 0.35],  // 6, 5, 4
        [44718, 7, 0.7], [45661, 9, 0.65],                     // α, β
        [47176, 2, 0.3], [47627, 4, 0.6], [48300, 4, 0.55],    // η, γ, δ
        [51149, 45, 1.0],                                      // ε（主环，最宽最亮）
      ] },
    textures: { map: 'uranus.jpg' },
    desc: '“躺着”自转的冰巨星，自转轴倾角 98°。甲烷吸收红光使其呈现青蓝色，是太阳系最冷的行星大气（-224°C）。',
  },
  neptune: {
    id: 'neptune', nameZh: '海王星', nameEn: 'Neptune', type: 'ice', parent: 'sun',
    radiusKm: 24764, gm: 6.836529e6, oblateness: 0.01708,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 250, rayleighScaleKm: 25, mieScaleKm: 25,
      rayleigh: [1.8e-7, 2.8e-7, 4.0e-7], mie: 1.5e-7, mieG: 0.65, multiplier: 0.9,
    },
    // 海王星环系：Galle(N42) / Le Verrier(N53) / Lassell(N55 宽片) / Arago(N63) / Adams(N63)。
    // 全部极暗（τ ~10⁻⁴），但 Adams 环上有 5 段著名的弧（Courage / Liberté / Égalité / Fraternité），
    // 弧是**经度方向**的密度集中，一维径向纹理表达不了——这里只给环本体，弧仍缺失。
    rings: { innerKm: 41900, outerKm: 62980, texture: null, opacity: 0.3, diffuse: 0.004,
      tint: [0.50, 0.52, 0.60],
      narrow: [
        [41900, 2000, 0.010],     // Galle (N42)
        [53200, 113, 0.012],      // Le Verrier (N53)
        [55400, 4400, 0.006],     // Lassell (N55) 宽片
        [57600, 100, 0.009],      // Arago (N63)
        [62930, 50, 0.016],       // Adams (N63)
      ] },
    textures: { map: 'neptune.jpg' },
    desc: '最遥远的行星，通过数学计算被发现。拥有太阳系最快的风速（2100 km/h）。深邃的蓝色来自甲烷与未知的吸收物。',
  },
  pluto: {
    id: 'pluto', nameZh: '冥王星', nameEn: 'Pluto', type: 'dwarf', parent: 'sun',
    radiusKm: 1188.3, gm: 8.71e2, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 3, roughness: 0.5, craters: 0.4, palette: 'pluto' },
    textures: { map: 'pluto.jpg' },
    desc: '柯伊伯带矮行星，与冥卫一互相潮汐锁定。新视野号 2015 年掠过时发现了氮冰心形平原“斯普特尼克平原”。',
  },
};

// 主要卫星物理数据（轨道参数在 moonsData.generated.js 中由 Horizons 拟合生成）
export const MOON_PHYS = {
  moon:      { nameZh: '月球', nameEn: 'Moon', parent: 'earth', radiusKm: 1737.4, gm: 4.9048695e3,
               landable: true, surface: { ampKm: 5, roughness: 0.55, craters: 1.2, palette: 'gray' },
               textures: { map: 'moon.jpg' },
               desc: '地球唯一的天然卫星，潮汐锁定使其永远以同一面朝向地球。人类唯一踏足过的地外天体。' },
  phobos:    { nameZh: '火卫一', nameEn: 'Phobos', parent: 'mars', radiusKm: 11.27, gm: 7.087e-4,
               landable: true, shape: { dims: [27.0, 18.4, 22.0] }, // 真实土豆状（长轴指向火星）
               // 降低相对起伏：真实 Phobos 虽有大撞击坑，但程序噪声在高 roughness 下会生成尖锐山脊；
               // 目标为月球般的平滑撞击坑地貌（amp ≈ 0.4% R）。
               surface: { ampKm: 0.05, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'phobos.jpg' },
               desc: '火星的大卫星，土豆状（27×22×18 km），轨道极低（9376 km），正以每百年 1.8 米的速度向火星坠落。' },
  deimos:    { nameZh: '火卫二', nameEn: 'Deimos', parent: 'mars', radiusKm: 6.2, gm: 9.6e-5,
               landable: true, shape: { dims: [15.0, 11.0, 12.2] }, // 不规则（15×12.2×11 km）
               // 与 Phobos 同理：小天体噪声幅度按半径缩放，避免尖峰。
               surface: { ampKm: 0.03, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'deimos.jpg' },
               desc: '火星较小较远的卫星，不规则状，表面覆盖细腻尘埃层。' },
  io:        { nameZh: '木卫一', nameEn: 'Io', parent: 'jupiter', radiusKm: 1821.6, gm: 5.916e3,
               landable: true, surface: { ampKm: 4, roughness: 0.5, craters: 0.1, palette: 'io' },
               textures: { map: 'io.jpg' },
               desc: '太阳系火山活动最剧烈的天体，木星潮汐加热使其表面遍布硫磺火山，呈现披萨般的黄橙色。' },
  europa:    { nameZh: '木卫二', nameEn: 'Europa', parent: 'jupiter', radiusKm: 1560.8, gm: 3.203e3,
               landable: true, surface: { ampKm: 0.8, roughness: 0.35, craters: 0.05, palette: 'ice' },
               textures: { map: 'europa.png' },
               desc: '冰壳之下隐藏着比地球海洋总量更大的液态水海洋，是搜寻地外生命的首要目标之一。' },
  ganymede:  { nameZh: '木卫三', nameEn: 'Ganymede', parent: 'jupiter', radiusKm: 2634.1, gm: 9.887e3,
               landable: true, surface: { ampKm: 2, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'ganymede.jpg' },
               desc: '太阳系最大的卫星，比水星还大，也是唯一拥有自身磁场的卫星。' },
  callisto:  { nameZh: '木卫四', nameEn: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, gm: 7.179e3,
               landable: true, surface: { ampKm: 2.5, roughness: 0.5, craters: 1.3, palette: 'callisto' },
               textures: { map: 'callisto.jpg' },
               desc: '太阳系遭受撞击最严重的天体，表面古老的撞击坑层层叠叠，已有 40 亿年历史。' },
  mimas:     { nameZh: '土卫一', nameEn: 'Mimas', parent: 'saturn', radiusKm: 198.2, gm: 2.504,
               landable: true,
               // 降低起伏与坑缘锐度：真实 Mimas 以巨大赫歇尔坑为主，但程序 crater rim 会生成尖峰；
               // 目标为月球般平滑的撞击坑表面（amp ≈ 0.4% R）。
               surface: { ampKm: 0.8, roughness: 0.5, craters: 0.8, palette: 'gray' },
               textures: { map: 'mimas.jpg' },
               desc: '巨大的赫歇尔撞击坑使它酷似“死星”。' },
  enceladus: { nameZh: '土卫二', nameEn: 'Enceladus', parent: 'saturn', radiusKm: 252.1, gm: 7.211,
               landable: true, surface: { ampKm: 1, roughness: 0.35, craters: 0.3, palette: 'ice' },
               textures: { map: 'enceladus.jpg' },
               desc: '南极“虎纹”裂缝喷出冰羽流，形成土星 E 环，冰下海洋含有机分子。反照率接近 1，是太阳系最白的天体。' },
  tethys:    { nameZh: '土卫三', nameEn: 'Tethys', parent: 'saturn', radiusKm: 531.1, gm: 41.21,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.0, palette: 'ice' },
               textures: { map: 'tethys.jpg' },
               desc: '几乎完全由水冰构成，密度仅 0.98 g/cm³。' },
  dione:     { nameZh: '土卫四', nameEn: 'Dione', parent: 'saturn', radiusKm: 561.4, gm: 73.116,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.9, palette: 'ice' },
               textures: { map: 'dione.jpg' },
               desc: '冰崖纵横的冰质卫星，尾随半球有明亮的冰崖网络。' },
  rhea:      { nameZh: '土卫五', nameEn: 'Rhea', parent: 'saturn', radiusKm: 763.8, gm: 153.94,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.1, palette: 'ice' },
               textures: { map: 'rhea.jpg' },
               desc: '土星第二大卫星，古老而布满撞击坑的冰球。' },
  titan:     { nameZh: '土卫六', nameEn: 'Titan', parent: 'saturn', radiusKm: 2574.7, gm: 8.978e3,
               landable: true, surface: { ampKm: 1.5, roughness: 0.4, craters: 0.1, palette: 'titan' },
               textures: { map: 'titan.jpg' },
               atmosphere: { groundAlbedo: 0.10, heightKm: 200, rayleighScaleKm: 20, mieScaleKm: 30,
                             // multiplier 1.6：太空视角降低霾层盘面内散射（旧值 3.0 把橙色霾
                             // 洗成粉米色；卡西尼实拍为饱和橙黄盘）；地表橙色天空由 interiorBoost 补偿
                             // 分光 mie：tholin 霾强烈吸收蓝光（红>绿>蓝散射），
                             // 使霾层内散射呈橙色——旧值灰色 mie 把盘面洗成粉米白
                             rayleigh: [8e-7, 5e-7, 2e-7], mie: [1.6e-6, 1.2e-6, 0.7e-6], mieG: 0.7, multiplier: 1.6,
                             interiorBoost: 1.9,
                             // 地表光照穿霾色滤：tholin 橙霾把 0.1% 的残余阳光滤成橙色漫射光
                             // （Huygens 着陆实拍：整个地表场景笼罩在橙色光中）
                             groundTint: [1.0, 0.60, 0.28], groundDim: 0.9,
                             haze: 0.30 }, // 烃类烟霾（tholin），橙色近地面雾霾极厚
               desc: '唯一拥有浓密大气的卫星（1.5 倍地球气压），表面有液态甲烷的湖泊与河流，橙色烟霾笼罩全球。' },
  iapetus:   { nameZh: '土卫八', nameEn: 'Iapetus', parent: 'saturn', radiusKm: 734.5, gm: 120.51,
               landable: true, surface: { ampKm: 4, roughness: 0.55, craters: 1.0, palette: 'iapetus' },
               textures: { map: 'iapetus.jpg' },
               desc: '阴阳脸卫星：前导半球漆黑如煤，尾随半球洁白如雪，赤道上有一圈神秘的山脊。' },
  miranda:   { nameZh: '天卫五', nameEn: 'Miranda', parent: 'uranus', radiusKm: 235.8, gm: 4.4,
               landable: true,
               // Miranda 虽有维罗纳断崖，但程序噪声在高 roughness 下会生成尖锐山脊；
               // 降低为月球般的平滑撞击坑地貌（amp ≈ 0.4% R）。
               surface: { ampKm: 0.9, roughness: 0.5, craters: 0.6, palette: 'gray' },
               textures: { map: 'miranda.jpg' },
               desc: '地质最混乱的卫星，拥有太阳系最高的悬崖维罗纳断崖（20 km）。' },
  ariel:     { nameZh: '天卫一', nameEn: 'Ariel', parent: 'uranus', radiusKm: 578.9, gm: 86.4,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.7, palette: 'ice' },
               textures: { map: 'ariel.jpg' },
               desc: '天王星最亮的卫星，表面有年轻的峡谷与平原。' },
  umbriel:   { nameZh: '天卫二', nameEn: 'Umbriel', parent: 'uranus', radiusKm: 584.7, gm: 81.5,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.0, palette: 'dark' },
               textures: { map: 'umbriel.jpg' },
               desc: '天王星最暗的大卫星，古老而神秘。' },
  titania:   { nameZh: '天卫三', nameEn: 'Titania', parent: 'uranus', radiusKm: 788.4, gm: 228.2,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.8, palette: 'gray' },
               textures: { map: 'titania.jpg' },
               desc: '天王星最大的卫星，表面有巨大的断裂峡谷。' },
  oberon:    { nameZh: '天卫四', nameEn: 'Oberon', parent: 'uranus', radiusKm: 761.4, gm: 192.4,
               landable: true, surface: { ampKm: 2.5, roughness: 0.5, craters: 1.0, palette: 'gray' },
               textures: { map: 'oberon.jpg' },
               desc: '天王星最外侧的大卫星，撞击坑底有神秘暗色物质。' },
  triton:    { nameZh: '海卫一', nameEn: 'Triton', parent: 'neptune', radiusKm: 1353.4, gm: 1.428e3,
               landable: true, surface: { ampKm: 1.5, roughness: 0.4, craters: 0.2, palette: 'triton' },
               textures: { map: 'triton.jpg' },
               desc: '唯一逆行公转的大卫星——被海王星俘获的柯伊伯带天体。表面 -235°C，氮冰间歇泉喷向 8 km 高空。' },
  charon:    { nameZh: '冥卫一', nameEn: 'Charon', parent: 'pluto', radiusKm: 606.0, gm: 105.88,
               landable: true, surface: { ampKm: 3, roughness: 0.5, craters: 0.7, palette: 'gray' },
               textures: { map: 'charon.jpg' },
               desc: '相对母星比例最大的卫星（冥王星半径的一半），与冥王星互相潮汐锁定，北极有暗红色的“魔多斑”。' },
};

/** 表面重力加速度 m/s² */
/**
 * 无气天体的 Hapke 风化层测光参数（Hapke 1981 / 1986 简化式的常用形式）。
 *
 *   w      单次散射反照率（0–1）
 *   B0, h  冲日增亮（opposition surge）的幅度与角宽（弧度）
 *   g      Henyey-Greenstein 相函数不对称因子，负值 = 后向散射
 *
 * 为什么必须有这张表：真实月面在相位角趋近 0° 时亮度陡增（满月比按线性外推
 * 亮 40% 以上），这是裸眼与实拍照片里最显著的月面特征，而 Lambert 完全给不出。
 * 数值取自各类天体地基/探测器测光文献的量级，用于再现这一现象的光学行为，
 * 不追求逐波长的严格反演。
 */
export const HAPKE_PARAMS = {
  // 硅酸盐风化层：暗、后向散射强、冲日效应显著
  moon:       { w: 0.23, B0: 1.6, h: 0.06, g: -0.35 },
  mercury:    { w: 0.14, B0: 1.5, h: 0.06, g: -0.35 },
  phobos:     { w: 0.07, B0: 1.3, h: 0.06, g: -0.30 },
  deimos:     { w: 0.08, B0: 1.3, h: 0.06, g: -0.30 },
  // 硫/硅酸盐混合
  io:         { w: 0.55, B0: 1.1, h: 0.07, g: -0.30 },
  // 冰质伽利略卫星：反照率较高，冲日效应弱
  europa:     { w: 0.62, B0: 0.8, h: 0.05, g: -0.25 },
  ganymede:   { w: 0.45, B0: 0.8, h: 0.05, g: -0.25 },
  callisto:   { w: 0.22, B0: 1.0, h: 0.06, g: -0.28 },
  // 土星冰卫星：极亮（Enceladus 接近 1），冲日效应弱
  mimas:      { w: 0.70, B0: 0.7, h: 0.05, g: -0.22 },
  enceladus:  { w: 0.92, B0: 0.5, h: 0.04, g: -0.20 },
  tethys:     { w: 0.80, B0: 0.6, h: 0.05, g: -0.22 },
  dione:      { w: 0.65, B0: 0.7, h: 0.05, g: -0.24 },
  rhea:       { w: 0.72, B0: 0.7, h: 0.05, g: -0.24 },
  // 阴阳脸：这里取两半球折中值，暗区由贴图反照率承担
  iapetus:    { w: 0.45, B0: 0.9, h: 0.05, g: -0.28 },
  // 天卫：中等反照率冰岩混合
  miranda:    { w: 0.40, B0: 0.9, h: 0.05, g: -0.26 },
  ariel:      { w: 0.42, B0: 0.9, h: 0.05, g: -0.26 },
  umbriel:    { w: 0.22, B0: 1.0, h: 0.06, g: -0.28 },
  titania:    { w: 0.30, B0: 0.9, h: 0.05, g: -0.27 },
  oberon:     { w: 0.25, B0: 1.0, h: 0.06, g: -0.28 },
  // 海卫一与冥族：氮/甲烷冰，反照率较高
  triton:     { w: 0.72, B0: 0.8, h: 0.05, g: -0.25 },
  pluto:      { w: 0.45, B0: 0.9, h: 0.05, g: -0.27 },
  charon:     { w: 0.35, B0: 0.9, h: 0.05, g: -0.27 },
};

export function surfaceGravity(body) {
  return (body.gm / (body.radiusKm * body.radiusKm)) * 1000;
}

/** 行星自转周期（小时，恒星日） */
export function rotationPeriodHours(bodyId) {
  const p = { sun: 609.12, mercury: 1407.5, venus: -5832.5, earth: 23.934, mars: 24.623,
              jupiter: 9.925, saturn: 10.656, uranus: -17.24, neptune: 16.11, pluto: -153.29 };
  return p[bodyId] ?? null;
}
