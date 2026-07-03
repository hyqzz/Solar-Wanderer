// 极区刷白回归验证（需 dev server）：
// 现象：火星/木星/土星两极整块发白，盖掉贴图原色。
// 根因：① 火星程序化极冠低至纬度 ~51° 且混 70% 白（真实极冠多在 80°+）；
//       ② 木星/土星极光发射 auroraL += aColor*auroraInt*ds 中 ds 为 km，
//          气巨大气壳跨度数千 km → 累积辐亮度被 ACES 压成白色。
// 还原：移除火星极冠分支；AURORA_MODE 摘除 jupiter/saturn（地球/海卫一保留）。
// 用法：node tools/repro-poles-white.mjs
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,1100', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 1100 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 120000 });
await page.click('#start-btn');
await sleep(4000);

const info = await page.evaluate(() => {
  const get = (id) => window.__game.builder.bodies.get(id);
  const mars = get('mars'), jup = get('jupiter'), sat = get('saturn'), earth = get('earth');
  return {
    marsFrag: mars?.mat?.fragmentShader ?? '',
    jupAurora: jup?.atmoMesh?.material.userData.uniforms.uAuroraMode.value,
    satAurora: sat?.atmoMesh?.material.userData.uniforms.uAuroraMode.value,
    earthAurora: earth?.atmoMesh?.material.userData.uniforms.uAuroraMode.value,
  };
});

check('火星材质着色器已无极冠白色混色（0.85, 0.88, 0.92）',
  !info.marsFrag.includes('0.85, 0.88, 0.92'), '仍包含极冠分支');
check('火星材质着色器保留其他效果（尘暴分支仍在）',
  info.marsFrag.includes('uBodyId == 4'), '尘暴分支意外丢失');
check('木星大气 uAuroraMode = 0（极光已摘除）', info.jupAurora === 0, `=${info.jupAurora}`);
check('土星大气 uAuroraMode = 0（极光已摘除）', info.satAurora === 0, `=${info.satAurora}`);
check('地球大气 uAuroraMode = 1（绿极光保留，未过度还原）', info.earthAurora === 1, `=${info.earthAurora}`);
check('无页面运行时错误', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
