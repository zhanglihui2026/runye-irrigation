/* ============================================================
   runye-entitle.js —— 润野灌溉 · 会员权益层（工具端）
   ------------------------------------------------------------
   职责：把云端权益包装成工具端可用的判定接口，
        供功能门控与 UI 展示使用。不依赖 DOM，可单独加载。

   依赖：window.CloudSync（cloud-sync.js，v360c 起提供 rdb/authSub）
   加载：<script src="runye-entitle.js"></script>（放在 cloud-sync.js 之后）

   [v360d 2026-10-10] 数据层迁移：ryEntitle 云函数 → app.rdb() 直连 PG。
   背景：本环境把所有浏览器直连云函数一刀切拦死（EXCEED_AUTHORITY），
        rdb 通道实测放行（探针实证）。业务逻辑（发奖/冷静期）在前端计算
        —— 已知取舍：RLS 防跨用户篡改，防不了用户改自己的权益行；
        规模上来后须升级服务端边界（已立案，每次权益架构讨论须提醒用户）。

   表（sql/route_c_migration_v1.sql + v2.sql，RLS 全开）：
     ry_entitle(_id=JWT sub, plan, expires_at, member_days, activated_at, history…)
     ry_invite (_id=JWT sub, code, inviter, reward_claimed, claims, rewards…)
     ry_bind   (code pk, uid)                     —— 公开可读（反查邀请人）
     ry_links  (inviter_uid, invited_uid, status…) —— 双方可读，仅被邀请人可写

   ⚠️ 身份纪律（42501 实测教训）：DB 侧 auth.uid() = JWT sub（登录后为数字串），
     与 SDK uid（kzcRk 串）不同。凡落库的 _id / 归属一律用 CloudSync.authSub()；
     SDK uid 仅作展示。匿名 trial 不落库（换设备即换身份，无法计时担责）。

   等级（本期两级）：
     L1 注册会员（限时 30 天）：地块分区 / AI 智能规划 / 管路规划 / 在线地图
     L2 高级会员：L1 + 出图、导出清单、水利校验
   ============================================================ */
(function () {
  'use strict';

  var DAY = 86400000;
  var HB_INTERVAL = 10 * 60 * 1000;   // heartbeat 节流：10 分钟
  var CAP = 3;                        // 邀请注册 + 群裂变 共享上限
  var COOL_MS = 3 * DAY;              // 冷静期 3 天
  var TRIAL_DAYS = 30;                // L1 注册会员初始天数

  /* 功能 key → 显示名 */
  var FEATURES = {
    'zone-split': '地块分区',
    'ai-plan': 'AI 智能规划',
    'pipe-layout': '管路规划',
    'online-map': '在线地图',
    'drawing-export': '出图',
    'bom-export': '导出清单',
    'hydraulic-check': '水利校验',
    'pro-others': '其余高级功能'
  };
  var PRO_ALL_KEY = 'pro-others';
  var PLAN_FEATURES = {
    L1: ['zone-split', 'ai-plan', 'pipe-layout', 'online-map'],
    L2: ['zone-split', 'ai-plan', 'pipe-layout', 'online-map', 'drawing-export', 'bom-export', 'hydraulic-check', 'pro-others']
  };
  var PLAN_NAMES = { L1: '注册会员', L2: '高级会员' };
  var PLAN_DAYS = { L1: 30, L2: 365 };

  var state = null;
  var lastHb = 0;
  var listeners = [];
  var loading = null;

  function emit() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }
  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts), p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- rdb 基础 ---------- */
  var T_ENT = 'ry_entitle', T_INV = 'ry_invite', T_BIND = 'ry_bind', T_LINKS = 'ry_links';

  function db() {
    return (window.CloudSync && typeof window.CloudSync.rdb === 'function') ? window.CloudSync.rdb() : null;
  }
  /* DB 身份：JWT sub（登录后为数字串）。拿不到时退回 SDK uid（匿名态二者一致）。 */
  function sub() {
    try { return window.CloudSync.authSub() || window.CloudSync.uid || null; } catch (e) { return null; }
  }
  /* 是否实名：手机号在（cloud-sync.js 登录/恢复路径都会带 phone） */
  function isAnon() { return !(window.CloudSync && window.CloudSync.phone); }
  function setErr(tag, e) {
    try {
      window._cloudLastError = { code: (e && (e.code || e.error_code)) || (tag + '_failed'),
        msg: (e && (e.message || e.error_description || e.details)) || String(e || 'unknown'), raw: e };
    } catch (_e) {}
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function ms(v) { return v ? Date.parse(v) || 0 : 0; }
  function makeCode(seed) {
    var s = String(seed || '') + '|' + Date.now() + '|' + Math.random();
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return 'RY' + h.toString(36).toUpperCase().slice(0, 8);
  }
  function maskPhone(p) {
    var s = String(p == null ? '' : p);
    return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
  }

  function readOne(table, id) {
    return db().from(table).select('*').eq('_id', id).then(function (r) {
      if (r && r.error) { setErr('read_' + table, r.error); return null; }
      return (r && r.data && r.data[0]) || null;
    });
  }

  /* 默认权益行：L1 注册会员，从现在起 30 天 */
  function newEntRow(now) {
    return { _id: sub(), plan: 'L1', expires_at: iso(now + TRIAL_DAYS * DAY),
      member_days: TRIAL_DAYS, activated_at: null,
      history: [{ at: now, days: TRIAL_DAYS, plan: 'L1', planName: '注册会员', from: now, to: now + TRIAL_DAYS * DAY, src: 'register' }] };
  }

  /* ---------- 进度计算 ----------
     [v367 规则改版] 注册即激活、取消 3 天冷静期：
     valid / cooling / registered 一律立即计入（cooling/registered 为存量行，兼容读）。 */
  function computeProgress(links, now) {
    var fromInvite = 0, fromGroup = 0;
    for (var i = 0; i < links.length; i++) {
      var it = links[i];
      if (it.status === 'valid' || it.status === 'cooling' || it.status === 'registered') fromInvite++;
    }
    var total = fromInvite + fromGroup;
    var capped = Math.min(total, CAP);
    return { fromInvite: fromInvite, fromGroup: fromGroup, total: total, capped: capped,
      cooling: 0, pending: 0, remain: Math.max(0, CAP - capped), reached: capped >= CAP };
  }
  function loadLinks(mySub) {
    return db().from(T_LINKS).select('*').eq('inviter_uid', mySub).then(function (r) {
      if (r && r.error) { setErr('load_links', r.error); return []; }
      return (r && r.data) || [];
    });
  }

  /* ---------- 匿名 trial 态（不落库，纯本地 shape，与云函数版一致） ---------- */
  function anonState() {
    return { code: '', entitle: null, trial: true, anonPolicy: 'trial',
      progress: { capped: 0, fromInvite: 0, fromGroup: 0, cooling: 0, pending: 0, remain: CAP, reached: false } };
  }

  /* ---------- 拉取（实名）：权益 + 邀请档案 + 进度 ---------- */
  function pullAuth(create) {
    var mySub = sub(); if (!mySub || !db()) return Promise.resolve(null);
    var now = Date.now();
    var invP = readOne(T_INV, mySub);
    var entP = readOne(T_ENT, mySub);
    return Promise.all([invP, entP]).then(function (arr) {
      var inv = arr[0], ent = arr[1];
      var needInv = create && !inv, needEnt = create && !ent;
      var w1 = needInv ? (function () {
        var c = makeCode(mySub);
        inv = { _id: mySub, code: c, inviter: '', reward_claimed: false, claims: [], rewards: [] };
        return db().from(T_INV).insert(inv).then(function (r) {
          if (r && r.error) { setErr('init_invite', r.error); inv = null; return null; }
          return db().from(T_BIND).insert({ code: c, uid: mySub }).then(function (r2) {
            if (r2 && r2.error) setErr('init_bind', r2.error);
            return inv;
          });
        });
      })() : Promise.resolve(inv);
      var w2 = needEnt ? db().from(T_ENT).insert(newEntRow(now)).then(function (r) {
        if (r && r.error) { setErr('init_ent', r.error); return null; }
        return readOne(T_ENT, mySub);
      }) : Promise.resolve(ent);
      return Promise.all([w1, w2]).then(function (a2) {
        inv = a2[0]; ent = a2[1];
        return loadLinks(mySub).then(function (links) {
          var progress = computeProgress(links, now);
          state = {
            code: (inv && inv.code) || '',
            entitle: ent ? { plan: ent.plan, expireAt: ms(ent.expires_at),
              memberDays: ent.member_days, activatedAt: ms(ent.activated_at) } : null,
            trial: false, anonPolicy: 'trial',
            progress: progress,
            invites: links, claims: (inv && inv.claims) || [],
            rewards: (inv && inv.rewards) || [],
            rewardClaimed: !!(inv && inv.reward_claimed)
          };
          emit();
          return state;
        });
      });
    }).catch(function (e) { setErr('pull_throw', e); return null; });
  }

  var RyEntitle = {
    /* 登录态变化（匿名转正 / 换账号 / 重新登录）后必须调用：
       清掉本地缓存的权益快照，重新拉取。
       [v360d 注] DB 侧身份在登录后实际切换（auth.uid() = JWT sub，与匿名不同），
       匿名期落库的数据对新身份不可见 —— 「先用后登不丢数据」在 DB 层不成立，
       匿名 trial 不落库因此无损失；后续如需匿名数据接力另行设计。 */
    reset: function () { state = null; lastHb = 0; loading = null; emit(); },
    onLogin: function () { this.reset(); return this.init(); },

    /* 登录后初始化（分配邀请码、建 L1 权益） */
    init: function (force) {
      if (force) this.reset();
      if (loading) return loading;
      loading = (isAnon() ? Promise.resolve(anonState()).then(function (s) { state = s; emit(); return s; })
                          : pullAuth(true))
        .then(function (s) { loading = null; return s; });
      return loading;
    },
    /* 刷新权益与进度 */
    refresh: function () {
      return isAnon() ? Promise.resolve(anonState()).then(function (s) { state = s; emit(); return s; })
                      : pullAuth(false);
    },

    get state() { return state; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },

    /* ---------- 身份与匿名策略 ---------- */
    DEFAULT_ANON_POLICY: 'trial',
    isTrial: function () { return !!(state && state.trial); },
    ready: function () { return !!state; },
    anonPolicy: function () { return (state && state.anonPolicy) || this.DEFAULT_ANON_POLICY; },

    /* ---------- 判定（与云函数版语义一致，原样保留） ---------- */
    plan: function () { return (state && state.entitle && state.entitle.plan) || 'L1'; },
    planName: function () { return PLAN_NAMES[this.plan()] || '注册会员'; },
    expireAt: function () { return (state && state.entitle && state.entitle.expireAt) || 0; },
    expireText: function () { return this.isTrial() ? '未开通' : fmtDate(this.expireAt()); },
    daysLeft: function () {
      if (this.isTrial()) return 0;
      var e = this.expireAt(); if (!e) return 0;
      return Math.max(0, Math.ceil((e - Date.now()) / DAY));
    },
    isActive: function () { return !this.isTrial() && this.expireAt() > Date.now(); },
    can: function (feature) {
      if (this.mockPlan) return this.canWith(this.mockPlan, feature);
      if (this.isActive()) return this.canWith(this.plan(), feature);
      if (this.isTrial() && this.anonPolicy() === 'trial') return this.canWith('L1', feature);
      return false;
    },
    canWith: function (plan, feature) {
      if (plan === 'locked') return false;
      if (plan === 'trial') return PLAN_FEATURES.L1.indexOf(feature) >= 0;
      var list = PLAN_FEATURES[plan] || PLAN_FEATURES.L1;
      return list.indexOf(feature) >= 0 || list.indexOf(PRO_ALL_KEY) >= 0;
    },
    statusText: function () {
      if (!state) return '会员 · 未同步';
      if (this.isTrial()) return '未登录 · 试用中';
      if (!this.isActive()) return '会员已到期';
      return this.planName() + ' · ' + this.daysLeft() + ' 天';
    },
    features: function () {
      var list = PLAN_FEATURES[this.plan()] || PLAN_FEATURES.L1;
      return list.map(function (k) { return FEATURES[k] || k; });
    },
    featureKeys: function () { return (PLAN_FEATURES[this.plan()] || PLAN_FEATURES.L1).slice(); },

    /* ---------- 邀请 ---------- */
    myCode: function () { return (state && state.code) || ''; },
    progress: function () {
      return (state && state.progress) || { capped: 0, fromInvite: 0, fromGroup: 0, cooling: 0, pending: 0, remain: 3, reached: false };
    },
    /* 提交邀请码（首次绑定后不可变更）。
       流程：ry_bind 反查邀请人 → 自己的 ry_invite 记 inviter → 写 ry_links 行（我是被邀请人）。 */
    bindRef: function (ref, viaGroup) {
      var self = this;
      var mySub = sub(), d = db();
      if (!mySub || !d) return Promise.resolve({ ok: false, code: -99, message: '请先手机号登录' });
      ref = String(ref || '').trim();
      if (ref.indexOf('RY') !== 0) return Promise.resolve({ ok: false, code: -1, message: '邀请码格式不正确' });
      return d.from(T_BIND).select('uid').eq('code', ref).then(function (r) {
        if (r && r.error) { setErr('bind_lookup', r.error); return { ok: false, code: -3, message: '邀请码不存在或已失效' }; }
        var bind = r && r.data && r.data[0];
        if (!bind || !bind.uid) return { ok: false, code: -3, message: '邀请码不存在或已失效' };
        if (bind.uid === mySub) return { ok: false, code: -4, message: '不能绑定自己为邀请人' };
        return readOne(T_INV, mySub).then(function (inv) {
          /* 两步写入必须可重试：旧版先写 ry_invite.inviter，随后 ry_links 若失败，
             下次会直接返回 -2 并清掉邀请码，造成“账号已登录但邀请进度永远 0”。 */
          function ensureLink(repaired) {
            return d.from(T_LINKS).select('id,inviter_uid,code,status').eq('invited_uid', mySub).then(function (lr) {
              if (lr && lr.error) { setErr('bind_link_lookup', lr.error); return { ok: false, code: -98, message: '邀请关系核对失败，请重试' }; }
              var rows = (lr && lr.data) || [];
              var same = rows.filter(function (x) { return x.inviter_uid === bind.uid || x.code === ref; })[0];
              if (same) return self.refresh().then(function () { return { ok: true, existed: true, repaired: !!repaired }; });
              if (rows.length) return { ok: false, code: -2, message: '已绑定其他邀请人，不可变更' };
              /* [v367 规则改版] 注册即激活：links 行直接写 valid（原 registered→cooling→valid 三段已废） */
              return d.from(T_LINKS).insert({
                inviter_uid: bind.uid, invited_uid: mySub, code: ref, status: 'valid', activated_at: iso(Date.now()),
                nick: maskPhone(window.CloudSync && window.CloudSync.phone) || ('用户' + mySub.slice(-4)),
                via_group: !!viaGroup
              }).then(function (r3) {
                if (r3 && r3.error) { setErr('bind_link', r3.error); return { ok: false, code: -98, message: '邀请关系写入失败，请重试' }; }
                return self.refresh().then(function () { return { ok: true, repaired: !!repaired }; });
              });
            });
          }
          if (inv && inv.inviter) {
            if (inv.inviter !== ref) return { ok: false, code: -2, message: '已绑定其他邀请人，不可变更' };
            return ensureLink(true);
          }
          var wInv = inv
            ? d.from(T_INV).update({ inviter: ref }).eq('_id', mySub)
            : d.from(T_INV).insert({ _id: mySub, code: makeCode(mySub), inviter: ref, reward_claimed: false, claims: [], rewards: [] });
          return wInv.then(function (r2) {
            if (r2 && r2.error) { setErr('bind_inv', r2.error); return { ok: false, code: -98, message: '邀请人写入失败，请重试' }; }
            return ensureLink(false);
          });
        });
      }).catch(function (e) { setErr('bind_throw', e); return { ok: false, code: -99, message: '网络异常' }; });
    },
    /* 结算并发放（前端判定 + 幂等：reward_claimed 防重）。
       已知取舍：奖励天数按自己权益行的 member_days 计，用户可篡改自己的行（立案项）。 */
    grant: function () {
      var self = this;
      var mySub = sub(), d = db();
      if (!mySub || !d) return Promise.resolve({ ok: false, message: '请先手机号登录' });
      var now = Date.now();
      return readOne(T_INV, mySub).then(function (inv) {
        if (!inv) return self.refresh().then(function () { return { ok: true, granted: 0, planName: '' }; });
        return loadLinks(mySub).then(function (links) {
          var p = computeProgress(links, now);
          if (!p.reached || inv.reward_claimed)
            return self.refresh().then(function () { return { ok: true, granted: 0, planName: '' }; });
          return readOne(T_ENT, mySub).then(function (ent) {
            var plan = (ent && ent.plan) || 'L1';
            var days = (ent && ent.member_days > 0) ? ent.member_days : (PLAN_DAYS[plan] || 30);
            var from = (ent && ms(ent.expires_at) > now) ? ms(ent.expires_at) : now;
            var to = from + days * DAY;
            var hist = (ent && ent.history) || [];
            hist.unshift({ at: now, days: days, plan: plan, planName: PLAN_NAMES[plan] || '注册会员', from: from, to: to, src: 'invite' });
            return d.from(T_ENT).update({ expires_at: iso(to), member_days: days, history: hist }).eq('_id', mySub)
              .then(function (r1) {
                if (r1 && r1.error) { setErr('grant_ent', r1.error); return { ok: false, message: '发放失败' }; }
                var rewards = (inv.rewards) || [];
                rewards.unshift({ at: now, days: days, plan: plan, planName: PLAN_NAMES[plan] || '注册会员', from: from, to: to, src: 'invite' });
                return d.from(T_INV).update({ reward_claimed: true, rewards: rewards }).eq('_id', mySub)
                  .then(function (r2) {
                    if (r2 && r2.error) setErr('grant_inv', r2.error);
                    return self.refresh().then(function () { return { ok: true, granted: days, planName: PLAN_NAMES[plan] || '注册会员' }; });
                  });
              });
          });
        });
      }).catch(function (e) { setErr('grant_throw', e); return { ok: false, message: '网络异常' }; });
    },
    /* 提交漏计核销工单（1-20 人；pending >3 拒收） */
    claim: function (count, names) {
      var self = this;
      var mySub = sub(), d = db();
      var n = Number(count);
      if (!isFinite(n) || n !== Math.floor(n) || n < 1 || n > 20)
        return Promise.resolve({ ok: false, message: '人数需为 1-20 的整数' });
      if (!mySub || !d) return Promise.resolve({ ok: false, message: '请先手机号登录' });
      return readOne(T_INV, mySub).then(function (inv) {
        if (!inv) return { ok: false, message: '请先初始化权益' };
        var claims = inv.claims || [];
        var pendingCount = claims.filter(function (c) { return c.status === 'pending'; }).length;
        if (pendingCount >= 3) return { ok: false, message: '待审核工单过多，请等待处理' };
        claims.unshift({ id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
          count: n, names: String(names || '').slice(0, 200), status: 'pending', approvedCount: 0, at: Date.now() });
        return d.from(T_INV).update({ claims: claims }).eq('_id', mySub).then(function (r) {
          if (r && r.error) { setErr('claim', r.error); return { ok: false, message: '提交失败' }; }
          return self.refresh().then(function () { return { ok: true }; });
        });
      }).catch(function (e) { setErr('claim_throw', e); return { ok: false, message: '网络异常' }; });
    },

    /* ---------- 激活判定 ----------
       [v367 规则改版] 注册即激活：新绑定直接写 valid（见 bindRef）。
       心跳保留两项职责：① 首次激活自己的权益行；② 把存量的 registered/cooling 行推进为 valid（老数据迁移），
       三段状态机（registered→cooling→valid）与 3 天冷静期已废止。 */
    onSaved: function () {
      var now = Date.now();
      if (now - lastHb < HB_INTERVAL) return;
      lastHb = now;
      var mySub = sub(), d = db();
      if (!mySub || !d) return;
      readOne(T_ENT, mySub).then(function (ent) {
        var w1 = ent
          ? (ent.activated_at ? Promise.resolve(true)
              : d.from(T_ENT).update({ activated_at: iso(now) }).eq('_id', mySub))
          : Promise.resolve(false);
        return w1.then(function () {
          return d.from(T_LINKS).select('id,status').eq('invited_uid', mySub).then(function (r) {
            if (r && r.error) return;
            var updates = ((r && r.data) || []).filter(function (x) { return x.status !== 'valid'; });
            return updates.reduce(function (p, x) {
              return p.then(function () {
                return d.from(T_LINKS).update({ status: 'valid', activated_at: iso(now) }).eq('id', x.id)
                  .catch(function () {});
              });
            }, Promise.resolve());
          });
        });
      }).catch(function (e) { setErr('hb_throw', e); /* 静默，失败不影响保存流程 */ });
    },

    /* ---------- 展示用 ---------- */
    inviteUrl: function (base) {
      var b = String(base || (location && location.href) || '').split('#')[0].split('?')[0];
      return b + '?ref=' + encodeURIComponent(this.myCode());
    },
    FEATURES: FEATURES,
    PLAN_FEATURES: PLAN_FEATURES,
    PLAN_NAMES: PLAN_NAMES
  };

  window.RyEntitle = RyEntitle;

  /* [v358] 本地联调钩子：?rymock=L1|L2|trial|locked
     只允许在 file:// / localhost / 127.0.0.1 生效 —— 线上域名一律忽略，
     避免「加个 URL 参数就绕过付费墙」。 */
  (function () {
    try {
      var m = /[?&]rymock=(L1|L2|trial|locked)\b/.exec(String(location.search || ''));
      if (!m) return;
      var h = String(location.hostname || '');
      var local = location.protocol === 'file:' || !h || h === 'localhost' || h === '127.0.0.1';
      if (!local) return;
      RyEntitle.mockPlan = m[1];
    } catch (e) { /* 无 location（Node 单测）时忽略 */ }
  })();
})();
