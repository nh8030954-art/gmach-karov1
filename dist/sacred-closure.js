(function(){
  "use strict";
  const TZ="Asia/Jerusalem",LAT=31.778,LNG=35.235;

  function israelParts(date){
    const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    return p;
  }
  function utcForLocal(y,m,d,hour,minute){
    let guess=Date.UTC(y,m-1,d,hour,minute);
    const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
    for(let i=0;i<3;i++){
      const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
      const shown=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
      guess+=Date.UTC(y,m-1,d,hour,minute)-shown;
    }
    return new Date(guess);
  }
  function shabbatTimesForFriday(y,m,d){
    const date=new Date(Date.UTC(y,m-1,d)),jan1=new Date(Date.UTC(y,0,1)),n=Math.floor((date-jan1)/86400000)+1;
    const gamma=2*Math.PI/365*(n-1),eq=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
    const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
    const lat=LAT*Math.PI/180,ha=Math.acos(Math.cos(90.833*Math.PI/180)/(Math.cos(lat)*Math.cos(decl))-Math.tan(lat)*Math.tan(decl))*180/Math.PI;
    const sunsetMinutes=720-4*(LNG-ha)-eq;
    const noon=utcForLocal(y,m,d,12,0),noonParts=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(noon);
    const offsetMinutes=(noon.getTime()-Date.UTC(y,m-1,d,12,0))/-60000;
    const closeLocal=sunsetMinutes+offsetMinutes-20;
    const close=utcForLocal(y,m,d,Math.floor(closeLocal/60),Math.round(closeLocal%60));
    const sat=new Date(Date.UTC(y,m-1,d+1)),sp=israelParts(sat);
    const satN=Math.floor((sat-jan1)/86400000)+1,g2=2*Math.PI/365*(satN-1),eq2=229.18*(0.000075+0.001868*Math.cos(g2)-0.032077*Math.sin(g2)-0.014615*Math.cos(2*g2)-0.040849*Math.sin(2*g2));
    const dec2=0.006918-0.399912*Math.cos(g2)+0.070257*Math.sin(g2)-0.006758*Math.cos(2*g2)+0.000907*Math.sin(2*g2)-0.002697*Math.cos(3*g2)+0.00148*Math.sin(3*g2);
    const ha2=Math.acos(Math.cos(98.5*Math.PI/180)/(Math.cos(lat)*Math.cos(dec2))-Math.tan(lat)*Math.tan(dec2))*180/Math.PI;
    const nightMinutes=720-4*(LNG-ha2)-eq2+offsetMinutes;
    const open=utcForLocal(Number(sp.year),Number(sp.month),Number(sp.day),Math.floor(nightMinutes/60),Math.round(nightMinutes%60));
    return {close,open};
  }
  function shabbatState(now){
    const p=israelParts(now),y=Number(p.year),m=Number(p.month),d=Number(p.day);
    const dayIndex={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday];
    let friday=new Date(Date.UTC(y,m-1,d+(5-dayIndex)));
    if(dayIndex===6)friday=new Date(Date.UTC(y,m-1,d-1));
    const fp=israelParts(friday),times=shabbatTimesForFriday(Number(fp.year),Number(fp.month),Number(fp.day));
    return now>=times.close&&now<times.open?{closed:true,type:"shabbat",reopensAt:times.open.toISOString()}:{closed:false};
  }
  const HOLIDAYS=[
    {month:"Tishri",day:1,duration:2,title:"ראש השנה"},
    {month:"Tishri",day:10,duration:1,title:"יום הכיפורים"},
    {month:"Tishri",day:15,duration:1,title:"חג הסוכות"},
    {month:"Tishri",day:22,duration:1,title:"שמיני עצרת ושמחת תורה"},
    {month:"Nisan",day:15,duration:1,title:"חג הפסח"},
    {month:"Nisan",day:21,duration:1,title:"שביעי של פסח"},
    {month:"Sivan",day:6,duration:1,title:"חג השבועות"}
  ];
  function hebrewParts(date){
    return Object.fromEntries(new Intl.DateTimeFormat("en-u-ca-hebrew",{timeZone:TZ,year:"numeric",month:"long",day:"numeric"}).formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  }
  function holidayState(now){
    const today=israelParts(now),localNoon=utcForLocal(Number(today.year),Number(today.month),Number(today.day),12,0);
    for(let offset=-8;offset<=1;offset++){
      const candidate=new Date(localNoon.getTime()+offset*86400000),hp=hebrewParts(candidate);
      for(const holiday of HOLIDAYS){
        if(hp.month!==holiday.month||Number(hp.day)!==holiday.day)continue;
        const start=israelParts(candidate),eve=new Date(Date.UTC(Number(start.year),Number(start.month)-1,Number(start.day)-1)),ep=israelParts(eve);
        const times=shabbatTimesForFriday(Number(ep.year),Number(ep.month),Number(ep.day));
        let reopens=times.open;
        if(holiday.duration>1){
          const lastEve=new Date(eve.getTime()+(holiday.duration-1)*86400000),lp=israelParts(lastEve);
          reopens=shabbatTimesForFriday(Number(lp.year),Number(lp.month),Number(lp.day)).open;
        }
        if(now>=times.close&&now<reopens)return {closed:true,type:"holiday",title:holiday.title,reopensAt:reopens.toISOString()};
      }
    }
    return {closed:false};
  }
  try{
    const now=new Date(),s=shabbatState(now),h=holidayState(now);
    let state=null;
    if(s.closed&&h.closed){
      state={type:"both",title:h.title,reopensAt:new Date(Math.max(Date.parse(s.reopensAt),Date.parse(h.reopensAt))).toISOString()};
    }else state=s.closed?s:h.closed?h:null;
    if(!state)return;
    const u=new URL("/sacred-closed.html",location.origin);
    u.searchParams.set("type",state.type);
    if(state.title)u.searchParams.set("title",state.title);
    u.searchParams.set("reopens",state.reopensAt);
    location.replace(u.toString());
  }catch(e){console.warn("Sacred closure check failed",e);}
})();