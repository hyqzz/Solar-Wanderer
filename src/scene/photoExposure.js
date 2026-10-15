// Display adaptation approximation, not a calibrated spectral camera model.
// A camera exposed for sunlit terrain cannot also show the faint star field.
export function photoSkyVisibility({ radiusKm, distanceKm, sunElevation, phaseCosine = 1, viewCosine = 1, dSunAU = 1 }) {
  const angularRadius = radiusKm / Math.max(radiusKm, distanceKm);
  const nearSurface = angularRadius > 0.97;
  const illuminated = nearSurface ? Math.max(0, Math.min(1, sunElevation * 6)) : Math.max(0, (1 + phaseCosine) * 0.5);
  const inView = nearSurface ? 1 : Math.max(0, Math.min(1, (viewCosine - 0.65) / 0.2));
  const glare = angularRadius * illuminated * inView * 12 / Math.sqrt(Math.max(0.1, dSunAU));
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
