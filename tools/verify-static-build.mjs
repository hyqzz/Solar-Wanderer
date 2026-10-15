// Verify relative URLs at the GitHub Pages prefix, not only at domain root.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist'),prefix='/Solar-Wanderer/',base='https://example.invalid';
const failures=[];let checked=0;
function walk(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
for(const file of walk(root).filter(f=>f.endsWith('.html'))) {
  const page=new URL(prefix+path.relative(root,file).replaceAll('\\','/'),base);
  for(const match of readFileSync(file,'utf8').matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|mailto:|#|javascript:)/.test(match[1]))continue;
    const url=new URL(match[1],page);checked++;
    if(!url.pathname.startsWith(prefix)) { failures.push(path.relative(root,file)+': leaves prefix '+match[1]);continue; }
    let target=path.join(root,decodeURIComponent(url.pathname.slice(prefix.length)));
    if(existsSync(target)&&statSync(target).isDirectory())target=path.join(target,'index.html');
    if(!existsSync(target))failures.push(path.relative(root,file)+': missing '+match[1]);
  }
}
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json')));
const manifestUrl=new URL(prefix+'manifest.json',base);
for(const item of [...manifest.icons,...manifest.screenshots]) {
  const url=new URL(item.src,manifestUrl);checked++;
  if(!url.pathname.startsWith(prefix)||!existsSync(path.join(root,url.pathname.slice(prefix.length))))failures.push('manifest: '+item.src);
}
for(const field of ['id','start_url','scope']) if(new URL(manifest[field],manifestUrl).pathname!==prefix)failures.push('manifest prefix '+field);
const result={checked,failures};console.log(JSON.stringify(result,null,2));process.exitCode=failures.length?1:0;
