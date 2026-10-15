// Procedural fallback maps publish progressively; pixel generation stays off
// the rendering thread. These maps are illustrative, not measured surface data.
import * as THREE from 'three';
import { PRESETS, proceduralMapPixels, proceduralBandsPixels } from './proceduralTextureData.js';
import { whenIdle } from '../engine/resourceQueue.js';

function textureFromPixels(pixels) {
  const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
  canvas.getContext('2d').putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function finishPixels(iterator) { let r;do{r=iterator.next();}while(!r.done);return r.value; }
export function proceduralMap(...args) { return textureFromPixels(finishPixels(proceduralMapPixels(...args))); }
export function proceduralBands(...args) { return textureFromPixels(finishPixels(proceduralBandsPixels(...args))); }
// ── 惰性生成 ─────────────────────────────────────────────────────
// 逐像素 fbm 噪声的生成成本约 0.2–0.5s/张，数十颗无贴图天体同步生成曾阻塞启动 10s+。
// 改为：启动时返回纯色占位纹理（微秒级），真实贴图在首帧渲染后逐张后台生成并换图。
const jobQueue = [];
let jobRunning = false, worker, workerFailed=false;
async function fallbackPixels(job) {
  const iterator=(job.kind==='map'?proceduralMapPixels:proceduralBandsPixels)(...job.args);
  let step;
  do {
    // Rendering can consume every idle window. One bounded batch per frame
    // guarantees progress even when requestIdleCallback would starve for 200 ms.
    // A promise resolved directly by rAF resumes before paint. Schedule the
    // CPU batch as a task after the rendering callbacks have submitted work.
    await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
    const end=performance.now()+1;
    do { step=iterator.next(); } while (!step.done&&performance.now()<end);
  } while (!step.done);
  return textureFromPixels(step.value).image;
}
async function renderJob(job) {
  if(typeof Worker==='undefined'||workerFailed)return fallbackPixels(job);
  try {
    worker??=new Worker(new URL('./proceduralWorker.js',import.meta.url),{type:'module'});
    return await new Promise((resolve,reject)=>{
      worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.bitmap);
      worker.onerror=reject;worker.postMessage({kind:job.kind,args:job.args});
    });
  } catch {
    workerFailed=true;worker?.terminate();worker=null;return fallbackPixels(job);
  }
}
async function scheduleJobs() {
  if(jobRunning)return;jobRunning=true;
  while(jobQueue.length){
    const job=jobQueue.shift();
    try {
      const image=await renderJob(job);
      await new Promise(r=>requestAnimationFrame(r));await whenIdle();
      if(!job.texture.userData.realLoaded){job.texture.image=image;job.texture.needsUpdate=true;}
      else image.close?.();
    } catch(e) { console.warn('[procedural texture]',e.message); }
  }
  jobRunning=false;
}

function placeholderTex(preset) {
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${preset.base[0]},${preset.base[1]},${preset.base[2]})`;
  ctx.fillRect(0, 0, 2, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 惰性程序化贴图：立即返回占位纹理，真实贴图后台生成后无缝替换 */
export function proceduralMapLazy(bodyId, palette = 'gray', w = 1024, h = 512) {
  const tex = placeholderTex(PRESETS[palette] ?? PRESETS.gray);
  jobQueue.push({kind:'map',args:[bodyId,palette,w,h],texture:tex});
  scheduleJobs();
  return tex;
}

/** 惰性气巨条带贴图（同上） */
export function proceduralBandsLazy(bodyId, colors, w = 1024, h = 512) {
  const mid = colors[Math.floor(colors.length / 2)];
  const tex = placeholderTex({ base: mid });
  jobQueue.push({kind:'bands',args:[bodyId,colors,w,h],texture:tex});
  scheduleJobs();
  return tex;
}
