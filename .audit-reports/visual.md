# 视觉审查报告（visual-audit，共 10 类 34 项）

## 1. 贴图资产
- 1.1 太阳/天王星/海王星/金星贴图仅 2048×1024，近距即模糊（fetch-textures.mjs:18-31）【高】
- 1.2 贴图来源为 solarsystemscope/stevealbers 二次合成，非 SDO/LROC/JunoCam/Cassini 原始科学数据（fetch-textures.mjs:2-4,13-41）【中】
- 1.3 所有天体只有 albedo，无法线/粗糙度/位移/高光/云高贴图，PBR 靠启发式推导（builder.js:142-155, planetMaterial.js:23-53, terrain.js:232-237 roughness=0.95 固定）【高】
- 1.4 callisto 仅 1800×900（其余伽利略卫星 4K）；saturn_ring.png 8192×500 环向仅 500px【中】
- 1.5 地球夜光/云层贴图来源未说明（非 VIIRS DNB/MODIS 时相数据），无季节变化（fetch-textures.mjs:22-24）【中】

## 2. 地形
- 2.1 绝大多数天体无真实 DEM，地形为 fbm/ridged 噪声+反照率混合；仅月/火尝试 DEM（terrain.js:42-51, 121-147）【高】
- 2.2 demTiles.js 的 LOLA/MOLA URL 是占位符，首次失败即永久回退噪声（demTiles.js:24-27, 37-59, 200-219）【高】
- 2.3 地球无 DEM，海洋靠 albedo"偏蓝"启发式判定，海床为噪声（terrain.js:149-153）【中】
- 2.4 地形颜色失真：真实 albedo ×0.82 混入 18% 程序化调色板（terrain.js:181-185）【中】
- 2.5 LOD 每帧只重建 1 级，快速移动仍 pop-in（terrain.js:474-512）【中】
- 2.6 岩石为二十面体变形、撞击坑为噪声等值带，无中央峰/射纹/溅射毯（terrain.js:57-62, 326-410）【中】

## 3. 大气
- 3.1 仅单次散射，无多重散射；临边昏暗/蓝天亮度不准（atmosphere.js:132-159）【高】
- 3.2 地球大气高度仅 60 km（bodies.js:49）【中】
- 3.3 金星硫酸云无独立体渲染/米氏相位，仅 haze:0.90 近似（bodies.js:25-39, atmosphere.js:138-139）【高】
- 3.4 地球云层为 1.0035R 单层 2D 贴图球壳，无体积云/云影/云型分层（builder.js:166-173, planetMaterial.js:265-330）【高】
- 3.5 无动态天气；仅火星尘暴(Ls 噪声)与木星条带动画（planetMaterial.js:227-238, 148-172）【中】
- 3.6 木星/土星极光被移除（积分被 ACES 压白），仅剩地球/海卫一（builder.js:39-43, 56）【中】
- 3.7 海卫一大气是为画极光硬造的最小壳层（builder.js:219-226）【中】

## 4. 太阳
- 4.1 无日冕/耀斑/黑子周期/色球层/日珥；仅 2K 贴图+噪声，bloom 已移除（sun.js:2-3, 52-66, main.js:65）【高】
- 4.2 太阳动态只是 fbm 噪声时间偏移，非 SDO 时序（sun.js:37-61）【中】

## 5. 行星与环
- 5.1 大红斑未与 System III 经度对齐，随 uTime 漂移（planetMaterial.js:163-171）【中】
- 5.2 气巨条带为静态贴图+噪声，无真实纬向风/涡旋（planetMaterial.js:148-172）【中】
- 5.3 土星环为单张径向 alpha 贴图，无粒子/自阴影/相位函数/厚度（rings.js:5-103）【高】
- 5.4 天王星环仅 opacity 0.25 均匀灰盘，无窄环结构（bodies.js:113, rings.js:75-77）【中】
- 5.5 火星极冠被移除，无季节极冠（planetMaterial.js:173-184）【中】
- 5.6 地球极冠仅按日下点纬度 0.5 强度白混，非真实海冰数据（planetMaterial.js:176-183）【低】

## 6. 星空
- 6.1 银河为单张 8K 合成贴图，非 Gaia/2MASS 巡天数据（fetch-textures.mjs:32, starfield.js:165-184）【中】
- 6.2 1.1 万背景恒星固定在天球零视差，仅约 100 颗亮星有真实 3D 位置（starfield.js:186-258）【中】
- 6.3 无完整星表/自行/真实 B-V/双星，颜色仅 5 档黑体近似（starfield.js:156-158, 200-207）【低】
- 6.4 无黄道光/气辉（belts.js:2-3）【中】

## 7. 光照与色调
- 7.1 无 HDR 管线：ACES + 8bit，无 HalfFloat 帧缓冲/真实曝光单位（main.js:52-53, 63-66）【高】
- 7.2 曝光为 dSunAU^0.85 经验暗适应，非物理测光（main.js:989-991, 1122-1125）【中】
- 7.3 无 GI/行星互照/环互照/地形 AO/接触阴影，环境光仅 0.02（main.js:60-61, planetMaterial.js:185-250）【高】
- 7.4 UnrealBloomPass 已移除，日冕无法用泛光近似（main.js:65）【中】

## 8. 彗星尘埃小天体
- 8.1 彗尾为 Sprite+ConeGeometry，无尘埃尾/离子尾分离与释放模型（comets.js:56-104）【高】
- 8.2 小行星带 14k 点/柯伊伯带 9k 点/奥尔特云 4k 点，固定大小点精灵，无形状/自转/轨道演化（belts.js:33-47, 98-131）【中】
- 8.3 TNO 全部用 512×256 程序化噪声贴图，无真实影像（tnoScene.js:67-68）【中】

## 9. 视觉伪影
- 9.1 polygonOffset/depthWrite=false 掩盖排序，大角度重叠仍有伪影（terrain.js:236-237, planetMaterial.js:275, rings.js:44, atmosphere.js:51）【中】
- 9.2 远距行星用 Sprite glint，非真实 disk+相位角（builder.js:189-191, 397-399）【中】
- 9.3 卫星 LOD 在 3 亿 km 硬切 visible，无过渡（builder.js:401-407）【低】

## 10. 硬编码近似
- 10.1 日食阴影仅覆盖日食/月食/木星→伽利略卫星/土星→土卫六，ConeGeometry 近似半影（eclipses.js:37-89）【中】
- 10.2 旅行者/新视野位置为 2026 历元线性外推（spacecraft.js:209-286, heliosphere.js:102-120）【低】
- 10.3 日球层为 Parker 解析模型近似，非 MHD 数据（heliosphere.js:20-100）【低】
- 10.4 大量视觉参数硬编码经验值（bodies.js / atmosphere.js / planetMaterial.js 遍布）【中】
