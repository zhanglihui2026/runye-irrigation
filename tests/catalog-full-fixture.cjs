/* =====================================================================
 * tests/catalog-full-fixture.cjs — 引擎测试用「全量目录」夹具
 * ---------------------------------------------------------------------
 * 发布目录（iso-diagram/product-catalog.js）已按用户要求收窄到 Ø110 等径
 * 最小闭环（GEN-PIPE-110 + GEN-TEE-110-110-110）。但模型引擎
 * planConnect/applyConnect 对弯头/阀门/异径/封堵等类型的方向规则、接口数
 * 契约、异径换口径等逻辑仍然通用 —— 引擎测试需要全量条目才能覆盖这些规则。
 *
 * 本夹具 = 发布目录全部条目 + 补回暂不发布的 12 条（90 系列 / 弯头 / 阀门 /
 * 异径 / 封堵），API 与发布目录完全一致。测试通过
 * `globalThis.RyCatalog = require('./catalog-full-fixture.cjs')` 注入
 * （network-model.js 的 CAT 解析链优先读 globalThis.RyCatalog）。
 * ===================================================================== */
'use strict';
const base = require('../iso-diagram/product-catalog.js');

const EXTRA = [
  { id: 'GEN-PIPE-90', type: 'pipe', brand: '通用示意', model: 'PE直管 Ø90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0,
    calibers: [{ label: '两端', caliber: 90, system: 'PE-外径', conn: '热熔对接' }],
    source: '通用施工示意（无厂家依据，待核实）' },

  { id: 'GEN-TEE-110-110-90', type: 'tee', brand: '通用示意', model: 'PE三通 110×110×90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.20,
    ports: [
      { key: 's1', label: '直通口A', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 's2', label: '直通口B', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'br', label: '分支口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'branch' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-TEE-90-90-90', type: 'tee', brand: '通用示意', model: 'PE三通 90×90×90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.15,
    ports: [
      { key: 's1', label: '直通口A', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 's2', label: '直通口B', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'br', label: '分支口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'branch' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },

  { id: 'GEN-ELB-90-90', type: 'elbow', brand: '通用示意', model: 'PE弯头 90° Ø90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12, angle: 90,
    ports: [
      { key: 'a', label: '进口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'b', label: '出口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-ELB-110-90', type: 'elbow', brand: '通用示意', model: 'PE弯头 90° Ø110',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.14, angle: 90,
    ports: [
      { key: 'a', label: '进口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'b', label: '出口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-ELB-90-45', type: 'elbow', brand: '通用示意', model: 'PE弯头 45° Ø90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12, angle: 45,
    ports: [
      { key: 'a', label: '进口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'b', label: '出口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },

  { id: 'GEN-VALVE-110', type: 'valve', brand: '通用示意', model: 'PE球阀 Ø110',
    material: 'PE', pressure: '0.4MPa', placeholder: 0.25,
    ports: [
      { key: 'in', label: '进口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'out', label: '出口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-VALVE-90', type: 'valve', brand: '通用示意', model: 'PE球阀 Ø90',
    material: 'PE', pressure: '0.4MPa', placeholder: 0.22,
    ports: [
      { key: 'in', label: '进口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'out', label: '出口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },

  { id: 'GEN-RED-110-90', type: 'reducer', brand: '通用示意', model: 'PE异径 110×90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12,
    ports: [
      { key: 'big', label: '大口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'small', label: '小口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-RED-90-63', type: 'reducer', brand: '通用示意', model: 'PE异径 90×63',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12,
    ports: [
      { key: 'big', label: '大口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' },
      { key: 'small', label: '小口', caliber: 63, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },

  { id: 'GEN-CAP-110', type: 'cap', brand: '通用示意', model: 'PE封堵 Ø110',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12,
    ports: [
      { key: 'p', label: '堵口', caliber: 110, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' },
  { id: 'GEN-CAP-90', type: 'cap', brand: '通用示意', model: 'PE封堵 Ø90',
    material: 'PE100', pressure: '0.4MPa', placeholder: 0.12,
    ports: [
      { key: 'p', label: '堵口', caliber: 90, system: 'PE-外径', conn: '热熔对接', kind: 'straight' }
    ],
    source: '通用施工示意（无厂家依据，待核实）' }
];

const items = base.all().concat(EXTRA);
const PORT_COUNT = { pipe: 2, tee: 3, elbow: 2, valve: 2, reducer: 2, cap: 1 };

function all() { return items.slice(); }
function get(id) {
  for (let i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
  return null;
}
function byType(type) { return items.filter((it) => it.type === type); }
function byTypeCaliber(type, caliber) {
  return items.filter((it) => {
    if (it.type !== type) return false;
    if (caliber == null) return true;
    if (it.type === 'pipe') return it.calibers[0].caliber === caliber;
    return it.ports.some((p) => p.caliber === caliber);
  });
}
function portCount(type) { return PORT_COUNT[type] || null; }
function isGeneric(item) { return !!item && /^通用/.test(item.source || ''); }
function level() { return items.every((it) => !isGeneric(it)) ? 'verified' : 'generic'; }

module.exports = {
  CATALOG_VERSION: 'fixture-full',
  version: 'fixture-full',
  meta: () => ({ version: 'fixture-full', level: level() }),
  all, get, byType, byTypeCaliber, portCount, isGeneric, level
};
