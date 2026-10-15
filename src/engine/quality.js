// 三档：Medium 给"能跑但跑不满 High"的中间档。此前只有 High/Low，
// 中端独显与高配集显只能二选一——要么掉帧，要么白白牺牲画质。
// 物理尺度、DEM 与星历三档完全一致；只有渲染工作量不同。
const MEDIUM = {
  tier: 'medium', label: 'Medium', pixelRatio: 1, atmoN: 16, atmoNL: 6,
  cloudN: 8, cloudNL: 3,
  terrainGrid: 52, anisotropy: 8, segHi: [80, 54], segLo: [44, 30],
  detail: true, textureSize: 4096, textureConcurrency: 2, shadowSize: 1536,
  rockCount: 400, targetFps: 60,
};
const HIGH = {
  tier: 'high', label: 'High', pixelRatio: 1.5, atmoN: 20, atmoNL: 8,
  cloudN: 10, cloudNL: 4,
  terrainGrid: 64, anisotropy: 8, segHi: [96, 64], segLo: [48, 32],
  detail: true, textureSize: 8192, textureConcurrency: 3, shadowSize: 2048,
  rockCount: 640, targetFps: 60,
};
const LOW = {
  tier: 'low', label: 'Low', pixelRatio: 1, atmoN: 12, atmoNL: 4,
  cloudN: 5, cloudNL: 2,
  terrainGrid: 40, anisotropy: 4, segHi: [64, 42], segLo: [40, 28],
  detail: false, textureSize: 4096, textureConcurrency: 2, shadowSize: 1024,
  rockCount: 240, targetFps: 45,
};
export const QUALITY = { ...HIGH, gpuName: '(未检测)', hardware: 'unknown', renderScale: 1 };
export let IS_MOBILE = false;

// 厂商名里常夹 (TM)/(R)：'Intel(R) Arc(TM) A770'、'Intel(R) Arc(R) A380' 都得认出来。
// 这两处曾各犯一次同样的错，所以抽成共享模式，别再各写各的。
const ARC_MODEL = String.raw`Arc\s*(?:\((?:TM|R)\)\s*)?[AB]\d`;
const APPLE_M = String.raw`Apple\s*M[1-9]`;

export function classifyGpu(name = '') {
  if (/SwiftShader|llvmpipe|Basic Render|Software|Microsoft Basic/i.test(name)) return 'software';
  // Apple 的 M 系列是独立 GPU 核（统一内存，不是集显共享带宽），性能与中端独显同级；
  // 此前它被下面那行的 /Apple/ 一并归成集显 → Low，所有现代 Mac 都被压到最低档。
  // 不带 M 编号的 'Apple GPU'（iOS）仍走集显，移动端本来也会被 IS_MOBILE 压到 Low。
  if (new RegExp(APPLE_M, 'i').test(name)) return 'discrete';
  if (new RegExp(`NVIDIA|GeForce|Quadro|RTX|GTX|Radeon\\s*(?:RX|Pro|VII|R[579]\\b)|FirePro|${ARC_MODEL}`, 'i').test(name)) {
    return 'discrete';
  }
  if (/Intel|Iris|Radeon.*Graphics|AMD.*Graphics|Apple|Mali|Adreno|PowerVR/i.test(name)) return 'integrated';
  return 'unknown';
}

export function qualityProfile(name, mobile = false, force = null) {
  const hardware = classifyGpu(name);
  // 档位选择：显式 force 优先；否则按 GPU 类别——集显/软件渲染给 Low，
  // 独显再由型号细分（见 pickDiscreteTier），移动端一律 Low 再叠加削减。
  const f = ['high', 'medium', 'low', 'lite'].includes(force) ? force : null;
  let tier = f === 'lite' ? 'low' : f;
  if (!tier) {
    if (mobile) tier = 'low';
    else if (hardware === 'discrete') tier = pickDiscreteTier(name);
    else tier = 'low';
  }
  const table = { high: HIGH, medium: MEDIUM, low: LOW };
  const profile = { ...(table[tier] ?? LOW), gpuName: name || '(不可识别)', hardware, renderScale: 1 };
  if (mobile) Object.assign(profile, { atmoN: 8, atmoNL: 3, cloudN: 3, cloudNL: 1, terrainGrid: 32,
    segHi: [48, 32], segLo: [32, 22], textureSize: 2048, rockCount: 160, targetFps: 40 });
  return profile;
}

/**
 * 独显细分档：Medium 是默认，High 只给"明确有余量"的型号。
 * 依据型号代次而非单纯厂商——旧独显（GT 系列、GCN 早期）跑 High 会掉到 45 FPS
 * 以下，而那正是 Low 的目标帧率，等于用画质换了零收益。
 * 规则分类必然不完美；运行时帧率守卫仍会继续调渲染比例（见 makeFpsGuard）。
 */
function pickDiscreteTier(name) {
  // 注意厂商名里常夹 (TM)/(R)：'Intel(R) Arc(TM) A770' 这类串必须能匹配到，
  // 否则 A770 会被误判成 medium（曾是本文件唯一被测试抓到的分类错误）。
  // Apple 只有 Pro/Max/Ultra 够 High；基础款 M1/M2/M3（8–10 核 GPU）与 GTX 1650 同级，
  // 给 High 会被体积云拖到 45 FPS 以下，正好落进 Low 的目标帧率区——用画质换零收益。
  // GTX 逐代点名而不是笼统取 9xx/10xx：GTX 960 与 GTX 980 同属 Maxwell 却差一倍算力，
  // 前者带不动体积云（归 medium），后者可以（归 high）。
  const ample = new RegExp([
    String.raw`RTX\s*[2-9]\d{3}`,                 // 全部 RTX
    String.raw`GTX\s*(?:16\d{2}|10[6-9]\d|9[78]\d)`,  // 1650/1660、1060 以上、970/980
    String.raw`Radeon\s*RX\s*(?:[5-9]\d{3}|[1-9]\d{4})`,
    ARC_MODEL,
    String.raw`Quadro\s*RTX`,
    APPLE_M + String.raw`\s*(?:Pro|Max|Ultra)`,   // 基础款 M1/M2/M3 只有 GTX 1650 级
  ].join('|'), 'i');
  return ample.test(name) ? 'high' : 'medium';
}

export function detectMobile() {
  if (typeof window === 'undefined') return false;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');
  const iPadDesktopAgent = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return mobileAgent || iPadDesktopAgent;
}

export function initQuality(renderer) {
  IS_MOBILE = detectMobile();
  let name = '';
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch { /* Hidden GPU names start conservatively; frame pacing still adapts. */ }
  const force = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
  Object.assign(QUALITY, qualityProfile(name, IS_MOBILE, force));
  if (IS_MOBILE) document.documentElement.classList.add('touch');
  console.info(`[quality] GPU: ${QUALITY.gpuName} → ${QUALITY.label} (${QUALITY.hardware})`);
  return QUALITY;
}

/** Resize HDR targets together with the drawing buffer. Ignore background/resume
 * gaps, retain each hardware profile, and use hysteresis to prevent oscillation. */
export function makeFpsGuard(renderer, onDegrade, onRestore, onResolutionChange) {
  const baseline = renderer.getPixelRatio();
  const baselineDetail = QUALITY.detail;
  const scales = [1, 0.88, 0.76, 0.65];
  let level = 0, time = 0, samples = [], lowSec = 0, highSec = 0, cooldown = 0;
  function change(next) {
    const degrading = next > level;
    level = next; lowSec = highSec = 0;
    // Integrated GPUs need a prompt second reduction during asset decoding or
    // CPU fallback generation; recovery still waits for a stable clear margin.
    cooldown = degrading && QUALITY.tier === 'low' ? 2 : 8;
    QUALITY.renderScale = scales[level];
    QUALITY.detail = baselineDetail;
    renderer.setPixelRatio(baseline * scales[level]);
    onResolutionChange?.();
    (next > 0 ? onDegrade : onRestore)?.();
  }
  return (dt) => {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.5 ||
        (typeof document !== 'undefined' && document.hidden) || renderer.xr?.isPresenting) {
      time = 0; samples = []; lowSec = highSec = 0; return;
    }
    time += dt; samples.push(dt);
    if (time < 1) return;
    const fps = samples.length / time;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
    QUALITY.fps = fps; QUALITY.p95Ms = p95 * 1000;
    time = 0; samples = []; cooldown = Math.max(0, cooldown - 1);
    // Low must react before sustained pacing drops below its usable target.
    // High retains headroom for 60 Hz rAF clocks that report just under 60 FPS.
    const slow = fps < QUALITY.targetFps * (QUALITY.tier === 'high' ? 0.9 : 1.1) || p95 > 0.04;
    lowSec = slow ? lowSec + 1 : 0;
    highSec = fps >= Math.min(58, QUALITY.targetFps * 1.2) && p95 < 0.022 ? highSec + 1 : 0;
    if (cooldown === 0 && lowSec >= 3 && level < scales.length - 1) change(level + 1);
    else if (cooldown === 0 && highSec >= 20 && level > 0) change(level - 1);
  };
}
