/* 总管口径反推（由规划分区的流量 + 下游主管/支管管径 ⇒ 手绘总管外径）。纯函数，Node 可单测。
 *
 * 为什么要有这个模块（用户 2026-11-04 口径）：
 *   「我在在线地图绘制的总管我设想它只是路由，它的直径要通过实际规划地块的分区来推算出来」
 *   —— 地图上那条线只表达**路由**（走哪、多长、接哪个节点），口径是**设计结果**，
 *   必须能从「分区面积 → 分区流量 → 同轮灌溉的合流 → 经济流速选档」推出来，
 *   而不是让用户对着「外径 未选择」猜一个数。
 *
 * 为什么单独一个文件（改之前先读）：
 *   ① 判定/计算在纯函数里、宿主只负责取素材与落地（站内既有分工，见 mod/trunk-snap.js
 *      与 mod/trunk-geo.js 文件头的同一条理由）；混进 online-map.js 那 3000 行 IIFE 就只能
 *      靠浏览器探针验，而「管径差一档」在截图上根本看不出来。
 *   ② **管径档位与 PE 序列不许在本文件复制一份**：`selectPipe` 与 PE 外径序列的
 *      唯一出处是 mod/inline-09.js（`ci_check_static.cjs` 有 countDef 锁，出现第二份
 *      序列常量定义会直接判红 —— 所以本文件连字面量都不写，只做入参注入）。
 *   ③ **选档器的签名只有一条**（v946 踩过坑）：站内的 selectPipe 是「序列/SDR 已固化」
 *      的包装器，签名 `(Q, targetV, minOd, maxOd)`；本文件只按前三个位置传
 *      `(flow, targetV, floorOd)`，**不许再传 series/sdr**。传了就等于把档位表当成
 *      「管径下限」塞进去 ⇒ 所有档位都过不了 `od >= minOd` ⇒ 一个候选都没比较，
 *      却报出「低于下限 xxx mm 选不出结果」，看起来像「总管比主管大所以超限」，
 *      实际是接线错了。谁要动这里，先看 tests/trunk_size.test.cjs ⑪ 的数值锁。
 *
 * 口径（与三级页 computeThreeLevel / ryZonePipePick 同一条，不另立算法）：
 *   · 分区流量 q = 面积(m²) ÷ 滴带间距(m) ÷ 滴孔间距(m) × 滴头流量(L/h) ÷ 1000  → m³/h
 *   · 轮灌组流量 Q = 组内各分区流量之和（轮灌=同组**同时**灌溉，所以相加是对的；
 *     绝不把全部 8 个区相加 —— 那是「同时全开」，不是轮灌）
 *   · 总管要满足**最不利组**（Q 最大的那一组）；给某一组单独看时可以指定 groupIndex
 *   · 管径下限 = max(90mm 主管最小档, 下游主管外径, 支管外径) —— 总管不能比它供的
 *     主管还细（否则就是缩颈，trunk-panel 的联合复核也是同一条判据）
 *   · 选档 = 经济流速 targetV（PE 管默认 1.5 m/s），由 selectPipe 取最接近的一档
 *
 * 缺少数据时**明说缺什么**（reason），不用 0 或猜测值顶 —— 「宁缺不错」。
 */
(function (root) {
  'use strict';

  var VERSION = 'v946-trunk-od-picker-fix';

  /* 与 inline-09 的 MAIN_PIPE_MIN_OD 同值；调用方注入时以注入值为准。
     留着这个默认值只是为了「面板单独调用」时不至于算出 DN50 的总管。 */
  var DEFAULT_MIN_OD = 90;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isNum(n) ? n : null;
  }

  /* 逐区流量（m³/h）。面积缺失/非正 ⇒ 该区 null（不补 0：补 0 会让合流偏小、
     进而把总管选细，这是「看起来算出来了但其实算错」的最坏情形）。 */
  function zoneFlows(areas, tapeSpacing, emitterSpacing, emitterFlow) {
    var ts = num(tapeSpacing), es = num(emitterSpacing), ef = num(emitterFlow);
    var out = [];
    if (!Array.isArray(areas)) return out;
    var perM2 = (ts > 0 && es > 0 && ef > 0) ? (ef / 1000 / ts / es) : null;
    for (var i = 0; i < areas.length; i++) {
      var a = num(areas[i]);
      out.push((perM2 !== null && a !== null && a > 0) ? a * perM2 : null);
    }
    return out;
  }

  /* 逐组流量。groups = [[zi…], …]（0 基分区序号，与 map-flow-demo 的 groupOf 同口径）。
     同一分区在多个组里出现按第一次算（分组本身应当互斥，脏数据按先到先得，不重复计水）。 */
  function groupFlows(flows, groups) {
    var rows = [], seen = {};
    if (!Array.isArray(groups)) return rows;
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (!Array.isArray(g) || !g.length) continue;
      var sum = 0, missing = [], zones = [];
      for (var k = 0; k < g.length; k++) {
        var zi = Math.floor(num(g[k]) === null ? -1 : num(g[k]));
        if (!(zi >= 0)) continue;
        if (seen[zi]) continue;
        seen[zi] = true;
        zones.push(zi);
        var q = (zi < flows.length) ? flows[zi] : null;
        if (q === null || q === undefined) missing.push(zi);
        else sum += q;
      }
      rows.push({ index: gi, zones: zones, flow: sum, missing: missing });
    }
    return rows;
  }

  /* 主入口。o = {
       zoneAreas: number[]             逐区面积 m²（按分区序号 0 基；缺失位可 null）
       groups:    number[][]           轮灌组（必填；空/缺 ⇒ reason:'no-groups'）
       tapeSpacing, emitterSpacing, emitterFlow   滴灌参数（设计页同源）
       targetV:   经济流速 m/s（默认 1.5）
       mainOd, branchOd: 下游主管/支管外径 mm（可 null）
       minOd:     管径下限（调用方传 MAIN_PIPE_MIN_OD）
       selectPipe:(Q m³/h, targetV m/s, minOd mm) ⇒ {od, v}  —— 站内唯一选档包装器，
                  序列/SDR 已固化在里面，**别再传 series/sdr**（见文件头 ③）
       groupIndex: 指定看哪一组（不传/负 ⇒ 取最不利组合流最大的）
     }
     返回 { ok, reason, flow, od, velocity, groupIndex, zones, zoneCount, missingZones,
            minDownstreamOd, targetV, perZone:[{zi,area,flow}], basis } */
  function suggest(o) {
    o = o || {};
    var areas = o.zoneAreas;
    if (!Array.isArray(areas) || !areas.length) {
      return { ok: false, reason: 'no-zone-area', text: '没有分区面积，无法按分区反推总管口径。' };
    }
    var ts = num(o.tapeSpacing), es = num(o.emitterSpacing), ef = num(o.emitterFlow);
    if (!(ts > 0) || !(es > 0) || !(ef > 0)) {
      return { ok: false, reason: 'no-drip-params', text: '缺少滴灌参数（滴带间距 / 滴孔间距 / 滴头流量），无法算分区流量。' };
    }
    var groups = o.groups;
    if (!Array.isArray(groups) || !groups.length) {
      return { ok: false, reason: 'no-groups', text: '没有轮灌分组，无法确定同轮灌溉的合流流量。' };
    }
    var flows = zoneFlows(areas, ts, es, ef);
    var rows = groupFlows(flows, groups);
    if (!rows.length) return { ok: false, reason: 'no-groups', text: '轮灌分组为空，无法确定同轮灌溉的合流流量。' };

    var pick = null, gi = num(o.groupIndex);
    if (gi !== null && gi >= 0) {
      for (var i = 0; i < rows.length; i++) if (rows[i].index === Math.floor(gi)) { pick = rows[i]; break; }
    }
    if (!pick) {
      rows.forEach(function (r) { if (!pick || r.flow > pick.flow) pick = r; });
    }
    if (!(pick.flow > 0)) {
      return { ok: false, reason: 'no-flow', text: '本组分区面积都读不到有效值，算不出流量。' };
    }

    var mainOd = num(o.mainOd), branchOd = num(o.branchOd), minOd = num(o.minOd);
    var floorOd = DEFAULT_MIN_OD;
    if (minOd !== null && minOd > floorOd) floorOd = minOd;
    if (mainOd !== null && mainOd > floorOd) floorOd = mainOd;
    if (branchOd !== null && branchOd > floorOd) floorOd = branchOd;

    var targetV = num(o.targetV);
    if (!(targetV > 0)) targetV = 1.5;
    var picker = o.selectPipe;
    if (typeof picker !== 'function') {
      return { ok: false, reason: 'no-picker', text: '管径档位选择器未加载，暂不能推算口径。' };
    }
    /* 三个位置参数，一个都不能多（文件头 ③）：多传两个会把档位表/SDR 顶进 minOd。 */
    var pipe = null;
    try { pipe = picker(pick.flow, targetV, floorOd); } catch (e) { pipe = null; }
    if (!pipe || !isNum(pipe.od)) {
      return {
        ok: false, reason: 'no-candidate',
        text: '管径下限 Ø' + floorOd + ' mm 及以上没有可选档位（已超出 PE 外径序列），请核对下游主管/支管管径。'
      };
    }

    var perZone = pick.zones.map(function (zi) {
      return { zi: zi, area: num(areas[zi]), flow: flows[zi] };
    });
    return {
      ok: true,
      reason: '',
      flow: pick.flow,
      od: pipe.od,
      velocity: isNum(pipe.v) ? pipe.v : null,
      groupIndex: pick.index,
      zones: pick.zones,
      zoneCount: pick.zones.length,
      missingZones: pick.missing,
      minDownstreamOd: floorOd,
      targetV: targetV,
      perZone: perZone,
      /* 一句话依据（面板/浮层直接显示，避免两处各写一种说法） */
      basis: pick.zones.length + ' 区同轮灌溉合计 ' + pick.flow.toFixed(2) + ' m³/h' +
        '（下游主管/支管外径不小于 Ø' + floorOd + ' mm）'
    };
  }

  root.RyTrunkSize = {
    VERSION: VERSION,
    DEFAULT_MIN_OD: DEFAULT_MIN_OD,
    zoneFlows: zoneFlows,
    groupFlows: groupFlows,
    suggest: suggest
  };
})(typeof window !== 'undefined' ? window : globalThis);
