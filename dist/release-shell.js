(()=>{"use strict";
const tr=(he,en)=>(document.documentElement.lang==="en"||document.documentElement.dir==="ltr")?en:he;
let installPrompt=null;
function ensureBanner(){
 let b=document.getElementById("connection-status-banner");
 if(!b){b=document.createElement("div");b.id="connection-status-banner";b.hidden=true;b.setAttribute("role","status");b.setAttribute("aria-live","polite");b.style.cssText="position:fixed;z-index:100003;left:50%;bottom:12px;transform:translateX(-50%);padding:10px 14px;border-radius:999px;background:#173a4d;color:white;box-shadow:0 10px 24px #0003;font-weight:700";document.body.append(b)}
 return b;
}
function updateConnection(){
 const b=ensureBanner();
 if(navigator.onLine){if(!b.hidden){b.textContent=tr("החיבור חזר","Back online");setTimeout(()=>b.hidden=true,1800)}}else{b.textContent=tr("אין כרגע חיבור לאינטרנט. אפשר להמשיך לצפות בתוכן שכבר נטען.","You are offline. Previously loaded content remains available.");b.hidden=false}
}
function addInstallButton(){
 if(!installPrompt||document.querySelector("[data-install-app]"))return;
 const target=document.querySelector("#dashboard-view .dashboard-actions")||document.querySelector("header .header-actions")||document.body;
 const b=document.createElement("button");b.type="button";b.className="button button-secondary";b.dataset.installApp="1";b.textContent=tr("התקנת האפליקציה","Install app");
 b.onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice.catch(()=>null);installPrompt=null;b.remove()};
 target.prepend(b);
}
async function register(){
 if(!("serviceWorker" in navigator))return;
 try{
  const reg=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  reg.addEventListener("updatefound",()=>{const nw=reg.installing;if(!nw)return;nw.addEventListener("statechange",()=>{if(nw.state==="installed"&&navigator.serviceWorker.controller){const b=ensureBanner();b.hidden=false;b.innerHTML="";const span=document.createElement("span");span.textContent=tr("יש גרסה חדשה לאתר.","A new version is available.");const btn=document.createElement("button");btn.type="button";btn.textContent=tr("רענון","Reload");btn.style.cssText="margin-inline-start:10px;border:0;border-radius:999px;padding:5px 10px;cursor:pointer";btn.onclick=()=>location.reload();b.append(span,btn)}})});
 }catch{}
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;addInstallButton()});
window.addEventListener("appinstalled",()=>{installPrompt=null;document.querySelector("[data-install-app]")?.remove()});
window.addEventListener("online",updateConnection);window.addEventListener("offline",updateConnection);
async function revealSite(){
 const root=document.documentElement,cover=document.getElementById("site-boot-cover");
 const cssReady=()=>getComputedStyle(root).getPropertyValue("--gmach-css-ready").trim()==="1";
 const deadline=Date.now()+5000;
 while(!cssReady()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
 if(document.fonts?.load){try{await Promise.race([document.fonts.load("1em Assistant"),new Promise(r=>setTimeout(r,2500))])}catch{}}
 root.classList.remove("site-booting");
 if(cover)cover.hidden=true;
}
const init=()=>{updateConnection();register();const o=new MutationObserver(addInstallButton);o.observe(document.body,{childList:true,subtree:true});addInstallButton();revealSite()};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();