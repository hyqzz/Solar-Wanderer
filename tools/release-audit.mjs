// Hardware-backed release evidence. Windows High uses ANGLE Vulkan; verify the
// reported renderer before treating results as discrete-GPU measurements.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const OUT=path.resolve('.audit-reports/release');mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result={started:new Date().toISOString(),viewport:[1280,720],runs:[]};
const persist=()=>writeFileSync(path.join(OUT,'results.json'),JSON.stringify(result,null,2));
const includeOnline=process.argv.includes('--include-online');
for(const profile of ['low','high']) {
  const browser=await puppeteer.launch({headless:false,args:['--no-sandbox','--window-position=20,20','--window-size=1280,760','--disable-backgrounding-occluded-windows',...(profile==='high'?['--use-angle=vulkan']:[])],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
  try {
    for(const [name,base] of [['candidate','http://127.0.0.1:4179/'],...(includeOnline?[['online','https://sw.icodestar.net/']]:[])]) {
      const page=await browser.newPage();await page.bringToFront();
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push({type:'page',message:e.stack}));
      page.on('console',m=>{if(m.type()==='error')errors.push({type:'console',message:m.text()});});
      page.on('requestfailed',r=>failed.push({url:r.url(),message:r.failure()?.errorText}));
      page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
      const start=Date.now();
      const url=base+'?lang=zh'+(name==='online'?'&quality='+(profile==='low'?'lite':'high'):'');
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>{const b=document.querySelector('#start-btn');return b&&!b.disabled;},{timeout:30000});
      const readyMs=Date.now()-start;
      await page.click('#start-btn');await page.waitForFunction(()=>window.__game,{timeout:30000});
      await page.evaluate(()=>{window.__game.simClock.paused=true;window.__game.simClock.jdTT=2461316;});
      const gpu=await page.evaluate(()=>{const gl=document.querySelector('#app').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);});
      if(profile==='high'&&!/RTX 2080 Ti/.test(gpu))throw Error('High did not use the expected discrete GPU: '+gpu);
      if(profile==='low'&&!/UHD Graphics 770/.test(gpu))throw Error('Low did not use the expected integrated GPU: '+gpu);
      const dir=path.join(OUT,name+'-'+profile);mkdirSync(dir,{recursive:true});
      const run={name,profile,gpu,readyMs,scenes:[],targets:[],errors,failed};result.runs.push(run);persist();
      const ev=(fn,...args)=>page.evaluate(fn,...args);
      async function orbit(id,scale=2.6,night=false) {
        await ev((id,scale,night)=>{
          const g=window.__game,b=g.builder.bodies.get(id),V=g.camera.position.constructor;
          let d=id==='sun'?new V(1,.3,0):new V(...b.posKm).normalize().negate();
          if(night)d.negate();d.applyQuaternion(b.mesh.quaternion.clone().invert());
          const o=g.orbitCam;g.select(id);o.focusId=id;o.flight=null;o.transition=null;o.pendingFocusId=null;o.panOffset.set(0,0,0);
          o.lat=Math.asin(Math.max(-1,Math.min(1,d.y)));o.lon=Math.atan2(-d.z,d.x);o.tilt=o.heading=0;
          o.dist=o.distTarget=Math.max(b.phys.radiusKm,b.phys.rings?.outerKm??0)*scale;
        },id,scale,night);
      }
      async function state() {
        return ev(()=>{
          const g=window.__game,a=g.terrainMgr.active;
          return {mode:g.getMode(),focus:g.orbitCam.focusId,quality:g.quality??null,buffer:[g.renderer?.domElement.width??document.querySelector('#app').width,g.renderer?.domElement.height??document.querySelector('#app').height],composer:g.composer?[g.composer.renderTarget1.width,g.composer.renderTarget1.height]:null,terrain:a?{bodyId:a.bodyId,ready:a.patches.readyCover,rocks:a.patches.rocks.mesh.count}:null,ephemeris:g.ephemerisLoader?.stats,resources:g.renderer?.info.memory,programs:g.renderer?.info.programs.length,heap:performance.memory?.usedJSHeapSize,errors:window.__errLog??[]};
        });
      }
      async function capture(key,extra={}) {
        await page.screenshot({path:path.join(dir,key+'.png')});
        run.scenes.push({key,...await state(),...extra});persist();console.log(name,profile,key);
      }
      async function perf(seconds=12) {
        return ev(async seconds=>{
          const times=[];let start=performance.now(),last=start;
          await new Promise(resolve=>{function tick(t){times.push(t-last);last=t;if(t-start>=seconds*1000)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
          const sorted=[...times].sort((a,b)=>a-b);
          return {seconds:(last-start)/1000,frames:times.length,fps:times.length*1000/(last-start),p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],over50Pct:times.filter(t=>t>50).length*100/times.length};
        },seconds);
      }
      await sleep(8000);
      for(const id of ['sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune','pluto','io','europa','ganymede','callisto','titan','triton']) {
        await orbit(id);await sleep(2000);await capture('orbit-'+id);
      }
      await orbit('earth',2.4,true);await sleep(1800);await capture('earth-night');
      for(const id of ['moon','mars','mercury','venus','titan','pluto','earth']) {
        await orbit(id);await sleep(500);
        await ev(id=>{const g=window.__game,o=g.orbitCam;o.lat=id==='earth'?-.6:id==='moon'?.17:-.087;o.dist=o.distTarget=g.builder.bodies.get(id).phys.radiusKm+10;},id);await sleep(1800);
        for(let attempt=0;attempt<8;attempt++) {
          await ev(id=>{
            const g=window.__game,o=g.orbitCam;if(g.getMode()!=='orbit')return;
            const V=g.camera.position.constructor,d=new V(Math.cos(o.lat)*Math.cos(-o.lon),Math.sin(o.lat),Math.cos(o.lat)*Math.sin(-o.lon));
            o.dist=o.distTarget=g.terrainMgr.heightAt(id,d)+.002;
          },id);await sleep(900);
          if(await ev(()=>window.__game.getMode()==='walk'))break;
          await page.keyboard.press('KeyG');await sleep(900);
          if(await ev(()=>window.__game.getMode()==='walk'))break;
        }
        await sleep(8000);
        const mode=await ev(()=>window.__game.getMode());
        if(mode!=='walk')run.errors.push({type:'assertion',message:'Landing failed: '+id});
        if(mode==='walk')await ev(()=>{window.__game.ship.walk.pitch=.05;});
        const measured=['moon','mars','earth'].includes(id)?await perf():null;
        await capture('surface-'+id,{perf:measured});
        if(mode==='walk') {
          await ev(()=>{window.__game.ship.walk.pitch=1.25;});await sleep(800);await capture('sky-'+id);
          await ev(()=>{const w=window.__game.ship.walk;w.pitch=.25;w.yaw+=Math.PI;});await sleep(800);await capture('reverse-'+id);
          await page.keyboard.press('KeyG');await page.waitForFunction(()=>window.__game.getMode()==='orbit',{timeout:10000});
        }
      }
      for(const id of ['encke','halley','halebopp','cg67p','voyager1','voyager2','termshock','heliopause','oortcloud','asteroidbelt','kuiperbelt','farfarout']) {
        await ev(id=>window.__game.flyTo(id),id);await page.waitForFunction(()=>!window.__game.orbitCam.flight,{timeout:20000});await sleep(1500);
        run.targets.push({id,...await state()});
        if(['encke','voyager1','oortcloud','farfarout'].includes(id))await capture('target-'+id);
        persist();
      }
      run.final=await state();persist();await page.close();
    }
  } finally {await browser.close();}
}
result.finished=new Date().toISOString();persist();
console.log('COMPLETE',result.runs.map(r=>({name:r.name,profile:r.profile,errors:r.errors.length,failed:r.failed.length})));
