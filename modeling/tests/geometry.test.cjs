const test=require('node:test');
const assert=require('node:assert/strict');
const {computeLoft}=require('../parametric/js/geometry.js');
const line={type:'line',x1:0,y1:0,x2:100,y2:0};
test('圆形截面：160 个有限坐标三角形，长度和半径正确',()=>{
 const result=computeLoft(line,{type:'circle',r:10});
 assert.equal(result.tris.length,160);
 const pts=result.tris.flat();
 assert(pts.flat().every(Number.isFinite));
 assert.deepEqual(result.A,[0,0,0]);assert.deepEqual(result.B,[100,0,0]);
 assert.equal(Math.max(...pts.map(p=>p[0])),100);
 assert(Math.abs(Math.max(...pts.map(p=>Math.hypot(p[1],p[2])))-10)<1e-9);
});
test('矩形截面：封闭实体，16 个三角形及正确宽高',()=>{
 const result=computeLoft(line,{type:'rect',w:20,h:10});
 assert.equal(result.tris.length,16);
 const pts=result.tris.flat();
 assert.equal(Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1])),20);
 assert.equal(Math.max(...pts.map(p=>p[2]))-Math.min(...pts.map(p=>p[2])),10);
});
test('缺失输入与零长路径给出错误结果',()=>{
 assert(computeLoft(null,{type:'circle',r:10}).error);
 assert(computeLoft(line,null).error);
 assert(computeLoft({...line,x2:0},{type:'circle',r:10}).error);
});
test('改变路径长度与截面半径会更新网格，不修改输入',()=>{
 const section={type:'circle',r:10},saved=JSON.stringify({line,section});
 const first=computeLoft(line,section);
 const next=computeLoft({...line,x2:150},{...section,r:20});
 assert.notDeepEqual(first.tris,next.tris);
 assert.equal(JSON.stringify({line,section}),saved);
 assert.deepEqual(next.B,[150,0,0]);
});
