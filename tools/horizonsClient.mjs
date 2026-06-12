// JPL Horizons API 客户端（Node 内置 fetch，无第三方依赖）

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/**
 * 查询状态向量（黄道 J2000，单位 km / km/s）。
 * @returns {{jdTDB:number, pos:[x,y,z], vel:[vx,vy,vz]|null}}
 */
export async function horizonsVectors(command, center, dateUTC, withVelocity = true) {
  const t0 = dateUTC.toISOString().slice(0, 16).replace('T', ' ');
  const t1 = new Date(dateUTC.getTime() + 120000).toISOString().slice(0, 16).replace('T', ' ');
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'${center}'`,
    START_TIME: `'${t0}'`,
    STOP_TIME: `'${t1}'`,
    STEP_SIZE: `'2'`,
    VEC_TABLE: `'${withVelocity ? 2 : 1}'`,
    REF_PLANE: `'ECLIPTIC'`,
    REF_SYSTEM: `'J2000'`,
    OUT_UNITS: `'KM-S'`,
    CSV_FORMAT: `'YES'`,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for ${command}`);
  const text = await res.text();
  const m = text.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/);
  if (!m) throw new Error(`Horizons 响应中无数据块 (${command}):\n${text.slice(0, 600)}`);
  const firstLine = m[1].trim().split('\n')[0];
  const cols = firstLine.split(',').map((s) => s.trim());
  const jdTDB = parseFloat(cols[0]);
  const pos = [parseFloat(cols[2]), parseFloat(cols[3]), parseFloat(cols[4])];
  const vel = withVelocity ? [parseFloat(cols[5]), parseFloat(cols[6]), parseFloat(cols[7])] : null;
  if (!isFinite(jdTDB) || pos.some((v) => !isFinite(v))) {
    throw new Error(`Horizons 数据解析失败 (${command}): ${firstLine}`);
  }
  return { jdTDB, pos, vel };
}
