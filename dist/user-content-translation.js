(() => {
  'use strict';
  const selector = 'body';
  const NEVER_TRANSLATE = '.organization-name,#organization-title';
  const ATTRIBUTES = ['alt','title','aria-label','placeholder','value'];
  const cache = new Map();
  const CACHE_KEY = 'gmach-user-content-en-v3';
  let timer = 0, busy = false, retryMs = 700;
  const dirtyRoots=new Set(),attempts=new Map();
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
    const entries=[];const roots=[...dirtyRoots];dirtyRoots.clear();if(!roots.length)return entries;
    function add(node,name) {
      const el=name?node:node.parentElement;
      if(name==='value'&&!el.matches('input[type=button],input[type=submit]'))return;
      const raw=name?el.getAttribute(name):node.nodeValue;
      if(!raw||!/[\u0590-\u05ff]/.test(raw)||blocked(el,!!name)||!visible(el))return;
      const value=raw.trim();
      if(!name&&el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',value);
      // UI phrases use reviewed translations; AI is reserved for remaining content.
      const reviewed=window.GmachTranslate?.(value)||value;
      const local=/[\u0590-\u05ff]/.test(reviewed)?value:reviewed;
      if(local!==value) {
        if(name)node.setAttribute(name,raw.replace(value,local));
        else {if(el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',value);node.nodeValue=raw.replace(value,local)}
      }
      if(local.length>=2&&/[\u0590-\u05ff]/.test(local)&&(attempts.get(local)||0)<3)entries.push({node,name,source:local,parts:chunks(local)});
    }
    const seenNodes=new Set();
    for(const root of roots){
      if(!root?.isConnected)continue;
      if(root.nodeType===Node.TEXT_NODE){if(!seenNodes.has(root)){add(root);seenNodes.add(root)}continue}
      if(root.nodeType!==Node.ELEMENT_NODE)continue;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode()))if(!seenNodes.has(node)){add(node);seenNodes.add(node)}
      const elements=[...(root.matches?.('img[alt],[title],[aria-label],input[placeholder],textarea[placeholder],input[type=button],input[type=submit]')?[root]:[]),...root.querySelectorAll('img[alt],[title],[aria-label],input[placeholder],textarea[placeholder],input[type=button],input[type=submit]')];
      for(const el of elements)for(const name of ATTRIBUTES)if(el.hasAttribute(name))add(el,name);
    }
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
      if(pending.length>=4||length+part.length>4500)continue;
      pending.push(part);seen.add(part);length+=part.length;
    }
    busy=true;
    try {
      if(pending.length) {
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
        let response;try{response=await fetch('/api/translate/user-content',{
          method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:pending.slice(0,12)})
        })}finally{clearTimeout(timeout)}
        if(!response.ok)throw new Error('Translation unavailable');
        const {translations}=await response.json();
        if(!Array.isArray(translations)||translations.length!==pending.length)throw new Error('Invalid translation');
        translations.forEach((value,index)=>{
          if(typeof value==='string'&&value.trim()&&!/[\u0590-\u05ff]/.test(value))cache.set(pending[index],value.trim());
        });
        if(pending.some(part=>!cache.has(part)))throw new Error('Incomplete translation');
        try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries([...cache].slice(-400))))}catch{}
      }
      apply(entries);retryMs=700;
    }catch{
      for(const entry of entries)if(entry.parts.some(part=>pending.includes(part)))attempts.set(entry.source,(attempts.get(entry.source)||0)+1);
      retryMs=Math.min(15000,Math.round(retryMs*1.6));
    }
    finally{
      busy=false;
      for(const entry of entries){const current=entry.name?entry.node.getAttribute(entry.name):entry.node.nodeValue;
        if(entry.node.isConnected&&current?.trim()===entry.source&&/[\u0590-\u05ff]/.test(current)&&(attempts.get(entry.source)||0)<3)dirtyRoots.add(entry.node);
      }
      if(english()&&dirtyRoots.size)schedule(retryMs);
    }
  }
  function schedule(delay=180){if(!timer)timer=setTimeout(()=>{
    timer=0;
    if(window.requestIdleCallback)requestIdleCallback(()=>translate(),{timeout:1000});else setTimeout(translate,0);
  },delay)}
  function start(){
    dirtyRoots.add(document.body);
    new MutationObserver(changes=>{
      if(!english()){dirtyRoots.clear();return}
      for(const change of changes){
        if(change.type==='childList')for(const node of change.addedNodes)dirtyRoots.add(node);
        else dirtyRoots.add(change.target);
      }
      if(dirtyRoots.size)schedule();
    }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','title','aria-label','placeholder','value','hidden','open']});
    window.addEventListener('gmach-language-change',()=>{dirtyRoots.add(document.body);schedule()});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
