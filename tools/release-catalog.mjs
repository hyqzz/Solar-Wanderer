// Complete the visual evidence for destinations omitted from the detailed audit.
import puppeteer from 'puppeteer';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root='.audit-reports/release/';
const detailed=JSON.parse(readFileSync(root+'results.json'));
const runtime=JSON.parse(readFileSync('.audit-reports/runtime/results.json'));
const shown=new Set(detailed.runs[0].scenes.map(s=>s.key.replace(/^(orbit|surface|sky|reverse|target)-/,'')));
shown.add('earth');
const ids=runtime.targets.map(t=>t.id).filter(id=>!shown.has(id));
const result={started:new Date().toISOString(),viewport:[1280,720],ids,runs:[]};
const save=()=>writeFileSync(root+'catalog-results.json',JSON.stringify(result,null,2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function prepareSession(page,base,name,profile){
 const url=base+'?lang=zh'+(name==='online'?'&quality='+(profile==='low'?'lite':'high'):'');
 for(let attempt=0;attempt<3;attempt++){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('#start-btn')?.disabled,{timeout:60000});
  await page.click('#start-btn');
  try{await page.waitForFunction(()=>window.__game,{timeout:30000});break;}
  catch(error){
   if(attempt===2)throw error;
   await page.reload({waitUntil:'domcontentloaded',timeout:60000});
   await sleep(2500);
  }
 }
 await page.evaluate(()=>{window.__game.simClock.paused=true;window.__game.simClock.jdTT=2461316;});await sleep(8000);
}
async function probeGpu(page){
 const readApp=()=>page.evaluate(async()=>{
  const canvas=document.querySelector('#app');
  for(let i=0;i<20;i++){
   const gl=canvas?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
   if(ext)return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
   await new Promise(r=>setTimeout(r,500));
  }
  return 'unavailable';
 });
 let gpu=await readApp();
 let aux='';
 if(gpu==='unavailable'){
  aux=await page.evaluate(()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';}catch{return '';}});
 }
 const tier=await page.evaluate(()=>window.__game?.quality?.tier??null);
 const appName=tier?String(await page.evaluate(()=>window.__game?.quality?.gpuName??'')):'';
 return {gpu,aux,tier,appName};
}
for(const profile of ['low','high']){
 const browser=await puppeteer.launch({headless:false,args:['--no-sandbox','--disable-backgrounding-occluded-windows',...(profile==='high'?['--use-angle=vulkan']:[])],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
 try{
  for(const [name,base] of [['online','https://sw.icodestar.net/'],['candidate','http://127.0.0.1:4179/']]){
   const page=await browser.newPage();await page.bringToFront();const errors=[],failed=[];
   page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.on('requestfailed',r=>failed.push({url:r.url(),message:r.failure()?.errorText}));
   page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
   await prepareSession(page,base,name,profile);
   const gpuOk=r=>profile==='high'?(/RTX 2080 Ti/.test(r.gpu)||/RTX 2080 Ti/.test(r.aux)||/RTX 2080 Ti/.test(r.appName)):(/UHD Graphics 770/.test(r.gpu)||/UHD Graphics 770/.test(r.aux)||/UHD Graphics 770/.test(r.appName)||r.tier==='low');
   let probed=await probeGpu(page);
   if(!gpuOk(probed)){await prepareSession(page,base,name,profile);probed=await probeGpu(page);}
   if(!gpuOk(probed))throw Error('Unexpected GPU: '+JSON.stringify(probed));
   const gpu=probed.gpu==='unavailable'?(probed.aux||probed.appName||'unavailable'):probed.gpu;
   const run={name,profile,gpu,scenes:[],errors,failed};result.runs.push(run);save();
   const dir=root+name+'-'+profile;mkdirSync(dir,{recursive:true});
   for(const id of ids){
    for(const angle of ['a','b']){
     await page.evaluate((id,angle)=>{
      const g=window.__game,e=g.registry.get(id),V=g.camera.position.constructor,d=new V(...e.posKm);
      if(d.lengthSq()>0)d.normalize().negate();else d.set(1,.3,0).normalize();
      if(e.quatRef)d.applyQuaternion(e.quatRef.clone().invert());
      g.select(id);const o=g.orbitCam;o.focusId=id;o.flight=o.transition=null;o.pendingFocusId=null;o.panOffset.set(0,0,0);o.tilt=o.heading=0;
      o.lat=Math.asin(Math.max(-1,Math.min(1,d.y)));o.lon=Math.atan2(-d.z,d.x);
      if(angle==='b'){o.lon+=Math.PI/3;o.lat=Math.max(-1.3,Math.min(1.3,o.lat+.3));}
      o.dist=o.distTarget=['comet','probe','boundary','region'].includes(e.kind)?e.viewDist:Math.max(e.phys.radiusKm,e.phys.rings?.outerKm??0)*2.6;
     },id,angle);
     await sleep(angle==='a'?1800:1100);
     const key=`catalog-${id}-${angle}`;
     await page.screenshot({path:dir+'/'+key+'.png'});
     const state=await page.evaluate(()=>{const g=window.__game;return{focus:g.orbitCam.focusId,mode:g.getMode(),finite:g.camera.position.toArray().every(Number.isFinite),quality:g.quality??null,resources:g.renderer?.info.memory,ephemeris:g.ephemerisLoader?.stats};});
     if(!state.finite||state.focus!==id||state.mode!=='orbit')throw Error('Invalid catalog pose: '+key);
     run.scenes.push({key,id,angle,...state});save();console.log(name,profile,key);
    }
   }
   await page.close();
  }
 }finally{await browser.close();}
}
result.finished=new Date().toISOString();save();
if(result.runs.filter(r=>r.name==='candidate').some(r=>r.errors.length||r.failed.length))process.exitCode=1;
console.log('COMPLETE',result.runs.map(r=>({name:r.name,profile:r.profile,scenes:r.scenes.length,errors:r.errors.length,failed:r.failed.length})));
