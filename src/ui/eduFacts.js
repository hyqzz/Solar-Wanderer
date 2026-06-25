// 科教知识库：每个天体的趣味知识卡片（"你知道吗"），在信息面板循环展示。
// 目标：玩家在探索过程中潜移默化掌握真实的天文与空间科学知识。
// 每条事实含 source 字段（NASA/IAU 来源 URL），确保科学可信度（#43）。

export const FACTS = {
  sun: [
    { text: '太阳每秒将约 6 亿吨氢聚变为氦，损失的 400 万吨质量按 E=mc² 转化为光和热。', source: 'https://science.nasa.gov/sun/' },
    { text: '光从太阳核心到达表面需要数万年（不断被吸收再发射），但从表面到地球只要 8 分 20 秒。', source: 'https://science.nasa.gov/sun/' },
    { text: '太阳活动以约 11 年为周期，极大期时黑子、耀斑和日冕物质抛射显著增多，会影响地球的电网与卫星。', source: 'https://science.nasa.gov/sun/solar-cycles/' },
    { text: '太阳已燃烧约 46 亿年，预计还将稳定燃烧约 50 亿年，之后膨胀为红巨星吞噬内行星。', source: 'https://science.nasa.gov/sun/' },
  ],
  mercury: [
    { text: '从水星看太阳只比地球上大 2.4–3.2 倍（角直径 1.1°–1.7°，随很扁的轨道变化）——但亮度高达 6–10 倍，炫目刺眼。太空中的太阳远比想象中"小"。', source: 'https://science.nasa.gov/mercury/' },
    { text: '水星的一"天"（日出到日出）长达 176 个地球日——是它一年（88 天）的两倍！这源于 3:2 自旋轨道共振。', source: 'https://science.nasa.gov/mercury/' },
    { text: '水星两极永久阴影坑中存在水冰——尽管它是离太阳最近的行星。', source: 'https://science.nasa.gov/mercury/' },
    { text: '水星轨道近日点的进动曾困扰天文学家几十年，最终由爱因斯坦广义相对论完美解释。', source: 'https://science.nasa.gov/mercury/' },
  ],
  venus: [
    { text: '金星表面气压相当于地球海下 900 米，温度 465°C 足以熔化铅——温室效应失控的极端案例。', source: 'https://science.nasa.gov/venus/' },
    { text: '金星自转方向与其他行星相反（太阳从西边升起），且自转一圈（243 天）比公转一年（225 天）还慢。', source: 'https://science.nasa.gov/venus/' },
    { text: '金星的硫酸云顶约 50 km 高处温度气压与地球地表接近，曾被设想为"云端殖民地"候选。', source: 'https://science.nasa.gov/venus/' },
    { text: '金星没有磁场，但拥有由太阳风感应产生的诱导磁层，仍能部分偏转太阳风。', source: 'https://science.nasa.gov/venus/' },
  ],
  earth: [
    { text: '地球是已知唯一表面长期存在液态水的行星——液态水存在区间被称为"宜居带"（Goldilocks Zone）。', source: 'https://science.nasa.gov/earth/' },
    { text: '地球磁场由外核液态铁的对流发电机效应产生，它偏转太阳风，保护大气不被剥离。', source: 'https://science.nasa.gov/earth/' },
    { text: '从月球看，地球的"地相"与月相恰好互补：新月时是"满地球"。', source: 'https://science.nasa.gov/earth/' },
    { text: '地球自转正以每世纪约 1.8 毫秒的速度变慢——这是月球潮汐摩擦的结果，月球也因此每年远离地球 3.8 厘米。', source: 'https://science.nasa.gov/earth/' },
  ],
  moon: [
    { text: '月球正以每年 3.8 厘米的速度远离地球——阿波罗任务留下的激光反射镜至今仍在精确测量这一数据。', source: 'https://science.nasa.gov/moon/' },
    { text: '月球的潮汐锁定使它永远以同一面朝向地球，但由于天平动，我们实际能看到月面的 59%。', source: 'https://science.nasa.gov/moon/' },
    { text: '月球可能形成于 45 亿年前一颗火星大小的天体"忒伊亚"与原始地球的大碰撞。', source: 'https://science.nasa.gov/moon/' },
    { text: '你现在跳一下试试——月球重力只有地球的 1/6，阿波罗宇航员形容走路像"慢动作蹦床"。', source: 'https://science.nasa.gov/moon/' },
  ],
  mars: [
    { text: '奥林帕斯山高 21.9 km，是珠峰的 2.5 倍——因为火星没有板块运动，火山可以在热点上持续生长。', source: 'https://science.nasa.gov/mars/' },
    { text: '火星曾有海洋与河流：好奇号与毅力号在古河床和湖底沉积物中寻找远古生命的痕迹。', source: 'https://science.nasa.gov/mars/' },
    { text: '火星大气 95% 是二氧化碳，气压不足地球 1%，液态水在表面会立刻沸腾或冻结。', source: 'https://science.nasa.gov/mars/' },
    { text: '火星的日落是蓝色的——铁氧化物尘埃对蓝光的米氏前向散射强度约为红光的 3.5 倍，日落时太阳周围形成青蓝色光晕。好奇号与毅力号均已实拍记录。', source: 'https://science.nasa.gov/mars/' },
  ],
  phobos: [
    { text: '火卫一轨道低于同步轨道，潮汐力正使它缓慢坠向火星，约 5000 万年后将解体成环或撞击火星。', source: 'https://science.nasa.gov/mars/moons/' },
    { text: '火卫一上最醒目的地貌是斯蒂克尼撞击坑，直径 9 km——几乎达到卫星本身直径的三分之一。', source: 'https://science.nasa.gov/mars/moons/' },
    { text: '火卫一表面布满平行的沟纹，可能是潮汐应力或斯蒂克尼撞击产生的裂隙。', source: 'https://science.nasa.gov/mars/moons/' },
  ],
  deimos: [
    { text: '火卫二可能是被火星俘获的小行星，表面被厚厚的尘埃覆盖。', source: 'https://science.nasa.gov/mars/moons/' },
    { text: '火卫二表面异常光滑——厚达数十米的尘埃层掩盖了撞击坑。', source: 'https://science.nasa.gov/mars/moons/' },
    { text: '火卫二公转周期约 30 小时，与火卫一一样被潮汐锁定，永远以同一面朝向火星。', source: 'https://science.nasa.gov/mars/moons/' },
  ],
  jupiter: [
    { text: '木星质量是其他七大行星总和的 2.5 倍，它的引力像"清道夫"一样保护内太阳系少受彗星撞击。', source: 'https://science.nasa.gov/jupiter/' },
    { text: '大红斑是一个持续了至少 350 年的反气旋风暴，能装下 1-2 个地球，但正在缓慢缩小。', source: 'https://science.nasa.gov/jupiter/' },
    { text: '木星辐射带强度是致命的：木卫二表面一天的辐射剂量足以杀死一个人。', source: 'https://science.nasa.gov/jupiter/' },
    { text: '木星是失败的恒星——若质量达到现在的 80 倍，核心就能点燃氢核聚变成为一颗红矮星。', source: 'https://science.nasa.gov/jupiter/' },
  ],
  io: [
    { text: '木卫一上有 400 多座活火山，是太阳系火山活动最剧烈的天体——能量来自木星潮汐的反复揉捏。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
    { text: '木卫一的火山喷发将硫和二氧化硫抛入太空，形成围绕木星的等离子环面。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
    { text: '木卫一表面因硫化合物呈现黄、橙、红色的"披萨"外观，几乎没有撞击坑——火山喷发不断翻新地表。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
  ],
  europa: [
    { text: '木卫二冰壳下的海洋水量约为地球海洋总和的两倍。NASA"欧罗巴快船"正在前往探测它的宜居性。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
    { text: '木卫二表面布满交错的冰脊与裂隙——这是冰壳在潮汐应力下反复开裂、重新冻结的痕迹。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
    { text: '哈勃望远镜曾探测到木卫二可能存在水羽流喷发，若被证实将为直接采样冰下海洋提供捷径。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
  ],
  ganymede: [
    { text: '木卫三比水星还大，是太阳系唯一拥有自身磁场的卫星，冰壳下同样隐藏着咸水海洋。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
    { text: '木卫三表面分为深色的古老地形与明亮的年轻沟纹地形两类，记录了不同的地质历史。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
    { text: '伽利略号探测器首次在木卫三周围探测到独立的磁场——这是卫星拥有磁场的直接证据。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
  ],
  callisto: [
    { text: '木卫四是太阳系撞击坑最密集的天体，40 亿年来表面几乎没有地质活动——一块太阳系的"活化石"。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
    { text: '木卫四远离木星强辐射带，是未来载人探索木星系最安全的基地候选。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
    { text: '木卫四冰壳下可能存在深达 100 km 的咸水海洋，由高压冰层与岩石核心隔开。', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
  ],
  saturn: [
    { text: '土星环 99% 以上是水冰颗粒（从微米到数米），淡黄褐色来自混入的微量硅酸盐与有机物——所以它看起来是淡金色的。', source: 'https://science.nasa.gov/saturn/' },
    { text: '土星环宽 28 万 km，平均厚度却只有约 10–20 米——按比例比一张纸还薄百倍。', source: 'https://science.nasa.gov/saturn/' },
    { text: '土星密度比水小（0.687 g/cm³），理论上能浮在足够大的水池里。', source: 'https://science.nasa.gov/saturn/' },
    { text: '土星环很"年轻"——可能只有 1 千万到 1 亿年历史，且正以"环雨"形式落入土星，未来 3 亿年内或将消失。', source: 'https://science.nasa.gov/saturn/' },
  ],
  mimas: [
    { text: '土卫一的赫歇尔撞击坑直径 139 km，达到其直径的 1/3——再大一点的撞击就会把它击碎。', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
    { text: '土卫一酷似《星球大战》中的"死星"——巨大的赫歇尔坑让它成为太阳系最具辨识度的卫星之一。', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
    { text: '土卫一的轨道与土星环卡西尼环缝有 2:1 共振关系，环缝正是它的引力"清扫"出来的。', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
  ],
  enceladus: [
    { text: '卡西尼号曾穿越土卫二的冰羽流采样，发现了氢分子和有机物——冰下海洋具备生命所需的化学能量。', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
    { text: '土卫二反照率接近 1.0，是太阳系最白的天体——新鲜冰羽流不断覆盖表面。', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
    { text: '土卫二南极的"虎纹"裂缝持续喷射冰粒和水蒸气，这些物质构成了土星的 E 环。', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
  ],
  tethys: [
    { text: '土卫三几乎完全由水冰构成，密度仅 0.98 g/cm³——比纯水还轻。', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
    { text: '土卫三表面有一条巨大的伊萨卡峡谷，长约 2000 km，几乎横跨整个星球。', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
    { text: '土卫三有两颗特洛伊卫星（土卫十三与土卫十四），分别位于其轨道前后 60° 拉格朗日点。', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
  ],
  dione: [
    { text: '土卫四尾随半球密布明亮的冰崖——高可达数百米的悬崖是冰壳断裂的痕迹。', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
    { text: '土卫四表面有细长的明亮冰沟纹（chasmata），记录了潮汐应力下的地质活动历史。', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
    { text: '土卫四与土卫二类似，可能拥有地下海洋，但证据不如土卫二确凿。', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
  ],
  rhea: [
    { text: '土卫五是土星第二大卫星，古老而布满撞击坑的冰球，表面密度仅约 1.24 g/cm³。', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
    { text: '土卫五表面有两条巨大的断裂带（因克托米斯峡谷与奥德修斯撞击坑附近），暗示早期地质活动。', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
    { text: '2008 年曾探测到土卫五可能拥有稀薄的氧气大气环——这是首次在卫星周围发现氧。', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
  ],
  titan: [
    { text: '土卫六是唯一有浓密大气的卫星（1.5 倍地球气压），表面有甲烷雨、甲烷河流和甲烷湖泊。', source: 'https://science.nasa.gov/saturn/saturn-moons/titan/' },
    { text: 'NASA"蜻蜓号"核动力旋翼机将于 2030 年代登陆土卫六，在低重力浓大气中飞行勘察。', source: 'https://science.nasa.gov/mission/dragonfly/' },
    { text: '惠更斯号探测器 2005 年登陆土卫六，是人类首次在外太阳系天体上软着陆。', source: 'https://science.nasa.gov/mission/cassini/' },
  ],
  iapetus: [
    { text: '土卫八一半漆黑一半雪白，赤道上还有一圈 13 km 高的神秘山脊——可能是远古坠落环系的残骸。', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
    { text: '土卫八前导半球的暗色物质可能来自其他卫星喷出的尘埃，被其引力缓慢吸附。', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
    { text: '土卫八赤道山脊长达 1300 km，是太阳系最独特的地形之一，其成因至今未有定论。', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
  ],
  miranda: [
    { text: '天卫五是地质最混乱的卫星，拥有太阳系最高的悬崖维罗纳断崖（约 20 km 高）。', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
    { text: '天卫五表面有三块巨大的"冕状"地形，彼此呈不同角度——可能是早期被撞击打碎后重新拼合的结果。', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
    { text: '从维罗纳断崖顶跳下，由于天卫五极低的重力，坠落到谷底需要约 10 分钟。', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
  ],
  ariel: [
    { text: '天卫一是天王星最亮的卫星，表面有年轻的峡谷与平坦的冰平原。', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
    { text: '天卫一表面布满延伸数百公里的光滑谷地，是冰火山活动流出的冰熔岩填平的结果。', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
    { text: '天卫一反照率约 0.35，是天王星五大卫星中最高的，表面以水冰为主。', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
  ],
  umbriel: [
    { text: '天卫二是天王星最暗的大卫星，表面反照率仅 0.16——古老而神秘。', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
    { text: '天卫二表面有一个神秘的明亮环状特征"荧光圈"，成因至今未明。', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
    { text: '天卫二几乎没有地质活动迹象，40 亿年来表面布满撞击坑，是一颗"冻结"的卫星。', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
  ],
  titania: [
    { text: '天卫三是天王星最大的卫星，表面有巨大的断裂峡谷系统，长达 1500 km。', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
    { text: '天卫三表面的峡谷是冰壳在内部水冻结膨胀时破裂形成的——与地球板块运动完全不同。', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
    { text: '天卫三表面有少量撞击坑，但大部分被后期地质活动改造，说明它曾经历过活跃的内部演化。', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
  ],
  oberon: [
    { text: '天卫四是天王星最外侧的大卫星，撞击坑底有神秘的暗色物质——可能是内部渗出的冰岩混合物。', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
    { text: '天卫四表面有几条巨大的断层崖，暗示早期曾经历过地质活动。', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
    { text: '天卫四因位于天王星磁层外缘，表面长期受太阳风粒子轰击，导致冰层变暗。', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
  ],
  uranus: [
    { text: '天王星躺着自转（轴倾角 98°），可能是远古一次行星级大碰撞的结果，它的季节每个长达 21 年。', source: 'https://science.nasa.gov/uranus/' },
    { text: '天王星是太阳系最冷的行星大气（−224°C），尽管海王星离太阳更远。', source: 'https://science.nasa.gov/uranus/' },
    { text: '天王星的自转方向与公转方向几乎垂直，导致其磁场也倾斜了约 60°，磁极远离地理极。', source: 'https://science.nasa.gov/uranus/' },
    { text: '天王星拥有 13 条暗淡的环系，1986 年旅行者 2 号飞掠时首次清晰拍到。', source: 'https://science.nasa.gov/uranus/' },
  ],
  neptune: [
    { text: '海王星是第一颗"算出来"的行星——1846 年勒维耶根据天王星轨道异常用纸笔预言了它的位置。', source: 'https://science.nasa.gov/neptune/' },
    { text: '海王星上的风速可达 2100 km/h，是太阳系最快的风——能量来源至今是谜。', source: 'https://science.nasa.gov/neptune/' },
    { text: '海王星的大黑斑是一个与地球大小相当的反气旋风暴，类似木星大红斑，但寿命更短。', source: 'https://science.nasa.gov/neptune/' },
    { text: '海王星 1989 年被旅行者 2 号飞掠，至今仍是唯一造访过它的探测器。', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
  ],
  triton: [
    { text: '海卫一逆行公转，是被海王星俘获的柯伊伯带天体；它表面的氮冰间歇泉能喷到 8 km 高。', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
    { text: '海卫一表面温度约 −235°C，是太阳系最冷的天体表面之一，覆盖着冻结的氮、甲烷和一氧化碳。', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
    { text: '海卫一因逆行轨道正缓慢靠近海王星，约 36 亿年后将越过洛希极限被潮汐力撕碎，可能形成海王星环。', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
  ],
  pluto: [
    { text: '冥王星的"心形"斯普特尼克平原是一片流动的氮冰冰川，每几十万年表面就更新一次。', source: 'https://science.nasa.gov/dwarf-planets/pluto/' },
    { text: '冥王星与冥卫一互相潮汐锁定——它们永远以同一面相对，像在跳一支永恒的双人舞。', source: 'https://science.nasa.gov/dwarf-planets/pluto/' },
    { text: '2006 年国际天文学联合会重新定义行星，冥王星因未能"清空轨道附近区域"被归为矮行星。', source: 'https://iau.org/news/pressreleases/detail/iau0603/' },
    { text: '新视野号 2015 年飞掠冥王星，首次揭示了它复杂的地表——冰山、冰川与红色有机物区域。', source: 'https://science.nasa.gov/mission/new-horizons/' },
  ],
  charon: [
    { text: '冥卫一半径达到冥王星的一半，两者质心位于冥王星体外——它们更像"双矮行星"系统。', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
    { text: '冥卫一北极有一片暗红色区域"魔多斑"，可能是冥王星大气逃逸的甲烷在极区冷凝并辐射变暗的结果。', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
    { text: '冥卫一表面有巨大的峡谷与裂缝，暗示其冰壳曾因内部海洋冻结膨胀而破裂。', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
  ],
  halley: [
    { text: '哈雷彗星是第一颗被预言回归的彗星（哈雷 1705 年预言）。它的彗尾物质形成每年的猎户座流星雨。', source: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
    { text: '1986 年回归时，欧空局乔托号探测器穿越彗发拍下了彗核——一个 15 km 长的"脏雪球"。', source: 'https://sci.esa.int/web/giotto' },
    { text: '哈雷彗星每 75-76 年回归一次，下次将在 2061 年 7 月掠过内太阳系。', source: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
  ],
  halebopp: [
    { text: '海尔-波普彗星 1997 年连续 18 个月肉眼可见，创下纪录；它下次回归要等约 2500 年。', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
    { text: '海尔-波普彗星的彗核估计直径约 40-60 km，是哈雷彗星的两倍以上——堪称"巨型彗星"。', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
    { text: '海尔-波普彗星曾同时展现蓝色离子尾与黄色尘埃尾两条彗尾，是 20 世纪最壮观的彗星。', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
  ],
  cg67p: [
    { text: '罗塞塔号 2014 年环绕 67P 并投放菲莱着陆器——人类首次软着陆彗核，发现了甘氨酸等生命原料分子。', source: 'https://science.nasa.gov/mission/rosetta/' },
    { text: '67P 彗核形状酷似一只"橡皮鸭"，由两个独立的天体低速碰撞融合而成。', source: 'https://science.nasa.gov/mission/rosetta/' },
    { text: '罗塞塔号在 67P 彗核上发现了水冰、一氧化碳和复杂的有机分子，为太阳系起源研究提供了关键样本。', source: 'https://science.nasa.gov/mission/rosetta/' },
  ],
  encke: [
    { text: '恩克彗星 3.3 年绕太阳一圈，是周期最短的彗星，金牛座流星雨就来自它撒下的尘埃。', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
    { text: '恩克彗星自 1819 年被发现以来已被观测到 60 多次回归，是研究彗星演化的最佳样本之一。', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
    { text: '恩克彗星正逐渐损失质量，预计在未来数千年内可能完全瓦解或变成一颗惰性小行星。', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
  ],
  voyager1: [
    { text: '旅行者 1 号携带"金唱片"，记录了地球的声音与 55 种语言的问候——它将在星际空间漂流数十亿年。', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: '1990 年旅行者 1 号在 60 亿 km 外回望拍下"暗淡蓝点"——卡尔·萨根说：那是我们唯一的家园。', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: '旅行者 1 号 2012 年穿越日球层顶，成为首个进入星际空间的人造物体。', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
  ],
  voyager2: [
    { text: '旅行者 2 号利用 176 年一遇的行星连珠完成"大旅行"，是唯一造访过全部四颗外行星的探测器。', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
    { text: '旅行者 2 号 2018 年穿越日球层顶，成为第二个进入星际空间的人造物体。', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
    { text: '旅行者 2 号是唯一近距离飞掠天王星（1986）和海王星（1989）的探测器，至今仍是这两颗行星的主要数据来源。', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
  ],
  termshock: [
    { text: '太阳风在这里从超音速（~400 km/s）骤降为亚音速——就像水槽里水流撞出的圆形驻波边界。', source: 'https://science.nasa.gov/heliophysics/' },
    { text: '旅行者 1 号于 2004 年 12 月穿越终止激波，旅行者 2 号于 2007 年紧随其后。', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: '终止激波距太阳约 80-90 AU，其位置随太阳活动 11 年周期膨胀和收缩。', source: 'https://science.nasa.gov/heliophysics/' },
  ],
  heliopause: [
    { text: '日球层顶是太阳风与星际介质的压力平衡面。旅行者号穿越时探测到等离子体密度跃升 40 倍——那一刻它真正离开了"太阳的怀抱"。', source: 'https://science.nasa.gov/heliophysics/' },
    { text: '日球层顶距太阳约 121 AU，太阳的"势力范围"到此为止，之外便是真正的星际空间。', source: 'https://science.nasa.gov/heliophysics/' },
    { text: '日球层形状并非完美球体——它像一颗"彗星"，有一条被星际风拉出的长尾。', source: 'https://science.nasa.gov/heliophysics/' },
  ],
  // ── 海外天体（TNO）─────────────────────────────────────────────────
  eris: [
    { text: '阋神星直径约 2326 km，比冥王星略大。它的发现直接导致 IAU 重新定义"行星"，冥王星因此被降级。', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
    { text: '阋神星有一颗名为"阋卫一"（Dysnomia）的卫星，通过卫星轨道精确测定了它的质量。', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
    { text: '阋神星表面覆盖氮冰与甲烷霜，反照率极高（~0.96），目前位于远日点附近，大气已冻结沉降。', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
  ],
  sedna: [
    { text: '赛德娜是太阳系已知颜色最红的天体之一，表面富含有机物（托林），轨道周期约 11400 年。', source: 'https://science.nasa.gov/resource/sedna/' },
    { text: '赛德娜近日点 76 AU 远离柯伊伯带，属于内奥尔特云或独立延伸轨道天体（ETNO），预计 2076 年到达近日点。', source: 'https://science.nasa.gov/resource/sedna/' },
    { text: '赛德娜的极远轨道（远日点约 937 AU）使它成为研究太阳系外缘与奥尔特云的关键样本。', source: 'https://science.nasa.gov/resource/sedna/' },
  ],
  makemake: [
    { text: '鸟神星是柯伊伯带最亮的天体之一，命名自复活节岛拉帕努伊神话中的创世神。', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
    { text: '鸟神星表面呈深红色，覆盖甲烷冰与乙烷，反照率约 77%，有一颗暗弱卫星 MK2。', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
    { text: '2015 年 4 月的一次掩星观测发现鸟神星可能拥有局部稀薄大气——但很快在远日点附近冻结。', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
  ],
  haumea: [
    { text: '妊神星是太阳系自转最快的大天体（自转周期仅 3.9 小时），已被离心力拉扁为橄榄球形。', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
    { text: '妊神星表面富含结晶水冰，有细小的环系和两颗卫星（嗨伊阿卡与纳马卡），命名自夏威夷生育女神。', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
    { text: '妊神星的快速自转使它呈现明显的三轴椭球形状（约 1000×750×500 km），是太阳系最"扁"的大天体。', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
  ],
  quaoar: [
    { text: '创神星是柯伊伯带经典冷天体，2023 年发现它拥有一个超出洛希极限的稠密环——挑战了行星环形成的传统理论。', source: 'https://www.nature.com/articles/s41586-022-05629-6' },
    { text: '创神星表面有甲烷、乙烷与结晶水冰，命名自美国原住民汤加瓦族创世神。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '创神星有一颗卫星"创卫一"（Weywot），通过卫星轨道估算了创神星的质量与密度。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  gonggong: [
    { text: '共工星是太阳系已知颜色最红的天体之一，富含有机物，命名自中国神话中引发洪水的水神。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '共工星是散射盘天体，近日点 33 AU，远日点 101 AU，轨道高度倾斜（30°），有一颗卫星"相柳"（Xiangliu）。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '共工星的深红色表面可能由甲烷在宇宙射线照射下形成的托林有机物造成。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  orcus: [
    { text: '亡神星是冥族小天体（plutino），与海王星处于 3:2 轨道共振，与冥王星轨道相似但相位相对。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '亡神星表面富含冰，反照率高，有一颗较大卫星"瓦内斯"（Vanth，直径约 280 km），互相潮汐锁定。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '亡神星因轨道与冥王星"镜像对称"（一个在远日点时另一个在近日点），被称为"反冥王星"。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  varuna: [
    { text: '伐楼那星是柯伊伯带较暗天体，自转周期约 6.3 小时，快速自转带来明显光变。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '伐楼那星因快速自转可能呈拉长的椭球形状，命名自印度教海洋与宇宙秩序之神。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '伐楼那星表面偏红，富含无定形碳与有机物，是研究柯伊伯带天体表面演化的代表。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  ixion: [
    { text: '伊克西翁星是冥族小天体，与海王星 3:2 轨道共振，表面偏红。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '伊克西翁星命名自希腊神话中被宙斯惩罚永远困于旋转火轮上的国王——暗合其共振轨道特性。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '伊克西翁星直径约 650 km，是较大的冥族小天体之一，但尚未被正式承认为矮行星。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  huya: [
    { text: '乌亚星是冥族小天体，3:2 轨道共振，命名自委内瑞拉瓦尤族雨神。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '乌亚星有一颗小卫星，两者互相潮汐锁定，通过卫星可精确测定其密度。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '乌亚星表面偏暗偏红，富含有机物，是典型的冥族小天体表面特征。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  salacia: [
    { text: '萨拉西亚星是柯伊伯带冷经典天体，反照率异常高（~12%），表面富含水冰。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '萨拉西亚星有一颗卫星"阿克托尔"（Actaea），命名自罗马神话海神涅普顿之妻。', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: '萨拉西亚星密度约 1.16 g/cm³，内部以水冰为主，是研究柯伊伯带天体内部结构的样本。', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  ms4: [
    { text: '2002 MS4 是柯伊伯带较大无名天体，直径约 800 km，轮廓接近球形，可能是矮行星候选。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 MS4 尚未被正式命名，表面颜色中性偏暗，是经典柯伊伯带大型天体之一。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 MS4 的自转周期和密度尚不明确，未来掩星观测有望揭示更多物理参数。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  chaos: [
    { text: '混沌星是柯伊伯带冷经典天体，命名自希腊神话中世界起源时的原始混沌状态。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '混沌星直径约 600 km，轨道近圆，是冷经典带（不扰动）原始天体的代表。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '混沌星表面颜色偏暗，保留了太阳系形成初期的原始物质。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  varda: [
    { text: '瓦尔达星是柯伊伯带天体，有一颗相对较大的卫星"伊尔玛雷"（Ilmarë）。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '瓦尔达星命名自托尔金笔下阿尔达的星辰女王维拉瓦尔达——《指环王》宇宙中的光之女神。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '瓦尔达星反照率较高（~0.4），表面以水冰为主，是高反照率柯伊伯带天体的代表。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  typhon: [
    { text: '堤丰星是散射盘天体，近日点约 17 AU（穿越海王星轨道内侧），轨道高度椭圆。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '堤丰星有一颗卫星"厄客德娜"（Echidna），命名自希腊神话中最可怕的怪物堤丰。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '堤丰星因轨道深入海王星内侧，是研究散射盘天体与木星族彗星演化关系的特殊样本。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  tx300: [
    { text: '2002 TX300 是柯伊伯带天体，反照率极高（88%），表面富含水冰，类似土卫二。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 TX300 掩星观测确认其形状近球形，直径约 286 km，是柯伊伯带最亮的天体之一。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 TX300 是"海王星外族"（Haumea 族）成员之一，可能是妊神星远古碰撞的碎片。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  ux25: [
    { text: '2002 UX25 是柯伊伯带天体，密度约 0.82 g/cm³，意味着其内部以水冰为主、岩石含量较低——在已知海外天体中属异常低密度。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 UX25 有一颗卫星，通过卫星轨道测定了它的质量与密度。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 UX25 的低密度挑战了海外天体内部结构模型——大天体通常因自压缩而密度更高。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  uk126: [
    { text: '2007 UK126 是散射盘天体，近日点约 37 AU，远日点约 109 AU，表面颜色偏红，富含有机物。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2007 UK126 有一颗卫星，通过卫星可估算其质量与密度。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2007 UK126 直径约 600 km，是散射盘中较大的天体之一，可能是矮行星候选。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  fy27: [
    { text: '2013 FY27 是散射盘天体，近日点约 30 AU，轨道倾角 33°，掩星观测显示其反照率较高。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2013 FY27 估算直径约 740 km，是已知最大的散射盘天体之一，可能是矮行星候选。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2013 FY27 有一颗卫星，通过卫星轨道可进一步约束其物理参数。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  ceto: [
    { text: '刻托星是散射盘天体，近日点约 17 AU，远日点约 187 AU，轨道周期约 1032 年。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '刻托星有一颗卫星"福耳库斯"（Phorcys），两者构成一个双星系统，命名自希腊神话中的海洋女神。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '刻托星与福耳库斯大小相近，是海外天体中少见的"等质量双星"系统。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  az84: [
    { text: '2003 AZ84 是冥族小天体，3:2 轨道共振，接近轻微的轴外椭球形状（三轴比约 1:0.7:0.6）。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2003 AZ84 通过掩星精确测定其尺寸，是已知较精确的柯伊伯带天体之一。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2003 AZ84 表面有水冰吸收带，是冥族小天体中冰含量较高的代表。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  gv9: [
    { text: '2004 GV9 是柯伊伯带冷经典天体，近圆轨道，热辐射测量估算直径约 530 km。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2004 GV9 轨道倾角 22°，属于冷经典带偏热群，表面颜色偏中性。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2004 GV9 是较大的未命名柯伊伯带天体之一，未来可能被正式命名并归为矮行星。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  rhadamanthus: [
    { text: '拉达曼提斯星是冥族小天体，3:2 轨道共振，命名自希腊神话中公正的冥界判官拉达曼提斯。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '拉达曼提斯星直径约 136 km，是较小的冥族小天体，表面偏红。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '拉达曼提斯星与冥王星同属 3:2 共振族，是研究海王星共振俘获机制的小型样本。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  qu182: [
    { text: '2005 QU182 是柯伊伯带天体，属于轨道周期约 364 年的中距群，热辐射测量估算直径约 416 km。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2005 QU182 可能是矮行星候选，表面颜色偏红，富含有机物。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2005 QU182 轨道倾角较大（约 14°），属于散射盘与经典带之间的过渡天体。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  goblin: [
    { text: '妖精星（2015 TG387）是极遥远天体（ETNO），近日点约 65 AU，远日点超过 2100 AU，轨道周期约 35600 年。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '妖精星的聚集轨道暗示第九行星（Planet Nine）可能存在的证据之一——它的远日点方向与其它 ETNO 一致。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '妖精星因在万圣节前后被发现而获昵称"Goblin"（小妖精），直径约 300 km。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  vp113: [
    { text: '拜登星（2012 VP113）是延伸散射盘天体，近日点约 80 AU——发现时是近日点最远的已知太阳系天体。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '拜登星的聚集轨道是"第九行星"假说的重要证据——多个 ETNO 的近日点方向异常聚集。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '拜登星昵称取自 V 和 P 像 VP（美国副总统 Biden），直径约 300 km。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  farout: [
    { text: 'Farout（2018 VG18）2018 年发现时为最遥远的已知太阳系天体（约 124 AU），昵称"Farout"。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Farout 估计直径约 620 km，粉红色表面暗示富含冰，轨道周期约 5645 年。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Farout 的发现进一步扩展了已知太阳系的边界，为寻找更遥远天体提供了线索。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  farfarout: [
    { text: 'FarFarOut（2018 AG37）2021 年被确认为新纪录——发现时是已知最遥远的太阳系天体（约 132 AU）。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'FarFarOut 近日点约 50 AU，远日点约 575 AU，轨道周期约 5515 年，受海王星引力影响。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'FarFarOut 直径约 350 km，因距离极远，每绕太阳一圈需要超过 5000 年。', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  // ── 星带与区域 ──────────────────────────────────────────────────────
  asteroidbelt: [
    { text: '主小行星带位于火星与木星之间（2.1–3.4 AU），包含数十万颗小天体，但总质量不到月球的 4%。', source: 'https://science.nasa.gov/solar-system/asteroids/' },
    { text: '谷神星是小行星带中唯一的矮行星，直径约 940 km，占小行星带总质量的三分之一。', source: 'https://science.nasa.gov/dwarf-planets/ceres/' },
    { text: '小行星带并非"行星爆炸"的残骸——木星的引力阻止了这些物质聚集成一颗行星。', source: 'https://science.nasa.gov/solar-system/asteroids/' },
  ],
  kuiperbelt: [
    { text: '柯伊伯带位于海王星轨道外（30–50 AU），是冰质天体的盘状结构，冥王星、妊神星等均位于其中。', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
    { text: '柯伊伯带是短周期彗星的主要来源，海王星轨道外的引力扰动将冰质天体推入内太阳系形成彗星。', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
    { text: '柯伊伯带天体保留了太阳系形成初期的原始物质，是研究行星起源的"时间胶囊"。', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
  ],
  oortcloud: [
    { text: '奥尔特云是太阳系最外层的球状彗星云团，距太阳约 2000–100000 AU，是长周期彗星的家园。', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
    { text: '奥尔特云尚未被直接观测到，其存在由长周期彗星的轨道分布推断而来。', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
    { text: '奥尔特云的外缘距太阳约 1 光年，已接近太阳引力场的边界——再往外便是星际空间。', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
  ],
  _generic: [
    { text: '太阳系所有行星加起来的质量只有太阳的 0.14%。', source: 'https://science.nasa.gov/sun/' },
    { text: '如果把太阳系缩小到一枚硬币大小（海王星轨道），最近的恒星比邻星在约 140 米外。', source: 'https://science.nasa.gov/solar-system/' },
    { text: '你看到的星光都是"过去"：木星的光走了几十分钟，比邻星的光走了 4.2 年。', source: 'https://science.nasa.gov/solar-system/' },
    { text: '太阳系正以 230 km/s 绕银河系中心运动，2.3 亿年才转一圈——上次转到这里时恐龙刚出现。', source: 'https://science.nasa.gov/solar-system/' },
  ],
};

import { LANG } from '../config.js';
import { FACTS_EN } from './contentEn.js';

/** 取天体知识卡片：非中文界面优先用英文版（es/ja/fr/de/ru 暂用英文占位），缺失回退中文。
 *  返回纯文本数组以兼容 hud.js 直接渲染（source 字段保留在数据中供未来展示）。 */
export function factsFor(id) {
  const table = (LANG === 'zh') ? FACTS : FACTS_EN;
  const arr = table[id] ?? table._generic;
  return arr.map((f) => (typeof f === 'string' ? f : f.text));
}
