// 行星环：真实内外半径，径向贴图采样，受光面/背光透射，含行星本影遮挡。

import * as THREE from 'three';

/** 无贴图窄环（天王星）：按真实环半径/宽度/光学深度生成 1D 径向 alpha 纹理 */
function makeNarrowRingTexture(innerKm, outerKm, narrow, diffuse = 0.03) {
  const W = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 1;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, 1);
  for (let i = 0; i < W; i++) {
    const r = innerKm + (i / (W - 1)) * (outerKm - innerKm);
    let a = diffuse; // 弥漫尘埃基底（木星/海王星环远暗于天王星，逐天体可配）
    for (const [rc, w, tau] of narrow) {
      const d = Math.abs(r - rc) / Math.max(w, 1);
      a += tau * Math.exp(-d * d * 2.8);
    }
    const v = Math.max(0, Math.min(255, Math.round(a * 255)));
    img.data[i * 4] = 200; img.data[i * 4 + 1] = 200; img.data[i * 4 + 2] = 205;
    img.data[i * 4 + 3] = v;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createRings(phys, ringTex) {
  const { innerKm, outerKm, opacity = 1, narrow } = phys.rings;
  // 无贴图但有窄环参数 → 程序化生成真实环结构纹理
  if (!ringTex && narrow) ringTex = makeNarrowRingTexture(innerKm, outerKm, narrow, phys.rings.diffuse);
  const SEG = 256;

  // 自定义环几何：uv.x = 径向归一化
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(innerKm * c, 0, innerKm * s, outerKm * c, 0, outerKm * s);
    uv.push(0, 0.5, 1, 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  // 环系色调：土星环为水冰+硅酸盐尘埃的淡黄褐色（NASA 卡西尼实拍），
  // 天王星环为暗炭灰（粒子覆盖深色物质）
  const tint = phys.rings.tint ?? [1, 1, 1];
  const uniforms = {
    uMap: { value: ringTex },
    uHasMap: { value: ringTex ? 1 : 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uCenter: { value: new THREE.Vector3() }, // 行星中心（相机相对）
    uPlanetR: { value: phys.radiusKm },
    uSunI: { value: 1.0 },
    uOpacity: { value: opacity },
    uTint: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vPosW;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform int uHasMap;
      uniform vec3 uSunDir;
      uniform vec3 uCenter;
      uniform float uPlanetR, uSunI, uOpacity;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vPosW;
      varying vec3 vNormalW;

      void main() {
        #include <logdepthbuf_fragment>
        vec4 tex = uHasMap == 1
          ? texture2D(uMap, vec2(vUv.x, 0.5))
          : vec4(0.55, 0.5, 0.45, 0.5);
        // ── 环系光度 ──────────────────────────────────────────────────
        // 环不是固体面，是一层**稀疏的粒子**，所以按单层粒子的 Seeliger 定律：
        //     I/F ∝ μ0/(μ0+μ) · P(α)
        // μ0 = 太阳在环面上的仰角正弦、μ = 观察者同样、α = 相位角。
        //
        // 旧实现是 max(ndl,0) + pow(max(−ndl,0),0.7)·0.35 + 0.45·(1−|ndl|)——
        // 而 vNormalW 是**环面法向**（整环相同），所以那是个与视角无关的常数：
        // 环的亮度不随观察仰角变化，也没有相位角依赖。
        // 丢掉的正是环系最著名的两个光变特征：
        //   · 仰角依赖：侧视（μ→0）时同样的受光面积被压缩到更少的像元上，环反而更亮；
        //   · 冲日增亮：相位角趋零时粒子相干背散射 + 阴影隐藏，环显著变亮。
        //     （卡西尼实测：相位角从 1° 到 0° 亮度还要再涨约三成）
        // 环面是双面的，仰角一律取绝对值。
        vec3 nrm = normalize(vNormalW);
        vec3 toCam = -normalize(vPosW - cameraPosition);   // 片元 → 相机
        float mu0 = abs(dot(nrm, uSunDir));
        float mu = abs(dot(nrm, toCam));
        float seeliger = mu0 / max(mu0 + mu, 1e-4);
        float cosA = dot(toCam, uSunDir);                  // 相位角的余弦
        float surge = 1.0 + 0.5 * exp(-(1.0 - cosA) * 25.0);   // 冲日：约 ±8° 的窄峰
        float phase = 0.55 + 0.45 * cosA                       // 缓变的背散射基线
                    + 0.9 * pow(max(-cosA, 0.0), 3.0);         // 前向散射（卡西尼背光照）
        float lit = seeliger * phase * surge;
        // 行星本影：环上点在行星反日侧圆柱内则处于阴影
        vec3 rel = vPosW - uCenter;
        float along = dot(rel, uSunDir);
        vec3 perp = rel - along * uSunDir;
        float shadow = 1.0;
        if (along < 0.0) {
          shadow = smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, length(perp));
        }
        // 前向散射已并入 phase 项，不再单独叠一层——旧实现这里还有一个
        // pow(dot(viewRay,uSunDir),8)·2.5 的额外增益，与 phase 的背散射项方向相反，
        // 两处重复计同一种物理，会把背光侧抬得过高。
        // 系数 3.2 是把 Seeliger 压低的那部分补偿回来（典型视角下 seeliger·phase ≈ 0.28，
        // 旧常数 ≈ 0.45），使整体亮度与改前一致——改的是**相对关系**，不是整体明暗。
        vec3 col = tex.rgb * uTint * (lit * shadow * uSunI * 3.2 + 0.002);
        gl_FragColor = vec4(col, tex.a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 50;
  return mesh;
}
