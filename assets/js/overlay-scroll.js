(()=>{
 'use strict';
 const selector='.wheel-modal,.modal,[role=dialog][aria-modal=true],dialog[open]',root=document.documentElement;let locked=false,savedX=0,savedY=0,touch=null,scheduled=false;
 const visible=el=>el.isConnected&&!el.closest('.hidden')&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0;
 function surfaces(){return [...document.querySelectorAll(selector)].filter(visible);}
 function top(){const list=surfaces(),native=list.filter(e=>e.matches('dialog[open]'));return (native.length?native:list.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0))).at(-1);}
 function sync(){
  scheduled=false;const open=surfaces().length>0;
  if(open&&!locked){savedX=window.scrollX;savedY=window.scrollY;locked=true;root.classList.add('overlay-scroll-locked');}
  else if(!open&&locked){locked=false;root.classList.remove('overlay-scroll-locked');window.scrollTo(savedX,savedY);touch=null;}
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(sync);}}
 function allowed(target,dx,dy){const panel=top();if(!panel||!panel.contains(target))return false;let el=target instanceof Element?target:target.parentElement;
  while(el&&panel.contains(el)){const css=getComputedStyle(el),vertical=Math.abs(dy)>=Math.abs(dx);if(vertical&&/(auto|scroll)/.test(css.overflowY)&&el.scrollHeight>el.clientHeight+1){if(dy>0&&el.scrollTop<el.scrollHeight-el.clientHeight-1||dy<0&&el.scrollTop>0)return true;}
   if(!vertical&&/(auto|scroll)/.test(css.overflowX)&&el.scrollWidth>el.clientWidth+1){if(dx>0&&el.scrollLeft<el.scrollWidth-el.clientWidth-1||dx<0&&el.scrollLeft>0)return true;}el=el.parentElement;
  }return false;
 }
 document.addEventListener('touchstart',e=>{sync();if(!locked)return;if(!top()?.contains(e.target)){e.stopPropagation();touch=null;return;}touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{capture:true,passive:true});
 document.addEventListener('touchmove',e=>{if(!locked)return;const p=e.touches[0];if(!touch||!p){e.stopPropagation();if(e.cancelable)e.preventDefault();return;}const dx=touch.x-p.clientX,dy=touch.y-p.clientY;touch={x:p.clientX,y:p.clientY};const panel=top();if(!panel?.contains(e.target)){e.stopPropagation();if(e.cancelable)e.preventDefault();return;}if(!allowed(e.target,dx,dy)&&e.cancelable)e.preventDefault();},{capture:true,passive:false});
 document.addEventListener('wheel',e=>{if(locked&&!allowed(e.target,e.deltaX,e.deltaY)){if(!top()?.contains(e.target))e.stopPropagation();if(e.cancelable)e.preventDefault();}},{capture:true,passive:false});
 document.addEventListener('keydown',e=>{if(!locked||!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)||e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;const panel=top();if(!panel?.contains(e.target)&&e.cancelable)e.preventDefault();},true);
 // CSS fixes normal document scrolling; guards stop wheel/touch chaining at sheet edges.
 new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.target.matches?.(selector)))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','style']});
 document.addEventListener('transitionend',schedule,true);document.addEventListener('close',schedule,true);document.addEventListener('cancel',schedule,true);
 addEventListener('jxau:before-route',()=>{touch=null;});
 window.HexuOverlayScroll={sync,isLocked:()=>locked};sync();
})();
