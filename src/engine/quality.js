// GPU 自适应画质（R7 #8）：
// - WebGLRenderer 以 powerPreference:'high-performance' 创建 → 多显卡系统由浏览器/驱动选独立显卡
// - 经 WEBGL_debug_renderer_info 识别实际 GPU：软件渲染/核显 → lite 档；独显/未知 → high 档
// - 移动端（pointer:coarse + maxTouchPoints）强制 lite，pixelRatio 上限 1.5
// 必须在 buildSolarSystem 之前调用 initQuality（着色器步进数/网格密度在构建期固化）。

export const QUALITY = {
  tier: 'high',
  gpuName: '(未检测)',
  pixelRatio: 2,
  atmoN: 20, // #21：增加步进数改善黄昏色带与大气内散射细节
  atmoNL: 8,
  terrainGrid: 64,
  anisotropy: 8,
  segHi: [96, 64],
  segLo: [48, 32],
  detail: true,
};

/** true when running on a touch-primary device (phone/tablet) */
export let IS_MOBILE = false;

const LOW_GPU = /SwiftShader|llvmpipe|Basic Render|Software|Mali-|Adreno|PowerVR|Intel(?:\(R\))?\s*(?:HD|UHD|Iris(?!\s*Xe\s*Max)|GMA)/i;
const HIGH_GPU = /NVIDIA|GeForce|Quadro|RTX|GTX|Radeon\s*(?:RX|Pro|VII)|FirePro|Arc\s*A|Apple\s*M\d/i;

function detectMobile() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  const smallScreen = window.screen.width <= 1024 || window.screen.height <= 1024;
  return (coarse && hasTouch) || (hasTouch && smallScreen);
}

export function initQuality(renderer) {
  IS_MOBILE = detectMobile();

  let name = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch { /* 扩展不可用 → 保持 high + 运行时帧率兜底 */ }
  QUALITY.gpuName = name || '(不可识别)';

  const force = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
  // 移动端强制 lite（无视 GPU 名，避免高分屏烤机）；桌面按 GPU 识别
  const lite = force ? force === 'lite' : IS_MOBILE || (name && LOW_GPU.test(name) && !HIGH_GPU.test(name));

  if (lite) {
    const pr = IS_MOBILE ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    Object.assign(QUALITY, {
      tier: 'lite',
      pixelRatio: pr,
      atmoN: IS_MOBILE ? 8 : 12, // #21：lite 档也适当提升
      atmoNL: IS_MOBILE ? 3 : 4,
      terrainGrid: IS_MOBILE ? 32 : 48,
      anisotropy: 2,
      segHi: IS_MOBILE ? [48, 32] : [64, 42],
      segLo: IS_MOBILE ? [32, 22] : [40, 28],
      detail: false,
    });
  }

  if (IS_MOBILE) {
    document.documentElement.classList.add('touch');
  }

  console.info(`[quality] GPU: ${QUALITY.gpuName} → ${QUALITY.tier} 档` +
    (IS_MOBILE ? '（移动端：强制 lite）' : lite ? '（核显/软件渲染：已降档）' : '（独显：高画质）'));
  return QUALITY;
}

/** 运行时帧率兜底：持续低帧 → 一次性降低像素比并关闭细节着色器 */
export function makeFpsGuard(renderer, onDegrade) {
  let acc = 0, n = 0, lowSec = 0, done = false;
  return (dt) => {
    if (done) return;
    acc += dt; n++;
    if (acc >= 1) {
      const fps = n / acc;
      acc = 0; n = 0;
      // 移动端容忍更低帧率（25 fps）
      const threshold = IS_MOBILE ? 25 : 28;
      lowSec = fps < threshold ? lowSec + 1 : 0;
      if (lowSec >= (IS_MOBILE ? 3 : 4)) {
        done = true;
        renderer.setPixelRatio(1);
        QUALITY.detail = false;
        console.warn('[quality] 持续低帧 → 自动降低像素比/关闭细节着色器');
        onDegrade?.();
      }
    }
  };
}
