import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { textureBitmapOptions, drawTextureForSampling } from '../src/scene/builder.js';
const browser=await puppeteer.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],defaultViewport:{width:64,height:64,deviceScaleFactor:1}});
try {
 const page=await browser.newPage();
 const result=await page.evaluate(async(code,options,drawCode)=>{
  const THREE=await import(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));
  const fixture=document.createElement('canvas');fixture.width=fixture.height=2;const c=fixture.getContext('2d');c.fillStyle='red';c.fillRect(0,0,2,1);c.fillStyle='blue';c.fillRect(0,1,2,1);
  const image=new Image();image.src=fixture.toDataURL();await image.decode();
  const blob=await new Promise(r=>fixture.toBlob(r));const bitmap=await createImageBitmap(blob,options);
  const renderer=new THREE.WebGLRenderer();renderer.setSize(2,2);const target=new THREE.WebGLRenderTarget(2,2);renderer.setRenderTarget(target);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;const scene=new THREE.Scene();
  const material=new THREE.MeshBasicMaterial({toneMapped:false});scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  function render(source){const tex=new THREE.Texture(source);tex.needsUpdate=true;tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;material.map=tex;material.needsUpdate=true;renderer.render(scene,camera);const pixels=new Uint8Array(16);renderer.readRenderTargetPixels(target,0,0,2,2,pixels);tex.dispose();return [...pixels];}
  const preview=render(image),upgraded=render(bitmap);
  const cv=document.createElement('canvas');cv.width=cv.height=2;const ctx=cv.getContext('2d');const draw=eval('('+drawCode+')');draw(ctx,bitmap,2,2);const cpu=[...ctx.getImageData(0,0,2,2).data],original=[...c.getImageData(0,0,2,2).data];
  target.dispose();renderer.dispose();bitmap.close();
  return {preview,upgraded,cpu,original,gpuMatch:preview.every((v,i)=>v===upgraded[i]),cpuMatch:cpu.every((v,i)=>v===original[i])};
 },readFileSync('node_modules/three/build/three.module.js','utf8'),textureBitmapOptions({width:2,height:2},2),drawTextureForSampling.toString());
 mkdirSync('.audit-reports',{recursive:true});writeFileSync('.audit-reports/texture-orientation.json',JSON.stringify(result,null,2));console.log(result);
 process.exitCode=result.gpuMatch&&result.cpuMatch?0:1;
}finally{await browser.close();}
