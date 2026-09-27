(()=>{'use strict';
  if(document.documentElement.lang!=='en')return;
  const selector='.item-detail-description,.organization-hero>p,.review-list blockquote p,.chat-message p,.community-board-card>h3,.community-board-card>p';
  const translated=new Map();
  const button=document.createElement('button');
  button.type='button';button.id='translate-user-content';button.className='button button-secondary';
  button.textContent='Translate user content';
  button.setAttribute('aria-label','Translate visible Hebrew descriptions, reviews, requests and messages into English');
  (document.querySelector('.site-actions,.header-actions,.top-actions,header nav')||document.body).append(button);
  const candidates=()=>[...document.querySelectorAll(selector)].filter(element=>element.getClientRects().length).flatMap(element=>{
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];let node;
    while(node=walker.nextNode()){
      const text=node.nodeValue?.trim()||'';
      if(/[\u0590-\u05ff]/.test(text)&&text.length>=8&&text.length<=500&&!translated.has(node))nodes.push({node,text});
    }
    return nodes;
  }).slice(0,48);
  button.onclick=async()=>{
    if(translated.size){for(const [node,original] of translated){if(node.isConnected)node.nodeValue=original}translated.clear();button.textContent='Translate user content';return}
    const nodes=candidates();if(!nodes.length){button.textContent='No Hebrew user content visible';setTimeout(()=>button.textContent='Translate user content',3000);return}
    button.disabled=true;button.textContent='Translating…';
    try{
      for(let i=0;i<nodes.length;i+=12){
        const group=nodes.slice(i,i+12),response=await fetch('/api/translate/user-content',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:group.map(entry=>entry.text)})});
        if(!response.ok)throw new Error('Translation is unavailable right now');
        const data=await response.json();if(!Array.isArray(data.translations)||data.translations.length!==group.length)throw new Error('Unexpected translation response');
        group.forEach((entry,index)=>{if(!entry.node.isConnected)return;const original=entry.node.nodeValue,translatedText=data.translations[index];if(typeof translatedText!=='string'||!translatedText.trim())return;translated.set(entry.node,original);entry.node.nodeValue=original.replace(entry.text,translatedText)});
      }
      button.textContent='Show original user content';
    }catch(error){for(const [node,original] of translated){if(node.isConnected)node.nodeValue=original}translated.clear();button.textContent=error.message;setTimeout(()=>button.textContent='Translate user content',4000)}
    finally{button.disabled=false}
  };
  const itemDialog=document.querySelector('#item-dialog');
  if(itemDialog){
    const attach=()=>{
      const description=itemDialog.querySelector('.item-detail-description');
      if(!description||itemDialog.querySelector('#translate-item-description'))return;
      const local=document.createElement('button');local.type='button';local.id='translate-item-description';local.className='button button-secondary';local.textContent='Translate item description';
      local.onclick=async()=>{await button.onclick();local.textContent=button.textContent};
      description.insertAdjacentElement('afterend',local);
    };
    new MutationObserver(attach).observe(itemDialog,{childList:true,subtree:true});
    attach();
  }
})();
