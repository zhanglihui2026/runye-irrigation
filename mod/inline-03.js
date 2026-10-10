
(function(){
  try{
    var beacon=new BeaconAction({
      appkey:'0WEB06U85YBSLJNL',
      versionCode:'1.0.0',
      channelID:'share',
      delay:1000,
      sessionDuration:30*60*1000,
      isOversea:false,
      needReportRqdEvent:false
    });
    beacon.onDirectUserAction('preview_page_view',{
      'url':location.href,
      'referrer':document.referrer,
      'title':document.title,
      'sandbox_id':'e954c53812554777afab5b1f9029c6ed'
    });
  }catch(e){}
})();
