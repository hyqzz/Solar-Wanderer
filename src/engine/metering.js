// 实时测光（相机的评价测光）。默认**不启用**（见 main.js 的 ?meter=1 开关）：
// 它会把整条曝光律换成"对着画面曝光"，需要逐场景标定后才适合做默认。
//
// 为什么需要：只按"相机离太阳多远"曝光，等于只知道有多少光、不知道画面里
// 是什么。真实相机（和人眼）是对着**画面内容**曝光的：对着水星会开大、太阳
// 进画面会收到最小、画面大部分是黑天时会把星空提起来。
//
// 做法：把 HDR 结果再画到一个 1×1 浮点目标，片元里取 16 点做**对数**平均
// （对数域平均 = 几何平均，避免高光主导），读回一个像素。低频采样（150ms）
// 把同步读回的停顿摊薄。
import * as THREE from 'three';

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    float acc = 0.0, wsum = 0.0;
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        // 只取画面中央 60%：主体在中间（相机的中心测光）
        vec2 uv = 0.2 + (vec2(float(x), float(y)) + 0.5) / 4.0 * 0.6;
        vec3 c = texture2D(uTex, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // **忽略近黑的背景**：一片黑天不该把曝光推满（否则主体直接过曝）。
        // 相机的评价测光同样会丢弃大片纯黑区域。
        float w = smoothstep(2e-4, 4e-3, l);
        acc += log2(max(l, 1e-6)) * w;
        wsum += w;
      }
    }
    // 整帧都是黑的（深空）：不投票，交由调用方回退到距离律
    if (wsum < 1e-3) { gl_FragColor = vec4(0.0); return; }
    gl_FragColor = vec4(acc / wsum, 0.0, 0.0, 1.0);
  }
`;

export function createMetering(renderer) {
  let rt;
  try {
    rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    });
  } catch { return null; }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const buf = new Float32Array(4);
  let ok = true;
  return {
    /** 返回 log2(画面平均亮度)；失败返回 null */
    sample(srcTex) {
      if (!ok || !srcTex) return null;
      try {
        mat.uniforms.uTex.value = srcTex;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, buf);
        renderer.setRenderTarget(prev);
        const v = buf[0];
        if (!Number.isFinite(v)) { ok = false; return null; }
        return v;
      } catch { ok = false; return null; }
    },
  };
}
