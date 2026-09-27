import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT="visual-fast", BASE=process.env.TARGET_URL||"https://gmach-karov1.nh8030954.workers.dev";
await mkdir(OUT,{recursive:true});
const shots=[], browser=await chromium.launch({headless:true});
async function shot({name,lang="he",viewport={width:1440,height:1000},route="#/",fullPage=false,action}){
  console.log("START",name);
  const ctx=await browser.newContext({viewport,locale:lang==="en"?"en-US":"he-IL"});
  await ctx.addInitScript(l=>localStorage.setItem("gmach-language",l),lang);
  const p=await ctx.newPage(); p.setDefaultTimeout(3000);
  const errors=[]; p.on("console",m=>{if(m.type()==="error")errors.push(m.text())}); p.on("pageerror",e=>errors.push(String(e)));
  const response=await p.goto(BASE+"/"+route,{waitUntil:"domcontentloaded",timeout:20000});
  await p.waitForTimeout(1000);
  if(action) await action(p);
  await p.waitForTimeout(300);
  const diag=await p.evaluate(()=>({
    title:document.title,lang:document.documentElement.lang,dir:document.documentElement.dir,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    text:(document.body?.innerText||"").slice(0,3000),
    broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src),
    openDialogs:[...document.querySelectorAll("dialog")].filter(d=>d.open).map(d=>d.id),
    catalogCards:document.querySelectorAll(".item-card").length,
    visibleButtons:[...document.querySelectorAll("button")].filter(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"}).length
  }));
  await p.screenshot({path:OUT+"/"+name+".png",fullPage});
  shots.push({name,status:response?.status()||null,errors,diag});
  console.log("DONE",name,JSON.stringify({status:response?.status(),overflow:diag.overflow,broken:diag.broken.length,cards:diag.catalogCards,dialogs:diag.openDialogs,errors:errors.length}));
  await ctx.close();
}
try{
  await shot({name:"desktop-he-home-full",fullPage:true});
  await shot({name:"desktop-en-home-full",lang:"en",fullPage:true});
  await shot({name:"mobile-he-home-full",viewport:{width:390,height:844},fullPage:true});
  await shot({name:"mobile-en-home-full",lang:"en",viewport:{width:390,height:844},fullPage:true});
  await shot({name:"desktop-he-catalog",route:"#/catalog"});
  await shot({name:"desktop-en-catalog",lang:"en",route:"#/catalog"});
  await shot({name:"mobile-he-catalog",viewport:{width:390,height:844},route:"#/catalog"});
  await shot({name:"mobile-en-catalog",lang:"en",viewport:{width:390,height:844},route:"#/catalog"});
  await shot({name:"desktop-he-auth",action:async p=>{const b=p.locator("#dashboard-button");if(await b.isVisible())await b.click();}});
  await shot({name:"desktop-en-auth",lang:"en",action:async p=>{const b=p.locator("#dashboard-button");if(await b.isVisible())await b.click();}});
  await shot({name:"mobile-he-menu",viewport:{width:390,height:844},action:async p=>{const b=p.locator("#mobile-menu-button");if(await b.isVisible())await b.click();}});
  await shot({name:"mobile-en-menu",lang:"en",viewport:{width:390,height:844},action:async p=>{const b=p.locator("#mobile-menu-button");if(await b.isVisible())await b.click();}});
  await shot({name:"desktop-he-accessibility",action:async p=>{const b=p.locator("#accessibility-button");if(await b.isVisible())await b.click();}});
  await shot({name:"desktop-en-accessibility",lang:"en",action:async p=>{const b=p.locator("#accessibility-button");if(await b.isVisible())await b.click();}});
} finally { await browser.close(); }
await writeFile(OUT+"/report.json",JSON.stringify(shots,null,2));
