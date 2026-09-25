const base=process.env.QA_URL;
if(!base||!/gmach-karov1-qa/.test(base)) throw new Error("QA_URL must point to the QA Worker");
const levels=[10,25,50,100];
const routes=["/api/health","/api/categories","/api/items?limit=20","/api/items?q=בדיקה&limit=20"];
for(const concurrency of levels){
  const started=Date.now(),results=[];
  await Promise.all(Array.from({length:concurrency},async(_,i)=>{
    for(let n=0;n<5;n++){
      const t=Date.now();
      try{
        const route=routes[(i+n)%routes.length];
        const r=await fetch(base+route,{headers:{"User-Agent":"gmach-qa-load/1.0"},signal:AbortSignal.timeout(10000)});
        const payload=await r.json();
        const valid=route==="/api/health"?payload.ok===true:route==="/api/categories"?Array.isArray(payload.categories):Array.isArray(payload.items);
        results.push({ok:r.ok&&valid,status:r.status,route,ms:Date.now()-t});
      }catch(e){results.push({ok:false,status:0,route:"unknown",ms:Date.now()-t})}
    }
  }));
  const ok=results.filter(x=>x.ok).length,total=results.length,sorted=results.map(x=>x.ms).sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0;
  const byRoute=Object.fromEntries(routes.map(route=>[route,{total:results.filter(x=>x.route===route).length,failed:results.filter(x=>x.route===route&&!x.ok).length}]));
  console.log(JSON.stringify({concurrency,total,ok,successRate:ok/total,p95Ms:p95,durationMs:Date.now()-started,byRoute}));
  if(ok/total<.98) throw new Error("QA success rate below 98% at concurrency "+concurrency);
}
