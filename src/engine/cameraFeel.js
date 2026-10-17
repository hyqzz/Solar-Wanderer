// 相机语言：把"重量感"加回画面。
//
// 没有它，任何动作都显得没有质量——降落像贴图切换、奔跑像在冰上滑、加速像改了个数字。
// 这不是"特效"，而是人通过前庭与视觉在运动中获得的必然反馈：
//   · 走路时头部随步伐上下起伏（步频的 2 倍频，因为每步有一次落地）
//   · 落地时身体承受冲击，画面短促下压并轻微抖动
//   · 加速时视野轻微扩张、减速时收拢
//   · 高速掠过时的高频微抖
//
// 所有量都以"人眼可察觉但不至于晕"为界：位移以角秒到角分计，绝不叠加到视点上
// （否则会破坏浮动原点的精度与着陆判定的距离）。
import * as THREE from 'three';
import { prefersReducedMotion } from '../config.js';

const DEG = Math.PI / 180;

/** 一次冲击的状态：幅度（弧度）与频率（Hz） */
function makeImpulse() { return { amp: 0, freq: 26, phase: 0 }; }

export function createCameraFeel() {
  const impulse = makeImpulse();
  let bobPhase = 0;          // 步态相位（弧度），由走过的距离推进
  let bobAmp = 0;            // 当前步态幅度（平滑趋近，起步/停步不突变）
  let fovBias = 0;           // 相对基础 FOV 的偏移（度）
  let time = 0;

  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');

  // 抖动用的确定性噪声（三个不相关的相位），避免每帧 random() 造成闪烁
  const n = (t, k) => Math.sin(t * 1.7 + k) * 0.6 + Math.sin(t * 3.1 + k * 2.3) * 0.4;

  return {
    /** 触发一次冲击。strength 以弧度计，0.01 ≈ 0.57°（着陆量级） */
    impulse(strength, freq = 26) {
      if (strength > impulse.amp) { impulse.amp = strength; impulse.freq = freq; }
    },

    /**
     * @param {number} dt 实时步长（秒）
     * @param {object} s  { mode, speedKmS, walkSpeedMS, walking, altGroundKm, boosting }
     * @returns {{ quaternion, fovBiasDeg }} 叠加到相机上的姿态偏移与 FOV 偏移
     */
    update(dt, s) {
      // 减少动效：步态起伏、冲击抖动、FOV 语言全部归零。
      // 这些正是"动效"，对前庭敏感的用户是主要不适来源。
      if (prefersReducedMotion()) {
        impulse.amp = 0; bobAmp = 0; fovBias = 0;
        q.identity();
        return { quaternion: q, fovBiasDeg: 0 };
      }
      time += dt;
      const mode = s.mode ?? 'orbit';

      // ── 步态起伏 ──
      // 走路时头随步伐起伏：频率是步频的 2 倍（每步一次落地），幅度约 0.25°。
      // 由"走过的距离"推进相位而不是时间，速度变化时步态自然跟随。
      const wantBob = (mode === 'walk' && s.walking && !s.submerged) ? 1 : 0;
      bobAmp += (wantBob - bobAmp) * Math.min(dt * 6, 1);
      // 步频必须与**脚步声**同源。两处各写一份时差了 5 倍：这里原来按 0.75m 步长
      // 算步频、又把 pitch 再乘 2，得到 8 Hz；而 audio.js 的脚步声间隔算出来是
      // 1.63 Hz。听觉一步、视觉抖八下，读起来是"震动"而不是"有重量"。
      // 现在两处用同一个公式（改这里也要改 audio.js 的 _stepInterval）。
      const fStep = 1.2 + Math.min(s.walkSpeedMS / 9, 1) * 1.3;    // Hz
      if (mode === 'walk' && s.walkSpeedMS > 0.05) {
        bobPhase += fStep * Math.PI * 2 * dt;
      }
      // 每步一次落地 → 俯仰一个周期；横向摆动每两步（一个完整步态周期）一次
      const bobPitch = Math.sin(bobPhase) * 0.0044 * bobAmp;        // ≈0.25°
      const bobRoll = Math.sin(bobPhase * 0.5) * 0.0031 * bobAmp;   // ≈0.18°

      // ── 冲击衰减 ──
      // 指数衰减 + 频率随时间下降：像弹簧回稳，而不是等幅振动到突然停止。
      let shakePitch = 0, shakeRoll = 0, shakeYaw = 0;
      if (impulse.amp > 1e-5) {
        const t = time * impulse.freq;
        shakePitch = n(t, 0.0) * impulse.amp;
        shakeYaw = n(t, 2.1) * impulse.amp * 0.7;
        shakeRoll = n(t, 4.3) * impulse.amp * 0.5;
        impulse.amp *= Math.exp(-dt * 5.5);
      } else impulse.amp = 0;

      // ── 高速微抖 ──
      // 仅在飞行模式下生效；速度以 10 km/s 为参考，幅度封顶 0.12°，
      // 且随速度平方根增长——低速巡航时完全无感。
      let hiPitch = 0, hiRoll = 0;
      if (mode === 'fly') {
        const v = Math.max(0, s.speedKmS ?? 0);
        const a = Math.min(0.0021, Math.sqrt(v / 10) * 0.0004);
        if (a > 1e-6) {
          const t = time * 34;
          hiPitch = n(t, 1.3) * a;
          hiRoll = n(t, 5.7) * a * 0.8;
        }
      }

      e.set(
        bobPitch + shakePitch + hiPitch,
        shakeYaw,
        bobRoll + shakeRoll + hiRoll,
      );
      q.setFromEuler(e);

      // ── FOV 语言 ──
      // 冲击时视野短促收拢再回稳（身体被压住的感觉）；飞行加速时轻微扩张。
      const target = impulse.amp > 0 ? -impulse.amp * 220 : 0;
      const boostTarget = (mode === 'fly' && s.boosting) ? 3.5 : 0;
      fovBias += ((target + boostTarget) - fovBias) * Math.min(dt * (impulse.amp > 0 ? 22 : 4), 1);

      return { quaternion: q, fovBiasDeg: fovBias };
    },

    /** 当前抖动幅度（弧度）——供诊断与回归断言 */
    get amplitude() { return impulse.amp; },
  };
}
