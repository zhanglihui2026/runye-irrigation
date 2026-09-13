// 独立浏览器上下文，测试数据不写入用户浏览器。
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let chromium;
try{({chromium}=require('playwright'));}catch(e){({chromium}=require('C:/Users/AHS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const text=fs.readFileSync(path.join(__dirname,'iso_diagram.test.cjs'),'utf8'),start=text.indexOf('function mkData'),fixture={};
vm.runInNewContext(text.slice(start,text.indexOf('console.log',start)),fixture);
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--headless=new']});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await page.route(/^https?:/,r=>r.abort());
    await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href,{waitUntil:'load'});
    await page.evaluate(data=>{window.tlDiagramData=data;ryJumpToSection('tlPipePlanSection');tlShowIsoDiagram();},fixture.mkData());
    await page.locator('[data-fit="V-B01"] [data-symbol="valve"]').click();
    const panel=page.locator('.iso-editor').first();
    await panel.locator('[name="spec"]').fill('dn90');
    await panel.locator('[name="size"]').fill('1.8');
    await panel.locator('[data-action="apply"]').click();
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('V-B01').spec),'dn90');
    await panel.locator('[name="spec"]').fill('dn75');
    await panel.locator('[data-action="cancel"]').click();
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('V-B01').spec),'dn90');
    await page.locator('[data-fit="V-B01"] [data-symbol="valve"]').click();
    await panel.locator('[data-action="riser"]').click();
    await panel.locator('[name="rise"]').fill('60');
    await panel.locator('[name="position"]').fill('0.7');
    await panel.locator('[data-action="apply"]').click();
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('R-V-B01').rise),60);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('R-V-B01').rise),28);
    await page.reload({waitUntil:'load'});
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('V-B01').spec),'dn90');
    await page.evaluate(()=>{ryJumpToSection('tlPipePlanSection');tlShowIsoDiagram();runyeSaveProject();});
    await page.evaluate(()=>{RyIsoDiagram.resetEdit('V-B01');runyeLoadProject();});
    assert.equal(await page.evaluate(()=>RyIsoDiagram.getParams('V-B01').spec),'dn90');
    await page.evaluate(()=>{ryJumpToSection('tlPipePlanSection');tlShowIsoDiagram();});
    await page.locator('[data-fit="V-B01"] [data-symbol="valve"]').click();
    if(process.env.ISO_SCREENSHOT)await page.screenshot({path:process.env.ISO_SCREENSHOT});
    assert.deepEqual(errors,[]);
    console.log('PASS browser: click/edit/apply/cancel/riser/undo/reload/project save-load, no page errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
