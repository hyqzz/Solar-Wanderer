// Reproducible Horizons samples, sharded by year.
//
// 为什么分片：旧实现是"每目标一个文件、覆盖整个窗口"。窗口从 16 个月扩到 10 年后，
// 单个文件会从 0.5 MB 涨到 5–8 MB（快卫星必须密采样），而用户 99% 的时间只在
// 当前年份附近。按年切分后，一次只需要下载当前年份那一片（≤0.4 MB/目标），
// 窗口却长了 7.5 倍。
//
// 为什么按目标给不同步长：Hermite 三次插值的误差 ≈ R·(2πh/P)⁴/384。
// 旧实现给所有卫星一律 60 分钟——对月球（P=27.3 天）比需要密 30 倍，
// 对火卫一（P=0.32 天）又刚好够。这里按 P 与 a 反解出满足"≤10 km"的步长。
//
// 为什么卫星用 float32：卫星状态是相对母星的矢量（10⁴–10⁶ km），float32 的
// 量化步长 < 0.3 km；行星/海外天体/探测器是日心矢量（可达 10¹⁰ km），必须 float64。
// 这一项把卫星数据量减半。
//
// Serial API requests respect JPL service limits; existing valid shards are reused,
// so the job is resumable.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TNO_DATA, TNO_IDS } from '../src/astro/tno.js';

const out = new URL('../public/data/ephemeris/', import.meta.url);
mkdirSync(out, { recursive: true });

const startYear = Number.parseInt(process.argv[2] ?? '2025', 10);
const endYear = Number.parseInt(process.argv[3] ?? '2035', 10);   // 不含
const years = [];
for (let y = startYear; y < endYear; y++) years.push(y);

// 卫星步长由 R·(2πh/P)⁴/384 ≤ 10 km 反解，再取整到能整除整年、且 Horizons 接受的
// 整分钟/小时值（否则年份网格会出现非均匀，运行时的整除定位会失效）。
// 另留 5 倍余量：发版门禁是"离格点 <10 km"，插值误差估计是量级判断，不能贴着走。
const moonSpecs = {
  phobos: ['401', '499', '30 m'], deimos: ['402', '499', '2 h'],
  io: ['501', '599', '1 h'], europa: ['502', '599', '2 h'],
  ganymede: ['503', '599', '4 h'], callisto: ['504', '599', '8 h'],
  mimas: ['601', '699', '30 m'], enceladus: ['602', '699', '45 m'],
  tethys: ['603', '699', '1 h'], dione: ['604', '699', '90 m'],
  rhea: ['605', '699', '2 h'], titan: ['606', '699', '6 h'], iapetus: ['608', '699', '1 d'],
  ariel: ['701', '799', '2 h'], umbriel: ['702', '799', '2 h'], titania: ['703', '799', '4 h'],
  oberon: ['704', '799', '6 h'], miranda: ['705', '799', '1 h'],
  triton: ['801', '899', '3 h'], charon: ['901', '999', '8 h'],
};

const specs = [];
specs.push({ id: 'moon', cmd: '301', center: '500@399', step: '12 h', kind: 'lunar' });
for (const [id, [cmd, parent, step]] of Object.entries(moonSpecs)) {
  specs.push({ id, cmd, center: '500@' + parent, step, kind: 'moon' });
}
// 行星步长：水星近日点附近加速度极大（e=0.206，87.97 天一周），Hermite 三次插值的
// 误差 ∝ h⁴，1 天步长实测绝对误差 14.3 km，超过发布门禁的 10 km。
// 6 小时把误差压到 0.06 km（余量 170 倍）；其余行星轨道慢，1 天足够。
for (const [id, cmd] of Object.entries({
  mercury: '199', venus: '299', earth: '399', mars: '499', jupiter: '599',
  saturn: '699', uranus: '799', neptune: '899', pluto: '999',
})) {
  // 木星与冥王星在 1 天步长下绝对误差 7.07 / 5.09 km，虽过门禁但余量不足 30%；
  // 12 小时可把余量拉开一个量级，代价是每个天体多 ~350 KB。
  const step = id === 'mercury' ? '6 h' : (id === 'jupiter' || id === 'pluto') ? '12 h' : '1 d';
  specs.push({ id, cmd, center: '500@10', step, kind: 'planet' });
}

const aliases = { goblin: '2015 TG387', farout: '2018 VG18', farfarout: '2018 AG37' };
for (const id of TNO_IDS) {
  specs.push({ id, name: aliases[id] ?? TNO_DATA[id].nameEn, center: '500@10', step: '5 d', kind: 'tno' });
}
for (const [id, cmd] of Object.entries({
  halley: 'DES=1P;CAP;', halebopp: 'DES=C/1995 O1;CAP;', cg67p: 'DES=67P;CAP;',
  encke: 'DES=2P;CAP;', voyager1: '-31', voyager2: '-32', newhorizons: '-98',
})) {
  const kind = /^voyager|newhorizons/.test(id) ? 'probe' : 'comet';
  specs.push({ id, cmd, center: '500@10', step: '1 d', kind });
}

/** 卫星状态是相对母星的短矢量 → float32 足够；其余是日心长矢量 → 必须 float64 */
const precisionOf = (kind) => (kind === 'moon' || kind === 'lunar' ? 2 : 1);
const FORMAT_BYTES = { 1: 8, 2: 4 };

// Horizons 在请求过密时返回 403（不是 429），且退避不足会连续失败。
// 指数退避 + 5 次尝试，覆盖一次短暂封禁的时间尺度。
async function request(url) {
  let error;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      error = e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw error;
}

const stepDaysOf = (step) => Number.parseInt(step, 10) / (step.endsWith('m') ? 1440 : step.endsWith('h') ? 24 : 1);

let previous = {};
try { previous = JSON.parse(readFileSync(new URL('manifest.json', out), 'utf8')); } catch { /* first run */ }
const cachedFiles = new Map();
for (const [id, b] of Object.entries(previous.bodies ?? {})) {
  for (const [y, f] of Object.entries(b.files ?? {})) cachedFiles.set(id + ':' + y, { ...f, stepDays: b.stepDays, format: b.format });
}

const SHARD_GENERATION = 2;   // 抓取规则版本：改则强制重建全部分片
const manifest = {
  format: 2,
  generation: SHARD_GENERATION,
  source: 'NASA/JPL Horizons geometric vectors; Ecliptic J2000, TDB, km / km/s',
  start: `${startYear}-01-01`, end: `${endYear}-01-01`,
  years, bodies: {},
};
const manifestPath = new URL('manifest.json', out);
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 先把缓存命中的片登记进 manifest，再只对缺片发请求——这样重跑是增量的。
const jobs = [];
for (const spec of specs) {
  const format = precisionOf(spec.kind);
  const stepDays = stepDaysOf(spec.step);
  const entry = {
    kind: spec.kind, command: spec.cmd ?? previous.bodies?.[spec.id]?.command ?? null, center: spec.center,
    step: spec.step, stepDays, format, files: {},
  };
  for (const year of years) {
    const key = spec.id + ':' + year;
    const path = new URL(`${year}/${spec.id}.bin`, out);
    const old = cachedFiles.get(key);
    if (old && old.gen === SHARD_GENERATION && old.stepDays === stepDays && old.format === format && existsSync(path)
        && createHash('sha256').update(readFileSync(path)).digest('hex') === old.sha256) {
      entry.files[year] = old;
    } else {
      jobs.push({ spec, entry, year, stepDays, format, path });
    }
  }
  manifest.bodies[spec.id] = entry;
}
saveManifest();

const cachedBytes = Object.values(manifest.bodies)
  .flatMap((b) => Object.values(b.files)).reduce((a, f) => a + f.bytes, 0);
console.log(`缓存命中 ${Object.values(manifest.bodies).flatMap((b) => Object.keys(b.files)).length} 片 / 待抓取 ${jobs.length} 片`);

// Horizons 是公共服务：并发限制在 4，单点失败不中断整体（缺片下次重跑即可补齐）。
const CONCURRENCY = Number.parseInt(process.argv[4] ?? '3', 10);
// 缓存的命令可能缺失（例如首次运行或历史 manifest 未记录），此时显式解一遍：
// 这一步只在确有缺失时才发请求，且每个目标一次。
for (const spec of specs) {
  if (manifest.bodies[spec.id].command) continue;
  try {
    spec.cmd = await resolveCommand(spec);
    manifest.bodies[spec.id].command = spec.cmd;
  } catch (e) {
    console.warn('命令解析失败 ' + spec.id + ': ' + e.message);
  }
}
saveManifest();
let cursor = 0, done = 0, failed = 0, fetchedBytes = 0;

async function resolveCommand(spec) {
  if (spec.cmd) return spec.cmd;   // 结果会写回 spec.cmd 并进入 manifest
  const j = JSON.parse(await request('https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=' + encodeURIComponent(spec.name)));
  if (!j.object?.des) throw Error('SBDB unresolved ' + spec.id);
  return /^\d+$/.test(j.object.des) ? j.object.des + ';' : 'DES=' + j.object.des + ';';
}

async function runJob(job) {
  const { spec, entry, year, stepDays, format, path } = job;
  const command = await resolveCommand(spec);
  entry.command = command;   // 解出的命令必须落盘，否则下游拿不到 COMMAND
  // 分片必须跨年重叠一拍。
  // 旧做法让每片恰好止于次年 1 月 1 日，但步长未必整除闰年的 366 天
  // （例如 5 天步长：366/5 = 73.2，最后一点落在 12 月 31 日），于是年份接缝上
  // 会漏掉整整一天——那一天 HUD 会把近似模型当成"已覆盖"。多给一步即可覆盖。
  const yStartMs = Date.UTC(year, 0, 1);
  const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - yStartMs) / 86400000);
  const stopMs = yStartMs + (Math.ceil(daysInYear / stepDays) + 1) * stepDays * 86400000;
  const stopDate = new Date(stopMs).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    format: 'text', COMMAND: `'${command}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'", CENTER: `'${spec.center}'`,
    START_TIME: `'${year}-01-01'`, STOP_TIME: `'${stopDate}'`,
    STEP_SIZE: `'${spec.step}'`, TIME_TYPE: "'TDB'", VEC_TABLE: "'2'",
    VEC_CORR: "'NONE'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'J2000'",
    OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'",
  });
  const text = await request('https://ssd.jpl.nasa.gov/api/horizons.api?' + params);
  const m = text.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/);
  if (!m) throw Error(spec.id + ' ' + year + ': ' + text.slice(0, 400));
  const rows = m[1].trim().split('\n').map((line) => {
    const r = line.split(',');
    return [Number(r[0]), ...r.slice(2, 8).map(Number)];
  });
  if (rows.length < 2 || rows.some((r) => r.length !== 7 || r.some((x) => !Number.isFinite(x)))) {
    throw Error(`Invalid rows ${spec.id} ${year}`);
  }
  // 均匀网格是运行时的前提（采样索引靠整除定位）
  if (rows.some((r, i) => Math.abs(r[0] - (rows[0][0] + i * stepDays)) > 1e-6)) {
    throw Error(`Nonuniform time grid ${spec.id} ${year}`);
  }
  const unit = FORMAT_BYTES[format];
  const buf = Buffer.alloc(32 + rows.length * 6 * unit);
  [rows[0][0], stepDays, rows.length, format].forEach((x, i) => buf.writeDoubleLE(x, i * 8));
  for (let k = 0; k < rows.length; k++) {
    for (let i = 0; i < 6; i++) {
      if (format === 2) buf.writeFloatLE(rows[k][i + 1], 32 + (k * 6 + i) * 4);
      else buf.writeDoubleLE(rows[k][i + 1], 32 + (k * 6 + i) * 8);
    }
  }
  mkdirSync(new URL(`${year}/`, out), { recursive: true });
  writeFileSync(path, buf);
  entry.files[year] = {
    gen: SHARD_GENERATION,
    file: `${year}/${spec.id}.bin`,
    startJD: rows[0][0], endJD: rows.at(-1)[0],
    samples: rows.length, bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
  fetchedBytes += buf.length;
}

async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    try {
      await runJob(job);
      done++;
    } catch (e) {
      failed++;
      console.warn(`FAIL ${job.spec.id} ${job.year}: ${e.message}`);
    }
    if ((done + failed) % 10 === 0) {
      saveManifest();   // 单线程 + 同步写，不会交错；每 10 片落一次盘
      console.log(`进度 ${done + failed}/${jobs.length}（失败 ${failed}）`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
saveManifest();
const totalMb = ((cachedBytes + fetchedBytes) / 1048576).toFixed(1);
console.log(`COMPLETE 目标 ${Object.keys(manifest.bodies).length} / 新抓取 ${done} 片 / 失败 ${failed} 片 / 总计 ${totalMb} MB`);

