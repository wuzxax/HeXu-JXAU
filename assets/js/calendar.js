(function(){
 'use strict';
 const $=id=>document.getElementById(id),api=window.Jxau.calendar,hm=api.hm,days=['一','二','三','四','五','六','日'];
 const modal=$('modal'),box=$('calendarForm'),STEP=5,MIN_LENGTH=15;let draft=null,origin=null,busy=false,skipUntil=0,dragging=false;
 const snap=value=>Math.round(value/STEP)*STEP;
 const fixedStudy=item=>item&&item.name==='晚自习';
 box.noValidate=true; // Validate ourselves so existing minute-precision records remain editable.
 const min=t=>{if(!/^\d{2}:\d{2}$/.test(t))return NaN;const a=t.split(':').map(Number);return a[0]*60+a[1];};
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 $('mDay').innerHTML=days.map((d,i)=>'<option value="'+i+'">周'+d+'</option>').join('');
 function interpolate(v,a,invert){const p=invert?a.map(x=>[x[1],x[0]]):a;if(v<=p[0][0])return p[0][1];for(let i=1;i<p.length;i++)if(v<=p[i][0]){const x=p[i-1],y=p[i];return x[1]+(v-x[0])/(y[0]-x[0])*(y[1]-x[1]);}return p[p.length-1][1];}
 function geometry(page,day){
  const bounds=page.getBoundingClientRect(),anchors=[];
  [...page.querySelectorAll('tbody>tr:not(.divider)')].forEach((row,i)=>{const r=row.querySelector('td.slot').getBoundingClientRect();anchors.push([min(api.times[i][0]),r.top-bounds.top],[min(api.times[i][1]),r.bottom-bounds.top]);});
  const head=page.querySelectorAll('thead th')[day+1].getBoundingClientRect();return {bounds,anchors,left:head.left-bounds.left,width:head.width};
 }
 function place(block,page,item){const g=geometry(page,item.day),top=interpolate(item.start,g.anchors),bottom=interpolate(item.end,g.anchors);Object.assign(block.style,{left:g.left+'px',top:top+'px',width:g.width+'px',height:Math.max(14,bottom-top)+'px'});block.classList.toggle('is-short',bottom-top<72);block.classList.toggle('is-tiny',bottom-top<40);block.style.setProperty('--event-height',Math.max(26,bottom-top)+'px');const range=block.querySelector('.calendar-event-time');if(range)range.textContent=hm(item.start)+'–'+hm(item.end);block.setAttribute('aria-label',item.name+'，周'+days[item.day]+'，'+hm(item.start)+'至'+hm(item.end)+'，点击编辑');}
 function renderPage(page,week,active){
   if(dragging)return;
   page.querySelectorAll('.calendar-event,.calendar-draft').forEach(e=>e.remove());if(!page.querySelector('table')||!page.offsetWidth)return;
   page.dataset.calendarWeek=week;
   for(let day=0;day<7;day++){const items=api.display(day,week),groups=[];for(const item of items){let group=groups[groups.length-1];if(!group||item.start>=group.end){group={end:item.end,items:[]};groups.push(group);}group.items.push(item);group.end=Math.max(group.end,item.end);}for(const group of groups)for(const [lane,item]of group.items.entries()){
    const block=document.createElement('div');block.className='calendar-event';block.dataset.eventId=item.id;block.dataset.occurrenceId=window.HexuSchedule.hash(item.occurrenceKey);block._occurrence=item;if(!item.custom){block.classList.add('school-occurrence');window.Jxau.plan.styleCourseBlock(block,item.base?.name||item.name);}if(item.modified)block.classList.add('modified-occurrence');block.tabIndex=active?0:-1;block.setAttribute('role','button');
    block.innerHTML='<button type="button" class="calendar-edge start" data-edge="start" aria-label="调整开始时间" tabindex="'+(active?'0':'-1')+'"></button><div class="calendar-event-label"><strong>'+esc(item.name)+'</strong><small class="calendar-event-room">'+esc(api.room(item))+'</small><small class="calendar-event-time"></small></div><button type="button" class="calendar-edge end" data-edge="end" aria-label="调整结束时间" tabindex="'+(active?'0':'-1')+'"></button>';
    if(fixedStudy(item)||!item.custom||item.modified||item.transferred){if(fixedStudy(item))block.classList.add('fixed-study');block.querySelectorAll('.calendar-edge').forEach(edge=>edge.remove());}
    page.append(block);place(block,page,item);if(group.items.length>1){block.style.left=(parseFloat(block.style.left)+parseFloat(block.style.width)*lane/group.items.length)+'px';block.style.width=(parseFloat(block.style.width)/group.items.length)+'px';block.classList.add('overlap-occurrence');}
   }}
 }
 function render(){['pgL','pgC','pgR'].forEach((id,i)=>renderPage($(id),api.week()+i-1,i===1));}
 function selectedWeeks(item){return Array.isArray(item.weeks)?item.weeks:Array.from({length:api.total()},(_,i)=>i+1);}
 function conflicts(item){
  const weeks=selectedWeeks(item),lessons=weeks.flatMap(w=>api.school(item.day,w).map(c=>({start:min(c.start),end:min(c.end)})));
  return lessons.concat(api.items().filter(c=>c.id!==item.id&&c.day===item.day&&weeks.some(w=>api.applies(c,w))));
 }
 function errorFor(item){
  if(!item.name.trim())return '请填写日程名称';
  if(!selectedWeeks(item).length)return '请至少选择一个生效周次';
  const saved=api.items().find(c=>c.id===item.id),unchanged=saved&&saved.start===item.start&&saved.end===item.end;
  if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<480||item.end>1230||item.end-item.start<(unchanged?1:MIN_LENGTH))return '请在 08:00–20:30 内安排至少 15 分钟';
  if(conflicts(item).some(c=>item.start<c.end&&item.end>c.start))return '所选周次与课程或已有日程重叠，请调整';return '';
 }
 function weeksSummary(){const weeks=selectedWeeks(draft);return !Array.isArray(draft.weeks)?'全部周次':weeks.length?'第 '+weeks.join('、')+' 周':'请选择周次';}
 function renderWeeks(){
  const weeks=selectedWeeks(draft);$('mWeeks').innerHTML=Array.from({length:api.total()},(_,i)=>'<button type="button" data-event-week="'+(i+1)+'" aria-pressed="'+weeks.includes(i+1)+'">'+(i+1)+'</button>').join('');
  $('mWeeksSummary').textContent=weeksSummary();
  $('mWeeksAll').setAttribute('aria-pressed',String(weeks.length===api.total()));
  $('mWeeksCurrent').setAttribute('aria-pressed',String(weeks.length===1&&weeks[0]===api.currentWeek()));
 }
 function chooseWeeks(weeks){draft={...draft,weeks:weeks.length===api.total()?undefined:weeks};renderWeeks();update();}
 $('mWeeks').onclick=e=>{const b=e.target.closest('[data-event-week]');if(!b||!draft)return;const week=Number(b.dataset.eventWeek),weeks=selectedWeeks(draft);chooseWeeks(weeks.includes(week)?weeks.filter(w=>w!==week):weeks.concat(week).sort((a,b)=>a-b));};
 $('mWeeksAll').onclick=()=>chooseWeeks(selectedWeeks(draft).length===api.total()?[]:Array.from({length:api.total()},(_,i)=>i+1));
 $('mWeeksCurrent').onclick=()=>chooseWeeks([Math.max(1,Math.min(api.total(),api.currentWeek()))]);
 $('mWeeksOdd').onclick=()=>chooseWeeks(Array.from({length:api.total()},(_,i)=>i+1).filter(w=>w%2));
 $('mWeeksEven').onclick=()=>chooseWeeks(Array.from({length:api.total()},(_,i)=>i+1).filter(w=>w%2===0));
 function update(){if(!draft)return;draft={...draft,day:Number($('mDay').value),name:$('mName').value.trim(),room:$('mRoom').value.trim(),start:min($('mStart').value),end:min($('mFinish').value)};$('mTitle').textContent=draft.name||(draft.id?'编辑日程':'新日程');$('mRange').textContent='周'+days[draft.day]+' · '+hm(draft.start)+'–'+hm(draft.end);$('mDuration').textContent=Number.isFinite(draft.start)&&Number.isFinite(draft.end)?'时长 '+(draft.end-draft.start)+' 分钟 · '+weeksSummary():'';$('mError').textContent='';}
 let morphAnimations=[],morphGhost=null,morphToken=0;
 function cancelMorph(){box.style.opacity='';morphToken++;morphAnimations.forEach(a=>a.cancel());morphAnimations=[];morphGhost?.remove();morphGhost=null;box.classList.remove('calendar-transitioning');}
 function unlockBox(){['position','left','top','width','height','maxHeight','margin'].forEach(k=>box.style[k]='');}
 async function transition(from,to,closing){
  cancelMorph();if(reduced()||!box.animate)return;
  if(!closing)box.style.opacity='0';
  const token=morphToken,ghost=document.createElement('div');morphGhost=ghost;ghost.className='calendar-morph';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
  // Carry only the surface. The fixed-width form never scales or reflows.
  const base=closing?from:to,duration=closing?440:560,easing='cubic-bezier(.3,0,.2,1)';
  Object.assign(ghost.style,{left:base.left+'px',top:base.top+'px',width:base.width+'px',height:base.height+'px'});
  modal.append(ghost);box.classList.add('calendar-transitioning');
  const transform=r=>`translate3d(${r.left-base.left}px,${r.top-base.top}px,0) scale(${Math.max(1,r.width)/Math.max(1,base.width)},${Math.max(1,r.height)/Math.max(1,base.height)})`;
  const frames=closing?[{transform:transform(from),offset:0},{transform:transform(from),offset:.14},{transform:transform(to),offset:1}]:[{transform:transform(from),offset:0},{transform:transform(to),offset:.56},{transform:transform(to),offset:1}];
  const content=closing?[{opacity:1,transform:'translate3d(0,0,0)',offset:0},{opacity:0,transform:'translate3d(0,6px,0)',offset:.52},{opacity:0,transform:'translate3d(0,6px,0)',offset:1}]:[{opacity:0,transform:'translate3d(0,6px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}];
  const mask=window.HexuMotion.backdrop(modal,!closing,duration);
  morphAnimations=[ghost.animate(frames,{duration,easing,fill:'both'}),box.animate(content,{duration:closing?duration:220,delay:closing?0:340,easing,fill:'both'})];
  await Promise.all([...morphAnimations.map(a=>a.finished.catch(()=>{})),mask]);
  if(token!==morphToken)return;
  // Hide before releasing animation styles, preventing a one-frame form flash.
  if(closing)modal.classList.add('hidden');
  cancelMorph();
 }
 function open(day,start,item,source){
  if(busy||dragging)return;
  let end=Math.min(1230,start+45);const later=api.school(day,api.week()).map(c=>min(c.start)).concat(api.items().filter(c=>c.day===day&&api.applies(c,api.week())).map(c=>c.start)).filter(v=>v>start);if(later.length)end=Math.min(end,...later);
  unlockBox();draft=item?{...item,room:api.room(item)}:{day,start,end,name:'',room:'',custom:true};origin=source&&source.getBoundingClientRect();
  $('mName').value=draft.name;$('mRoom').value=draft.room||'';$('mDay').value=String(draft.day);$('mStart').value=hm(draft.start);$('mFinish').value=hm(draft.end);$('mDel').classList.toggle('hidden',!draft.id);$('mSingleEdit').classList.toggle('hidden',!draft.id);$('mWeeks').closest('details').open=false;renderWeeks();box.querySelector('.calendar-help').textContent=fixedStudy(item)?'课表中不显示拖动手柄，避免误触；在此可自由修改时间、地点和生效周次。':'拖动上下边缘，每 5 分钟吸附；日程至少 15 分钟，点击日程即可编辑。';update();box.style.opacity=reduced()?'':'0';modal.classList.remove('hidden');
  busy=true;transition(origin||{...box.getBoundingClientRect(),height:40},box.getBoundingClientRect(),false).then(()=>{busy=false;});
 }
 function targetRect(){const block=[...$('pgC').querySelectorAll('.calendar-event')].find(b=>draft&&b.dataset.eventId===draft.id);return block?block.getBoundingClientRect():origin;}
 function close(immediate){
  closeWheel();
  if(modal.classList.contains('hidden'))return false;
  if(immediate){modal.classList.add('hidden');cancelMorph();unlockBox();draft=null;busy=false;return true;}
  if(busy)return true;busy=true;const to=targetRect();const from=box.getBoundingClientRect();
  Object.assign(box.style,{position:'fixed',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',maxHeight:from.height+'px',margin:'0'});
  if(box.contains(document.activeElement))document.activeElement.blur();
  transition(from,to||{...from,top:from.top+16},true).then(()=>{modal.classList.add('hidden');unlockBox();draft=null;busy=false;});return true;
 }
 $('mSingleEdit').onclick=async()=>{if(busy||!draft?.id)return;const occurrence=api.display(draft.day,api.week()).find(e=>e.id===draft.id);if(!occurrence)return;const block=[...$('pgC').querySelectorAll('.calendar-event')].find(e=>e.dataset.eventId===draft.id);close(true);window.HexuPlanner?.edit(occurrence,block);};
 $('mCancel').onclick=()=>close(false);modal.onclick=e=>{if(e.target===modal)close(false);};box.addEventListener('input',update);
 box.addEventListener('change',e=>{if(e.target.matches('#mStart,#mFinish')){const value=min(e.target.value);if(Number.isFinite(value))e.target.value=hm(snap(value));update();}});
 box.onsubmit=e=>{e.preventDefault();if(busy)return;update();const error=errorFor(draft);if(error){$('mError').textContent=error;return;}const item={...draft,id:draft.id||('event-'+Date.now()+'-'+Math.random().toString(36).slice(2,8))};if(api.save(api.items().filter(c=>c.id!==item.id).concat(item))){draft=item;close(false);}};
 $('mDel').onclick=async()=>{if(busy||!draft||!draft.id)return;const id=draft.id,name=draft.name;if(!await window.HexuConfirm.ask('删除日程？','将删除“'+name+'”及其全部生效周次，首页和课表将同步移除。'))return;if(!draft||draft.id!==id||busy)return;if(api.save(api.items().filter(c=>c.id!==id)))close(false);};
 $('pages').addEventListener('click',e=>{const block=e.target.closest('.calendar-event');if(!block)return;e.stopImmediatePropagation();if(performance.now()<skipUntil||e.target.closest('[data-edge]'))return;const occurrence=block._occurrence;if(occurrence&&!occurrence.custom){window.Jxau.plan.detail(occurrence);return;}if(occurrence&&(occurrence.modified||occurrence.transferred)){window.HexuPlanner?.edit(occurrence,block);return;}const item=api.items().find(c=>c.id===block.dataset.eventId);if(item)open(item.day,item.start,item,block);},true);
 function limits(item,edge){const others=conflicts(item);return edge==='start'?{lo:Math.max(480,...others.filter(c=>c.end<=item.start).map(c=>c.end)),hi:item.end-MIN_LENGTH}:{lo:item.start+MIN_LENGTH,hi:Math.min(1230,...others.filter(c=>c.start>=item.end).map(c=>c.start))};}
 function resizeValue(item,edge,value){const l=limits(item,edge),lo=Math.ceil(l.lo/STEP)*STEP,hi=Math.floor(l.hi/STEP)*STEP;return lo<=hi?Math.max(lo,Math.min(hi,snap(value))):item[edge];}
 $('pages').addEventListener('pointerdown',e=>{
  const handle=e.target.closest('.calendar-edge');if(!handle||busy)return;e.preventDefault();e.stopPropagation();const block=handle.closest('.calendar-event'),page=block.closest('.page'),original=api.items().find(c=>c.id===block.dataset.eventId);if(!original||fixedStudy(original))return;
  const item={...original},edge=handle.dataset.edge,g=geometry(page,item.day),startValue=item[edge],pointerStart=interpolate(e.clientY-g.bounds.top,g.anchors,true);let pointerY=e.clientY,raf=0,moved=false;
  dragging=true;block.classList.add('resizing');handle.setPointerCapture(e.pointerId);const bubble=document.createElement('span');bubble.className='calendar-time-bubble';block.append(bubble);
  const updateDrag=()=>{const g=geometry(page,item.day),raw=interpolate(pointerY-g.bounds.top,g.anchors,true);item[edge]=resizeValue(original,edge,startValue+raw-pointerStart);place(block,page,item);bubble.textContent=hm(item.start)+'–'+hm(item.end)+' · '+(item.end-item.start)+' 分钟';};
  const scroll=()=>{if(moved){if(pointerY<100)window.scrollBy(0,-5);if(pointerY>innerHeight-150)window.scrollBy(0,5);updateDrag();}raf=requestAnimationFrame(scroll);};raf=requestAnimationFrame(scroll);
  const move=ev=>{if(ev.pointerId===e.pointerId){pointerY=ev.clientY;if(Math.abs(pointerY-e.clientY)>1)moved=true;if(moved)updateDrag();ev.preventDefault();}};
  const end=ev=>{if(ev.pointerId!==e.pointerId)return;cancelAnimationFrame(raf);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);dragging=false;skipUntil=performance.now()+400;if(ev.type!=='pointercancel')api.save(api.items().map(c=>c.id===item.id?item:c));render();};
  window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true);
 },true);
 $('pages').addEventListener('keydown',e=>{
  const block=e.target.closest('.calendar-event');if(!block)return;const occurrence=block._occurrence;if(occurrence&&(occurrence.modified||occurrence.transferred)){if(['Enter',' '].includes(e.key)){e.preventDefault();window.HexuPlanner?.edit(occurrence,block);}return;}if(occurrence&&!occurrence.custom){if(['Enter',' '].includes(e.key)){e.preventDefault();window.Jxau.plan.detail(occurrence);}return;}const item=api.items().find(c=>c.id===block.dataset.eventId),handle=e.target.closest('[data-edge]');if(!item)return;
  if(handle&&!fixedStudy(item)&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const copy={...item},edge=handle.dataset.edge;copy[edge]=resizeValue(item,edge,item[edge]+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?15:STEP));api.save(api.items().map(c=>c.id===item.id?copy:c));}
  else if(!handle&&['Enter',' '].includes(e.key)){e.preventDefault();open(item.day,item.start,item,block);}
 });
 window.addEventListener('resize',render);window.addEventListener('jxau:route',e=>{if(e.detail==='schedule')requestAnimationFrame(render);});
 let wheel=null,wheelTarget=null;
 function closeWheel(){if(!wheel)return false;wheel.remove();wheel=null;wheelTarget=null;return true;}
 function openWheel(target){
  if(target.disabled)return;
  closeWheel();wheelTarget=target;const morning=target.dataset.timeWheel.startsWith('morning'),label=target.dataset.timeLabel||(target.id==='mStart'?'开始时间':'结束时间'),value=min(target.value),current=Number.isFinite(value)?value:480;
  wheel=document.createElement('div');wheel.className='wheel-modal';wheel.setAttribute('role','dialog');wheel.setAttribute('aria-modal','true');wheel.setAttribute('aria-label','选择'+label);
  wheel.innerHTML='<div class="wheel-box"><div class="wheel-head"><button type="button" data-wheel-cancel>取消</button><h3>'+label+'</h3><button type="button" data-wheel-save>确定</button></div><div class="time-wheels"><div class="time-wheel" data-part="hour" role="listbox" tabindex="0" aria-label="小时"></div><b>:</b><div class="time-wheel" data-part="minute" role="listbox" tabindex="0" aria-label="分钟"></div></div><p class="wheel-hint">'+(morning?'上下滚动选择 · 精确到分钟<br>早检起止时间须在同一天':'上下滚动选择 · 每 5 分钟一格<br>可安排 08:00–20:30，日程至少 15 分钟')+'</p></div>';
  document.body.append(wheel);let hour=Math.floor(current/60),minute=morning?current%60:snap(current%60)%60;
  wheel.querySelectorAll('.time-wheel').forEach(column=>{
   const isHour=column.dataset.part==='hour',values=isHour?Array.from({length:morning?24:13},(_,i)=>i+(morning?0:8)):Array.from({length:morning?60:12},(_,i)=>i*(morning?1:5));
   column.innerHTML=values.map(v=>'<button type="button" role="option" tabindex="-1" data-value="'+v+'">'+String(v).padStart(2,'0')+'</button>').join('');
   const refresh=()=>{const index=Math.max(0,Math.min(values.length-1,Math.round(column.scrollTop/42))),value=values[index];column.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.value)===value)));if(isHour)hour=value;else minute=value;};
   column.scrollTop=Math.max(0,values.indexOf(isHour?hour:minute))*42;refresh();column.addEventListener('scroll',refresh,{passive:true});
   column.onclick=e=>{const b=e.target.closest('button');if(b){column.scrollTo({top:values.indexOf(Number(b.dataset.value))*42,behavior:reduced()?'instant':'smooth'});}};
   column.onkeydown=e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?values.length-1:Math.round(column.scrollTop/42)+(e.key==='ArrowUp'?-1:1);column.scrollTop=Math.max(0,Math.min(values.length-1,index))*42;refresh();}};
  });
  wheel.querySelector('[data-wheel-cancel]').onclick=closeWheel;wheel.onclick=e=>{if(e.target===wheel)closeWheel();};
  wheel.querySelector('[data-wheel-save]').onclick=()=>{const target=wheelTarget;target.value=hm(Math.min(morning?1439:1230,hour*60+minute));target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));closeWheel();target.focus({preventScroll:true});};
 }
 document.querySelectorAll('[data-time-wheel]').forEach(input=>{input.onclick=()=>openWheel(input);input.onkeydown=e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();openWheel(input);}};});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&wheel){e.preventDefault();closeWheel();}});
 window.JxauCalendar={open,close,closeWheel,render,renderPage,get dragging(){return dragging;}};render();
})();
