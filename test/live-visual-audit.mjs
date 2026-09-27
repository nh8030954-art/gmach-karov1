import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT="visual-audit";
const PROD="https://gmach-karov1.nh8030954.workers.dev";
const QA=process.env.QA_URL || "https://gmach-karov1-qa.nh8030954.workers.dev";
await mkdir(OUT,{recursive:true});

const devices = {
  desktop: { viewport:{width:1440,height:1000}, deviceScaleFactor:1, isMobile:false, hasTouch:false },
  mobile: { viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true }
};
const report=[];

function safeName(s){return s.replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"").toLowerCase()}

async function auditPage(browser,{target,base,device,lang,route,label,auth=false,afterLoad}){
  const ctx=await browser.newContext({...devices[device],locale:lang==="en"?"en-US":"he-IL"});
  await ctx.addInitScript(({lang})=>{try{localStorage.setItem("gmach-language",lang)}catch{}},{lang});
  if(auth){
    await ctx.addCookies([{
      name:"gmach_session",
      value:"qa-demo-session-001-activity-v1",
      domain:"gmach-karov1-qa.nh8030954.workers.dev",
      path:"/",
      httpOnly:true,
      secure:true,
      sameSite:"Lax"
    }]);
  }
  const page=await ctx.newPage();
  const consoleErrors=[], pageErrors=[], requestFailures=[];
  page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text())});
  page.on("pageerror",e=>pageErrors.push(String(e)));
  page.on("requestfailed",r=>requestFailures.push({url:r.url(),error:r.failure()?.errorText||"failed"}));
  const url=base+"/"+(route.startsWith("#")?route:"#/"+route);
  let status=null;
  try{
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
    status=response?.status()||null;
    await page.waitForTimeout(1800);
    if(afterLoad) await afterLoad(page);
    await page.waitForTimeout(500);
    const diag=await page.evaluate(()=>{
      const visible=el=>{
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
      };
      const controls=[...document.querySelectorAll("button,a,input,select,textarea,[role=button]")].filter(visible);
      const offscreen=controls.filter(el=>{
        const r=el.getBoundingClientRect();
        return r.right>innerWidth+3||r.left<-3;
      }).slice(0,30).map(el=>({tag:el.tagName,id:el.id||null,text:(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,80),rect:{x:Math.round(el.getBoundingClientRect().x),w:Math.round(el.getBoundingClientRect().width)}}));
      const brokenImages=[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>({src:i.currentSrc||i.src,alt:i.alt})).slice(0,30);
      const tiny=controls.filter(el=>{
        const r=el.getBoundingClientRect();
        return (r.width<32||r.height<32) && !el.closest(".desktop-nav");
      }).slice(0,30).map(el=>({tag:el.tagName,id:el.id||null,text:(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,60),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}));
      const dialogs=[...document.querySelectorAll("dialog")].filter(d=>d.open).map(d=>d.id||"(unnamed)");
      return {
        title:document.title,
        lang:document.documentElement.lang,
        dir:document.documentElement.dir,
        viewport:{width:innerWidth,height:innerHeight},
        document:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
        horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
        brokenImages,
        offscreenControls:offscreen,
        smallControls:tiny,
        openDialogs:dialogs,
        bodyTextLength:(document.body?.innerText||"").trim().length
      };
    });
    const name=safeName([target,device,lang,label].join("-"));
    const screenshot=path.join(OUT,name+".png");
    await page.screenshot({path:screenshot,fullPage:true});
    report.push({target,device,lang,label,url,status,screenshot,diag,consoleErrors,pageErrors,requestFailures});
  }catch(error){
    report.push({target,device,lang,label,url,status,error:String(error),consoleErrors,pageErrors,requestFailures});
  }finally{
    await ctx.close();
  }
}

const browser=await chromium.launch({headless:true});
try{
  for(const device of ["desktop","mobile"]){
    for(const lang of ["he","en"]){
      await auditPage(browser,{target:"production",base:PROD,device,lang,route:"#/",label:"home"});
      await auditPage(browser,{target:"production",base:PROD,device,lang,route:"#/catalog",label:"catalog"});
      await auditPage(browser,{target:"production",base:PROD,device,lang,route:"#/community",label:"community"});
      await auditPage(browser,{target:"production",base:PROD,device,lang,route:"#/",label:"auth-dialog",afterLoad:async page=>{
        const b=page.locator("#dashboard-button");
        if(await b.count()) await b.click();
      }});
      if(device==="mobile"){
        await auditPage(browser,{target:"production",base:PROD,device,lang,route:"#/",label:"mobile-menu",afterLoad:async page=>{
          const b=page.locator("#mobile-menu-button");
          if(await b.count()) await b.click();
        }});
      }
    }
  }

  for(const device of ["desktop","mobile"]){
    for(const lang of ["he","en"]){
      await auditPage(browser,{target:"qa",base:QA,device,lang,route:"#/dashboard",label:"dashboard",auth:true});
      await auditPage(browser,{target:"qa",base:QA,device,lang,route:"#/dashboard",label:"notifications",auth:true,afterLoad:async page=>{
        const b=page.locator("#notifications-button");
        if(await b.count() && await b.isVisible()) await b.click();
      }});
      await auditPage(browser,{target:"qa",base:QA,device,lang,route:"#/dashboard",label:"add-item-dialog",auth:true,afterLoad:async page=>{
        const b=page.locator("#add-item-button");
        if(await b.count() && await b.isVisible()) await b.click();
      }});
    }
  }

  for(const lang of ["he","en"]){
    await auditPage(browser,{target:"production",base:PROD,device:"desktop",lang,route:"#/",label:"accessibility-dialog",afterLoad:async page=>{
      const b=page.locator("#accessibility-button");
      if(await b.count()) await b.click();
    }});
  }
} finally {
  await browser.close();
}

await writeFile(path.join(OUT,"report.json"),JSON.stringify(report,null,2));
const summary=report.map(x=>({
  target:x.target,device:x.device,lang:x.lang,label:x.label,status:x.status,error:x.error||null,
  overflow:x.diag?.horizontalOverflow??null,brokenImages:x.diag?.brokenImages?.length??null,
  offscreen:x.diag?.offscreenControls?.length??null,smallControls:x.diag?.smallControls?.length??null,
  consoleErrors:x.consoleErrors?.length||0,pageErrors:x.pageErrors?.length||0,requestFailures:x.requestFailures?.length||0,
  title:x.diag?.title||null,dir:x.diag?.dir||null,htmlLang:x.diag?.lang||null
}));
console.log(JSON.stringify(summary,null,2));
if(report.some(x=>x.error)) process.exitCode=1;
