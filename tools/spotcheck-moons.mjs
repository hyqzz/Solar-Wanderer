// 卫星传播抽查：拟合历元 +N 天后与 Horizons 对照角度误差。
import { horizonsVectors } from './horizonsClient.mjs';
import { moonLocalPosition } from '../src/astro/moons.js';

const CASES = {
  moon: ['301', '500@399'], io: ['501', '500@599'], titan: ['606', '500@699'],
  triton: ['801', '500@899'], phobos: ['401', '500@499'], charon: ['901', '500@999'],
};
const days = parseFloat(process.argv[2] ?? '10');
const date = new Date(Date.now() + days * 86400000);

console.log(`\n=== 卫星传播抽查 @ 历元+${days}天 ===`);
for (const [id, [cmd, center]] of Object.entries(CASES)) {
  const ref = await horizonsVectors(cmd, center, date, false);
  const ours = moonLocalPosition(id, ref.jdTDB);
  const la = Math.hypot(ours.x, ours.y, ours.z), lb = Math.hypot(...ref.pos);
  const dotv = (ours.x * ref.pos[0] + ours.y * ref.pos[1] + ours.z * ref.pos[2]) / (la * lb);
  const dAng = (Math.acos(Math.max(-1, Math.min(1, dotv))) * 180) / Math.PI;
  console.log(`${id.padEnd(8)} 角误差=${dAng.toFixed(3)}°  距离差=${(((la - lb) / lb) * 100).toFixed(2)}%`);
}
