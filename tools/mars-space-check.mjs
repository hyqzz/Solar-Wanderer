import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = 'docs/sdlc/screenshots/';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--window-size=1920,1080','--hide-scrollbars','--disable-setuid-sandbox'],
  defaultViewport: { width: 1920, height: 1080 }
});
const page = await browser.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitArrival(ms=30000) {
  const t0=Date.now();
  while(Date.now()-t0<ms){try{if(!(await page.evaluate(()=>!!window.__game?.orbitCam?.flight)))return true;}catch{}await sleep(300);}
}

await page.goto('http://localhost:5173/?quality=high',{waitUntil:'networkidle2',timeout:60000});
await page.waitForSelector('#start-btn',{visible:true,timeout:30000});
await page.click('#start-btn');
await sleep(2500);

await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(20000);
await sleep(1000);

// 中距离（火星充满画面）
await page.evaluate(()=>{ window.__game.orbitCam.distTarget = 3389.5 * 3; });
await sleep(3000);
await page.screenshot({ path: OUT+'mars-space-mid.png' });
console.log('✅ 中距离');

// 近距离（能看清大气边缘厚度）
await page.evaluate(()=>{ window.__game.orbitCam.distTarget = 3389.5 * 1.5; });
await sleep(3000);
await page.screenshot({ path: OUT+'mars-space-close.png' });
console.log('✅ 近距离');

await browser.close();
