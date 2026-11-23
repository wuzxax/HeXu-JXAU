/* Independently implemented occurrence/transfer rules; no Sleepy source included. */
(()=>{'use strict';
 const day=d=>{const x=new Date(d+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(+x)||format(x)!==d)throw Error('日期无效');return x;};
 const format=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const add=(d,n)=>{const x=day(d);x.setDate(x.getDate()+n);return format(x);};
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
 const signature=e=>JSON.stringify([e.id,e.name,e.room||'',e.teacher||'',e.start,e.end,e.custom]);
 const key=e=>e.displayDate+'|'+e.sourceDate+'|'+(e.custom?'c:':'s:')+e.id;
 function validate(changes){
  if(!changes||!Array.isArray(changes.transfers)||!changes.overrides||typeof changes.overrides!=='object')throw Error('日程修改数据无效');
  const targets=new Set(),moved=new Set();
  for(const r of changes.transfers){day(r.date);day(r.source);if(r.date===r.source||targets.has(r.date)||!['replace','append'].includes(r.mode)||r.mode==='replace'&&moved.has(r.source))throw Error('日期重复或调休规则冲突');targets.add(r.date);if(r.mode==='replace')moved.add(r.source);}
  for(const r of changes.transfers)if(targets.has(r.source))throw Error('来源日期不能同时是另一条调休的目标日期，请分开设置');
  for(const [k,r]of Object.entries(changes.overrides)){day(r.originalDate);day(r.sourceDate);day(r.date);if(!r.cancel&&(!r.name?.trim()||r.name.length>40||(r.room||'').length>80||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<480||r.end>1230||r.end-r.start<15))throw Error('本次安排须在08:00–20:30内，至少15分钟');if(!r.base||typeof r.fingerprint!=='string'||key({...r.base,displayDate:r.originalDate,sourceDate:r.sourceDate})!==k)throw Error('单次修改来源无效');}
  if(changes.transfers.length>100||Object.keys(changes.overrides).length>1000)throw Error('本地修改数量过多');return changes;
 }
 function resolve(date,changes,load){
  const transfer=changes.transfers.find(r=>r.date===date),moved=changes.transfers.some(r=>r.mode==='replace'&&r.source===date);
  const sources=transfer?(transfer.mode==='append'?[date,transfer.source]:[transfer.source]):moved?[]:[date];
  const originals=sources.flatMap(source=>load(source).map(e=>({...e,sourceDate:source,displayDate:date,transferred:source!==date})));
  const valid=r=>{const mapped=changes.transfers.find(x=>x.date===r.originalDate),removed=changes.transfers.some(x=>x.mode==='replace'&&x.source===r.originalDate);const originSources=mapped?(mapped.mode==='append'?[r.originalDate,mapped.source]:[mapped.source]):removed?[]:[r.originalDate];if(!originSources.includes(r.sourceDate))return false;const exists=load(r.sourceDate).find(e=>e.id===r.base.id&&e.custom===r.base.custom);return exists&&signature(exists)===r.fingerprint;};
  const result=[];
  for(const e of originals){const r=changes.overrides[key(e)];if(r&&valid(r)){if(!r.cancel&&r.date===date)result.push({...e,...r,name:r.name,room:r.room,modified:true,occurrenceKey:key(e)});}else result.push({...e,occurrenceKey:key(e)});}
  for(const [k,r]of Object.entries(changes.overrides))if(r.date===date&&r.originalDate!==date&&!r.cancel&&valid(r))result.push({...r.base,...r,displayDate:date,modified:true,occurrenceKey:k});
  return result.sort((a,b)=>a.start-b.start||a.end-b.end||a.name.localeCompare(b.name));
 }
 function escapeIcs(v){return String(v||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
 function foldLine(line){const lines=[];let part='',bytes=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(bytes+n>75){lines.push(part);part=' '+c;bytes=1+n;}else{part+=c;bytes+=n;}}lines.push(part);return lines.join('\r\n');}
 function ics(events,stamp=new Date()){
  const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),at=(date,m)=>{day(date);return utc(new Date(date+'T'+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':00+08:00'));};
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Hexu//Schedule//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:禾序课表'];
  for(const e of events)lines.push('BEGIN:VEVENT','UID:'+hash(e.occurrenceKey||signature(e)+e.displayDate)+'-'+e.displayDate+'@hexu.local','DTSTAMP:'+utc(stamp),'DTSTART:'+at(e.displayDate,e.start),'DTEND:'+at(e.displayDate,e.end),'SUMMARY:'+escapeIcs(e.name),'LOCATION:'+escapeIcs(e.room),'DESCRIPTION:'+escapeIcs((e.modified?'本次已调整；':'')+(e.transferred?'学校调休／补课；':'')+'由禾序导出'),'END:VEVENT');
  lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
 }
 const api={day,format,add,hash,signature,key,validate,resolve,ics};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.HexuSchedule=api;
})();
