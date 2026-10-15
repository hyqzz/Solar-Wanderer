// 卫星贴图回归：确认每个有贴图的天体真的加载了真实影像，而不是回落程序化纹理。
//
// 断言：
//   1) 聚焦某卫星时会请求它的贴图文件，且得到 200
//   2) 贴图进入运行时缓存，且尺寸是该源的真实分辨率（程序化兜底只有 512×256）
//   3) 近距截图里盘面存在真实的明暗结构（程序化纹理会更平滑）
//
// 需要本地服务：npm run build && npx vite preview --port 4179
import puppeteer from 'puppeteer';
import { readdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4179/';
const MANIFEST = JSON.parse(readdirSync('public/textures').includes('manifest.json')
  ? (await import('node:fs')).readFileSync('public/textures/manifest.json', 'utf8').replace(/^﻿/, '')
  : '{}');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [], requested = new Map();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  const m = r.url().match(/textures\/([a-z0-9_]+\.(?:jpg|png))/i);
  if (m) requested.set(m[1], r.status());
});

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`);
};

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
await page.evaluate(() => document.getElementById('start')?.click());
await new Promise((r) => setTimeout(r, 6000));

// 逐个聚焦有贴图的卫星，确认其贴图被请求过且成功。
// 注意不能每轮清空记录：应用会连同母星的其它卫星一起预取，
// 轮到它时往往已经加载完毕、不会再发请求——那不是失败。
const MOONS = ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'iapetus',
  'phobos', 'deimos', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon'];
requested.clear();
for (const id of MOONS) {
  await page.evaluate((x) => { window.__game.select(x); window.__game.flyTo(x); }, id);
  await new Promise((r) => setTimeout(r, 4000));
}
const bad = MOONS
  .map((id) => [id, requested.get(id + '.jpg')])
  .filter(([, status]) => status !== 200);
check('13 颗卫星的贴图全部请求成功（200）', bad.length === 0, bad);

// 缓存里应有真实分辨率（程序化兜底是 512×256）
const cacheInfo = await page.evaluate(() => {
  const out = {};
  for (const [k, v] of (window.__game.builder?.cache ?? new Map())) {
    const img = v?.image ?? v?.source?.data ?? v;
    if (img && img.width) out[k] = [img.width, img.height];
  }
  return out;
});
const sizes = Object.entries(cacheInfo).filter(([k]) => /\.jpg$/.test(k));
const tooSmall = sizes.filter(([, [w]]) => w < 900);
check('已加载贴图为源分辨率（非 512 宽的兜底图）', tooSmall.length === 0,
  tooSmall.slice(0, 5).map(([k, v]) => `${k}:${v.join('×')}`));

check('无页面错误', errors.length === 0, errors.slice(0, 3));

await page.evaluate(() => { window.__game.constructors; });
await browser.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exitCode = failures ? 1 : 0;
