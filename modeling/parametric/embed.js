/* 唯一宿主协议：ready / theme；不开放模型或业务数据读写。 */
(function(){
  'use strict';
  var keys=['--u-bg','--u-toolbar','--u-panel','--u-canvas','--u-bg-2','--u-line','--u-line-2','--u-ink','--u-ink-2','--u-ink-3','--u-accent','--u-accent-2','--u-accent-bg','--u-accent-line','--u-water','--u-water-bg','--u-water-line','--u-err','--u-err-bg','--u-err-line','--u-warn','--u-warn-bg'];
  if(window.parent!==window){
    window.addEventListener('message',function(event){
      var data=event.data;
      if(event.source!==window.parent||!data||data.channel!=='runye.parametric'||data.version!==1||data.type!=='theme'||!data.colors||typeof data.colors!=='object')return;
      keys.forEach(function(k){var value=data.colors[k];if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))document.documentElement.style.setProperty(k,value);});
    });
  }
  function ready(){
    // 原型启动成功后再通知宿主，避免把脚本加载失败误报为可用。
    if(!window.GH||!document.querySelector('#nodeEditor .node'))return;
    if(window.parent!==window)window.parent.postMessage({channel:'runye.parametric',version:1,type:'ready'},'*');
    var previous='';
    if(window.ResizeObserver)new ResizeObserver(function(entries){
      var box=entries[0].contentRect,key=box.width+':'+box.height;
      if(key===previous||!box.width||!box.height)return;
      previous=key;requestAnimationFrame(function(){window.dispatchEvent(new Event('resize'));});
    }).observe(document.getElementById('app'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
