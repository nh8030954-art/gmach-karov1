(() => {
  'use strict';
  const selector = 'body';
  const NEVER_TRANSLATE = '.organization-name,#organization-title';
  const ATTRIBUTES = ['alt','title','aria-label','placeholder','value'];
  const cache = new Map();
  const CACHE_KEY = 'gmach-user-content-en-v3';
  let timer = 0, busy = false, retryMs = 700;
  try {
    for (const [key,value] of Object.entries(JSON.parse(sessionStorage.getItem(CACHE_KEY)||'{}')))
      if (typeof value === 'string' && !/[\u0590-\u05ff]/.test(value)) cache.set(key,value);
  } catch {}
  const english = () => document.documentElement.lang === 'en';
  const blocked = (el,attribute=false) => !el || el.closest(NEVER_TRANSLATE+',script,style,noscript,code,pre'+(attribute?'':',textarea'));
  function visible(el) {
    // Options have no individual layout box; their select does.
    const target = el?.tagName === 'OPTION' ? el.closest('select') : el;
    return !!target?.getClientRects().length;
  }
  function chunks(value) {
    const result=[];
    while(value.length>500) {
      let end=value.lastIndexOf(' ',499);
      if(end<250)end=500;else end++;
      result.push(value.slice(0,end));value=value.slice(end);
    }
    if(value)result.push(value);
    return result;
  }
  function candidates() {
    const entries=[];const root=document.body;if(!root)return entries;
    function add(node,name) {
      const el=name?node:node.parentElement;
      if(blocked(el,!!name)||!visible(el))return;
      if(name==='value'&&!el.matches('input[type=button],input[type=submit]'))return;
      const raw=name?el.getAttribute(name):node.nodeValue;
      if(!raw||!/[\u0590-\u05ff]/.test(raw))return;
      const value=raw.trim();
      if(!name&&el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',value);
      // UI phrases use reviewed translations; AI is reserved for remaining content.
      const reviewed=window.GmachTranslate?.(value)||value;
      const local=/[\u0590-\u05ff]/.test(reviewed)?value:reviewed;
      if(local!==value) {
        if(name)node.setAttribute(name,raw.replace(value,local));
        else {if(el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',value);node.nodeValue=raw.replace(value,local)}
      }
      if(/[\u0590-\u05ff]/.test(local))entries.push({node,name,source:local,parts:chunks(local)});
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))add(node);
    root.querySelectorAll('img[alt],[title],[aria-label],input[placeholder],textarea[placeholder],input[type=button],input[type=submit]').forEach(el=>{
      for(const name of ATTRIBUTES)if(el.hasAttribute(name))add(el,name);
    });
    return entries;
  }
  function apply(entries) {
    if(!english())return;
    for(const entry of entries) {
      const {node,name,source,parts}=entry;const el=name?node:node.parentElement;
      if(!node.isConnected||blocked(el,!!name)||parts.some(part=>/[\u0590-\u05ff]/.test(part)&&!cache.has(part)))continue;
      const current=name?node.getAttribute(name):node.nodeValue;
      // A later render/edit must never be overwritten by an old response.
      if(current?.trim()!==source)continue;
      const translated=parts.map(part=>cache.get(part)||part).join(' ');
      if(name)node.setAttribute(name,current.replace(source,translated));
      else node.nodeValue=current.replace(source,translated);
    }
  }
  async function translate() {
    if(busy||!english())return;
    const entries=candidates();if(!entries.length)return;
    const pending=[];let length=0;const seen=new Set();
    for(const entry of entries)for(const part of entry.parts) {
      if(!/[\u0590-\u05ff]/.test(part)||cache.has(part)||seen.has(part))continue;
      if(pending.length>=12||length+part.length>4500)continue;
      pending.push(part);seen.add(part);length+=part.length;
    }
    busy=true;
    try {
      if(pending.length) {
        const response=await fetch('/api/translate/user-content',{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:pending.slice(0,12)})
        });
        if(!response.ok)throw new Error('Translation unavailable');
        const {translations}=await response.json();
        if(!Array.isArray(translations)||translations.length!==pending.length)throw new Error('Invalid translation');
        translations.forEach((value,index)=>{
          if(typeof value==='string'&&value.trim()&&!/[\u0590-\u05ff]/.test(value))cache.set(pending[index],value.trim());
        });
        try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries([...cache].slice(-400))))}catch{}
      }
      apply(entries);retryMs=700;
    }catch{retryMs=Math.min(15000,Math.round(retryMs*1.6))}
    finally{busy=false;if(english()&&candidates().length)schedule(retryMs)}
  }
  function schedule(delay=180){if(!timer)timer=setTimeout(()=>{timer=0;translate()},delay)}
  function start(){
    new MutationObserver(()=>schedule()).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','title','aria-label','placeholder','value','hidden','class','style','open']});
    window.addEventListener('gmach-language-change',()=>schedule());
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
