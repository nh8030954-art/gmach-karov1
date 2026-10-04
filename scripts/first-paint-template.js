(()=>{'use strict';
const dict=/* DICTIONARY */,cache=new Map();let phrases;
function text(value){if(!value||!/[\u0590-\u05ff]/.test(value))return value;if(dict[value])return dict[value];if(cache.has(value))return cache.get(value);phrases??=Object.entries(dict).filter(([he])=>he.length>2).sort((a,b)=>b[0].length-a[0].length);let out=value;for(const [he,en] of phrases){let pos=0;while((pos=out.indexOf(he,pos))!==-1){if(/[\u0590-\u05ff]/.test(out[pos-1]||'')||/[\u0590-\u05ff]/.test(out[pos+he.length]||'')){pos+=he.length;continue}out=out.slice(0,pos)+en+out.slice(pos+he.length);pos+=en.length}}if(cache.size>2000)cache.clear();cache.set(value,out);return out}
const en=()=>document.documentElement.lang==='en';
window.GmachOriginalName=value=>'<span data-original-name translate="no" dir="auto">'+String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</span>';
window.GmachTranslate=value=>en()?text(value):value;
const excluded='.organization-name,#organization-title,#dashboard-name,[data-original-name],[translate="no"],script,style,noscript,textarea,code,pre';
function node(n){const raw=n.nodeValue;if(!en()||!raw||!/[\u0590-\u05ff]/.test(raw)||n.parentElement?.closest(excluded))return;const trim=raw.trim(),value=text(trim);if(value!==trim&&!/[\u0590-\u05ff]/.test(value)){if(n.parentElement?.tagName==='OPTION'&&!n.parentElement.hasAttribute('value'))n.parentElement.setAttribute('value',trim);n.nodeValue=raw.replace(trim,value)}}
function element(el){if(!en())return;for(const key of ['placeholder','title','aria-label','alt']){const raw=el.getAttribute(key);if(!raw||el.closest('.organization-name,#organization-title,#dashboard-name,[data-original-name],[translate="no"]'))continue;const value=text(raw);if(value!==raw&&!/[\u0590-\u05ff]/.test(value))el.setAttribute(key,value)}}
function subtree(root){if(root.nodeType===3){node(root);return}if(root.nodeType!==1)return;element(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())node(n);root.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(element)}
// Installed in the head, before body parsing or application initialization.
const observer=new MutationObserver(changes=>{if(!en())return;for(const change of changes){if(change.type==='characterData')node(change.target);else if(change.type==='attributes')element(change.target);else for(const added of change.addedNodes)subtree(added)}});
observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']});
window.GmachFirstPaintReady=true;
window.addEventListener('gmach-language-change',()=>{if(en()&&document.body)subtree(document.body)});
})();
