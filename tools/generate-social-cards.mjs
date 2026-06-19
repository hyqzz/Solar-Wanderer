import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ASSETS = 'campaign/assets';
const OUT = 'campaign/assets/social-cards';

const cards = [
  {
    id: 'intro',
    image: 'screenshots/earth-orbit_1920x1080.png',
    en: { title: 'A real-time 1:1 solar system in your browser', subtitle: 'Powered by NASA JPL ephemerides', cta: 'sw.icodestar.net' },
    zh: { title: '浏览器里的真实 1:1 太阳系', subtitle: '基于 NASA JPL 星历实时计算', cta: 'sw.icodestar.net' }
  },
  {
    id: 'moon',
    image: 'screenshots/moon-earthrise_1920x1080.png',
    en: { title: 'Stand on the Moon. Watch Earth rise.', subtitle: 'Real positions. Real scale.', cta: 'sw.icodestar.net' },
    zh: { title: '站在月球，看地球升起', subtitle: '真实位置 · 真实比例', cta: 'sw.icodestar.net' }
  },
  {
    id: 'mars',
    image: 'screenshots/mars-sunset_1920x1080.png',
    en: { title: 'Mars sunsets are blue', subtitle: 'See it for yourself', cta: 'sw.icodestar.net' },
    zh: { title: '火星的日落，是蓝色的', subtitle: '亲眼去看看', cta: 'sw.icodestar.net' }
  },
  {
    id: 'saturn',
    image: 'screenshots/saturn-rings_1920x1080.png',
    en: { title: 'Drift through Saturn\'s rings', subtitle: '28,000 km wide, only 10–20 m thick', cta: 'sw.icodestar.net' },
    zh: { title: '穿越土星环', subtitle: '宽 28 万公里，厚仅 10–20 米', cta: 'sw.icodestar.net' }
  },
  {
    id: 'jupiter',
    image: 'screenshots/jupiter-redspot_1920x1080.png',
    en: { title: 'A storm that could swallow Earth', subtitle: 'The Great Red Spot', cta: 'sw.icodestar.net' },
    zh: { title: '能吞下地球的风暴', subtitle: '木星大红斑', cta: 'sw.icodestar.net' }
  },
  {
    id: 'sun',
    image: 'screenshots/sun-closeup_1920x1080.png',
    en: { title: 'Start at the Sun', subtitle: 'Then go anywhere', cta: 'sw.icodestar.net' },
    zh: { title: '从太阳出发', subtitle: '去往任何地方', cta: 'sw.icodestar.net' }
  },
  {
    id: 'scale',
    image: 'screenshots/earth-orbit_1920x1080.png',
    en: { title: '0.5 m to 100,000 AU', subtitle: 'True 1:1 scale', cta: 'sw.icodestar.net' },
    zh: { title: '0.5 米到 10 万 AU', subtitle: '真实 1:1 比例', cta: 'sw.icodestar.net' }
  },
  {
    id: 'free',
    image: 'screenshots/saturn-rings_1920x1080.png',
    en: { title: 'No install. No signup. No ads.', subtitle: 'Open source under MIT', cta: 'sw.icodestar.net' },
    zh: { title: '无需安装 · 无需注册 · 无广告', subtitle: 'MIT 开源', cta: 'sw.icodestar.net' }
  }
];

function buildHTML(opts) {
  const { width, height, imagePath, title, subtitle, cta, lang } = opts;
  const imgData = fs.readFileSync(imagePath).toString('base64');
  const titleSize = width <= 1080 ? '42px' : '56px';
  const subSize = width <= 1080 ? '24px' : '28px';
  const ctaSize = width <= 1080 ? '22px' : '24px';
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${width}px; height: ${height}px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }
  .bg {
    position: absolute; inset: 0;
    background: url('data:image/png;base64,${imgData}') center/cover no-repeat;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.75) 100%);
  }
  .content {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: ${width * 0.08}px;
    text-align: ${lang === 'zh' ? 'left' : 'left'};
  }
  .title {
    font-size: ${titleSize}; font-weight: 800;
    line-height: 1.15;
    margin-bottom: ${width * 0.03}px;
    text-shadow: 0 2px 12px rgba(0,0,0,0.8);
  }
  .subtitle {
    font-size: ${subSize}; font-weight: 400;
    opacity: 0.92;
    margin-bottom: ${width * 0.05}px;
    text-shadow: 0 1px 6px rgba(0,0,0,0.7);
  }
  .cta {
    display: inline-block;
    font-size: ${ctaSize}; font-weight: 600;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.35);
    padding: ${width * 0.022}px ${width * 0.04}px;
    border-radius: ${width * 0.04}px;
    backdrop-filter: blur(4px);
  }
  .brand {
    position: absolute; top: ${width * 0.06}px; left: ${width * 0.06}px;
    font-size: ${width * 0.035}px; font-weight: 700; letter-spacing: 0.05em;
    text-shadow: 0 1px 4px rgba(0,0,0,0.7);
  }
</style>
</head>
<body>
  <div class="bg"></div>
  <div class="overlay"></div>
  <div class="brand">SOLAR WANDERER · 遨游太阳系</div>
  <div class="content">
    <div class="title">${title.replace(/'/g, "&#39;")}</div>
    <div class="subtitle">${subtitle.replace(/'/g, "&#39;")}</div>
    <div class="cta">${cta}</div>
  </div>
</body>
</html>`;
}

async function renderCard(page, html, outPath, width, height) {
  const tmp = path.join(OUT, `_tmp_${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewport({ width, height });
  await page.goto('file:///' + path.resolve(tmp).replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: outPath });
  fs.unlinkSync(tmp);
  console.log('Card:', outPath);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const card of cards) {
    const imagePath = path.join(ASSETS, card.image);
    if (!fs.existsSync(imagePath)) continue;

    // 1080x1350 (Instagram / 小红书 / 知乎)
    await renderCard(page,
      buildHTML({ width: 1080, height: 1350, imagePath, ...card.en, lang: 'en' }),
      path.join(OUT, `${card.id}_en_1080x1350.png`), 1080, 1350);
    await renderCard(page,
      buildHTML({ width: 1080, height: 1350, imagePath, ...card.zh, lang: 'zh' }),
      path.join(OUT, `${card.id}_zh_1080x1350.png`), 1080, 1350);

    // 1080x1920 (Stories / 抖音 / 小红书 9:16)
    await renderCard(page,
      buildHTML({ width: 1080, height: 1920, imagePath, ...card.en, lang: 'en' }),
      path.join(OUT, `${card.id}_en_1080x1920.png`), 1080, 1920);
    await renderCard(page,
      buildHTML({ width: 1080, height: 1920, imagePath, ...card.zh, lang: 'zh' }),
      path.join(OUT, `${card.id}_zh_1080x1920.png`), 1080, 1920);
  }

  await browser.close();
  console.log('Social cards generated.');
}

main().catch(e => { console.error(e); process.exit(1); });
