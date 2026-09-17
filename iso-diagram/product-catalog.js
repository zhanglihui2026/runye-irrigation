/* =====================================================================
 * product-catalog.js — 厂家型号目录（独立版本化模块 · 润野灌溉施工管网）
 * ---------------------------------------------------------------------
 * 职责：为「按真实施工顺序逐件接管」提供可选的**实体产品型号**。
 *       每个条目 = 一种可采购的管材/三通/…，携带材质、各接口规格
 *       （口径数值+口径体系+连接方式）、压力等级、占位长度、资料来源与目录版本。
 *
 * ★ 分阶段收录（2026-09-14 用户要求：先把一个型号跑通，再扩型号）：
 *   当前版本只收录 **Ø110 等径最小闭环**：GEN-PIPE-110（PE直管）+
 *   GEN-TEE-110-110-110（PE等径三通）。弯头/阀门/异径/封堵及 90 系列等
 *   其余型号，待 110 闭环在真实施工流程中验证跑通后，**按同一条目结构补录**
 *   （引擎 planConnect/applyConnect 本身与型号种类无关，补条目即可，无需改引擎）。
 *   全量条目备份见 tests/catalog-full-fixture.cjs（引擎测试夹具）。
 *
 * ★ 精度三级标注（与 NETWORK_EDITOR.md 约定一致）：
 *   1. 通用施工示意   —— source 以 '通用' 开头的条目：几何与接口关系按
 *      通用 PE 灌溉管件绘制，**无真实厂家依据**，仅用于方案示意与培训。
 *   2. 已核实厂家选型 —— source 为 '厂家样本/现场核实' 的条目：可作选型依据，
 *      下料仍需按厂家安装说明扣件。
 *   3. 精确下料       —— 在 2 的基础上核对每件实测占位/插入损耗后才能出下料单
 *      （模型给出的是中心线长度与占位扣减参考，不是下料单）。
 *
 * ★ 如何补充型号：在 CATALOG.items 里追加条目，保持字段结构不变、递增
 *   CATALOG.version。不要删除已有条目——旧方案可能引用其 id。
 *
 * 浏览器挂 window.RyCatalog；Node 可 require（测试用）。无 DOM 依赖。
 * ===================================================================== */
(function () {
  'use strict';

  var CATALOG = {
    version: '2026.09.15-1',
    /* Ø110 等径最小闭环（PE 外径制，灌溉常用 0.4MPa 级）。
     * placeholder = 配件本体占位长度（米，中心线口径）：对接时两端各占一半，
     * 用于把「中心线长度」换算成「下料参考长度」。pipe 类本体占位为 0。 */
    items: [
      /* --- 管材（直管，本体无占位） --- */
      { id: 'GEN-PIPE-110', type: 'pipe', brand: '通用示意', model: 'PE直管 Ø110',
        material: 'PE100', pressure: '0.4MPa', placeholder: 0,
        calibers: [{ label: '两端', caliber: 110, system: 'PE-外径', conn: '热熔对接' }],
        source: '通用施工示意（无厂家依据，待核实）' },

      /* --- 三通：2 个共线直通口 + 1 个分支口（分支垂直于直通轴） --- */
      { id: 'GEN-TEE-110-110-110', type: 'tee', brand: '通用示意', model: 'PE三通 110×110×110',
        material: 'PE100', pressure: '0.4MPa', placeholder: 0.20,
        ports: [
          { key: 's1', label: '直通口A', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
          { key: 's2', label: '直通口B', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
          { key: 'br', label: '分支口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'branch' }
        ],
        source: '通用施工示意（无厂家依据，待核实）' },

      /* --- 弯头：90° 等径（出口方向与来流夹角 = 产品固定角度 90°） --- */
      { id: 'GEN-ELBOW-110-90', type: 'elbow', brand: '通用示意', model: 'PE弯头 110×110 90°',
        material: 'PE100', pressure: '0.4MPa', placeholder: 0.12, angle: 90,
        ports: [
          { key: 'in', label: '进口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
          { key: 'out', label: '出口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
        ],
        source: '通用施工示意（无厂家依据，待核实）' },

      /* --- 阀门：两端等径（2026-09-15 补录，供「接阀门 / 管中插阀」使用） --- */
      { id: 'GEN-VALVE-110', type: 'valve', brand: '通用示意', model: 'PE球阀 110',
        material: 'PE100', pressure: '0.4MPa', placeholder: 0.16,
        ports: [
          { key: 'in', label: '进口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
          { key: 'out', label: '出口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
        ],
        source: '通用施工示意（无厂家依据，待核实）' }
    ]
  };

  /* 每类配件的固定接口数契约（多一口/少一口都是模型违约）。
   * 未收录类型的契约先保留 —— 补录型号时直接可用。 */
  var PORT_COUNT = { pipe: 2, tee: 3, elbow: 2, valve: 2, reducer: 2, cap: 1 };

  function all() { return CATALOG.items.slice(); }
  function get(id) {
    for (var i = 0; i < CATALOG.items.length; i++) if (CATALOG.items[i].id === id) return CATALOG.items[i];
    return null;
  }
  function byType(type) { return CATALOG.items.filter(function (it) { return it.type === type; }); }
  /* 按类型 + 入口口径筛选（接装时只列能与现有接口对接的型号） */
  function byTypeCaliber(type, caliber) {
    return CATALOG.items.filter(function (it) {
      if (it.type !== type) return false;
      if (caliber == null) return true;
      if (it.type === 'pipe') return it.calibers[0].caliber === caliber;
      /* 异径：任一口匹配即可；其余：任一口同口径 */
      return it.ports.some(function (p) { return p.caliber === caliber; });
    });
  }
  function portCount(type) { return PORT_COUNT[type] || null; }
  function isGeneric(item) { return !!item && /^通用/.test(item.source || ''); }
  /* 目录整体精度级别：全部条目已核实 → 'verified'，否则 'generic' */
  function level() {
    return CATALOG.items.every(function (it) { return !isGeneric(it); }) ? 'verified' : 'generic';
  }

  var API = {
    CATALOG_VERSION: CATALOG.version,
    version: CATALOG.version,
    meta: function () { return { version: CATALOG.version, level: level() }; },
    all: all, get: get, byType: byType, byTypeCaliber: byTypeCaliber,
    portCount: portCount, isGeneric: isGeneric, level: level
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.RyCatalog = API;
  if (typeof globalThis !== 'undefined') globalThis.RyCatalog = API;
})();
