(() => {
  'use strict';
  let started = false;
  const selector = 'body';
  // In English mode the only visible content intentionally preserved in its
  // original language is the gmach name itself.
  const NEVER_TRANSLATE = '.organization-name,#organization-title,[data-recent-org] strong,[data-owned-org] h3,.organization-switch .organization-name,.gmach-owner .organization-name';
  const cache = new Map(), ignored = new WeakSet();
  const CACHE_KEY='gmach-user-content-en-v2';
  let timer = 0, busy = false, requests = 0, retryMs = 700;
  try {
    const saved=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'{}');
    for(const [k,v] of Object.entries(saved)) if(typeof k==='string'&&typeof v==='string') cache.set(k,v);
  } catch {}
  function persistCache(){
    try{
      const entries=[...cache.entries()].slice(-400);
      sessionStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
    }catch{}
  }
  function isVisible(el){return !!el?.getClientRects?.().length}
  function blocked(el){return !el||el.closest(NEVER_TRANSLATE)||el.closest('script,style,noscript,textarea,code,pre')}
  function candidates() {
    const nodes = [],seen=new Set();
    const root=document.body;if(!root)return nodes;
    const add=node=>{
      const parent=node?.parentElement,value=node?.nodeValue?.trim()||'';
      if(!parent||seen.has(node)||!isVisible(parent)||blocked(parent))return;
      if(!ignored.has(node)&&/[\u0590-\u05ff]/.test(value)&&value.length>=2&&value.length<=500){nodes.push({kind:'text',node,value});seen.add(node)}
    };
    const addAttr=(el,name)=>{
      if(!el||blocked(el)||!isVisible(el))return;
      const value=String(el.getAttribute(name)||'').trim(),key='@'+name+':'+value;
      if(!/[\u0590-\u05ff]/.test(value)||value.length<2||value.length>500||seen.has(key))return;
      nodes.push({kind:'attr',node:el,name,value,key});seen.add(key);
    };
    root.querySelectorAll('[data-user-content-priority]').forEach(el=>{
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
      while((n=w.nextNode())){add(n);if(nodes.length>=12)return}
    });
    if(nodes.length<12){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode())){add(node);if(nodes.length>=12)break}
    }
    if(nodes.length<12){
      root.querySelectorAll('img[alt],[title],[aria-label],input[placeholder],textarea[placeholder]').forEach(el=>{
        for(const name of ['alt','title','aria-label','placeholder']){
          if(el.hasAttribute(name))addAttr(el,name);
          if(nodes.length>=12)return;
        }
      });
    }
    return nodes.slice(0,12);
  }
  function apply(group){
    for(const entry of group){
      const translated=cache.get(entry.value);if(!translated)continue;
      if(entry.kind==='text'){
        ignored.add(entry.node);
        if(entry.node.isConnected)entry.node.nodeValue=entry.node.nodeValue.replace(entry.value,translated);
      }else if(entry.node?.isConnected){
        entry.node.setAttribute(entry.name,translated);
      }
    }
  }
  async function translate() {
    if (busy || requests >= 240 || document.documentElement.lang !== 'en') return;
    const group = candidates();
    if (!group.length) return;
    busy = true;
    try {
      const pending = [];
      const values = new Set();
      for(const entry of group){
        if(!cache.has(entry.value)&&!values.has(entry.value)){pending.push(entry);values.add(entry.value)}
      }
      if (pending.length) {
        requests++;
        const response = await fetch('/api/translate/user-content', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: pending.slice(0,12).map(({ value }) => value) })
        });
        if (!response.ok) throw new Error('Translation unavailable');
        const result = await response.json();
        if (!Array.isArray(result.translations) || result.translations.length !== Math.min(pending.length,12)) throw new Error('Invalid translation');
        pending.slice(0,12).forEach(({ value }, index) => {
          const translated=String(result.translations[index]||'').trim();
          if(translated)cache.set(value,translated);
        });
        persistCache();
      }
      apply(group);
      retryMs=700;
    } catch {
      retryMs=Math.min(5000,Math.round(retryMs*1.6));
    } finally {
      busy = false;
      if (requests < 240 && candidates().length) setTimeout(schedule,retryMs);
    }
  }
  function schedule() { if (!timer) timer = setTimeout(() => { timer = 0; translate(); }, 180); }
  function start() {
    if (started || document.documentElement.lang !== 'en') return;
    started = true;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData:true });
    schedule();
  }
  window.addEventListener('gmach-language-change', () => {
    if(document.documentElement.lang==='en'){start();schedule()}
  });
  start();
})();