// Display adaptation approximation, not a calibrated spectral camera model.
// A camera exposed for sunlit terrain cannot also show the faint star field.
export function photoSkyVisibility({ radiusKm, distanceKm, sunElevation, phaseCosine = 1, viewCosine = 1, dSunAU = 1, airless = false }) {
  const angularRadius = radiusKm / Math.max(radiusKm, distanceKm);
  const nearSurface = angularRadius > 0.97;
  // 无气天体：白昼天空本来就是黑的，星光**不会**被散射淹没。
  // 这条此前缺失，于是站在月球正午地面时星空被完全压掉——与项目自己在
  // sun.js 里的立场矛盾（那里按"人眼动态范围 10¹⁴、航天员肉眼可见日冕"处理）。
  // 阿波罗照片里白昼的月面天空确实是黑的、亮星可见。
  if (airless) return 1;
  const illuminated = nearSurface ? Math.max(0, Math.min(1, sunElevation * 6)) : Math.max(0, (1 + phaseCosine) * 0.5);
  const inView = nearSurface ? 1 : Math.max(0, Math.min(1, (viewCosine - 0.65) / 0.2));
  const glare = angularRadius * illuminated * inView * 12 / Math.sqrt(Math.max(0.1, dSunAU));
  // **空间视角一律不衰减**：真空里没有散射介质，天空本来就是黑的，星点就该
  // 是满亮度。只有贴着有大气天体的白昼地面时，天空才真的亮到看不见星
  // （阿波罗照片里月面白昼天空也是黑的，那条由 airless 分支处理）。
  // 旧版把"附近有受照天体＝眩光"当成了通用规则，地球 3.2R 处算出 0.023，
  // 星点、银河、恒星名标签一起消失——而线上同一机位是满天星。
  if (!nearSurface) return 1;
  return Math.exp(-glare);
}

/** Full photospheric occultation at the observer. Spherical silhouettes only;
 * this does not replace the eclipse system's partial-shadow calculation. */
export function isSunOcculted(observer, sunRadiusKm, bodies) {
  const ds=Math.hypot(...observer);
  if (ds<=sunRadiusKm) return false;
  const sr=Math.asin(sunRadiusKm/ds);
  for (const body of bodies) {
    const x=body.posKm[0]-observer[0],y=body.posKm[1]-observer[1],z=body.posKm[2]-observer[2];
    const d=Math.hypot(x,y,z),r=body.phys.radiusKm;
    if (!d||d>=ds||r>=d) continue;
    const cosine=-(x*observer[0]+y*observer[1]+z*observer[2])/(d*ds);
    const separation=Math.acos(Math.max(-1,Math.min(1,cosine)));
    if (Math.asin(r/d)>=separation+sr) return true;
  }
  return false;
}
