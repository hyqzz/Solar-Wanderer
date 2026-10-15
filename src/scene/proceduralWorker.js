import { proceduralMapPixels, proceduralBandsPixels } from './proceduralTextureData.js';
self.onmessage=async({data})=>{
  try {
    const iterator=(data.kind==='map'?proceduralMapPixels:proceduralBandsPixels)(...data.args);
    let step;do{step=iterator.next();}while(!step.done);
    const p=step.value,canvas=new OffscreenCanvas(p.width,p.height);
    canvas.getContext('2d').putImageData(new ImageData(p.data,p.width,p.height),0,0);
    const bitmap=await createImageBitmap(canvas,{imageOrientation:'flipY',premultiplyAlpha:'none'});
    self.postMessage({bitmap},[bitmap]);
  }catch(e){self.postMessage({error:e.message});}
};
