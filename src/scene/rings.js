// 行星环：真实内外半径，径向贴图采样，受光面/背光透射，含行星本影遮挡。

import * as THREE from 'three';

export function createRings(phys, ringTex) {
  const { innerKm, outerKm, opacity = 1 } = phys.rings;
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
        float ndl = dot(vNormalW, uSunDir);
        // 受光面反射 + 背光面透射 + 冰粒掠射散射
        // （环粒子是三维冰块群，掠射阳光仍被强烈散射——分点前后环依然可见，NASA 实拍特征）
        float lit = max(ndl, 0.0) + pow(max(-ndl, 0.0), 0.7) * 0.35
                  + 0.45 * (1.0 - abs(ndl));
        // 行星本影：环上点在行星反日侧圆柱内则处于阴影
        vec3 rel = vPosW - uCenter;
        float along = dot(rel, uSunDir);
        vec3 perp = rel - along * uSunDir;
        float shadow = 1.0;
        if (along < 0.0) {
          shadow = smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, length(perp));
        }
        vec3 col = tex.rgb * uTint * (lit * shadow * uSunI * 2.2 + 0.002);
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
