import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const dir='.audit-reports/surface-diagnostics';mkdirSync(dir,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({headless:false,args:['--use-angle=vulkan','--disable-backgrounding-occluded-windows'],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4179/');await page.click('#start-btn');await page.waitForFunction(()=>window.__game);
 await page.evaluate(()=>{const g=window.__game;g.simClock.paused=true;g.simClock.jdTT=2461316;g.select('mars');const o=g.orbitCam;o.focusId='mars';o.flight=o.transition=null;});await sleep(1500);
 await page.evaluate(()=>{const g=window.__game,b=g.builder.bodies.get('mars'),V=g.camera.position.constructor,d=new V(...b.posKm).normalize().negate().applyQuaternion(b.mesh.quaternion.clone().invert()),o=g.orbitCam;o.lat=-.087;o.lon=Math.atan2(-d.z,d.x);o.dist=o.distTarget=b.phys.radiusKm+10;});await sleep(2500);
 for(let i=0;i<8;i++){await page.evaluate(()=>{const g=window.__game,o=g.orbitCam,V=g.camera.position.constructor;o.dist=o.distTarget=g.terrainMgr.heightAt('mars',new V(Math.cos(o.lat)*Math.cos(-o.lon),Math.sin(o.lat),Math.cos(o.lat)*Math.sin(-o.lon)))+.002;});await sleep(1000);if(await page.evaluate(()=>window.__game.getMode()==='walk'))break;await page.keyboard.press('KeyG');}
 await sleep(12000);await page.evaluate(()=>{window.__game.ship.walk.pitch=.05;});
 await page.screenshot({path:dir+'/normal.png'});
 await page.evaluate(()=>{for(const l of window.__game.terrainMgr.active.patches.levels){const compile=l.mat.onBeforeCompile;l.mat.onBeforeCompile=s=>{compile(s);s.fragmentShader=s.fragmentShader.replace(/\{\s*\/\/ 程序化凹凸[\s\S]*?(?=#include <normal_fragment_maps>)/,'');};l.mat.customProgramCacheKey=()=> 'diagnostic-no-bump';l.mat.needsUpdate=true;}});await sleep(1000);await page.screenshot({path:dir+'/no-bump.png'});
 await page.evaluate(()=>{window.__game.terrainMgr.active.patches.levels.forEach(l=>l.mesh.receiveShadow=false);});await sleep(300);await page.screenshot({path:dir+'/no-receive-shadow.png'});
 await page.evaluate(()=>{window.__game.terrainMgr.active.patches.levels.forEach(l=>{l.mesh.receiveShadow=true;l.mesh.castShadow=false;});});await sleep(300);await page.screenshot({path:dir+'/no-terrain-cast.png'});
 await page.evaluate(()=>{window.__game.terrainMgr.active.patches.levels.forEach((l,i)=>{l.mesh.receiveShadow=false;l.mesh.visible=i===0;});});await sleep(300);await page.screenshot({path:dir+'/single-level.png'});
 console.log('Surface diagnostics captured');
}finally{await browser.close();}
