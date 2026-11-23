(()=>{
  'use strict';
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let generation=0,statsBusy=false,stats=null,statsReadAt=0,accountKey='',historyPage=1,historyEpoch=0,historyData=null,historyBusy=false;
  async function api(path){const res=await fetch(path);const d=await res.json();if(!res.ok||!d.ok)throw new Error(d.msg||'798暂不可用，请稍后重试');return d;}
  function money(v){const n=Number(v);return v==null||!Number.isFinite(n)?'—':n.toFixed(2);}
  function time(v){
    let date;if(/^\d{10,13}$/.test(String(v)))date=new Date(Number(v)*(String(v).length===10?1000:1));else date=new Date(String(v||'').replace(' ','T'));
    return Number.isNaN(date.getTime())?String(v||'时间未知'):date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  }
  function clear(){
    stats=null;statsReadAt=0;historyData=null;historyPage=1;historyEpoch++;historyBusy=false;
    $('waterDrinkStats').querySelectorAll('strong').forEach(e=>e.textContent='—');$('waterBathStats').querySelectorAll('strong').forEach(e=>e.textContent='—');
    $('waterDrinkVolume').textContent='今日饮水量待统计';clearDetail();$('waterMonthTotal').textContent='—';$('waterSpendBar').textContent='';$('waterSpendLegend').textContent='';$('waterHistoryList').textContent='';setOpen(false);
  }
  function render(d){
    const partial=!d.complete,prefix=partial?'已读取 ':'';
    const tiles=(group,periods)=>periods.map(([key,label])=>'<div><span>'+prefix+label+'</span><div class="water-amount"><strong>'+money(group?.[key]?.amount)+'</strong><em>元</em></div><small>'+Number(group?.[key]?.count||0)+' 笔</small></div>').join('');
    $('waterDrinkStats').innerHTML=tiles(d.drink,[['day','今日'],['week','本周'],['month','本月']]);
    const count=Number(d.bath?.month?.count||0),average=count>0?Number(d.bath.month.amount)/count:null;
    $('waterBathStats').innerHTML='<div><span>'+prefix+'次均</span><div class="water-amount"><strong>'+money(average)+'</strong><em>元</em></div><small>本月每笔</small></div>'+tiles(d.bath,[['week','本周'],['month','本月']]);
    const volume=d.drink?.day?.amount==null?null:Number(d.drink.day.amount)/0.20;
    $('waterDrinkVolume').innerHTML=(partial?'已读取账单估算 · ':'')+'今日饮水约 <b>'+money(volume)+'</b> 升 <small>按 0.20 元／升估算</small>';
    const values=[Number(d.drink?.month?.amount||0),Number(d.bath?.month?.amount||0),Number(d.other?.month?.amount||0)],total=values.reduce((a,b)=>a+b,0);
    $('waterMonthTotal').textContent=(partial?'已读取合计 ':'合计 ')+'¥ '+money(total);
    const labels=['饮水','洗浴','待分类'],classes=['drink','bath','other'];
    $('waterSpendBar').innerHTML=total>0?values.map((v,i)=>v>0?'<span class="'+classes[i]+'" style="width:'+(v/total*100).toFixed(4)+'%"></span>':'').join(''):'';
    $('waterSpendLegend').innerHTML=values.map((v,i)=>'<span><i class="'+classes[i]+'"></i>'+labels[i]+' ¥'+money(v)+'</span>').join('');
    window.dispatchEvent(new CustomEvent('jxau:spending-data',{detail:d}));
    if(d.scope)$('waterStatsScope').textContent=d.scope+'。周从周一开始，月按自然月，均使用校园时间。洗浴次均为本月每笔有效消费的平均金额，零笔显示—；饮水量按实际花费估算，并非实际饮用量。';
    $('waterStatsStatus').textContent=(d.cached?'缓存统计 · ':'更新于 ')+time(d.updatedAt)+(d.warning?' · '+d.warning:'')+(!d.complete&&!d.warning?' · 账单未完整读取，当前为部分统计':'')+(d.unclassifiedRecords?' · '+d.unclassifiedRecords+' 笔消费待分类':'');
  }
  window.JxauSpending={load:loadStats,open:openDetail};
  async function loadStats(refresh=false){
    if(!refresh&&stats&&Date.now()-statsReadAt<60000){window.dispatchEvent(new CustomEvent('jxau:spending-data',{detail:stats}));return;}
    if(statsBusy)return;statsBusy=true;const gen=++generation,button=$('waterStatsRefresh');button.disabled=true;button.textContent='统计中…';$('waterStatsStatus').textContent='正在汇总账单…';
    try{
      const st=await api('/api/life798/status');if(gen!==generation)return;
      const key=st.accountKey||String(st.bound);if(key!==accountKey){clear();accountKey=key;}
      if(!st.bound){clear();window.dispatchEvent(new Event('jxau:spending-unbound'));$('waterStatsStatus').textContent='绑定798后查看饮水与洗浴花费';return;}
      const d=await api('/api/life798/spending'+(refresh?'?refresh=1':''));if(gen!==generation)return;
      stats=d;statsReadAt=Date.now();render(d);
    }catch(e){if(gen===generation){if(/重新绑定|登录.*过期/.test(e.message))clear();$('waterStatsStatus').textContent=e.message+(stats?' · 保留上次统计':'');window.dispatchEvent(new CustomEvent('jxau:spending-error',{detail:{cached:!!stats}}));}}
    finally{if(gen===generation){statsBusy=false;button.disabled=false;button.textContent='更新统计';}}
  }
  function setOpen(open){
    $('waterHistoryPanel').classList.toggle('hidden',!open);$('waterHistoryLoad').setAttribute('aria-expanded',String(open));$('waterHistoryLoad').textContent=open?'收起明细 ⌃':'查看明细 ⌄';
  }
  function closeHistory(){setOpen(false);historyEpoch++;historyBusy=false;}
  function renderHistory(d){
    const rows=Array.isArray(d.list)?d.list:[],category=k=>k==='drink'?'饮水':k==='bath'?'洗浴':'其他／待分类';
    $('waterHistoryList').innerHTML=(d.cached?'<p class="water-stats-status">缓存记录 · '+esc(time(d.updatedAt))+'</p>':'')+(rows.length?rows.map(r=>'<div class="water-history-row"><div><span class="water-bill-tag '+(r.category==='drink'?'drink':r.category==='bath'?'bath':'other')+'">'+category(r.category)+'</span><span class="water-bill-title">'+esc(r.title||'消费记录')+'</span><small>'+esc(time(r.timestamp||r.time))+'</small></div><b>'+(r.amount==null?'金额未知':'¥ '+money(r.amount))+'</b></div>').join(''):'<p class="feature-empty">本页暂无消费记录</p>');
    $('waterHistoryPage').textContent='第 '+historyPage+' 页';$('waterHistoryPrev').disabled=historyPage<=1;
    $('waterHistoryNext').disabled=d.total!=null?historyPage*(d.pageSize||10)>=d.total:rows.length<(d.pageSize||10);
  }
  async function loadHistory(page){
    const gen=++historyEpoch;historyBusy=true;setOpen(true);$('waterHistoryList').textContent='正在读取明细…';$('waterHistoryPrev').disabled=true;$('waterHistoryNext').disabled=true;
    try{
      const d=await api('/api/life798/history?page='+page);if(gen!==historyEpoch)return;historyPage=page;historyData=d;renderHistory(d);
    }catch(e){if(gen!==historyEpoch)return;$('waterHistoryList').textContent=e.message+(historyData?' · 显示上次明细':'');if(historyData){renderHistory(historyData);$('waterHistoryList').insertAdjacentHTML('afterbegin','<p class="water-stats-status">'+esc(e.message)+' · 保留上次明细</p>');}else{$('waterHistoryPrev').disabled=true;$('waterHistoryNext').disabled=true;}}
    finally{if(gen===historyEpoch)historyBusy=false;}
  }

  let detailEpoch=0,detailData=null,detailCategory='drink',detailPeriod='month',detailDate='',detailShown=30;
  const campusDate=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  function clearDetail(){detailEpoch++;detailData=null;$('waterDetailTotals').textContent='';$('waterDetailChart').textContent='';$('waterDetailList').textContent='';$('waterDetailCount').textContent='';$('waterDetailMore').classList.add('hidden');$('waterChartSelected').textContent='';$('waterDetailScope').textContent='';}
  function openDetail(category){detailCategory=category;detailPeriod='month';detailDate=campusDate(Date.now());window.Jxau.showRoute('waterSpendingDetail');window.Jxau.pushRoute('#/waterSpendingDetail');window.scrollTo(0,0);}
  function detailRows(){
    const all=detailData?.list||[];
    $('waterDetailList').innerHTML=all.length?all.slice(0,detailShown).map(r=>'<div class="water-history-row"><div><span class="water-bill-title">'+esc(r.title||'消费记录')+'</span><small>'+esc(time(r.timestamp))+'</small></div><b>¥ '+money(r.amount)+'</b></div>').join(''):'<p class="feature-empty">本期暂无已保存记录</p>';
    $('waterDetailMore').classList.toggle('hidden',detailShown>=all.length);
  }
  function renderDetail(d){
    const start=campusDate(d.start),end=campusDate(d.end-1);$('waterDetailRange').textContent=detailPeriod==='day'?start:start+' 至 '+end;
    $('waterDetailNext').disabled=d.end>Date.now();
    $('waterDetailTotals').innerHTML='<div><span>本期已记录花费</span><div class="water-amount"><strong>'+money(d.amount)+'</strong><em>元</em></div></div><div><span>消费笔数</span><b>'+(Number(d.count)||0)+' <small>笔</small></b></div><div><span>次均花费</span><b>'+money(d.average)+' <small>元</small></b></div>';
    const series=(d.series||[]).map((r,sourceIndex)=>({...r,sourceIndex})).filter(r=>!r.future),max=Math.max(...series.map(r=>Number(r.amount)),0.01),step=Math.max(1,Math.floor(series.length/6));
    $('waterDetailChart').innerHTML='<div class="water-chart-scale"><span>'+money(max)+'</span><span>'+money(max/2)+'</span><span>0</span></div><div class="water-chart-plot">'+series.map((r,i)=>'<button type="button" class="water-chart-column"'+(Number(r.amount)>0?'':' data-zero')+' data-bar="'+r.sourceIndex+'" aria-label="'+esc(r.label)+' '+money(r.amount)+'元，'+(Number(r.count)||0)+'笔"><span class="water-chart-value" style="height:'+Math.max(Number(r.amount)>0?2:0,Number(r.amount)/max*100)+'%">'+(Number(r.amount)>0?'<em>'+money(r.amount)+'</em>':'')+'</span><small>'+(i%step===0||i===series.length-1?esc(detailPeriod==='day'?r.label.slice(0,2):r.label.slice(3)):'')+'</small></button>').join('')+'</div>';
    $('waterChartSelected').textContent=Number(d.count)>0?'点击柱形查看'+(detailPeriod==='day'?'每小时':'每日')+'花费':'本期暂无已保存消费；未同步记录可能缺失';
    $('waterDetailCount').textContent=d.count+' 笔';detailShown=30;detailRows();
    $('waterDetailStatus').textContent='本机账单 · '+(d.updatedAt?'同步于 '+time(d.updatedAt):'尚未同步')+(!d.complete?' · 部分记录，可能不完整':'')+(d.invalidRecords?' · '+d.invalidRecords+' 笔数据不完整':'');
    $('waterDetailScope').textContent=(d.scope||'')+(d.savedSince?' 本机开始保存：'+campusDate(d.savedSince)+'。':'')+(d.earliestAt?' 最早已存账单：'+campusDate(d.earliestAt)+'。':'');
  }
  async function loadDetail(){
    const gen=++detailEpoch;detailData=null;detailDate=detailDate||campusDate(Date.now());
    $('waterDetailTitle').textContent=(detailCategory==='bath'?'洗浴':'饮水')+'消费统计';$('waterSpendingDetail').classList.toggle('is-bath',detailCategory==='bath');
    document.querySelectorAll('[data-detail-category]').forEach(b=>{b.classList.toggle('active',b.dataset.detailCategory===detailCategory);b.setAttribute('aria-pressed',String(b.dataset.detailCategory===detailCategory));});
    document.querySelectorAll('[data-water-period]').forEach(b=>{b.classList.toggle('active',b.dataset.waterPeriod===detailPeriod);b.setAttribute('aria-pressed',String(b.dataset.waterPeriod===detailPeriod));});
    $('waterDetailDate').max=campusDate(Date.now());$('waterDetailDate').value=detailDate;
    $('waterDetailTotals').textContent='';$('waterDetailChart').textContent='';$('waterDetailList').textContent='';$('waterDetailMore').classList.add('hidden');$('waterDetailCount').textContent='';$('waterChartSelected').textContent='';$('waterDetailScope').textContent='';
    $('waterDetailStatus').textContent='正在读取本机已保存账单…';$('waterDetailReload').disabled=true;
    try{const d=await api('/api/life798/spending/detail?category='+detailCategory+'&period='+detailPeriod+'&date='+encodeURIComponent(detailDate));if(gen!==detailEpoch)return;detailData=d;renderDetail(d);}
    catch(e){if(gen===detailEpoch)$('waterDetailStatus').textContent=e.message;}
    finally{if(gen===detailEpoch)$('waterDetailReload').disabled=false;}
  }
  function shiftDate(delta){
    if(!detailData)return;
    const d=new Date(detailDate+'T12:00:00+08:00');
    if(detailPeriod==='month'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+delta);}else d.setUTCDate(d.getUTCDate()+delta*(detailPeriod==='week'?7:1));
    detailDate=campusDate(Math.min(d.getTime(),Date.now()));void loadDetail();
  }
  window.Jxau.registerPage('waterSpendingDetail',{onShow:()=>void loadDetail(),onHide:()=>{detailEpoch++;}});
  document.querySelectorAll('[data-water-category]').forEach(card=>{card.onclick=()=>openDetail(card.dataset.waterCategory);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(card.dataset.waterCategory);}};});
  document.querySelectorAll('[data-detail-category]').forEach(b=>b.onclick=()=>{detailCategory=b.dataset.detailCategory;void loadDetail();});
  document.querySelectorAll('[data-water-period]').forEach(b=>b.onclick=()=>{detailPeriod=b.dataset.waterPeriod;void loadDetail();});
  $('waterDetailBack').onclick=()=>window.appBack();$('waterDetailReload').onclick=()=>void loadDetail();
  $('waterDetailPrev').onclick=()=>shiftDate(-1);$('waterDetailNext').onclick=()=>shiftDate(1);
  $('waterDetailDate').onchange=()=>{if($('waterDetailDate').value&&$('waterDetailDate').checkValidity()){detailDate=$('waterDetailDate').value;void loadDetail();}};
  $('waterDetailMore').onclick=()=>{detailShown+=30;detailRows();};
  $('waterDetailChart').onclick=e=>{const b=e.target.closest('[data-bar]');if(!b||!detailData)return;const r=detailData.series[Number(b.dataset.bar)];$('waterChartSelected').textContent=r.label+' · '+money(r.amount)+' 元 · '+r.count+' 笔';$('waterDetailChart').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));};

  $('waterHistoryLoad').onclick=()=>{if($('waterHistoryLoad').getAttribute('aria-expanded')==='true')closeHistory();else if(historyData){setOpen(true);renderHistory(historyData);}else void loadHistory(historyPage);};
  $('waterHistoryClose').onclick=closeHistory;
  $('waterHistoryPrev').onclick=()=>{if(!historyBusy&&historyPage>1)void loadHistory(historyPage-1);};
  $('waterHistoryNext').onclick=()=>{if(!historyBusy)void loadHistory(historyPage+1);};
  $('waterStatsRefresh').onclick=()=>void loadStats(true);
  window.addEventListener('jxau:water-refresh',()=>void loadStats(false));
  window.addEventListener('jxau:water-spent',()=>{historyData=null;void loadStats(true);if($('waterHistoryLoad').getAttribute('aria-expanded')==='true')void loadHistory(1);});
  window.addEventListener('jxau:water-account',()=>{generation++;statsBusy=false;accountKey='';clear();$('waterStatsStatus').textContent='账号已变更，返回接水页后更新统计';});
})();
