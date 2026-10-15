// Service Worker：运行时缓存，让重复访问近乎即时、并支持离线使用已访问过的内容。
//
// 为什么是"运行时缓存"而不是预缓存清单：构建产物带内容哈希（main-<hash>.js），
// 而贴图/星历/DEM 走 ?v=<sha256> 查询参数，清单本身不缓存——预缓存要枚举全部
// 1200+ 个文件，且每次构建都要重写清单。运行时缓存无需清单，且天然跟随版本：
// 带新哈希/新 ?v= 的请求就是新 URL，旧条目在版本升级时整体丢弃。
//
// 策略：
//   · 导航请求（HTML）：网络优先，失败回退缓存 —— 保证拿到新版本，同时离线可用
//   · 同源静态资源（GET）：缓存优先，未命中再去网络并写入 —— 贴图/星历/DEM 都不可变
//   · 其余（API、跨源）：直接走网络，不缓存
//
// 不做的事：不缓存 Range 请求、不缓存非 200 响应、不缓存 manifest（它必须新鲜）。

const VERSION = 'sw-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const MAX_ASSETS = 900;          // 条目上限，避免无界增长（约 300 MB 量级的资源池）

self.addEventListener('install', (e) => {
  // 立即接管，不等待旧 worker 退役（本应用没有需要版本对齐的破坏性变更）
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** 条目上限：Map 式的 LRU 近似——按插入顺序删最旧的 */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 跨源不介入
  if (req.headers.has('range')) return;              // Range 请求交给网络

  // HTML 导航：网络优先，离线回退缓存
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(SHELL);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const hit = await caches.match(req) || await caches.match('./index.html');
        return hit ?? Response.error();
      }
    })());
    return;
  }

  // 静态资源：缓存优先。构建产物带内容哈希、运行时资源带 ?v=，都是不可变的。
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(ASSETS);
        c.put(req, res.clone()).then(() => trimCache(ASSETS, MAX_ASSETS)).catch(() => {});
      }
      return res;
    } catch (err) {
      // 离线且未缓存：给出明确的失败，而不是让调用方悬着
      return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
  })());
});
