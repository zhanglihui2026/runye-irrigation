const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm');
const repo = require('path').join(__dirname, '..');
function setup() {
  const root = { measuredPolygon: [{x:0,y:0},{x:120,y:0},{x:120,y:100},{x:0,y:100}], measuredArea:12000 };
  const context=vm.createContext(root);
  vm.runInContext(fs.readFileSync(repo+'/runye-ai-plan.js','utf8'), context);
  return root;
}
function plan(design={}) { return {version:1, design:{tape_spacing:.4,emitter_spacing:.3,emitter_flow:.8,...design}}; }
function inputs(root) {
  const nodes={}; for(const f of root.RyAiPlan.FIELDS) for(const id of f.ids) nodes[id]={value:'50'};
  nodes.planZoneMode={value:'auto'};
  root.document={getElementById:id=>nodes[id]||null}; return nodes;
}
test('rejects garbage and ambiguous units instead of converting them to plausible values',()=>{
  const {RyAiPlan:a}=setup(); for(const v of ['abc','0,4','0.4 cm','50%']) assert.equal(a.validate(plan({terrain_dh:v})).ok,false,v);
  assert.equal(a.validate(plan({tape_spacing:'4e-1'})).ok,true);
});
test('export example is valid JSON accepted by importer',()=>{const {RyAiPlan:a}=setup();assert.equal(a.parse(a.schemaHint()).ok,true);});
test('missing optional parameters preserve existing source and pump settings',()=>{
  const root=setup(),nodes=inputs(root);let calls=0;root.calcPlan=()=>calls++;
  assert.equal(root.RyAiPlan.apply(plan()).ok,true);
  for(const id of ['fld_lift','planSrcDist','planTapeLaySide','planZoneMuManual']) assert.equal(nodes[id].value,'50',id);
  assert.equal(nodes.planZoneMode.value,'auto');assert.equal(calls,1);
});
test('invalid direct apply and unavailable engine cannot partially change inputs',()=>{
  const root=setup(),nodes=inputs(root);root.calcPlan=()=>{throw new Error('unexpected calculation');};
  assert.equal(root.RyAiPlan.apply(plan({tape_spacing:-4})).ok,false);assert.equal(nodes.planTapeSpacing.value,'50');
  delete root.calcPlan;assert.equal(root.RyAiPlan.apply(plan()).ok,false);assert.equal(nodes.planTapeSpacing.value,'50');
});
test('AI import preserves enabled surveyed terrain and explicitly reports override',()=>{
  const root=setup(),nodes=inputs(root);root.calcPlan=()=>{};root.RyTerrain={exportState:()=>({enabled:true})};
  const result=root.RyAiPlan.apply(plan({terrain_dh:25}));assert.equal(nodes.fld_dh.value,'50');assert.match(result.warnings.join(''),/手动高程/);
});
test('group export sums actual child areas instead of bounding rectangle gaps',()=>{
  const root=setup();root.__runyeGroupEdit={active:true,mode:'whole'};
  root.__runyeSubPlots=[{name:'三角',poly:[{x:0,y:0},{x:200,y:0},{x:0,y:200}]},{name:'矩形',poly:[{x:250,y:0},{x:450,y:0},{x:450,y:100},{x:250,y:100}]}];
  root.measuredArea=90000;assert.equal(root.RyAiPlan.collect().area_m2,40000);assert.match(root.RyAiPlan.buildPrompt(''),/不含地块之间的空隙/);
});
test('source-relative elevation does not manufacture a field slope',()=>{const {RyAiPlan:a}=setup();assert.equal(a.collect().slope_percent,null);assert.match(a.buildPrompt(''),/坡度与坡向：未测量/);});
test('unsupported schema versions cannot silently apply',()=>{const {RyAiPlan:a}=setup();assert.equal(a.validate({...plan(),version:99}).ok,false);});
