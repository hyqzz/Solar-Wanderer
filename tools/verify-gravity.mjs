// 真实引力模式验证：圆轨道应保持圆。
//
// 这是引力的硬判据——圆轨道上引力恰好等于向心力，半径应长期稳定；
// 若积分漏项、符号错或步长不当，半径会漂移。
//
// 两个必须说清的测试前提，否则会得到假失败：
//  1) posKm 在应用里是**日心**坐标，太阳引力项才成立。把地球放在原点会让太阳项
//     变成"朝地球的 2731 km/s² 加速度"——坐标系用错，不是代码错。
//  2) 地球必须**按真实轨道运动**。若把地球钉死在原地，飞船承受太阳引力而地球不动，
//     会多出一个 5.9×10⁻⁶ km/s² 的相对加速度，两小时累积成约 1.4% 的"漂移"——
//     那是测试脚手架的问题（实测该漂移与步长无关，可据此判定不是数值误差）。
//
// 顺带验证"停手不会掉速"：街机模式松开按键速度衰减到 0，引力模式无阻尼、速度守恒。
import { Ship } from '../src/engine/ship.js';

const GM_EARTH = 3.986004418e5;      // km³/s²
const GM_SUN = 1.32712440018e11;
const R_EARTH = 6371, ALT = 600, AU = 1.496e8;
const r0 = R_EARTH + ALT;
const vCirc = Math.sqrt(GM_EARTH / r0);
const vEarth = Math.sqrt(GM_SUN / AU);        // 地球公转速度

const idleInput = {
  dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
  drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
  touchAscend: false, touchDescend: false, touchSprint: false,
  down: () => false, tapped: () => false,
};

function run(gravityMode, dt = 0.1) {
  const earth = {
    id: 'earth', posKm: new Float64Array([AU, 0, 0]), radiusKm: R_EARTH,
    distSurface: ALT, landable: true, phys: { gm: GM_EARTH, radiusKm: R_EARTH },
  };
  const env = { nearest: earth, get: () => earth, baseReady: () => true, phys: () => earth.phys };

  const s = new Ship();
  s.mode = 'fly';
  s.gravityMode = gravityMode;
  // 初始在圆轨道上：位置沿 +x 偏离地球，速度 = 地球公转速度 + 圆轨道速度(沿 +z)
  s.posKm[0] = AU + r0;
  s.vel.set(0, vEarth, vCirc);

  let minR = Infinity, maxR = -Infinity, maxV = 0, minV = Infinity, absV = Infinity;
  const steps = Math.round(2 * 3600 / dt);
  for (let i = 0; i < steps; i++) {
    // 地球沿 1 AU 圆轨道前进（角速度 vEarth/AU）
    const th = (i * dt * vEarth) / AU;
    earth.posKm[0] = AU * Math.cos(th);
    earth.posKm[1] = AU * Math.sin(th);
    s.update(dt, idleInput, env);
    const r = Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2]);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    const vRel = Math.hypot(s.vel.x, s.vel.y - vEarth, s.vel.z);
    maxV = Math.max(maxV, vRel); minV = Math.min(minV, vRel);
    absV = Math.min(absV, s.vel.length());
  }
  return { minR, maxR, minV, maxV, absV, drift: (maxR - minR) / r0 };
}

const g = run(true);
const a = run(false);
console.log('圆轨道初始半径', r0.toFixed(0), 'km，圆速度', vCirc.toFixed(3), 'km/s');
console.log(`引力模式：半径 ${g.minR.toFixed(1)} … ${g.maxR.toFixed(1)} km（相对漂移 ${(g.drift * 100).toFixed(4)}%）`);
console.log(`          相对速度 ${g.minV.toFixed(3)} … ${g.maxV.toFixed(3)} km/s`);
console.log(`街机模式：绝对速度最终 ${a.absV.toFixed(3)} km/s（无推力→衰减到 0，即在日心系里停死、地球飞走）`);

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}  ${d}`); };
check('引力模式下圆轨道半径稳定（相对漂移 < 0.5%）', g.drift < 0.005, `${(g.drift * 100).toFixed(4)}%`);
check('引力模式下速度守恒（无阻尼）', Math.abs(g.maxV - g.minV) / vCirc < 0.01,
  `${g.minV.toFixed(3)} … ${g.maxV.toFixed(3)} km/s`);
// 街机模式衰减的是**绝对**速度：两小时后飞船在日心系里几乎停死，
// 而地球继续以 29.8 km/s 公转——这正是修改前'停手地球就飞走'的成因。
check('街机模式不加推力绝对速度归零（对照组，两种模式确实不同）', a.absV < 1, `最终 ${a.absV.toFixed(3)} km/s`);
process.exitCode = fail ? 1 : 0;
if (fail) console.log(`\n${fail} 项失败`);
