import { readFileSync, writeFileSync } from 'node:fs';
const root='.audit-reports/release/';
const current=JSON.parse(readFileSync(root+'results.json'));
const baseline=JSON.parse(readFileSync(root+'baseline-results.json'));
const catalog=JSON.parse(readFileSync(root+'catalog-results.json'));
if(!catalog.finished||catalog.runs.length!==4)throw Error('Catalog capture incomplete');
const merged={...current,onlineCaptured:baseline.started,catalogCaptured:catalog.started,runs:[...current.runs,...baseline.runs.filter(r=>r.name==='online')].map(r=>{
 const extra=catalog.runs.find(c=>c.name===r.name&&c.profile===r.profile);
 return{...r,scenes:[...r.scenes,...extra.scenes],catalogSession:{gpu:extra.gpu,errors:extra.errors,failed:extra.failed}};
})};
writeFileSync(root+'comparison-data.json',JSON.stringify(merged,null,2));
const candidates=merged.runs.filter(r=>r.name==='candidate');
const pairs=candidates.reduce((n,r)=>n+r.scenes.length,0);
const cards=candidates.flatMap(run=>run.scenes.map(s=>`<section data-profile="${run.profile}" data-key="${s.key}"><h2>${run.profile.toUpperCase()} · ${s.key}</h2><div class="pair"><figure><a href="online-${run.profile}/${s.key}.png" target="_blank"><img loading="lazy" src="online-${run.profile}/${s.key}.png"></a><figcaption>线上 sw.icodestar.net</figcaption></figure><figure><a href="candidate-${run.profile}/${s.key}.png" target="_blank"><img loading="lazy" src="candidate-${run.profile}/${s.key}.png"></a><figcaption>本次候选产物${s.perf?' · '+s.perf.fps.toFixed(1)+' FPS / P95 '+s.perf.p95Ms.toFixed(1)+' ms':''}</figcaption></figure></div></section>`)).join('\n');
writeFileSync(root+'comparison.html',`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Solar Wanderer 全目录上线对照证据</title><style>body{background:#101722;color:#e4ebf5;font:16px system-ui;margin:24px}header{position:sticky;top:0;background:#101722ee;padding:12px;z-index:2}h2{font-size:18px}.pair{display:flex;gap:10px}figure{width:50%;margin:0}img{width:100%;background:black}figcaption{padding:8px}section{border-bottom:1px solid #45566b;padding:16px 0}select,input,button{font:inherit;padding:8px}p{max-width:1000px}small{color:#aac2dd}</style><header><h1>${pairs} 组成对截图 · ${pairs*2} 张原图</h1><p>覆盖全部 70 个目录目的地。Low：Intel UHD 770 / D3D11；High：RTX 2080 Ti / Vulkan。1280×720、DPR 1、固定 TT JD 2461316。原有地表与天空详查之外，补齐其余目录的朝阳与偏转 60° 两种视角。线上和候选为分次采集，地形加载状态、岩石布局和相机最终着地点存在差异；不能将像素差直接解释成真实性评分，有限角度不等于所有可能角度。</p><select id="profile"><option value="">全部硬件</option><option value="low">Low</option><option value="high">High</option></select> <input id="filter" placeholder="筛选：moon / surface / orbit / catalog"> <button onclick="window.print()">打印</button><small>点击图像查看原图。功能、星历、弱网和长测结论见 RELEASE_READINESS.md。</small></header>${cards}<script>function filter(){const p=document.querySelector('#profile').value,q=document.querySelector('#filter').value.toLowerCase();for(const s of document.querySelectorAll('section'))s.hidden=!!((p&&s.dataset.profile!==p)||(q&&!s.dataset.key.includes(q)));}document.querySelector('#profile').onchange=filter;document.querySelector('#filter').oninput=filter;</script></html>`);
console.log(pairs+' comparison pairs generated');
