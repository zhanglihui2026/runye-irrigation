
(function(){
  if(typeof rySetTab!=='function') return;

  /* ---------- 1. 主区 Tab 绑定（二级 / 三级），复用 rySetTab ---------- */
  function wireTabs(tabsId, sectionId){
    var bar=document.getElementById(tabsId);
    if(!bar) return;
    var btns=bar.querySelectorAll('button[data-ry-view]');
    for(var i=0;i<btns.length;i++){
      (function(b){
        b.addEventListener('click', function(){ rySetTab(sectionId, b.getAttribute('data-ry-view')); });
      })(btns[i]);
    }
  }
  wireTabs('ppTabs','pipePlanSection');
  wireTabs('tlTabs','tlPipePlanSection');

  /* ---------- 2. 底部状态栏 ---------- */
  var NAMES={designInput:'标准分区预设',areaTool:'地块绘制',
             pipePlanSection:'地块分区',tlPipePlanSection:'管路规划',detailsSection:'材料清单',
             threeDModelingSection:'经济指标分析',parametricModelingSection:'数字化建模',
             filterSystemSection:'过滤系统'};
  var HINTS={
    designInput:'调整左侧参数，方案与管径选型结果实时更新',
    areaTool:'上传图片或在线地图描绘地块边界，闭合后自动回填面积',
    pipePlanSection:'绘制主管 / 支管 → 生成施工图 → 切「二级简图」查看',
    tlPipePlanSection:'设定联合灌溉分区 → 生成管线图 → 「三级制图」可缩放/插入管线',
    detailsSection:'材料清单与工程量汇总',
threeDModelingSection:'经济指标分析 · 入口预留（方案确定后上线）',
    parametricModelingSection:'数字化建模 · 入口预留（方案确定后上线）',
    filterSystemSection:'GREEN 型单体并联机组 · 四视图与选型计算 · 可回写过滤损失'
  };
  window.ryStatusUpdate=function(sec){
    if(!sec) return;
    var id=sec.id;
    var a=document.getElementById('ryStSection'),
        b=document.getElementById('ryStHint'),
        c=document.getElementById('ryStTag');
    if(a) a.textContent=NAMES[id]||id;
    if(b) b.textContent=HINTS[id]||'';
    if(c) c.textContent=(id==='pipePlanSection'||id==='tlPipePlanSection')?'制图':'就绪';
  };
  window.ryStatusUpdate(document.querySelector('main > .ry-sec.ry-active'));

  /* ---------- 3. 视口变化时在「工具模式 / 滚动模式」间自适应（分界同引导脚本：1101px） ---------- */
  if(window.matchMedia){
    var mq=window.matchMedia('(min-width:1101px)');
    function applyMode(){
      document.body.classList.toggle('ry-tool', mq.matches);
      try{ window.dispatchEvent(new Event('resize')); }catch(e){}
    }
    mq.addEventListener?mq.addEventListener('change',applyMode):mq.addListener(applyMode);
  }
})();
