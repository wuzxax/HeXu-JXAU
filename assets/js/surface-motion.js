(()=>{
 'use strict';
 // OneTake's carry principle: the touched surface establishes the origin;
 // the sheet settles into place, then returns along the same short path.
 const active=new Map(),origins=new WeakMap(),closing=new Map(),backdrops=new Map();
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const boxOf=el=>el.matches('.modal,.wheel-modal')?el.querySelector('.modal-box,.wheel-box')||el:el;
 function stop(el){active.get(el)?.cancel();active.delete(el);el.classList.remove('surface-moving');}
 function backdrop(el,show,duration=420){
  if(!el?.matches('.modal,.wheel-modal'))return Promise.resolve();
  const previous=backdrops.get(el);previous?.cancel();
  const current=getComputedStyle(el).backgroundColor;
  if(reduced()||!el.animate)return Promise.resolve();
  const clear=current.replace(/rgba?\(([^)]+)\)/,(_,parts)=>'rgba('+parts.split(',').slice(0,3).join(',')+',0)');
  const animation=el.animate([{backgroundColor:show?clear:current},{backgroundColor:show?current:clear}],{duration,easing:'cubic-bezier(.22,.68,.2,1)',fill:show?'none':'forwards'});
  backdrops.set(el,animation);return animation.finished.catch(()=>{}).then(()=>{if(backdrops.get(el)===animation){if(show){backdrops.delete(el);animation.cancel();}}});
 }
 function enter(el,kind='dialog',origin){
  if(closing.has(el)||active.has(el))return;
  if(reduced()||!el.animate)return;
  const menu=kind==='menu',r=el.getBoundingClientRect(),a=origin?.getBoundingClientRect?.();
  const dx=a?Math.max(-24,Math.min(24,a.x+a.width/2-r.x-r.width/2)):0;
  const dy=a?Math.max(-28,Math.min(28,a.y+a.height/2-r.y-r.height/2)):22;
  origins.set(el,{dx,dy});if(!menu)backdrop(el.closest('.modal,.wheel-modal'),true,400);el.style.transformOrigin=menu?'top right':'center center';el.classList.add('surface-moving');
  const animation=el.animate(menu?[{opacity:.4,transform:'translateY(-5px)'},{opacity:1,transform:'none'}]:[{opacity:.15,transform:`translate3d(${dx}px,${Math.max(12,Math.min(18,dy))}px,0)`},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:menu?280:440,easing:'cubic-bezier(.3,0,.2,1)'});
  active.set(el,animation);animation.finished.catch(()=>{}).then(()=>{if(active.get(el)===animation){active.delete(el);el.classList.remove('surface-moving');}});
 }
 function show(el,origin){
  const box=boxOf(el);if(closing.has(box)){stop(box);closing.delete(box);el.classList.remove('surface-closing');}
  el.classList.remove('hidden');enter(box,'dialog',origin);
 }
 function hide(el,done){
  const box=boxOf(el);if(closing.has(box))return closing.get(box);
  const appearance=getComputedStyle(box),startOpacity=appearance.opacity,startTransform=appearance.transform;
  stop(box);if(reduced()||!box.animate){el.classList.add('hidden');done?.();return Promise.resolve();}
  if(el.contains(document.activeElement))document.activeElement.blur();
  el.classList.add('surface-closing');box.classList.add('surface-moving');
  const {dx,dy}=origins.get(box)||{dx:0,dy:22};
  const mask=backdrop(el,false,360);
  const animation=box.animate([{opacity:startOpacity,transform:startTransform},{opacity:0,transform:`translate3d(${dx}px,${Math.max(12,Math.min(18,dy))}px,0)`}],{duration:360,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'});
  active.set(box,animation);
  const promise=Promise.all([animation.finished,mask]).then(()=>{if(active.get(box)!==animation)return;el.classList.add('hidden');backdrops.get(el)?.cancel();backdrops.delete(el);el.classList.remove('surface-closing');stop(box);closing.delete(box);done?.();},()=>{});
  closing.set(box,promise);return promise;
 }
 for (const details of document.querySelectorAll('[data-animated-disclosure]')) {
  const summary = details.querySelector('summary'), content = details.querySelector('.disclosure-body');
  let animation, open = details.open;
  summary.addEventListener('click', event => {
   if (!animation && (!content.animate || reduced())) return;
   event.preventDefault();
   if (!animation) open = details.open;
   const from = details.open ? content.getBoundingClientRect().height : 0;
   const opacity = details.open ? getComputedStyle(content).opacity : 0;
   animation?.cancel();
   open = !open;
   details.open = true;
   content.inert = !open;
   details.classList.toggle('is-collapsing', !open);
   content.classList.add('is-expanding');
   const motion = animation = content.animate(
    [{height:from+'px',opacity},{height:(open ? content.scrollHeight : 0)+'px',opacity:open ? 1 : 0}],
    {duration:300,easing:'cubic-bezier(.24,.72,.28,1)',fill:'both'}
   );
   motion.finished.then(() => {
    if (animation !== motion) return;
    details.open = open;
    content.inert = false;
    content.classList.remove('is-expanding');
    details.classList.remove('is-collapsing');
    motion.cancel();
    animation = null;
   }, () => {});
  });
 }

 const observer=new MutationObserver(records=>{
  const candidates=new Set();
  for(const {target,attributeName,oldValue,addedNodes} of records){
   if(attributeName==='open'&&target instanceof HTMLDialogElement&&target.open&&oldValue===null)candidates.add(target);
   if(attributeName==='class'&&target.matches?.('.modal:not(.calendar-modal)')&&oldValue?.split(/\s+/).includes('hidden')&&!target.classList.contains('hidden'))candidates.add(boxOf(target));
   if(addedNodes)for(const node of addedNodes)if(node.nodeType===1&&node.matches('.wheel-modal'))candidates.add(boxOf(node));
  }
  candidates.forEach(el=>enter(el));
 });
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['open','class']});
 window.HexuMotion={enter,show,hide,backdrop};
})();
