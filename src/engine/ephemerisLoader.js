import { asset } from '../config.js';
import { MOON_PHYS } from '../astro/bodies.js';
import { installEphemeris, ephemerisCovers } from '../astro/sampledEphemeris.js';
import { resourceQueue, whenIdle } from './resourceQueue.js';

/**
 * 按需加载 JPL 采样星历（按年分片）。
 *
 * 窗口是 10 年（2025–2035），但一次只下载"当前仿真时刻所在的那一片"，
 * 因此单个目标的一次加载量与旧版（单文件覆盖 16 个月）同量级甚至更小，
 * 而有效窗口长了 7.5 倍。
 *
 * 分片边界：查询时刻正好落在年份交界时，同一时刻可能同时属于两片。
 * samplesAt() 取第一个覆盖它的片即可；跨年连续运动时下一页会在下一次
 * prefetch 中补上（主循环每秒对焦点/最近/选中天体刷新一次）。
 */
export function createEphemerisLoader() {
  let manifestPromise;
  const pending = new Map(), failedUntil = new Map();
  const loaded = new Set();                 // `${id}:${year}` 已成功装载的片
  const stats = { loaded: 0, failed: 0, bytes: 0, validity: null, window: null };

  const manifest = () => manifestPromise ??= resourceQueue.run('ephemeris:manifest', async () => {
    const r = await fetch(asset('data/ephemeris/manifest.json'), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw Error('Ephemeris manifest HTTP ' + r.status);
    const m = await r.json();
    stats.window = { start: m.start, end: m.end, years: m.years?.length ?? 0 };
    stats.validity = { start: m.start, end: m.end };
    return m;
  }, 20).catch((e) => { manifestPromise = null; throw e; });

  /** 找到覆盖 jd 的那一片的年份键 */
  function yearKeyFor(entry, jd) {
    const files = entry.files ?? {};
    for (const [year, f] of Object.entries(files)) {
      if (jd >= f.startJD && jd <= f.endJD) return year;
    }
    // 边界兜底：取最近的一片（时刻略微越界时仍给最接近的数据）
    let best = null, bestGap = Infinity;
    for (const [year, f] of Object.entries(files)) {
      const gap = jd < f.startJD ? f.startJD - jd : jd > f.endJD ? jd - f.endJD : 0;
      if (gap < bestGap) { bestGap = gap; best = year; }
    }
    return best;
  }

  async function loadShard(id, year, file, priority) {
    const key = `${id}:${year}`;
    if (loaded.has(key)) return true;
    if (pending.has(key)) return pending.get(key);
    if ((failedUntil.get(key) ?? 0) > Date.now()) return false;
    const job = (async () => {
      const buffer = await resourceQueue.run('ephemeris:' + key, async () => {
        const r = await fetch(asset('data/ephemeris/' + file.file) + '?v=' + file.sha256,
          { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }, priority);
      if (buffer.byteLength !== file.bytes) throw Error('Invalid byte length');
      if (globalThis.crypto?.subtle) {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
          .map((x) => x.toString(16).padStart(2, '0')).join('');
        if (hash !== file.sha256) throw Error('Ephemeris integrity mismatch');
      }
      await whenIdle();
      installEphemeris(id, buffer);
      loaded.add(key);
      stats.loaded++; stats.bytes += buffer.byteLength;
      return true;
    })().catch((e) => {
      stats.failed++;
      failedUntil.set(key, Date.now() + 30000);
      console.warn(`[ephemeris] ${key}: ${e.message}`);
      return false;
    }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }

  /** 装载覆盖 jd 的那一片（jd 缺省 = 当前时刻） */
  async function load(id, jd = Date.now() / 86400000 + 2440587.5, priority = 10) {
    if (ephemerisCovers(id, jd)) return true;   // 已覆盖，不重复请求
    let m;
    try { m = await manifest(); } catch { return false; }
    const entry = m.bodies[id];
    if (!entry) return false;
    const year = yearKeyFor(entry, jd);
    if (year == null) return false;
    return loadShard(id, year, entry.files[year], priority);
  }

  /** 预取：目标本身 + 母星 + 全部子卫星，各取当前所处年份那一片 */
  function prefetch(id, jd) {
    if (!id) return;
    load(id, jd, 30);
    const parent = MOON_PHYS[id]?.parent;
    if (parent) load(parent, jd, 30);
    for (const [moon, phys] of Object.entries(MOON_PHYS)) {
      if (phys.parent === id) load(moon, jd, 15);
    }
  }

  return { prefetch, load, stats };
}
