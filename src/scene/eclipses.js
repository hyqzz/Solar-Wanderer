// 食（日食/月食/卫星食）系统。
// 处理三类事件：
//   1. 日食（月球遮挡太阳→地球表面）
//   2. 月食（地球遮挡太阳→月球表面）
//   3. 卫星食（行星遮挡太阳→卫星，如木星→伽利略卫星）
//
// **遮蔽只在接收体表面逐片元计算**（见 planetMaterial.js 的 uEclOn 分支：按遮挡体
// 与太阳的角半径、角分离求圆盘重叠比例），这里只负责把"当前有效的遮挡体"推给接收体材质。
//
// 历史上这里还在场景里插了一个黑色锥体网格来"画出阴影"。它有三个叠加缺陷：
//   ① 用 MultiplyBlending，而 three 的该模式是 (DstColor, Zero)——片元 alpha 完全不
//      参与，着色器把唯一的梯度量 shadow 写进 alpha，于是半影渐变与 uOpacity 全是死代码；
//   ② 片元色恒为黑（uColor=0x000000），锥体覆盖处一律把帧缓冲乘成黑，在夜面表现为
//      一个**硬边黑色矩形**；
//   ③ ConeGeometry 继承 CylinderGeometry，其 uv.x 是绕圈方位角、uv.y 才是沿轴，
//      而着色器按"vUv.x = 半径"取值，于是"半影"变成绕锥体的条纹。
// 加上 transparent+DoubleSide 的双遍渲染（见 rings.js 同名注释），实际是 dst × col²。
// 阴影在真空里本来也看不见（没有介质可被遮挡），所以直接删掉锥体，只留逐片元遮蔽。

/**
 * 日食阴影系统：管理场景中所有活跃的阴影锥。
 * 每帧根据星历位置更新阴影锥几何，在接收体表面渲染半影。
 */
/** 把当前有效的日食遮挡体写入接收体材质，供其片元着色器做逐片元遮蔽。
 * 放在模块级而不是类里：它不需要实例状态，写成类方法反而会掩盖这一点。 */
function pushOccluder(receiver, occ, camPosKm, sunDistKm) {
  const u = receiver?.mat?.userData?.uniforms;
  if (!u?.uEclOn) return;
  if (!occ) { u.uEclOn.value = 0; return; }
  u.uEclOn.value = 1;
  // 世界系（相机相对 = 绝对位置 − 相机位置；片元里的 vPosW 就是这一系）
  u.uEclPos.value.set(occ.posKm[0] - camPosKm[0], occ.posKm[1] - camPosKm[1], occ.posKm[2] - camPosKm[2]);
  u.uEclR.value = occ.phys.radiusKm;
  u.uSunDistKm.value = sunDistKm;
}

/** 参与逐片元遮蔽的接收体：本体 + 会被影子扫过的卫星。
 *  木星影子扫过木卫、土星影子扫过土卫都是真实且可查的现象（Io 走进木星影子里会消失）。 */
const ECLIPSE_RECEIVERS = ['earth', 'moon', 'io', 'europa', 'ganymede', 'callisto', 'titan'];

export class EclipseSystem {
  constructor() {
    this._nextEclipseCache = null;
    this._nextEclipseJd = 0;
  }

  /**
   * 每帧更新：把当前有效的遮挡体推给接收体材质，由片元着色器做逐片元遮蔽。
   * @param {number} jdTT - 儒略日 TT（保留参数：调用方按帧序传入，本实现不依赖它）
   * @param {Map} bodies - builder.bodies: id → { posKm, phys, mesh, ... }
   * @param {Float64Array} camPosKm - 相机位置（日心黄道 km）
   */
  update(jdTT, bodies, camPosKm) {
    const sun = bodies.get('sun');
    if (!sun) return;

    // 每帧先清除再按需设置。不清除的话食结束后阴影会永久留在表面上。
    // 遮蔽比例由着色器按角半径/角分离算，未对齐时自然趋于 0，无需在这里判条件，
    // 也不受相机距离门控——"月球在地球上投下的阴影"从地月系之外照样看得见。
    for (const id of ECLIPSE_RECEIVERS) pushOccluder(bodies.get(id), null, camPosKm, 1);
    const distTo = (a) => Math.hypot(a.posKm[0], a.posKm[1], a.posKm[2]);

    const moon = bodies.get('moon');
    const earth = bodies.get('earth');

    // ── 日食：月球→地球 ──
    if (moon && earth) pushOccluder(earth, moon, camPosKm, distTo(earth));

    // ── 月食：地球→月球 ──
    if (moon && earth) pushOccluder(moon, earth, camPosKm, distTo(moon));

    // ── 木星→伽利略卫星 ──
    const jupiter = bodies.get('jupiter');
    if (jupiter) {
      for (const moonId of ['io', 'europa', 'ganymede', 'callisto']) {
        const m = bodies.get(moonId);
        if (m) pushOccluder(m, jupiter, camPosKm, distTo(m));
      }
    }

    // ── 土星→土卫六 ──
    const saturn = bodies.get('saturn');
    const titan = bodies.get('titan');
    if (saturn && titan) pushOccluder(titan, saturn, camPosKm, distTo(titan));
  }

  /**
   * 查找下一次日食。
   * @param {string} type - 'solar' | 'lunar'
   * @param {number} fromJd - 起始 JD
   * @param {Function} getPositions - (jdTT) => { sun, moon, earth } 位置
   * @returns {number} 日食发生的 JD
   */
  getNextEclipse(type, fromJd, getPositions) {
    const R_SUN = 696000, R_EARTH = 6371, R_MOON = 1737.4;
    const hit = (jd) => {
      const p = getPositions(jd);
      return p ? isEclipse(type, p, R_SUN, R_EARTH, R_MOON) : false;
    };

    // 两段式：先粗扫定位，再二分细化。
    // 旧实现是 1 分钟步长扫 183 天 = 26.3 万次同步星历求值，会卡住主线程数秒；
    // 而一次食的几何窗口有好几个小时，30 分钟步长足够不跳过，细化交给二分。
    const COARSE = 1 / 48;               // 30 分钟
    const endJd = fromJd + 183;          // 6 个月
    for (let jd = fromJd; jd < endJd; jd += COARSE) {
      if (!hit(jd)) continue;
      // 二分开区间 [jd-COARSE, jd]，收敛到 1 分钟以内
      let lo = jd - COARSE, hi = jd;
      for (let i = 0; i < 20 && hi - lo > 1 / 1440; i++) {
        const mid = (lo + hi) / 2;
        if (hit(mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    return null;
  }
}

/** 判据：不是"三体共线度 > 0.999"（那是 2.56°，等于"下一次朔/望"，六个月的窗口里
 *  绝大多数并不成食），而是**真实的几何遮挡**——遮挡体的本影锥是否扫到接收体。
 *  日食：月球的本影锥在地球距离处的截面是否与地球相交；
 *  月食：地球的本影锥在月球距离处的截面是否与月球相交。 */
export function isEclipse(type, p, R_SUN, R_EARTH, R_MOON) {
  const occ = type === 'solar' ? p.moon : p.earth;   // 遮挡体
  const rec = type === 'solar' ? p.earth : p.moon;   // 接收体
  const occR = type === 'solar' ? R_MOON : R_EARTH;
  const recR = type === 'solar' ? R_EARTH : R_MOON;

  // 阴影轴：太阳 → 遮挡体
  const ax = occ[0] - p.sun[0], ay = occ[1] - p.sun[1], az = occ[2] - p.sun[2];
  const dSunOcc = Math.hypot(ax, ay, az);
  if (!(dSunOcc > 0)) return false;
  const nx = ax / dSunOcc, ny = ay / dSunOcc, nz = az / dSunOcc;

  // 接收体相对遮挡体
  const rx = rec[0] - occ[0], ry = rec[1] - occ[1], rz = rec[2] - occ[2];
  const proj = rx * nx + ry * ny + rz * nz;          // 沿阴影轴的投影距离
  if (proj <= 0) return false;                        // 接收体在受光侧

  // 本影锥在接收体处的半径：R_occ − (R_sun − R_occ)·proj / dSunOcc（可为负 = 锥已收敛）
  const umbraR = occR - (R_SUN - occR) * proj / dSunOcc;

  // 接收体中心到阴影轴的垂直距离
  const px = rx - proj * nx, py = ry - proj * ny, pz = rz - proj * nz;
  const perp = Math.hypot(px, py, pz);

  // 相交判据用半影（|umbraR| + recR）：本影锥收敛后按发散的半影算，与"能看见食"一致
  return perp < Math.abs(umbraR) + recR;
}
