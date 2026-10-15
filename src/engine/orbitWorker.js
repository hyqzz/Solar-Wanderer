// Expensive VSOP orbit sampling stays off the input/render thread.
import { orbitPoints } from '../astro/planets.js';
self.onmessage = ({ data: { id, jd } }) => {
  try {
    const pts = orbitPoints(id, jd, 512), positions = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) {
      positions[i] = pts[i]; positions[i + 1] = pts[i + 2]; positions[i + 2] = -pts[i + 1];
    }
    self.postMessage({ id, jd, positions }, [positions.buffer]);
  } catch (e) { self.postMessage({ id, error: e.message }); }
};
