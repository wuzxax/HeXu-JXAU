(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const main=new Set(['today','schedule','chaoxing','waterDevice','settings']);
 const secondary=new Set(['grades','parcels','appearanceSettings','schedulePreferences','classAliases','classAliasEditor','usageGuide','feedback','notices','diag','elec','integrations','library','bookDetail','cxWork','waterSpendingDetail']);
 const parents={appearanceSettings:'settings',schedulePreferences:'settings',classAliases:'schedulePreferences',classAliasEditor:'classAliases',feedback:'settings',notices:'settings',diag:'settings',bookDetail:'library',cxWork:'chaoxing',waterSpendingDetail:'waterDevice'};
 const scrolls=new Map(),origins=new Map();let pending=null,capture=null,incoming=null,returnNav=null,animations=[],generation=0,liveOutgoing=null;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function cleanup(){
  generation++;animations.forEach(a=>a.cancel());animations=[];
  if(liveOutgoing){const {page,marker,style}=liveOutgoing;marker.replaceWith(page);if(style===null)page.removeAttribute('style');else page.setAttribute('style',style);page.classList.toggle('hidden',document.body.dataset.page!==page.id);page.querySelectorAll('[data-route-snapshot-id]').forEach(el=>delete el.dataset.routeSnapshotId);delete page.dataset.routeSnapshotId;liveOutgoing=null;}
  if(capture)capture.remove();capture=null;
  if(incoming){incoming.classList.remove('route-motion-in','route-motion-position');incoming=null;}
  if(returnNav){returnNav.classList.remove('route-motion-nav');returnNav=null;}
  document.body.classList.remove('route-motion-active');pending=null;
 }
 function snapshot(page){
  const frame=document.createElement('div');frame.className='route-motion-out';frame.inert=true;frame.setAttribute('aria-hidden','true');
  // Freeze the outgoing appearance before IDs and body[data-page] stop matching.
  // The inert copy must never duplicate live IDs or participate in route handlers.
  const rules=[];let serial=0;
  const properties=('display position top right bottom left width height min-width min-height max-width max-height box-sizing margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left flex-direction flex-wrap flex-grow flex-shrink flex-basis order align-items align-self justify-content gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row font-family font-size font-weight font-style font-stretch font-variant font-variant-numeric font-feature-settings font-kerning font-optical-sizing text-rendering -webkit-text-size-adjust line-height letter-spacing text-align text-decoration text-transform text-indent white-space word-break overflow-wrap color background background-clip border border-radius box-shadow opacity visibility overflow overflow-x overflow-y transform transform-origin translate z-index isolation filter backdrop-filter -webkit-backdrop-filter object-fit object-position vertical-align list-style fill stroke stroke-width clip-path appearance -webkit-text-fill-color').split(' ');
  const viewport={top:0,bottom:innerHeight,left:0,right:innerWidth};
  function freeze(source){
   const clone=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
   // Inert radios still join live radio groups when inserted. Isolate every copy, including offscreen controls.
   clone.querySelectorAll('input[type="radio"]').forEach(el=>el.removeAttribute('name'));
   const omitted=new Set();
   originals.forEach((el,i)=>{
    const dest=copies[i];if(omitted.has(el.parentElement)){omitted.add(el);return;}
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    // No need to freeze hundreds of off-screen bills, book rows or questions.
    // Preserve their space so the visible layout does not shift.
    if(el!==source&&(rect.top>=viewport.bottom||rect.bottom<=0)&&rect.height>0){
     dest.replaceChildren();omitted.add(el);
     dest.style.cssText='display:block;visibility:hidden;box-sizing:border-box;width:'+rect.width+'px;height:'+rect.height+'px;flex:none';
     dest.removeAttribute('id');return;
    }
    for(const name of properties)dest.style.setProperty(name,style.getPropertyValue(name));
    for(const name of style)if(name.startsWith('--'))dest.style.setProperty(name,style.getPropertyValue(name));
    dest.style.setProperty('animation','none','important');dest.style.setProperty('transition','none','important');
    if(el.id)dest.dataset.routeSnapshotId=el.id;
    dest.removeAttribute('id');
    if(el instanceof HTMLInputElement){dest.value=el.value;dest.checked=el.checked;}
    if(el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement)dest.value=el.value;
    for(const pseudo of ['::before','::after']){
     const ps=getComputedStyle(el,pseudo);
     if(ps.content==='none'||ps.content==='normal'||ps.display==='none')continue;
     const key=dest.dataset.routeSnapshotNode||(dest.dataset.routeSnapshotNode=String(++serial)),declaration=document.createElement('span').style;
     for(const name of properties)declaration.setProperty(name,ps.getPropertyValue(name));
     declaration.setProperty('content',ps.content);
     declaration.setProperty('animation','none','important');declaration.setProperty('transition','none','important');
     rules.push('.route-motion-out [data-route-snapshot-node="'+key+'"]'+pseudo+'{'+declaration.cssText+'}');
    }
   });
   return clone;
  }
  const rect=page.getBoundingClientRect();let copy;
  if(main.has(page.id)){
   const marker=document.createComment('route-origin:'+page.id);page.before(marker);
   liveOutgoing={page,marker,style:page.getAttribute('style')};copy=page;
   [page,...page.querySelectorAll('[id]')].forEach(el=>el.dataset.routeSnapshotId=el.id);
  }else copy=freeze(page);
  copy.classList.remove('hidden','route-motion-in','route-motion-position');
  Object.assign(copy.style,{position:'absolute',top:rect.top+'px',left:rect.left+'px',width:rect.width+'px',height:rect.height+'px',boxSizing:'border-box',margin:'0',transform:'none'});
  frame.append(copy);
  const nav=$('mainTabbar');if(nav&&!nav.classList.contains('hidden'))frame.append(freeze(nav));
  if(rules.length){const style=document.createElement('style');style.textContent=rules.join('\n');frame.prepend(style);}
  document.body.append(frame);return frame;
 }
 addEventListener('jxau:before-route',e=>{
  cleanup();const {from,to}=e.detail;
  if(!from||from===to||!(secondary.has(to)||secondary.has(from))||to==='login'||from==='login')return;
  const back=origins.get(from)===to||parents[from]===to||secondary.has(from)&&main.has(to);
  if(!back&&secondary.has(to))origins.set(to,from);
  scrolls.set(from,window.scrollY);
  if(reduced())return;
  const page=$(from);if(!page)return;
  capture=snapshot(page);pending={from,to,back};
 });
 addEventListener('jxau:route',e=>{
  if(!capture||!pending||e.detail!==pending.to)return;
  if(liveOutgoing)liveOutgoing.page.classList.remove('hidden');
  const page=$(e.detail),back=pending.back,token=generation;
  if(!page||!page.animate){cleanup();return;}
  window.scrollTo(0,back?scrolls.get(e.detail)||0:0);
  incoming=page;page.classList.add('route-motion-in');
  if(getComputedStyle(page).position==='static')page.classList.add('route-motion-position');
  document.body.classList.add('route-motion-active');
  const width=innerWidth, electric=e.detail==='elec'||pending.from==='elec';
  const offset=width*(electric ? .12 : .22), options={
   duration:electric?440:520,easing:electric?'cubic-bezier(.24,.70,.25,1)':'cubic-bezier(.32,.72,.25,1)',fill:'both'
  };
  animations=[capture.animate([{transform:'translateX(0)'},{transform:'translateX('+(back?width:-offset)+'px)'}],options),page.animate([{transform:'translateX('+(back?-offset:width)+'px)'},{transform:'translateX(0)'}],options)];
  // On return, the departing page stays above the revealed parent.
  capture.classList.toggle('route-motion-return',back);
  // The fixed tab bar lives outside the page. Reveal it in the same layer and
  // at the same horizontal position as the returning parent, beneath the exit.
  const nav=$('mainTabbar');
  if(back&&main.has(e.detail)&&nav&&!nav.classList.contains('hidden')){
   returnNav=nav;nav.classList.add('route-motion-nav');
   animations.push(nav.animate([{translate:(-offset)+'px 0'},{translate:'0px 0'}],options));
  }
  Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(token===generation)cleanup();});
 });
 addEventListener('resize',cleanup);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cleanup();});
 window.HexuRouteMotion={close:cleanup};
})();
