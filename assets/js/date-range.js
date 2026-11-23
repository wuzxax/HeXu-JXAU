(function(){
  'use strict';
  let dialog,begin,end,month,phase='begin',done,returnFocus;
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const date=s=>{const a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);};
  const day=s=>{const a=s.split('-').map(Number);return Date.UTC(a[0],a[1]-1,a[2])/86400000;};
  function valid(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&iso(date(s))===s;}
  const $=id=>document.getElementById(id);
  function close(){if(!dialog||!dialog.open)return false;dialog.close();return true;}
  function render(){
    $('rangeMonth').textContent=month.getFullYear()+'年 '+(month.getMonth()+1)+'月';
    $('rangeStart').textContent=begin||'选择开始日期';$('rangeEnd').textContent=end||'选择结束日期';
    $('rangeStart').classList.toggle('active',phase==='begin');$('rangeEnd').classList.toggle('active',phase==='end');
    $('rangeHint').textContent=phase==='begin'?'选择开始日期':'选择结束日期，最多跨93天';
    const today=iso(new Date()),first=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
    $('rangeNext').disabled=month.getFullYear()===new Date().getFullYear()&&month.getMonth()===new Date().getMonth();
    let html='<span></span>'.repeat(first);
    const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let n=1;n<=count;n++){
      const value=iso(new Date(month.getFullYear(),month.getMonth(),n)),edge=value===begin||value===end,inside=begin&&end&&value>begin&&value<end;
      html+='<button type="button" data-date="'+value+'" aria-label="'+value+'" aria-pressed="'+edge+'" class="'+(edge?'edge ':'')+(inside?'in-range ':'')+(value===today?'today':'')+'" '+(value>today?'disabled':'')+'>'+n+'</button>';
    }
    $('rangeDays').innerHTML=html;
    $('rangeDays').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      if(phase==='begin'){begin=b.dataset.date;end='';phase='end';}
      else if(!begin||b.dataset.date<begin){begin=b.dataset.date;end='';}
      else{end=b.dataset.date;phase='begin';}
      $('rangeError').textContent='';render();
    });
  }
  function init(){
    dialog=document.createElement('dialog');dialog.id='rangePicker';dialog.setAttribute('aria-labelledby','rangeTitle');
    dialog.innerHTML='<div class="range-head"><div><h2 id="rangeTitle">选择日期范围</h2><p>查看每天的用电情况</p></div><button id="rangeClose" type="button" aria-label="关闭日期选择">×</button></div>'+
      '<div class="range-selection"><button id="rangeStart" type="button"></button><span>—</span><button id="rangeEnd" type="button"></button></div>'+
      '<div class="range-presets"><button type="button" data-recent="7">近7天</button><button type="button" data-recent="14">近14天</button><button type="button" data-recent="30">近30天</button></div>'+
      '<div class="range-month"><button id="rangePrev" type="button" aria-label="上个月">‹</button><b id="rangeMonth"></b><button id="rangeNext" type="button" aria-label="下个月">›</button></div>'+
      '<div class="range-week">'+['一','二','三','四','五','六','日'].map(x=>'<span>'+x+'</span>').join('')+'</div><div id="rangeDays"></div>'+
      '<div class="range-status"><span id="rangeHint"></span><span id="rangeError" role="alert"></span></div><div class="range-footer"><button id="rangeCancel" type="button" class="fee-outline">取消</button><button id="rangeApply" type="button" class="fee-action">应用日期</button></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('close',()=>{document.body.classList.remove('date-picker-open');if(returnFocus&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)close();}});
    $('rangeClose').onclick=close;$('rangeCancel').onclick=close;
    $('rangePrev').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);render();};
    $('rangeNext').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);render();};
    $('rangeStart').onclick=()=>{phase='begin';render();};$('rangeEnd').onclick=()=>{phase='end';render();};
    dialog.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{const last=new Date(),first=new Date();first.setDate(last.getDate()-Number(b.dataset.recent)+1);begin=iso(first);end=iso(last);phase='begin';month=new Date(last.getFullYear(),last.getMonth(),1);$('rangeError').textContent='';render();});
    $('rangeApply').onclick=()=>{
      if(!valid(begin)||!valid(end)||begin>end||end>iso(new Date())){$('rangeError').textContent='请选择有效的开始和结束日期';return;}
      if(day(end)-day(begin)>92){$('rangeError').textContent='每次最多查询93天';return;}
      const callback=done;close();if(callback)callback(begin,end);
    };
  }
  window.JxauDateRange={open:(start,last,callback)=>{
    if(!dialog)init();begin=valid(start)?start:'';end=valid(last)?last:'';done=callback;phase='begin';returnFocus=document.activeElement;
    const d=date(end||iso(new Date()));month=new Date(d.getFullYear(),d.getMonth(),1);$('rangeError').textContent='';render();
    document.body.classList.add('date-picker-open');dialog.showModal();$('rangeStart').focus({preventScroll:true});
  },close};
})();
