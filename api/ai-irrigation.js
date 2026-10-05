/* =============================================================================
 * 润野灌溉 · AI 灌溉方案生成接口（Vercel Serverless Function）
 * -----------------------------------------------------------------------------
 * 路径：POST /api/ai-irrigation
 * 运行时：Node.js（Vercel 默认），CommonJS，零第三方依赖（只用内置 fetch）
 *
 * 入参（JSON）：
 *   user_id    字符串，必填，浏览器本地生成的匿名标识（只用于数次数，无个人信息）
 *   polygon    数组，必填，地块顶点坐标 [{x,y}, ...]（平面相对坐标，单位 m）
 *   area       数字，地块面积 m²
 *   slope      数字，地块坡度 %（可为空）
 *   user_text  字符串，用户填写的灌溉需求（最高优先级）
 *
 * 出参（JSON）：
 *   成功  { code: 0, msg: "ok", data: "<大模型返回的 JSON 字符串>", quota_left: 4, ... }
 *   失败  { code: <非 0>, msg: "<中文提示>", data: null }
 *
 * 安全：密钥只从 Vercel 环境变量 DEEPSEEK_API_KEY 读取，绝不写进代码 / 仓库。
 * 约束：不碰前端绘图引擎、超时与上游异常全部捕获并转成中文提示。
 * ============================================================================= */
'use strict';

/* ============================ 一、固定配置 ============================ */
const MODEL = 'deepseek-reasoner';                                    /* 推理模型，速度较慢但算得更稳 */
const TEMPERATURE = 0.1;
const UPSTREAM_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_ORIGIN = 'https://zhanglihui2026.github.io';            /* 唯一放行的前端域名 */
/* 超时等参数在每次调用时读取，改环境变量后不用等冷启动才生效 */
function timeoutMs() { const n = Number(process.env.AI_UPSTREAM_TIMEOUT_MS); return (isFinite(n) && n > 0) ? n : 150000; } /* 150s：reasoner 会先思考再输出 */
const MAX_BODY_BYTES = 262144;                                                  /* 256 KB */

/* 测试期：每人 5 次，记在进程内存里。
   注意：Serverless 每次冷启动都是新进程、多实例之间也不共享，所以线上会重置 ——
   后期接数据库时，只须把下面的 readUsed() / incrUsed() 换成数据库读写即可，其余逻辑不动。 */
const FREE_LIMIT = 5;
const USED = Object.create(null);
function readUsed(uid) { return USED[uid] || 0; }
function incrUsed(uid) { USED[uid] = (USED[uid] || 0) + 1; return USED[uid]; }

/* ============================ 二、内置 System Prompt ============================ */
const SYSTEM_PROMPT = [
  '你是资深灌溉工程设计工程师（AI 灌溉方案规划 Agent）。',
  '用户会给出地块几何、地形、水源条件与灌溉需求，你必须输出且仅输出一个 JSON 对象，',
  '不要 Markdown 代码块，不要任何解释性文字。',
  '',
  '【输出结构】',
  '{ "version": 1,',
  '  "design": { "tape_spacing":0.6, "emitter_spacing":0.3, "emitter_flow":0.8,',
  '              "tape_lay_side":100, "zone_mu":18, "src_distance":0,',
  '              "pump_lift":5, "terrain_dh":5, "tape_pressure":1, "target_velocity":1.5,',
  '              "main_pipe_od":160, "branch_pipe_od":90 },',
  '  "remark": "方案说明（必须给出复算过程的关键数字）",',
  '  "risks": ["风险提示"] }',
  '',
  '【字段与单位（固定，不得改名）】',
  'tape_spacing 滴灌带间距 m；emitter_spacing 滴孔间距 m；emitter_flow 滴头流量 L/h；',
  'tape_lay_side 单边铺设长度 m；zone_mu 单区亩数 亩；src_distance 水源距离 m；',
  'pump_lift 水泵提升高度 m；terrain_dh 地形高差 m；tape_pressure 入口压力 bar；',
  'target_velocity 目标流速 m/s；main_pipe_od / branch_pipe_od 主管 / 支管外径 mm（仅供参考）。',
  '必填三项：tape_spacing、emitter_spacing、emitter_flow。',
  '',
  '【取值范围】',
  'tape_spacing 0.1~3；emitter_spacing 0.05~2；emitter_flow 0.2~8；tape_lay_side 10~300；',
  'zone_mu 0.5~200；src_distance 0~2000；pump_lift 0~300；terrain_dh -200~300；',
  'tape_pressure 0~10；target_velocity 0.3~5。',
  '',
  '【工程约束（必须逐条核算，禁止拍脑袋）】',
  '1. 每亩流量 = 667 ÷ tape_spacing ÷ emitter_spacing × emitter_flow ÷ 1000（m³/h·亩）；',
  '   单区流量 Q = 每亩流量 × zone_mu。',
  '2. 支管 / 主管规格按 Q = v × A 反算内径（流速上限 2.0 m/s），PE 管必须按 SDR 壁厚折算内径，',
  '   再向上取标准外径规格；Ø110 流速超 2.0 m/s 时必须加大规格或写「双支管分流、每根流量减半」，',
  '   并在 risks 里提示水锤风险。不得照抄示例里的 90。',
  '3. 滴灌带总米数 = 地块面积 ÷ tape_spacing；条数 = 总米数 ÷ tape_lay_side（按地块总面积算，不是单区）。',
  '4. 水泵扬程 = 水泵提升高度 + 地形高差 + 入口压力(1 bar ≈ 10.2 m) + 沿程与局部损失',
  '   + 过滤施肥装置损失(按 5 m) + 安全余量(2 m)，再乘 1.1 安全系数；',
  '   沿程损失须按 Darcy–Weisbach 结合管长与流量核算，不得给偏小值。',
  '5. remark 必须写清：分区数量与单区尺寸、单区流量 m³/h、主管/支管规格与实际流速、',
  '   水泵扬程 m 与轴功率 kW（效率按 70%）、滴灌带条数与总米数、主管长度 m。',
  '6. 所有数字必须自洽、可复算，互相矛盾的方案视为错误。',
  '7. 用户填写的灌溉需求优先级最高；与当前设计参数冲突时，一律以用户需求为准。',
  '8. 坡度未实测时不得根据水源高差或地块面积反推坡度。'
].join('\n');

/* ============================ 三、工具函数 ============================ */
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function fmt(v, d) { return isNum(v) ? v.toFixed(d == null ? 1 : d) : '—'; }

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function reply(res, httpStatus, code, msg, data, extra) {
  const body = { code: code, msg: msg, data: data === undefined ? null : data };
  if (extra) Object.assign(body, extra);
  res.statusCode = httpStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
/* 剥掉 ```json 代码块与前后多余文字，只留 JSON 本体 */
function stripFences(text) {
  let s = String(text == null ? '' : text).trim();
  if (!s) return '';
  const fence = s.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fence && fence[1]) return fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return s.slice(a, b + 1);
  return s;
}
/* 拼用户提示词：地块几何 + 地形水源 + 需求（需求优先级最高） + 输出要求 */
function buildUserPrompt(p) {
  const poly = Array.isArray(p.polygon) ? p.polygon : [];
  const pts = poly.map(q => '(' + fmt(+q.x || 0, 1) + ',' + fmt(+q.y || 0, 1) + ')').join(',');
  const area = isNum(p.area) ? p.area : 0;
  const cur = p.cur && typeof p.cur === 'object' ? p.cur : {};
  const L = [];
  L.push('# 润野灌溉 · 地块与需求（AI 规划输入）');
  L.push('');
  L.push('## 一、地块几何');
  L.push('- 面积：' + (area > 0 ? fmt(area, 1) + ' m²（' + fmt(area / 666.67, 2) + ' 亩）' : '未测量（请先在工具里手绘地块边界并确认面积）'));
  L.push('- 顶点数：' + poly.length + '（平面相对坐标，单位 m，按手绘顺序）');
  L.push('- 顶点坐标：[' + (pts || '（无）') + ']');
  L.push('');
  L.push('## 二、地形与水源');
  L.push('- 地形高差：' + fmt(isNum(p.terrain_dh) ? p.terrain_dh : null, 2) + ' m；坡度：' + (isNum(p.slope) ? fmt(p.slope, 2) + '%' : '未测量（不得推算）'));
  L.push('- 水泵提升高度：' + fmt(isNum(p.pump_lift) ? p.pump_lift : null, 2) + ' m');
  L.push('- 水源距离：' + fmt(isNum(p.src_distance) ? p.src_distance : null, 0) + ' m');
  L.push('- 滴灌带入口工作压力：' + fmt(isNum(p.tape_pressure) ? p.tape_pressure : null, 2) + ' bar');
  L.push('');
  L.push('## 三、灌溉需求（用户填写，最高优先级）');
  L.push(String(p.user_text && String(p.user_text).trim() ? String(p.user_text).trim() : '（用户未填写，请按地块条件给出常规滴灌方案）'));
  L.push('');
  L.push('## 四、当前设计参数（可在此基础上调整；与第三节冲突时以第三节为准）');
  L.push('- 滴灌带间距 ' + (isNum(cur.tape_spacing) ? cur.tape_spacing : 0.4) + ' m；滴孔间距 ' + (isNum(cur.emitter_spacing) ? cur.emitter_spacing : 0.3) + ' m；滴头流量 ' + (isNum(cur.emitter_flow) ? cur.emitter_flow : 0.8) + ' L/h');
  L.push('- 单边铺设长度 ' + (isNum(cur.tape_lay_side) ? cur.tape_lay_side : 100) + ' m；单区 ' + (isNum(cur.zone_mu) ? cur.zone_mu : 18) + ' 亩；目标流速 ' + (isNum(cur.target_velocity) ? cur.target_velocity : 1.5) + ' m/s');
  L.push('');
  L.push('## 五、输出要求');
  L.push('只输出一个 JSON 对象（不要代码块、不要解释），字段与单位严格按 System Prompt 的规定。');
  return L.join('\n');
}

const HTTP_HINT = {
  400: '请求参数不合法', 401: '密钥无效或未开通（检查 DEEPSEEK_API_KEY 是否复制完整）',
  402: 'DeepSeek 账户余额不足，请到平台充值', 403: '无权限（密钥可能已被禁用）',
  422: '请求参数不合法', 429: 'DeepSeek 侧限流或额度超限，请稍后再试',
  500: 'DeepSeek 服务端故障', 503: 'DeepSeek 服务端繁忙'
};
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 调 DeepSeek：超时 / 网络 / HTTP 错误全部转成中文提示抛出 */
async function callDeepSeek(messages) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const e = new Error('服务端未配置 DEEPSEEK_API_KEY：请在 Vercel 项目 Settings → Environment Variables 添加后重新部署。');
    e.code = 500; e.http = 500; throw e;
  }
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const TIMEOUT = timeoutMs();
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) { } }, TIMEOUT) : null;
  try {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: MODEL, messages: messages, temperature: TEMPERATURE, stream: false })
    };
    if (ctrl) init.signal = ctrl.signal;
    const r = await fetch(UPSTREAM_URL, init);
    const text = await r.text();
    if (!r.ok) {
      const e = new Error('调用 DeepSeek 失败（HTTP ' + r.status + '）：' + (HTTP_HINT[r.status] || '上游错误') + '。' + String(text).slice(0, 200));
      e.code = (r.status === 429) ? 429 : 502; e.http = e.code; throw e;
    }
    let data = null;
    try { data = JSON.parse(text); } catch (err) {
      const e = new Error('DeepSeek 返回内容不是合法 JSON：' + String(text).slice(0, 200)); e.code = 502; e.http = 502; throw e;
    }
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg || typeof msg.content !== 'string') {
      const e = new Error('DeepSeek 返回结构异常（没有 choices[0].message.content）：' + String(text).slice(0, 200)); e.code = 502; e.http = 502; throw e;
    }
    return msg.content;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const t = new Error('调用 DeepSeek 超时（超过 ' + (TIMEOUT / 1000).toFixed(1) + ' 秒）。推理模型较慢，可稍后重试一次。');
      t.code = 504; t.http = 504; throw t;
    }
    if (e && e.code) throw e;
    const n = new Error('连不上 DeepSeek（' + (e && e.message) + '）：请检查网络或稍后重试。'); n.code = 502; n.http = 502; throw n;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
    return req.body;
  }
  return new Promise(resolve => {
    let raw = '', stop = false;
    req.on('data', c => {
      if (stop) return;
      raw += c;
      if (raw.length > MAX_BODY_BYTES) { stop = true; resolve({ __tooBig: true }); }
    });
    req.on('end', () => {
      if (stop) return;
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
    });
    req.on('error', () => { if (!stop) resolve(null); });
  });
}

/* ============================ 四、主入口 ============================ */
module.exports = async function handler(req, res) {
  const origin = (req.headers && req.headers.origin) ? String(req.headers.origin) : '';
  /* 只允许 GitHub Pages 域名；没有 Origin 的（curl / 服务端直连）放行，方便自测 */
  if (origin && origin !== ALLOWED_ORIGIN) {
    setCors(res);
    return reply(res, 403, 403, '来源域名不在白名单：' + origin + '（本接口只允许 ' + ALLOWED_ORIGIN + ' 访问）');
  }
  setCors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  /* GET：部署自检（打开 https://<域名>/api/ai-irrigation 就能看到） */
  if (req.method === 'GET') {
    return reply(res, 200, 0, 'ok', null, {
      service: 'runye-ai-irrigation', model: MODEL, temperature: TEMPERATURE,
      key_configured: !!process.env.DEEPSEEK_API_KEY,
      free_limit: FREE_LIMIT, quota_store: 'memory（进程内存，冷启动会重置）'
    });
  }
  if (req.method !== 'POST') return reply(res, 405, 405, '只支持 POST（自检可用 GET），当前方法：' + req.method);

  let body = await readBody(req);
  if (body && body.__tooBig) return reply(res, 413, 413, '请求体过大（上限 ' + MAX_BODY_BYTES + ' 字节），请简化地块顶点后重试。');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, 400, '请求体必须是 JSON 对象：{ user_id, polygon, area, slope, user_text }。');

  /* ---- 参数校验 ---- */
  const uid = body.user_id == null ? '' : String(body.user_id).trim();
  if (!uid) return reply(res, 400, 400, '缺少 user_id：网页端会自动生成并保存在浏览器本地，请勿清空站点数据。');
  if (!/^[A-Za-z0-9_\-:.]{1,64}$/.test(uid)) return reply(res, 400, 400, 'user_id 格式不合法（只允许字母、数字、_ - : .，长度 1~64）。');
  if (!Array.isArray(body.polygon)) return reply(res, 400, 400, 'polygon 必须是数组：[{x,y}, ...]。');
  if (body.area !== undefined && body.area !== null && !isNum(Number(body.area))) return reply(res, 400, 400, 'area 必须是数字（单位 m²）。');
  if (body.slope !== undefined && body.slope !== null && !isNum(Number(body.slope))) return reply(res, 400, 400, 'slope 必须是数字（单位 %）。');

  /* ---- 次数校验（测试期写死每人 5 次） ---- */
  const used = readUsed(uid);
  if (used >= FREE_LIMIT) {
    return reply(res, 429, 429, '本账号 AI 调用次数已用完（测试期每人 ' + FREE_LIMIT + ' 次，已用 ' + used + ' 次）。请稍后再试或联系作者开通。', null, { quota_left: 0 });
  }

  /* ---- 调大模型（超时 / 网络 / HTTP 错误在此全部捕获，不扣次数） ---- */
  const t0 = Date.now();
  let content;
  try {
    content = await callDeepSeek([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(body) }
    ]);
  } catch (e) {
    return reply(res, e.http || 502, e.code || 502, e.message || '调用大模型失败。', null, { quota_left: FREE_LIMIT - used });
  }

  /* ---- JSON 合法性校验（不合法不扣次数，并把原文片段回传便于排查） ---- */
  const jsonText = stripFences(content);
  if (!jsonText) {
    return reply(res, 422, 422, '大模型返回内容为空，无法解析为 JSON。请重试一次。', null, { quota_left: FREE_LIMIT - used, raw: String(content).slice(0, 300) });
  }
  let plan = null;
  try { plan = JSON.parse(jsonText); }
  catch (e) {
    return reply(res, 422, 422, '大模型返回的内容不是合法 JSON，已拒绝（本次不扣次数）：' + String(e && e.message || e) + '。请重试一次。', null, { quota_left: FREE_LIMIT - used, raw: String(content).slice(0, 300) });
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return reply(res, 422, 422, '大模型返回的不是 JSON 对象（应为 { "version":1, "design":{...} }）。请重试一次。', null, { quota_left: FREE_LIMIT - used, raw: String(content).slice(0, 300) });
  }

  /* ---- 成功：扣次数，data 回传「大模型返回的 JSON 字符串」 ---- */
  const usedNow = incrUsed(uid);
  return reply(res, 200, 0, 'ok', JSON.stringify(plan), {
    quota_left: Math.max(0, FREE_LIMIT - usedNow),
    model: MODEL,
    elapsed_ms: Date.now() - t0,
    quota_store: 'memory（进程内存，冷启动会重置，后期换数据库）'
  });
};
module.exports.default = module.exports;

/* 供本地契约测试使用（不参与线上运行） */
module.exports.__test = {
  SYSTEM_PROMPT: SYSTEM_PROMPT, buildUserPrompt: buildUserPrompt, stripFences: stripFences,
  MODEL: MODEL, TEMPERATURE: TEMPERATURE, ALLOWED_ORIGIN: ALLOWED_ORIGIN, FREE_LIMIT: FREE_LIMIT,
  _USED: USED, _reset: function () { Object.keys(USED).forEach(k => { delete USED[k]; }); }
};
