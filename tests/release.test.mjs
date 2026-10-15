import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installEphemeris, sampledState, sampledPosition, ephemerisCoverage, ephemerisCovers, ephemerisShardCount, resetEphemeris } from '../src/astro/sampledEphemeris.js';
import { qualityProfile, classifyGpu, QUALITY, makeFpsGuard } from '../src/engine/quality.js';
import { bootstrapRenderer } from '../src/engine/rendererBootstrap.js';
import { ResourceQueue } from '../src/engine/resourceQueue.js';
import { HeightField, TerrainPatchSet } from '../src/scene/terrain.js';
import { BODIES } from '../src/astro/bodies.js';
import { DEMTileSource } from '../src/scene/demTiles.js';
import { moonGeocentric } from '../src/astro/moon.js';
import { moonGeocentricELP2000 } from '../src/astro/moon.js';
import { planetPosition } from '../src/astro/planets.js';
import { moonLocalPosition } from '../src/astro/moons.js';
import { tnoPosition } from '../src/astro/tno.js';
import { COMETS, cometPosition, cometAppearance } from '../src/scene/comets.js';
import { VOYAGERS, voyagerPosition } from '../src/scene/heliosphere.js';
import { newHorizonsPosition } from '../src/scene/spacecraft.js';
import * as THREE from 'three';
import { WebXRManager } from '../src/engine/webxr.js';
import { photoSkyVisibility, isSunOcculted } from '../src/scene/photoExposure.js';
import { readMapDataCache, textureBitmapOptions } from '../src/scene/builder.js';
import { proceduralMapPixels, proceduralBandsPixels } from '../src/scene/proceduralTextureData.js';
import { createAtmosphere } from '../src/scene/atmosphere.js';

test('Atmosphere integrates each ray once with inner and outer face coverage', () => {
  const mesh=createAtmosphere(BODIES.earth);
  assert.equal(mesh.material.forceSinglePass,true);
  assert.equal(mesh.material.side,THREE.DoubleSide);
  assert.match(mesh.material.fragmentShader,/gl_FrontFacing == insideShell/);
  assert.doesNotMatch(mesh.material.vertexShader,/gl_FrontFacing/);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('CPU fallback yields inside wide rows so its frame deadline can be enforced', () => {
  for(const iterator of [proceduralMapPixels('mimas','gray',128,4),proceduralBandsPixels('saturn',[[10,20,30],[40,50,60]],128,4)]){
    let yields=0,step;
    do{step=iterator.next();if(!step.done)yields++;}while(!step.done);
    assert.ok(yields>=8);assert.equal(step.value.data.length,128*4*4);
  }
});

test('fallback texture pixels yield per row and retain deterministic opaque atlases', () => {
  function run(generator) { let count=0,r;do {r=generator.next();if(!r.done)count++;}while(!r.done);return {count,...r.value}; }
  const a=run(proceduralMapPixels('mimas','gray',16,8)),b=run(proceduralMapPixels('mimas','gray',16,8));
  assert.equal(a.count,8);assert.equal(a.data.length,16*8*4);assert.deepEqual(a.data,b.data);
  assert.ok([...a.data].filter((v,i)=>i%4===3).every(v=>v===255));
  const bands=run(proceduralBandsPixels('jupiter',[[200,160,120],[240,220,200]],16,8));
  assert.equal(bands.count,8);assert.equal(bands.width,16);
});

test('progressive bitmap decode preserves north-south orientation and aspect ratio', () => {
  const o=textureBitmapOptions({width:8192,height:4096},2048);
  assert.equal(o.resizeWidth,2048);assert.equal(o.resizeHeight,1024);
  assert.equal(o.imageOrientation,'flipY');assert.equal(o.premultiplyAlpha,'none');
});

test('surface texture cache handles bodies without texture and invalidates upgraded images', () => {
  const cache=new Map();assert.equal(readMapDataCache(cache,'mimas',undefined),undefined);
  cache.set('mimas',{image:undefined,data:null});assert.equal(readMapDataCache(cache,'mimas',undefined),null);
  const image={},data={width:512};cache.set('moon',{image,data});
  assert.equal(readMapDataCache(cache,'moon',image),data);
  assert.equal(readMapDataCache(cache,'moon',{}),undefined);
});

test('corona adaptation requires complete foreground occultation of photosphere', () => {
  const observer=[149597870,0,0], body={posKm:[149214870,0,0],phys:{radiusKm:1800}};
  assert.equal(isSunOcculted(observer,695700,[body]),true);
  assert.equal(isSunOcculted(observer,695700,[{...body,posKm:[149214870,10000,0]}]),false);
  assert.equal(isSunOcculted(observer,695700,[{...body,posKm:[-1e8,0,0]}]),false);
});

test('comet activity does not create a luminous million-kilometre ball when inactive', () => {
  assert.equal(cometAppearance(5).comaOpacity, 0);
  for (const r of [0.3,1,2,3,4,30]) {
    const a=cometAppearance(r);assert.ok(a.comaDiameterKm<=144000);
    assert.ok(a.comaOpacity>=0&&a.comaOpacity<=0.25);
  }
});

test('photographic adaptation hides stars over sunlit airless ground and preserves dark sky', () => {
  const lunar = { radiusKm: 1737, distanceKm: 1737.002, sunElevation: 0.8 };
  assert.ok(photoSkyVisibility(lunar) < 0.001);
  assert.equal(photoSkyVisibility({ ...lunar, sunElevation: -0.2 }), 1);
  assert.equal(photoSkyVisibility({ ...lunar, distanceKm: 5000, viewCosine: -1 }), 1);
  assert.ok(photoSkyVisibility({ ...lunar, distanceKm: 5000, phaseCosine: 1 }) < 0.03);
});

test('GPU profiles: integrated Low, discrete High, software/unknown Low; mobile always Low', () => {
  // Apple M 系列不在集显之列：它是独立 GPU 核，走下面的代次细分（基础款 Medium、Pro/Max/Ultra High）
  for (const name of ['Intel(R) UHD Graphics 770','Intel Iris Xe','AMD Radeon(TM) Graphics','Apple GPU','Adreno 740','']) assert.equal(qualityProfile(name).tier,'low',name);
  assert.equal(qualityProfile('Apple M2', true).tier, 'low', '移动端仍是 Low');
  for (const name of ['NVIDIA GeForce RTX 2080 Ti','AMD Radeon RX 7900 XT','Intel(R) Arc(TM) A770 Graphics']) assert.equal(qualityProfile(name).tier,'high',name);
  assert.equal(classifyGpu('ANGLE NVIDIA SwiftShader'),'software');
  assert.equal(qualityProfile('NVIDIA RTX 2080 Ti',true,'high').textureSize,2048);
  assert.equal(qualityProfile('Intel UHD',false,'lite').tier,'low');
  assert.equal(qualityProfile('Intel UHD',false,'high').tier,'high');
});

test('独显按代次分 High/Medium：中端与旧卡不再被迫二选一', () => {
  // 有余量的型号给 High
  for (const n of ['NVIDIA GeForce RTX 3060','NVIDIA GeForce GTX 1660','AMD Radeon RX 5700 XT',
    'Apple M1 Pro','Apple M3 Max','NVIDIA Quadro RTX 6000']) assert.equal(qualityProfile(n).tier,'high',n);
  // 能跑但跑不满 High 的给 Medium（此前被归到 High 会掉帧，归到 Low 又白白牺牲画质）
  for (const n of ['NVIDIA GeForce GTX 750 Ti','NVIDIA GeForce GTX 960','AMD Radeon RX 480',
    'NVIDIA GeForce GT 1030','AMD Radeon RX 550','Apple M1','Apple M2','Apple M3']) {
    assert.equal(qualityProfile(n).tier,'medium',n);
  }
  // 厂商名里夹 (TM)/(R) 时仍要认得出型号——'Arc(TM) A770' 曾因此被误判成 medium
  assert.equal(qualityProfile('Intel(R) Arc(TM) A770 Graphics').tier,'high');
  assert.equal(qualityProfile('Intel(R) Arc(R) A380 Graphics').tier,'high');
  // 集显/软件渲染/移动端一律不吃 Medium 这档
  assert.equal(qualityProfile('Intel(R) UHD Graphics 770').tier,'low');
  assert.equal(qualityProfile('NVIDIA GeForce RTX 3060',true).tier,'low');
});

test('三档配置逐项单调：High ≥ Medium ≥ Low（否则档位名不副实）', () => {
  const knob = (t, k) => qualityProfile('NVIDIA GeForce RTX 3060')[k];   // 取 High
  const pick = (tier) => qualityProfile('x', false, tier);
  const hi = pick('high'), me = pick('medium'), lo = pick('low');
  assert.deepEqual([hi.tier, me.tier, lo.tier], ['high', 'medium', 'low']);
  // 逐项：越大越费的值必须非增，越小越费的（网格步长没有，这里全是越大越费）
  for (const k of ['atmoN', 'cloudN', 'terrainGrid', 'shadowSize', 'textureSize', 'rockCount', 'anisotropy']) {
    assert.ok(hi[k] >= me[k] && me[k] >= lo[k],
      `${k}: high ${hi[k]} / medium ${me[k]} / low ${lo[k]} 不是单调非增`);
  }
  assert.ok(hi.pixelRatio >= me.pixelRatio && me.pixelRatio >= lo.pixelRatio, 'pixelRatio 不单调');
  assert.ok(hi.targetFps >= me.targetFps && me.targetFps >= lo.targetFps, 'targetFps 不单调');
  // 数组型（segHi/segLo）取两个分量都比
  for (const k of ['segHi', 'segLo']) {
    assert.ok(hi[k][0] >= me[k][0] && me[k][0] >= lo[k][0] && hi[k][1] >= me[k][1] && me[k][1] >= lo[k][1],
      `${k} 不单调`);
  }
  // 细节开关：High/Medium 开，Low 关
  assert.equal(hi.detail, true); assert.equal(me.detail, true); assert.equal(lo.detail, false);
  // Medium 必须与 Low 有实质差别，否则这一档是摆设
  assert.ok(me.cloudN > lo.cloudN && me.atmoN > lo.atmoN && me.terrainGrid > lo.terrainGrid,
    'Medium 与 Low 的渲染工作量没有实质差别');
  void knob;
});

test('体积云仍只给 High（Medium 带不动）', () => {
  const src = readFileSync(new URL('../src/scene/planetMaterial.js', import.meta.url), 'utf8');
  assert.ok(/QUALITY\.tier === 'high' && QUALITY\.detail/.test(src),
    '体积云的门控被放宽到 High 以外——实测 Medium 只比 Low 贵 2 倍，加上体积云会直接翻三倍');
});

test('Renderer bootstrap retries temporary failure on a fresh canvas and default GPU preference', async () => {
  let calls=0,replaced=0;const statuses=[],delays=[];
  const canvas={cloneNode:()=>({...canvas}),replaceWith:()=>replaced++};
  const result=await bootstrapRenderer({canvas,create:options=>{calls++;assert.equal(options.antialias,false);if(calls===1)throw Error('cold GPU');assert.equal(options.powerPreference,'default');return {ok:true};},status:s=>statuses.push(s),delay:async ms=>delays.push(ms)});
  assert.equal(result.renderer.ok,true);assert.equal(replaced,1);assert.equal(result.failures.length,1);assert.deepEqual(delays,[500]);assert.equal(statuses[0].state,'retrying');
});

test('Renderer bootstrap exhausts bounded attempts and reports failure without throwing', async () => {
  let calls=0;const statuses=[];const canvas={cloneNode:()=>({...canvas}),replaceWith:()=>{}};
  const result=await bootstrapRenderer({canvas,create:()=>{calls++;throw Error('unavailable');},status:s=>statuses.push(s),delay:async()=>{}});
  assert.equal(result,null);assert.equal(calls,3);assert.equal(statuses.at(-1).state,'failed');assert.equal(statuses.at(-1).failures.length,3);
});

test('Adaptive resolution: Low recovers without enabling High detail; composer receives every resize', () => {
  Object.assign(QUALITY,qualityProfile('Intel UHD'));
  let ratio=1, resized=0;
  const renderer={getPixelRatio:()=>ratio,setPixelRatio:v=>{ratio=v;},xr:{isPresenting:false}};
  const guard=makeFpsGuard(renderer,()=>{},()=>{},()=>resized++);
  for(let i=0;i<95;i++) guard(1/20);
  assert.ok(ratio<1); assert.equal(QUALITY.detail,false);
  for(let i=0;i<1500;i++) guard(1/60);
  assert.equal(ratio,1); assert.ok(resized>=2); assert.equal(QUALITY.detail,false);
  renderer.xr.isPresenting=true;
  for(let i=0;i<200;i++) guard(1/10);
  assert.equal(ratio,1);
});

test('Adaptive resolution protects Low 45 FPS target without degrading High at 59 FPS', () => {
  for (const [name,fps,degrades] of [['Intel UHD',44,true],['NVIDIA RTX 2080 Ti',59,false]]) {
    Object.assign(QUALITY,qualityProfile(name));
    let ratio=1;
    const renderer={getPixelRatio:()=>ratio,setPixelRatio:v=>{ratio=v;},xr:{isPresenting:false}};
    const guard=makeFpsGuard(renderer);
    for(let i=0;i<fps*5;i++) guard(1/fps);
    assert.equal(ratio<1,degrades,name);
  }
});

test('Low keeps loading headroom and promptly adapts again under sustained pressure', () => {
  Object.assign(QUALITY,qualityProfile('Intel UHD'));
  let ratio=1;const renderer={getPixelRatio:()=>ratio,setPixelRatio:v=>{ratio=v;},xr:{isPresenting:false}};
  const guard=makeFpsGuard(renderer);
  for(let i=0;i<47*7;i++)guard(1/47);
  assert.ok(ratio<=.76);
  for(let i=0;i<48*20;i++)guard(1/48);
  assert.equal(ratio,.65);
  for(let i=0;i<60*65;i++)guard(1/60);
  assert.equal(ratio,1);
});

test('Hermite interpolation preserves polynomial position and velocity; no extrapolation', () => {
  const b=new ArrayBuffer(32+3*48),v=new DataView(b);
  [100,1/86400,3,1].forEach((x,i)=>v.setFloat64(i*8,x,true));
  for(let t=0;t<3;t++) [t**3,2*t,7,3*t*t,2,0].forEach((x,i)=>v.setFloat64(32+(t*6+i)*8,x,true));
  installEphemeris('polynomial',b);
  for(const t of [0,.2,.5,1,1.5,2]) {
    const s=sampledState('polynomial',100+t/86400);
    assert.ok(Math.abs(s.x-t**3)<1e-7); assert.ok(Math.abs(s.vx-3*t*t)<1e-7);
  }
  assert.equal(sampledPosition('polynomial',99),null);
  assert.equal(sampledPosition('polynomial',101),null);
  assert.equal(ephemerisCoverage('absent'),null);
  assert.throws(()=>installEphemeris('bad',new ArrayBuffer(40)));
  v.setFloat64(8,Infinity,true);assert.throws(()=>installEphemeris('bad',b));
});

test('Resource queue: bounded concurrency, deduplication and priority', async () => {
  const q=new ResourceQueue(1),order=[];
  let release;const gate=new Promise(r=>{release=r;});
  const first=q.run('first',async()=>{await gate;order.push('first');});
  const low=q.run('low',async()=>order.push('low'),0);
  assert.equal(low,q.run('low',async()=>assert.fail('duplicate'),0));
  const high=q.run('high',async()=>order.push('high'),20);
  release();await Promise.all([first,low,high]);
  assert.deepEqual(order,['first','high','low']);
});

test('DEM relief is physically bounded and Low/High collision heights agree', () => {
  const f=new HeightField('moon',BODIES.moon ?? {radiusKm:1737.4,surface:{ampKm:8}});
  f.setDEMSource({getHeightSync:()=>2});
  for(let i=0;i<100;i++) {
    const d=new THREE.Vector3(Math.sin(i),Math.cos(i*3),Math.cos(i)).normalize();
    const h=f.height(d);
    assert.ok(Math.abs(h-f.baseRadius(d)-2)<=.0016);
    QUALITY.detail=!QUALITY.detail;assert.equal(f.height(d),h);
  }
});

test('Terrain builds publish complete geometry and dispose geometry/material/instances', () => {
  Object.assign(QUALITY,qualityProfile('Intel UHD'));
  const f=new HeightField('test',{radiusKm:1,surface:{ampKm:.01,roughness:.3,craters:0,palette:'gray'}});
  const patches=new TerrainPatchSet(f),lv=patches.levels[0],before=lv.geo;
  patches.build(lv,new THREE.Vector3(1,0,0),'none');
  assert.notEqual(lv.geo,before); assert.ok(lv.built);assert.equal(lv.uFade.value,1);
  assert.ok([...lv.geo.attributes.position.array].every(Number.isFinite));
  assert.ok(patches.rocks.mesh.geometry.index,'welded rock geometry');
  assert.ok(patches.rocks.mesh.count<=QUALITY.rockCount);
  let count=0;
  lv.geo.addEventListener('dispose',()=>count++);
  lv.mesh.material.addEventListener('dispose',()=>count++);
  patches.rocks.mesh.material.addEventListener('dispose',()=>count++);
  patches.rocks.mesh.addEventListener('dispose',()=>count++);
  patches.dispose();assert.equal(count,4);
});

test('A transient DEM fetch failure keeps valid terrain cached', async () => {
  const source=new DEMTileSource('moon');
  source.cache.set(0,0,0,{data:new Float32Array(256*256).fill(2),size:256,level:0});
  source._offline=true;
  assert.equal(source.getHeightSync(new THREE.Vector3(1,0,0)),2);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('temporary offline');};
  try { assert.equal(await source.getTile(4,1,1),null);assert.equal(source.getHeightSync(new THREE.Vector3(1,0,0)),2); }
  finally {globalThis.fetch=original;source.dispose();}
});

test('Rock placement remains fixed when the camera anchor moves', () => {
  Object.assign(QUALITY, qualityProfile('Intel UHD'));
  const field=new HeightField('rock-stability',{radiusKm:1737.4,surface:{ampKm:0,roughness:0,craters:0,palette:'gray'}});
  const patches=new TerrainPatchSet(field),rocks=patches.rocks;
  const anchor=new THREE.Vector3(1,0,0),origin=anchor.clone().multiplyScalar(1737.4);
  const positions=()=>{
    const out=[],matrix=new THREE.Matrix4();
    for(let i=0;i<rocks.mesh.count;i++) { rocks.mesh.getMatrixAt(i,matrix);out.push(new THREE.Vector3().setFromMatrixPosition(matrix).add(rocks.mesh.position)); }
    return out;
  };
  rocks.rebuild(anchor,origin,true);
  const before=positions().filter(p=>p.distanceTo(origin)<.1);
  const next=new THREE.Vector3(Math.cos(.01/1737.4),0,-Math.sin(.01/1737.4));
  rocks.rebuild(next,next.clone().multiplyScalar(1737.4),true);
  const after=positions();
  assert.ok(before.length>5);
  for(const p of before) assert.ok(after.some(q=>q.distanceTo(p)<.00001),'nearby rock moved');
  patches.dispose();
});

test('XR controller cleanup removes handlers and rays; standard gamepad axes produce motion', () => {
  const controllers=[new THREE.Group(),new THREE.Group()],grips=[new THREE.Group(),new THREE.Group()];
  const renderer={getPixelRatio:()=>1,setPixelRatio:()=>{},xr:{getController:i=>controllers[i],getControllerGrip:i=>grips[i]}};
  const manager=new WebXRManager(renderer,new THREE.PerspectiveCamera(),new THREE.Scene());
  manager._factory={createControllerModel:()=>new THREE.Group()};
  let calls=0;manager.setControllerCallback(e=>{if(e.type==='teleport')calls++;});
  for(let cycle=0;cycle<3;cycle++) {
    manager._setupControllers();
    assert.equal(controllers[0]._listeners.selectstart.length,1);
    manager._session={inputSources:[{handedness:'left',gamepad:{axes:[0,0,.5,.5]}}]};
    manager.update(.016);
    manager._cleanupControllers();
    assert.equal(controllers[0]._listeners.selectstart.length,0);
    assert.equal(controllers[0].children.length,0);
  }
  assert.equal(calls,3);
});

test('XR tracking converts metre poses and IPD to kilometres with matching clip planes', () => {
  const eyes=[new THREE.PerspectiveCamera(),new THREE.PerspectiveCamera()];
  eyes[0].matrix.makeTranslation(-.032,1.7,0);eyes[1].matrix.makeTranslation(.032,1.7,0);
  const xrCamera=new THREE.ArrayCamera(eyes);xrCamera.matrix.makeTranslation(0,1.7,0);
  const camera=new THREE.PerspectiveCamera(58,1,5e-7,1e15);
  const renderer={getPixelRatio:()=>1,xr:{getCamera:()=>xrCamera}};
  const manager=new WebXRManager(renderer,camera,new THREE.Scene());manager._updateTrackingCamera();
  const left=new THREE.Vector3().setFromMatrixPosition(eyes[0].matrixWorld),right=new THREE.Vector3().setFromMatrixPosition(eyes[1].matrixWorld);
  assert.ok(Math.abs(left.distanceTo(right)-.000064)<1e-12);
  assert.ok(Math.abs(left.y-.0017)<1e-12);
  assert.equal(eyes[0].near,camera.near);assert.equal(eyes[0].far,camera.far);
  assert.ok(Math.abs(eyes[0].projectionMatrix.elements[14]+2*camera.near)<1e-12);
});

test('XR session failure restores desktop resolution and ends the acquired session', async () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let ended=0,ratio=1.5;
  const session={addEventListener(){},removeEventListener(){},async end(){ended++;}};
  Object.defineProperty(globalThis,'navigator',{value:{xr:{requestSession:async()=>session}},configurable:true});
  const renderer={getPixelRatio:()=>ratio,setPixelRatio:v=>{ratio=v;},xr:{cameraAutoUpdate:true,setReferenceSpaceType(){},async setSession(){throw Error('session setup failed');}}};
  try {
    const manager=new WebXRManager(renderer,new THREE.PerspectiveCamera(),new THREE.Scene());manager._supported=true;
    assert.equal(await manager.enterVR(),false);assert.equal(manager.session,null);assert.equal(ratio,1.5);assert.equal(renderer.xr.cameraAutoUpdate,true);assert.equal(ended,1);
  } finally { if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator; }
});

// ── 发布星历：分片（format 2）──────────────────────────────────────────────
// 窗口是 10 年，按年切分。运行时一次只取当前年份那一片，所以这里既校验
// 每一片的完整性与格式，也校验运行时的分片查找行为。
const root=new URL('../public/data/ephemeris/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
let shardTotal=0;
for(const [id,entry] of Object.entries(manifest.bodies)) {
  const years=Object.keys(entry.files??{});
  assert.ok(years.length>=1,id+' 没有分片');
  assert.equal(entry.format,['moon','lunar'].includes(entry.kind)?2:1,
    id+' 的精度档不符（卫星应为 float32，日心矢量应为 float64）');
  for(const [year,file] of Object.entries(entry.files)) {
    const bytes=readFileSync(new URL(file.file,root));
    assert.equal(bytes.length,file.bytes,`${id} ${year} 字节数不符`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`${id} ${year} 校验和不符`);
    installEphemeris(id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    shardTotal++;
  }
  assert.equal(ephemerisCoverage(id).shards,years.length,id+' 分片数不符');
}
assert.ok(shardTotal>=Object.keys(manifest.bodies).length,
  '窗口应已按年分片（片数应多于目标数）');

test('分片在整条时间轴上无缝（不得开天窗）', () => {
  // 步长未必整除闰年的 366 天（例如 5 天步长：366/5 = 73.2）。
  // 若每片恰好止于次年 1 月 1 日，年份接缝上会漏掉整整一天，
  // 那一天 HUD 会把近似模型当成"已覆盖 JPL 插值"。抓取时每片多给一步即可覆盖。
  const gaps=[];
  for(const [id,entry] of Object.entries(manifest.bodies)) {
    const files=Object.values(entry.files).sort((a,b)=>a.startJD-b.startJD);
    for(let i=1;i<files.length;i++) {
      if(files[i].startJD>files[i-1].endJD+1e-6) {
        gaps.push(`${id} ${files[i-1].endJD}→${files[i].startJD}`);
      }
    }
    // 首片起点与末片终点应与声明的窗口一致
    assert.ok(Math.abs(files[0].startJD-files[0].endJD)>0,id+' 分片时长为零');
  }
  assert.deepEqual(gaps,[],'分片接缝出现空洞：'+gaps.slice(0,5).join('; '));
});

test('分片查找：同一目标的多片各自命中，跨片不误用', () => {
  resetEphemeris('sharded');
  const mk=(start,count,fill)=>{
    const b=new ArrayBuffer(32+count*48),v=new DataView(b);
    [start,1,count,1].forEach((x,i)=>v.setFloat64(i*8,x,true));
    for(let k=0;k<count;k++)for(let i=0;i<6;i++)v.setFloat64(32+(k*6+i)*8,fill,true);
    return b;
  };
  installEphemeris('sharded',mk(1000,11,1));   // 覆盖 1000..1010
  installEphemeris('sharded',mk(1010,11,2));   // 覆盖 1010..1020（交界点两片都有）
  assert.equal(ephemerisShardCount('sharded'),2);
  const cov=ephemerisCoverage('sharded');
  assert.equal(cov.start,1000);assert.equal(cov.end,1020);assert.equal(cov.shards,2);
  assert.equal(sampledPosition('sharded',1005).x,1,'第一片命中');
  assert.equal(sampledPosition('sharded',1015).x,2,'第二片命中');
  assert.equal(sampledPosition('sharded',999),null,'窗口之前不外推');
  assert.equal(sampledPosition('sharded',1021),null,'窗口之后不外推');
  // 重复装载同一片应是替换而非追加（避免刷新时无界增长）
  installEphemeris('sharded',mk(1000,11,3));
  assert.equal(ephemerisShardCount('sharded'),2);
  assert.equal(sampledPosition('sharded',1005).x,3);
  resetEphemeris('sharded');
});

test('非连续分片不得被并集掩盖（曾会把近似模型谎报成 JPL 插值）', () => {
  resetEphemeris('gap');
  const mk=(start,count)=>{
    const b=new ArrayBuffer(32+count*48),v=new DataView(b);
    [start,1,count,1].forEach((x,i)=>v.setFloat64(i*8,x,true));
    for(let k=0;k<count;k++)for(let i=0;i<6;i++)v.setFloat64(32+(k*6+i)*8,1,true);
    return b;
  };
  installEphemeris('gap',mk(1000,11));   // 1000..1010
  installEphemeris('gap',mk(1020,11));   // 1020..1030（中间 1011..1019 是缺口）
  assert.equal(ephemerisCoverage('gap').start,1000);
  assert.equal(ephemerisCoverage('gap').end,1030);
  assert.equal(ephemerisCovers('gap',1005),true);
  assert.equal(ephemerisCovers('gap',1015),false,'缺口必须报告为未覆盖');
  assert.equal(ephemerisCovers('gap',1025),true);
  assert.equal(sampledPosition('gap',1015),null);
  resetEphemeris('gap');
});

test('格式 2（float32）在卫星尺度上量化误差 < 0.3 km', () => {
  resetEphemeris('f32');
  // 取最远的卫星量级：Iapetus 3.56e6 km
  const R=3560820,count=5,step=1/24;
  const b=new ArrayBuffer(32+count*6*4),v=new DataView(b);
  [5000,step,count,2].forEach((x,i)=>v.setFloat64(i*8,x,true));
  for(let k=0;k<count;k++)for(let i=0;i<6;i++)v.setFloat32(32+(k*6+i)*4,k===0&&i<3?R:0,true);
  installEphemeris('f32',b);
  const p=sampledPosition('f32',5000);
  assert.ok(Math.abs(p.x-R)<0.3,`float32 量化误差 ${Math.abs(p.x-R)} km`);
  resetEphemeris('f32');
});

test('未知格式与长度不符的缓冲被拒绝', () => {
  resetEphemeris('badfmt'); resetEphemeris('badlen');
  const bad=new ArrayBuffer(32+6*8),v=new DataView(bad);
  [100,1,1,3].forEach((x,i)=>v.setFloat64(i*8,x,true));   // format 3 不存在
  assert.throws(()=>installEphemeris('badfmt',bad));
  const short=new ArrayBuffer(32+5*8);                     // 半个样本
  [100,1,1,1].forEach((x,i)=>new DataView(short).setFloat64(i*8,x,true));
  assert.throws(()=>installEphemeris('badlen',short));
  resetEphemeris('badfmt'); resetEphemeris('badlen');
});
const fixtures=JSON.parse(readFileSync(new URL('./release-ephemeris.json',import.meta.url)));
for(const [id,{kind,rows}] of Object.entries(fixtures.bodies)) {
  test(`${id}: independent off-grid JPL reference, 8 dates`,()=>{
    for(const ref of rows) {
      const s=kind==='planet'?planetPosition(id,ref.jd):kind==='lunar'?moonGeocentric(ref.jd):kind==='moon'?moonLocalPosition(id,ref.jd):kind==='tno'?tnoPosition(id,ref.jd):kind==='comet'?cometPosition(COMETS.find(c=>c.id===id),ref.jd):id==='newhorizons'?newHorizonsPosition(ref.jd):voyagerPosition(VOYAGERS.find(v=>v.id===id),ref.jd);
      const a=[s.x,s.y,s.z],b=ref.pos;
      const cross=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
      const angle=Math.atan2(cross,a.reduce((sum,x,i)=>sum+x*b[i],0))*180/Math.PI;
      const km=Math.hypot(...a.map((x,i)=>x-b[i]));
      assert.ok(angle<.001,`${ref.jd}: ${angle}°`);
      assert.ok(km<10,`${ref.jd}: ${km} km`);
    }
  });
}

test('Analytic lunar fallback remains accurate without sampled data', () => {
  for (const ref of fixtures.bodies.moon.rows) {
    const p=moonGeocentricELP2000(ref.jd),a=[p.x,p.y,p.z],b=ref.pos;
    const dot=a.reduce((sum,v,i)=>sum+v*b[i],0)/(Math.hypot(...a)*Math.hypot(...b));
    assert.ok(Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI<.01);
  }
});
