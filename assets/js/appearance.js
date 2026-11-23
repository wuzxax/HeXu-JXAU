(function(){
  'use strict';
  const $=id=>document.getElementById(id),root=document.documentElement;
  const defaults={style:'campus',enabled:true,glass:'natural',touch:true};
  let prefs={...defaults};
  try{const p=JSON.parse(localStorage.getItem('jxauAppearance')||'{}');prefs={style:['campus','reading','soft'].includes(p.style)?p.style:defaults.style,enabled:p.enabled!==false,glass:['real','natural','gentle'].includes(p.glass)?p.glass:defaults.glass,touch:p.touch!==false};}catch(e){}
  const nav=$('mainTabbar'),carry=document.createElement('span');carry.className='nav-carry';carry.setAttribute('aria-hidden','true');nav.prepend(carry);nav.classList.add('glass-surface');document.querySelector('#schedule .foot').classList.add('glass-surface');
  let scrub=null,suppressClickUntil=0,slide=null,settling=false,committing=false,routeFrom='',pendingTab=null;
  const scrollPositions=new Map(),tabs=()=>[...nav.querySelectorAll('.main-tab')];
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function align(){if(settling||(scrub&&scrub.moved))return;const b=nav.querySelector('.main-tab.active');if(b){carry.style.width=b.offsetWidth+'px';carry.style.transform='translateX('+b.offsetLeft+'px)';}}
  function cleanupSlide(){
    if(!slide)return;const old=slide;slide=null;
    cancelAnimationFrame(old.frame);clearTimeout(old.timer);
    old.panes.forEach(p=>{p.marker.replaceWith(p.page);p.page.classList.remove('nav-preview-page');});
    old.stage.remove();old.spacer.remove();document.body.classList.remove('nav-page-dragging');
    window.scrollTo(0,old.scrollY);settling=false;
    window.HexuDockLens?.end();
  }
  function beginSlide(destination=null){
    const buttons=tabs(),source=buttons.findIndex(b=>b.dataset.tab===document.body.dataset.page);
    if(source<0)return false;
    const stage=document.createElement('div'),spacer=document.createElement('div'),scrollY=window.scrollY;
    stage.className='nav-page-stage';stage.setAttribute('aria-hidden','true');stage.inert=true;
    // Keep the document height stable while the live pages temporarily sit in the fixed stage.
    spacer.style.height=Math.max(document.documentElement.scrollHeight,innerHeight)+'px';spacer.setAttribute('aria-hidden','true');
    const panes=buttons.map(b=>{
      const page=$(b.dataset.tab),marker=document.createComment('nav-page:'+page.id),pane=document.createElement('div');
      page.before(marker);pane.className='nav-page-pane';page.classList.add('nav-preview-page');pane.append(page);stage.append(pane);
      return {page,marker,pane,y:page.id===document.body.dataset.page?scrollY:(scrollPositions.get(page.id)||0)};
    });
    document.body.append(spacer,stage);document.body.classList.add('nav-page-dragging');
    slide={stage,spacer,panes,source,destination,position:source,scrollY,width:document.documentElement.clientWidth,frame:0,timer:0};
    panes.forEach(p=>{p.pane.scrollTop=p.y;});drawSlide(source);return true;
  }
  function drawSlide(position){
    if(!slide)return;slide.position=position;
    slide.panes.forEach((p,i)=>{
      const clicking=slide.destination!==null;
      const visible=!clicking||i===slide.source||i===slide.destination;
      const slot=clicking&&i===slide.destination?slide.source+Math.sign(i-slide.source):i;
      p.pane.style.transform='translate3d('+((slot-position)*slide.width)+'px,0,0)';
      p.pane.style.visibility=visible&&Math.abs(slot-position)<=1.05?'visible':'hidden';
    });
  }
  function track(x,y){
    const buttons=tabs(),r=nav.getBoundingClientRect(),local=x-r.left,centers=buttons.map(b=>b.offsetLeft+b.offsetWidth/2);
    const clamped=Math.max(centers[0],Math.min(centers[centers.length-1],local));
    let position=0;
    for(let i=0;i<centers.length-1;i++)if(clamped>=centers[i])position=i+Math.min(1,(clamped-centers[i])/(centers[i+1]-centers[i]));
    const previous=scrub.index;
    const index=Math.abs(position-previous)>.56?Math.round(position):previous;
    const b=buttons[index],left=clamped-b.offsetWidth/2;
    carry.style.width=b.offsetWidth+'px';carry.style.transform='translateX('+left+'px)';
    const drift=Math.max(-10,Math.min(10,(x-scrub.lastX)*.8));
    scrub.lens={left,width:b.offsetWidth,drift,touch:Math.max(.18,Math.min(.9,(y-r.top)/r.height))};
    window.HexuDockLens?.move(left,b.offsetWidth,drift,scrub.lens.touch);
    scrub.lastX=x;
    buttons.forEach((button,i)=>button.classList.toggle('scrub-target',i===index));
    if(index!==previous&&scrub.haptic)window.HexuDockFeedback?.selection();
    scrub.index=index;
    if(slide)drawSlide(position);
  }
  function snapSlide(target,lens=null){
    if(!slide)return;
    const current=slide,start=current.position,started=performance.now(),duration=reduced()?0:current.destination===null?300:420;
    const end=current.destination===null?target:current.source+Math.sign(target-current.source);
    settling=true;nav.classList.remove('scrubbing');
    const b=tabs()[target];carry.style.width=b.offsetWidth+'px';carry.style.transform='translateX('+b.offsetLeft+'px)';
    function finish(){
      if(slide!==current)return;const source=current.source;
      cleanupSlide();
      if(target!==source){committing=true;window.Jxau.showRoute(b.dataset.tab);committing=false;if(document.body.dataset.page===b.dataset.tab)window.Jxau.pushRoute('#/'+b.dataset.tab);}
      align();
      const next=pendingTab;pendingTab=null;
      if(next!==null)requestAnimationFrame(()=>clickTab(next));
    }
    function frame(now){
      if(slide!==current)return;
      const t=duration?Math.min(1,(now-started)/duration):1,eased=1-Math.pow(1-t,3);
      drawSlide(start+(end-start)*eased);
      if(lens)window.HexuDockLens?.move(lens.left+(b.offsetLeft-lens.left)*eased,
        lens.width+(b.offsetWidth-lens.width)*eased,lens.drift*(1-eased),lens.touch,1-eased*.85);
      if(t<1)current.frame=requestAnimationFrame(frame);else finish();
    }
    current.frame=requestAnimationFrame(frame);
    current.timer=setTimeout(finish,duration+120);
  }
  nav.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0||!e.target.closest('.main-tab'))return;
    if(settling)return;
    scrub={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,moved:false,
      haptic:e.pointerType==='touch',index:tabs().indexOf(nav.querySelector('.main-tab.active'))};
    if(scrub.index<0)scrub.index=tabs().indexOf(e.target.closest('.main-tab'));
  });
  nav.addEventListener('pointermove',e=>{
    if(!scrub||scrub.id!==e.pointerId)return;
    const dx=e.clientX-scrub.startX,dy=e.clientY-scrub.startY;
    if(!scrub.moved&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){scrub=null;return;}
    if(!scrub.moved&&Math.abs(dx)>7){
      if(!beginSlide()){scrub=null;return;}
      scrub.moved=true;nav.setPointerCapture(e.pointerId);
      window.HexuDockLens?.start();nav.classList.add('scrubbing');
    }
    if(scrub.moved){e.preventDefault();track(e.clientX,e.clientY);}
  },{passive:false});
  function finishScrub(e,cancel){
    if(!scrub||scrub.id!==e.pointerId)return;
    const current=scrub;scrub=null;tabs().forEach(b=>b.classList.remove('scrub-target'));
    if(current.moved){suppressClickUntil=performance.now()+500;snapSlide(cancel?slide.source:current.index,current.lens);}
  }
  nav.addEventListener('pointerup',e=>finishScrub(e,false));nav.addEventListener('pointercancel',e=>finishScrub(e,true));nav.addEventListener('lostpointercapture',e=>{if(e.target===nav)finishScrub(e,true);});
  function clickTab(target){
    if(settling){pendingTab=target;return;}
    const b=tabs()[target];if(!b||b.dataset.tab===document.body.dataset.page)return;
    if(beginSlide(target))snapSlide(target);
    else{window.Jxau.showRoute(b.dataset.tab);window.Jxau.pushRoute('#/'+b.dataset.tab);}
  }
  nav.addEventListener('click',e=>{
    const b=e.target.closest('.main-tab');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(performance.now()<suppressClickUntil)return;
    clickTab(tabs().indexOf(b));
  },{capture:true});
  function abortSlide(){pendingTab=null;scrub=null;cleanupSlide();nav.classList.remove('scrubbing');tabs().forEach(b=>b.classList.remove('scrub-target'));align();}
  addEventListener('resize',()=>{if(slide)abortSlide();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&slide)abortSlide();});
  addEventListener('jxau:before-route',e=>{
    if(slide)abortSlide();
    const from=e.detail.from,to=e.detail.to;routeFrom=from;
    if(tabs().some(b=>b.dataset.tab===from)&&from!==to)scrollPositions.set(from,window.scrollY);
  });
  function render(){
    root.dataset.style=prefs.style;root.dataset.glass=prefs.enabled?prefs.glass:'off';root.dataset.glow=String(prefs.touch&&prefs.enabled);
    document.querySelectorAll('[name=uiStyle]').forEach(e=>e.checked=e.value===prefs.style);
    document.querySelectorAll('[name=glassLevel]').forEach(e=>e.checked=e.value===prefs.glass);
    $('glassEnabled').checked=prefs.enabled;$('glassTouch').checked=prefs.touch;$('glassTouch').disabled=!prefs.enabled;$('glassOptions').disabled=!prefs.enabled;
    $('glassLevelName').textContent=prefs.enabled?({real:'真实',natural:'自然',gentle:'柔和'}[prefs.glass]):'高级材质已关闭';
    requestAnimationFrame(align);
  }
  function change(key,value){const next={...prefs,[key]:value};try{localStorage.setItem('jxauAppearance',JSON.stringify(next));prefs=next;render();}catch(e){render();window.Jxau.toast('设置保存失败，请检查存储空间');}}
  document.querySelectorAll('[name=uiStyle]').forEach(e=>e.onchange=()=>change('style',e.value));
  document.querySelectorAll('[name=glassLevel]').forEach(e=>e.onchange=()=>change('glass',e.value));
  $('glassEnabled').onchange=e=>change('enabled',e.target.checked);$('glassTouch').onchange=e=>change('touch',e.target.checked);
  new MutationObserver(align).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',align);
  window.addEventListener('jxau:route',e=>{
    requestAnimationFrame(align);const page=$(e.detail);
    if(routeFrom!==e.detail&&tabs().some(b=>b.dataset.tab===e.detail))window.scrollTo(0,scrollPositions.get(e.detail)||0);

  });
  document.querySelectorAll('.glass-surface').forEach(el=>{
    let timer;
    el.addEventListener('pointermove',e=>{if(!prefs.enabled||!prefs.touch||!el.classList.contains('glass-pressed'))return;const r=el.getBoundingClientRect();el.style.setProperty('--touch-x',(e.clientX-r.left)+'px');el.style.setProperty('--touch-y',(e.clientY-r.top)+'px');});
    el.addEventListener('pointerdown',e=>{if(!prefs.enabled||!prefs.touch)return;const r=el.getBoundingClientRect();el.style.setProperty('--touch-x',(e.clientX-r.left)+'px');el.style.setProperty('--touch-y',(e.clientY-r.top)+'px');el.classList.add('glass-pressed');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('glass-pressed'),420);});
  });
  window.Jxau.registerPage('notices',{});
  $('openNotices').onclick=()=>{window.Jxau.showRoute('notices');window.Jxau.pushRoute('#/notices');};
  $('noticesBack').onclick=()=>{window.Jxau.showRoute('settings');window.Jxau.pushRoute('#/settings');};
  render();
})();
