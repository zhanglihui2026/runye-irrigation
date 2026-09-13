/* 宿主适配器：懒加载、主题同步、就绪状态；不传输灌溉业务数据。 */
(function(){
  'use strict';
  var section=document.getElementById('parametricModelingSection');
  var frame=document.getElementById('parametricModelerFrame');
  if(!section||!frame)return;
  var channel='runye.parametric',version=1,mounted=false,ready=false,timer;
  var keys=['--u-bg','--u-toolbar','--u-panel','--u-canvas','--u-bg-2','--u-line','--u-line-2','--u-ink','--u-ink-2','--u-ink-3','--u-accent','--u-accent-2','--u-accent-bg','--u-accent-line','--u-water','--u-water-bg','--u-water-line','--u-err','--u-err-bg','--u-err-line','--u-warn','--u-warn-bg'];
  function sendTheme(){
    if(!ready)return;
    var style=getComputedStyle(document.documentElement),colors={};
    keys.forEach(function(k){var v=style.getPropertyValue(k).trim();if(/^#[0-9a-f]{6}$/i.test(v))colors[k]=v;});
    // sandbox 的子页是 opaque origin，发送只能用 *；接收端严格校验 event.source。
    frame.contentWindow.postMessage({channel:channel,version:version,type:'theme',colors:colors},'*');
  }
  function load(){
    if(mounted)return;
    mounted=true;section.dataset.modelingState='loading';
    frame.src=frame.dataset.src;
    timer=setTimeout(function(){
      if(!ready){section.dataset.modelingState='error';document.getElementById('parametricLoadText').textContent='模块暂未载入，可尝试在独立窗口打开。';}
    },12000);
  }
  window.addEventListener('message',function(event){
    var data=event.data;
    if(event.source!==frame.contentWindow||event.origin!=='null'||!data||data.channel!==channel||data.version!==version||data.type!=='ready')return;
    ready=true;clearTimeout(timer);section.dataset.modelingState='ready';sendTheme();
  });
  document.addEventListener('click',function(event){
    var link=event.target.closest('[data-target="parametricModelingSection"],[data-open-parametric]');
    if(!link)return;
    if(link.hasAttribute('data-open-parametric')){event.preventDefault();window.ryJumpToSection('parametricModelingSection');}
    load();
  });
  // 非工具模式可滚动到模块；首次可见才加载，切换页面不销毁模型。
  if(window.IntersectionObserver){
    var observer=new IntersectionObserver(function(entries){if(entries.some(function(e){return e.isIntersecting;})){load();observer.disconnect();}});
    observer.observe(section);
  }else load();
  new MutationObserver(sendTheme).observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
})();
