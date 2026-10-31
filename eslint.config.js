'use strict';

/**
 * ESLint 基线（flat config / eslint 9）—— 润野灌溉
 *
 * ============================ 设计意图（先读这段） ============================
 * 本站是「纯静态多页 + IIFE + 挂 window」写法，没有构建期类型检查。这个配置**不是**为了
 * 把代码改成 lint 全绿的理想态，而是为了**造一把不会误报的尺子**：
 *
 *   首跑必须 0 个真错。任何一条新出现的报错，才值得当成「刚改坏了」的信号去看。
 *
 * 所以第一轮**故意**只开「几乎不可能误报、一报就是真缺陷」的规则，
 * 而把 `no-undef` / `no-unused-vars` / `no-redeclare` 全部关掉 ——
 * 这三条在全站隐式全局 + 变量重复声明的历史写法下会刷出上千条，噪音盖掉信号。
 *
 * 别急着把 rules 加满。要加先问一句：这条报出来的，我有几成把握是真 bug？
 * 到 100% 再加。
 *
 * ============================ 已知局限 ============================
 * - `no-undef` 关着 ⇒ 拼错全局名（`RyTilWs` vs `RyTlWs`）现在抓不到。
 *   将来要开，前提是把 eslint.globals.json 补齐 + 各文件 env 分准。
 * - 隐式全局赋值（不带 var 直接 `foo = 1`）不会被察觉。
 * - 只看语法与字面缺陷，不看运行时契约。
 *
 * ============================ 用法 ============================
 *   npm run lint          # 全量
 *   npx eslint mod/inline-09.js mod/plot-editor.js   # 只看这两个巨头
 *   node scripts/gen-eslint-globals.cjs              # 改了 window 导出后重跑
 */

const browserGlobals = require('./eslint.globals.json').browser;

/** 第一轮规则：一报就是真缺陷的那几条 */
const RULES = {
  // —— 真的会咬人：结构/逻辑缺陷 ——
  'no-dupe-keys': 'error',            // 对象字面量里同名键，后一个静默覆盖前一个
  'no-dupe-args': 'error',            // function(a, a) 形参重名
  'no-unreachable': 'error',          // return/throw/break 之后还有代码
  'no-unexpected-multiline': 'error', // 换行导致语义与目视不符
  'no-self-assign': 'error',          // a = a
  'no-self-compare': 'error',         // a === a
  'no-obj-calls': 'error',            // Math() / JSON() 当函数调
  'no-sparse-arrays': 'error',        // [1, , 3] 空洞
  'no-template-curly-in-string': 'error', // 普通字符串里写了 ${x}

  // —— 大概率是缺陷，但留一点容忍度 ——
  'no-fallthrough': 'warn',           // switch 忘了 break（有注释可放行）
  'use-isnan': 'warn',                // x === NaN 恒假
  'valid-typeof': 'warn',             // typeof x === 'strnig'
  'no-compare-neg-zero': 'warn',      // x === -0

  // —— 第一轮故意关闭（见文件头「设计意图」）——
  'no-undef': 'off',
  'no-unused-vars': 'off',
  'no-redeclare': 'off',
  'no-empty': 'off',

  // —— 下面两条：本站既有写法会稳定误报，首跑实测过、逐处读过，不是缺陷 ——
  // 关掉它们不是「为了好看」，是因为留着会淹没真信号。重新开启的前置条件写在注释里。
  'no-cond-assign': 'off',   // 13 处 `if(el=document.getElementById('x')) el.textContent=…`
                             // 全在 mod/inline-09.js:2658-2691 同一块，一个 el 变量反复复用，
                             // 是有意的紧凑赋值链。要重开：给这 13 处各加一层括号
                             // `if((el=…))`（零行为变化），规则的自带 except-parens 就会放行。
  'no-func-assign': 'off'    // 2 处，都是**刻意的拦截器模式**：
                             //   mod/plot-editor.js:2369 `ppRender = function(){ ppRenderBase.apply(...) }`
                             //     —— 注释原文「把局部 ppRender 换成一个转发器（函数声明可重新赋值）」
                             //   mod/inline-09.js:6065  `render = function(){ origRender(); … }`
                             //     —— 渲染后补跑 initScrollReveal
                             // 站点依赖「函数声明当可替换槽位」这一层间接，规则天然认它是错的。
};

/** 不扫的目录：历史备份、归档快照、第三方产物、生成物 */
const IGNORES = [
  'node_modules/',
  '_*/',                  // _backup_* / _archive_* / _probe_out/ 等 140+ 个下划线目录
  'feature-archive/',     // 功能归档快照，不参与发布
  'pwa/vendor/',          // 第三方 minify 打包（cloudbase sdk 等）
  'graphify-out/',
  'ui-style-reference/',
  '**/*.min.js'
];

module.exports = [
  { ignores: IGNORES },

  // ——— 浏览器端：根目录模块 / mod / core / tl-workspace / 水利 / 地块等 ———
  {
    files: [
      '*.js',
      'mod/**/*.js',
      'core/**/*.js',
      'lib/**/*.js',
      'tl-workspace/**/*.js',
      'hydraulic-calc/*.js',
      'plot-cloud/**/*.js',
      'terrain/**/*.js',
      'qicai-huasheng/**/*.js',
      'digital-agriculture/**/*.js',
      'filter-system/**/*.js',
      'plugins/**/*.js'
    ],
    languageOptions: {
      // 不用 ecmaVersion:5 —— mod/inline-09.js 等处有 400+ 处 const/let/箭头函数，
      // 按 ES5 解析会先炸出上千条 parse error，把真问题埋掉。
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...browserGlobals,
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Image: 'readonly',
        PerformanceObserver: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        Promise: 'readonly',
        IntersectionObserverEntry: 'readonly'
      }
    },
    rules: RULES
  },

  // ——— ES Module 部分 ———
  // core/ 是「两种写法混住」的目录：6 个 ES Module + 13 个普通脚本（挂 window 的 store/adapter）。
  // 按目录通配一定会错，所以 ESM 的逐个列名。**新增 core 里的 ESM 请补进这个名单**，
  // 否则它会按 script 解析、报一条假的 "import ... only with sourceType: module"。
  {
    files: [
      'core/bootstrap.js',
      'core/data-service.js',
      'core/event-bus.js',
      'core/loader.js',
      'core/runtime-guard.js',
      'core/ui-shell.js',
      'plugins/*/main.js',   // 插件按 ESM 加载（含 import.meta）
      'vite.config.js'
    ],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: RULES
  },

  // ——— Node 端：脚本 / 测试 / 探针 / 云函数 ———
  {
    files: [
      '**/*.cjs',
      '**/*.mjs',
      'scripts/**/*.js',
      'tests/**/*.js',
      'api/**/*.js',
      'modeling/**/*.js',
      'cloudfn/**/*.js',
      'project-planning/**/*.js',
      'hydraulic-calc/native/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'writable',
        exports: 'writable',
        require: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly'
      }
    },
    rules: RULES
  },

  // ——— .mjs 是 ES Module，单独给 sourceType ———
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module' }
  }
];
