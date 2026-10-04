/* 抽取 HTML 内所有 <script> 主体做语法检查（不执行） */
const fs=require('fs'), vm=require('vm');
const f=process.argv[2]||'管路接驳拼装.html';
const src=fs.readFileSync(f,'utf8');
const re=/<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m,i=0,bad=0;
while((m=re.exec(src))){
  i++;
  const attrs=m[1]||'', body=m[2];
  if(/\ssrc\s*=/.test(attrs)){ console.log('  #'+i+' 外链 script，跳过'); continue; }
  if(/type\s*=\s*["'](?!text\/javascript)/i.test(attrs)){ console.log('  #'+i+' 非 JS type，跳过'); continue; }
  try{ new vm.Script(body,{filename:f+'#script'+i}); console.log('  #'+i+' OK  ('+body.split('\n').length+' 行)'); }
  catch(e){ bad++; console.log('  #'+i+' ✗ 语法错误: '+e.message); }
}
console.log(bad? ('语法检查失败：'+bad+' 处') : '语法检查全部通过（共 '+i+' 段）');
process.exitCode = bad?1:0;
