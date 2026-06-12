// 生成离线测试基准：固定历元的 JPL Horizons 参考向量 → tests/fixtures.json
import { writeFileSync } from 'node:fs';
import { horizonsVectors } from './horizonsClient.mjs';

const EPOCH = new Date('2026-06-10T12:00:00Z');
const PLANET_IDS = {
  mercury: '199', venus: '299', earth: '399', mars: '499', jupiter: '599',
  saturn: '699', uranus: '799', neptune: '899', pluto: '999',
};
const fix = { epochISO: EPOCH.toISOString(), planets: {}, moonGeo: null, moonsLocal: {} };

for (const [name, id] of Object.entries(PLANET_IDS)) {
  const r = await horizonsVectors(id, '500@10', EPOCH, false);
  fix.planets[name] = { jdTDB: r.jdTDB, pos: r.pos };
  console.log('planet', name, 'ok');
}
{
  const r = await horizonsVectors('301', '500@399', EPOCH, false);
  fix.moonGeo = { jdTDB: r.jdTDB, pos: r.pos };
  console.log('moon geocentric ok');
}
for (const [name, [cmd, center]] of Object.entries({
  io: ['501', '500@599'], titan: ['606', '500@699'], triton: ['801', '500@899'],
})) {
  const r = await horizonsVectors(cmd, center, EPOCH, false);
  fix.moonsLocal[name] = { jdTDB: r.jdTDB, pos: r.pos };
  console.log('moon', name, 'ok');
}

writeFileSync(new URL('../tests/fixtures.json', import.meta.url), JSON.stringify(fix, null, 2));
console.log('fixtures.json 已写入');
