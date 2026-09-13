const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./iso_diagram.test.cjs'),'utf8');
const start=source.indexOf('function mkData'), fixture={};
vm.runInNewContext(source.slice(start,source.indexOf('console.log',start)),fixture);
function boot(){
  delete require.cache[require.resolve('../iso-diagram/iso-diagram.js')];
  const iso=require('../iso-diagram/iso-diagram.js'),data=fixture.mkData();
  iso.attachData(data);iso.renderSVG(data);return {iso,data};
}
test('预览/取消/应用/撤销隔离，导出不包含未应用预览',()=>{
  const {iso,data}=boot();const before=iso.renderSVG(data);
  iso.beginEdit('V-B01');assert.equal(iso.previewEdit({size:1.8,spec:'dn90'}),true);
  assert.notEqual(iso.renderSVG(data),before);
  assert.equal(iso.exportState().state.edits['V-B01'],undefined);
  iso.cancelEdit();assert.equal(iso.renderSVG(data),before);
  iso.beginEdit('V-B01');iso.previewEdit({size:1.8,spec:'dn90'});iso.applyEdit();
  assert.equal(iso.exportState().state.edits['V-B01'].spec,'dn90');
  iso.undoEdit();assert.equal(iso.renderSVG(data),before);
});
test('立管高度联动支管且始终平行Z轴，输入不改变原平面',()=>{
  const {iso,data}=boot(),original=JSON.stringify(data);
  const old=iso.getViewState().branchOffsets[0].y;
  iso.beginEdit('R-V-B01');assert.equal(iso.previewEdit({rise:68,position:0.7,height:1.2}),true);iso.applyEdit();
  const svg=iso.renderSVG(data),r=svg.match(/data-connector="main-branch" d="M([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+)"/);
  assert.equal(r[1],r[3]);assert.ok(Math.abs(Number(r[2])-Number(r[4])-68)<0.11);
  assert.equal(iso.getViewState().branchOffsets[0].y,old-40);
  assert.equal(JSON.stringify(data),original);
});
test('拒绝非法参数且不改变当前状态',()=>{
  const {iso}=boot();iso.beginEdit('V-B01');
  for(const values of [{size:NaN},{rise:0},{position:2},{height:-1},{spec:'x'.repeat(41)}])assert.equal(iso.previewEdit(values),false);
  assert.equal(iso.getParams('V-B01').size,1);
});
test('手工配件沿管移动、删除撤销和序列号恢复',()=>{
  const {iso,data}=boot();const m=iso.addManual('valve','dn110','main',0,{x:32,y:50});
  iso.renderSVG(data);iso.beginEdit(m.id);assert.equal(iso.previewEdit({distance:70}),true);iso.applyEdit();
  assert.equal(iso.manualPosition(m.id).distance,70);
  iso.removeManual(m.id);assert.equal(iso.manualCount(),0);iso.undoEdit();assert.equal(iso.manualCount(),1);
  const saved=iso.exportState(),next=boot();assert.equal(next.iso.importState(saved,next.data),true);
  assert.equal(next.iso.manualPosition(m.id).distance,70);
  assert.equal(next.iso.addManual('valve','','main',0,{x:32,y:80}).id,'M-V02');
});
test('持久化恢复，相同几何保留，不同几何拒绝套用',()=>{
  const {iso,data}=boot();iso.beginEdit('TEE-B01');iso.previewEdit({spec:'dn160',branchSpec:'dn110'});iso.applyEdit();
  const saved=iso.exportState(),next=boot();assert.equal(next.iso.importState(saved,next.data),true);
  assert.equal(next.iso.getParams('TEE-B01').branchSpec,'dn110');
  next.iso.attachData(JSON.parse(JSON.stringify(next.data)));assert.equal(next.iso.getParams('TEE-B01').spec,'dn160');
  const different=fixture.mkData();different.mainPipes[0][0].x++;
  assert.equal(next.iso.importState(saved,different),false);next.iso.attachData(different);
  assert.equal(next.iso.getParams('TEE-B01').spec,'');
});
