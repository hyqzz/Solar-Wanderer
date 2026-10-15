import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const OUT='.audit-reports/runtime';mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result={started:new Date().toISOString(),checks:[],errors:[]};
const save=()=>writeFileSync(OUT+'/results.json',JSON.stringify(result,null,2));
const check=(name,ok,detail)=>{result.checks.push({name,ok:!!ok,detail});save();console.log(ok?'PASS':'FAIL',name);};
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.bin':'application/octet-stream'};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/Solar-Wanderer/')){res.writeHead(404).end();return;}
 let file=path.resolve(root,decodeURIComponent(url.pathname.slice('/Solar-Wanderer/'.length))||'index.html');
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
 if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(4182,'127.0.0.1',r));
const base='http://127.0.0.1:4182/Solar-Wanderer/';
const browser=await puppeteer.launch({headless:false,args:['--disable-backgrounding-occluded-windows'],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
async function start(page,url=base){await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>!document.querySelector('#start-btn')?.disabled,{timeout:30000});await page.click('#start-btn');await page.waitForFunction(()=>window.__game,{timeout:30000});}
try{
 const page=await browser.newPage();page.on('pageerror',e=>{result.errors.push(e.stack);save();});
 const bad=[];page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()});});
 await start(page,base+'en/');await sleep(4000);
 const prefix=await page.evaluate(()=>({lang:document.documentElement.lang,start:document.querySelector('#start-btn').textContent,stats:window.__game.ephemerisLoader.stats,manifest:document.querySelector('link[rel=manifest]').href}));
 check('GitHub Pages prefix English runtime and JPL resources',prefix.lang==='en'&&prefix.stats.loaded>0&&bad.length===0,{...prefix,bad});
 const manifest=await page.evaluate(async()=>{const r=await fetch(document.querySelector('link[rel=manifest]').href);const m=await r.json();return {ok:r.ok,start:new URL(m.start_url,r.url).pathname,icons:await Promise.all(m.icons.map(async i=>(await fetch(new URL(i.src,r.url))).ok))};});
 check('manifest and icons resolve below deployment prefix',manifest.ok&&manifest.start.startsWith('/Solar-Wanderer/')&&manifest.icons.every(Boolean),manifest);
 const finite=await page.evaluate(()=>[...window.__game.registry].map(([id,b])=>({id,finite:b.posKm?.length===3&&b.posKm.every(Number.isFinite)})));
 check('every registered target has finite state',finite.every(r=>r.finite),finite);
 const targets=[];
 result.targets=targets;
 for(const {id} of finite){
  result.currentTarget=id;save();
  await page.evaluate(id=>window.__game.flyTo(id),id);
  await page.waitForFunction(()=>!window.__game.orbitCam.flight,{timeout:20000});
  targets.push(await page.evaluate(id=>({id,focus:window.__game.orbitCam.focusId,finite:window.__game.camera.position.toArray().every(Number.isFinite)}),id));
  save();
 }
 check('all catalog destinations complete flight and preserve finite camera',targets.every(t=>t.focus===t.id&&t.finite),targets);
 const dates=await page.evaluate(async()=>{const g=window.__game,states=[];for(const jd of [2451545,2461192,2461316,2461686,2488070]){g.simClock.paused=true;g.simClock.jdTT=jd;await new Promise(r=>setTimeout(r,300));states.push({jd,finite:[...g.builder.bodies.values()].every(b=>b.posKm.every(Number.isFinite)),camera:g.camera.position.toArray().every(Number.isFinite)});}g.simClock.jdTT=2461316;return states;});
 check('date jumps inside and outside calibrated interval remain finite',dates.every(d=>d.finite&&d.camera),dates);
 await page.setViewport({width:1440,height:900,deviceScaleFactor:2});await sleep(2500);
 const size=await page.evaluate(()=>{const g=window.__game;return {buffer:[g.renderer.domElement.width,g.renderer.domElement.height],composer:[g.composer.renderTarget1.width,g.composer.renderTarget1.height],quality:g.quality};});
 check('resize and DPR keep HDR target and drawing buffer aligned',size.buffer.every((v,i)=>Math.abs(v-size.composer[i])<1.1),size);
 const restoration=await page.evaluate(async()=>{const g=window.__game,ext=g.renderer.getContext().getExtension('WEBGL_lose_context');if(!ext)return {supported:false};let restored=false;g.renderer.domElement.addEventListener('webglcontextrestored',()=>restored=true,{once:true});ext.loseContext();await new Promise(r=>setTimeout(r,500));ext.restoreContext();await new Promise(r=>setTimeout(r,2500));return {supported:true,restored,lost:g.renderer.getContext().isContextLost(),calls:g.renderer.info.render.calls};});
 check('WebGL context restores and resumes drawing',restoration.supported&&restoration.restored&&!restoration.lost&&restoration.calls>0,restoration);
 await page.close();

 const weak=await browser.newPage();weak.on('pageerror',e=>result.errors.push(e.stack));
 const cdp=await weak.createCDPSession();await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:512*1024,uploadThroughput:256*1024});
 const before=Date.now();await start(weak,base+'?lang=zh');const usableMs=Date.now()-before;
 const initial=await weak.evaluate(()=>({tier:window.__game.quality.tier,textures:[...window.__game.builder.cache].map(([file,t])=>({file,width:t.image?.width,height:t.image?.height})),resources:performance.getEntriesByType('resource').filter(e=>/textures/.test(e.name)).map(e=>({name:e.name,bytes:e.transferSize}))}));
 check('512 KB/s + 120 ms network reaches usable preview',usableMs<20000,{usableMs,...initial});
 check('initial preview avoids eagerly fetching every original full texture',initial.resources.filter(r=>/textures\/(?!preview\/|medium\/|manifest)/.test(r.name)).length<8,initial.resources);
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 let corrupt=true,blockTile=true;
 await weak.setRequestInterception(true);weak.on('request',r=>{if(corrupt&&/ephemeris\/cg67p\.bin/.test(r.url()))r.respond({status:200,contentType:'application/octet-stream',body:Buffer.alloc(24)});else if(blockTile&&/dem\/moon\//.test(r.url()))r.respond({status:503,body:'test failure'});else r.continue();});
 const failed=await weak.evaluate(async()=>{const g=window.__game,source=g.terrainMgr.field('moon').demSource;const loadedBefore=g.ephemerisLoader.stats.loaded;return {ephem:await g.ephemerisLoader.load('cg67p'),tile:!!await source.getTile(0,0,0),loadedBefore,loadedAfter:g.ephemerisLoader.stats.loaded,finite:g.camera.position.toArray().every(Number.isFinite)};});
 check('corrupt ephemeris and DEM outage preserve usable fallback',!failed.ephem&&!failed.tile&&failed.finite,failed);
 corrupt=false;blockTile=false;await sleep(31000);
 const recovered=await weak.evaluate(async()=>({ephem:await window.__game.ephemerisLoader.load('cg67p'),tile:!!await window.__game.terrainMgr.field('moon').demSource.getTile(0,0,0)}));
 check('ephemeris and DEM recover after retry cooldown',recovered.ephem&&recovered.tile,recovered);
 await weak.close();
 const offline=await browser.newPage();offline.on('pageerror',e=>result.errors.push(e.stack));await offline.setRequestInterception(true);
 offline.on('request',r=>/\/(textures|data|dem)\//.test(r.url())?r.respond({status:503,body:'test asset outage'}):r.continue());
 await start(offline,base+'?lang=en');await sleep(2500);
 check('asset outage still opens analytic and procedural fallback',await offline.evaluate(()=>!!window.__game&&window.__game.camera.position.toArray().every(Number.isFinite)));
 await offline.close();
 check('no uncaught runtime exceptions',result.errors.length===0,result.errors);
}finally{await browser.close();await new Promise(r=>server.close(r));result.finished=new Date().toISOString();save();}
process.exitCode=result.checks.some(c=>!c.ok)||result.errors.length?1:0;
