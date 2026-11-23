(()=>{
 'use strict';const $=id=>document.getElementById(id),api=window.Jxau.plan,core=window.HexuSchedule,hm=window.Jxau.calendar.hm,dialog=$('planDialog'),editor=$('planOccurrenceDialog');let editing=null,syncTimer=0,lastSnapshot='',syncing=false,resync=false,exportEpoch=0;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(path,body){const r=await fetch('/api/schedule/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.msg||'操作未完成');return d;}
 function close(){if(!editor.classList.contains('hidden')){window.HexuMotion.hide(editor);return true;}if(!dialog.classList.contains('hidden')){exportEpoch++;window.HexuMotion.hide(dialog);return true;}return false;}
 function open(tab='transfer'){window.HexuMotion.show(dialog,$('planTools'));$('planError').textContent='';tabs(tab,false);const date=api.date(api.meta().week,0);$('planTarget').value=date;$('planSource').value=date;preview();}
 let activeTab='',tabMotion=[];const tabKeys=['transfer','export','changes'],tabViews=['planTransferView','planExportView','planChangesView'],stage=dialog.querySelector('.plan-tab-stage');
 function tabs(tab,animate=true){
  if(!tabKeys.includes(tab))tab='transfer';
  if(tab==='export'&&!$('planSaveFile').getAttribute('href')?.startsWith('jxau-pocket:')){const m=api.meta();$('planExportStatus').textContent='已缓存 '+m.cachedWeeks.length+'/'+m.total+' 周';}
  if(tab==='changes'){renderChanges();historyState();}
  const old=activeTab,from=tabViews[tabKeys.indexOf(old)],to=tabViews[tabKeys.indexOf(tab)],startHeight=stage.getBoundingClientRect().height;activeTab=tab;
  tabMotion.forEach(a=>a.cancel());tabMotion=[];stage.style.height='';
  document.querySelectorAll('[data-plan-tab]').forEach(b=>{const on=b.dataset.planTab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  dialog.querySelector('.plan-tab-indicator').style.transform='translateX('+tabKeys.indexOf(tab)*100+'%)';
  tabViews.forEach(id=>{const el=$(id);el.classList.toggle('hidden',id!==to);el.style.cssText='';el.inert=id!==to;});
  if(!animate||!old||old===tab||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const entering=$(to),leaving=$(from),endHeight=entering.getBoundingClientRect().height,dir=tabKeys.indexOf(tab)>tabKeys.indexOf(old)?1:-1;
  leaving.classList.remove('hidden');Object.assign(leaving.style,{position:'absolute',top:'0',left:'0',pointerEvents:'none'});leaving.inert=true;
  stage.style.height=startHeight+'px';const options={duration:420,easing:'cubic-bezier(.22,.7,.2,1)',fill:'both'};
  const out=leaving.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX('+(-dir*18)+'px)'}],{...options,duration:240}),into=entering.animate([{opacity:0,transform:'translateX('+(dir*20)+'px)'},{opacity:1,transform:'translateX(0)'}],options),size=stage.animate([{height:startHeight+'px'},{height:endHeight+'px'}],options);tabMotion=[out,into,size];
  Promise.all(tabMotion.map(a=>a.finished)).then(()=>{if(activeTab!==tab)return;tabMotion.forEach(a=>a.cancel());tabMotion=[];leaving.classList.add('hidden');leaving.style.cssText='';stage.style.height='';}).catch(()=>{});
 }
 dialog.querySelector('.plan-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabKeys.indexOf(activeTab),n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;tabs(tabKeys[n]);document.querySelector('[data-plan-tab="'+tabKeys[n]+'"]').focus({preventScroll:true});});
 const transferMode=()=>dialog.querySelector('[name=planTransferMode]:checked').value;
 function preview(){$('planTargetLabel').textContent=transferMode()==='replace'?'调到哪天':'哪天补课';try{const target=$('planTarget').value,source=$('planSource').value,rows=api.raw(source),pos=api.position(source);$('planTransferPreview').textContent=target===source?'请选择两个不同日期':pos.week<1||pos.week>api.meta().total?'所选课程日期不在本学期内':source+' · '+rows.length+' 项安排'+(rows.length?'\n'+rows.map(c=>hm(c.start)+' '+c.name+' · '+(c.room||'地点待定')).join('\n'):'\n该日未返回安排，请核对学校课程是否已缓存。');}catch(e){$('planTransferPreview').textContent='请选择有效日期';}}
 $('planTools').onclick=()=>open();$('settingsPlanTools').onclick=()=>open();document.querySelectorAll('[data-plan-close]').forEach(b=>b.onclick=close);dialog.onclick=e=>{if(e.target===dialog)close();};document.querySelectorAll('[data-plan-tab]').forEach(b=>b.onclick=()=>tabs(b.dataset.planTab));['planTarget','planSource'].forEach(id=>$(id).onchange=preview);dialog.querySelectorAll('[name=planTransferMode]').forEach(input=>input.addEventListener('change',preview));
 $('planTransferSave').onclick=async()=>{try{const date=$('planTarget').value,source=$('planSource').value,mode=transferMode(),p=api.position(date),q=api.position(source),rows=api.raw(source);if(p.week<1||p.week>api.meta().total||q.week<1||q.week>api.meta().total)throw Error('请选择本学期内的日期');if(!rows.length)throw Error('这天没有可用安排，请先读取对应周课表');if(!api.meta().cachedWeeks.includes(q.week))throw Error('这周的课表尚未缓存，请先打开对应周或刷新课表');const changes=api.changes();if(changes.transfers.some(r=>r.date===date))throw Error('这天已经调整过，请先在“修改记录”中恢复');changes.transfers.push({date,source,mode});
 for(const [key,r]of Object.entries({...changes.overrides})){if(mode==='replace'&&r.originalDate===date){delete changes.overrides[key];continue;}if(r.originalDate===source&&r.sourceDate===source){const copy={...r,originalDate:date,date:r.date===source?date:r.date};changes.overrides[core.key({...r.base,displayDate:date,sourceDate:source})]=copy;if(mode==='replace')delete changes.overrides[key];}}
 core.validate(changes);
 const transfer=mode==='replace',type=transfer?'调休':'补课';
 const note=transfer?'原上课日将清空，新日期的原安排将被替换。':'原课照常上，新日期额外加入这些安排。';
 if(!await window.HexuConfirm.ask('确认'+type,'','保存'+type,{tone:'schedule',caption:'课表调整',rows:[['原上课日',source],[transfer?'调至':'补课日期',date],['安排数量',rows.length+' 项']],note}))return;if(api.commit(changes)){window.Jxau.toast('调整已保存，可在修改记录中撤回');tabs('changes');}}
 catch(e){$('planError').textContent=e.message;}};
 function renderChanges(){const c=api.changes(),box=$('planChangesList');box.replaceChildren();for(const [i,r]of c.transfers.entries())addChange(box,(r.mode==='replace'?'调课':'补课')+' · '+r.date,'采用 '+r.source+' 的安排',async()=>{if(!await window.HexuConfirm.ask('恢复这次调整？','这两个日期将重新采用原课表安排。','恢复原安排'))return;const next=api.changes();next.transfers.splice(i,1);if(api.commit(next))renderChanges();});for(const [key,r]of Object.entries(c.overrides)){const match=api.raw(r.sourceDate).some(e=>e.id===r.base.id&&e.custom===r.base.custom&&core.signature(e)===r.fingerprint);addChange(box,(r.cancel?'本次停课':'本次调整')+' · '+r.base.name,r.originalDate+' → '+r.date+(match?'':' · 学校数据已变化，请恢复后重设'),async()=>{if(!await window.HexuConfirm.ask('恢复这一次安排？','将移除本地覆盖，重新采用学校或原日程安排。','恢复原安排'))return;const next=api.changes();delete next.overrides[key];if(api.commit(next))renderChanges();});}if(!box.children.length)box.innerHTML='<p class="feature-empty">还没有修改，课表保持原来的安排</p>';}
 function addChange(box,title,detail,remove){const row=document.createElement('article');row.className='plan-change-row';row.innerHTML='<div><b>'+esc(title)+'</b><small>'+esc(detail)+'</small></div><button type="button">恢复</button>';row.querySelector('button').onclick=remove;box.append(row);}
 function record(e,fields){const c=api.changes(),old=c.overrides[e.occurrenceKey];const base=old?old.base:api.raw(e.sourceDate).find(r=>r.id===e.id&&r.custom===e.custom);if(!base||old&&!api.raw(e.sourceDate).some(r=>r.id===old.base.id&&r.custom===old.base.custom&&core.signature(r)===old.fingerprint))throw Error('原课程已变化，请重新打开');const value={base,fingerprint:core.signature(base),originalDate:old?old.originalDate:e.displayDate,sourceDate:e.sourceDate,date:e.displayDate,name:e.name,room:e.room||'',start:e.start,end:e.end,...fields};c.overrides[e.occurrenceKey]=value;core.validate(c);return c;}
 function edit(e,source){api.closeDetail();editing=e;$('planOccurrenceName').value=e.name;$('planOccurrenceRoom').value=e.room||'';$('planOccurrenceDate').value=e.displayDate;$('planOccurrenceStart').value=hm(e.start);$('planOccurrenceEnd').value=hm(e.end);$('planOccurrenceError').textContent='';window.HexuMotion.show(editor,source);}
 async function cancel(e){if(!await window.HexuConfirm.ask('仅取消这一次安排？',e.displayDate+' · '+e.name+'\n其他日期与周次不变，可在课表工具中恢复。','本次停课'))return;try{if(api.commit(record(e,{cancel:true}))){api.closeDetail();window.Jxau.toast('本次已取消，可撤回');}}catch(x){window.Jxau.toast(x.message);}}
 $('planOccurrenceForm').onsubmit=async e=>{e.preventDefault();if(!editing)return;try{const parse=v=>{const a=v.split(':').map(Number);return a[0]*60+a[1];},date=$('planOccurrenceDate').value,fields={date,name:$('planOccurrenceName').value.trim(),room:$('planOccurrenceRoom').value.trim(),start:parse($('planOccurrenceStart').value),end:parse($('planOccurrenceEnd').value),cancel:false};const pos=api.position(date);if(pos.week<1||pos.week>api.meta().total)throw Error('日期不在本学期内');const changes=record(editing,fields),others=core.resolve(date,changes,api.raw).filter(c=>c.occurrenceKey!==editing.occurrenceKey),overlap=others.filter(c=>fields.start<c.end&&fields.end>c.start);if(overlap.length&&!await window.HexuConfirm.ask('与其他安排重叠',overlap.map(c=>c.name+' '+hm(c.start)+'–'+hm(c.end)).join('\n'),'仍然保存'))return;if(api.commit(changes)){window.HexuMotion.hide(editor);window.Jxau.toast('仅本次已调整');}}catch(x){$('planOccurrenceError').textContent=x.message;}};
 document.querySelector('[data-plan-occurrence-close]').onclick=()=>window.HexuMotion.hide(editor);editor.onclick=e=>{if(e.target===editor)window.HexuMotion.hide(editor);};
 function historyState(){const counts=api.counts();$('planUndo').disabled=!counts.undo;$('planRedo').disabled=!counts.redo;const c=api.changes(),n=Object.keys(c.overrides).length+c.transfers.length;$('planEditHint').textContent=n?n+' 条已保存的调整':'暂无已保存的调整';}
 $('planUndo').onclick=()=>api.history(false);$('planRedo').onclick=()=>api.history(true);
 function eventsFor(range){const m=api.meta(),first=range==='week'?m.week:1,last=range==='week'?m.week:m.total,out=[];for(let w=first;w<=last;w++)for(let day=0;day<7;day++)out.push(...api.day(api.date(w,day)));return out;}
 function imageWeek(){const m=api.meta(),canvas=document.createElement('canvas');canvas.width=1400;canvas.height=1840;const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f7f0';ctx.fillRect(0,0,1400,1840);ctx.fillStyle='#205a40';ctx.font='bold 44px sans-serif';ctx.fillText('禾序 · 第 '+m.week+' 周',42,68);ctx.font='22px sans-serif';ctx.fillStyle='#728277';ctx.fillText('包含课程调整与自定义日程 · '+api.date(m.week,0)+' — '+api.date(m.week,6),42,106);
 const left=110,top=194,cw=177,rowH=150,gap=24;const ys=minute=>{const times=window.Jxau.calendar.times.map(a=>a.map(x=>{const t=x.split(':').map(Number);return t[0]*60+t[1];})),anchors=[];times.forEach((a,i)=>{const y=top+i*rowH+(i>=4?gap:0)+(i>=8?gap:0);anchors.push([a[0],y],[a[1],y+rowH]);});if(minute<=anchors[0][0])return top;for(let i=1;i<anchors.length;i++)if(minute<=anchors[i][0]){const a=anchors[i-1],b=anchors[i];return a[1]+(minute-a[0])/(b[0]-a[0])*(b[1]-a[1]);}return anchors.at(-1)[1];};
 ctx.font='24px sans-serif';for(let d=0;d<7;d++){ctx.fillStyle='#205a40';ctx.fillText('周'+'一二三四五六日'[d],left+d*cw+50,150);ctx.font='18px sans-serif';ctx.fillText(api.date(m.week,d).slice(5),left+d*cw+50,177);ctx.font='24px sans-serif';}
 window.Jxau.calendar.times.forEach((a,i)=>{const y=ys(a[0].split(':').reduce((v,n,k)=>v+Number(n)*(k?1:60),0));ctx.fillStyle='#708174';ctx.font='bold 22px sans-serif';ctx.fillText(String(i+1),40,y+40);ctx.font='17px sans-serif';ctx.fillText(a[0],25,y+68);ctx.strokeStyle='#dfe7dc';ctx.beginPath();ctx.moveTo(105,y);ctx.lineTo(1353,y);ctx.stroke();});
 for(let d=0;d<7;d++){const items=api.day(api.date(m.week,d)),groups=[];for(const e of items){let group=groups.at(-1);if(!group||e.start>=group.end){group={end:e.end,items:[]};groups.push(group);}group.items.push(e);group.end=Math.max(group.end,e.end);}for(const group of groups)for(const [lane,e]of group.items.entries()){const laneW=cw/group.items.length,x=left+d*cw+lane*laneW+4,y=ys(e.start)+4,h=Math.max(36,ys(e.end)-ys(e.start)-8);ctx.fillStyle=e.custom?'#f7eddb':api.color(e.name);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,laneW-8,h,13);else ctx.rect(x,y,laneW-8,h);ctx.fill();ctx.save();ctx.beginPath();ctx.rect(x+7,y+5,laneW-22,h-10);ctx.clip();ctx.fillStyle='#244b37';ctx.font='bold 23px sans-serif';const words=[...e.name];let line='',lines=[];for(const ch of words){if(ctx.measureText(line+ch).width>laneW-28){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);lines.slice(0,3).forEach((l,i)=>ctx.fillText(l,x+11,y+33+i*28));let textY=y+40+Math.min(3,lines.length)*28;ctx.font='18px sans-serif';ctx.fillStyle='#68806d';ctx.fillText(e.room||'',x+11,textY);ctx.fillText(hm(e.start)+'–'+hm(e.end),x+11,textY+27);ctx.restore();}}
 ctx.fillStyle='#78867b';ctx.font='20px sans-serif';ctx.fillText('禾序 · 学校未缓存课程不在导出范围，实际安排请以最新课表为准。',42,1787);return canvas.toDataURL('image/png');}
 async function exportFile(type){
  const token=++exportEpoch,save=$('planSaveFile'),quickSave=$('planSaveImage'),status=$('planExportStatus'),image=$('planImagePreview');
  status.textContent='正在生成…';
  for(const link of [save,quickSave]){link.classList.add('hidden');link.removeAttribute('href');}
  image.classList.add('hidden');
  try{
   let content,mime;
   if(type==='image'){content=imageWeek();mime='image/png';}
   else{const rows=eventsFor($('planExportRange').value);if(!rows.length)throw Error('范围内没有可导出的安排');content=core.ics(rows);mime='text/calendar';}
   const result=await request('export',{mime,content});
   if(token!==exportEpoch)return;
   const direct=type==='image'&&result.directImageSave===true;
   save.href='jxau-pocket://schedule/export/'+result.id;
   save.classList.remove('hidden');
   if(type==='image'){image.src=content;image.classList.remove('hidden');}
   if(direct){quickSave.href='jxau-pocket://schedule/save-image/'+result.id;quickSave.classList.remove('hidden');}
   status.textContent=(type==='image'?'已生成当前周图片':'已生成日历文件')+(api.meta().cachedWeeks.length<api.meta().total?' · 学校课表尚未全部缓存':'');
  }catch(e){if(token===exportEpoch)status.textContent=e.message;}
 }
 $('planExportImage').onclick=()=>exportFile('image');$('planExportIcs').onclick=()=>exportFile('ics');
 async function syncWidget(){
  if(syncing){resync=true;return;}
  syncing=true;
  try{
   const m=api.meta(),aliases=readAliases();
   const courses=eventsFor('term');
   const mornings=Array.from({length:m.total*7},(_,i)=>api.morning(api.date(1+Math.floor(i/7),i%7))).flat()
    .map(e=>({...e,displayDate:e.day,occurrenceKey:e.day+'|morning'}));
   const payload={scope:core.hash(m.scope),owner:m.owner,known:m.known,
    cachedDays:m.cachedWeeks.flatMap(w=>Array.from({length:7},(_,d)=>api.date(w,d))),total:m.total,
    events:[...courses,...mornings].map(e=>({id:core.hash(e.occurrenceKey),day:e.displayDate,name:e.name,
     room:e.room||'',start:e.start,end:e.end,custom:!!e.custom,alias:aliases[e.base?.name||e.name]||'',
     eveningStudy:!!e.custom&&(e.base?.name||e.name)==='晚自习',
     liveCourse:!!e.custom&&e.id!=='morning'&&(e.base?.name||e.name)!=='晚自习'}))};
   const json=JSON.stringify(payload);
   if(m.owner&&(m.known||lastSnapshot||payload.events.some(e=>e.liveCourse||e.eveningStudy))&&json!==lastSnapshot){
    await request('snapshot',payload);lastSnapshot=json;dispatchEvent(new Event('jxau:agenda-synced'));
   }
  }catch(e){}finally{syncing=false;if(resync){resync=false;queueSync();}}
 }
 function aliasKey(){return 'hexuIslandAliases:'+encodeURIComponent(api.meta().owner||'local');}
 function readAliases(){
  try{return Object.assign(Object.create(null),JSON.parse(localStorage.getItem(aliasKey())||'{}'));}
  catch(e){return Object.create(null);}
 }
 const aliasForm=$('classAliasForm'),aliasName=$('classAliasName'),aliasList=$('classAliasList');
 const autoLabel=$('classAliasAuto'),aliasStatus=$('classAliasStatus');
 let aliasCourse='',aliasScope='',previewScope='',aliasPreviews=new Map(),aliasRequest=0;
 const aliasPage=()=>document.body.dataset.page;
 function openAliasPage(id){
  const parent='#/'+aliasPage();
  if(location.hash!==parent)history.replaceState({},'',parent);
  window.Jxau.showRoute(id);
  window.Jxau.pushRoute('#/'+id);
 }
 function editAlias(name){
  aliasCourse=name;
  aliasScope=aliasKey();
  $('classAliasTitle').textContent=name;
  autoLabel.textContent=aliasPreviews.get(name)||'正在读取…';
  aliasName.value=readAliases()[name]||'';
  openAliasPage('classAliasEditor');
 }
 function renderAliases(names){
  const aliases=readAliases();
  aliasList.replaceChildren();
  for(const name of names){
   const row=document.createElement('button');
   row.className='settings-row settings-link';
   row.type='button';
   const auto=aliasPreviews.get(name),custom=aliases[name];
   row.innerHTML='<span><b>'+esc(name)+'</b><small>自动简称'+(auto?' · '+esc(auto):'待加载')+'</small></span>'
    +'<span class="settings-trailing">'+(custom?'<span class="alias-custom">'+esc(custom)+'</span>':'')+'<span class="settings-chevron" aria-hidden="true">›</span></span>';
   row.onclick=()=>editAlias(name);
   aliasList.append(row);
  }
 }
 async function listAliases(){
  const generation=++aliasRequest,scope=aliasKey();
  const courses=eventsFor('term').filter(e=>!e.custom||(e.base?.name||e.name)!=='晚自习');
  const names=[...new Set([...courses.map(e=>e.base?.name||e.name),...Object.keys(readAliases())])].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  aliasList.hidden=!names.length;
  aliasStatus.textContent=names.length?'':'课表里还没有可设置别名的课程。';
  renderAliases(names);
  if(!names.length)return;
  try{
   const result=await request('alias-previews',{names});
   if(generation!==aliasRequest||scope!==aliasKey())return;
   if(!Array.isArray(result.labels)||result.labels.length!==names.length)throw Error('简称数据不完整');
   aliasPreviews=new Map(names.map((name,i)=>[name,result.labels[i]]));
   if(aliasPage()==='classAliases'){
    aliasList.querySelectorAll('button small').forEach((label,i)=>{label.textContent='自动简称 · '+aliasPreviews.get(names[i]);});
   }
   if(aliasPage()==='classAliasEditor'&&scope===aliasScope)autoLabel.textContent=aliasPreviews.get(aliasCourse)||'暂时无法读取';
  }catch(e){
   if(generation!==aliasRequest||scope!==aliasKey())return;
   aliasStatus.textContent='暂时无法读取自动简称，请返回后重试。';
   if(aliasPage()==='classAliasEditor')autoLabel.textContent='暂时无法读取';
  }
 }
 $('openClassAliases').onclick=()=>openAliasPage('classAliases');
 $('classAliasesBack').onclick=$('classAliasEditorBack').onclick=()=>window.appBack();
 window.Jxau.registerPage('classAliases',{onShow:()=>{
  const scope=aliasKey();
  if(scope!==previewScope){aliasPreviews.clear();previewScope=scope;}
  void listAliases();
 }});
 window.Jxau.registerPage('classAliasEditor',{onShow:()=>{
  if(aliasCourse&&aliasScope===aliasKey())return;
  window.Jxau.showRoute('classAliases');
  history.replaceState({},'','#/classAliases');
 }});
 aliasForm.addEventListener('submit',event=>{
  event.preventDefault();const course=aliasCourse;if(!course||aliasScope!==aliasKey())return;
  const alias=Array.from(aliasName.value.trim()).slice(0,12).join(''),aliases=readAliases();
  if(alias)aliases[course]=alias;else delete aliases[course];
  try{localStorage.setItem(aliasScope,JSON.stringify(aliases));queueSync();window.appBack();window.Jxau.toast(alias?'课程别名已保存':'已使用自动简称');}
  catch(e){window.Jxau.toast('课程别名保存失败');}
 });
 addEventListener('jxau:plan-changed',()=>{if(aliasPage()==='classAliases')void listAliases();});
 function queueSync(){historyState();clearTimeout(syncTimer);syncTimer=setTimeout(syncWidget,650);}
 addEventListener('jxau:plan-changed',queueSync);addEventListener('jxau:foreground',queueSync);document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 window.HexuPlanner={edit,cancel,close,open};queueSync();

})();
