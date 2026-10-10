
(function(){
  try{
    if(window.innerWidth>=1101 && !(window.matchMedia&&window.matchMedia('print').matches)){
      document.body.classList.add('ry-tool');
    }
  }catch(e){}
})();
