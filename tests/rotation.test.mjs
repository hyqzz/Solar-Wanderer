// 自转模型测试：日下点（晨昏线位置）与极轴指向的物理正确性
import test from 'node:test';
import assert from 'node:assert/strict';
import { subsolarPoint, poleEcliptic, bodyToEclipticMatrix } from '../src/astro/rotation.js';
import { planetPosition } from '../src/astro/planets.js';
import { dateToJD, jdUTtoTT } from '../src/astro/time.js';

function sunDirFrom(name, jdTT) {
  const p = planetPosition(name, jdTT);
  const d = Math.hypot(p.x, p.y, p.z);
  return { x: -p.x / d, y: -p.y / d, z: -p.z / d };
}

test('地球日下点经度：12:00 UTC 时近 0°（误差 < 4°）', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-10T12:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  const lonErr = Math.abs(((sp.lon + 180) % 360 + 360) % 360 - 180);
  assert.ok(lonErr < 4, `日下点经度 ${sp.lon.toFixed(2)}°（期望 ~0°，均时差±2°内）`);
});

test('地球日下点纬度：六月 ≈ +23°（北半球夏至前后）', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-21T12:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  assert.ok(Math.abs(sp.lat - 23.4) < 0.5, `日下点纬度 ${sp.lat.toFixed(2)}°`);
});

test('地球日下点经度随 UTC 走时：18:00 UTC ≈ 90°W', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-10T18:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  assert.ok(Math.abs(sp.lon + 90) < 4, `日下点经度 ${sp.lon.toFixed(2)}°（期望 ~-90°）`);
});

test('地球极轴 vs 黄道北极夹角 = 23.4°（黄赤交角）', () => {
  const jdTT = 2461202.0;
  const p = poleEcliptic('earth', jdTT);
  const tilt = (Math.acos(p.z) * 180) / Math.PI;
  assert.ok(Math.abs(tilt - 23.44) < 0.1, `轴倾角 ${tilt.toFixed(2)}°`);
});

test('天王星"躺着"自转：IAU 北极倾角 ~82.2° 且自转逆行（≡角动量极 97.8°）', () => {
  // IAU/WGCCRE 约定：北极 = 位于不变面以北的极（天王星该极黄纬 +7.7°），
  // 配合负 W 速率（逆行）。与教科书 97.77° 倾角（右手定则角动量极）物理等价。
  const p = poleEcliptic('uranus', 2461202.0);
  const tilt = (Math.acos(p.z) * 180) / Math.PI;
  assert.ok(Math.abs(tilt - 82.2) < 1.5, `IAU 北极倾角 ${tilt.toFixed(2)}°`);
});

test('天王星/金星：W 速率为负（逆行自转）', async () => {
  const { IAU_ROTATION } = await import('../src/astro/rotation.js');
  assert.ok(IAU_ROTATION.uranus[5] < 0);
  assert.ok(IAU_ROTATION.venus[5] < 0);
});

test('体固→黄道矩阵正交（行列式=+1）', () => {
  for (const id of ['sun', 'earth', 'mars', 'jupiter', 'pluto']) {
    const m = bodyToEclipticMatrix(id, 2461202.0);
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);
    assert.ok(Math.abs(det - 1) < 1e-9, `${id}: det=${det}`);
  }
});

test('自转推进：地球 1 恒星日后子午线回归（W 速率正确）', () => {
  const jd0 = 2461202.0;
  const sidereal = 0.9972696; // 恒星日（天）
  const m0 = bodyToEclipticMatrix('earth', jd0);
  const m1 = bodyToEclipticMatrix('earth', jd0 + sidereal);
  // 体固 x 轴的像应几乎一致
  const dot = m0[0] * m1[0] + m0[3] * m1[3] + m0[6] * m1[6];
  assert.ok(dot > 0.99996, `1 恒星日后子午线偏差 cos=${dot}`);
});
