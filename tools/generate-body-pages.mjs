// Issue #51: SEO 每天体着陆页生成器
// 构建时从 src/astro/bodies.js 生成每个天体的静态 HTML 页面。
// 包含 OpenGraph/Twitter cards、描述、schema.org 结构化数据。
// 链接到 app 并预选该天体（通过 location hash: #<bodyId>,<lat>,<lon>,<dist>）。
//
// 用法：
//   node tools/generate-body-pages.mjs              # 生成到 public/bodies/
//   node tools/generate-body-pages.mjs --out=dist/bodies  # 指定输出目录
//   node tools/generate-body-pages.mjs --base=https://sw.icodestar.net  # 指定站点 URL
//
// 生成后，这些页面会被 Vite 作为静态资源复制到 dist/bodies/。
// 也可手动将 public/bodies/ 加入 sitemap.xml。

import { BODIES, MOON_PHYS, surfaceGravity, rotationPeriodHours } from '../src/astro/bodies.js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 解析命令行参数 ----
const args = process.argv.slice(2);
const getArg = (key) => {
  const found = args.find((a) => a.startsWith(`--${key}=`));
  return found ? found.slice(key.length + 3) : null;
};

const SITE_BASE = getArg('base') || 'https://sw.icodestar.net';
const OUT_DIR = resolve(__dirname, '..', getArg('out') || 'public/bodies');

// ---- 天体类型中英文映射 ----
const TYPE_LABEL = {
  star:   { zh: '恒星',   en: 'Star' },
  rocky:  { zh: '岩石行星', en: 'Rocky Planet' },
  gas:    { zh: '气态巨行星', en: 'Gas Giant' },
  ice:    { zh: '冰巨星',  en: 'Ice Giant' },
  dwarf:  { zh: '矮行星',  en: 'Dwarf Planet' },
  moon:   { zh: '卫星',    en: 'Moon' },
};

// ---- 父天体名称映射 ----
const PARENT_NAME = {
  sun: { zh: '太阳', en: 'Sun' },
  earth: { zh: '地球', en: 'Earth' },
  mars: { zh: '火星', en: 'Mars' },
  jupiter: { zh: '木星', en: 'Jupiter' },
  saturn: { zh: '土星', en: 'Saturn' },
  uranus: { zh: '天王星', en: 'Uranus' },
  neptune: { zh: '海王星', en: 'Neptune' },
  pluto: { zh: '冥王星', en: 'Pluto' },
};

// ---- 收集所有天体（行星 + 卫星），确保至少 30 个 ----
function collectBodies() {
  const list = [];
  for (const b of Object.values(BODIES)) {
    list.push({ ...b, category: 'planet' });
  }
  // MOON_PHYS 的 key 即为 id（对象本身无 id 字段）
  for (const [id, m] of Object.entries(MOON_PHYS)) {
    list.push({ ...m, id, category: 'moon' });
  }
  return list;
}

// ---- 生成预选该天体的 app 链接（location hash） ----
function appLink(body) {
  // hash 格式：#<focusId>,<lat>,<lon>,<dist_km>
  // dist 设为半径的 3 倍，给一个好看的初始视角
  const dist = Math.round(body.radiusKm * 3);
  return `${SITE_BASE}/#${body.id},0,0,${dist}`;
}

// ---- HTML 转义 ----
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- 生成单个天体页面 ----
function generateBodyPage(body) {
  const typeLabel = TYPE_LABEL[body.type] || TYPE_LABEL.moon;
  const parent = body.parent ? PARENT_NAME[body.parent] : null;
  const gravity = surfaceGravity(body).toFixed(2);
  const rotHours = rotationPeriodHours(body.id);
  const isMoon = body.category === 'moon';
  const pageUrl = `${SITE_BASE}/bodies/${body.id}.html`;
  const appUrl = appLink(body);
  const previewImg = `${SITE_BASE}/preview.png`;

  // 中英文标题与描述
  const titleZh = `${body.nameZh}（${body.nameEn}）— 1:1 真实太阳系探索 | Solar Wanderer`;
  const titleEn = `${body.nameEn} (${body.nameZh}) — 1:1 Real Solar System Explorer | Solar Wanderer`;

  const descZh = body.desc;
  const descEn = body.desc; // bodies.js 的 desc 是中文，这里生成英文描述
  // 生成英文描述（基于天体数据）
  const enDesc = generateEnglishDesc(body, typeLabel, parent, gravity, rotHours);

  // schema.org 结构化数据
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: body.nameEn,
    alternateName: body.nameZh,
    description: enDesc,
    url: pageUrl,
    image: previewImg,
    mainEntityOfPage: pageUrl,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'type', value: typeLabel.en },
      { '@type': 'PropertyValue', name: 'radiusKm', value: body.radiusKm },
      { '@type': 'PropertyValue', name: 'surfaceGravity', value: `${gravity} m/s²` },
      ...(parent ? [{ '@type': 'PropertyValue', name: 'parentBody', value: parent.en }] : []),
      ...(rotHours != null ? [{ '@type': 'PropertyValue', name: 'rotationPeriodHours', value: rotHours }] : []),
      { '@type': 'PropertyValue', name: 'landable', value: body.landable ? 'Yes' : 'No' },
    ],
    isPartOf: {
      '@type': 'WebApplication',
      name: 'Solar Wanderer',
      url: SITE_BASE,
    },
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(titleZh)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='7' fill='%23ffcc55'/><circle cx='26' cy='16' r='2' fill='%234a90d9'/></svg>" />

  <!-- Primary Meta Tags -->
  <meta name="title" content="${esc(titleZh)}" />
  <meta name="description" content="${esc(descZh)}" />
  <meta name="keywords" content="${esc(body.nameZh)}, ${esc(body.nameEn)}, ${esc(typeLabel.zh)}, ${esc(typeLabel.en)}, 太阳系, solar system, ${esc(body.nameEn)} facts, ${esc(body.nameEn)} 探索, Solar Wanderer, NASA, JPL, 天文, astronomy" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#05070f" />
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:title" content="${esc(titleZh)}" />
  <meta property="og:description" content="${esc(descZh)}" />
  <meta property="og:image" content="${esc(previewImg)}" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:site_name" content="Solar Wanderer 遨游太阳系" />
  <meta property="og:locale" content="zh_CN" />
  <meta property="og:locale:alternate" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${esc(pageUrl)}" />
  <meta name="twitter:title" content="${esc(titleEn)}" />
  <meta name="twitter:description" content="${esc(enDesc)}" />
  <meta name="twitter:image" content="${esc(previewImg)}" />

  <!-- Structured Data: schema.org -->
  <script type="application/ld+json">
  ${JSON.stringify(schema, null, 2)}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Solar Wanderer', item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 2, name: '天体目录 Bodies', item: `${SITE_BASE}/bodies/` },
      { '@type': 'ListItem', position: 3, name: `${body.nameZh} ${body.nameEn}`, item: pageUrl },
    ],
  }, null, 2)}
  </script>

  <style>
    :root {
      --bg: #05070f;
      --bg-card: #0c1020;
      --text: #e8ecf5;
      --text-dim: #8b93a8;
      --accent: #4a9eff;
      --accent-warm: #ffcc55;
      --border: #1e2540;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
      min-height: 100vh;
      padding: 2rem 1rem 4rem;
    }
    .container { max-width: 820px; margin: 0 auto; }
    .back-link { color: var(--accent); text-decoration: none; font-size: 0.9rem; display: inline-block; margin-bottom: 1.5rem; }
    .back-link:hover { text-decoration: underline; }
    .header { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .header .type-badge {
      display: inline-block; background: rgba(74,158,255,0.12); color: var(--accent);
      padding: 0.2rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
      margin-bottom: 0.75rem;
    }
    .header h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    .header h1 .en { color: var(--text-dim); font-weight: 400; font-size: 1.3rem; }
    .header .desc { color: var(--text); font-size: 1.05rem; margin-top: 0.75rem; }
    .cta {
      display: inline-block; background: var(--accent); color: #fff;
      padding: 0.8rem 1.8rem; border-radius: 8px; text-decoration: none;
      font-weight: 600; font-size: 1.05rem; margin: 1.5rem 0;
      transition: background 0.2s;
    }
    .cta:hover { background: #3a8eef; }
    .cta .arrow { margin-left: 0.5rem; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 1.5rem 1.75rem; margin-bottom: 1.25rem;
    }
    .card h2 { font-size: 1.15rem; color: var(--accent); margin-bottom: 0.75rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
    .stat { background: rgba(255,255,255,0.03); padding: 0.75rem 1rem; border-radius: 8px; }
    .stat .label { color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat .value { color: var(--text); font-size: 1.1rem; font-weight: 600; margin-top: 0.2rem; }
    .footer { text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.85rem; }
    .footer a { color: var(--text-dim); }
    .related { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .related a {
      display: inline-block; background: rgba(255,255,255,0.05); color: var(--accent);
      padding: 0.3rem 0.8rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem;
    }
    .related a:hover { background: rgba(74,158,255,0.15); }
    @media (max-width: 600px) {
      body { padding: 1rem 0.75rem 3rem; }
      .header h1 { font-size: 1.5rem; }
      .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← 返回 Solar Wanderer / Back to Solar Wanderer</a>

    <div class="header">
      <span class="type-badge">${esc(typeLabel.zh)} · ${esc(typeLabel.en)}${parent ? ` · ${esc(parent.zh)}的卫星` : ''}</span>
      <h1>${esc(body.nameZh)} <span class="en">${esc(body.nameEn)}</span></h1>
      <p class="desc">${esc(body.desc)}</p>
    </div>

    <a href="${esc(appUrl)}" class="cta">
      🚀 在 Solar Wanderer 中探索${esc(body.nameZh)} <span class="arrow">→</span>
    </a>

    <div class="card">
      <h2>📊 物理数据 / Physical Data</h2>
      <div class="stats">
        <div class="stat">
          <div class="label">半径 Radius</div>
          <div class="value">${body.radiusKm.toLocaleString()} km</div>
        </div>
        <div class="stat">
          <div class="label">表面重力 Gravity</div>
          <div class="value">${gravity} m/s²</div>
        </div>
        ${rotHours != null ? `<div class="stat">
          <div class="label">自转周期 Rotation</div>
          <div class="value">${Math.abs(rotHours).toFixed(1)} h${rotHours < 0 ? ' (逆行)' : ''}</div>
        </div>` : ''}
        <div class="stat">
          <div class="label">类型 Type</div>
          <div class="value">${esc(typeLabel.zh)} / ${esc(typeLabel.en)}</div>
        </div>
        ${parent ? `<div class="stat">
          <div class="label">环绕天体 Orbits</div>
          <div class="value">${esc(parent.zh)} / ${esc(parent.en)}</div>
        </div>` : ''}
        <div class="stat">
          <div class="label">可登陆 Landable</div>
          <div class="value">${body.landable ? '✅ 是 / Yes' : '❌ 否 / No'}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>🛰️ 关于${esc(body.nameZh)} / About ${esc(body.nameEn)}</h2>
      <p>${esc(body.desc)}</p>
      <p style="margin-top:0.75rem; color: var(--text-dim);">${esc(enDesc)}</p>
    </div>

    <div class="card">
      <h2>🎮 如何探索 / How to Explore</h2>
      <p>点击上方按钮打开 Solar Wanderer，应用会自动飞向${esc(body.nameZh)}。</p>
      <p style="margin-top:0.5rem">Click the button above to open Solar Wanderer — the app will automatically fly to ${esc(body.nameEn)}.</p>
      <ul style="margin-top:0.75rem; padding-left: 1.5rem; color: var(--text-dim); font-size: 0.9rem;">
        <li>滚轮拉近可降落地表（仅可登陆天体）/ Scroll to land on surface (landable bodies only)</li>
        <li>按 G 进入行走模式 / Press G to enter walking mode</li>
        <li>按 F 切换自由飞行 / Press F for free flight mode</li>
        <li>按 [ / ] 调整时间倍率 / Press [ / ] to adjust time speed</li>
      </ul>
    </div>

    <div class="card">
      <h2>🔗 相关天体 / Related Bodies</h2>
      <div class="related" id="related"></div>
    </div>

    <div class="footer">
      <p>Solar Wanderer · 遨游太阳系 — <a href="${esc(SITE_BASE)}">${esc(SITE_BASE.replace('https://',''))}</a></p>
      <p style="margin-top:0.5rem">基于 NASA JPL 星历 · MIT 开源 · <a href="https://github.com/hyqzz/Solar-Wanderer" target="_blank" rel="noopener">GitHub</a></p>
    </div>
  </div>

  <script>
    // 相关天体链接（同类型或同父天体）
    (function() {
      var related = document.getElementById('related');
      var links = ${JSON.stringify(getRelatedLinks(body))};
      links.forEach(function(l) {
        var a = document.createElement('a');
        a.href = l.url;
        a.textContent = l.name;
        related.appendChild(a);
      });
    })();
  </script>
</body>
</html>`;
}

// ---- 生成英文描述 ----
function generateEnglishDesc(body, typeLabel, parent, gravity, rotHours) {
  const parts = [];
  parts.push(`${body.nameEn} (${body.nameZh}) is a ${typeLabel.en.toLowerCase()}`);
  if (parent) parts.push(`orbiting ${parent.en}`);
  parts.push(`with a radius of ${body.radiusKm.toLocaleString()} km`);
  parts.push(`and surface gravity of ${gravity} m/s².`);
  if (rotHours != null) {
    parts.push(`Its rotation period is ${Math.abs(rotHours).toFixed(1)} hours${rotHours < 0 ? ' (retrograde)' : ''}.`);
  }
  parts.push(body.landable
    ? `You can land on and walk on ${body.nameEn} in Solar Wanderer.`
    : `${body.nameEn} is a gas/ice giant — you can fly through its atmosphere but cannot land.`);
  parts.push(`Explore ${body.nameEn} in real-time 1:1 scale at Solar Wanderer.`);
  return parts.join(' ');
}

// ---- 获取相关天体链接 ----
function getRelatedLinks(body) {
  const all = collectBodies();
  const links = [];
  // 同父天体
  if (body.parent) {
    for (const b of all) {
      if (b.id !== body.id && b.parent === body.parent) {
        links.push({ url: `./${b.id}.html`, name: `${b.nameZh} ${b.nameEn}` });
      }
    }
  }
  // 父天体本身
  if (body.parent && BODIES[body.parent]) {
    const p = BODIES[body.parent];
    links.unshift({ url: `./${p.id}.html`, name: `${p.nameZh} ${p.nameEn}` });
  }
  // 如果是行星，加入太阳
  if (body.category === 'planet' && body.id !== 'sun') {
    links.unshift({ url: './sun.html', name: '太阳 Sun' });
  }
  // 同类型天体（最多 5 个）
  const sameType = all.filter((b) => b.id !== body.id && b.type === body.type && !links.find((l) => l.url.includes(`/${b.id}.html`)));
  for (const b of sameType.slice(0, 5)) {
    links.push({ url: `./${b.id}.html`, name: `${b.nameZh} ${b.nameEn}` });
  }
  return links.slice(0, 10);
}

// ---- 生成索引页 ----
function generateIndexPage(bodies) {
  const pageUrl = `${SITE_BASE}/bodies/`;
  const planets = bodies.filter((b) => b.category === 'planet');
  const moons = bodies.filter((b) => b.category === 'moon');

  const bodyCard = (b) => {
    const typeLabel = TYPE_LABEL[b.type] || TYPE_LABEL.moon;
    return `<a href="./${b.id}.html" class="body-card">
      <span class="body-name-zh">${esc(b.nameZh)}</span>
      <span class="body-name-en">${esc(b.nameEn)}</span>
      <span class="body-type">${esc(typeLabel.zh)}</span>
    </a>`;
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>太阳系天体目录 — 1:1 真实太阳系探索 | Solar Wanderer</title>
  <meta name="description" content="探索太阳系的每一个天体：太阳、八大行星、矮行星、卫星。基于 NASA JPL 星历的 1:1 真实尺度太阳系探索。" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:title" content="太阳系天体目录 — Solar Wanderer" />
  <meta property="og:description" content="探索太阳系的每一个天体：太阳、八大行星、矮行星、卫星。" />
  <meta property="og:image" content="${SITE_BASE}/preview.png" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='7' fill='%23ffcc55'/><circle cx='26' cy='16' r='2' fill='%234a90d9'/></svg>" />
  <style>
    :root { --bg:#05070f; --bg-card:#0c1020; --text:#e8ecf5; --text-dim:#8b93a8; --accent:#4a9eff; --border:#1e2540; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Roboto,sans-serif; line-height:1.7; padding:2rem 1rem 4rem; }
    .container { max-width:960px; margin:0 auto; }
    .back-link { color:var(--accent); text-decoration:none; font-size:0.9rem; display:inline-block; margin-bottom:1.5rem; }
    h1 { font-size:1.8rem; margin-bottom:0.5rem; }
    .subtitle { color:var(--text-dim); margin-bottom:2rem; }
    h2 { font-size:1.2rem; color:var(--accent); margin:2rem 0 1rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:0.75rem; }
    .body-card { display:flex; flex-direction:column; gap:0.15rem; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:1rem; text-decoration:none; transition:border-color 0.2s; }
    .body-card:hover { border-color:var(--accent); }
    .body-name-zh { color:var(--text); font-size:1.05rem; font-weight:600; }
    .body-name-en { color:var(--text-dim); font-size:0.85rem; }
    .body-type { color:var(--accent); font-size:0.75rem; margin-top:0.25rem; }
    .footer { text-align:center; margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--border); color:var(--text-dim); font-size:0.85rem; }
    .footer a { color:var(--text-dim); }
    @media (max-width:600px) { .grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); } }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← 返回 Solar Wanderer</a>
    <h1>🪐 太阳系天体目录</h1>
    <p class="subtitle">Solar System Bodies Directory — ${bodies.length} 个天体 · 基于 NASA JPL 星历</p>

    <h2>☀️ 恒星与行星 / Stars & Planets</h2>
    <div class="grid">
      ${planets.map(bodyCard).join('\n      ')}
    </div>

    <h2>🌙 卫星 / Moons</h2>
    <div class="grid">
      ${moons.map(bodyCard).join('\n      ')}
    </div>

    <div class="footer">
      <p>Solar Wanderer · 遨游太阳系 — <a href="${esc(SITE_BASE)}">${esc(SITE_BASE.replace('https://',''))}</a></p>
      <p style="margin-top:0.5rem">基于 NASA JPL 星历 · MIT 开源 · <a href="https://github.com/hyqzz/Solar-Wanderer" target="_blank" rel="noopener">GitHub</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ---- 生成完整 sitemap.xml（主页 + 英文页 + 天体目录 + 全部天体页 + 隐私政策） ----
function generateSitemap(bodies) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = (loc, { changefreq = 'monthly', priority = '0.8', hreflang = false } = {}) => {
    const alt = hreflang ? `
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${SITE_BASE}/" />
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_BASE}/en/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_BASE}/" />` : '';
    return `  <url>
    <loc>${loc}</loc>${alt}
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  };

  const urls = [
    entry(`${SITE_BASE}/`, { changefreq: 'weekly', priority: '1.0', hreflang: true }),
    entry(`${SITE_BASE}/en/`, { changefreq: 'weekly', priority: '0.9', hreflang: true }),
    entry(`${SITE_BASE}/bodies/`, { changefreq: 'monthly', priority: '0.9' }),
    ...bodies.map((b) => entry(`${SITE_BASE}/bodies/${b.id}.html`)),
    entry(`${SITE_BASE}/privacy-policy.html`, { changefreq: 'yearly', priority: '0.3' }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

// ---- 主函数 ----
function main() {
  const bodies = collectBodies();
  console.log(`[generate-body-pages] 收集到 ${bodies.length} 个天体`);

  if (bodies.length < 30) {
    console.error(`[generate-body-pages] 错误：天体数量 ${bodies.length} 少于要求的 30 个`);
    process.exit(1);
  }

  // 创建输出目录
  mkdirSync(OUT_DIR, { recursive: true });

  // 生成每个天体页面
  let count = 0;
  for (const body of bodies) {
    const html = generateBodyPage(body);
    const outPath = resolve(OUT_DIR, `${body.id}.html`);
    writeFileSync(outPath, html, 'utf8');
    count++;
    console.log(`  ✅ ${body.id}.html — ${body.nameZh} (${body.nameEn})`);
  }

  // 生成索引页
  const indexHtml = generateIndexPage(bodies);
  writeFileSync(resolve(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`  ✅ index.html — 天体目录索引`);

  // 生成完整 sitemap.xml（写到 public/，与天体页保持同步）
  const sitemapXml = generateSitemap(bodies);
  writeFileSync(resolve(OUT_DIR, '..', 'sitemap.xml'), sitemapXml, 'utf8');
  console.log(`  ✅ sitemap.xml — 完整站点地图（${bodies.length + 4} 个 URL）`);

  console.log(`\n[generate-body-pages] 完成：生成 ${count} 个天体页面 + 1 个索引页 + sitemap.xml`);
  console.log(`[generate-body-pages] 输出目录：${OUT_DIR}`);
  console.log(`[generate-body-pages] 站点地址：${SITE_BASE}`);
  console.log(`\n[generate-body-pages] 下一步：部署后在 Google Search Console / Bing / 百度站长提交 sitemap`);
}

main();
