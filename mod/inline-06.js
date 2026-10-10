
function refreshRunyeCompare(){
  var pd=window.planData||{};
  var ours={
    mainPipe:Number(pd.mainPipeODValue)||0,
    branchPipe:Number(pd.branchPipeODValue)||0,
    tapeOD:Number((document.getElementById('fld_tapeOD')?document.getElementById('fld_tapeOD').value:0))||0,
    pumpFlow:Number(pd.zoneFlow)||0,
    pumpHead:Number(pd.pumpHead)||0,
    pumpPower:Number(pd.motorKW)||0
  };
  window._irrOurs=ours;
  var fmt=function(v,dec){return (isFinite(v)&&v>0)?v.toFixed(dec):'—';};
  var set=function(id,v,d){var e=document.getElementById(id);if(e)e.textContent=fmt(v,d);};
  set('ic_mainPipe',ours.mainPipe,0);
  set('ic_branchPipe',ours.branchPipe,0);
  set('ic_tapeOD',ours.tapeOD,0);
  set('ic_pumpFlow',ours.pumpFlow,1);
  set('ic_pumpHead',ours.pumpHead,1);
  set('ic_pumpPower',ours.pumpPower,1);
  computeIrrDiff();
}
function computeIrrDiff(){
  var ours=window._irrOurs||{};
  var keys=['mainPipe','branchPipe','tapeOD','pumpFlow','pumpHead','pumpPower'];
  var units={mainPipe:'mm',branchPipe:'mm',tapeOD:'mm',pumpFlow:'m³/h',pumpHead:'m',pumpPower:'kW'};
  var decs={mainPipe:0,branchPipe:0,tapeOD:0,pumpFlow:1,pumpHead:1,pumpPower:1};
  keys.forEach(function(k){
    var irrEl=document.getElementById('ic_'+k+'_irr');
    var diffEl=document.getElementById('ic_'+k+'_diff');
    var pctEl=document.getElementById('ic_'+k+'_pct');
    if(!irrEl||!diffEl||!pctEl)return;
    var irr=parseFloat(irrEl.value);
    var o=parseFloat(ours[k]);
    if(!isFinite(o)||!isFinite(irr)||irr===0){diffEl.textContent='—';pctEl.textContent='—';pctEl.className='irr-pct';return;}
    var diff=o-irr; var pct=(diff/irr)*100; var d=decs[k];
    diffEl.textContent=(diff>0?'+':'')+diff.toFixed(d)+' '+units[k];
    pctEl.textContent=(pct>0?'+':'')+pct.toFixed(1)+'%';
    var a=Math.abs(pct);
    pctEl.className='irr-pct '+(a<=3?'ok':a<=8?'warn':'bad');
  });
}
function parseIrrText(t){
  var res={mainPipe:null,branchPipe:null,tapeOD:null,pumpFlow:null,pumpHead:null,pumpPower:null};
  if(!t)return res;
  var trimmed=t.trim();
  if(trimmed.charAt(0)==='{'||trimmed.charAt(0)==='['){
    try{var j=JSON.parse(trimmed);if(j&&typeof j==='object'){Object.keys(res).forEach(function(k){if(j[k]!=null&&isFinite(parseFloat(j[k])))res[k]=parseFloat(j[k]);});return res;}}catch(e){}
  }
  var numAfter=function(idx){
    var seg=t.slice(idx, idx+60);
    var m=seg.match(/[-+]?\d+(?:\.\d+)?/);
    return m?parseFloat(m[0]):null;
  };
  var rules=[
    {key:'mainPipe', re:/主\s*管|mainline|main\s*pipe|\bmain\b/i},
    {key:'branchPipe', re:/支\s*管|submain|sub\s*main/i},
    {key:'tapeOD', re:/滴\s*灌\s*带|滴\s*灌\s*管|毛\s*管|lateral/i},
    {key:'pumpFlow', re:/水泵\s*流量|泵\s*流量|系统\s*流量|总\s*流量|设计\s*流量|pump\s*flow|system\s*flow|(?<!滴头|支管|emitter|submain)\s*流量/i},
    {key:'pumpHead', re:/水\s*泵\s*扬\s*程|总\s*扬\s*程|扬\s*程|提\s*水\s*高\s*度|\btdh\b/i},
    {key:'pumpPower', re:/水\s*泵\s*功\s*率|电\s*机\s*功\s*率|功\s*率|\bpower\b|\bkw\b/i}
  ];
  rules.forEach(function(r){
    var m=t.match(r.re);
    if(m){var v=numAfter(m.index+m[0].length);if(v!=null)res[r.key]=v;}
  });
  return res;
}
function doIrrImport(text){
  var res=parseIrrText(text);
  var keys=['mainPipe','branchPipe','tapeOD','pumpFlow','pumpHead','pumpPower'];
  var n=0;
  keys.forEach(function(k){
    var v=res[k];
    if(v!=null&&isFinite(v)){
      var inp=document.getElementById('ic_'+k+'_irr');
      if(inp){inp.value=v;n++;}
    }
  });
  computeIrrDiff();
  var st=document.getElementById('icImportStatus');
  if(st){
    if(n>0){st.textContent='已导入 '+n+'/6 项，差值已更新';st.className='irr-import-status ok';}
    else{st.textContent='未能识别，请检查粘贴内容或文件格式';st.className='irr-import-status warn';}
  }
  return n;
}
(function(){
  var keys=['mainPipe','branchPipe','tapeOD','pumpFlow','pumpHead','pumpPower'];
  keys.forEach(function(k){
    var inp=document.getElementById('ic_'+k+'_irr');
    if(inp)inp.addEventListener('input',computeIrrDiff);
  });
  var clr=document.getElementById('icClearBtn');
  if(clr)clr.addEventListener('click',function(){
    keys.forEach(function(k){var inp=document.getElementById('ic_'+k+'_irr');if(inp)inp.value='';});
    computeIrrDiff();
  });
  var tg=document.getElementById('icToggleImport');
  var ibody=document.getElementById('icImportBody');
  if(tg&&ibody)tg.addEventListener('click',function(){var open=ibody.style.display!=='none';ibody.style.display=open?'none':'block';tg.textContent=open?'展开':'收起';});
  var imp=document.getElementById('icImportBtn');
  if(imp)imp.addEventListener('click',function(){var box=document.getElementById('icImportBox');if(box)doIrrImport(box.value||'');});
  var fi=document.getElementById('icFileInput');
  if(fi)fi.addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0];if(!f)return;
    var rd=new FileReader();
    rd.onload=function(){doIrrImport(String(rd.result||''));};
    rd.readAsText(f);
    e.target.value='';
  });
  if(document.readyState!=='loading'){if(typeof refreshRunyeCompare==='function')refreshRunyeCompare();}
  else document.addEventListener('DOMContentLoaded',function(){if(typeof refreshRunyeCompare==='function')refreshRunyeCompare();});
})();
