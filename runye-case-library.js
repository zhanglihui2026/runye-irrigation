/* 匿名案例库：本地保存永远优先；仅在用户明确授权后上传工程案例。 */
(function (root) {
  'use strict';
  var VERSION = 1, dialog, pending = null;
  var PRIVATE = /(?:name|姓名|电话|phone|mobile|email|邮箱|address|地址|geoBase|mapFrame|lat|lng|token|access|password|user_id|currentPlotId)/i;
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function clean(v, key) {
    if (PRIVATE.test(String(key || ''))) return undefined;
    if (Array.isArray(v)) return v.map(function (x) { return clean(x, ''); }).filter(function (x) { return x !== undefined; });
    if (v && typeof v === 'object') { var out = {}; Object.keys(v).forEach(function (k) { var n = clean(v[k], k); if (n !== undefined) out[k] = n; }); return out; }
    return (typeof v === 'string' && v.length > 2000) ? v.slice(0, 2000) : v;
  }
  function n(v) { v = Number(v); return isFinite(v) ? Math.round(v * 100) / 100 : null; }
  function currentSource() { return root.RyAiPlan && root.RyAiPlan.getProvenance && root.RyAiPlan.getProvenance() === 'ai' ? 'ai' : 'manual'; }
  function engineCheck() {
    try {
      var r = typeof root.computeThreeLevel === 'function' ? root.computeThreeLevel() : null;
      if (!r || !isFinite(r.pumpHead) || !isFinite(r.combinedFlow) || r.pumpHead < 0 || r.combinedFlow <= 0) return { ok: false, msg: '请先生成三级管网并完成水力计算。' };
      return { ok: true, data: { pump_head_m: n(r.pumpHead), pump_flow_m3h: n(r.combinedFlow), main_od_mm: n(r.mainPipe && r.mainPipe.od), branch_od_mm: n(r.branchPipe && r.branchPipe.od), front_od_mm: n(r.frontPipe && r.frontPipe.od), tape_delta_pct: n(r.tapeDeltaPct), hydraulic_path: r.hydraulicPath ? { total_loss_m:n(r.hydraulicPath.total), zone_index:r.hydraulicPath.zoneIndex } : null } };
    } catch (e) { return { ok: false, msg: '水力校核未完成：' + (e.message || e) }; }
  }
  function build(snapshot, source, status, rating, note) {
    var e = engineCheck(); if (!e.ok) return { ok:false, msg:e.msg };
    var p = snapshot || {}, inputs = p.inputValues || {}, poly = p.measuredPolygon || [];
    var area = n(p.measuredArea), plan = p.pipePlan || {}, terrain = p.terrain || null;
    var feature = { area_m2:area, mu:area ? n(area / 666.67) : null, vertices:poly.length,
      bbox_ratio:null, terrain_dh:n(inputs.fld_dh), tape_spacing:n(inputs.planTapeSpacing), emitter_spacing:n(inputs.planEmitterSpacing), emitter_flow:n(inputs.planEmitterFlow), tape_lay_side:n(inputs.planTapeLaySide), zone_mu:n(inputs.planZoneMuManual) };
    if (poly.length >= 3) { var xs=poly.map(function(q){return n(q.x);}),ys=poly.map(function(q){return n(q.y);}),w=Math.max.apply(null,xs)-Math.min.apply(null,xs),h=Math.max.apply(null,ys)-Math.min.apply(null,ys); feature.bbox_ratio=n(Math.max(w,h)/Math.max(1,Math.min(w,h))); }
    return { ok:true, value: clean({ schema_version:VERSION, source:source, status:status, feedback:{rating:rating,note:note || ''}, feature:feature, engine_check:e.data,
      plan:{ polygon:poly, input_values:inputs, pipe_plan:plan, pipe_od_override:p.pipeOdOverride || null, terrain:terrain, iso_diagram:p.isoDiagram && p.isoDiagram.data || null, tl_auto_edits:p.tlAutoEdits || null, tl_edit_pipes:p.tlEditPipes || null, manual_groups:p.manualGroups || [], zone_step:p.zoneStep || null }, created_at:new Date().toISOString() }) };
  }
  function apiUrl() { var base = root.RyAiPlan && root.RyAiPlan.apiBase ? root.RyAiPlan.apiBase() : 'https://runye-irrigation.vercel.app/api/ai-irrigation'; return base.replace(/\/ai-irrigation(?:\?.*)?$/, '/case-library'); }
  function access() { return root.RyAiPlan && root.RyAiPlan.getAccessToken ? root.RyAiPlan.getAccessToken() : ''; }
  function post(payload) { return root.fetch(apiUrl(), {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+access()},body:JSON.stringify(payload)}).then(function(r){return r.json().catch(function(){return {code:r.status,msg:'案例服务返回格式错误'};});}); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','>':'&gt;','<':'&lt;','"':'&quot;'}[c];}); }
  function close() { if (dialog && dialog.open) dialog.close(); pending = null; }
  function submit() {
    var consent=dialog.querySelector('[data-case=consent]').checked, status=dialog.querySelector('[data-case=status]').value, source=dialog.querySelector('[data-case=source]').value, rating=Number(dialog.querySelector('[data-case=rating]').value), note=dialog.querySelector('[data-case=note]').value.trim();
    if (!consent) { close(); root.projectToast && root.projectToast('方案已保存到本机；未授权，不会进入公共案例库。'); return; }
    if (!access()) { dialog.querySelector('[data-case=msg]').textContent='要上传匿名案例，请先在 AI 灌溉方案面板填写访问码；本次方案仍已保存到本机。'; return; }
    var built=build(pending,source,status,rating,note); if(!built.ok){dialog.querySelector('[data-case=msg]').textContent=built.msg;return;}
    var b=dialog.querySelector('[data-case=submit]');b.disabled=true;b.textContent='上传中…';
    post({action:'submit',consent:true,case:built.value}).then(function(r){ if(r && r.code===0){close();root.projectToast && root.projectToast('匿名案例已入库，可作为后续 AI 规划参考。');}else{dialog.querySelector('[data-case=msg]').textContent='上传失败：'+((r&&r.msg)||'未知错误')+'。本地方案已保留。';b.disabled=false;b.textContent='保存并按授权处理';} }).catch(function(e){dialog.querySelector('[data-case=msg]').textContent='上传失败：'+(e.message||e)+'。本地方案已保留。';b.disabled=false;b.textContent='保存并按授权处理';});
  }
  function onProjectSaved(snapshot, meta) {
    if (!snapshot || meta && (meta.silent || meta.key)) return;
    pending=clone(snapshot); if (!dialog) return;
    var s=currentSource();dialog.querySelector('[data-case=source]').value=s;dialog.querySelector('[data-case=consent]').checked=false;dialog.querySelector('[data-case=status]').value='pending';dialog.querySelector('[data-case=rating]').value='0';dialog.querySelector('[data-case=note]').value='';dialog.querySelector('[data-case=msg]').textContent='';dialog.showModal();
  }
  function init() {
    dialog=document.createElement('dialog');dialog.className='case-dialog';dialog.innerHTML='<form method="dialog"><header><strong>保存方案与匿名案例授权</strong><button value="cancel" aria-label="关闭">关闭</button></header><div class="case-body"><p>方案已先保存到您的本机。若授权，系统仅上传匿名工程案例：相对地块边界、管网、管径、滴灌配置、轮灌分组、水泵与水力校核结果；不会上传姓名、电话、访问码、地理坐标或地块名称。</p><label><input data-case="consent" type="checkbox"> 我同意匿名将本案例用于产品 AI 优化和相似案例检索</label><label>方案来源<select data-case="source"><option value="manual">用户手动绘制</option><option value="ai">AI 生成后修改</option></select></label><label>项目状态<select data-case="status"><option value="pending">待施工</option><option value="deployed">已落地</option><option value="abandoned">废弃</option></select></label><label>方案评分（可选）<select data-case="rating"><option value="0">未评分</option><option value="1">1 分</option><option value="2">2 分</option><option value="3">3 分</option><option value="4">4 分</option><option value="5">5 分</option></select></label><label>备注（可选，请勿填写姓名、电话等信息）<textarea data-case="note" maxlength="500" rows="3"></textarea></label><p class="case-msg" data-case="msg"></p><footer><button type="button" data-case="local">仅保存到本机</button><button type="button" data-case="submit">保存并按授权处理</button></footer></div></form>';
    document.body.appendChild(dialog);dialog.querySelector('[data-case=local]').onclick=close;dialog.querySelector('[data-case=submit]').onclick=submit;
  }
  root.RyCaseLibrary={onProjectSaved:onProjectSaved,build:build,engineCheck:engineCheck};
  if (root.document) { if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init(); }
})(typeof window!=='undefined'?window:globalThis);
