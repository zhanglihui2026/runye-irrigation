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
/* [v353] 默认模型名用官方首页确认的现役名（deepseek-v4-flash，支持 thinking 思考模式）；
 * 可用 env AI_MODEL 覆盖（如 deepseek-v4-pro，更强但更慢）。 */
const MODEL = process.env.AI_MODEL || 'deepseek-v4-flash';                          /* 推理模型，速度较慢但算得更稳 */
const UPSTREAM_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_ORIGIN = 'https://zhanglihui2026.github.io';            /* 放行的线上前端域名 */
/* [v334 2026-10-09] 本机调试放行：localhost/127.0.0.1 任意端口 + file://（Origin: null）。 */
/* 取舍：沙箱 iframe 的 fetch 同样是 Origin: null——额度按用户编号限次、访问码即凭证，个人工具可接受。 */
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function originAllowed(o) { return !o || o === ALLOWED_ORIGIN || o === 'null' || LOCAL_ORIGIN_RE.test(o); }
/* 超时等参数在每次调用时读取，改环境变量后不用等冷启动才生效 */
function timeoutMs() { const n = Number(process.env.AI_UPSTREAM_TIMEOUT_MS); return (isFinite(n) && n > 0) ? n : 150000; } /* 150s：reasoner 会先思考再输出 */
const MAX_BODY_BYTES = 262144;                                                  /* 256 KB */

/* 每用户5次：服务端身份、持久原子预占；没有线上内存回退。 */
const FREE_LIMIT = 5;
const quota = require('../lib/ai-quota.cjs');
const crypto = require('node:crypto'); /* [v329] 注册访问码生成 */
const schema = require('../runye-ai-plan.js');

/* 在线大模型是会员功能。默认关闭：只有后台明确配置 AI_MEMBER_TOKENS 后，
   对应会员访问码才可越过此门槛；校验发生在额度预占和 DeepSeek 请求之前。 */
function requireMember(req, extraMembers) {
  let members;
  try { members = JSON.parse(process.env.AI_MEMBER_TOKENS || '{}'); }
  catch (e) { throw Object.assign(new Error('会员服务配置无效，在线 AI 规划已暂停。'), { code: 503 }); }
  if (extraMembers && typeof extraMembers === 'object') {
    for (const k in extraMembers) { if (!Object.prototype.hasOwnProperty.call(members, k)) members[k] = extraMembers[k]; } /* [v329] 合并云端自助注册会员 */
  }
  const header = String(req.headers && req.headers.authorization || '');
  const token = header.indexOf('Bearer ') === 0 ? header.slice(7) : '';
  if (!token || !members || typeof members !== 'object' || !Object.prototype.hasOwnProperty.call(members, token)) {
    throw Object.assign(new Error('在线 AI 规划为会员功能，请先点面板「注册会员」开通并填写会员访问码。'), { code: 403 });
  }
  return members[token];
}

/* ===================== [v329] 会员自助注册 + 管理员不限次 =====================
   注册：POST {action:'register'} → 随机访问码 + 稳定 userId 存 Redis 哈希
   runye:ai:members:v1（code→userId）；测试模式（NODE_ENV=test 且 AI_QUOTA_TEST_MODE=1
   且非 Vercel）走进程内存便于本地联调。AI_SELF_REGISTER=0 一键关闭自助注册；
   名单上限 MEMBERS_CAP 防止灌水。访问码只回显一次，页面不落 localStorage。
   管理员：env AI_MEMBER_TOKENS 里值加 'admin:' 前缀（如 {"xxx":"admin:boss"}），
   或 env AI_ADMIN_USERS 列出用户编号（逗号分隔）→ 调用时跳过额度预占与扣减。 */
const MEMBERS_KEY = 'runye:ai:members:v1', MEMBERS_CAP = 1000;
let testMembers = {};
async function redisCmd(...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !/^https:\/\//.test(url)) return null;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
  const data = await r.json(); if (!r.ok || data.error) return null; return data.result;
}
async function getRedisMembers() {
  try {
    if (quota.testMode()) return testMembers;
    const r = await redisCmd('HGETALL', MEMBERS_KEY);
    if (!Array.isArray(r)) return {};
    const m = {}; for (let i = 0; i + 1 < r.length; i += 2) m[String(r[i])] = String(r[i + 1]);
    return m;
  } catch (e) { return {}; }
}
async function registerMember(req, res) {
  if (String(process.env.AI_SELF_REGISTER || '1') === '0') return reply(res, 403, 403, '自助注册已关闭，请联系作者开通会员。');
  if (!quota.testMode()) {
    const url = process.env.UPSTASH_REDIS_REST_URL, tk = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !tk || !/^https:\/\//.test(url)) return reply(res, 503, 503, '注册服务未配置（云端存储），暂无法自助注册，请联系作者开通。');
  }
  let cnt = null; try { cnt = await redisCmd('HLEN', MEMBERS_KEY); } catch (e) { cnt = null; }
  if (cnt != null && cnt >= MEMBERS_CAP) return reply(res, 403, 403, '注册名额已满，请联系作者处理。');
  const code = crypto.randomBytes(24).toString('hex'), userId = 'u' + crypto.randomBytes(12).toString('hex');
  if (quota.testMode()) { testMembers[code] = userId; }
  else { const w = await redisCmd('HSET', MEMBERS_KEY, code, userId); if (w == null) return reply(res, 503, 503, '注册写入失败，请稍后再试。'); }
  return reply(res, 200, 0, '注册成功：会员访问码只显示这一次，请立即复制保存。', JSON.stringify({ access_code: code, free_limit: FREE_LIMIT }), { plan: 'member-code' });
}

/* [v330] 管理员登录验证：面板「管理员登录」用。校验 Bearer 码 → 返回身份与管理员标记。 */
async function whoami(req, res) {
  let memberExtra = null;
  try { memberExtra = await getRedisMembers(); } catch (e) { memberExtra = null; }
  let ident;
  try { requireMember(req, memberExtra); ident = quota.identity(req, memberExtra); }
  catch (e) { return reply(res, e.code || 401, e.code || 401, e.message); }
  return reply(res, 200, 0, 'ok', JSON.stringify({ user_id: ident.userId, admin: ident.admin, free_limit: ident.admin ? null : FREE_LIMIT }), { quota_left: ident.admin ? '不限' : null });
}
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
  '  "remark": "候选参数的设计理由（数值校核以工具复算为准）",',
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
  '【工程规则】',
  '每亩流量 = 666.67 ÷ tape_spacing ÷ emitter_spacing × emitter_flow ÷ 1000，单位 m³/h。',
  '模型只给候选设计参数和理由，不自行宣称已完成管损、扬程、功率或管路生成校核。',
  '这些结果必须由润野现有引擎按真实轮灌、管路、内径、Hazen–Williams和页面泵效率复算。',
  '实测水源距离、提升高度、高程和设备工况为锁定条件，不得被需求文字覆盖。',
  '仅修改可优化的滴灌带参数、单区面积和目标流速；管径仅供参考，最终由引擎选定。',
  '成组地块以各子块边界为准，外框含间隙，不是可灌溉面积；各层高程不可合并为一个坡度。',
  '数据不足时在risks说明，禁止把示例参数写成实测值。',
  '坡度未实测时不得根据水源高差或地块面积反推坡度。'
].join('\n');

/* ============================ 三、工具函数 ============================ */
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function fmt(v, d) { return isNum(v) ? v.toFixed(d == null ? 1 : d) : '—'; }

function setCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', (origin && origin !== ALLOWED_ORIGIN) ? origin : ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  if (Array.isArray(p.groups) && p.groups.length) { L.push('成组子地块边界（外框只供定位，不含间隙的真实面积为各块之和）：'); p.groups.forEach(g=>L.push(JSON.stringify(g))); }
  if (p.terrain) L.push('各层实测高程：'+JSON.stringify(p.terrain));
  if (p.conditions) L.push('引擎工况：'+JSON.stringify(p.conditions));
  L.push('## 二、地形与水源');
  L.push('- 地形高差：' + fmt(isNum(p.terrain_dh) ? p.terrain_dh : null, 2) + ' m；坡度：' + (isNum(p.slope) ? fmt(p.slope, 2) + '%' : '未测量（不得推算）'));
  L.push('- 水泵提升高度：' + fmt(isNum(p.pump_lift) ? p.pump_lift : null, 2) + ' m');
  L.push('- 水源距离：' + fmt(isNum(p.src_distance) ? p.src_distance : null, 0) + ' m');
  L.push('- 滴灌带入口工作压力：' + fmt(isNum(p.tape_pressure) ? p.tape_pressure : null, 2) + ' bar');
  L.push('');
  L.push('## 三、灌溉需求（用户填写，须服从实测工况及工程约束）');
  L.push(String(p.user_text && String(p.user_text).trim() ? String(p.user_text).trim() : '（用户未填写，请按地块条件给出常规滴灌方案）'));
  L.push('');
  L.push('## 四、当前设计参数（仅设计项可优化；实测项锁定）');
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
      body: JSON.stringify({ model: MODEL, messages: messages, thinking: { type: 'enabled' }, response_format: { type: 'json_object' }, stream: false })
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
    if (Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) return { __tooBig: true };
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
    return req.body;
  }
  return new Promise(resolve => {
    let raw = '', stop = false;
    req.on('data', c => {
      if (stop) return;
      raw += c;
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) { stop = true; resolve({ __tooBig: true }); }
    });
    req.on('end', () => {
      if (stop) return;
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
    });
    req.on('error', () => { if (!stop) resolve(null); });
  });
}

function ringArea(poly) {
  if(!Array.isArray(poly)||poly.length<3||poly.length>2000||poly.some(p=>!p||!isNum(p.x)||!isNum(p.y))) return null;
  const ring=poly.length>3&&poly[0].x===poly[poly.length-1].x&&poly[0].y===poly[poly.length-1].y?poly.slice(0,-1):poly;
  if(new Set(ring.map(p=>p.x+','+p.y)).size<3) return null;
  function cross(a,b,c){return(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  function on(a,b,c){return Math.abs(cross(a,b,c))<1e-9&&c.x>=Math.min(a.x,b.x)-1e-9&&c.x<=Math.max(a.x,b.x)+1e-9&&c.y>=Math.min(a.y,b.y)-1e-9&&c.y<=Math.max(a.y,b.y)+1e-9;}
  function intersect(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
  for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++){if(j===i+1||i===0&&j===ring.length-1)continue;if(intersect(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]))return null;}
  let sum=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)sum+=ring[j].x*ring[i].y-ring[i].x*ring[j].y;
  return Math.abs(sum/2)>1e-6?Math.abs(sum/2):null;
}
function validateGeometry(p){
  let area=ringArea(p.polygon);if(area===null)return '地块需要至少3个有效不同顶点、非零面积且不能自交，坐标单位为米。';
  if(p.groups!=null){if(!Array.isArray(p.groups)||p.groups.length>100)return '成组地块格式或数量无效。';if(p.groups.length){const areas=p.groups.map(g=>g&&ringArea(g.poly));if(areas.some(a=>a===null||a===undefined))return '子地块边界无效。';area=areas.reduce((a,b)=>a+b,0);}}
  if(p.area!=null&&(!isNum(p.area)||p.area<=0||Math.abs(p.area-area)>Math.max(1,area*.01)))return '地块面积与真实边界不一致，请重新测量。';
  p.area=area;
  for(const k of ['slope','terrain_dh','pump_lift','src_distance','tape_pressure'])if(p[k]!=null&&!isNum(p[k]))return k+' 必须为有限数字。';
  if(p.user_text!=null&&(typeof p.user_text!=='string'||p.user_text.length>10000))return '需求文字格式或长度无效。';return null;
}
/* ============================ 四、主入口 ============================ */
module.exports = async function handler(req, res) {
  const origin = (req.headers && req.headers.origin) ? String(req.headers.origin) : '';
  /* [v334] 放行：GitHub Pages 线上域名 + 本机调试（localhost/127.0.0.1/file:// 的 null）；无 Origin（curl/服务端直连）放行 */
  if (!originAllowed(origin)) {
    setCors(res, origin);
    return reply(res, 403, 403, '来源域名不在白名单：' + origin + '（本接口只允许 ' + ALLOWED_ORIGIN + ' 与本机来源访问）');
  }
  setCors(res, origin);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  /* GET：部署自检（打开 https://<域名>/api/ai-irrigation 就能看到） */
  if (req.method === 'GET') {
    return reply(res, 200, 0, 'ok', null, {
      service: 'runye-ai-irrigation', model: MODEL,
      key_configured: !!process.env.DEEPSEEK_API_KEY,
      quota_configured: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      access_configured: !!process.env.AI_ACCESS_TOKENS,
      membership_configured: !!process.env.AI_MEMBER_TOKENS,
      self_register: String(process.env.AI_SELF_REGISTER || '1') !== '0', /* [v329] 面板自助注册开关状态 */
      admin_hint: 'AI_MEMBER_TOKENS 值加 admin: 前缀，或 AI_ADMIN_USERS 列出编号 → 该用户不限次', /* [v329] */
      free_limit: FREE_LIMIT, quota_store: '持久原子额度（未配置时暂停调用）'
    });
  }
  if (req.method !== 'POST') return reply(res, 405, 405, '只支持 POST（自检可用 GET），当前方法：' + req.method);

  let body = await readBody(req);
  if (body && body.__tooBig) return reply(res, 413, 413, '请求体过大（上限 ' + MAX_BODY_BYTES + ' 字节），请简化地块顶点后重试。');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, 400, '请求体必须是 JSON 对象：{ user_id, polygon, area, slope, user_text }。');
  if (body.action === 'register') return registerMember(req, res); /* [v329] 会员自助注册（在会员校验/几何校验之前，无需访问码） */
  if (body.action === 'whoami') return whoami(req, res); /* [v330] 管理员登录身份验证（无需几何校验） */

  let memberExtra = null;
  try { memberExtra = await getRedisMembers(); } catch (e) { memberExtra = null; } /* [v329] 云端注册名单 */
  try { requireMember(req, memberExtra); }
  catch (e) { return reply(res, e.code || 403, e.code || 403, e.message); }
  const geometryError = validateGeometry(body);
  if (geometryError) return reply(res,400,400,geometryError);
  let reservation = null, ident = null;
  try { ident = quota.identity(req, memberExtra); }
  catch (e) { return reply(res, e.code || 503, e.code || 503, e.message); }
  if (!ident.admin) {
    try { reservation = await quota.reserve(ident.key); }
    catch (e) { return reply(res, e.code || 503, e.code || 503, e.message, null, { quota_left: e.code === 429 ? 0 : null }); }
  } /* [v329] 管理员不受5次限制：跳过额度预占与扣减 */
  const qLeft = () => reservation ? reservation.left + 1 : '不限'; /* [v329] 管理员次数显示 */
  let settled=false;
  try {
  /* ---- 调大模型（超时 / 网络 / HTTP 错误在此全部捕获，不扣次数） ---- */
  const t0 = Date.now();
  let content;
  try {
    content = await callDeepSeek([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(body) }
    ]);
  } catch (e) {
    return reply(res, e.http || 502, e.code || 502, e.message || '调用大模型失败。', null, { quota_left: qLeft() });
  }

  /* ---- JSON 合法性校验（不合法不扣次数，并把原文片段回传便于排查） ---- */
  const jsonText = stripFences(content);
  if (!jsonText) {
    return reply(res, 422, 422, '大模型返回内容为空，无法解析为 JSON。请重试一次。', null, { quota_left: qLeft(), raw: String(content).slice(0, 300) });
  }
  let plan = null;
  try { plan = JSON.parse(jsonText); }
  catch (e) {
    return reply(res, 422, 422, '大模型返回的内容不是合法 JSON，已拒绝（本次不扣次数）：' + String(e && e.message || e) + '。请重试一次。', null, { quota_left: qLeft(), raw: String(content).slice(0, 300) });
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return reply(res, 422, 422, '大模型返回的不是 JSON 对象（应为 { "version":1, "design":{...} }）。请重试一次。', null, { quota_left: qLeft(), raw: String(content).slice(0, 300) });
  }

  const checked=schema.validate(plan);
  if(!checked.ok) return reply(res,422,422,'模型方案参数校验未通过，本次不扣次数：'+checked.msg,null,{quota_left:qLeft()});
  checked.plan.plot.area_m2=body.area;
  settled=true; // 提交结果不确定时保留预占，不恢复额度以免超发。
  const left=reservation?await quota.finish(reservation,true):'不限'; /* [v329] 管理员不限次 */
  return reply(res,200,0,'ok',JSON.stringify(checked.plan),{quota_left:left,model:MODEL,elapsed_ms:Date.now()-t0,quota_store:'持久原子额度',request_id:body.request_id||null});
  } catch(e) { return reply(res,503,503,'额度提交暂不可用，请联系作者核查；未重复调用模型。'); }
  finally { if(!settled&&reservation) { try { await quota.finish(reservation,false); } catch(e) { /* 保留预占，人工核查 */ } } } /* [v329] 管理员无预占可还 */

};
module.exports.maxDuration = 300; /* [v353] 显式声明（代码级优先级最高）：思考模型耗时可达 2 分钟以上，
 * 防项目级默认时长低于 150s 上游超时被平台提前掐死；Hobby 计划上限恰为 300s。 */
module.exports.default = module.exports;

/* 供本地契约测试使用（不参与线上运行） */
module.exports.__test = {
  SYSTEM_PROMPT: SYSTEM_PROMPT, buildUserPrompt: buildUserPrompt, stripFences: stripFences,
  MODEL: MODEL, ALLOWED_ORIGIN: ALLOWED_ORIGIN, FREE_LIMIT: FREE_LIMIT,
  validateGeometry, requireMember, _reset: quota._reset
};
