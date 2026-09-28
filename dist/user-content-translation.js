(() => {
  'use strict';
  let started = false;
  const selector = '.item-detail-description,#item-dialog-title,.item-card h3,.item-card p,.organization-hero h2,.organization-hero>p,.organization-card h3,.organization-card p,.review-list blockquote p,.chat-message p,.community-board-card>h3,.community-board-card>p';
  const cache = new Map(), ignored = new WeakSet();
  let timer = 0, busy = false, requests = 0;
  function candidates() {
    const nodes = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!element.getClientRects().length) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue?.trim() || '';
        if (!ignored.has(node) && /[\u0590-\u05ff]/.test(value) && value.length >= 2 && value.length <= 500) nodes.push({ node, value });
      }
    }
    return nodes.slice(0, 12);
  }
  async function translate() {
    if (busy || requests >= 20) return;
    const group = candidates();
    if (!group.length) return;
    busy = true;
    try {
      const pending = group.filter(({ value }) => !cache.has(value));
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
      group.forEach(({ node }) => ignored.add(node));
    } finally {
      busy = false;
      if (requests < 20 && candidates().length) schedule();
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
