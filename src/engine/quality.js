// GPU 自适应画质（R7 #8）：
// - WebGLRenderer 以 powerPreference:'high-performance' 创建 → 多显卡系统由浏览器/驱动选独立显卡
// - 经 WEBGL_debug_renderer_info 识别实际 GPU：软件渲染/核显 → lite 档；独显/未知 → high 档
// - high 档对标 SpaceEngine 视觉（细节着色器/高步进大气/高网格），lite 档保流畅
// 必须在 buildSolarSystem 之前调用 initQuality（着色器步进数/网格密度在构建期固化）。

export const QUALITY = {
  tier: 'high',
  gpuName: '(未检测)',
  pixelRatio: 2,      // devicePixelRatio 上限
  bloomDiv: 2,        // 泛光降采样分母
  atmoN: 16,          // 大气视线步进数
  atmoNL: 6,          // 大气光照步进数
  terrainGrid: 64,    // 地形 LOD 网格边数
  anisotropy: 8,
  segHi: [96, 64],    // 大天体球段数 [宽, 高]
  segLo: [48, 32],
  detail: true,       // 行星片元程序化细节
};

const LOW_GPU = /SwiftShader|llvmpipe|Basic Render|Software|Mali-|Adreno|PowerVR|Intel(?:\(R\))?\s*(?:HD|UHD|Iris(?!\s*Xe\s*Max)|GMA)/i;
const HIGH_GPU = /NVIDIA|GeForce|Quadro|RTX|GTX|Radeon\s*(?:RX|Pro|VII)|FirePro|Arc\s*A|Apple\s*M\d/i;

export function initQuality(renderer) {
  let name = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch { /* 扩展不可用（隐私模式等）→ 保持 high + 运行时帧率兜底 */ }
  QUALITY.gpuName = name || '(不可识别)';
  // URL 强制档位：?quality=high|lite（调试/用户手动覆盖自动检测）
  const force = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
  const lite = force ? force === 'lite' : (name && LOW_GPU.test(name) && !HIGH_GPU.test(name));
  if (lite) {
    Object.assign(QUALITY, {
      tier: 'lite', pixelRatio: 1, bloomDiv: 4, atmoN: 8, atmoNL: 3,
      terrainGrid: 48, anisotropy: 2, segHi: [64, 42], segLo: [40, 28], detail: false,
    });
  }
  console.info(`[quality] GPU: ${QUALITY.gpuName} → ${QUALITY.tier} 档` +
    (lite ? '（核显/软件渲染：已降档保流畅）' : '（独显/默认：SpaceEngine 级画质）'));
  return QUALITY;
}

/** 运行时帧率兜底：high 档但持续低帧 → 一次性降低像素比并关闭细节着色器 */
export function makeFpsGuard(renderer, onDegrade) {
  let acc = 0, n = 0, lowSec = 0, done = false;
  return (dt) => {
    if (done) return;
    acc += dt; n++;
    if (acc >= 1) {
      const fps = n / acc;
      acc = 0; n = 0;
      lowSec = fps < 28 ? lowSec + 1 : 0;
      if (lowSec >= 4) {
        done = true;
        renderer.setPixelRatio(1);
        QUALITY.detail = false;
        console.warn('[quality] 持续低帧 → 自动降低像素比/关闭细节着色器');
        onDegrade?.();
      }
    }
  };
}
