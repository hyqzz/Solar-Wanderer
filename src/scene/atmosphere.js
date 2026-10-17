// 物理大气散射：单次散射光线步进（Nishita 模型）。
// 相机在大气内（地表行走仰望蓝天/晨昏红霞）与大气外（太空中的蓝色弧光）共用同一射线逻辑。
// 注意：本引擎相机恒在场景原点（浮动原点），射线起点即 vec3(0)。

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { QUALITY } from '../engine/quality.js';

export function createAtmosphere(phys, auroraMode = 0) {
  const a = phys.atmosphere;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;

  // mie / mieG 均支持标量（向后兼容）与 [R,G,B] 数组（分光，用于火星蓝色日落）
  const mieArr  = Array.isArray(a.mie)  ? a.mie  : [a.mie,  a.mie,  a.mie ];
  const mieGArr = Array.isArray(a.mieG) ? a.mieG : [a.mieG, a.mieG, a.mieG];

  const uniforms = {
    uCenter: { value: new THREE.Vector3() },     // 行星中心（相机相对，km）
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uRg: { value: Rg },
    uRa: { value: Ra },
    uBetaR: { value: new THREE.Vector3(a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000) }, // m⁻¹→km⁻¹
    uBetaM: { value: new THREE.Vector3(mieArr[0] * 1000, mieArr[1] * 1000, mieArr[2] * 1000) }, // 分光 Mie (km⁻¹)
    uHR: { value: a.rayleighScaleKm },
    uHM: { value: a.mieScaleKm },
    uG: { value: new THREE.Vector3(mieGArr[0], mieGArr[1], mieGArr[2]) }, // 分光 mieG (Henyey-Greenstein 各向异性)
    uSunI: { value: 13.0 * (a.multiplier ?? 1) },
    uBoost: { value: 1.0 },  // Rayleigh 密度增幅（天空底色，高值 → 明亮白昼天空）
    uBoostM: { value: 1.0 }, // Mie 密度增幅（独立控制，低值 → 太阳盘面不被前向散射淹没）
    uHaze: { value: a.haze ?? 0.0 }, // 近地面气溶胶/尘埃雾霾（火星沙尘、金星硫酸云、泰坦烟霾）
    // 臭氧层（Chappuis 带吸收）：峰值约 25 km、半宽约 8 km 的高斯剖面。
    // 它吸收黄红多于蓝，是暮光深蓝色带与"金星带"的成因；缺了它，黄昏只会偏橙红。
    // 值 = 该天体的臭氧柱量相对地球的倍数（地球 1.0，火星约 0.1，其余 0 关闭）。
    uOzone: { value: a.ozone ?? 0.0 },
    // 地表反照率：阳光穿过整层大气打到地表后按它返回一部分。
    // 这是低空天空偏亮、雪原/沙漠/云顶上方整片天光发白的主因，原实现完全缺失。
    // 气巨与无固体表面者取 0（没有"地面"可反弹）。
    uGroundAlbedo: { value: a.groundAlbedo ?? 0.0 },
    // 扁率（R8 #1）：气巨网格按 (1−ob) 压扁，大气求交必须用同一椭球，
    // 否则"地面辉光/遮挡"画在正球 Rg 上，与压扁的真实视边缘错开形成双边界。
    // uStretch = 1/(1−ob) − 1（沿极轴拉伸 → 椭球还原为球）；可登陆体网格未压扁 → 0（数学恒等）
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, // 行星自转轴（世界系，每帧更新）
    uStretch: { value: phys.landable ? 0 : (1 / (1 - (phys.oblateness ?? 0)) - 1) },
    // === Issue #27/#29：尘暴 + 极光 uniforms ===
    uTime: { value: 0 },            // 秒（驱动极光帘幕动画）
    uSolarActivity: { value: 0.7 }, // 太阳活动 0..1（调制极光强度）
    uAuroraMode: { value: auroraMode }, // 0=无 1=地球 2=木星 3=土星 4=海卫一
    uAuroraStrength: { value: 1.0 },    // 运行时降档置 0
    uDustStorm: { value: 0.0 },     // 火星尘暴强度 0..1（boost 雾霾）
    // 抖动幅度的曝光归一化：抖动是**为了消除 8bit 输出的条带**，幅度应当对应
    // 输出端的 1/255，而 L 要经过曝光与 ACES 才到输出端。此前抖动是加在 L 上的
    // 绝对值（1/255），在土卫六这种高曝光天体（×68）上被放大成 ±25/255 的可见
    // 噪点——整片天空都是雪花。见 sun.js 的同名 uniform。
    uInvExposure: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    // 外侧：FrontSide + depthTest 让大气只绘制在最近的 opaque 表面之前，
    // 从而被前方卫星/行星本体正确遮挡（#R15 替代方案，避免模板缓冲失效）。
    // 内侧：DoubleSide 保证相机在大气壳内部时仍能看到天空穹顶。
    side: THREE.DoubleSide,
    // A volume integral already accounts for the entire atmosphere ray. Three
    // otherwise draws transparent DoubleSide meshes twice, integrating twice.
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uRg, uRa, uHR, uHM, uSunI, uBoost, uBoostM, uHaze, uStretch;
      uniform float uOzone;
      uniform float uGroundAlbedo;
      uniform vec3 uBetaR, uBetaM, uG, uAxis; // uG 分光：蓝光前向峰更尖 → 日落蓝色光晕
      // === Issue #27/#29 uniforms ===
      uniform float uTime;
      uniform float uSolarActivity;
      uniform int uAuroraMode;    // 0=无 1=地球 2=木星 3=土星 4=海卫一
      uniform float uAuroraStrength;
      uniform float uDustStorm;
      uniform float uInvExposure;
      varying vec3 vWorldPos;

      // 沿自转轴拉伸：扁椭球 → 正球（uStretch=0 时恒等）
      vec3 stretch(vec3 p) { return p + uAxis * (dot(p, uAxis) * uStretch); }

      // 射线-椭球相交（拉伸空间内对球求交；t 参数与真实空间共享——线性映射保参数），
      // 返回 (tNear, tFar)，无交返回 (1e20, -1e20)
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 o = stretch(ro - c);
        vec3 d = stretch(rd);
        float a2 = dot(d, d);
        float b = dot(o, d);
        float det = b * b - a2 * (dot(o, o) - r * r);
        if (det < 0.0) return vec2(1e20, -1e20);
        float s = sqrt(det);
        return vec2((-b - s) / a2, (-b + s) / a2);
      }

      // 椭球高度（等效赤道尺度）
      float hAbove(vec3 p) { return length(stretch(p - uCenter)) - uRg; }

      // value-noise（极光帘幕扰动用；与行星材质同源实现保证一致性）
      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        // Outside the shell use its near face, inside use its far face. This
        // keeps one integral per pixel across the atmospheric boundary.
        bool insideShell = length(stretch(-uCenter)) < uRa;
        if (gl_FrontFacing == insideShell) discard;
        #include <logdepthbuf_fragment>
        vec3 ro = vec3(0.0);
        vec3 rd = normalize(vWorldPos);

        vec2 tA = raySphere(ro, rd, uCenter, uRa);
        if (tA.x > tA.y) discard;
        float t0 = max(tA.x, 0.0);
        float t1 = tA.y;
        vec2 tG = raySphere(ro, rd, uCenter, uRg);
        if (tG.x < tG.y && tG.x > 0.0) t1 = min(t1, tG.x);
        if (t1 <= t0) discard;

        const int N = ${QUALITY.atmoN};
        const int NL = ${QUALITY.atmoNL};
        float ds = (t1 - t0) / float(N);
        float odR = 0.0, odM = 0.0, odO = 0.0;
        float odRlit = 0.0;   // 其中落在**被阳光照到的地面**之上的那一份（见地面反弹项）
        vec3 inscR = vec3(0.0), inscM = vec3(0.0);
        vec3 auroraL = vec3(0.0); // Issue #29：极光发射累积（非散射，独立于 BetaR/BetaM）

        for (int i = 0; i < N; i++) {
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
          float h = hAbove(p);
          float dR = exp(-h / uHR) * uBoost;   // Rayleigh 密度（天空底色）
          // 近地面气溶胶层：低标高指数衰减；uBoostM 独立于 uBoost，避免前向散射淹没太阳
          // Issue #27：火星尘暴季 boost 雾霾（uDustStorm > 0 时增厚近地面尘埃层）
          float hazeEff = uHaze + uDustStorm * 0.6;
          float dM = (exp(-h / uHM) + hazeEff * exp(-h / max(uHM * 0.22, 0.5))) * uBoostM;
          odR += dR * ds;
          odM += dM * ds;
          // 该采样点脚下那片地面是否被太阳照到。地面反弹只在受照地面上成立，
          // 夜间没有直射光可反——用采样点自身的本地垂线判定，
          // 于是地表视角与轨道视角都自然成立（夜半球整片为 0）。
          odRlit += smoothstep(-0.10, 0.10, dot(uSunDir, normalize(p - uCenter))) * dR * ds;
          // 臭氧不在地表而在平流层：用峰值 25 km、半宽 8 km 的高斯层近似 Chapman 剖面
          odO += exp(-pow((h - 25.0) / 8.0, 2.0)) * ds;
          // 向太阳的光学深度
          vec2 tS = raySphere(p, uSunDir, uCenter, uRa);
          float sl = max(tS.y, 0.0) / float(NL);
          float olR = 0.0, olM = 0.0, olO = 0.0;
          bool shadowed = false;
          vec2 tSG = raySphere(p, uSunDir, uCenter, uRg * 0.998);
          if (tSG.x < tSG.y && tSG.y > 0.0 && tSG.x > 0.0) shadowed = true;
          if (!shadowed) {
            for (int j = 0; j < NL; j++) {
              vec3 q = p + uSunDir * ((float(j) + 0.5) * sl);
              float hq = hAbove(q);
              olR += exp(-hq / uHR) * sl;
              olM += exp(-hq / uHM) * sl;
              olO += exp(-pow((hq - 25.0) / 8.0, 2.0)) * sl;
            }
            // 臭氧消光系数（km⁻¹，层峰值处）：Chappuis 带在 600 nm 最强，
            // 绿端约 1/3，蓝端几乎不吸收——这正是暮光蓝色带的来源。
            vec3 betaO = vec3(1.25e-3, 4.4e-4, 2.5e-5) * uOzone;
            vec3 T = exp(-(uBetaR * (odR + olR) + uBetaM * 1.1 * (odM + olM)
                           + betaO * (odO + olO)));
            inscR += T * dR * ds;
            inscM += T * dM * ds; // 分光 Mie：保留各通道透射率，蓝光前向散射在日落处显现
          }
          // === Issue #29：极光帘幕发射 ===
          // 高纬度极光卵（~65-75°磁纬）+ 高度带（地球 60-180km，气巨更高）。
          // 帘幕效果：双尺度噪声产生垂直光带 + 时间动画。
          // uAuroraMode=0 时跳过（无极光天体）；uAuroraStrength=0 时降档关闭。
          if (uAuroraMode > 0 && uAuroraStrength > 0.001) {
            vec3 srel = stretch(p - uCenter);
            float sh = length(srel) - uRg;
            // 极光高度带：气巨 30-500km（与 300-350km 厚壳层取交集）。
            // 地球/海卫一壳层仅 60/20km——硬编码 60-180km 会整条落在壳外，
            // 采样永远为零（地球极光因此从不渲染）。薄壳按壳厚比例贴顶部分布。
            float shellH = uRa - uRg;
            float altMin, altMax;
            if (uAuroraMode == 2 || uAuroraMode == 3) { altMin = 30.0; altMax = min(500.0, shellH); }
            else { altMin = shellH * 0.35; altMax = shellH * 0.97; }
            float altF = smoothstep(altMin, altMin + (altMax - altMin) * 0.25, sh)
                       * (1.0 - smoothstep(altMax - (altMax - altMin) * 0.35, altMax, sh));
            // 磁纬度（近似为地理纬度：用自转轴方向 dot）
            float magLat = dot(normalize(srel), uAxis);
            float poleProx = abs(magLat);
            // 极光卵：极区边缘的**窄**环带。真实极光卵很窄——地球约 3–6° 宽、
            // 中心在磁纬 67° 附近（poleProx≈0.92），木星/土星更窄且更靠极
            // （余纬约 15–16°，poleProx≈0.96）。
            // 旧实现是 poleProx 0.80–0.96 的一整圈，折合 26° 宽的极冠，
            // 画出来是一大块紫斑而不是一条卵——这是土星近景最扎眼的伪影。
            float ovalC, ovalW, aGain;
            if (uAuroraMode == 1)      { ovalC = 0.920; ovalW = 0.035; aGain = 1.00; } // 地球
            else if (uAuroraMode == 2) { ovalC = 0.955; ovalW = 0.018; aGain = 0.22; } // 木星 H3+（可见光下确实拍得到，但要长曝光）
            else if (uAuroraMode == 3) { ovalC = 0.950; ovalW = 0.016; aGain = 0.035; } // 土星 H3+ 纯紫外/红外，可见光下几乎不该有
            else                       { ovalC = 0.900; ovalW = 0.040; aGain = 0.22; } // 海卫一 N2
            float oval = smoothstep(ovalC - ovalW, ovalC, poleProx)
                       * (1.0 - smoothstep(ovalC, ovalC + ovalW, poleProx));
            // 帘幕：体固坐标按半径归一 → 波长约 Rg/45 的竖直光带（地球 ~140km，
            // 木星 ~1550km）+ 时间扰动。旧版 srel*5.0 以 km 为尺度，波长 ~1km
            // 远低于步进采样率 → 混叠平均成均匀绿雾，无帘幕结构。
            float curtain1 = pnoise(srel / uRg * 28.0 + vec3(0.0, 0.0, uTime * 0.06));
            float curtain2 = pnoise(srel / uRg * 90.0 + vec3(uTime * 0.03, 0.0, 0.0));
            // 经度结构：极光卵不是均匀的一圈。真实极光是**分段的亮弧**，
            // 亚暴期间某一经度段会突然增亮并西向漂移。没有这一项时，从盘边看
            // 就是一条绕满整圈的均匀绿环（实测 earth-night 正是这样）。
            vec3 sdir = normalize(srel);
            float lonA = atan(sdir.z, sdir.x);
            // 三段弧形分布 + 缓慢漂移（周期约数分钟）
            float arcs = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(lonA * 3.0 - uTime * 0.02), 2.0);
            // 卵带的纬度位置随经度轻微摆动（磁场不是完美轴对称）
            float ovalJitter = 1.0 + 0.004 * sin(lonA * 2.0 + 1.3);
            float auroraInt = altF * oval * ovalJitter * arcs
                            * (0.12 + 0.88 * smoothstep(0.28, 0.92, curtain1))
                            * (0.55 + 0.45 * curtain2);
            auroraInt *= uSolarActivity * uAuroraStrength * aGain;
            // 只在夜面可见。极光是微弱发射光，被日光散射完全淹没：
            //  · 地球极光肉眼只在夜间可见（航天员在轨看到的也是夜弧）；
            //  · 木星/土星的 H3+ 极光是**紫外/红外**辐射，可见光下本就不该出现，
            //    哈勃那些"极光照片"是紫外合成图。
            // 旧实现给白昼面留 4% 残余——单看很弱，但它是沿视线**逐采样点累加**的，
            // 十几个采样点叠起来就成了土星北极那块显眼的紫斑。现直接归零：
            // 晨昏线处本来也就是极光的天然边界，硬边在这里是对的。
            if (!shadowed) auroraInt = 0.0;
            // 极光颜色（不同天体不同激发粒子）：
            //  地球=OI 557.7nm 绿；木星=H3+ 蓝紫；土星=H3+ 粉紫；海卫一=弱 N2 红
            vec3 aColor;
            if (uAuroraMode == 1) aColor = vec3(0.15, 1.0, 0.35);
            else if (uAuroraMode == 2) aColor = vec3(0.55, 0.35, 1.0);
            else if (uAuroraMode == 3) aColor = vec3(0.80, 0.45, 0.90);
            else aColor = vec3(0.90, 0.40, 0.30);
            // 按极光带厚度归一化（非壳层总光程）：nadīr 方向 auroraL≈aColor，
            // 临边方向光程变长自然增亮（薄发射壳的物理正确临边增亮）。
            // 旧版按 220/(t1-t0) 归一——为气巨厚壳调参，薄壳地球会爆白 5-6 倍。
            auroraL += aColor * auroraInt * ds / max(altMax - altMin, 1.0) * 0.12;
          }
        }

        float mu = dot(rd, uSunDir);
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        // 分光 Henyey-Greenstein：uG 为 vec3，蓝通道前向峰更尖，日落时产生蓝色光晕
        vec3 g2 = uG * uG;
        vec3 phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                   ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * mu, vec3(1e-6)), vec3(1.5)));

        vec3 L = uSunI * (uBetaR * phR * inscR + uBetaM * phM * inscM);
        L += auroraL; // Issue #29：极光为发射光（非散射），直接叠加到出射辐亮度
        vec3 viewT = exp(-(uBetaR * odR + uBetaM * 1.1 * odM));
        float alpha = 1.0 - dot(viewT, vec3(0.3333));

        // 多重散射近似（B3）：光学厚处的再散射能量以各向同性相位回归。
        // 能量占比 ≈ 1 − viewT（被多次散射"截留"的光）。
        //
        // 源项**不能**用路径加权的 inscR：进入视线的多次散射光来自整个天穹，
        // 而 inscR 带的是视线自身的透射率——水平视线上蓝端的透射率在 30km 内
        // 就衰到 4%，于是单次散射解在地平线附近是红黄主导的，天空出现一条
        // 橄榄色带（真实天空没有）。改用"相机处密度 × 气柱等效程长 √(2πR·H)"，
        // 保持蓝主导——真实漫射天光确实是偏蓝的。
        // 再乘受照路径占比，夜间不发光（否则夜空会自己亮起来）。
        vec3 msFrac = vec3(1.0) - viewT;
        float hCam = hAbove(ro);
        float hazeM = uHaze + uDustStorm * 0.6;
        float rhoRc = exp(-hCam / uHR) * uBoost;
        float rhoMc = (exp(-hCam / uHM) + hazeM * exp(-hCam / max(uHM * 0.22, 0.5))) * uBoostM;
        // 幅度取**各向同性极限** E/(4π)：光学厚时多次散射的天空辐亮度就是
        // 太阳辐照度除以 4π（能量守恒的必然结果），与光学厚度无关；
        // 薄大气由 msFrac² 自然压小（二阶散射 ∝ τ²）。
        // 色调用归一化的散射系数——瑞利主导偏蓝（地球），霾主导偏橙（土卫六）。
        // 色相随散射次数**去饱和**：一阶散射带的是散射系数的谱（瑞利偏蓝），
        // 但高阶散射在保守介质里最终把能量全部还回来，谱趋向入射光（白）。
        // 只按散射系数染色时，地平线（光程极长、几乎全是高阶散射）会是一条
        // 偏蓝的带——真实天空在那里恰恰是最白的。
        vec3 scatTint = uBetaR * rhoRc + uBetaM * rhoMc;
        float smax = max(max(scatTint.r, scatTint.g), scatTint.b);
        vec3 sNorm = smax > 1e-12 ? scatTint / smax : vec3(0.0);
        float msMean = (msFrac.r + msFrac.g + msFrac.b) * (1.0 / 3.0);
        sNorm = mix(sNorm, vec3(1.0), msMean);
        float litFrac = odR > 1e-6 ? odRlit / odR : 0.0;
        L += uSunI * sNorm * (1.0 / (4.0 * PI)) * msFrac * msFrac * litFrac;

        // === 地面反照率反弹 ===
        // 阳光穿过整层大气到达地表、被地表按反照率反射、再散射进视线。
        // 它让低空天空整体提亮，并在雪原/沙漠/云顶上方把天光染白——
        // 只做各向同性再散射给不出这一项。
        // 这里用视线自身的光学深度作双程近似（下行与上行各一次），
        // 并对朝向地表以下的视线加权：抬头看天时看到的主要是散射，
        // 俯视/掠视时才大量看到"地面反上来的那一份"。
        //
        // 必须乘以受照地面占比：这一项原本**完全没有昼夜判定**，
        // 于是反日点上空仍被 uSunI × groundAlbedo 照亮——实测夜空均值 RGB
        // 24/42/53，而关掉大气后只有 0.2/0.3/0.9，夜空的亮度几乎全部来自这一项。
        // 真实夜空没有直射光可反，只剩气辉（本实现未建模），应当接近全黑。
        if (uGroundAlbedo > 0.0) {
          vec3 up = normalize(uCenter - ro);          // 该点的"上"（指向行星中心）
          float below = clamp(-dot(rd, up), 0.0, 1.0);
          float groundLit = odR > 1e-6 ? odRlit / odR : 0.0;
          vec3 twoWay = exp(-(uBetaR * odR + uBetaM * 1.1 * odM) * 1.5);
          // 地面反弹的光本身要穿过整层大气才进视线，所以它**不是中性白**：
          // 短波段在路上被散射掉了。这里按该天体的 Rayleigh 分光给这一项染色
          // （地球偏蓝、火星偏赭）。不染色时它与蓝色 Rayleigh 混合，在地平线
          // 的长路径上会退化成一条棕黄色带（实测 RGB 110,101,61）。
          vec3 gTint = normalize(uBetaR + vec3(1e-9));
          vec3 groundLitCol = mix(vec3(1.0), gTint * 1.7, 0.55);
          L += uSunI * uGroundAlbedo * groundLitCol * twoWay * (0.35 + 0.65 * below) * msFrac
             * (1.0 / PI) * groundLit;
        }

        // 轻微抖动消除条带（×alpha：仅作用于有大气信号处。R8 #1 修复——
        // 旧实现无条件加在整个壳投影盘上，外太阳系高曝光下显形为以 Ra 为界的圆圈线）
        // 抖动幅度按曝光归一化（uInvExposure），使输出端的幅度恒为 ~1/255
        float dith = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5)
                   / 255.0 * uInvExposure;
        gl_FragColor = vec4(L + dith * alpha, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(Ra, 64, 48), mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = true;
  mat.userData.uniforms = uniforms;
  return mesh;
}

// ── 大气透视（aerial perspective）的 JS 实现 ────────────────────────────────
//
// 为什么需要单独一份：大气壳是 depthTest 的透明体，只填充"前方没有实体"的像素
// ——地面像素被地形完全挡住，壳层在那里贡献恒为零。于是**地形侧必须自己再做一次
// 大气透视**。原先这一步是另写的一串经验公式（fogColor = rayleigh 比例 × 0.5 ×
// day…），与壳层毫无关系：地平线的霾色和它上方天空的颜色对不上，这正是"从地面
// 看仍像游戏"最直接的来源（审计 C-4）。
//
// 这里把壳层片元着色器的单次散射积分（Rayleigh + 分光 Mie + 臭氧 + 一阶多重
// 散射 + 地面反照率反弹）在 JS 里重算一遍，返回：
//   · color   —— 视线方向的散射辐亮度 L（与着色器同单位，HDR 线性）
//   · alpha   —— 1 − 平均透射率（着色器用的同一个量）
//   · source  —— L / alpha，源函数 j/σt：光学厚时的极限辐亮度。
//                地形用 FogExp2 混向它，"远处地形 → 霾色"与天空在数学上同源。
//   · density —— 相机所在高度的消光系数（km⁻¹），FogExp2 的 ρ。
//
// 每帧只算一次（视向取相机前方），16×8 步，开销可忽略。
export function atmosphereFog(phys, opts) {
  const a = phys?.atmosphere;
  if (!a) return null;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;
  const bR = [a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000]; // m⁻¹→km⁻¹
  const mieIn = Array.isArray(a.mie) ? a.mie : [a.mie, a.mie, a.mie];
  const bM = [mieIn[0] * 1000, mieIn[1] * 1000, mieIn[2] * 1000];
  const gIn = Array.isArray(a.mieG) ? a.mieG : [a.mieG, a.mieG, a.mieG];
  const HR = a.rayleighScaleKm, HM = a.mieScaleKm;
  const haze = a.haze ?? 0;
  const ozone = a.ozone ?? 0;
  const groundAlbedo = a.groundAlbedo ?? 0;
  const boost = opts.boost ?? 1;
  const boostM = opts.boostM ?? 1;
  const hazeEff = haze + (opts.dustStorm ?? 0) * 0.6;
  const sunI = opts.sunI;

  const { altKm, up, viewDir, sunDir } = opts;
  // 相机在原点（浮动原点），行星中心在 -up·(Rg+alt)
  const cx = -up.x * (Rg + altKm), cy = -up.y * (Rg + altKm), cz = -up.z * (Rg + altKm);
  const rdx = viewDir.x, rdy = viewDir.y, rdz = viewDir.z;
  const sdx = sunDir.x, sdy = sunDir.y, sdz = sunDir.z;

  // 射线-球相交。**必须传方向**：早先这里写死了视线方向，于是"该点是否被
  // 行星挡住阳光"用的其实是视线方向——水平视线上的采样点几乎全部被判成
  // 在阴影里，受照占比归零，霾色变成纯黑（土卫六地平线是一条黑带）。
  const hitD = (ox, oy, oz, dx, dy, dz, r) => {
    const gx = ox - cx, gy = oy - cy, gz = oz - cz;
    const b = gx * dx + gy * dy + gz * dz;
    const cc = gx * gx + gy * gy + gz * gz - r * r;
    const det = b * b - cc;
    if (det < 0) return null;
    const sq = Math.sqrt(det);
    return [-b - sq, -b + sq];
  };
  const hit = (ox, oy, oz, r) => hitD(ox, oy, oz, rdx, rdy, rdz, r);
  const hAbove = (px, py, pz) => Math.hypot(px - cx, py - cy, pz - cz) - Rg;

  const shell = hit(0, 0, 0, Ra);
  if (!shell) return null;
  let t0 = Math.max(shell[0], 0), t1 = shell[1];
  const gr = hit(0, 0, 0, Rg);
  if (gr && gr[0] > 0) t1 = Math.min(t1, gr[0]);
  if (t1 <= t0) return null;

  const N = 16, NL = 8;
  const ds = (t1 - t0) / N;
  let odR = 0, odM = 0, odO = 0, odRlit = 0;
  const inscR = [0, 0, 0], inscM = [0, 0, 0];

  for (let i = 0; i < N; i++) {
    const t = t0 + (i + 0.5) * ds;
    const px = rdx * t, py = rdy * t, pz = rdz * t;
    const h = hAbove(px, py, pz);
    const dR = Math.exp(-h / HR) * boost;
    const dM = (Math.exp(-h / HM) + hazeEff * Math.exp(-h / Math.max(HM * 0.22, 0.5))) * boostM;
    odR += dR * ds;
    odM += dM * ds;
    // 采样点脚下那片地面是否受照（与着色器一致）
    const pl = Math.hypot(px - cx, py - cy, pz - cz) || 1;
    const litDot = ((px - cx) * sdx + (py - cy) * sdy + (pz - cz) * sdz) / pl;
    odRlit += Math.max(0, Math.min(1, (litDot + 0.10) / 0.20)) * dR * ds;
    odO += Math.exp(-(((h - 25) / 8) ** 2)) * ds;

    // 向太阳的光学深度
    const ts = hitD(px, py, pz, sdx, sdy, sdz, Ra);
    const shadow = hitD(px, py, pz, sdx, sdy, sdz, Rg * 0.998);
    const shadowed = !!(shadow && shadow[0] < shadow[1] && shadow[1] > 0 && shadow[0] > 0);
    if (!shadowed && ts) {
      const sl = Math.max(ts[1], 0) / NL;
      let olR = 0, olM = 0, olO = 0;
      for (let j = 0; j < NL; j++) {
        const q = (j + 0.5) * sl;
        const hq = hAbove(px + sdx * q, py + sdy * q, pz + sdz * q);
        olR += Math.exp(-hq / HR) * sl;
        olM += Math.exp(-hq / HM) * sl;
        olO += Math.exp(-(((hq - 25) / 8) ** 2)) * sl;
      }
      const betaO = [1.25e-3 * ozone, 4.4e-4 * ozone, 2.5e-5 * ozone];
      for (let k = 0; k < 3; k++) {
        const tau = bR[k] * (odR + olR) + bM[k] * 1.1 * (odM + olM) + betaO[k] * (odO + olO);
        const T = Math.exp(-tau);
        inscR[k] += T * dR * ds;
        inscM[k] += T * dM * ds;
      }
    }
  }

  const mu = rdx * sdx + rdy * sdy + rdz * sdz;
  const phR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const out = [0, 0, 0];
  const msFrac = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const g = gIn[k], g2 = g * g;
    const phM = (3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))
      / ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * g * mu, 1e-6), 1.5));
    out[k] = sunI * (bR[k] * phR * inscR[k] + bM[k] * phM * inscM[k]);
  }
  // 一阶多重散射（与着色器同一式：源项用相机处密度 × 气柱等效程长，不是路径加权的
  // inscR——见着色器里的说明，后者会让地平线变成橄榄色）
  const hCam0 = Math.max(altKm, 0);
  const rhoRc = Math.exp(-hCam0 / HR) * boost;
  const rhoMc = (Math.exp(-hCam0 / HM)
    + hazeEff * Math.exp(-hCam0 / Math.max(HM * 0.22, 0.5))) * boostM;
  const litFrac = odR > 1e-6 ? odRlit / odR : 0;
  const scatTint = [0, 0, 0];
  let smax = 0;
  for (let k = 0; k < 3; k++) {
    scatTint[k] = bR[k] * rhoRc + bM[k] * rhoMc;
    smax = Math.max(smax, scatTint[k]);
  }
  const msMean = (msFrac[0] + msFrac[1] + msFrac[2]) / 3;
  for (let k = 0; k < 3; k++) {
    const viewT = Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM));
    msFrac[k] = 1 - viewT;
    const sNorm = smax > 1e-12 ? scatTint[k] / smax : 0;
    const sMix = sNorm + (1 - sNorm) * msMean;   // 高阶散射去饱和（与着色器同式）
    out[k] += sunI * sMix * (1 / (4 * Math.PI)) * msFrac[k] * msFrac[k] * litFrac;
  }
  // 地面反照率反弹（同样只算受照地面那一份）
  if (groundAlbedo > 0) {
    const upx = -cx, upy = -cy, upz = -cz;
    const ul = Math.hypot(upx, upy, upz) || 1;
    const below = Math.max(0, Math.min(1, -(rdx * upx + rdy * upy + rdz * upz) / ul));
    const groundLit = odR > 1e-6 ? odRlit / odR : 0;
    const bm = Math.max(bR[0], bR[1], bR[2]) || 1;
    const gTint = [bR[0] / bm, bR[1] / bm, bR[2] / bm];
    for (let k = 0; k < 3; k++) {
      const gcol = 1 * (1 - 0.55) + gTint[k] * 1.7 * 0.55;
      const twoWay = Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM) * 1.5);
      out[k] += sunI * groundAlbedo * gcol * twoWay * (0.35 + 0.65 * below) * msFrac[k]
        * (1 / Math.PI) * groundLit;
    }
  }

  // 平均透射率（与着色器 alpha 同一口径）
  let meanT = 0;
  for (let k = 0; k < 3; k++) meanT += Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM));
  meanT /= 3;
  const alpha = 1 - meanT;

  // 源函数：L/α。单次散射下它恒等于 j/σt（与路径长度无关），所以薄大气也不会发散。
  const al = Math.max(alpha, 1e-3);
  const color = [out[0] / al, out[1] / al, out[2] / al];

  // FogExp2 的 ρ。它的因子是 1−exp(−(ρd)²)，与真实的 1−exp(−σd) 形状不同，
  // 没有哪个 ρ 能处处吻合；按**能见度**（Koschmieder L=3.912/σ）对齐最划算：
  // 令 1−exp(−(ρL)²)=0.98 ⇒ ρL=1.98 ⇒ ρ≈0.5σ。取 σ/2 后 20km 处两种曲线
  // 相差 <2%（0.91 vs 0.92），近场略偏清但量级正确。
  const hCam = Math.max(altKm, 0);
  let density = 0;
  for (let k = 0; k < 3; k++) {
    density += bR[k] * Math.exp(-hCam / HR) * boost
      + bM[k] * 1.1 * (Math.exp(-hCam / HM)
        + hazeEff * Math.exp(-hCam / Math.max(HM * 0.22, 0.5))) * boostM;
  }
  density /= 6;   // = σ/2，见上

  return { color, alpha, density };
}
