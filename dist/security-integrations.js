(() => {
  "use strict";
  let registerToken="",supportToken="",siteKey="";
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const url=typeof input==="string"?input:input?.url||"";
    if((url.includes("/api/auth/register")||url.includes("/api/support")) && init?.body && typeof init.body==="string"){
      try{
        const body=JSON.parse(init.body);
        if(url.includes("/api/auth/register")&&registerToken) body.turnstileToken=registerToken;
        if(url.includes("/api/support")&&supportToken) body.turnstileToken=supportToken;
        init={...init,body:JSON.stringify(body)};
      }catch{}
    }
    return originalFetch(input,init);
  };
  function loadTurnstile(){
    return new Promise((resolve,reject)=>{
      if(window.turnstile)return resolve(window.turnstile);
      const existing=document.querySelector('script[data-gmach-turnstile]');
      if(existing){existing.addEventListener("load",()=>resolve(window.turnstile),{once:true});existing.addEventListener("error",reject,{once:true});return}
      const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.async=true;s.defer=true;s.dataset.gmachTurnstile="1";s.onload=()=>resolve(window.turnstile);s.onerror=reject;document.head.appendChild(s);
    });
  }
  async function install(){
    try{
      const res=await originalFetch("/api/public-config",{credentials:"same-origin"}),cfg=await res.json();
      siteKey=cfg.turnstileSiteKey||"";if(!siteKey)return;
      const ts=await loadTurnstile();if(!ts)return;
      const authForm=document.getElementById("auth-form");
      if(authForm&&!document.getElementById("auth-turnstile")){
        const wrap=document.createElement("div");wrap.id="auth-turnstile";wrap.className="auth-register-field";wrap.hidden=true;wrap.setAttribute("aria-label","אימות אנושי");authForm.insertBefore(wrap,document.getElementById("auth-submit")||authForm.lastElementChild);
        ts.render(wrap,{sitekey:siteKey,language:"he",theme:"auto",callback:t=>registerToken=t,"expired-callback":()=>registerToken="","error-callback":()=>registerToken=""});
        const modeButtons=[...document.querySelectorAll("[data-auth-mode]")];
        const sync=()=>{const selected=modeButtons.find(b=>b.getAttribute("aria-selected")==="true")?.dataset.authMode;wrap.hidden=selected!=="register"};
        modeButtons.forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));sync();
      }
      const supportForm=document.getElementById("support-form");
      if(supportForm&&!document.getElementById("support-turnstile")){
        const wrap=document.createElement("div");wrap.id="support-turnstile";wrap.setAttribute("aria-label","אימות אנושי");supportForm.insertBefore(wrap,document.getElementById("support-submit")||supportForm.lastElementChild);
        ts.render(wrap,{sitekey:siteKey,language:"he",theme:"auto",callback:t=>supportToken=t,"expired-callback":()=>supportToken="","error-callback":()=>supportToken=""});
      }
    }catch(error){console.warn("Turnstile integration unavailable",error)}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();