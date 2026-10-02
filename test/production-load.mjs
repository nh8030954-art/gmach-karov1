const base=process.env.PRODUCTION_URL||"https://gmach-berega.co.il";
if(!/^https:\/\/gmach-berega\.co\.il\/?$/.test(base))throw new Error("Refusing to load-test a non-production target");
const levels=[10,25,50],routes=["/api/health","/api/categories","/api/items?limit=12","/api/discovery?q=chair"];
for(const concurrency of levels){
  const results=[];
  await Promise.all(Array.from({length:concurrency},async(_,i)=>{
    for(let n=0;n<4;n++){
      const route=routes[(i+n)%routes.length],started=Date.now();
      try{const r=await fetch(base+route,{headers:{"User-Agent":"gmach-production-readonly-load/1.0"},signal:AbortSignal.timeout(10000)});await r.arrayBuffer();results.push({ok:r.ok,status:r.status,ms:Date.now()-started,route});}
      catch(e){results.push({ok:false,status:0,ms:Date.now()-started,route});}
    }
  }));
  const ok=results.filter(x=>x.ok).length,sorted=results.map(x=>x.ms).sort((a,b)=>a-b),p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0,rate=ok/results.length;
  console.log(JSON.stringify({target:"production",concurrency,total:results.length,successRate:rate,p95Ms:p95}));
  if(rate<.98)throw new Error("Production read-only load success rate below 98% at concurrency "+concurrency);
  if(p95>8000)throw new Error("Production p95 exceeded 8s at concurrency "+concurrency);
}