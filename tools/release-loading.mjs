import puppeteer from 'puppeteer';
import { mkdirSync,writeFileSync } from 'node:fs';
const out='.audit-reports/loading';mkdirSync(out,{recursive:true});
const result={started:new Date().toISOString(),checks:[],errors:[]};
const check=(name,ok,detail)=>{result.checks.push({name,ok:!!ok,detail});writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(ok?'PASS':'FAIL',name);};
const browser=await puppeteer.launch({headless:false,args:['--disable-backgrounding-occluded-windows'],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
try {
 const page=await browser.newPage();await page.bringToFront();page.on('pageerror',e=>result.errors.push(e.stack));
 let mediumAttempts=0;const requests=[];
 await page.setRequestInterception(true);page.on('request',r=>{
  requests.push(r.url());
  if(/textures\/preview\/moon\.webp/.test(r.url()))r.respond({status:503,body:'test preview outage'});
  else if(/textures\/medium\/moon\.webp/.test(r.url())&&++mediumAttempts===1)r.respond({status:200,contentType:'image/webp',body:Buffer.alloc(24)});
  else r.continue();
 });
 await page.goto('http://127.0.0.1:4179/');await page.waitForFunction(()=>!document.querySelector('#start-btn').disabled,{timeout:30000});await page.click('#start-btn');await page.waitForFunction(()=>window.__game,{timeout:60000});
 await page.waitForFunction(()=>window.__game.builder.cache.get('moon.jpg')?.userData.realLoaded,{timeout:60000});
 const moon=await page.evaluate(()=>{const t=window.__game.builder.cache.get('moon.jpg');return {width:t.image.width,height:t.image.height,real:t.userData.realLoaded,kind:t.image.constructor.name};});
 check('failed preview and corrupt cached bitmap recover without reload',moon.real&&moon.width>=1024&&mediumAttempts>=2,{...moon,mediumAttempts});
 const versioned=requests.filter(u=>/\/(textures\/(preview|medium)|data\/ephemeris)\//.test(u)&&!u.includes('manifest.json'));
 check('texture variants and ephemeris use content-versioned requests',versioned.every(u=>new URL(u).searchParams.has('v')),versioned);
 await page.waitForFunction(()=>window.__game.builder.bodies.get('mimas').mesh.material.uniforms.uMap.value.image instanceof ImageBitmap,{timeout:60000});
 check('procedural surface generation publishes Worker bitmap',requests.some(u=>/proceduralWorker/.test(u)),requests.filter(u=>/Worker/.test(u)));
 await page.close();
 const fallback=await browser.newPage();await fallback.bringToFront();fallback.on('pageerror',e=>result.errors.push(e.stack));
 await fallback.evaluateOnNewDocument(()=>{window.Worker=undefined;});
 await fallback.goto('http://127.0.0.1:4179/');await fallback.waitForFunction(()=>!document.querySelector('#start-btn').disabled,{timeout:30000});await fallback.click('#start-btn');await fallback.waitForFunction(()=>window.__game);
 await new Promise(r=>setTimeout(r,4000));
 const pacing=await fallback.evaluate(async()=>{let start=performance.now(),last=start;const times=[];await new Promise(r=>{function frame(t){times.push(t-last);last=t;if(t-start>=10000)r();else requestAnimationFrame(frame)}requestAnimationFrame(frame)});const sorted=times.toSorted((a,b)=>a-b);return{fps:times.length*1000/(last-start),p95Ms:sorted[Math.floor(sorted.length*.95)],hidden:document.hidden};});
 check('Worker unavailable keeps visible generation above Low pacing target',!pacing.hidden&&pacing.fps>=45&&pacing.p95Ms<=40,pacing);
 try{await fallback.waitForFunction(()=>window.__game.builder.bodies.get('mimas').mesh.material.uniforms.uMap.value.image.width===1024,{timeout:60000});}
 catch(e){result.fallbackDiagnostic=await fallback.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,width:window.__game.builder.bodies.get('mimas').mesh.material.uniforms.uMap.value.image.width,quality:window.__game.quality}));throw e;}
 check('Worker unavailable falls back to incremental pixel generation',await fallback.evaluate(()=>window.__game.camera.position.toArray().every(Number.isFinite)));
 await fallback.close();check('loading recovery has no uncaught exceptions',result.errors.length===0,result.errors);
}finally{await browser.close();result.finished=new Date().toISOString();writeFileSync(out+'/results.json',JSON.stringify(result,null,2));}
process.exitCode=result.checks.some(c=>!c.ok)||result.errors.length?1:0;
