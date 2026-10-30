/* ============================================================
   core/storage-guard.js — localStorage 容量守卫
   ------------------------------------------------------------
   【v820 背景：为什么回传会失效】
   浏览器给单个源的 localStorage 只有约 5MB。往里写的不只是工程快照：
     · runye_ai_plot_handoff_v1:<id>   每次点「智能规划」写一份**完整工程快照**
     · runye_ai_plot_session_v1:<id>   智能窗口按 handoffId 分槽，同样从不清
     · runyeMeasuredArea:<id>          每次「回传地块绘制」写一份，失败后刻意保留
     · runye_project_restore_rollback_v1 / ry_plugin_capture_tmp_v1  临时槽
   前三类都是**用完即弃的一次性交接槽**，但没有任何地方回收它们 ⇒ 攒几次就把
   5MB 撑满。撑满后 runyeSaveProject 里那句裸 setItem 直接抛 QuotaExceededError，
   被回传链路当成「旧地块保存失败」，于是整条回传中断，用户只看到一句
   「地块回传未完成：……exceeded the quota」，看不出是存储满了。

   【本模块负责三件事】
     1. reclaim()       回收一次性交接槽腾出空间（无损：这些槽本就用完即弃）
     2. write()         写失败 → 回收 → 重试 → 仍失败才如实报告
     3. trimSnapshot()  工程快照分档瘦身：只剥可再生的三级缓存，不删设计模型与手工几何
     4. usage()/topKeys 占用诊断，失败时打到控制台，下次一眼能定位
   ============================================================ */
(function (root) {
  'use strict';

  var QUOTA_HINT_BYTES = 5 * 1024 * 1024;      /* 主流浏览器每源约 5MB */
  var STALE_MS = 6 * 60 * 60 * 1000;           /* 温和回收：6 小时前的交接槽视为过期 */
  /* [v821] 紧急回收（配额已爆）不能套 6 小时守卫 —— 撑爆配额的恰恰是「今天写的」那批槽。
     改为 5 分钟宽限：刚写入的槽可能正被子窗口消费（点「智能规划」→ 弹窗读取），先放过；
     更早的一律回收。时间戳解析不出来的（旧格式/测试键）视为陈年数据，直接回收。 */
  var EMERGENCY_GRACE_MS = 5 * 60 * 1000;

  /* 用完即弃、可无条件删除 */
  var EXACT_KEYS = [
    'runye_project_restore_rollback_v1',
    'ry_plugin_capture_tmp_v1'
  ];
  /* 一次性交接槽：前缀 + 紧急回收时保留的最新份数 */
  var SLOT_PREFIXES = [
    { prefix: 'runye_ai_plot_handoff_v1:' },
    { prefix: 'runye_ai_plot_session_v1:' },
    { prefix: 'runyeMeasuredArea:' }
  ];

  function ls() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function keyList() {
    var store = ls(), out = [];
    if (!store) return out;
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k != null) out.push(k);
      }
    } catch (e) { }
    return out;
  }
  /* Chrome 按 UTF-16 码元计配额，1 码元 ≈ 2 字节 */
  function bytesOf(k, v) {
    return (String(k).length + (v == null ? 0 : String(v).length)) * 2;
  }
  function slotTime(key, prefix) {
    var id = String(key).slice(prefix.length);
    var head = id.split('-')[0];
    var t = parseInt(head, 36);
    return isFinite(t) && t > 1e11 ? t : null;   /* Date.now() 的 base36；过小视为无时间信息 */
  }

  var api = {
    quotaHint: QUOTA_HINT_BYTES,

    usage: function () {
      var store = ls(), total = 0, items = [];
      if (!store) return { total: 0, items: [], ratio: 0 };
      var keys = keyList();
      for (var i = 0; i < keys.length; i++) {
        var v = null;
        try { v = store.getItem(keys[i]); } catch (e) { }
        var b = bytesOf(keys[i], v);
        total += b;
        items.push({ key: keys[i], bytes: b });
      }
      items.sort(function (a, b) { return b.bytes - a.bytes; });
      return { total: total, items: items, ratio: total / QUOTA_HINT_BYTES };
    },

    topKeys: function (n) {
      return api.usage().items.slice(0, n || 10);
    },

    /* 温和回收：只删明确的一次性槽 + 过期（>6h）的交接槽。页面启动时调用。 */
    gc: function () {
      return api.reclaim({ emergency: false });
    },

    /* 回收一次性交接槽，返回释放的字节数。紧急与启动回收都只删除超过 6 小时的槽，
       避免清掉其他标签页正在消费的交接；配额仍不足时保留数据并如实失败。 */
    reclaim: function (opts) {
      opts = opts || {};
      var emergency = opts.emergency === true;
      var store = ls(), freed = 0;
      if (!store) return 0;

      /* 当前 URL 上正在用的回传槽必须保住，否则刷新重试会失效 */
      var keepTransfer = null;
      try {
        if (root.RyMeasuredAreaBridgeStore && typeof root.RyMeasuredAreaBridgeStore.currentTransferId === 'function') {
          keepTransfer = root.RyMeasuredAreaBridgeStore.currentTransferId();
        }
      } catch (e) { }
      /* 智能规划弹窗通过 handoffId 读取专属快照；紧急回收也不能删掉当前页正在消费的槽。 */
      var keepHandoff = null;
      try {
        var query = new URLSearchParams((root.location && root.location.search) || '');
        keepHandoff = query.get('handoffId');
      } catch (eHandoff) { }

      function drop(key) {
        var v = null;
        try { v = store.getItem(key); } catch (e) { }
        var b = bytesOf(key, v);
        try { store.removeItem(key); freed += b; } catch (e2) { }
      }

      for (var i = 0; i < EXACT_KEYS.length; i++) {
        if (store.getItem(EXACT_KEYS[i]) != null) drop(EXACT_KEYS[i]);
      }

      var keys = keyList(), now = Date.now();
      for (var s = 0; s < SLOT_PREFIXES.length; s++) {
        var cfg = SLOT_PREFIXES[s], hits = [];
        for (var j = 0; j < keys.length; j++) {
          if (keys[j].indexOf(cfg.prefix) === 0) hits.push(keys[j]);
        }
        if (!hits.length) continue;
        /* 按 id 头部（Date.now().toString(36)）倒序 = 由新到旧 */
        hits.sort(function (a, b) {
          return (slotTime(b, cfg.prefix) || 0) - (slotTime(a, cfg.prefix) || 0);
        });
        for (var h = 0; h < hits.length; h++) {
          var key = hits[h];
          if (keepHandoff && (key === 'runye_ai_plot_handoff_v1:' + keepHandoff ||
              key === 'runye_ai_plot_session_v1:' + keepHandoff)) continue;
          if (keepTransfer && key.indexOf('runyeMeasuredArea:') === 0 && key.indexOf(keepTransfer) >= 0) continue;
          if (emergency) {
            var emergencyTime = slotTime(key, cfg.prefix);
            if (emergencyTime != null && now - emergencyTime < EMERGENCY_GRACE_MS) continue;
            drop(key);
          } else {
            var t = slotTime(key, cfg.prefix);
            if (t == null || now - t < STALE_MS) continue;
            drop(key);
          }
        }
      }
      return freed;
    },

    /* 写入：失败 → 紧急回收 → 重试。返回 {ok, freed, error}。 */
    write: function (key, value) {
      var store = ls(), res = { ok: false, freed: 0, error: null };
      if (!store) { res.error = new Error('localStorage 不可用'); return res; }
      try { store.setItem(key, value); res.ok = true; return res; } catch (e) { res.error = e; }
      res.freed = api.reclaim({ emergency: true });
      if (res.freed > 0) {
        try { store.setItem(key, value); res.ok = true; res.error = null; return res; } catch (e2) { res.error = e2; }
      }
      return res;
    },

    /* 工程快照分档瘦身：只剥可以从管网输入重新计算的三级缓存，不删除规范模型或手工几何。
       返回新对象，不改原对象。 */
    trimSnapshot: function (data, level) {
      var out;
      try { out = JSON.parse(JSON.stringify(data)); } catch (e) { return null; }
      if (!out || typeof out !== 'object') return null;
      /* canonicalDrawingDesign 是稳定的规范模型与版本绑定证据；不能假设兼容字段
         一定能无损重建它，因此配额瘦身不得删除。 */
      if (level >= 2 && out.tlDiagramData && typeof out.tlDiagramData === 'object') {
        /* segments / audit 等由水力插件懒算，不属图面几何 */
        ['segments', 'audit', 'hydraCache', 'flowCache', 'debug'].forEach(function (f) {
          if (out.tlDiagramData[f] !== undefined) { delete out.tlDiagramData[f]; out.__trimmed = 'l3cache'; }
        });
      }
      /* 不再提供删除完整三级管网的最后档：其中可能包含用户手工微调。
         缓存剥离仍无法满足配额时应明确报告保存失败。 */
      return out;
    },

    /* 写工程快照：原样 → 回收 → 瘦身 1/2/3 → 仍失败才返回 false */
    writeSnapshot: function (key, data) {
      var store = ls();
      if (!store) return { ok: false, reason: 'unavailable' };
      var json = null;
      try { json = JSON.stringify(data); } catch (e) { return { ok: false, reason: 'serialize' }; }
      var res = api.write(key, json);
      if (res.ok) return { ok: true, trimmed: false, freed: res.freed };
      var freed = res.freed || 0;
      for (var level = 1; level <= 3; level++) {
        var slim = api.trimSnapshot(data, level);
        if (!slim) continue;
        var slimJson = null;
        try { slimJson = JSON.stringify(slim); } catch (e2) { continue; }
        if (slimJson.length >= json.length && level < 3) continue;   /* 没变小，下一档 */
        var r2 = api.write(key, slimJson);
        freed += r2.freed || 0;
        if (r2.ok) return { ok: true, trimmed: true, level: level, freed: freed };
      }
      return { ok: false, reason: 'quota', freed: freed, error: res.error };
    },

    /* 占用最大的键 —— 提示里要点名，用户才知道该删什么 */
    largest: function () {
      var u = api.usage();
      return u.items.length ? u.items[0] : null;
    },

    /* 占用大户 → 用户看得懂的清理指引 */
    hintFor: function (key) {
      var k = String(key || '');
      if (k.indexOf('ry_archive_local_v1') === 0) return '「项目档案」里的旧档案';
      if (k.indexOf('runye_plot_library') === 0) return '「我的地块」里的旧地块';
      if (k.indexOf('runye_ai_plot') === 0) return '智能规划的历史交接数据';
      if (k.indexOf('runyeMeasuredArea') === 0) return '地块回传的历史交接数据';
      if (k.indexOf('runye_plot_design_v1') === 0 || k.indexOf('runye_group_design_v1') === 0) return '各地块的管网留档';
      if (k.indexOf('ry_fill') === 0) return '临时数据';
      return '本机存储里的历史数据';
    },

    /* 一句话诊断（给 Toast 用）：点名占用最大的键 */
    fullMessage: function () {
      var top = api.largest();
      var kb = top ? Math.round(top.bytes / 1024) : 0;
      return top
        ? '本机存储已满，方案未能保存。占用最大的是 ' + api.hintFor(top.key) + '（约 ' + kb + 'KB）。请删掉不用的部分后重试。'
        : '本机存储已满，方案未能保存。请清理本站浏览器数据后重试。';
    },

    /* 失败诊断：把占用 Top N 打到控制台，便于下次一眼定位是谁撑爆的 */
    report: function (label, n) {
      try {
        var u = api.usage();
        var top = u.items.slice(0, n || 8).map(function (it) {
          return it.key.slice(0, 60) + '  ' + Math.round(it.bytes / 1024) + 'KB';
        });
        console.warn('[storage-guard] ' + label + '：已用 ' + Math.round(u.total / 1024) + 'KB / 约 ' +
          Math.round(QUOTA_HINT_BYTES / 1024) + 'KB（' + Math.round(u.ratio * 100) + '%）\n  ' + top.join('\n  '));
        return { total: u.total, top: top };
      } catch (e) { return null; }
    }
  };

  root.RyStorageGuard = api;

  /* 页面启动做一次温和回收：只清过期槽，绝不动正在使用的交接数据 */
  try {
    var freed0 = api.gc();
    if (freed0 > 0) {
      try { console.info('[storage-guard] 启动回收一次性交接槽 ' + Math.round(freed0 / 1024) + 'KB'); } catch (e) { }
    }
  } catch (eInit) { }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
