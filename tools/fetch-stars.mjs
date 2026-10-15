// 从 CDS VizieR 拉取耶鲁亮星星表（BSC5, V/50），生成真实星场数据。
//
// 为什么必须换掉手写表：src/scene/starfield.js 里的 BRIGHT_STARS 是**填充出来的**
// ——后半段把前面出现过的星按坐标回收复制、只改星等（天狼星在 6.752/−16.72 出现两次，
// 星等 −1.46 与 2.95 并存；织女、毕宿五、心宿二同样各出现多次），
// 专名也大量错位（Ankaa 出现在 5 个不同坐标、Alnair 与真实位置差 17°）。
// 另有 11900 颗完全虚构的背景星。结果是星座形状似是而非、亮星亮度关系不对——
// 恰恰是"看着像真的、一对照就露"的典型。
//
// BSC5 是标准亮星星表：9110 颗，V ≤ 6.5（肉眼极限），含 J2000 赤经赤纬、
// V 星等、B−V 色指数、三角视差。专名在 notes 文件的 `1N:` 行里（按 HR 号索引）。
//
// 输出：
//   public/data/stars.bin        —— 全表二进制（ra/dec/mag/B−V/距离）
//   src/astro/stars.generated.js —— 有专名的子集（供标签使用）+ 中文名映射
//
// 用法：node tools/fetch-stars.mjs        （下载缓存到 tools/.cache/stars/）
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const BASE = 'https://cdsarc.cds.unistra.fr/ftp/cats/V/50';
const CACHE = new URL('./.cache/stars/', import.meta.url);
mkdirSync(CACHE, { recursive: true });

async function grab(name) {
  const gz = new URL(name + '.gz', CACHE);
  const txt = new URL(name + '.txt', CACHE);
  if (existsSync(txt)) return readFileSync(txt, 'utf8');
  const url = `${BASE}/${name}.gz`;
  process.stdout.write(`下载 ${url} … `);
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(gz, buf);
  const out = gunzipSync(buf);
  writeFileSync(txt, out);
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  return out.toString('utf8');
}

/** 固定宽度字段（1-based 闭区间），与 VizieR ReadMe 的 byte-by-byte 说明一致 */
const field = (line, a, b) => line.slice(a - 1, b);

const catalog = await grab('catalog');
const notes = await grab('notes');

// ── 解析主表 ────────────────────────────────────────────────────────────────
const stars = [];
let skipped = 0;
for (const line of catalog.split('\n')) {
  if (!line.trim()) continue;
  const hr = Number(field(line, 1, 4));
  if (!Number.isFinite(hr) || hr <= 0) { skipped++; continue; }
  // J2000 赤经（时 分 秒）、赤纬（符号 度 分 秒）
  const rah = Number(field(line, 76, 77)), ram = Number(field(line, 78, 79));
  const ras = Number(field(line, 80, 83));
  const deSign = field(line, 84, 84).trim();
  const ded = Number(field(line, 85, 86)), dem = Number(field(line, 87, 88));
  const des = Number(field(line, 89, 90));
  if (![rah, ram, ras, ded, dem, des].every(Number.isFinite) || (deSign !== '+' && deSign !== '-')) {
    skipped++; continue;
  }
  const raDeg = (rah + ram / 60 + ras / 3600) * 15;
  const decDeg = (ded + dem / 60 + des / 3600) * (deSign === '-' ? -1 : 1);
  const vmag = Number(field(line, 103, 107));
  const bv = Number(field(line, 110, 114));
  const plx = Number(field(line, 162, 166));           // 三角视差（角秒）
  if (!Number.isFinite(vmag)) { skipped++; continue; }
  // 视差有效才换算距离；否则给一个"很远"的哨兵值（视差小到看不出，不影响观感）
  const distLy = Number.isFinite(plx) && plx > 0.0001 ? 3.26156 / plx : 0;
  stars.push({ hr, raDeg, decDeg, vmag, bv: Number.isFinite(bv) ? bv : 0.6, distLy });
}
console.log(`主表：${stars.length} 颗，跳过 ${skipped} 行`);

// ── 解析专名（notes 的 1N: 行）─────────────────────────────────────────────
const nameByHr = new Map();
for (const line of notes.split('\n')) {
  const m = /^\s*(\d+)\s+1N:\s*(.+?)\s*$/.exec(line);
  if (!m) continue;
  const hr = Number(m[1]);
  // 形如 "ALPHERATZ; Alpherat; Sirrah; Sirah.  Also formerly called Delta Peg."
  // 取分号/句号前的第一个名字作为主名（BSC5 惯例：首个即最常用）
  const first = m[2].split(/[;.]/)[0].trim();
  if (!first || /^Also\b/i.test(first)) continue;
  // 规范化：全大写 → 首字母大写（BSC5 用大写书写专名）
  const pretty = first.length > 3 && first === first.toUpperCase()
    ? first[0] + first.slice(1).toLowerCase()
    : first;
  if (!nameByHr.has(hr)) nameByHr.set(hr, pretty);
}
console.log(`专名：${nameByHr.size} 颗`);

// ── 常用中文名（按英文专名索引；只收录确有通行译名的）──────────────────────
const ZH = {
  Sirius: '天狼星', Canopus: '老人星', Rigil: '南门二', Arcturus: '大角星',
  Vega: '织女一', Capella: '五车二', Rigel: '参宿七', Procyon: '南河三',
  Achernar: '水委一', Betelgeuse: '参宿四', Hadar: '马腹一', Altair: '河鼓二',
  Acrux: '十字架二', Aldebaran: '毕宿五', Antares: '心宿二', Spica: '角宿一',
  Pollux: '北河三', Fomalhaut: '北落师门', Deneb: '天津四', Regulus: '轩辕十四',
  Polaris: '北极星', Castor: '北河二', Peacock: '孔雀十一', Bellatrix: '参宿五',
  Alnilam: '参宿二', Alnitak: '参宿一', Mintaka: '参宿三', Saiph: '参宿六',
  Alhena: '井宿三', Dubhe: '天枢', Merak: '天璇', Phecda: '天玑', Megrez: '天权',
  Alioth: '玉衡', Mizar: '开阳', Alkaid: '摇光', Alphard: '星宿一',
  Alpheratz: '壁宿二', Mirach: '奎宿九', Almach: '天大将军一', Mirfak: '天船三',
  Algol: '大陵五', Denebola: '五帝座一', Algieba: '轩辕十二', Alcyone: '昴宿六',
  Elnath: '五车五', Menkalinan: '五车三', Wezen: '弧矢一', Adhara: '弧矢七',
  Suhail: '弧矢二', Naos: '弧矢增二十二', Avior: '海石一', Miaplacidus: '南船五',
  Atria: '三角形三', Shaula: '尾宿八', Sargas: '尾宿五', Kaus: '箕宿三',
  Nunki: '斗宿六', Rasalhague: '侯', Rasalgethi: '帝座', Enif: '危宿三',
  Markab: '室宿一', Scheat: '室宿二', Algenib: '壁宿一', Diphda: '土司空',
  Menkar: '天囷一', Acamar: '天园六', Acubens: '柳宿增三', Zubenelgenubi: '氐宿一',
  Unukalhai: '蜀', Alderamin: '天钩五', Errai: '少卫增八', Vindemiatrix: '东次将',
  Zosma: '西上相', Chertan: '西次相', Sadr: '天津一', Gienah: '轸宿一',
  Albireo: '辇道增七', Rukbat: '斗宿四', Tarazed: '河鼓三', Alshain: '河鼓一',
  Sadalsuud: '虚宿一', Sadalmelik: '危宿一', Skat: '羽林二十六', Ankaa: '蛇首一',
  Alnair: '鹤一', Tiaki: '鹤二', Acamar2: '', Alphard2: '',
};
delete ZH.Acamar2; delete ZH.Alphard2;

// ── 输出 ────────────────────────────────────────────────────────────────────
// 二进制：'SWST' + u16 版本 + u16 保留 + u32 数量 + N×(f32 ra, f32 dec, f32 V, f32 B−V, f32 距离ly)
const bin = Buffer.alloc(12 + stars.length * 20);
bin.write('SWST', 0, 'ascii');
bin.writeUInt16LE(1, 4);
bin.writeUInt16LE(0, 6);
bin.writeUInt32LE(stars.length, 8);
stars.forEach((s, i) => {
  const o = 12 + i * 20;
  bin.writeFloatLE(s.raDeg, o);
  bin.writeFloatLE(s.decDeg, o + 4);
  bin.writeFloatLE(s.vmag, o + 8);
  bin.writeFloatLE(s.bv, o + 12);
  bin.writeFloatLE(s.distLy, o + 16);
});
const binPath = new URL('../public/data/stars.bin', import.meta.url);
mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
writeFileSync(binPath, bin);
console.log(`→ public/data/stars.bin  ${(bin.length / 1024).toFixed(0)} KB`);

// 有专名的子集：供标签与"经典亮星"用
const named = stars.filter((s) => nameByHr.has(s.hr)).map((s) => {
  const en = nameByHr.get(s.hr);
  return { hr: s.hr, en, zh: ZH[en] ?? '', ra: +(s.raDeg / 15).toFixed(5), dec: +s.decDeg.toFixed(4),
    mag: +s.vmag.toFixed(2), ly: s.distLy > 0 ? +s.distLy.toFixed(1) : 0 };
}).sort((a, b) => a.mag - b.mag);
const js = `// 由 tools/fetch-stars.mjs 生成，请勿手改。
// 数据源：Yale Bright Star Catalogue, 5th Revised Ed.（Hoffleit & Warren 1991, CDS V/50）。
// 只保留 BSC5 notes 文件里确有专名的星（${named.length} 颗），供标签使用；
// 全表 ${stars.length} 颗在 public/data/stars.bin。
// zh 为空表示该星没有通行的中文译名——**不要编**，留空比编一个错的强。
export const NAMED_STARS = ${JSON.stringify(named)};

/** 星表规模（与 stars.bin 的记录数一致，供测试核对） */
export const CATALOG_COUNT = ${stars.length};
`;
writeFileSync(new URL('../src/astro/stars.generated.js', import.meta.url), js);
console.log(`→ src/astro/stars.generated.js  ${named.length} 颗有专名`);

// ── 自检：几颗标志星的位置必须对得上（写死期望值，防解析列号错位）──────────
// 位置卡得很紧（0.02°），因为它才是"列号有没有错位"的证据；星等放宽到 0.1 mag，
// 因为不同星表对同一颗星的 V 本来就有出入（北极星是变星 1.97–2.02、
// 参宿七 0.12–0.18），拿别处的数字当期望值只会误报。
// 按**专名**查而不是按 HR 号：HR 号靠记忆写只会把自己记错的账算到解析头上
// （第一版就因此把参宿四、心宿二的 HR 写错，误报了两条）。
const expect = [
  ['Sirius', 101.287, -16.716, -1.46],
  ['Vega', 279.234, 38.784, 0.03],
  ['Polaris', 37.955, 89.264, 2.02],
  ['Rigel', 78.634, -8.202, 0.12],
  ['Betelgeuse', 88.793, 7.407, 0.45],
  ['Antares', 247.352, -26.432, 0.96],   // 变星，各家星表 0.96–1.14 不等
  ['Aldebaran', 68.980, 16.509, 0.85],
];
let bad = 0;
for (const [en, ra, dec, mag] of expect) {
  const hr = [...nameByHr.entries()].find(([, n]) => n === en)?.[0];
  const s = stars.find((x) => x.hr === hr);
  if (!s) { console.log(`✗ ${en} 不在表里（专名解析或主表有问题）`); bad++; continue; }
  const dRa = Math.abs(s.raDeg - ra), dDec = Math.abs(s.decDeg - dec);
  const dMag = Math.abs(s.vmag - mag);
  const ok = dRa < 0.02 && dDec < 0.02 && dMag < 0.1;
  console.log(`${ok ? '✓' : '✗'} ${en.padEnd(11)} HR ${String(hr).padStart(4)} ` +
    `ra ${s.raDeg.toFixed(3)} (期望 ${ra}) dec ${s.decDeg.toFixed(3)} (期望 ${dec}) V ${s.vmag}`);
  if (!ok) bad++;
}
if (bad) { console.log(`\n${bad} 项自检不通过`); process.exit(1); }
console.log('\n自检通过');
