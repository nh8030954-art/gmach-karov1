(() => {
  'use strict';
  let started = false;
  const selector = 'body';
  const NEVER_TRANSLATE = '.organization-name,[translate="no"],[data-no-translate],#organization-title,[data-recent-org] strong,[data-owned-org] h3,.organization-switch .organization-name,.gmach-owner .organization-name';
  const cache = new Map(), ignored = new WeakSet();
  let timer = 0, busy = false, requests = 0;
  function candidates() {
    const nodes = [],seen=new Set();
    const root=document.body;if(!root)return nodes;
    const add=node=>{
      const parent=node?.parentElement,value=node?.nodeValue?.trim()||'';
      if(!parent||seen.has(node)||!parent.getClientRects().length||parent.closest(NEVER_TRANSLATE)||parent.closest('script,style,noscript,textarea,code,pre'))return;
      if(!ignored.has(node)&&/[\u0590-\u05ff]/.test(value)&&value.length>=2&&value.length<=500){nodes.push({node,value});seen.add(node)}
    };
    root.querySelectorAll('[data-user-content-priority]').forEach(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){add(n);if(nodes.length>=12)return}});
    if(nodes.length<12){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){add(node);if(nodes.length>=12)break;}}
    return nodes;
  }
  async function translate() {
    if (busy || requests >= 180) return;
    const group = candidates();
    if (!group.length) return;
    busy = true;
    try {
      const pending = group.filter(({ value }) => !cache.has(value)).slice(0,12);
      if (pending.length) {
        requests++;
        const response = await fetch('/api/translate/user-content', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: pending.map(({ value }) => value) })
        });
        if (!response.ok) throw new Error('Translation unavailable');
        const result = await response.json();
        if (!Array.isArray(result.translations) || result.translations.length !== pending.length) throw new Error('Invalid translation');
        pending.forEach(({ value }, index) => cache.set(value, result.translations[index]));
      }
      for (const { node, value } of group) {
        ignored.add(node);
        if (node.isConnected && cache.get(value)) node.nodeValue = node.nodeValue.replace(value, cache.get(value));
      }
    } catch {
      // Keep the author's original words visible when translation is unavailable.
      if (requests < 180) setTimeout(schedule, 1800);
    } finally {
      busy = false;
      if (requests < 180 && candidates().length) schedule();
    }
  }
  function schedule() { if (!timer) timer = setTimeout(() => { timer = 0; translate(); }, 450); }
  function start() {
    if (started || document.documentElement.lang !== 'en') return;
    started = true;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  window.addEventListener('gmach-language-change', start);
  start();
})();
