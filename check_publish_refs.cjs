'use strict';
/* 发布前引用核对 —— 防「页面引用了没入库的文件 ⇒ 线上 404」。
 *
 * 由来（2026-10-20 v619 发布时差点踩到）：
 *   index.html 里写着 <script src="core/cloud-design-binding-store.js">，
 *   但那个文件是新建的、**没进过仓库**。而 `git add -u` 只暂存「已跟踪文件的修改」，
 *   新文件会被静默跳过 —— 首页照常提交、被引用的脚本却没上传，线上打开就是 404，
 *   依赖它的功能整块哑掉且页面看起来一切正常。
 *
 * 判据：页面里引用的每一个本地脚本/样式，必须同时满足
 *   ① 在磁盘上存在（否则链接本身就是坏的）
 *   ② 在 git 索引里（`git ls-files`；索引就是这次提交要记录的内容）
 *
 * 用法：
 *   node check_publish_refs.cjs            → 核对，失败退出码 1
 *   node check_publish_refs.cjs --quiet    → 只在失败时输出
 * 退出码：0 全过 / 1 有引用未入库或文件缺失 / 2 无法读取 git。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const QUIET = process.argv.includes('--quiet');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

let tracked;
try {
  tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
} catch (e) {
  console.error('[错误] 读不到 git 索引（不在仓库里或 git 不可用）：' + (e && e.message));
  process.exit(2);
}
if (!tracked.size) {
  console.error('[错误] git 索引是空的，无法核对。');
  process.exit(2);
}

/* 只扫已入库的 .html（未入库的页面本来就上不去，它引用什么不影响线上）。
   归档目录（feature-archive/）是历史快照，本身就故意不完整，不参与核对。 */
const SKIP = ['feature-archive/'];
const pages = [...tracked].filter((f) => /\.html?$/i.test(f) && !SKIP.some((s) => f.startsWith(s)));
/* 引用抽取：先剥 HTML 注释（index.html 里有用注释写脚本名的段落，不剥会假红），再抓 src/href */
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const REF_RE = /<(script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

function isLocal(u) {
  if (!u) return false;
  if (/^(?:[a-z]+:)?\/\//i.test(u)) return false;   // http(s)、协议相对
  if (/^(?:data|blob|javascript|mailto|tel):/i.test(u)) return false;
  if (u.startsWith('#')) return false;
  return true;
}

let refCount = 0;
const missingOnDisk = [];   // 页面引用了，磁盘上没有
const notInIndex = [];      // 磁盘上有，但没入库（本次要防的那一类）

for (const page of pages) {
  const dir = path.posix.dirname(page);
  let html;
  try { html = fs.readFileSync(path.join(ROOT, page), 'utf8'); } catch (e) { continue; }
  const src = stripComments(html);
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(src))) {
    const tag = m[1].toLowerCase();
    const raw = m[2].trim();
    if (!isLocal(raw)) continue;
    const clean = raw.split('?')[0].split('#')[0];
    if (!clean) continue;
    const rel = clean.startsWith('/')
      ? clean.replace(/^\/+/, '')
      : path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, clean));
    if (rel.startsWith('..')) continue;              // 指到仓库外，不在发布范围
    refCount++;
    const onDisk = fs.existsSync(path.join(ROOT, rel));
    if (!onDisk) { missingOnDisk.push(page + ' → ' + rel); continue; }
    if (!tracked.has(rel)) notInIndex.push(page + ' → ' + rel);
  }
}

const ok = missingOnDisk.length === 0 && notInIndex.length === 0;
if (!ok || !QUIET) {
  console.log('== 发布引用核对 ==');
  console.log('扫描页面 ' + pages.length + ' 个，本地脚本/样式引用 ' + refCount + ' 条');
  notInIndex.forEach((x) => console.log('  [未入库] ' + x + '  （磁盘上有，但没进 git ⇒ 上线后 404，功能会哑掉）'));
  missingOnDisk.forEach((x) => console.log('  [缺失]   ' + x + '  （页面引用了，磁盘上没有 ⇒ 链接本身是坏的）'));
  if (!ok) {
    console.log('\n处理办法：把上面「未入库」的文件加进暂存区（GitHub Desktop 里勾选，或 git add <文件>），');
    console.log('          「缺失」的要么补回文件，要么把页面里的引用删掉，然后重新发布。');
  }
  console.log('== 结果：' + (ok ? 'PASS' : 'FAIL') + ' ==');
}
process.exit(ok ? 0 : 1);
