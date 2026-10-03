(()=>{try{
  document.documentElement.style.setProperty("--site-font","Assistant, Arial, sans-serif");
  if("scrollRestoration" in history)history.scrollRestoration="manual";
  if((location.pathname||"/")==="/"&&!location.hash)scrollTo(0,0);
  if((location.pathname||"/")==="/dashboard")document.documentElement.classList.add("route-dashboard-boot");
  const root=document.documentElement;
  const raw=localStorage.getItem("gmach-site-settings-v1");
  if(raw){
    const s=JSON.parse(raw),color=v=>/^#[0-9a-f]{6}$/i.test(String(v||""));
    if(color(s.primary_color))root.style.setProperty("--navy",s.primary_color);
    if(color(s.secondary_color))root.style.setProperty("--teal",s.secondary_color);
    if(color(s.accent_color))root.style.setProperty("--accent",s.accent_color);
    if(s.cache_version===3&&typeof s.font_family==="string"&&s.font_family.length<120)root.style.setProperty("--site-font",s.font_family);
    const n=Number(s.base_font_size);if(Number.isFinite(n)&&n>=12&&n<=24)root.style.fontSize=n+"px";
  }
}catch{}})();
try {
  if (localStorage.getItem('gmach-language') === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
} catch { /* Storage can be disabled; Hebrew remains the safe default. */ }
