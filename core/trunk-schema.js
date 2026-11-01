/* 地图总管数据契约 v2（多干线）。
 *
 * 为什么要有这个文件：
 *   v1 的 plot.trunk 是「单段」{schema:1, points:[[lat,lng]…]}。多干线 / 打断 / 合并
 *   都要求「一组线，每条有自己的编号和参数」。但 plot.trunk 在整个仓库里有 5 个读取方
 *   （online-map.js 写 / online-map.js 回填草稿 / inline-13.js / inline-16.js / inline-09.js），
 *   如果每处各写一份 `if(schema===1)`，schema 一升就会立刻分裂成两套语义。
 *   ⇒ 迁移只允许有这一个入口。读取方一律 `normalize()` + `pickMainTrunk()`，写方一律产出 v2。
 *
 * 关键约束（改之前先读）：
 *   · normalize 对 v1 输入必须让 points **逐元素原样透传** —— 不转换形状（[lat,lng] 与
 *     {lat,lng} 两种历史写法都还存在）、不四舍五入、不重排。下游靠原值做投影，动一下就漂。
 *   · 下游仍然只认「一条主干」：pickMainTrunk() = main 优先，否则 trunks[0]。
 *     让施工图渲染多干线 = 重写布管算法 + 水力 + 材料清单，不在本阶段范围内。
 *   · migratePlot() 只返回新对象，不改入参；真正写库由调用方走
 *     RyPlotLibraryStore.replace(next, revision) 的版本校验，本模块不碰存储。
 *
 * 点的高程 z 是可选的（冲突 3 的裁决：缺数据显示 —，绝不伪造 0）：
 *   [lat, lng, z] 或 {lat, lng, z}；z 缺失即 undefined，不做任何默认填充。
 */
(function (root) {
  'use strict';

  var VERSION = 2;
  var MIN_POINTS = 2;
  var MAX_TRUNKS = 64;

  function isNum(v) {
    if (typeof v === 'number') return isFinite(v);
    if (v === null || v === undefined || v === '') return false;
    return isFinite(Number(v));
  }

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* 读一个点：兼容 [lat,lng] / [lat,lng,z] / {lat,lng} / {lat,lng,z}。
     z 缺失就返回 undefined（不补 0），调用方可据此显示「—」。
     [v854 专项] 空位（null/undefined/''）一律非法：Number(null)===0、Number('')===0，
     宽容读会把空位变成「几内亚湾上的点」并流进 pointsOk ⇒ 垃圾几何带进库、
     状态栏/面板/DXF 全链算出几千公里。与 mod/trunk-geo.js 的 rawPointOk 同语义
     （那条链 v851 前已收紧）；这里收紧后 normalize 对含空位的干线按既有契约
     逐条判废（"无法识别 ⇒ null ⇒ continue"），不是新增语义。 */
  function readPoint(q) {
    var lat, lng, z;
    if (Array.isArray(q)) {
      if (q.length < 2) return null;
      if (q[0] == null || q[0] === '' || q[1] == null || q[1] === '') return null;
      lat = Number(q[0]); lng = Number(q[1]);
      if (q.length >= 3 && isNum(q[2])) z = Number(q[2]);
    } else if (q && typeof q === 'object') {
      if (q.lat == null || q.lat === '' || q.lng == null || q.lng === '') return null;
      lat = Number(q.lat); lng = Number(q.lng);
      if (isNum(q.z)) z = Number(q.z);
    } else return null;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    var out = { lat: lat, lng: lng };
    if (z !== undefined) out.z = z;
    return out;
  }

  function pointsOk(points) {
    if (!Array.isArray(points) || points.length < MIN_POINTS) return false;
    for (var i = 0; i < points.length; i++) if (!readPoint(points[i])) return false;
    return true;
  }

  /* 管线编号（显示用，如 "ZG-001"）：只做 trim + 长度截断，**不做格式校验**。
     它是给人看的标签，宽容一点没有坏处；id 才是引用键，改 id 会打断
     activeTrunkId / params.labels 的下标语义，所以编号绝不参与 id。 */
  var CODE_MAX = 24;
  function normalizeCode(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, CODE_MAX);
  }

  /* 整条线内最多一个水源进水口：多出来的降级丢弃（不做「留第一个」以外的补救，
     因为「哪个才算」没有正确答案，让用户自己再标一次比猜更安全）。 */
  var NODE_KIND = { source: true, tee: true };
  function normalizeNodeTypes(raw, count) {
    if (!raw || typeof raw !== 'object') return null;
    var keys = Object.keys(raw), out = {}, hasSource = false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!/^(0|[1-9]\d*)$/.test(k)) continue;
      var idx = Number(k);
      if (!isFinite(idx)) continue;
      if (count != null && (idx < 0 || idx >= count)) continue;
      var t = raw[k];
      if (!NODE_KIND[t]) continue;
      if (t === 'source') {
        if (hasSource) continue;
        hasSource = true;
      }
      out[String(idx)] = t;
    }
    return Object.keys(out).length ? out : null;
  }

  /* 参数归一：保留调用方给的全部字段（未来可能加 label/埋深），只补最小默认值。
     不要在这里做白名单裁剪 —— 会静默吃掉别人刚加的参数。
     例外：code 会被规范化（trim/截断），因为它是**显示字符串**，不是数据。 */
  function normalizeParams(p) {
    var out = {};
    if (p && typeof p === 'object') {
      for (var k in p) if (own(p, k)) out[k] = p[k];
    }
    if (typeof out.material !== 'string' || !out.material) out.material = 'PE';
    if (!own(out, 'dn')) out.dn = null;
    if (!own(out, 'designFlow')) out.designFlow = null;
    if (own(out, 'code')) out.code = normalizeCode(out.code);
    /* 流速提醒屏蔽（规格六）：**只认严格 true**。false / 0 / '' / 'false' 一律删掉 ——
       它们语义上都是"没屏蔽"，留着只会让库里攒一堆等价脏值，
       而下游又要为"到底哪种算屏蔽"再写一次判断（那种二义性迟早出错）。 */
    if (own(out, 'warnMuted') && out.warnMuted !== true) delete out.warnMuted;
    return out;
  }

  function normalizeEntry(entry, fallbackId, fallbackMain) {
    if (!entry || typeof entry !== 'object') return null;
    if (!pointsOk(entry.points)) return null;
    var id = entry.id == null ? '' : String(entry.id).trim();
    if (!id) id = fallbackId;
    if (!id) return null;
    var pts = Array.isArray(entry.points) ? entry.points.slice() : [];
    var params = normalizeParams(entry.params);
    /* nodeTypes 的下标必须落在点数范围内 —— 打断/删点之后旧下标会越界，
       越界的标记不能留（它指的那个拐点已经不存在了）。 */
    if (own(params, 'nodeTypes')) {
      var nt = normalizeNodeTypes(params.nodeTypes, pts.length);
      if (nt) params.nodeTypes = nt;
      else delete params.nodeTypes;
    }
    return {
      id: id,
      main: entry.main === true || (entry.main === undefined && fallbackMain === true),
      points: pts,
      params: params
    };
  }

  /* 把任意历史形状收敛成规范 v2；无法识别时返回 null（调用方据此判定「没有总管」）。
     v1 的 points 元素原样保留 —— 只换个外壳。 */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    var schema = Number(raw.schema);
    var out = {
      schema: VERSION,
      source: typeof raw.source === 'string' && raw.source ? raw.source : 'map',
      coordinateSystem: typeof raw.coordinateSystem === 'string' && raw.coordinateSystem
        ? raw.coordinateSystem : 'GCJ-02',
      revision: isNum(raw.revision) ? Number(raw.revision) : 0,
      trunks: []
    };

    /* v2 或「带 trunks 的未来形状」 */
    if (Array.isArray(raw.trunks)) {
      for (var i = 0; i < raw.trunks.length && out.trunks.length < MAX_TRUNKS; i++) {
        var e = normalizeEntry(raw.trunks[i], 'T' + (out.trunks.length + 1), out.trunks.length === 0);
        if (!e) continue;
        if (out.trunks.some(function (x) { return x.id === e.id; })) continue;   // id 撞车就跳过，不让两个同名
        out.trunks.push(e);
      }
      if (!out.trunks.length) return null;
      /* main 最多一条：取第一个标记的 */
      var seenMain = false;
      for (var m = 0; m < out.trunks.length; m++) {
        if (out.trunks[m].main && !seenMain) { seenMain = true; continue; }
        out.trunks[m].main = false;
      }
      /* 水源进水口**全方案唯一**（规格四）：跨干线也只留第一个。
         顺序按 trunks 顺序走 ⇒ 结果确定，不会每次读出来"水源换了个人"。 */
      var seenSource = false;
      for (var s = 0; s < out.trunks.length; s++) {
        var prm = out.trunks[s].params;
        if (!prm || !prm.nodeTypes) continue;
        var nt = prm.nodeTypes, dirty = false;
        for (var k in nt) {
          if (!own(nt, k) || nt[k] !== 'source') continue;
          if (seenSource) { delete nt[k]; dirty = true; }
          else seenSource = true;
        }
        if (dirty && !Object.keys(nt).length) delete prm.nodeTypes;
      }
      return out;
    }

    /* v1：单段 points（也容忍完全没有 schema 的老记录） */
    if (pointsOk(raw.points)) {
      out.trunks.push({
        id: 'T1',
        main: true,
        points: raw.points.slice(),
        params: normalizeParams(raw.params)
      });
      return out;
    }

    return null;
  }

  /* 下游唯一入口：取「主干」。main 优先，否则第一条。没有可用线返回 null。 */
  function pickMainTrunk(trunk) {
    var t = trunk && trunk.schema === VERSION ? trunk : normalize(trunk);
    if (!t || !t.trunks || !t.trunks.length) return null;
    for (var i = 0; i < t.trunks.length; i++) if (t.trunks[i].main) return t.trunks[i];
    return t.trunks[0];
  }

  /* 主干折点（经纬度原值）。所有「把总管投到本地米坐标」的地方都从这里取。 */
  function mainPoints(trunk) {
    var m = pickMainTrunk(trunk);
    return m && Array.isArray(m.points) && m.points.length >= MIN_POINTS ? m.points : null;
  }

  /* 「这块地有没有可用的总管」—— inline-09 那种前置判断用它，别再手写 schema===1。 */
  function hasUsableTrunk(plot) {
    if (!plot || plot.merged || plot.grouped || plot.mergedInto) return false;
    return mainPoints(plot.trunk) !== null;
  }

  /* 降级视图：给「只认 v1」的老代码过渡用。主干参数写回顶层，方便一次性替换。 */
  function toV1(trunk) {
    var m = pickMainTrunk(trunk);
    if (!m) return null;
    var t = trunk && trunk.schema === VERSION ? trunk : normalize(trunk);
    var out = {
      schema: 1,
      source: t.source,
      coordinateSystem: t.coordinateSystem,
      revision: t.revision,
      points: m.points.slice()
    };
    if (m.params) for (var k in m.params) if (own(m.params, k)) out[k] = m.params[k];
    return out;
  }

  /* 生成一个不与现有 id 冲突的编号：优先补空位（T1、T2…），否则接在最大号后面。 */
  function makeId(trunk) {
    var t = trunk && trunk.schema === VERSION ? trunk : normalize(trunk);
    var used = Object.create(null);
    if (t && Array.isArray(t.trunks)) {
      for (var i = 0; i < t.trunks.length; i++) used[String(t.trunks[i].id)] = true;
    }
    for (var n = 1; n <= MAX_TRUNKS; n++) {
      if (!used['T' + n]) return 'T' + n;
    }
    return 'T' + (MAX_TRUNKS + 1);
  }

  /* 显示用管线编号：ZG-001 / ZG-002…（规格五①）。
     与 makeId 分开是有意的 —— id 是引用键（不能被用户改），编号是标签（用户可以改）。 */
  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }
  function makeCode(trunk) {
    var t = trunk && trunk.schema === VERSION ? trunk : normalize(trunk);
    var used = Object.create(null);
    if (t && Array.isArray(t.trunks)) {
      for (var i = 0; i < t.trunks.length; i++) {
        var c = t.trunks[i].params && t.trunks[i].params.code;
        if (c) used[String(c)] = true;
      }
    }
    for (var n = 1; n <= MAX_TRUNKS; n++) {
      var code = 'ZG-' + pad3(n);
      if (!used[code]) return code;
    }
    return 'ZG-' + pad3(MAX_TRUNKS + 1);
  }

  function validate(trunk) {
    var errors = [];
    if (!trunk || typeof trunk !== 'object') return { ok: false, errors: ['trunk 不是对象'] };
    if (Number(trunk.schema) !== VERSION) errors.push('schema 应为 ' + VERSION + '，实际 ' + trunk.schema);
    if (!Array.isArray(trunk.trunks) || !trunk.trunks.length) {
      errors.push('trunks 不是非空数组');
      return { ok: false, errors: errors };
    }
    if (trunk.trunks.length > MAX_TRUNKS) errors.push('trunks 超过上限 ' + MAX_TRUNKS);
    var seen = Object.create(null), mains = 0;
    trunk.trunks.forEach(function (e, i) {
      var at = 'trunks[' + i + ']';
      if (!e || typeof e !== 'object') { errors.push(at + ' 不是对象'); return; }
      var id = e.id == null ? '' : String(e.id).trim();
      if (!id) errors.push(at + '.id 为空');
      else if (seen[id]) errors.push(at + '.id 重复：' + id);
      else seen[id] = true;
      if (!pointsOk(e.points)) errors.push(at + '.points 少于 ' + MIN_POINTS + ' 个合法点');
      if (e.main === true) mains++;
      if (e.params && typeof e.params !== 'object') errors.push(at + '.params 不是对象');
    });
    if (mains > 1) errors.push('main 标记了 ' + mains + ' 条，最多 1 条');
    return { ok: errors.length === 0, errors: errors };
  }

  /* 迁移一块地：返回新 plot（不改入参）。
     changed=false 表示本来就是合法 v2，调用方可以跳过写库。 */
  function migratePlot(plot) {
    if (!plot || typeof plot !== 'object') return { ok: false, changed: false, plot: plot, error: 'plot 无效' };
    var raw = plot.trunk;
    if (!raw) return { ok: true, changed: false, plot: plot, error: null };
    var next = normalize(raw);
    if (!next) return { ok: false, changed: false, plot: plot, error: 'trunk 无法识别为 v1/v2' };
    var changed = !(Number(raw.schema) === VERSION && Array.isArray(raw.trunks));
    var out = clone(plot);
    out.trunk = next;
    return { ok: true, changed: changed, plot: out, error: null };
  }

  /* 新建一条干线（给「＋新增干线」用）：把已有线原样保留，追加一条空线等着画。 */
  function appendTrunk(trunk, opts) {
    var t = normalize(trunk);
    if (!t) {
      t = { schema: VERSION, source: 'map', coordinateSystem: 'GCJ-02', revision: 0, trunks: [] };
    }
    opts = opts || {};
    var entry = {
      id: opts.id || makeId(t),
      main: opts.main === true || !t.trunks.length,
      points: Array.isArray(opts.points) ? opts.points.slice() : [],
      params: normalizeParams(opts.params)
    };
    t.trunks.push(entry);
    return t;
  }

  root.RyTrunkSchema = {
    VERSION: VERSION,
    MIN_POINTS: MIN_POINTS,
    MAX_TRUNKS: MAX_TRUNKS,
    readPoint: readPoint,
    pointsOk: pointsOk,
    normalize: normalize,
    normalizeParams: normalizeParams,
    normalizeCode: normalizeCode,
    normalizeNodeTypes: normalizeNodeTypes,
    pickMainTrunk: pickMainTrunk,
    mainPoints: mainPoints,
    hasUsableTrunk: hasUsableTrunk,
    toV1: toV1,
    makeId: makeId,
    makeCode: makeCode,
    validate: validate,
    migratePlot: migratePlot,
    appendTrunk: appendTrunk
  };
})(typeof window !== 'undefined' ? window : this);
