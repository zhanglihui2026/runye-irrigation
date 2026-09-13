/* node modeling/tests/smoke.cjs [siteRoot] [baselineRoot]
   可选 baselineRoot 用于在本次集成前后对比宿主计算结果。 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
const baseline=process.argv[3]&&path.resolve(process.argv[3]);
const out=path.join(root,'_modeling_verify');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split('?')[0]);
 let file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(name==='/baseline.html'&&baseline)file=path.join(baseline,'index.html');
 else if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 else if(!fs.existsSync(file)&&baseline)file=path.resolve(baseline,'.'+name);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
const capture=page=>page.evaluate(()=>({r:compute(),tl:computeThreeLevel(),gh:typeof window.GH}));
// CSP 安全轮询：waitForFunction 在 file:// 不透明源 iframe 下会走 eval 注入被 CSP 拦截；
// 这里改用 evaluate（callFunctionOn，无需 unsafe-eval）轮询，跨模式确定可复现。
const waitFor=async(fn,timeout)=>{const t=timeout||5000,s=Date.now();while(Date.now()-s<t){try{if(await fn())return;}catch(e){}await new Promise(r=>setTimeout(r,50));}throw new Error('waitFor timed out');};
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--headless=new','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const results=[];
 try{
  for(const [mode,width] of [['http',1600],['http',900],['file',1600],['file',390]]){
   const ctx=await browser.newContext({viewport:{width,height:1000}});
   await ctx.route('**/*',r=>/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)?r.abort():r.continue());
   const page=await ctx.newPage(),errors=[],diagnostics=[];
   page.on('console',m=>{if(m.type()==='error')diagnostics.push(m.text());});
   page.on('requestfailed',r=>diagnostics.push(r.url()+': '+r.failure().errorText));
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});
   let expected;
   if(baseline&&mode==='http'){
    await page.goto(base+'/baseline.html');await page.waitForTimeout(400);expected=await capture(page);errors.length=0;
   }
   await page.goto(mode==='http'?base:pathToFileURL(path.join(root,'index.html')).href);
   await page.waitForTimeout(400);
   const original=await capture(page);if(expected)assert.deepEqual(original,expected,'Host calculations changed');
  if(width>1100){
   assert.equal(await page.locator('#parametricModelerFrame').getAttribute('src'),null,'Not lazy loaded');
   await page.evaluate(()=>window.postMessage({channel:'runye.parametric',version:1,type:'ready'},'*'));
   await page.waitForTimeout(50);
   assert.equal(await page.locator('#parametricModelingSection').getAttribute('data-modeling-state'),'idle','Accepted unrelated message');
  }
   await page.locator('[data-target="parametricModelingSection"]').click();
   try{await page.waitForSelector('#parametricModelingSection[data-modeling-state="ready"]',{timeout:15000});}
   catch(e){console.error(mode,width,diagnostics);throw e;}
   const frame=await (await page.$('#parametricModelerFrame')).contentFrame();
   assert(frame);await frame.waitForSelector('.node-status.ok');
   assert.equal(await frame.locator('.node').count(),3);
   assert.equal(await frame.locator('path.wire').count(),2);
   assert.equal(await frame.locator('#vp3dMsg').isVisible(),false);
   assert(await frame.evaluate(()=>document.getElementById('vp3d').width>0));
   assert(await frame.evaluate(()=>{try{void parent.document.body;return false;}catch(e){return e.name==='SecurityError';}}),'Parent DOM not isolated');
   assert(await frame.evaluate(()=>{try{void localStorage.length;return false;}catch(e){return e.name==='SecurityError';}}),'Storage not isolated');
   const accent=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--u-accent').trim());
   assert.equal(await frame.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--u-accent').trim()),accent);
   await page.evaluate(()=>document.documentElement.style.setProperty('--u-accent','#185a41'));
   await waitFor(()=>frame.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--u-accent').trim()==='#185a41'));
   await page.evaluate(()=>document.documentElement.style.removeProperty('--u-accent'));
   await waitFor(()=>frame.evaluate(v=>getComputedStyle(document.documentElement).getPropertyValue('--u-accent').trim()===v,accent));
   await page.evaluate(()=>document.getElementById('parametricModelerFrame').contentWindow.postMessage({channel:'runye.parametric',version:1,type:'theme',colors:{'--u-accent':'url(https://example.invalid/x)','--evil':'#000000'}},'*'));
   await page.waitForTimeout(60);
   assert.equal(await frame.evaluate(()=>document.documentElement.style.getPropertyValue('--u-accent')),accent);
   assert.equal(await frame.evaluate(()=>document.documentElement.style.getPropertyValue('--evil')),'');
   if(width===1600){
    await frame.locator('#btnAddPick').click();
    assert.equal(await frame.locator('.node').count(),4);
    await page.locator('[data-target="designInput"]').click();assert.deepEqual(await capture(page),original);
    await page.locator('[data-target="parametricModelingSection"]').click();
    assert.equal(await frame.locator('.node').count(),4,'Tab switch reset model');
    await frame.locator('.node').last().locator('.node-del').click();
    assert.equal(await frame.locator('.node').count(),3);
    await frame.locator('#btnClearWires').click();
    assert.equal(await frame.locator('path.wire').count(),0);
    assert.match(await frame.locator('#vp3dMsg').textContent(),/缺失输入/);
    for(let i=0;i<2;i++){
     const output=await frame.locator('.node:has(.pick-btn) .port.output').nth(i).boundingBox();
     const input=await frame.locator('.port.input').nth(i).boundingBox();
     await page.mouse.move(output.x+output.width/2,output.y+output.height/2);await page.mouse.down();
     await page.mouse.move(input.x+input.width/2,input.y+input.height/2,{steps:8});await page.mouse.up();
    }
    assert.equal(await frame.locator('path.wire').count(),2,'Wire drag failed');
    assert(await frame.locator('.node-status.ok').isVisible());
    await frame.locator('#btnResetView').click();
    const box=await frame.locator('#vp2d').boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    const length=frame.locator('.prop-row').filter({has:frame.locator('label',{hasText:'长度'})}).locator('input[type="number"]');
    await length.waitFor();
    const oldImage=await frame.evaluate(()=>document.getElementById('vp3d').toDataURL());
    await length.fill('200');await length.dispatchEvent('input');
    const newImage=await frame.evaluate(()=>document.getElementById('vp3d').toDataURL());
    assert.notEqual(newImage,oldImage,'Parameter change did not update model');
    await frame.locator('#btnHelp').click();assert(await frame.locator('#helpOverlay').isVisible());
    await frame.locator('#btnCloseHelp').click();
   }
   await page.screenshot({path:path.join(out,mode+'-'+width+'.png')});
   await page.locator('[data-target="designInput"]').click();assert.deepEqual(await capture(page),original);
   assert.deepEqual(errors,[]);
   results.push({mode,width,passed:true});console.log('PASS',mode,width);
   await ctx.close();
  }
  // 独立页面可直接双击，不依赖宿主消息启动。
  const page=await browser.newPage();await page.goto(pathToFileURL(path.join(root,'modeling/parametric/index.html')).href);
  await page.waitForSelector('.node-status.ok');assert.equal(await page.locator('.node').count(),3);await page.close();
  results.push({mode:'standalone-file',passed:true});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;server.closeAllConnections();server.close();});
