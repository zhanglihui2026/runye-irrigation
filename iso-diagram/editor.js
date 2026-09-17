/* 轴测编辑面板：工程参数只作标注，显示参数即时预览。 */
(function () {
  'use strict';
  var iso=window.RyIsoDiagram, side=document.getElementById('tlIsoSide');
  if(!iso || !side) return;
  /* 2026-09-15 用户下线（ISO_PARAM_EDITOR_OFF）：轴测左栏编辑类功能整体取消，
     本「构件参数编辑面板 + 撤销/保存工具条」一并收起（整栏空置），待用户重定方案；
     恢复时改回 false 即可。末尾「恢复本地草稿」分支随之停用（编辑已不可用，
     旧草稿数据仍保留在 localStorage 不删除）。 */
  var ISO_PARAM_EDITOR_OFF = true;
  if (ISO_PARAM_EDITOR_OFF) return;
  var selected=null;
  var panel=document.createElement('div'); panel.className='tl-iso-card iso-editor'; panel.hidden=true;
  side.appendChild(panel);
  var tools=document.createElement('div'); tools.className='tl-iso-card iso-editor';
  tools.innerHTML='<button type="button" data-action="undo">撤销上一步</button> <button type="button" data-action="save">保存轴测编辑</button><p class="tl-iso-hint" role="status"></p>';
  side.appendChild(tools);
  var status=tools.querySelector('[role="status"]');
  function key(){return 'runye_iso_editor_v1:'+(window.currentPlotId || 'current');}
  function message(t){status.textContent=t;}
  function saveLocal(){
    if(!window.tlDiagramData) return;
    try{localStorage.setItem(key(),JSON.stringify({version:1,data:window.tlDiagramData,editor:iso.exportState()}));message('轴测编辑已保存到本机');}
    catch(e){message('保存失败：本机存储空间不足或不可用，请勿关闭页面');}
  }
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function field(label,name,value,type,min,max,step){
    return '<label>'+label+'<input name="'+name+'" type="'+(type||'text')+'" value="'+esc(value===null?'':value)+'"'+(min!==undefined?' min="'+min+'" max="'+max+'" step="'+(step||1)+'"':'')+'></label>';
  }
  function select(label,name,choices,value){return '<label>'+label+'<select name="'+name+'">'+choices.map(function(c){return '<option'+(String(c)===String(value)?' selected':'')+'>'+c+'</option>';}).join('')+'</select></label>';}
  function close(){iso.cancelEdit();selected=null;panel.hidden=true;}
  function open(info){
    if(!info)return;
    var p=iso.beginEdit(info.id); if(!p)return;
    selected=info; panel.hidden=false;
    document.getElementById('tlIsoInfoCard').style.display='none';
    var h='<div class="tl-iso-card-title">'+esc(info.kindLabel)+' · '+esc(info.id)+'</div><p>'+esc(info.segName || [info.upstream,info.downstream].filter(Boolean).join(' → '))+'</p>';
    h+='<p class="tl-iso-hint">工程参数仅用于标注，未参与水力计算及材料规格统计。</p>';
    if(info.kind==='riser'){
      h+=field('实际高度 m（空白=待定）','height',p.height,'number',0.01,100,0.01);
      h+=field('图上展开高度','rise',p.rise,'number',24,120,1);
      h+=field('阀门位置（距底部比例）','position',p.position,'number',0.15,0.85,0.01);
    }else{
      h+=field(info.kind==='tee'?'直通两端口径（空白=随管）':'口径（空白=随管）','spec',p.spec);
      if(info.kind==='tee')h+=field('分支口径（空白=随管）','branchSpec',p.branchSpec);
      if(info.kind==='tee' && info.teeType && info.branchSpec)h+=field('接管长度 m','branchLen',info.branchLen,'number',0.5,10,0.1);
      if(info.kind==='valve')h+=select('阀门类型（通用图例，类型另注）','valveType',['通用阀门','闸阀','球阀','蝶阀','止回阀'],p.valveType);
      if(info.kind==='elbow')h+=select('弯头角度（标注，不改变管路）','angle',[45,90],p.angle);
      h+=select('连接方式','connection',['未指定','法兰','螺纹','热熔','承插'],p.connection);
      h+=field('符号倍率','size',p.size,'number',0.5,2,0.1);
      if(info.manual){var pos=iso.manualPosition(info.id);if(pos && pos.length>1)h+=field('沿管段位置（距起点 m）','distance',Math.round(pos.distance*100)/100,'number',0.5,Math.floor((pos.length-0.5)*100)/100,0.01);}
      if(info.kind==='valve' && info.id.indexOf('V-B')===0)h+='<button type="button" data-action="riser">调整此阀门的立管与位置</button>';
    }
    h+='<label class="iso-check"><input name="label" type="checkbox"'+(p.label?' checked':'')+'>显示编号与参数</label>';
    h+=field('标注横移','labelX',p.labelX,'number',-100,100)+field('标注纵移','labelY',p.labelY,'number',-100,100);
    h+='<div class="iso-actions"><button type="button" data-action="apply">应用</button><button type="button" data-action="cancel">取消</button><button type="button" data-action="reset">恢复默认</button>';
    if(info.manual)h+='<button type="button" data-action="copy">复制并放置</button><button type="button" data-action="delete">删除</button>';
    panel.innerHTML=h+'</div><p class="tl-iso-hint" role="status"></p>';
  }
  function preview(){
    if(!selected)return false;
    var values={}; var valid=true;
    panel.querySelectorAll('[name]').forEach(function(input){
      if(!input.checkValidity())valid=false;
      var name=input.name;
      values[name]=input.type==='checkbox'?input.checked:
        (input.type==='number'||name==='angle'?(input.value==='' && name==='height'?null:Number(input.value)):input.value);
    });
    var ok=valid && iso.previewEdit(values);
    panel.querySelector('[role="status"]').textContent=ok?'预览中，点击应用保存':'参数超出范围，请检查输入';
    return ok;
  }
  panel.addEventListener('input',preview);
  panel.addEventListener('change',preview);
  var copyParams=null;
  panel.addEventListener('click',function(e){
    var button=e.target.closest('[data-action]'); if(!button||!selected)return;
    var action=button.dataset.action,id=selected.id;
    if(action==='apply'){if(preview()){iso.applyEdit();open(iso.fittingInfo(id));message('参数已应用');}}
    if(action==='cancel')close();
    if(action==='reset'){iso.resetEdit(id);open(iso.fittingInfo(id));}
    if(action==='delete'){close();iso.removeManual(id);}
    if(action==='riser')open(iso.fittingInfo('R-'+id));
    if(action==='copy'){
      if(!preview())return;
      copyParams=Object.assign({},iso.getParams(id));var kind=selected.kind;
      close();iso.startPlace(kind,copyParams.spec);message('在管线上点击放置副本');
    }
  });
  iso.onFittingClick=open;
  var placed=iso.onPlaceResult;
  iso.onPlaceResult=function(res){
    if(placed)placed(res);
    if(res && res.ok){
      if(copyParams){iso.beginEdit(res.id);iso.previewEdit(copyParams);iso.applyEdit();copyParams=null;}
      open(iso.fittingInfo(res.id));
    }else if(!iso.placingKind())copyParams=null;
  };
  iso.onEditChange=function(){saveLocal();if(typeof tlIsoStatsRender==='function')tlIsoStatsRender();};
  tools.addEventListener('click',function(e){
    var b=e.target.closest('[data-action]');if(!b)return;
    if(b.dataset.action==='undo'){close();message(iso.undoEdit()?'已撤销':'没有可撤销的操作');}
    if(b.dataset.action==='save'){if(selected){if(!preview())return;iso.applyEdit();}saveLocal();}
  });
  // 刷新恢复本地草稿；不同地块使用独立键，新生成的不同几何不会继承旧编号覆盖。
  try{
    var saved=JSON.parse(localStorage.getItem(key())||'null');
    if(saved && saved.version===1 && saved.data && !window.tlDiagramData){
      var container=document.getElementById('tlIsoDiagramContent');
      if(iso.importState(saved.editor,saved.data)){
        window.tlDiagramData=saved.data;iso.render(container,saved.data);message('已恢复上次轴测编辑（已保存的管网快照）');
      }
    }
  }catch(e){message('上次轴测编辑无法恢复；原灌溉方案不受影响');}
})();
