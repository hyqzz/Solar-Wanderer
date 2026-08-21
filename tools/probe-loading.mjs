// 加载性能探针：量化首屏可交互时间、贴图字节数、场景就绪时间。
// 用法：先起 dev server（npm run dev），再 node tools/probe-loading.mjs [--label=xxx]
import puppeteer from 'puppeteer';

const label = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const t0 = Date.now();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 120000 });

// 等待 start-btn 可用（disabled 解除即"可交互"）
await page.waitForFunction(() => {
  const b = document.getElementById('start-btn');
  return b && !b.disabled;
}, { timeout: 300000 });
const tInteractive = Date.now() - t0;

// 点击进入，等场景真正渲染（__game 存在且 registry 有内容）
await page.click('#start-btn');
await page.waitForFunction(() => window.__game?.registry?.size > 20, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
const tScene = Date.now() - t0;

// 资源统计：贴图请求数与传输字节
const stats = await page.evaluate(() => {
  const res = performance.getEntriesByType('resource');
  const tex = res.filter((r) => r.name.includes('/textures/'));
  const sum = (arr) => arr.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  return {
    totalRequests: res.length,
    texRequests: tex.length,
    texBytes: sum(tex),
    totalBytes: sum(res),
    texList: tex.map((r) => r.name.split('/').pop()),
  };
});

console.log(JSON.stringify({
  label,
  tInteractiveMs: tInteractive,
  tSceneMs: tScene,
  ...stats,
  texList: undefined,
  errors: errors.slice(0, 5),
}, null, 2));
if (process.env.VERBOSE) console.log('贴图请求:', stats.texList.join(', '));
await browser.close();
process.exit(errors.length ? 1 : 0);
