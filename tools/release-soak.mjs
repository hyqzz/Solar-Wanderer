import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
const profile=process.argv[3]??'low';
const OUT='.audit-reports/soak'+(profile==='high'?'-high':'');mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const minutes=Number(process.argv[2]??15);
const result={started:new Date().toISOString(),minutes,profile,samples:[],errors:[]};
const save=()=>writeFileSync(OUT+'/results.json',JSON.stringify(result,null,2));
const browser=await puppeteer.launch({headless:false,args:['--disable-backgrounding-occluded-windows',...(profile==='high'?['--use-angle=vulkan']:[])],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>{result.errors.push(e.stack);save();});
 await page.evaluateOnNewDocument(()=>{window.__releaseContextEvents=[];for(const kind of ['webglcontextlost','webglcontextrestored'])document.addEventListener(kind,()=>window.__releaseContextEvents.push({kind,time:performance.now()}),true);});
 page.on('console',m=>{if(m.type()==='error'){result.errors.push(m.text());save();}});
 await page.goto('http://127.0.0.1:4179/?lang=zh');await page.waitForFunction(()=>!document.querySelector('#start-btn')?.disabled);await page.click('#start-btn');await page.waitForFunction(()=>window.__game);
 await sleep(2500);
 await page.waitForFunction(()=>!window.__game.renderer.getContext().isContextLost(),{timeout:30000});
 result.gpu=await page.evaluate(()=>{const g=window.__game,gl=g.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.quality.gpuName;});
 result.initialContextEvents=await page.evaluate(()=>window.__releaseContextEvents);
 if(!(profile==='high'?/RTX 2080 Ti/:/UHD Graphics 770/).test(result.gpu))throw Error('Unexpected GPU: '+result.gpu);
 save();
 const cdp=await page.createCDPSession();const start=Date.now();
 await page.evaluate(()=>{window.__game.simClock.paused=true;window.__game.simClock.jdTT=2461316;});
 for(let i=0;Date.now()-start<minutes*60000;i++){
  const id=['moon','mars','earth'][i%3];
  await page.evaluate(id=>{const g=window.__game,b=g.builder.bodies.get(id),V=g.camera.position.constructor,d=new V(...b.posKm).normalize().negate().applyQuaternion(b.mesh.quaternion.clone().invert()),o=g.orbitCam;g.select(id);o.focusId=id;o.flight=o.transition=null;o.pendingFocusId=null;o.panOffset.set(0,0,0);o.lat=id==='earth'?-.6:id==='moon'?.17:-.087;o.lon=Math.atan2(-d.z,d.x);o.dist=o.distTarget=b.phys.radiusKm+10;},id);await sleep(2500);
  for(let k=0;k<8;k++){await page.evaluate(id=>{const g=window.__game,o=g.orbitCam,V=g.camera.position.constructor;if(g.getMode()==='walk')return;o.dist=o.distTarget=g.terrainMgr.heightAt(id,new V(Math.cos(o.lat)*Math.cos(-o.lon),Math.sin(o.lat),Math.cos(o.lat)*Math.sin(-o.lon)))+.002;},id);await sleep(900);if(await page.evaluate(()=>window.__game.getMode()==='walk'))break;await page.keyboard.press('KeyG');await sleep(500);}
  await sleep(9000);
  await page.keyboard.down('KeyW');await sleep(8000);await page.keyboard.up('KeyW');await page.keyboard.press('Space');
  await page.evaluate(()=>{const w=window.__game.ship.walk;w.pitch=.15;w.yaw+=.4;});
  const perf=await page.evaluate(async()=>{const t=[];let begin=performance.now(),last=begin;await new Promise(r=>{function frame(now){t.push(now-last);last=now;if(now-begin>=65000)r();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});const sorted=t.toSorted((a,b)=>a-b);return {fps:t.length*1000/(last-begin),p95Ms:sorted[Math.floor(sorted.length*.95)],over50Pct:t.filter(v=>v>50).length*100/t.length};});
  await cdp.send('HeapProfiler.collectGarbage');
  const state=await page.evaluate(()=>{const g=window.__game;return {mode:g.getMode(),finite:g.camera.position.toArray().every(Number.isFinite)&&[...g.registry.values()].every(b=>b.posKm.every(Number.isFinite)),quality:g.quality,memory:g.renderer.info.memory,programs:g.renderer.info.programs.length,heap:performance.memory?.usedJSHeapSize,fields:g.terrainMgr.fields.size,dem:[...g.terrainMgr.demSources].map(([id,s])=>({id,tiles:s.cache.size})),ready:g.terrainMgr.active?.patches.readyCover};});
  result.samples.push({cycle:i,id,elapsedSec:(Date.now()-start)/1000,perf,...state});save();console.log('cycle',i,id,perf.fps,state.memory);
  await page.screenshot({path:OUT+'/'+i+'-'+id+'.png'});
  if(state.mode==='walk'){await page.keyboard.press('KeyG');await page.waitForFunction(()=>window.__game.getMode()==='orbit',{timeout:10000});}
 }
 result.contextEvents=await page.evaluate(()=>window.__releaseContextEvents);
 result.passed=result.errors.length===0&&result.contextEvents.length===0&&result.samples.every(s=>s.finite&&s.ready&&s.fields<=4&&s.dem.every(d=>d.tiles<=64));
 const first=result.samples.find(s=>s.cycle>=3),last=result.samples.at(-1);
 result.resourceGrowth=first?{geometry:last.memory.geometries-first.memory.geometries,textures:last.memory.textures-first.memory.textures,heap:last.heap-first.heap}:null;
 if(result.resourceGrowth&&(result.resourceGrowth.geometry>10||result.resourceGrowth.textures>20))result.passed=false;
}finally{await browser.close();result.finished=new Date().toISOString();save();}
process.exitCode=result.passed?0:1;
