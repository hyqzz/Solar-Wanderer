// 星空背景：真实银河全景贴图（按银道坐标系正确定向）+ 真实星表恒星（BSC5，9096 颗）。
// 恒星以真实 3D 位置注册浮动原点——有三角视差的近星会产生可辨视差（R11）。

import * as THREE from 'three';
import { raDecToWorld, LY_KM } from '../config.js';
import { bvToRgb, magToDisplayIntensity } from '../astro/starCatalog.js';

const DEG = Math.PI / 180;
// km，背景程序化星空球半径（固定相机，零视差）。
// 直接铺到相机远平面边界内侧：天球以相机为心，半径只需落在 [近平面, 远平面] 内即可全程可见。
// 取 9e14 km（远平面 camera.far=1e15 的 90%）——即"扩展到相机最远边界外缘"，使得无论相机
// 飞到太阳系任何位置（出柯伊伯带、日球层、乃至奥尔特云），自适应近平面（最大 1e10 km）都远
// 在其内侧、绝不把整个背景天球裁掉 → 满天繁星与银河始终存在（物理正确：真实星空在数光年外，
// 太阳系内任何位置观感一致）。9e14 同时略大于最远亮星(94ly≈8.89e14 km)，使银河层始终居于最外。
// 因 sizeAttenuation:false + 相机居中，放大半径在视觉上完全不变（仅消除远距裁剪）。
const SKY_R = 9e14;
export { SKY_R };

/**
 * 程序化银河：等距柱状图，u=银经、v=银纬（与下面的球面定向一致）。
 * 结构 = 银道面高斯亮带 × 银心亮度增强 × 尘埃暗带 × 细颗粒。
 * 颜色偏暖白（银盘以老年星为主，整体偏黄白），尘埃带用低亮度而不是纯黑。
 */
function makeMilkyWayTexture() {
  if (typeof document === 'undefined') return null;
  // 2048×1024：1024×512 时每个纹素约 0.35°，放大后是肉眼可见的方块马赛克
  // （实测 earth-night 里银河整片呈像素块）。
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  // 确定性伪随机（同一张图每次一致）
  let seed = 20240611;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const angDiff = (a, b) => { let x = (a - b) % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; };
  for (let y = 0; y < H; y++) {
    const b = (0.5 - y / H) * 180;               // 银纬 −90..+90
    for (let x = 0; x < W; x++) {
      const l = x / W * 360;                     // 银经 0..360
      // 银盘：半高宽约 7°（真实银盘可见部分大致如此），外侧还有一层更淡的厚盘
      // 两层：银盘（亮、窄）+ 银晕（暗、宽）——单层指数在边界处会切出硬边
      let I = 0.40 * Math.exp(-Math.abs(b) / 9) + 0.12 * Math.exp(-Math.abs(b) / 30);
      // 银心方向（l≈0）明显更亮更大
      const dl = angDiff(l, 0);
      I *= 1 + 1.9 * Math.exp(-(dl * dl) / (52 * 52));
      // 尘埃带：沿银道面偏南 2–4° 的一条暗带，被经度调制出团块
      const dust = Math.exp(-(((b + 3.0) / 4.2) ** 2)) * (0.45 + 0.55 * (Math.sin(l * 0.09 + 1.3) ** 2));
      I *= 1 - 0.62 * dust;
      // 细颗粒：肉眼看到的是无数暗星，不是光滑渐变
      // 不加颗粒。试过三版：逐像素白噪声 → 放大后是方块；单档值噪声 → 露出格点；
      // 多倍频 fBm → 最低频的团块在近距离仍是肉眼可辨的方块。而真实的长曝光
      // 银河本来就是平滑的弥散带（颗粒来自恒星，星点由星表那一层负责）。
      // 这里只保留结构（银盘/银心/尘埃带），把"颗粒"交给星星。
      I = Math.max(0, Math.min(1, I));
      const i4 = (y * W + x) * 4;
      // 暖白偏黄（银盘色温约 5000K）
      d[i4] = Math.round(255 * I * 1.00);
      d[i4 + 1] = Math.round(255 * I * 0.955);
      d[i4 + 2] = Math.round(255 * I * 0.88);
      d[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 天空是**大范围低对比**的渐变，用最近邻/低 mip 会露出方块。
  // 显式给线性过滤 + 各向异性，保证斜视角下也不会出现马赛克。
  tex.magFilter = THREE.LinearFilter;
  // 关掉 mipmap：低对比的大渐变在斜视角下会被选到很高的 mip 层，放大后呈方块。
  // 天空球本身很近（SKY_R），没有实际的缩微需求。
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  return tex;
}

/**
 * 黄道光：沿黄道面、朝太阳方向增亮的弥散辉光（行星际尘埃散射阳光）。
 * 真实夜空中它是一条比银河更淡的锥形光锥，在日心距 30–90° 处最易见。
 * 用着色器而不是贴图：亮度依赖**太阳方向**，是时变量，贴图表达不了。
 */
function createZodiacalLight() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uIntensity: { value: 0.0012 },
    // 随星空一起淡出（见 createStarfield 里的说明）
    uFade: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    transparent: true, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform float uIntensity;
      uniform float uFade;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        // 世界系 +Y = 黄北极，所以 d.y 直接就是黄纬的正弦
        float lat = asin(clamp(d.y, -1.0, 1.0));
        float band = exp(-abs(lat) / 0.14);            // 沿黄道 ±15°
        float cosEl = dot(d, normalize(uSunDir));
        float elon = acos(clamp(cosEl, -1.0, 1.0));    // 日心距（弧度）
        // **朝太阳的锥，没有底的带。**
        //
        // 旧式 band * (0.25 + 0.75*bright) 里那个 0.25 是错的：它让黄道光在
        // **背日方向仍有 25% 亮度**，于是变成一条绕黄道一整圈的光带。真实的
        // 黄道光是一个朝太阳的锥（日心距 30–90° 最明显），背日方向暗到与背景
        // 同量级——真实比值 50:1 以上，旧写法只有 4:1。相机基本都待在黄道面
        // 附近、看行星就是沿着黄道看，所以那条带**横穿每一张太空图**。
        // 平方衰减 + 更紧的锥角，把 90° 以外压到可忽略。
        float bright = exp(-(elon * elon) / (0.85 * 0.85));
        float I = band * bright * bright * uIntensity * uFade;
        // 略偏暖白（尘埃散射略红于太阳）
        gl_FragColor = vec4(vec3(1.0, 0.965, 0.90) * I, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 96, 48), mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createStarfield(milkywayTex) {
  const group = new THREE.Group();
  const fadeMats = []; // 白昼大气内星空淡出（真实：日光散射淹没星光）
  let milkyMat = null;

  // 银河球：银道坐标定向（NGP: RA 192.8595°, Dec 27.1284°；银心: RA 266.405°, Dec −28.936°）
  //
  // **真实贴图优先，程序化只作兜底。**
  //
  // 2026-09-30 那次把仓库里的 milkyway.jpg 换成了压暗版（1.9MB → 0.53MB，均值
  // 1.4 → 0.4），随后 2026-10-17 因为"贴图均值 0/255"改成程序化生成——那是一次
  // 误诊：平均值低不等于没内容，银河本来就是一条很淡的带，亮度集中在银道面。
  // 换掉之后银河从"有尘埃结构的真实照片"变成平滑团块，材质疑色也从 0.5 降到 0.34。
  // 现在恢复 1.9MB 那张原图（与线上同一文件），程序化版本只在贴图缺失时兜底。
  milkywayTex = milkywayTex ?? makeMilkyWayTexture();
  if (milkywayTex) {
    milkywayTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: milkywayTex, side: THREE.BackSide, depthWrite: false, fog: false,
      transparent: true,
      color: new THREE.Color(0.5, 0.5, 0.55), // 与线上一致
    });
    milkyMat = mat;
    // 分段给足：银盘亮带半高宽只有 ~7°，32 段时一个面跨 5.6°——带子会被切成
    // 多边形块（实测出现一条边缘笔直的灰色色块）。128×64 后是平滑的乳白带。
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 256, 128), mat);
    const xg = raDecToWorld(266.405 * DEG, -28.936 * DEG, new THREE.Vector3()); // 银心 → 本地+X
    const zg = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3()); // NGP → 本地+Y
    // 正交化；银经向东增加映射到本地 −Z（球面UV约定），故 Z 列 = −(xg×y)
    const y = zg.clone().sub(xg.clone().multiplyScalar(zg.dot(xg))).normalize();
    const zCol = new THREE.Vector3().crossVectors(xg, y).negate();
    const m = new THREE.Matrix4().makeBasis(xg, y, zCol);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.renderOrder = -10;
    group.add(mesh);
  }

  // **星点用硬点，不用贴图。**
  //
  // 此前用一张 32×32 的径向渐变当 sprite，最暗档只有 1.7px：一张带软边的
  // 32×32 贴图被压到 1.7 像素，mipmap 平均后峰值对比度塌掉，星点变成一团
  // 半透明的灰——眼睛读成"噪点/灰渣"而不是"星"。线上是不带 map 的
  // PointsMaterial，落在屏幕上就是 1–2 像素的硬点，所以"干净清晰"。
  // 实测同一块天区：线上星点半高宽 6px、本地 14px（相对值，同一缩放）。
  // 软边在放大观察时确实更"物理"（真实星点有衍射晕），但在 1–2 像素尺度上
  // 它只会换来对比度损失——这里选择清晰。

  // ── 真实星表（BSC5，9096 颗 V ≤ 6.5）────────────────────────────────────
  // 这里是**全部**恒星，不再叠程序化假星。
  // 此前是"132 颗手写亮星 + 11900 颗虚构背景星"：手写表后半段把前面的星按坐标
  // 回收复制、只改星等（天狼星出现两次、星等 −1.46 与 2.95 并存），专名也大量错位。
  // 结果是星座形状似是而非——恰恰是"看着像真的、一对照就露"的典型。
  // 真实星表自带正确的星座形状、亮度层次与颜色，不需要再编。
  //
  // 分两层绘制，因为点尺寸在屏幕空间是常数（sizeAttenuation:false）：
  // 亮星给大一点的尺寸才像"亮星"，暗星用小尺寸避免糊成一片。
  const brightGroup = new THREE.Group(); // 注册浮动原点（posKm=[0,0,0]=日心）
  // 用命名区间而不是位置元组：写成 [size, maxMag, minMag] 这种三元组时，
  // 第二层的 min/max 极易写反，而写反的后果是条件永假——那 92 颗亮星会**静默消失**，
  // 画面照出、只是天上少了一批最该有的星（实测就栽在这里：只剩 9004 颗暗星）。
  const LAYERS = [
    // 尺寸与线上对齐（3.4 / 2.6 / 1.4）。三档而不是两档：只有两档时天狼星
    // （−1.46 等）与一颗 2.4 等星圆面一样大，只差强度——"亮星"的层次感全压在最亮档。
    { size: 3.4, lo: -Infinity, hi: 0.5 },   // 一等星及以上（天狼、老人、南门二…）
    { size: 2.6, lo: 0.5, hi: 2.0 },         // 二等
    { size: 1.4, lo: 2.0, hi: Infinity },    // 三等及以下
  ];
  const layers = [];
  for (const spec of LAYERS) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const mat = new THREE.PointsMaterial({
      size: spec.size, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = spec.size > 2 ? -8 : -9;
    brightGroup.add(pts);
    layers.push({ mat, geo, lo: spec.lo, hi: spec.hi });
  }
  // ── 暗星背景层：星表只到 V=6.5，天球的其余部分不是空的 ──────────────
  //
  // 真实的恒星计数随星等按 log N ∝ 0.6m 增长，6.5 等之外还有大量恒星——肉眼
  // 看不见，但长曝光/相机能看到，它们也正是"银河"这条带的组成。星表 9,096 颗
  // 摊到全天只有 0.22 颗/平方度；线上那 11,900 颗程序化星其实就是在近似这一层。
  // 这里按**银道面集中**生成（薄盘视角分布，|b| 特征角约 12°），既补足密度，
  // 又不把银河带洗平——各向均匀反而会把弥散带对比冲掉。
  {
    const COUNT = 11000;
    const ngp = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3());
    const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
    let s = 987654321;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const v = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < COUNT * 40) {
      const z = rnd() * 2 - 1, phi = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(phi), z, r * Math.sin(phi));
      const sinB = Math.max(-1, Math.min(1, v.dot(ngp)));
      if (rnd() > Math.exp(-Math.abs(Math.asin(sinB)) / 0.22)) continue;
      pos[n * 3] = v.x * SKY_R * 0.98;
      pos[n * 3 + 1] = v.y * SKY_R * 0.98;
      pos[n * 3 + 2] = v.z * SKY_R * 0.98;
      // 比星表那层更暗：这是"极限星等之外"的背景，只负责把天的底噪做出来
      const I = 0.22 * (0.25 + 0.75 * Math.pow(rnd(), 2.2));
      const t = rnd();
      const cr = t < 0.5 ? 1.0 : (t < 0.85 ? 1.0 : 1.0);
      const cg = t < 0.5 ? 0.95 : (t < 0.85 ? 0.92 : 0.78);
      const cb = t < 0.5 ? 0.90 : (t < 0.85 ? 0.76 : 0.56);
      col[n * 3] = cr * I; col[n * 3 + 1] = cg * I; col[n * 3 + 2] = cb * I;
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 1.4, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -9;
    brightGroup.add(pts);
  }

  brightGroup.frustumCulled = false;

  const _dir = new THREE.Vector3();
  const _rgb = [1, 1, 1];
  // 视差：距离超过 camera.far/LY_KM 的星截断到 94 ly（方向不变，视差小到不影响体验）
  const PARALLAX_LY_LIMIT = 94;

  /** 用真实星表填充各层。cat 为 null（加载失败）时星空只剩银河贴图，不报错。 */
  function setCatalog(cat) {
    if (!cat) return 0;
    const buckets = layers.map(() => ({ pos: [], col: [] }));
    for (let i = 0; i < cat.count; i++) {
      const mag = cat.mag[i];
      const li = layers.findIndex((L) => mag >= L.lo && mag < L.hi);
      if (li < 0) continue;
      raDecToWorld(cat.ra[i] * DEG, cat.dec[i] * DEG, _dir);
      // 有三角视差的用真实距离（近星产生可辨视差），没有的放到天球边缘
      const ly = cat.distLy[i] > 0 ? Math.min(cat.distLy[i], PARALLAX_LY_LIMIT) : PARALLAX_LY_LIMIT;
      const d = ly * LY_KM;
      const b = buckets[li];
      b.pos.push(_dir.x * d, _dir.y * d, _dir.z * d);
      bvToRgb(cat.bv[i], _rgb);
      // 星等 → 显示强度（物理通量 + 人眼感知压缩，见 magToDisplayIntensity）。
      // 系数把 0 等星压到 1 附近，再由加法混合与整体曝光决定最终观感。
      const I = 1.15 * magToDisplayIntensity(mag);
      b.col.push(_rgb[0] * I, _rgb[1] * I, _rgb[2] * I);
    }
    layers.forEach((L, i) => {
      const b = buckets[i];
      L.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      L.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      L.geo.computeBoundingSphere();
      L.count = b.pos.length / 3;
    });
    return cat.count;
  }

  group.frustumCulled = false;

  // 黄道光挂在同一个 group 上（一起受白昼淡出控制）
  const zodiacal = createZodiacalLight();
  group.add(zodiacal.mesh);
  // 黄道光必须与星空**同一条淡出曲线**：此前它不在 fadeMats 里，白昼/近行星时
  // 星点被淡到 2%、黄道光仍是 100%，画面就变成"星星没了、只剩一层灰雾"
  // （太空机位里非常刺眼）。
  // （ShaderMaterial 不认 opacity，用专门的 uFade）
  zodiacal.uniforms.uFade.value = 1;

  return {
    group,
    /** 太阳方向（世界系）：黄道光的亮度分布依赖它 */
    setSunDir(x, y, z) { zodiacal.uniforms.uSunDir.value.set(x, y, z); },
    brightGroup,       // 需在 main.js 中 scene.add + world.register([0,0,0], brightGroup)
    setCatalog,
    /** 各层实际绘制的恒星数（供诊断与回归断言） */
    get starCounts() { return layers.map((L) => L.count ?? 0); },
    /** f∈[0,1]：白昼大气内日光淹没星光（0=不可见） */
    setFade(f) {
      for (const m of fadeMats) m.opacity = f;
      if (milkyMat) milkyMat.opacity = f;
      zodiacal.uniforms.uFade.value = f;
      group.visible = f > 0.01;
      brightGroup.visible = f > 0.01;
    },
  };
}
