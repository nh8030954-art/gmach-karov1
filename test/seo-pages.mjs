import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {PUBLIC_PAGES,publicPageHtml,robotsResponse,notFoundResponse,publicClosureResponse} from '../worker/seo-pages.js';
const shell=await readFile('dist/index.html','utf8');
const closedShell=await readFile('dist/sacred-closed.html','utf8');
const source=await readFile('worker/index.js','utf8');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
assert.equal(config.assets.not_found_handling,'404-page');
for(const path of Object.keys(PUBLIC_PAGES)) {
  assert.ok(config.assets.run_worker_first.includes(path),'Public routes must run through the Worker');
  const html=publicPageHtml(shell,new URL('https://gmach-berega.co.il'+path+'?q=test'));
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('href="https://gmach-berega.co.il'+path+'"'));
  assert.ok(!html.includes('canonical" href="https://gmach-berega.co.il'+path+'?'));
  assert.ok(html.includes('<title>'+PUBLIC_PAGES[path][0]+'</title>'));
}
assert.equal((await robotsResponse('https://gmach-berega.co.il',true).text()),'');
assert.match(await robotsResponse('https://gmach-berega.co.il').text(),/Disallow: \/dashboard/);
assert.equal(notFoundResponse().status,404);
const begin=source.indexOf('export default {'), end=source.indexOf('\n};',begin);
let closed=true, assetCalls=0;
const context=vm.createContext({URL,Request,Response,Headers,Date,console,Intl,
 PUBLIC_PAGES,publicPageHtml,robotsResponse,notFoundResponse,publicClosureResponse,
 withSecurityHeaders:r=>r,deferNonessentialD1:()=>false,
 israelShabbatState:()=>({closed,reopensAt:'2026-10-17T17:00:00Z'}),
 israelHolidayState:()=>({closed:false}),activePlatformClosure:async()=>null,
 handleFinalFeatures:async()=>new Response('<urlset></urlset>',{headers:{'Content-Type':'application/xml'}}),
 shabbatClosedPage:()=>new Response('closed',{status:503,headers:{'Retry-After':'900'}}),
 serveSeoEntityPage:async()=>null});
vm.runInContext(source.slice(begin,end+3).replace('export default','globalThis.worker ='),context);
const env={ASSETS:{async fetch(request){assetCalls++;if(new URL(request.url).pathname==='/sacred-closed.html')return new Response(closedShell,{headers:{'Content-Type':'text/html'}});return new URL(request.url).pathname==='/'?new Response(shell,{headers:{'Content-Type':'text/html'}}):notFoundResponse()}},DB:{prepare(){throw Error('Database must not be used for robots or static pages')}}};
const fetch=path=>context.worker.fetch(new Request('https://gmach-berega.co.il'+path),env,{waitUntil(){}});
assert.equal((await fetch('/robots.txt')).status,200,'Robots must remain readable while the site is closed');
assert.equal((await fetch('/sitemap.xml')).status,200,'Sitemap must remain readable while the site is closed');
assert.equal(assetCalls,0);
const closedPage=await fetch('/');
assert.equal(closedPage.status,503,'The site must still close on Shabbat');
const closedHtml=await closedPage.text();assert.match(closedHtml,/האתר ישוב לפעילות בעזרת ה׳ במוצאי שבת/);assert.ok(!closedHtml.includes('noindex'),'A temporary closure must not request removal from the index');
closed=false;
assert.equal((await fetch('/not-a-real-page')).status,404);
assert.equal((await fetch('/index.html')).status,308);
assert.match((await fetch('/dashboard')).headers.get('X-Robots-Tag'),/noindex/);
assert.match((await fetch('/invite/test')).headers.get('X-Robots-Tag'),/noindex/);
assert.match(await (await fetch('/gmachim')).text(),/גמ״חים ברחבי הארץ \| גמ״ח ברגע/);
console.log('SEO routing, canonical URLs, private noindex and closure-safe discovery passed');
