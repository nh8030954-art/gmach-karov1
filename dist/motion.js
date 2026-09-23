/* GMACH BEREGA MOTION SYSTEM
 * One passive scroll source, one RAF, progressive enhancement and safe finals.
 */
(()=>{
  'use strict';
  const root=document.documentElement;
  const reduceQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=value=>Math.max(0,Math.min(1,value));
  const stopped=()=>reduceQuery.matches||root.classList.contains('a11y-stop-motion');
  const state={raf:0,active:true,scenes:[],counts:new WeakSet()};

  const sceneProgress=(element,start=.82,end=.18)=>{
    const rect=element.getBoundingClientRect();
    const vh=innerHeight||800;
    const range=vh*(start-end)+rect.height;
    return clamp((vh*start-rect.top)/Math.max(range,1));
  };

  const setupScenes=()=>{
    const mappings=[
      ['.search-hero','--motion-p'],
      ['.category-section','--scene-p'],
      ['.nearby-motion-scene','--scene-p'],
      ['.connection-story','--scene-p','fast'],
      ['.trust-section','--scene-p'],
      ['.gmach-callout','--publish-p'],
      ['.help-broadcast','--scene-p'],
      ['.community-story','--scene-p','fast'],
      ['.faq-section','--faq-p']
    ];
    state.scenes=mappings.map(([selector,property,speed])=>({element:document.querySelector(selector),property,speed})).filter(scene=>scene.element);
    const steps=document.getElementById('how-it-works');
    if(steps){
      steps.classList.add('motion-sticky');
      state.scenes.push({element:steps,property:'--journey-p',journey:true});
    }
  };

  const draw=()=>{
    state.raf=0;
    if(stopped()){
      state.scenes.forEach(({element,property,journey})=>{
        element.style.setProperty(property,'1');
        if(journey){element.style.setProperty('--journey-request','1');element.style.setProperty('--journey-approved','1');}
      });
      return;
    }
    document.querySelector('.site-header')?.classList.toggle('is-compact',scrollY>48);
    state.scenes.forEach(({element,property,journey,speed})=>{
      const rect=element.getBoundingClientRect();
      if(rect.bottom<-120||rect.top>innerHeight+120)return;
      const progress=sceneProgress(element,journey||speed==='fast' ? 1.02 : .82,journey||speed==='fast' ? .62 : .18);
      element.style.setProperty(property,progress.toFixed(4));
      if(journey){
        element.style.setProperty('--journey-request',clamp((progress-.2)*4).toFixed(4));
        element.style.setProperty('--journey-approved',clamp((progress-.42)*4).toFixed(4));
      }
    });
  };
  const requestDraw=()=>{if(!state.raf)state.raf=requestAnimationFrame(draw)};

  const setupReveal=()=>{
    const elements=[...document.querySelectorAll('.section-heading,.organizations-grid,.trust-grid article,.gmach-callout')];
    if(stopped()){elements.forEach(el=>el.classList.add('is-visible'));return;}
    elements.forEach((el,index)=>{el.classList.add('motion-reveal');el.style.setProperty('--reveal-delay',`${Math.min(index%4,3)*55}ms`);});
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }),{threshold:.14,rootMargin:'0px 0px -5%'});
    elements.forEach(el=>observer.observe(el));
  };

  const setupSkeletons=()=>{
    const grid=document.getElementById('items-grid');
    if(!grid||grid.children.length)return;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<3;i++){
      const card=document.createElement('article');
      card.className='item-card motion-skeleton';
      card.setAttribute('aria-hidden','true');
      card.style.minHeight='310px';
      fragment.append(card);
    }
    grid.append(fragment);
    const observer=new MutationObserver(()=>{
      if([...grid.children].some(child=>!child.classList.contains('motion-skeleton'))){
        grid.querySelectorAll('.motion-skeleton').forEach(node=>node.remove());
        observer.disconnect();
      }
    });
    observer.observe(grid,{childList:true});
  };

  const countUp=element=>{
    const target=Number(element.textContent.replace(/[^0-9.-]/g,''));
    if(!Number.isFinite(target)||target<=0||state.counts.has(element)||stopped())return;
    state.counts.add(element);
    const start=performance.now(),duration=520,formatter=new Intl.NumberFormat('he-IL');
    const tick=now=>{
      const p=clamp((now-start)/duration);
      element.textContent=formatter.format(Math.round(target*(1-Math.pow(1-p,3))));
      if(p<1)requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const setupCounts=()=>{
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting&&Number(entry.target.textContent)>0){countUp(entry.target);observer.unobserve(entry.target);}}),{threshold:.65});
    document.querySelectorAll('.stats-grid strong').forEach(el=>observer.observe(el));
  };

  const setupActions=()=>{
    document.getElementById('motion-help-request')?.addEventListener('click',()=>document.getElementById('nav-help-request')?.click());
    document.getElementById('motion-open-gmach')?.addEventListener('click',()=>document.getElementById('add-gmach-button')?.click());
    document.getElementById('motion-search-item')?.addEventListener('click',()=>{
      document.getElementById('search-input')?.focus({preventScroll:true});
      document.querySelector('.search-hero')?.scrollIntoView({behavior:stopped()?'auto':'smooth',block:'center'});
    });
  };

  const setupCategoryScene=()=>{
    const targets=[...document.querySelectorAll('.category-motion-scene span')];
    const sources=[...document.querySelectorAll('.category-card:not(.is-active) .category-icon svg')];
    targets.forEach((target,index)=>{const source=sources[index];if(source)target.append(source.cloneNode(true));});
  };

  const setupOneTimeCta=()=>{
    const button=document.getElementById('callout-add-gmach');
    if(!button||stopped())return;
    button.classList.add('motion-continuous-cta');
  };

  const syncEmptySections=()=>{
    const section=document.getElementById('gmachim');
    const grid=document.getElementById('organizations-grid');
    if(!section||!grid)return;
    const update=()=>section.classList.toggle('is-empty',Boolean(grid.querySelector('.dashboard-empty')));
    new MutationObserver(update).observe(grid,{childList:true,subtree:true});
    update();
  };

  const rebuild=()=>{
    setupScenes();
    state.scenes.forEach(({element})=>element.style.removeProperty('will-change'));
    requestDraw();
  };

  const init=()=>{
    root.classList.add('motion-ready','motion-active');
    setupScenes(); setupCategoryScene(); setupReveal(); setupSkeletons(); setupCounts(); setupActions(); setupOneTimeCta(); syncEmptySections();
    addEventListener('scroll',requestDraw,{passive:true});
    addEventListener('resize',rebuild,{passive:true});
    reduceQuery.addEventListener?.('change',requestDraw);
    new MutationObserver(requestDraw).observe(root,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',()=>{state.active=!document.hidden;if(state.active)requestDraw();});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{root.classList.add('motion-loaded');requestDraw();}));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
