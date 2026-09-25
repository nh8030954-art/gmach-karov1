const base=process.env.QA_URL;
if(!base||!/gmach-karov1-qa/.test(base)) throw new Error("QA_URL must point to the QA Worker");
const levels=[10,25,50,100];
for(const concurrency of levels){
  const started=Date.now(),results=[];
  await Promise.all(Array.from({length:concurrency},async(_,i)=>{
    for(let n=0;n<5;n++){
      const t=Date.now();
      try{
        const r=await fetch(base+"/api/health",{headers:{"User-Agent":"gmach-qa-load/1.0"}});
        results.push({ok:r.ok,status:r.status,ms:Date.now()-t});
      }catch(e){results.push({ok:false,status:0,ms:Date.now()-t})}
    }
  }));
  const ok=results.filter(x=>x.ok).length,total=results.length,sorted=results.map(x=>x.ms).sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0;
  console.log(JSON.stringify({concurrency,total,ok,successRate:ok/total,p95Ms:p95,durationMs:Date.now()-started}));
  if(ok/total<.98) throw new Error("QA success rate below 98% at concurrency "+concurrency);
}
