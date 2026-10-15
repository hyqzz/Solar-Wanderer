// 探针：本项目用的是 GLSL ES 1.00 着色器跑在 WebGL2 上。
// 要修掉反经线处的 LOD 尖峰，需要 textureGrad（或 EXT_shader_texture_lod）。
// 先确认这个上下文里到底哪个可用，别写完才发现编译不过。
import puppeteer from 'puppeteer';

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 6000));

const out = await p.evaluate(() => {
  const gl = window.__game.renderer.getContext();
  const res = {
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    version: gl.getParameter(gl.VERSION),
    shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    extShaderTextureLod: !!gl.getExtension('EXT_shader_texture_lod'),
  };
  // 逐个试编译：GLSL ES 1.00 里 textureGrad / texture2DGradEXT / texture2DLodEXT
  const vs = `attribute vec2 aP; varying vec2 vUv;
    void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
  // 注意：ESSL1 里 dFdx 需要 GL_OES_standard_derivatives，texture2DLod 需要
  // GL_EXT_shader_texture_lod。第一次探针没写这两行扩展声明，于是"失败"其实是
  // 缺扩展而不是函数不存在——差点据此得出"这条路走不通"的错误结论。
  const tryFrag = (body) => {
    const fs = `#extension GL_OES_standard_derivatives : enable
      #extension GL_EXT_shader_texture_lod : enable
      precision highp float; varying vec2 vUv; uniform sampler2D uT;
      void main(){ ${body} }`;
    const s = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(s, fs);
    gl.compileShader(s);
    const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
    const log = ok ? '' : gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    return ok ? 'OK' : log.split('\n')[0].slice(0, 120);
  };
  res.plain = tryFrag('gl_FragColor = texture2D(uT, vUv);');
  res.grad = tryFrag('gl_FragColor = textureGrad(uT, vUv, dFdx(vUv), dFdy(vUv));');
  res.gradExt = tryFrag('gl_FragColor = texture2DGradEXT(uT, vUv, dFdx(vUv), dFdy(vUv));');
  res.lodExt = tryFrag('gl_FragColor = texture2DLodEXT(uT, vUv, 2.0);');
  res.lodCore = tryFrag('gl_FragColor = texture2DLod(uT, vUv, 2.0);');
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
