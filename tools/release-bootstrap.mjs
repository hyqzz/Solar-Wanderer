import puppeteer from 'puppeteer';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.audit-reports/bootstrap';mkdirSync(out,{recursive:true});
const result={started:new Date().toISOString(),checks:[]};
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const permanent of [false,true]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.evaluateOnNewDocument(permanent=>{const original=HTMLCanvasElement.prototype.getContext;window.__failedContextCalls=0;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'&&(permanent||window.__failedContextCalls<2)){window.__failedContextCalls++;return null;}return original.call(this,type,...args);};},permanent);
  await page.goto('http://127.0.0.1:4179/?lang=en',{waitUntil:'domcontentloaded',timeout:30000});
  if(!permanent){
   await page.waitForFunction(()=>window.__game&&!document.querySelector('#start-btn').disabled,{timeout:30000});
   const state=await page.evaluate(()=>({attempts:window.__failedContextCalls,finite:window.__game.camera.position.toArray().every(Number.isFinite),canvas:window.__game.renderer.domElement===document.querySelector('#app')}));
   result.checks.push({name:'temporary WebGL creation failure retries on fresh canvas and initializes',ok:state.attempts===2&&state.finite&&state.canvas&&errors.length===0,detail:state,errors});
  }else{
   await page.waitForSelector('#startup-error',{timeout:10000});
   const state=await page.evaluate(()=>({attempts:window.__failedContextCalls,alert:document.querySelector('#startup-error').getAttribute('role'),text:document.querySelector('#startup-error').textContent,button:document.querySelector('#start-btn-text').textContent,enabled:!document.querySelector('#start-btn').disabled,noGame:!window.__game}));
   result.checks.push({name:'permanent WebGL unavailability exposes accessible retry state without uncaught exception',ok:state.attempts===6&&state.alert==='alert'&&state.text.includes('WebGL2')&&state.button==='Try again'&&state.enabled&&state.noGame&&errors.length===0,detail:state,errors});
   await page.screenshot({path:out+'/unavailable.png'});
   await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#start-btn')]);
   await page.waitForSelector('#startup-error');
   result.checks.push({name:'retry button reloads the initialization flow',ok:await page.evaluate(()=>window.__failedContextCalls===6&&!!document.querySelector('#startup-error'))});
  }
  await page.close();
 }
}finally{await browser.close();result.finished=new Date().toISOString();writeFileSync(out+'/results.json',JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));process.exitCode=result.checks.length!==3||result.checks.some(c=>!c.ok)?1:0;
