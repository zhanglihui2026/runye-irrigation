/* 总管编辑层的纯逻辑（三期）。**这里不碰 Leaflet**，交互在 mod/online-map.js。
 *
 * 为什么拆开：打断 / 合并 / 连线判定这三件事最容易出错，而它们的正确性不该靠
 * "拖一下看看对不对"来验证。把它们做成纯函数后，可以在 Node 里用固定坐标逐条断言。
 *
 * 三条硬规则（改之前先读）：
 *   ① **合并时编号与参数沿用「列表里在前的那条」**（用户明确要求），后段整条删除。
 *      main 标记取两者的或 —— 否则合并掉主干会让整块地突然没有主干线。
 *   ② **打断后两条线各自独立**：参数是深拷贝，不共享引用。共享会出现"改了一条另一条也变"。
 *   ③ 首尾相接的判定用**实地米**（MERGE_M=0.3），不是像素 —— 这是几何事实，与缩放假无关。
 */
(function (root) {
  'use strict';

  var MERGE_M = 0.3;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* 与 trunk-schema 同口径读点：[lat,lng] / [lat,lng,z] / {lat,lng} */
  function pt(q) {
    if (Array.isArray(q)) {
      if (q.length < 2) return null;
      var la = Number(q[0]), ln = Number(q[1]);
      return isNum(la) && isNum(ln) ? { lat: la, lng: ln } : null;
    }
    if (q && typeof q === 'object') {
      var a = Number(q.lat), b = Number(q.lng);
      return isNum(a) && isNum(b) ? { lat: a, lng: b } : null;
    }
    return null;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /* 两条干线是否首尾相接。返回 'ab'（A 末接 B 首）/ 'ba'（B 末接 A 首）/ null。
     distFn(a,b) 返回米数，由宿主注入（浏览器里是 map.distance）。 */
  function jointOf(a, b, distFn, tolM) {
    var tol = isNum(tolM) ? tolM : MERGE_M;
    if (!a || !b || !Array.isArray(a.points) || !Array.isArray(b.points)) return null;
    if (a.points.length < 2 || b.points.length < 2) return null;
    var aEnd = pt(a.points[a.points.length - 1]), bStart = pt(b.points[0]);
    if (aEnd && bStart && distFn(aEnd, bStart) <= tol) return 'ab';
    var bEnd = pt(b.points[b.points.length - 1]), aStart = pt(a.points[0]);
    if (bEnd && aStart && distFn(bEnd, aStart) <= tol) return 'ba';
    return null;
  }

  /* 与指定干线首尾相接的其它干线 id 列表（用于菜单项可用性判断）。 */
  function connectedIds(trunk, id, distFn, tolM) {
    var out = [];
    if (!trunk || !Array.isArray(trunk.trunks)) return out;
    var base = null;
    for (var i = 0; i < trunk.trunks.length; i++) {
      if (String(trunk.trunks[i].id) === String(id)) { base = trunk.trunks[i]; break; }
    }
    if (!base) return out;
    for (var j = 0; j < trunk.trunks.length; j++) {
      var other = trunk.trunks[j];
      if (String(other.id) === String(id)) continue;
      if (jointOf(base, other, distFn, tolM)) out.push(String(other.id));
    }
    return out;
  }

  /* 找最近拐点下标；超过容差返回 -1。 */
  function nearestVertexIndex(points, lat, lng, distFn, tolM) {
    if (!Array.isArray(points) || !points.length) return -1;
    var target = { lat: Number(lat), lng: Number(lng) };
    if (!isNum(target.lat) || !isNum(target.lng)) return -1;
    var tol = isNum(tolM) ? tolM : MERGE_M * 40;   // 默认 12m 左右，足够覆盖手指精度
    var best = -1, bestD = Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = pt(points[i]);
      if (!p) continue;
      var d = distFn(p, target);
      if (d <= tol && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* 打断：在 idx 处切开，前段保留原 id，后段成为新 id。
     idx 必须是中间点（首尾切没有意义，会得到一条只有 1 个点的线）。 */
  function splitTrunk(trunk, id, idx, makeIdFn) {
    if (!trunk || !Array.isArray(trunk.trunks)) return { ok: false, error: 'trunk 无效' };
    var i, entry = null, at = -1;
    for (i = 0; i < trunk.trunks.length; i++) {
      if (String(trunk.trunks[i].id) === String(id)) { entry = trunk.trunks[i]; at = i; break; }
    }
    if (!entry) return { ok: false, error: '找不到干线 ' + id };
    var n = Array.isArray(entry.points) ? entry.points.length : 0;
    if (n < 3) return { ok: false, error: '至少 3 个拐点才能打断' };
    if (!(idx > 0 && idx < n - 1)) return { ok: false, error: '只能在中间拐点处打断' };

    var next = clone(trunk);
    var head = clone(entry);
    var tail = clone(entry);
    head.points = next.trunks[at].points.slice(0, idx + 1);
    tail.points = next.trunks[at].points.slice(idx);
    tail.id = makeIdFn ? makeIdFn(next) : ('T' + (next.trunks.length + 1));
    tail.main = false;          // 后段不抢主干；主干跟着前段
    /* 参数深拷贝 —— 两条线共享同一份 params 会出现"改一条另一条也变" */
    tail.params = clone(entry.params || {});
    head.params = clone(entry.params || {});
    next.trunks[at] = head;
    next.trunks.push(tail);
    return { ok: true, trunk: next, newId: tail.id, headId: head.id };
  }

  /* 合并：编号与参数沿用 keepId（列表里在前的那条），另一条删除。 */
  function mergeTrunks(trunk, keepId, dropId, distFn) {
    if (!trunk || !Array.isArray(trunk.trunks)) return { ok: false, error: 'trunk 无效' };
    if (String(keepId) === String(dropId)) return { ok: false, error: '不能和自己合并' };
    var keep = null, drop = null, keepAt = -1, dropAt = -1, i;
    for (i = 0; i < trunk.trunks.length; i++) {
      var t = trunk.trunks[i];
      if (String(t.id) === String(keepId)) { keep = t; keepAt = i; }
      if (String(t.id) === String(dropId)) { drop = t; dropAt = i; }
    }
    if (!keep || !drop) return { ok: false, error: '找不到要合并的干线' };
    var joint = jointOf(keep, drop, distFn, MERGE_M);
    if (!joint) return { ok: false, error: '两条干线首尾没有接上（超过 0.3 m）' };

    var next = clone(trunk);
    var mergedPts;
    if (joint === 'ab') {
      mergedPts = next.trunks[keepAt].points.concat(next.trunks[dropAt].points.slice(1));
    } else {
      /* 反向接：A 首接 B 尾 ⇒ 用 B 的点在前，但**编号/参数仍取 keep** */
      mergedPts = next.trunks[dropAt].points.concat(next.trunks[keepAt].points.slice(1));
    }
    next.trunks[keepAt].points = mergedPts;
    next.trunks[keepAt].main = next.trunks[keepAt].main === true || next.trunks[dropAt].main === true;
    next.trunks.splice(dropAt, 1);
    return { ok: true, trunk: next, mergedId: String(keepId), joint: joint };
  }

  /* 删除一条干线。删完一条不剩时，调用方负责把整个 trunk 置空。 */
  function removeTrunk(trunk, id) {
    if (!trunk || !Array.isArray(trunk.trunks)) return { ok: false, error: 'trunk 无效' };
    var next = clone(trunk);
    var at = -1, i;
    for (i = 0; i < next.trunks.length; i++) {
      if (String(next.trunks[i].id) === String(id)) { at = i; break; }
    }
    if (at < 0) return { ok: false, error: '找不到干线 ' + id };
    next.trunks.splice(at, 1);
    /* 删掉的是主干 ⇒ 把 main 顺延给第一条，否则整块地会变成"没有主干" */
    if (!next.trunks.some(function (t) { return t.main === true; }) && next.trunks.length) {
      next.trunks[0].main = true;
    }
    return { ok: true, trunk: next, empty: next.trunks.length === 0 };
  }

  /* 移动一个拐点。拖动中也会调用（实时重画），所以不做任何校验，只改坐标。 */
  function moveVertex(trunk, id, idx, lat, lng, z) {
    if (!trunk || !Array.isArray(trunk.trunks)) return { ok: false, error: 'trunk 无效' };
    var next = clone(trunk);
    for (var i = 0; i < next.trunks.length; i++) {
      if (String(next.trunks[i].id) !== String(id)) continue;
      var pts = next.trunks[i].points;
      if (!Array.isArray(pts) || idx < 0 || idx >= pts.length) return { ok: false, error: '拐点下标越界' };
      var old = pt(pts[idx]);
      var keepZ = old && typeof pts[idx] === 'object' && !Array.isArray(pts[idx]) ? pts[idx].z
        : (Array.isArray(pts[idx]) && pts[idx].length >= 3 ? pts[idx][2] : undefined);
      var useZ = (z === undefined) ? keepZ : z;
      pts[idx] = (useZ === undefined || useZ === null || !isNum(Number(useZ)))
        ? [Number(lat), Number(lng)]
        : [Number(lat), Number(lng), Number(useZ)];
      return { ok: true, trunk: next };
    }
    return { ok: false, error: '找不到干线 ' + id };
  }

  /* 删除一个拐点（拖到与邻点重合时用）。删完不足 2 点则拒绝 —— 调用方据此回滚。 */
  function removeVertex(trunk, id, idx) {
    if (!trunk || !Array.isArray(trunk.trunks)) return { ok: false, error: 'trunk 无效' };
    var next = clone(trunk);
    for (var i = 0; i < next.trunks.length; i++) {
      if (String(next.trunks[i].id) !== String(id)) continue;
      var pts = next.trunks[i].points;
      if (!Array.isArray(pts) || idx < 0 || idx >= pts.length) return { ok: false, error: '拐点下标越界' };
      if (pts.length <= 2) return { ok: false, error: '这条线至少要保留两个拐点' };
      pts.splice(idx, 1);
      return { ok: true, trunk: next };
    }
    return { ok: false, error: '找不到干线 ' + id };
  }

  /* 菜单 6 项：**顺序固定**，探针逐字校验（以后加功能不要插在中间，加在末尾并同步改探针）。 */
  var MENU_ORDER = ['delete', 'split', 'merge', 'copyParams', 'pasteParams', 'markVertex'];
  var MENU_LABEL = {
    delete: '删除这条干线',
    split: '在拐点处打断',
    merge: '与相连干线合并',
    copyParams: '复制参数',
    pasteParams: '粘贴参数',
    markVertex: '标记当前拐点'
  };

  function buildMenuItems(state) {
    state = state || {};
    var pts = state.points || [];
    var idx = typeof state.vertexIndex === 'number' ? state.vertexIndex : -1;
    var connected = Array.isArray(state.connectedIds) ? state.connectedIds : [];
    var enabled = {
      delete: !!state.activeId,
      split: !!state.activeId && pts.length >= 3 && idx > 0 && idx < pts.length - 1,
      merge: !!state.activeId && connected.length > 0,
      copyParams: !!state.activeId,
      pasteParams: !!state.activeId && state.clipboardEmpty === false,
      markVertex: !!state.activeId && idx >= 0
    };
    return MENU_ORDER.map(function (k) {
      return { key: k, label: MENU_LABEL[k], enabled: !!enabled[k] };
    });
  }

  root.RyTrunkEdit = {
    MERGE_M: MERGE_M,
    MENU_ORDER: MENU_ORDER,
    MENU_LABEL: MENU_LABEL,
    pt: pt,
    jointOf: jointOf,
    connectedIds: connectedIds,
    nearestVertexIndex: nearestVertexIndex,
    splitTrunk: splitTrunk,
    mergeTrunks: mergeTrunks,
    removeTrunk: removeTrunk,
    moveVertex: moveVertex,
    removeVertex: removeVertex,
    buildMenuItems: buildMenuItems
  };
})(typeof window !== 'undefined' ? window : this);
