// Geometric ecliptic J2000 states, km / km/s. Data is optional and fetched by
// the engine; the astronomy hot path never starts network work or waits.
//
// 分片（format 2 起）：同一目标可以装载多个按年切分的时间片，sampledState 定位
// 覆盖该时刻的那一片。这样 10 年窗口不必让用户一次下载全部——只取当前年份那一片。
//
// 两种样本精度，插值路径完全一致：
//   format 1  float64，48 B/样本 —— 行星、海外天体、彗星、探测器（日心矢量可达 10¹⁰ km）
//   format 2  float32，24 B/样本 —— 卫星（相对母星的矢量 10⁴–10⁶ km，量化误差 < 0.3 km）
const HEADER_BYTES = 32;
const COMPONENTS = 6;              // x, y, z, vx, vy, vz
const UNIT_BYTES = { 1: 8, 2: 4 };

/** id → 按 start 升序的时间片数组 */
const shards = new Map();

function parseShard(id, buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= HEADER_BYTES) {
    throw new Error(`Invalid ephemeris buffer: ${id}`);
  }
  const view = new DataView(buffer);
  const start = view.getFloat64(0, true), step = view.getFloat64(8, true);
  const count = view.getFloat64(16, true), format = view.getFloat64(24, true);
  const unit = UNIT_BYTES[format];
  if (!unit) throw new Error(`Unknown ephemeris format ${format}: ${id}`);
  if (!Number.isFinite(start) || !Number.isFinite(step) || !(step > 0)) {
    throw new Error(`Invalid ephemeris header: ${id}`);
  }
  if (!Number.isInteger(count) || count < 2
      || buffer.byteLength !== HEADER_BYTES + count * COMPONENTS * unit) {
    throw new Error(`Invalid ephemeris length: ${id}`);
  }
  const states = format === 2
    ? new Float32Array(count * COMPONENTS)
    : new Float64Array(count * COMPONENTS);
  for (let i = 0; i < states.length; i++) {
    const value = format === 2
      ? view.getFloat32(HEADER_BYTES + i * 4, true)
      : view.getFloat64(HEADER_BYTES + i * 8, true);
    if (!Number.isFinite(value)) throw new Error(`Non-finite ephemeris state: ${id}`);
    states[i] = value;
  }
  return { start, step, count, states, end: start + step * (count - 1) };
}

export function installEphemeris(id, buffer) {
  const shard = parseShard(id, buffer);
  const list = shards.get(id) ?? [];
  const at = list.findIndex((s) => Math.abs(s.start - shard.start) < 1e-6);
  if (at >= 0) list[at] = shard; else list.push(shard);
  list.sort((a, b) => a.start - b.start);
  shards.set(id, list);
}

/** 覆盖区间：多片取并集；step 取首片（仅用于显示/校验） */
export function ephemerisCoverage(id) {
  const list = shards.get(id);
  if (!list?.length) return null;
  return {
    start: list[0].start, end: list[list.length - 1].end,
    step: list[0].step, shards: list.length,
  };
}

/** 已装载的时间片数（测试与诊断用） */
export function ephemerisShardCount(id) {
  return shards.get(id)?.length ?? 0;
}

/**
 * 该时刻是否真的被已装载的数据覆盖。
 * 不能用 coverage.start/end 的并集来判断：分片可能非连续装载
 * （例如装了 2026 与 2028 两片而没有 2027），此时并集会把中间的缺口
 * 也算成"已覆盖"，HUD 就会把近似模型谎报成 JPL 插值。
 */
export function ephemerisCovers(id, jd) {
  return shardAt(id, jd) !== null;
}

/**
 * 清除已装载数据（测试用；运行时不调用）。
 * 传入 id 只清该目标——测试里绝不能用无参形式：那会把模块级装入的
 * 真实分片一并清空，后续所有天体静默退回解析模型，失败原因还很难看出来。
 */
export function resetEphemeris(id) {
  if (id === undefined) shards.clear(); else shards.delete(id);
}

function shardAt(id, jd) {
  const list = shards.get(id);
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (jd >= s.start && jd <= s.end) return s;
  }
  return null;
}

/** Cubic Hermite interpolation uses actual velocities, not a straight chord.
 * No extrapolation beyond measured samples: the caller retains its analytic model. */
export function sampledState(id, jd) {
  if (!Number.isFinite(jd)) return null;
  const s = shardAt(id, jd);
  if (!s) return null;
  const t = (jd - s.start) / s.step;
  const k = Math.min(Math.floor(t), s.count - 2), u = t - k, u2 = u * u, u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2, d = u3 - u2;
  const seconds = s.step * 86400, states = s.states, first = k * 6, next = first + 6;
  const position = [], velocity = [];
  for (let i = 0; i < 3; i++) {
    position[i] = a * states[first + i] + b * seconds * states[first + i + 3]
      + c * states[next + i] + d * seconds * states[next + i + 3];
    velocity[i] = ((6 * u2 - 6 * u) * states[first + i] + (-6 * u2 + 6 * u) * states[next + i]) / seconds
      + (3 * u2 - 4 * u + 1) * states[first + i + 3] + (3 * u2 - 2 * u) * states[next + i + 3];
  }
  return { x: position[0], y: position[1], z: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2] };
}

export function sampledPosition(id, jd) {
  const state = sampledState(id, jd);
  return state ? { x: state.x, y: state.y, z: state.z } : null;
}
