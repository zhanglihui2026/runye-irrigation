/* ============================================================
   core/loader.js — 插件加载器（ES Module）
   ------------------------------------------------------------
   流程：plugins.json → manifest.json → 校验 → 动态 import() → activate(ctx)
   容错（硬约束）：任何一步失败都只跳过该插件，主程序照常启动。
   缓存：import() 时拼 ?v=<manifest.version> —— 站点资源靠 ?v=NNN 破缓存，
         插件不带版本号会导致更新后仍取旧文件（GitHub Pages / SW 同理）。
   ============================================================ */

/* ---- 极简 semver：只支持 x.y.z 与 >=x.y.z（够用且无依赖） ---- */
export function parseVer(s) {
  var m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s || ''));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
}
export function cmpVer(a, b) {
  for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
  return 0;
}
export function satisfies(coreVer, expr) {
  var want = parseVer(expr);
  var have = parseVer(coreVer);
  if (!have) return false;
  if (!want) return true;                       /* 声明不可解析 → 放行（不因格式问题误杀） */
  return cmpVer(have, want) >= 0;
}

var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* 相对路径 → 绝对 URL（基准 = 文档 baseURI）。解析失败返回 ''。 */
function absUrl(p) {
  try {
    var base = (typeof document !== 'undefined' && document.baseURI) || null;
    if (!base) return p;                       /* 无 document（极端环境）时原样返回 */
    return new URL(p, base).href;
  } catch (e) { return ''; }
}

export function validateManifest(m) {
  if (!m || typeof m !== 'object') return { ok: false, reason: 'manifest 不是对象' };
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return { ok: false, reason: 'id 非法（须小写字母/数字/连字符）' };
  if (typeof m.name !== 'string' || !m.name.trim()) return { ok: false, reason: 'name 缺失' };
  if (!parseVer(m.version)) return { ok: false, reason: 'version 非法（须 x.y.z）' };
  return { ok: true };
}

export function createLoader(cfg) {
  var coreVersion = cfg.coreVersion || '1.0.0';
  var bus = cfg.bus, data = cfg.data, ui = cfg.ui, guard = cfg.guard;
  var registry = Object.create(null);     /* id -> record */
  var EVENTS = (bus && bus.EVENTS) || {};

  function log(id, msg) {
    try { (console.log || function () { })('[ry:' + id + '] ' + msg); } catch (e) { }
  }

  function buildCtx(id, manifest, mountPoint) {
    var perms = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    var has = function (p) { return perms.indexOf(p) >= 0; };

    var ctx = {
      id: id,
      manifest: manifest,
      runtime: {
        log: function (tag, msg) { log(id, '[' + tag + '] ' + msg); },
        reportError: function (err) { if (guard) guard.reportError(id, err, 'plugin'); }
      },
      events: {},
      data: {},
      ui: { mountPoint: mountPoint }
    };

    if (has('event:subscribe')) { ctx.events.on = bus.on; ctx.events.off = bus.off; }
    if (has('event:emit')) { ctx.events.emit = bus.emit; }

    if (has('read:diagram')) { ctx.data.readDiagram = data.readDiagram; ctx.data.captureProject = data.captureProject; ctx.data.buildCase = data.buildCase; }
    if (has('read:bom')) { ctx.data.readBom = data.readBom; }
    if (has('write:diagram')) { ctx.data.applyProject = data.applyProject; }
    if (has('archive:read')) { ctx.data.readArchives = data.readArchives; ctx.data.loadArchive = data.loadArchive; ctx.data.findSimilar = data.findSimilar; ctx.data.recommend = data.recommend; }
    if (has('archive:write')) { ctx.data.saveArchive = data.saveArchive; ctx.data.deleteArchive = data.deleteArchive; }
    ctx.data.storageMode = data.storageMode;
    ctx.data.computeDeviation = data.computeDeviation;   /* 纯计算，无需权限 */
    /* Hazen-Williams 反推三件套：纯计算 / 只读常量，同样无需权限。
       ★ 注意：这里**没有**任何写通道 —— 「采纳 C 值」只能走 archive:write 存进档案，
          主程序的现有水力计算没有任何插件可以改（方案硬性要求）。 */
    ctx.data.hazenLoss = data.hazenLoss;
    ctx.data.invertHazenC = data.invertHazenC;
    ctx.data.hazenDefaults = data.hazenDefaults;

    if (has('ui:nav')) {
      ctx.ui.registerNav = function (item) {
        return ui.registerNav(Object.assign({ id: id }, item || {}));
      };
      ctx.ui.unregisterNav = function () { ui.unregisterNav(id); };
    }
    return ctx;
  }

  function record(id, patch) {
    var r = registry[id] || (registry[id] = { id: id, status: 'pending' });
    Object.assign(r, patch);
    return r;
  }

  /* 单个插件的完整加载流程；任何异常都被吞掉并转成 skipped/error */
  function loadOne(entry) {
    var path = String((entry && entry.path) || '').replace(/\/+$/, '') + '/';
    var declaredId = (entry && entry.id) || '';
    if (!path || path === '/') {
      record(declaredId || ('bad-' + Math.random().toString(36).slice(2)), { status: 'skipped', reason: 'plugins.json 条目缺 path' });
      return Promise.resolve(null);
    }
    /* ★ 路径基准陷阱（实测 404 抓到）：
         本文件是 ES Module，动态 import() 的相对说明符是相对**模块自身 URL**（core/），
         不是文档 URL —— 直接 import('plugins/x/main.js') 会解析成 /core/plugins/x/main.js → 404。
         ⇒ 一律先按文档基准解析成绝对 URL 再用（fetch 与 import 统一）。 */
    var base = absUrl(path);
    if (!base) {
      record(declaredId || path, { status: 'skipped', reason: '无法解析插件路径基准' });
      return Promise.resolve(null);
    }

    return fetch(base + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function (manifest) {
        var v = validateManifest(manifest);
        if (!v.ok) {
          record(manifest && manifest.id || declaredId || path, { status: 'skipped', reason: 'manifest 校验失败：' + v.reason });
          return null;
        }
        var id = manifest.id;
        if (declaredId && declaredId !== id) {
          record(id, { status: 'skipped', reason: 'plugins.json 的 id(' + declaredId + ') 与 manifest 不一致' });
          return null;
        }
        var req = manifest.requires || {};
        if (req.core && !satisfies(coreVersion, req.core)) {
          record(id, { status: 'skipped', reason: 'requires.core 不满足（需 ' + req.core + '，当前 ' + coreVersion + '）' });
          return null;
        }
        var deps = Array.isArray(req.plugins) ? req.plugins : [];
        for (var i = 0; i < deps.length; i++) {
          if (!registry[deps[i]] || registry[deps[i]].status !== 'active') {
            record(id, { status: 'skipped', reason: '依赖插件缺失或未激活：' + deps[i] });
            return null;
          }
        }

        var version = manifest.version || '0.0.0';
        var mountPoint = ui.createMount(id);
        var entryFile = manifest.entry || 'main.js';
        /* ★ 版本号破缓存：不加 ?v 会拿到旧插件（站点与 SW 都按 URL 缓存） */
        return import(base + entryFile + '?v=' + encodeURIComponent(version))
          .then(function (mod) {
            if (typeof mod.activate !== 'function') {
              record(id, { status: 'skipped', reason: 'main.js 未导出 activate' });
              return null;
            }
            var ctx = buildCtx(id, manifest, mountPoint);
            var res = guard.wrap(id, 'activate', mod.activate, null, [ctx]);
            if (!res.ok) {
              guard.disable(id, 'activate 抛错：' + res.error.message);
              record(id, { status: 'error', reason: 'activate 抛错' });
              return null;
            }
            var rec = record(id, {
              status: 'active',
              manifest: manifest,
              module: mod,
              api: res.value || null,
              mountPoint: mountPoint,
              deactivate: function () { deactivate(id); }
            });
            if (EVENTS.PLUGIN_LOADED) bus.emit(EVENTS.PLUGIN_LOADED, { id: id, status: 'active' });
            log(id, '已激活 v' + version);
            return rec;
          })
          .catch(function (e) {
            record(id, { status: 'skipped', reason: 'import 失败：' + ((e && e.message) || e) });
            return null;
          });
      })
      .catch(function (e) {
        record(declaredId || path, { status: 'skipped', reason: 'manifest 读取失败：' + ((e && e.message) || e) });
        return null;
      });
  }

  function deactivate(id) {
    var rec = registry[id];
    if (!rec) return false;
    if (rec.module && typeof rec.module.deactivate === 'function') {
      guard.wrap(id, 'deactivate', rec.module.deactivate, null, []);
    }
    try { ui.unregisterNav(id); } catch (e) { }
    try { ui.destroyMount(id); } catch (e2) { }
    rec.status = 'inactive';
    rec.module = null;
    return true;
  }

  function deactivateAll() {
    Object.keys(registry).forEach(function (id) { deactivate(id); });
  }

  function loadAll(url) {
    url = absUrl(url || 'plugins.json');
    return fetch(url + '?v=' + encodeURIComponent(coreVersion), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('plugins.json ' + r.status); return r.json(); })
      .then(function (cfg2) {
        var list = (cfg2 && Array.isArray(cfg2.plugins)) ? cfg2.plugins : [];
        /* 串行加载：插件依赖判定需要前一个的状态（依赖数组通常很短，串行足够） */
        var p = Promise.resolve(null);
        list.forEach(function (e) { p = p.then(function () { return loadOne(e); }); });
        return p.then(function () { return registry; });
      })
      .catch(function (e) {
        /* 清单缺失/非法：无感降级 —— 主程序照常跑，只是没有插件 */
        try { (console.warn || console.log)('[ry:loader] 插件清单不可用：' + ((e && e.message) || e)); } catch (e2) { }
        return registry;
      });
  }

  return {
    loadAll: loadAll,
    loadOne: loadOne,
    deactivate: deactivate,
    deactivateAll: deactivateAll,
    registry: function () { return registry; },
    status: function (id) { return registry[id] || null; }
  };
}
