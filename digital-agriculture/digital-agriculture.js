/*!
 * digital-agriculture.js — 数字农业模块侧的桥接数据读取与校验（协议 v1）
 * 配合根目录 irrigation-bridge.js 使用；本模块只读，禁止回写灌溉工具的任何数据。
 * 存储约定见 AGENTS.md。
 */
(function (global) {
  'use strict';

  var KEY = 'runye_digital_bridge_v1';
  var VERSION = 1;
  var SOURCE = 'runye-irrigation';

  function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }
  function isStr(s) { return typeof s === 'string'; }

  /**
   * 读取并校验桥接数据。
   * @returns {{ok:true, data:{version,source,generatedAt,plot}}|{ok:false, reason:string, detail?:string}}
   *          reason: empty | parse | version | source | plot
   */
  function readPayload() {
    var raw;
    try { raw = global.localStorage ? global.localStorage.getItem(KEY) : null; }
    catch (e) { return { ok: false, reason: 'parse', detail: String(e) }; }
    if (!raw) return { ok: false, reason: 'empty' };
    var d;
    try { d = JSON.parse(raw); }
    catch (e) { return { ok: false, reason: 'parse', detail: String(e) }; }
    if (!d || d.version !== VERSION) return { ok: false, reason: 'version' };
    if (d.source !== SOURCE) return { ok: false, reason: 'source' };
    var p = d.plot;
    if (!p || !isStr(p.id) || !p.id.trim() || p.id.length > 64 ||
        !isStr(p.name) || !p.name.trim() || p.name.length > 100 ||
        !isFiniteNum(p.areaMu) || p.areaMu <= 0 || p.areaMu > 1e6) {
      return { ok: false, reason: 'plot' };
    }
    return { ok: true, data: d };
  }

  /** 从 URL 取 plotId（已解码）；无参数返回 ''。 */
  function plotIdFromUrl() {
    var m = /[?&]plotId=([^&]+)/.exec(global.location ? global.location.search : '');
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }

  global.RunyeDigitalBridge = {
    KEY: KEY,
    VERSION: VERSION,
    readPayload: readPayload,
    plotIdFromUrl: plotIdFromUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
