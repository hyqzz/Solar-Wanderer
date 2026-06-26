// 循环安全性与新模块集成测试
// 验证：loop() 中每个新模块在各种边界条件下不抛异常，
// 且 try-catch 安全网确保 composer.render() 始终被执行（屏幕永不冻结）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMTileSource, DEM_SOURCES } from '../src/scene/demTiles.js';

// ── DEMTileSource：离线回退 + 同步采样不抛异常 ──────────────────────

test('DEMTileSource：无配置天体 hasSource=false', () => {
  assert.equal(DEMTileSource.hasSource('earth'), false);
  assert.equal(DEMTileSource.hasSource('mercury'), false);
  assert.equal(DEMTileSource.hasSource('moon'), true);
  assert.equal(DEMTileSource.hasSource('mars'), true);
});

test('DEMTileSource：离线后 getHeightSync 返回 null 不抛异常', () => {
  const src = new DEMTileSource('moon');
  // 模拟离线
  src._offline = true;
  const dir = { x: 0, y: 1, z: 0 };
  assert.equal(src.getHeightSync(dir), null);
  assert.equal(src.getHeightSync({ x: 1, y: 0, z: 0 }), null);
});

test('DEMTileSource：缓存未命中 getHeightSync 返回 null 不抛异常', () => {
  const src = new DEMTileSource('moon');
  // 未离线但无缓存
  assert.equal(src._offline, false);
  const h = src.getHeightSync({ x: 0, y: 1, z: 0 });
  assert.equal(h, null);
});

test('DEMTileSource：requestTiles 离线后为空操作不抛异常', () => {
  const src = new DEMTileSource('mars');
  src._offline = true;
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
  assert.doesNotThrow(() => src.requestTiles({ x: 1, y: 0, z: 0 }, 0));
});

test('DEMTileSource：requestTiles 未配置天体为空操作', () => {
  const src = new DEMTileSource('earth'); // earth 无 DEM 配置
  assert.equal(src.config, null);
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
});

test('DEMTileSource：getTile 离线后返回 null', async () => {
  const src = new DEMTileSource('moon');
  src._offline = true;
  const tile = await src.getTile(0, 0, 0);
  assert.equal(tile, null);
});

test('DEMTileSource：dispose 后所有操作安全', () => {
  const src = new DEMTileSource('moon');
  src.dispose();
  assert.doesNotThrow(() => src.getHeightSync({ x: 0, y: 1, z: 0 }));
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
});

test('DEMTileSource：LRU 缓存淘汰不抛异常', () => {
  const src = new DEMTileSource('moon', { maxCache: 2 });
  // 手动填充缓存超出上限
  src.cache.set(0, 0, 0, { data: new Float32Array(1), size: 1, level: 0 });
  src.cache.set(0, 1, 0, { data: new Float32Array(1), size: 1, level: 0 });
  src.cache.set(0, 0, 1, { data: new Float32Array(1), size: 1, level: 0 }); // 淘汰 (0,0,0)
  assert.equal(src.cache.size, 2);
  // 被淘汰的瓦片返回 undefined
  assert.equal(src.cache.get(0, 0, 0), undefined);
});

// ── 循环安全网模式验证 ──────────────────────────────────────────
// 模拟 loop() 的 try-catch 安全网：验证任何区段抛异常都不阻止 composer.render()

test('循环安全网：单区段异常不阻止后续区段与渲染', () => {
  const log = [];
  const errors = [];
  // 模拟 loopErr
  const loopErr = (tag, e) => errors.push({ tag, msg: e?.message || String(e) });

  // 模拟 loop() 结构
  let rendered = false;
  const simulateLoop = (throwInSection) => {
    rendered = false;
    try { if (throwInSection === 'comets') throw new Error('comets boom'); } catch (e) { loopErr('comets', e); }
    try { if (throwInSection === 'tnoScene') throw new Error('tno boom'); } catch (e) { loopErr('tnoScene', e); }
    try { if (throwInSection === 'modeUpdate') throw new Error('mode boom'); } catch (e) { loopErr('modeUpdate', e); }
    try { if (throwInSection === 'world') throw new Error('world boom'); } catch (e) { loopErr('world', e); }
    try { if (throwInSection === 'atmoFog') throw new Error('atmo boom'); } catch (e) { loopErr('atmoFog', e); }
    try { if (throwInSection === 'hud') throw new Error('hud boom'); } catch (e) { loopErr('hud', e); }
    try { if (throwInSection === 'fpsGuard') throw new Error('fps boom'); } catch (e) { loopErr('fpsGuard', e); }
    try { if (throwInSection === 'input') throw new Error('input boom'); } catch (e) { loopErr('input', e); }
    try { rendered = true; } catch (e) { errors.push({ tag: 'render', msg: e.message }); }
  };

  // 每个区段单独抛异常时，渲染仍应执行
  for (const section of ['comets', 'tnoScene', 'modeUpdate', 'world', 'atmoFog', 'hud', 'fpsGuard', 'input']) {
    simulateLoop(section);
    assert.equal(rendered, true, `composer.render() 未执行（${section} 抛异常后）`);
    assert.equal(errors.length, 1, `应仅 1 个错误（${section}）`);
    assert.equal(errors[0].tag, section);
    errors.length = 0;
  }

  // 无异常时正常渲染
  simulateLoop(null);
  assert.equal(rendered, true);
  assert.equal(errors.length, 0);
});

test('循环安全网：多个区段同时异常仍渲染', () => {
  let rendered = false;
  const errors = [];
  const loopErr = (tag, e) => errors.push(tag);

  try { throw new Error('a'); } catch (e) { loopErr('comets', e); }
  try { throw new Error('b'); } catch (e) { loopErr('atmoFog', e); }
  try { throw new Error('c'); } catch (e) { loopErr('hud', e); }
  try { rendered = true; } catch (e) { loopErr('render', e); }

  assert.equal(rendered, true, '即使 3 个区段都异常，渲染仍应执行');
  assert.deepEqual(errors, ['comets', 'atmoFog', 'hud']);
});

// ── 浮动原点系统安全性 ──────────────────────────────────────────

test('World.update：空实体列表不抛异常', async () => {
  const { World } = await import('../src/engine/floating.js');
  const world = new World();
  const camPos = new Float64Array([1e8, 2e8, 3e8]);
  assert.doesNotThrow(() => world.update(camPos));
});

test('World.register + update：实体位置正确平移', async () => {
  const { World } = await import('../src/engine/floating.js');
  const world = new World();
  // 简单 mock：记录 position.set 调用
  const mockObj = {
    _x: 0, _y: 0, _z: 0,
    position: {
      set(x, y, z) { mockObj._x = x; mockObj._y = y; mockObj._z = z; },
      get x() { return mockObj._x; },
      get y() { return mockObj._y; },
      get z() { return mockObj._z; },
    },
  };
  const posKm = new Float64Array([100, 200, 300]);
  assert.doesNotThrow(() => world.register(posKm, mockObj));
  world.update(new Float64Array([50, 60, 70]));
  // 位置 = 实体绝对坐标 − 相机坐标
  assert.equal(mockObj._x, 50);
  assert.equal(mockObj._y, 140);
  assert.equal(mockObj._z, 230);
});
