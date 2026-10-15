import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir=path.resolve('.audit-reports/release');
const result=JSON.parse(readFileSync(path.join(dir,'comparison-data.json')));
const browser=await puppeteer.launch({headless:true,defaultViewport:{width:1600,height:1150,deviceScaleFactor:1}});
try{
 const page=await browser.newPage();
 for(const r of result.runs.filter(r=>r.name==='candidate')){for(let offset=0;offset<r.scenes.length;offset+=10){
  const cards=r.scenes.slice(offset,offset+10).map(s=>`<div><h3>${r.profile} · ${s.key}</h3><div class="images">${['online','candidate'].map(v=>`<figure><img src="${pathToFileURL(path.join(dir,v+'-'+r.profile,s.key+'.png')).href}"><figcaption>${v}</figcaption></figure>`).join('')}</div></div>`).join('');
  const file=path.join(dir,'overview-temp.html');writeFileSync(file,`<html><meta charset="utf-8"><style>body{background:#101722;color:white;font:14px system-ui;margin:8px}main{display:grid;grid-template-columns:1fr 1fr;gap:8px}h3{margin:4px;font-size:14px}.images{display:flex}figure{width:50%;margin:0}img{width:100%}figcaption{font-size:12px}</style><main>${cards}</main></html>`);
  await page.goto(pathToFileURL(file).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  await page.screenshot({path:path.join(dir,`overview-${r.profile}-${offset/10}.png`),fullPage:true});
 }}
}finally{await browser.close();}
