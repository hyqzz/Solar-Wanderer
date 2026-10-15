// A cold or resetting GPU can reject context creation. Retry on fresh canvases
// so failed Three constructors do not retain listeners or incompatible contexts.
export async function bootstrapRenderer({ canvas, create, status = () => {}, delay = ms => new Promise(r => setTimeout(r, ms)) }) {
  const failures = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      status({ state: 'retrying', attempt });
      await delay(attempt === 1 ? 500 : 1500);
      const next = canvas.cloneNode(false);
      canvas.replaceWith(next); canvas = next;
    }
    try {
      // HDR High has multisampling; Low applies FXAA after tone mapping. The
      // final full-screen triangle does not need another canvas MSAA resolve.
      const renderer = create({ canvas, antialias: false, logarithmicDepthBuffer: true,
        powerPreference: attempt === 0 ? 'high-performance' : 'default' });
      return { renderer, canvas, failures };
    } catch (error) { failures.push(String(error?.message ?? error)); }
  }
  status({ state: 'failed', failures });
  return null;
}
