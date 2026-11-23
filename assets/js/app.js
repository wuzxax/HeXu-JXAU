
(function(){
  const $ = id => document.getElementById(id);
  const DAYS = ['一','二','三','四','五','六','日'];
  const SLOTS = 9;

  // 每小节时间（晚上只有第 9 节）
  const SLOT_TIMES = [
    ['08:00','08:45'], ['08:50','09:35'],
    ['10:05','10:50'], ['10:55','11:40'],
    ['14:00','14:45'], ['14:50','15:35'],
    ['16:05','16:50'], ['16:55','17:40'],
    ['19:00','20:30']
  ];
  // 添加课程时按大节选
  const BIG_SLOTS = [
    {v:0, r:'1-2 节',  t:'08:00'},
    {v:2, r:'3-4 节',  t:'10:05'},
    {v:4, r:'5-6 节',  t:'14:00'},
    {v:6, r:'7-8 节',  t:'16:05'},
    {v:8, r:'晚自习',  t:'19:00'}
  ];

  let UID = '';
  let currentWeek = 0, currentWeekAt = 0;
  let sessionAvailable=null, weekChanging=false, refreshTask=null;
  let loginEpoch=0;
  let secureData = {cred:null,elec:null};
  let state = { week: 0, total: 20, loaded: false, last: null };
  let elecCfg = null;
  let custom = [];
  let planScope="",planChanges={overrides:{},transfers:[]},planPast=[],planFuture=[];
  let editing = null;
  let showNight = localStorage.getItem('showNight') !== '0';
  let showMorning = localStorage.getItem('showMorning') !== '0';
  let nightRoom = localStorage.getItem('nightRoom') || '';
  let morningRoom = localStorage.getItem('morningRoom') || '';
  let morningRoomOpener=null;
  let morningDays=[0,1,2,3,4];
  try{const days=JSON.parse(localStorage.getItem('morningDays'));if(Array.isArray(days)&&days.every(d=>Number.isInteger(d)&&d>=0&&d<=6))morningDays=[...new Set(days)].sort();}catch(e){}
  let morningTime={start:445,end:450};
  try{const saved=JSON.parse(localStorage.getItem('morningTime'));if(saved&&Number.isInteger(saved.start)&&Number.isInteger(saved.end)&&saved.start>=0&&saved.end<=1439&&saved.end>saved.start)morningTime={start:saved.start,end:saved.end};}catch(e){}
  function morningRange(){return minuteText(morningTime.start)+'–'+minuteText(morningTime.end);}
  function fillMorningTime(){
    $('morningStart').value=minuteText(morningTime.start);$('morningEnd').value=minuteText(morningTime.end);
    $('morningTimeSummary').textContent='同步开启早检提醒 · '+morningRange();
  }
  $('morningTimeForm').onsubmit=e=>{
    e.preventDefault();const start=hm2min($('morningStart').value),end=hm2min($('morningEnd').value);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1439||end<=start){$('morningTimeStatus').textContent='结束时间须晚于开始时间，早检不跨天';return;}
    try{localStorage.setItem('morningTime',JSON.stringify({start,end}));}catch(e){$('morningTimeStatus').textContent='保存失败，请重试';return;}
    morningTime={start,end};$('morningTimeStatus').textContent='已保存 '+morningRange();fillMorningTime();renderMorningDays();renderToday();if(state.week)renderPages();
  };
  function renderNightDays(){
    const days=[...new Set(custom.filter(c=>c.name==='晚自习').map(c=>c.day))].sort();
    document.querySelectorAll('[data-night-day]').forEach(b=>{b.setAttribute('aria-pressed',String(days.includes(Number(b.dataset.nightDay))));b.disabled=!showNight;});
    $('nightDaysHint').textContent=!showNight?'晚自习已关闭':days.length?'周'+days.map(d=>DAYS[d]).join('、')+' · 点击课表中的晚自习可修改时间与周次':'未选择星期，点击上方添加晚自习';
  }
  document.querySelectorAll('[data-night-day]').forEach(b=>b.onclick=async()=>{
    const day=Number(b.dataset.nightDay),exists=custom.some(c=>c.name==='晚自习'&&c.day===day);
    if(exists&&!await window.HexuConfirm.ask('移除周'+DAYS[day]+'的晚自习？','将删除该星期的晚自习安排，之后可重新添加。','确认移除'))return;
    const next=exists?custom.filter(c=>c.name!=='晚自习'||c.day!==day):custom.concat({id:'night-'+Date.now()+'-'+day,day,start:1140,end:1230,name:'晚自习',room:nightRoom||'',custom:true});
    if(calendarSave(next))renderNightDays();
  });
  function morningEnabled(day){return showMorning&&morningDays.includes(day);}
  function renderMorningDays(){
    document.querySelectorAll('[data-morning-day]').forEach(b=>{b.setAttribute('aria-pressed',String(morningDays.includes(Number(b.dataset.morningDay))));b.disabled=!showMorning;});
    const el=$('morningDaysHint');if(el)el.textContent=!showMorning?'早检提醒已关闭':morningDays.length?'周'+morningDays.map(d=>DAYS[d]).join('、')+' · '+morningRange():'未选择星期，将不显示早检提醒';
  }
  document.querySelectorAll('[data-morning-day]').forEach(b=>b.onclick=()=>{
    const day=Number(b.dataset.morningDay),next=morningDays.includes(day)?morningDays.filter(d=>d!==day):morningDays.concat(day).sort();
    try{localStorage.setItem('morningDays',JSON.stringify(next));}catch(e){toast('星期保存失败，请重试');return;}
    morningDays=next;renderMorningDays();renderToday();if(state.week)renderPages();
  });

  async function j(path, opts){
    const r = await fetch(path, opts);
    const data=await r.json();if(!r.ok&&data&&typeof data==='object')data.httpStatus=r.status;
    return data;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  function toast(msg){
    const t = $('toast');
    if(!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // 固定调色板：同一门课永远同色，不同课按分配顺序取色，避免相邻撞色
  const PALETTE = [
    '#e9f2ec', '#fdf0e3', '#e7eef9', '#f4e9f7', '#fdecea',
    '#eaf4e1', '#f8f1da', '#e3f3f1', '#f1e7f3', '#fde8ef',
    '#e8f0f7', '#f6ecdf'
  ];
  const NIGHT_PALETTE = [
    ['#203b31','#5c9b83'], ['#443127','#bf8668'], ['#24364d','#6c9bc8'],
    ['#3b2c4b','#a88bc1'], ['#482c34','#c68292'], ['#354022','#8b9f60'],
    ['#443923','#b39a58'], ['#213d40','#62a2a9'], ['#342c50','#9383ca'],
    ['#492d42','#ba7aad'], ['#29394b','#7795b7'], ['#43322f','#b28a7c']
  ];
  const colorMap = new Map();
  function courseColorIndex(name){
    const key = String(name);
    if(!colorMap.has(key))colorMap.set(key,colorMap.size % PALETTE.length);
    return colorMap.get(key);
  }
  function colorFor(name){
    return PALETTE[courseColorIndex(name)];
  }
  function styleCourseBlock(block,name){
    const index=courseColorIndex(name),[surface,edge]=NIGHT_PALETTE[index];
    block.style.setProperty('--course-day',PALETTE[index]);
    block.style.setProperty('--course-night',surface);
    block.style.setProperty('--course-night-edge',edge);
  }

  function weekDates(weekNo){
    const w = weekNo || state.week || 1;
    const now = new Date();
    const dow = now.getDay() || 7;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - (dow - 1));
    const targetMon = new Date(thisMon);
    targetMon.setDate(thisMon.getDate() + (w - realWeek()) * 7);
    const out = [];
    for(let i = 0; i < 7; i++){
      const d = new Date(targetMon);
      d.setDate(targetMon.getDate() + i);
      out.push((d.getMonth() + 1) + '/' + d.getDate());
    }
    return out;
  }

  // ---------------- 自定义课程 ----------------
  function defaultCustom(){
    // 周一、三、四、日 晚自习 19:00-20:30（只占第 9 节一格）
    return [0,2,3,6].map(d => ({
      day: d, slot: 8, span: 1, name: '晚自习', room: '19:00-20:30', custom: true
    }));
  }

  function customRange(item){
    const slot=Math.max(0,Math.min(8,Number(item.slot)||0)),last=Math.max(slot,Math.min(8,slot+(Number(item.span)||1)-1));
    return {start:Number.isFinite(item.start)?item.start:hm2min(SLOT_TIMES[slot][0]),end:Number.isFinite(item.end)?item.end:hm2min(SLOT_TIMES[last][1])};
  }
  function loadCustom(){
    try{const saved=localStorage.getItem('custom');custom=saved?JSON.parse(saved):defaultCustom();}catch(e){custom=defaultCustom();}
    if(!Array.isArray(custom))custom=defaultCustom();
    custom=custom.filter(c=>c&&Number.isInteger(c.day)&&c.day>=0&&c.day<7&&typeof c.name==='string').map((c,i)=>({...c,id:c.id||('legacy-'+i+'-'+c.day+'-'+c.slot),...customRange(c)})).filter(c=>c.start>=480&&c.end<=1230&&c.end>c.start);
  }
  function saveCustom(){localStorage.setItem('custom',JSON.stringify(custom));}
  function openModal(day,slot,item,source){if(window.JxauCalendar)window.JxauCalendar.open(day,hm2min(SLOT_TIMES[slot][0]),item,source);}
  function closeModal(immediate){if(window.JxauCalendar)return window.JxauCalendar.close(!!immediate);$('modal').classList.add('hidden');}

  // ---------------- 登录 ----------------
  async function loadCaptcha(){
    $('c').placeholder = '验证码加载中…';
    $('cap').style.opacity = '0.35';
    try{
      const d = await j('/api/captcha');
      if(!d.ok){ $('err').textContent = d.msg || '验证码加载失败'; return; }
      UID = d.uid;
      $('cap').src = d.img;
      $('cap').style.opacity = '1';
      $('c').placeholder = '看图填结果';
      $('c').value = '';
    }catch(e){
      $('err').textContent = '网络错误：' + e;
    }
  }

  const SAVED_PASSWORD_MASK='••••••••';
  let savedPasswordAccount='';
  function hideLoginPassword(){$('p').type='password';$('passwordToggle').setAttribute('aria-pressed','false');$('passwordToggle').setAttribute('aria-label','显示密码');$('passwordToggle').querySelector('.password-eye-slash').setAttribute('hidden','');if(savedPasswordAccount)$('p').value=SAVED_PASSWORD_MASK;}
  function updateSavedPassword(){
    const saved=secureData.cred?.saved&&secureData.cred.u===$('u').value.trim();
    if(savedPasswordAccount&&savedPasswordAccount!==$('u').value.trim()){hideLoginPassword();}
    if(savedPasswordAccount&&savedPasswordAccount!==$('u').value.trim()){$('p').value='';savedPasswordAccount='';}
    if(saved&&!$('p').value){$('p').value=SAVED_PASSWORD_MASK;savedPasswordAccount=$('u').value.trim();}
    if(!saved&&savedPasswordAccount){$('p').value='';savedPasswordAccount='';}
    $('p').dataset.saved=String(!!savedPasswordAccount);
    $('savedPasswordHint').textContent=savedPasswordAccount?'已填入本机加密保存的密码，登录时自动使用；输入新密码可替换。':'';
    $('forgetPassword').classList.toggle('hidden',!secureData.cred?.saved);
  }
  $('u').addEventListener('input',updateSavedPassword);
  $('p').addEventListener('focus',()=>{if(savedPasswordAccount)$('p').select();});
  $('p').addEventListener('beforeinput',e=>{
    if(!savedPasswordAccount)return;
    if(!e.inputType.startsWith('delete'))$('p').select();
    else $('p').value='';
    savedPasswordAccount='';$('p').dataset.saved='false';$('savedPasswordHint').textContent='';
  });
  $('p').addEventListener('input',()=>{savedPasswordAccount='';$('p').dataset.saved='false';$('savedPasswordHint').textContent='';});
  $('p').addEventListener('blur',()=>{if(!$('p').value)updateSavedPassword();});
  $('passwordToggle').onclick=()=>{
    if($('p').type==='text'){hideLoginPassword();return;}
    if(savedPasswordAccount){
      $('p').focus();
      $('savedPasswordHint').textContent='已保存的密码会自动用于登录。重新输入密码后，可以点眼睛检查输入内容。';
      return;
    }
    const button=$('passwordToggle');
    $('p').type='text';
    button.setAttribute('aria-pressed','true');
    button.setAttribute('aria-label','隐藏密码');
    button.querySelector('.password-eye-slash').removeAttribute('hidden');
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hideLoginPassword();});
  window.addEventListener('blur',hideLoginPassword);
  $('forgetPassword').onclick=async()=>{
    if(!await window.HexuConfirm.ask('删除已保存的校园密码？','仅删除本机加密保存的校园密码，当前登录仍保留。登录过期后需要重新输入密码。'))return;
    $('forgetPassword').disabled=true;
    try{await saveVault('cred',null);$('p').value='';updateSavedPassword();fillSettings();toast('已删除保存的校园密码，当前登录暂保留');}
    catch(e){toast('删除失败，请重试');}finally{$('forgetPassword').disabled=false;}
  };
  async function doLogin(){
    hideLoginPassword();
    const u = $('u').value.trim();
    const useSaved=!!(savedPasswordAccount===u&&secureData.cred?.saved&&secureData.cred.u===u),p=useSaved?'':$('p').value;
    const c = $('c').value.trim();
    if(!u || (!p&&!useSaved) || !c){ $('err').textContent = '学号、密码、验证码都要填'; return; }
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = '登录中…';
    $('err').textContent = '';
    try{
      const d = await j('/api/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:u, password:p,useSaved:!!useSaved,uid:UID,code:c})
      });
      if(d.ok){
        loginEpoch++;
        // Invalidate every request issued by the previous login, including the same account.
        weekEpoch++;pendingWeeks.clear();
        Object.values(weekCache).forEach(value=>{value.stale=true;});
        sessionAvailable=true;
        clearLoginFeedback();
        secureData.cred=d.passwordSaved?{u,saved:true}:null;$('p').value='';if(d.storageWarning)toast(d.storageWarning);
        if(accountName!==u)clearWeekMemory();
        accountName=u;
        state.loaded = false;
        await showSchedule();
        switchMainTab('today');
        if(sessionAvailable&&state.loaded)void cacheSemester();
      }
      else { $('err').textContent = d.msg || '登录失败'; loadCaptcha(); }
    }catch(e){
      $('err').textContent = '网络错误：' + e;
    }finally{
      $('p').value='';savedPasswordAccount='';updateSavedPassword();
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = '登录';
    }
  }

  // ---------------- 课表 ----------------
  async function loadWeek(n, force){
    if(force){weekEpoch++;pendingWeeks.clear();}
    const epoch=weekEpoch, owner=accountName;
    if(!state.loaded) $('weekLabel').textContent = '加载中…';
    try{
      const d = await j('/api/week?n=' + encodeURIComponent(n)+(force?'&refresh=1':''));
      if(epoch!==weekEpoch||owner!==accountName)return false;
      if(!d.ok){
        const msg = String(d.msg || '');
        if(needsScheduleLogin(d)){
          sessionAvailable=false;
          if(hasCache()){
            markOffline();
            renderPages();
            reportSchedule('登录已过期，已保留缓存课表。','warning',true);
            return false;
          }
          toast('登录已过期，请重新登录');
          showLogin();
          return false;
        }
        markOffline();
        toast(msg || '加载失败');
        if(!hasCache()) $('weekLabel').textContent = '加载失败';
        return false;
      }
      // Retain other downloaded weeks for offline use, but invalidate their freshness.
      if(force&&!d.data.stale)Object.values(weekCache).forEach(value=>{value.stale=true;});
      sessionAvailable=true;
      clearLoginFeedback();
      acceptWeek(d.data);
      if(n === 0){
        state.week = d.data.week || 1; currentWeek = d.data.currentWeek || state.week; currentWeekAt = d.data.anchorAt || Date.now();
        state.total = d.data.weekcount || 20;
        weekCache[state.week] = d.data;
      }else{
        weekCache[n] = d.data;
        state.week = n;
        if(!state.total) state.total = d.data.weekcount || 20;
      }
      state.loaded = true;
      await loadThree();
      if(d.data.warning)toast(d.data.warning);
      return !d.data.stale;
    }catch(e){
      if(epoch!==weekEpoch)return false;
      markOffline();
      toast(hasCache()?'网络不可用，显示上次课表':'网络错误：' + e);
      return false;
    }
  }

  // ---------------- 三页渲染（左右翻页） ----------------
  const weekCache = {};
  let weekEpoch=0, cacheTerm='';
  const pendingWeeks=new Map();
  let semesterTask=null;
  let scheduleFeedbackTimer=null;
  function needsScheduleLogin(data){
    const msg=String(data&&data.msg||'');
    return !!(data&&(data.httpStatus===401||data.loginRequired))||/请.*重新登录|请先登录|登录.*(?:过期|失效)|缺少.*登录|未登录|登录超时/.test(msg);
  }
  function clearLoginFeedback(){
    ['scheduleFeedback','homeRefreshStatus'].forEach(id=>{const el=$(id);if(el&&el.dataset.loginRequired==='true'){el.textContent='';el.className='refresh-feedback hidden';delete el.dataset.loginRequired;}});
  }
  function semesterStatus(text,kind){
    const el=$('semesterCacheStatus');if(!el)return;
    el.textContent=text;el.className='semester-cache-status '+(kind||'');
  }
  async function cacheSemester(){
    const epoch=weekEpoch,owner=accountName,term=cacheTerm;
    if(!owner||!state.loaded||sessionAvailable===false)return;
    if(semesterTask&&semesterTask.epoch===epoch)return semesterTask.promise;
    const active=()=>epoch===weekEpoch&&owner===accountName&&term===cacheTerm;
    const complete=()=>Array.from({length:state.total},(_,i)=>weekCache[i+1]).filter(d=>d&&!d.stale).length;
    const job={epoch:epoch,promise:null};semesterTask=job;
    job.promise=(async()=>{
      semesterStatus('正在缓存整学期课表 · '+complete()+'/'+state.total+' 周','loading');
      for(let n=1;n<=state.total;n++){
        if(!active()||sessionAvailable===false)break;
        const cached=weekCache[n];
        if(!cached||cached.stale){await fetchWeek(n);if(!active())break;saveCache();}
        if(active())semesterStatus('正在缓存整学期课表 · '+complete()+'/'+state.total+' 周','loading');
      }
      if(!active())return;
      const count=complete(),saved=saveCache();
      semesterStatus(!saved?'本机缓存保存失败，请检查剩余空间':count===state.total?'整学期课表已缓存 · 共 '+count+' 周':'学期缓存未完成 · '+count+'/'+state.total+' 周，联网刷新后继续',saved&&count===state.total?'success':'warning');
      if(activeTab==='today')renderToday();
    })().finally(()=>{if(semesterTask===job)semesterTask=null;});
    return job.promise;
  }
  function cacheKey(){return accountName?'jxau_weeks:v3:'+encodeURIComponent(accountName):'';}
  function clearWeekMemory(){
    resetWeekMotion();
    window.dispatchEvent(new Event('jxau:plan-changed'));
    weekEpoch++;pendingWeeks.clear();Object.keys(weekCache).forEach(k=>delete weekCache[k]);
    cacheTerm='';currentWeek=0;currentWeekAt=0;state.week=0;state.loaded=false;
    semesterStatus('');
  }
  function acceptWeek(data){
    const term=(data.xn||'')+':'+(data.xq||'');
    if(cacheTerm&&cacheTerm!==term){Object.keys(weekCache).forEach(k=>delete weekCache[k]);currentWeek=0;currentWeekAt=0;}
    cacheTerm=term;
    if(!data.fetchedAt)data.fetchedAt=Date.now();
    if(data.currentWeek){currentWeek=data.currentWeek;currentWeekAt=data.anchorAt||Date.now();}
    state.total=data.weekcount||state.total;
  }
  function markOffline(){
    Object.values(weekCache).forEach(d=>{d.stale=true;d.cached=true;});
    if(hasCache())renderPages();
  }
  function reportSchedule(message,kind,login){
    clearTimeout(scheduleFeedbackTimer);
    ['scheduleFeedback','homeRefreshStatus'].forEach(id=>{
      const el=$(id);
      el.dataset.loginRequired=login?'true':'false';
      if(login){el.textContent='';el.className='refresh-feedback hidden';return;}
      el.className='refresh-feedback '+(kind||'');
      el.textContent=message;
      if(login){const button=document.createElement('button');button.type='button';button.textContent='重新登录';button.onclick=showLogin;el.appendChild(button);}
    });
    if(kind==='success')scheduleFeedbackTimer=setTimeout(()=>{
      ['scheduleFeedback','homeRefreshStatus'].forEach(id=>{const el=$(id);el.textContent='';el.className='refresh-feedback hidden';delete el.dataset.loginRequired;});
    },4000);
  }
  async function refreshSchedule(n){
    if(refreshTask)return refreshTask;
    if(sessionAvailable===false){showLogin();toast('请先登录后刷新课表');return false;}
    resetWeekMotion();
    const buttons=[$('btnReload'),$('tdRefresh')];
    const labels=buttons.map(b=>b.innerHTML);
    buttons.forEach(b=>{b.disabled=true;b.classList.add('is-refreshing');b.setAttribute('aria-busy','true');});
    $('btnReload').textContent='刷新中…';$('tdRefresh').querySelector('.gt').textContent='刷新中…';
    $('schedule').setAttribute('aria-busy','true');
    reportSchedule('正在读取最新课表…','loading');
    refreshTask=(async()=>{
      const epoch=weekEpoch,owner=accountName,auth=loginEpoch;
      try{
        const st=await j('/api/status?refresh=1');if(epoch!==weekEpoch||owner!==accountName)return false;
        if(st.httpStatus&&st.httpStatus!==401)throw new Error(st.msg||'校园认证服务暂不可用');
        sessionAvailable=!!st.logged_in;
        if(!sessionAvailable){markOffline();reportSchedule('登录已过期，已保留本机课表。','warning',true);showLogin();toast('请重新登录后刷新课表');return false;}
        const ok=await loadWeek(n,true);
        if(auth!==loginEpoch||owner!==accountName)return false;
        renderToday();
        if(ok){
          const d=weekCache[state.week];
          reportSchedule(d&&d.warning?'已刷新 · '+d.warning:'课表已更新 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}),d&&d.warning?'warning':'success');
          toast(d&&d.warning?'已使用备用来源刷新':'课表刷新成功');
          void cacheSemester();
        }else{
          reportSchedule(sessionAvailable===false?'登录已过期，已保留本机课表。':'刷新未完成，已保留上次课表。', 'warning',sessionAvailable===false);
          if(sessionAvailable===false)showLogin();
        }
        return ok;
      }catch(e){if(auth!==loginEpoch||owner!==accountName)return false;markOffline();reportSchedule((e.message||'网络连接失败')+'，已保留上次课表。','warning');toast('刷新失败，请稍后重试');return false;}
      finally{
        buttons.forEach((b,i)=>{b.disabled=false;b.classList.remove('is-refreshing');b.removeAttribute('aria-busy');b.innerHTML=labels[i];});
        $('schedule').removeAttribute('aria-busy');refreshTask=null;
      }
    })();
    return refreshTask;
  }

  function scheduleGridHtml(weekNo){
    // The calendar overlay draws resolved school courses and local events over this grid.
    const dates = weekDates(weekNo);
    let html = '<table><thead><tr><th class="slot morning-slot">'+(showMorning?'<button type="button" class="morning-room-button" aria-label="'+esc('设置早检教室，当前'+(morningRoom||'未设置'))+'"><span>早检教室</span><small>'+esc(morningRoom||'设置')+'</small></button>':'<span class="slot-label">节次</span>')+'</th>';
    DAYS.forEach((d, i) => { html += '<th>周' + d + '<small>' + dates[i] + '</small>'+(morningEnabled(i)?'<span class="morning-day-mark" aria-label="当日早检">早检</span>':'')+'</th>'; });
    html += '</tr></thead><tbody>';

    for(let s = 0; s < SLOTS; s++){
      if(s === 4) html += '<tr class="divider"><td colspan="8"><span>午休</span></td></tr>';
      if(s === 8) html += '<tr class="divider"><td colspan="8"><span>晚休</span></td></tr>';
      const t = SLOT_TIMES[s];
      html += '<tr><td class="slot"><b>' + (s + 1) + '</b><em>' + t[0] + '</em><em>' + t[1] + '</em></td>';

      for(let d = 0; d < 7; d++) html += '<td class="empty" data-day="' + d + '" data-slot="' + s + '"></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function updateWeekLabel(){
    const d = weekCache[state.week] || Object.values(weekCache)[0] || {};
    let year=String(d.xn||'');
    if(/^\d{4}$/.test(year))year+='-'+(Number(year)+1);
    $('weekLabel').innerHTML = '第 ' + Math.max(1,state.week) + ' 周' +
      '<small>' + esc(year ? year + '-' + (d.xq || '') + ' · ' : '') + '共 ' + state.total + ' 周</small>';
    const source=d.source==='jwgl'?'教务课表':d.source==='portal'?'门户课表':'学校课表';
    const stamp=d.fetchedAt?new Date(d.fetchedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    $('scheduleSource').textContent=!weekCache[state.week]?'本地日程 · 学校课表尚未缓存':source+(d.stale?' · 离线缓存':d.cached?' · 已缓存':'')+(stamp?' · 更新于 '+stamp:'')+(d.warning?' · '+d.warning:'');
    $('scheduleSource').classList.toggle('is-warning',!!d.warning||!!d.stale);
  }

  function renderPages(){
    // Background prefetch must not move or replace the page under a finger.
    if(swiping||weekChanging||(window.JxauCalendar&&window.JxauCalendar.dragging))return;
    const wd = wrap.clientWidth || document.documentElement.clientWidth;
    const items = [
      { el: $('pgL'), n: state.week - 1 },
      { el: $('pgC'), n: state.week },
      { el: $('pgR'), n: state.week + 1 }
    ];
    items.forEach(it => {
      it.el.style.width = wd + 'px';
      it.el.innerHTML = scheduleGridHtml(it.n);
    });
    const pages = $('pages');
    pages.style.width = (wd * 3) + 'px';
    pages.style.transition = 'none';
    pages.style.transform = 'translate3d(' + (-wd) + 'px,0,0)';
    window.dispatchEvent(new Event('jxau:plan-changed'));
    updateWeekLabel();if(window.JxauCalendar)window.JxauCalendar.render();
  }

  async function fetchWeek(n){
    if(n < 1 || n > state.total) return null;
    const cached=weekCache[n];
    if(sessionAvailable===false)return cached||null;
    if(cached&&!cached.stale&&Date.now()-(cached.fetchedAt||0)<300000)return cached;
    if(pendingWeeks.has(n))return pendingWeeks.get(n);
    const epoch=weekEpoch,owner=accountName;
    const task=(async()=>{
      try{
        const d=await j('/api/week?n='+n);
        if(epoch!==weekEpoch||owner!==accountName)return null;
        if(!d.ok){if(needsScheduleLogin(d))sessionAvailable=false;if(cached){cached.stale=true;cached.cached=true;}return cached||null;}
        acceptWeek(d.data);weekCache[n]=d.data;return d.data;
      }catch(e){if(epoch===weekEpoch&&cached){cached.stale=true;cached.cached=true;}return cached||null;}
      finally{if(epoch===weekEpoch)pendingWeeks.delete(n);}
    })();
    pendingWeeks.set(n,task);return task;
  }

  async function loadThree(){
    const epoch=weekEpoch;
    renderPages();
    await Promise.all([fetchWeek(state.week - 1), fetchWeek(state.week), fetchWeek(state.week + 1)]);
    if(epoch!==weekEpoch)return;
    renderPages();
    saveCache();
  }

  // ---------------- 本地缓存：打开 App 直接能看到课表 ----------------
  function saveCache(){
    try{
      window.dispatchEvent(new Event('jxau:plan-changed'));
      const data = {};
      Object.keys(weekCache).forEach(k => { data[k] = weekCache[k]; });
      if(!cacheKey())return false;
      localStorage.setItem(cacheKey(), JSON.stringify({
        schema:3, owner:accountName,term:cacheTerm,week: state.week, total: state.total, currentWeek:currentWeek, currentWeekAt:currentWeekAt, data: data
      }));
      return true;
    }catch(e){return false;}
  }

  function restoreCache(){
    try{
      if(!cacheKey())return false;
      const s = localStorage.getItem(cacheKey());
      if(!s) return false;
      const o = JSON.parse(s);
      if(!o || o.schema!==3 || o.owner!==accountName || !o.data || !o.week) return false;
      cacheTerm=o.term||'';
      state.week = o.week; currentWeek=o.currentWeek || o.week; currentWeekAt=o.currentWeekAt || Date.now();
      state.total = o.total || 20;
      Object.keys(o.data).forEach(k => { weekCache[k] = o.data[k];weekCache[k].cached=true; });
      // Repair a selected week saved by earlier versions after a failed swipe.
      if(!weekCache[state.week]){
        const available=Object.keys(weekCache).map(Number).filter(n=>n>=1&&n<=state.total);
        if(!available.length)return false;
        state.week=weekCache[currentWeek]?currentWeek:available.sort((a,b)=>Math.abs(a-currentWeek)-Math.abs(b-currentWeek))[0];
      }
      state.loaded = true;   // 有缓存就算已加载，滑动才能生效
      const count=Object.keys(weekCache).filter(k=>Number(k)>=1&&Number(k)<=state.total).length;
      semesterStatus(count===state.total?'本机已缓存整学期课表 · 共 '+count+' 周':'本机已缓存 '+count+'/'+state.total+' 周，联网后继续缓存');
      return true;
    }catch(e){ return false; }
  }

  function hasCache(){
    return !!(weekCache[state.week]);
  }

  async function commit(dir){
    if(weekChanging||refreshTask)return;
    const target = state.week + dir;
    if(target < 1 || target > state.total){ await returnWeek();return; }
    weekChanging=true;
    const epoch=weekEpoch, motion=motionGeneration;
    let changed=false;
    try{
      let data=weekCache[target];
      if(!data){
        reportSchedule('正在读取第 '+target+' 周…','loading');
        // Keep the current week visible while an uncached week loads.
        [data]=await Promise.all([fetchWeek(target),animateWeek(0)]);
      }
      if(epoch!==weekEpoch||motion!==motionGeneration)return;
      if(!data){
        reportSchedule('第 '+target+' 周尚未缓存，已保留当前课表。','warning',sessionAvailable===false);
        toast(sessionAvailable===false?'请登录后读取其他周；已缓存周仍可滑动查看':'此周未能读取，已保留当前课表');
        return;
      }
      const targetPage=$(dir>0?'pgR':'pgL');
      targetPage.innerHTML=scheduleGridHtml(target);
      // Local arrangements travel with the incoming school timetable.
      window.JxauCalendar?.renderPage(targetPage,target,false);
      if(!await animateWeek(-dir*wrap.clientWidth))return;
      if(epoch!==weekEpoch||motion!==motionGeneration)return;
      state.week=target;changed=true;saveCache();
      if(sessionAvailable===false)reportSchedule('离线查看缓存课表，登录后可更新。','warning',true);
      else $('scheduleFeedback').classList.add('hidden');
    }finally{
      if(motion===motionGeneration){
        weekChanging=false;renderPages();
        // Cached weeks settle immediately; refresh adjacent data afterwards.
        if(changed)void loadThree();
      }
    }
  }

  // ---------------- 电费 ----------------






  function renderElecBind(){
    ++elecGeneration;
    $('elecRefresh').classList.add('hidden');
    $('elecBody').innerHTML =
      '<section class="card elec-bind-card"><h2>绑定空调电费账号</h2>' +
        '<p>输入在学校空调电费系统登记的手机号，即可查询对应房间的余额和用量。</p>' +
        '<label for="elecPhone" class="lbl">登记手机号</label><input id="elecPhone" class="elec-input" inputmode="tel" autocomplete="tel" placeholder="请输入手机号">' +
        '<button id="elecBind" class="elec-btn">绑定并查询</button>' +
        '<div id="elecErr" class="err" role="status"></div></section>' +
      '<section class="card elec-bind-card"><a class="fee-outline full-width" href="jxau-pocket://payment/open/aircon">前往完美校园缴费 ↗</a>' +
        '<p>打开后请选择对应的空调电费项目。</p></section>';
    $('elecBind').onclick = doBindElec;
  }

  async function doBindElec(){
    const p = $('elecPhone').value.trim();
    if(!p){ $('elecErr').textContent = '请输入手机号'; return; }
    $('elecBind').disabled = true;
    $('elecBind').textContent = '查询中…';
    $('elecErr').textContent = '';
    try{
      const d = await j('/api/elec/bind?phone=' + encodeURIComponent(p));
      if(!d.ok){ $('elecErr').textContent = d.msg || '绑定失败'; return; }
      const room = d.rooms[0];
      elecCfg = { userId: d.userId, roomId: room.roomId, roomName: room.fullName || room.roomName, phone: p, rooms:d.rooms, costType:0 };
      await saveVault('elec', elecCfg);
      await refreshElec();
    }catch(e){
      $('elecErr').textContent = '网络错误：' + e;
    }finally{
      if($('elecBind')){$('elecBind').disabled=false;$('elecBind').textContent='绑定并查询';}
    }
  }





  // ---------------- 视图切换 ----------------


  async function showSchedule(useCache){
    $('login').classList.add('hidden');
    hideMainPages();
    $('schedule').classList.remove('hidden');
    setTabbarVisible(true);
    $('elec').classList.add('hidden');
    $('library').classList.add('hidden');
    if(sessionAvailable===false){state.week=Math.max(1,state.week);renderPages();return;}
    if(useCache && hasCache()){
      renderPages();
    }else{
      $('weekLabel').textContent = '加载中…';
    }
    await loadWeek(0);
    if(!localStorage.getItem('swipeHint')){
      setTimeout(() => {
        if(document.body.dataset.page!=='schedule'||window.HexuOverlayScroll?.isLocked())return;
        toast('左右滑动可以切换周次');
        localStorage.setItem('swipeHint', '1');
      }, 900);
    }
  }

  // ---------------- 事件 ----------------
  $('cap').addEventListener('click', loadCaptcha);
  $('loginBtn').addEventListener('click', doLogin);
  $('c').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
  $('p').addEventListener('keydown', e => { if(e.key === 'Enter') $('c').focus(); });

  // Frame-batched dragging and animated settlement share one cancellable motion.
  const wrap = document.querySelector('.table-wrap');
  let swiping = false, touchReady=false, swX = 0, swY = 0, swDx = 0;
  let dragFrame=0, motionGeneration=0, finishMotion=null, samples=[], suppressWeekClick=0;

  function paintWeekDrag(){
    cancelAnimationFrame(dragFrame);
    dragFrame=0;
    const pages=$('pages');pages.style.transition='none';
    pages.style.transform='translate3d('+(-wrap.clientWidth+swDx)+'px,0,0)';
  }
  function resetWeekMotion(){
    motionGeneration++;touchReady=false;swiping=false;weekChanging=false;
    cancelAnimationFrame(dragFrame);dragFrame=0;
    if(finishMotion)finishMotion(false);
    $('pages').style.transition='none';
    $('pages').style.transform='translate3d('+(-wrap.clientWidth)+'px,0,0)';
  }
  function animateWeek(offset){
    cancelAnimationFrame(dragFrame);dragFrame=0;
    const pages=$('pages'),wd=wrap.clientWidth;
    const x=new DOMMatrixReadOnly(getComputedStyle(pages).transform).m41;
    const target=-wd+offset;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced||Math.abs(x-target)<1?0:Math.max(180,Math.min(320,180+Math.abs(x-target)/wd*140));
    if(finishMotion)finishMotion(false);
    pages.style.transition='none';pages.style.transform='translate3d('+x+'px,0,0)';
    void pages.offsetWidth;
    return new Promise(resolve=>{
      let timer;
      const done=ok=>{
        clearTimeout(timer);pages.removeEventListener('transitionend',ended);
        if(finishMotion===done)finishMotion=null;
        resolve(ok);
      };
      const ended=e=>{if(e.target===pages&&e.propertyName==='transform')done(true);};
      finishMotion=done;
      pages.style.transition=duration?'transform '+duration+'ms cubic-bezier(.22,.75,.25,1)':'none';
      pages.style.transform='translate3d('+target+'px,0,0)';
      if(!duration){done(true);return;}
      pages.addEventListener('transitionend',ended);
      timer=setTimeout(()=>done(true),duration+80);
    });
  }
  async function returnWeek(){
    const motion=motionGeneration;weekChanging=true;
    try{await animateWeek(0);}
    finally{if(motion===motionGeneration){weekChanging=false;renderPages();}}
  }

  wrap.addEventListener('touchstart', e => {
    touchReady=!e.target.closest('.calendar-event:not(.school-occurrence)')&&e.touches.length===1&&state.loaded&&!weekChanging&&!refreshTask;
    if(!touchReady) return;
    swX = e.touches[0].clientX;
    swY = e.touches[0].clientY;
    swDx = 0;
    swiping = false;
    samples=[{x:swX,t:performance.now()}];
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if(!touchReady||weekChanging||refreshTask)return;
    if(e.touches.length!==1){touchReady=false;if(swiping){swiping=false;void returnWeek();}return;}
    const dx = e.touches[0].clientX - swX;
    const dy = e.touches[0].clientY - swY;
    if(!swiping){
      if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
      if(Math.abs(dy)>Math.abs(dx)){touchReady=false;return;}
      swiping = true;
    }
    e.preventDefault();
    const wd = wrap.clientWidth;
    const edge=(dx>0&&state.week<=1)||(dx<0&&state.week>=state.total);
    swDx=edge?Math.sign(dx)*Math.min(42,Math.abs(dx)*.22):Math.max(-wd,Math.min(wd,dx));
    const now=performance.now();samples.push({x:e.touches[0].clientX,t:now});
    while(samples.length>2&&now-samples[0].t>90)samples.shift();
    if(!dragFrame)dragFrame=requestAnimationFrame(paintWeekDrag);
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    touchReady=false;
    if(!swiping) return;
    swiping = false;
    suppressWeekClick=performance.now()+300;
    paintWeekDrag();
    const wd = wrap.clientWidth;
    const first=samples[0],last=samples[samples.length-1];
    const velocity=last&&performance.now()-last.t<100?(last.x-first.x)/Math.max(16,last.t-first.t):0;
    const flick=Math.abs(swDx)>24&&Math.abs(velocity)>.45&&Math.sign(velocity)===Math.sign(swDx);
    if(Math.abs(swDx)>wd*.18||flick){
      const dir=swDx<0?1:-1;
      if(state.week+dir>=1&&state.week+dir<=state.total){void commit(dir);return;}
    }
    void returnWeek();
  });
  wrap.addEventListener('touchcancel',()=>{touchReady=false;if(swiping){swiping=false;paintWeekDrag();void returnWeek();}});
  wrap.addEventListener('click',e=>{
    if(weekChanging||performance.now()<suppressWeekClick){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  window.addEventListener('resize',()=>{resetWeekMotion();if(state.loaded)renderPages();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){resetWeekMotion();if(state.loaded)renderPages();}});
  $('btnToday').addEventListener('click',async()=>{
    if(weekChanging||refreshTask)return;
    resetWeekMotion();
    const n=realWeek();
    if(n>=1&&n<=state.total&&weekCache[n]){state.week=n;renderPages();saveCache();}
    else if(sessionAvailable===false)reportSchedule('本周尚未缓存，请登录后读取。','warning',true);
    else await loadWeek(0);
  });
  $('btnReload').addEventListener('click',()=>refreshSchedule(state.week||0));

  $('elecBack').addEventListener('click', closeElec);
  $('elecRefresh').addEventListener('click', refreshElec);

  // ---------------- 主页面 / 底部导航 ----------------
  const MAIN_PAGES = ['today','schedule','chaoxing','waterDevice','settings'];

  function hideMainPages(){
    MAIN_PAGES.forEach(id => { const el = $(id); if(el) el.classList.add('hidden'); });
  }

  function setTabbarVisible(v){
    const t = $('mainTabbar');
    if(t) t.classList.toggle('hidden', !v);
  }

  let activeTab = 'today';

  // 写一条历史记录（不是 replaceState！replaceState 不新增记录，返回键就没有可退的地方）
  function pushRoute(hash){
    if(location.hash === hash) return;
    try{ history.pushState({ h: hash }, '', hash); }catch(e){}
  }





  // 进入二级页（电费/图书馆等）：隐藏主页面和底栏
  function enterSubPage(){
    hideMainPages();
    setTabbarVisible(false);
  }

  // 从二级页回到主页面
  function backToTab(name){
    $('elec').classList.add('hidden');
    $('library').classList.add('hidden');
    const bd = $('bookDetail');
    if(bd) bd.classList.add('hidden');
    switchMainTab(name || 'today', true);
  }

  // ---------------- 今日页 ----------------
  function hm2min(t){
    const p = String(t).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function nowSlotIndex(){
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    for(let s = 0; s < SLOTS; s++){
      const a = hm2min(SLOT_TIMES[s][0]);
      const b = hm2min(SLOT_TIMES[s][1]);
      if(cur >= a && cur < b) return { s: s, cur: cur, a: a, b: b };
    }
    return null;
  }





  async function loadTodayElec(){
    const el = $('tdElecMoney');
    if(!el) return;
    if(!elecCfg || !elecCfg.roomId){ el.textContent = '未绑定';el.classList.add('unavailable');return; }
    try{
      const d = await j('/api/elec/summary?roomId=' + encodeURIComponent(elecCfg.roomId) +
        '&userId=' + encodeURIComponent(elecCfg.userId)+'&costType='+encodeURIComponent(elecCfg.costType||0));
      if(d && d.ok && d.balance != null){
        el.textContent = Number(d.balance).toFixed(2) + ' 元';
        el.classList.remove('unavailable');
        d._savedAt=Date.now();
        // A local cache write failure must not replace the live balance with stale data.
        try{localStorage.setItem('elec_data_'+elecCfg.roomId+'_'+(elecCfg.costType||0),JSON.stringify(d));}catch(_){}
      }else{
        el.textContent = '—';
      }
    }catch(e){
      let cached;try{cached=JSON.parse(localStorage.getItem('elec_data_'+elecCfg.roomId+'_'+(elecCfg.costType||0))||'null');}catch(x){}
      el.textContent=cached?Number(cached.balance).toFixed(2)+' 元（缓存）':'暂不可用';
      el.classList.toggle('unavailable',!cached);
    }
  }



  // ---------------- 设置 ----------------
  function openMorningRoom(opener){
    resetWeekMotion();if(hasCache())renderPages();
    morningRoomOpener=opener&&opener.isConnected?opener:$('pgC').querySelector('.morning-room-button');
    $('morningRoomInput').value=morningRoom;
    $('morningRoomClear').disabled=!morningRoom;
    window.HexuMotion.show($('morningRoomDialog'),morningRoomOpener);
    $('morningRoomCancel').focus({preventScroll:true});
  }
  function closeMorningRoom(){
    if($('morningRoomDialog').classList.contains('hidden'))return false;
    window.HexuMotion.hide($('morningRoomDialog'));
    const target=morningRoomOpener&&morningRoomOpener.isConnected?morningRoomOpener:$('pgC').querySelector('.morning-room-button');
    if(target)target.focus({preventScroll:true});
    return true;
  }
  async function saveMorningRoom(value){
    const next=value.trim().slice(0,30);
    if(morningRoom&&!next&&!await window.HexuConfirm.ask('清除早检教室？','仅清除已设置的教室，早检时间和提醒保持不变。','确认清除'))return;
    try{localStorage.setItem('morningRoom',next);}catch(e){toast('保存失败，请重试');return;}
    morningRoom=next;
    if(hasCache())renderPages();
    renderToday();
    $('setMorningValue').textContent=morningRoom||'未设置';
    closeMorningRoom();toast(morningRoom?'早检教室已保存':'早检教室已清除');
  }
  $('setMorningRoom').onclick=e=>openMorningRoom(e.currentTarget);
  $('morningRoomCancel').onclick=closeMorningRoom;
  $('morningRoomClear').onclick=()=>saveMorningRoom('');
  $('morningRoomForm').onsubmit=e=>{e.preventDefault();saveMorningRoom($('morningRoomInput').value);};
  $('morningRoomDialog').addEventListener('click',e=>{if(e.target===$('morningRoomDialog'))closeMorningRoom();});
  $('morningRoomDialog').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeMorningRoom();}
    if(e.key==='Tab'){
      const controls=[...$('morningRoomDialog').querySelectorAll('input,button')].filter(el=>!el.disabled);
      const first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  function updateRoomCard(){
    renderNightDays();
    const on = $('swNight').checked;
    $('roomCard').style.opacity = on ? '1' : '.45';
    $('nightRoom').disabled = !on;
    $('nightRoomSave').disabled = !on;
  }





  $('swMorning').addEventListener('change', () => {
    const next=$('swMorning').checked;
    try{localStorage.setItem('showMorning',next?'1':'0');}catch(e){$('swMorning').checked=showMorning;fillMorningTime();renderMorningDays();toast('保存失败，请重试');return;}
    showMorning=next;renderMorningDays();
    if(hasCache())renderPages();
    renderToday();
  });
  $('swNight').addEventListener('change', () => {
    showNight = $('swNight').checked;
    localStorage.setItem('showNight', showNight ? '1' : '0');
    updateRoomCard();
    if(hasCache()) renderPages();renderToday();
  });
  $('nightRoomSave').addEventListener('click', async () => {
    const next=$('nightRoom').value.trim();
    if(nightRoom&&!next&&!await window.HexuConfirm.ask('清除晚自习教室？','仅清除已设置的教室，晚自习安排保持不变。','确认清除'))return;
    nightRoom = next;
    localStorage.setItem('nightRoom', nightRoom);
    const btn = $('nightRoomSave');
    btn.textContent = '✓ 已保存';
    btn.classList.add('saved-anim');
    setTimeout(() => {
      btn.textContent = '保存';
      btn.classList.remove('saved-anim');
    }, 1400);
    toast('晚自习教室已保存');
    if(hasCache()) renderPages();renderToday();
  });

  $('btnLogout').addEventListener('click', async () => {
    if(!await window.HexuConfirm.ask('退出校园账号？','将退出当前校园登录并清除本机课表缓存；自定义日程和加密保存的密码仍保留。','确认退出'))return;
    try{const result=await j('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!result.ok)throw Error();}catch(e){toast('退出失败，请重试');return;}
    loginEpoch++;sessionAvailable=false;if(cacheKey())localStorage.removeItem(cacheKey());clearWeekMemory();accountName='';localStorage.removeItem('jxau_weeks');showLogin();
  });

  // ---------------- 图书馆 ----------------








  $('libBack').addEventListener('click', closeLib);
  $('libRefresh').addEventListener('click', () => {
    if(libraryTab==='hot')void loadHot();
    else if(libraryTab==='mine')void loadLibrary();
    else void doSearch(searchPage);
  });
  $('libSearch').addEventListener('click', doSearch);
  $('libQ').addEventListener('input', () => {
    if(!$('libQ').value.trim()){
      $('libResults').innerHTML = '';
      $('libHome').style.display = 'block';
    }
  });

  const libraryTabs = {
    search: ['tabSearch', 'libSearchView'], hot: ['tabHot', 'libCatView'], mine: ['tabMine', 'libMineView']
  };
  const libraryScroll = new Map();
  let libraryTab='search', libraryDetailScroll=0, libraryTabAnimation, libraryHistoryScroll;
  function switchLibTab(which){
    if(which===libraryTab)return;
    const order=Object.keys(libraryTabs);
    const offset=order.indexOf(which)>order.indexOf(libraryTab)?16:-16;
    libraryScroll.set(libraryTab,window.scrollY);
    libraryTab=which;
    for(const [key,[button,pane]] of Object.entries(libraryTabs)){
      const selected=key===which;
      $(pane).classList.toggle('hidden',!selected);
      $(button).classList.toggle('active',selected);
      $(button).setAttribute('aria-pressed',String(selected));
    }
    window.scrollTo(0,libraryScroll.get(which)||0);
    libraryTabAnimation?.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      libraryTabAnimation=$(libraryTabs[which][1]).animate(
        [{opacity:.5,transform:'translateX('+offset+'px)'},{opacity:1,transform:'translateX(0)'}],
        {duration:280,easing:'cubic-bezier(.22,.61,.36,1)'});
    }
    if(which==='hot'&&!$('libHot').hasChildNodes())void loadHot();
    if(which==='mine'&&libraryReaderAccount!==accountName)void loadLibrary();
  }
  $('tabSearch').addEventListener('click', () => switchLibTab('search'));
  $('tabHot').addEventListener('click', () => switchLibTab('hot'));

  // 分类找书
  // 通用书目列表渲染
  function renderBookList(container, d){
    container.innerHTML = '<div class="lbl" style="margin-bottom:6px">共 ' + esc(Number(d.total) || 0) + ' 条</div>' +
      d.list.map(x =>
        '<div class="lib-item" data-rid="' + esc(x.recordId || '') + '" data-isbn="' + esc(x.isbn || '') + '" data-title="' + esc(x.title || '') + '" data-abs="' + esc(x.abstract || '') + '" data-author="' + esc(x.author || '') + '" data-publisher="' + esc(x.publisher || '') + '" style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #eef3f0;cursor:pointer">' +
          '<div class="lib-cover" style="width:48px;height:64px;border-radius:4px;background:#f2f5f3;flex:0 0 auto;overflow:hidden"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="lib-title" style="font-size:13px;font-weight:600;line-height:1.4">' + esc(x.title) + '</div>' +
            '<div style="font-size:11px;color:#8a938e;margin-top:3px">' + esc(x.author || '') + ' · ' + esc(x.publisher || '') + '<span class="lib-stock"></span></div>' +
            '<div class="lib-more" style="display:none;font-size:11px;color:#5d6b64;margin-top:6px;line-height:1.8"></div>' +
          '</div>' +
        '</div>'
      ).join('');
    loadBookCovers(container);
    bindBookClicks(container);
  }

  // 无封面时用「书名首字 + 色块」占位，按书名固定配色
  function coverPlaceholder(box, text, title){
    if(!box) return;
    const name = (title || text || '书').trim();
    const ch = name.charAt(0) || '书';
    const palette = ['#2f6f4f','#3a6b8a','#7a5a3a','#6a4a7a','#8a5a3a','#3a7a6a','#6b5a8a','#7a6a3a'];
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100003;
    const c = palette[h % palette.length];
    box.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
      'background:' + c + ';color:#fff;font-size:20px;font-weight:700;border-radius:4px;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)">' + esc(ch) + '</div>';
  }

  // 批量取封面 + 在架册数：一页 20 本只发 1 次请求，图片统一走本地代理
  const COVER_LIMIT = 4;
  let coverRunning = 0;
  const coverQueue = [];
  const coverCache = {};   // recordId -> batch stock metadata; batch images may be title matches.
  const isbnPromises = new Map();
  function isbnCover(isbn,title,rid){
    // Keep editions and volumes separate, including records sharing a set ISBN.
    const key=JSON.stringify([String(rid||''),String(isbn||'').replace(/[-\s]/g,'').toUpperCase(),String(title||'')]);
    if(!isbnPromises.has(key)){
      const promise=j('/api/lib/cover?isbn='+encodeURIComponent(isbn)+'&title='+encodeURIComponent(title||'')+'&recordId='+encodeURIComponent(rid||''));
      isbnPromises.set(key,promise);
      promise.catch(()=>isbnPromises.delete(key));
      promise.then(data=>{if(!data.ok)isbnPromises.delete(key);},()=>{});
    }return isbnPromises.get(key);
  }
  function validCover(url){return typeof url==='string'&&/^https?:\/\//i.test(url);}
  async function exactCover(isbn,title,rid){
    if(!isbn)return '';
    const result=await isbnCover(isbn,title,rid);
    return result&&result.ok&&validCover(result.url)?result.url:'';
  }

  function coverSlot(fn){
    return new Promise(function(resolve){
      coverQueue.push(function(){
        coverRunning++;
        Promise.resolve().then(fn).catch(function(){}).then(function(){
          coverRunning--;
          const next = coverQueue.shift();
          if(next) next();
          resolve();
        });
      });
      if(coverRunning < COVER_LIMIT){
        const job = coverQueue.shift();
        if(job) job();
      }
    });
  }

  async function coverSlotResult(fn){let value;await coverSlot(async()=>{value=await fn();});return value;}
  async function loadBookCovers(container){
    const items = Array.prototype.slice.call(container.querySelectorAll('.lib-item'));
    if(!items.length) return;

    const ids = [];
    items.forEach(function(it){
      const rid = it.dataset.rid;
      if(rid && ids.indexOf(rid) < 0) ids.push(rid);
    });

    let map = {};
    if(ids.length){
      try{
        const d = await j('/api/lib/covers?ids=' + encodeURIComponent(ids.slice(0, 20).join(',')));
        if(d && d.ok && d.map) map = d.map;
      }catch(e){}
    }
    // 写缓存（空字符串也缓存，避免对同一本无图的书反复重试）
    Object.keys(map).forEach(function(k){
      coverCache[k] = map[k];
    });

    await Promise.all(items.map(function(it){
      return coverSlot(async function(){
        const box = it.querySelector('.lib-cover');
        if(!box) return;
        const rid = it.dataset.rid;
        const cached = rid ? coverCache[rid] : undefined;
        const info = (rid && map[rid]) ? map[rid] : (cached !== undefined ? cached : null);

        // 顺带把在架册数写进作者行
        const stockEl = it.querySelector('.lib-stock');
        if(stockEl && info && info.total){
          const free = Number(info.onShelf) || 0;
          stockEl.innerHTML = ' · <span style="color:' + (free > 0 ? '#1a8a4a' : '#c05a3a') + '">' +
            (free > 0 ? '在架 ' + free+' 册' : '已借完') + ' / 馆藏 '+(Number(info.total) || 0)+' 册</span>';
        }

        // The batch endpoint can return one title-matched image for several ISBNs.
        // Always resolve by this record's ISBN; an unavailable match stays a placeholder.
        let url='';
        try{url=await exactCover(it.dataset.isbn,it.dataset.title,rid);}catch(e){}
        it.dataset.coverUrl=url;
        if(url){
          const img = document.createElement('img');
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
          img.onerror = function(){ coverPlaceholder(box, '', it.dataset.title); };
          img.src = '/api/lib/img?u=' + encodeURIComponent(url);
          box.innerHTML = '';
          box.appendChild(img);
          return;
        }

        coverPlaceholder(box, '', it.dataset.title);
      });
    }));
  }

  function bindBookClicks(container){
    Array.prototype.forEach.call(container.querySelectorAll('.lib-item'), function(it){
      // 整行点击：原地展开索书号
      it.addEventListener('click', function(){ toggleInline(it); });
      // 封面 / 书名点击：进详情页
      const cover = it.querySelector('.lib-cover');
      const title = it.querySelector('.lib-title');
      [cover, title].forEach(function(el){
        if(!el) return;
        el.style.cursor = 'pointer';
        el.addEventListener('click', function(ev){
          ev.stopPropagation();
          openBookDetail(it);
        });
      });
    });
  }

  // 原地展开索书号
  async function toggleInline(it){
    const m = it.querySelector('.lib-more');
    if(!m) return;
    if(m.style.display !== 'none'){ m.style.display = 'none'; return; }
    m.style.display = 'block';
    if(m.dataset.loaded) return;
    const rid = it.dataset.rid;
    if(!rid){ m.textContent = '无馆藏数据'; return; }
    m.innerHTML = '<div class="lbl">加载馆藏…</div>';
    try{
      const dd = await j('/api/lib/detail?recordId=' + encodeURIComponent(rid));
      if(!dd.ok){ m.textContent = '加载失败'; return; }
      m.dataset.loaded = '1';
      if(!dd.list || !dd.list.length){ m.textContent = '暂无馆藏'; return; }
      m.innerHTML = '<div style="margin-bottom:6px;font-size:12px;color:#8a938e">馆藏 ' + (Number(dd.total) || 0) + ' 册</div>' +
        dd.list.map(y => {
          const ok = (y.status || '').indexOf('在架') >= 0;
          return '<div style="padding:6px 0;border-bottom:1px dashed #eef3f0">' +
            '<span style="font-size:11px;color:#8a938e;margin-right:6px">索书号</span>' +
            '<span style="font-size:14px;font-weight:700;color:#1a5c3a">' + esc(y.callNo || '—') + '</span>' +
            '<div style="font-size:11px;color:#5d6b64;margin-top:3px">' + esc(y.location || '-') +
            ' · <span style="color:' + (ok ? '#1a8a4a' : '#c05a3a') + '">' + esc(y.status || '-') + '</span></div>' +
          '</div>';
        }).join('');
    }catch(e){ m.textContent = '网络错误'; }
  }

  // App 内书目详情页
  let bookDetailRequest=0;
  async function openBookDetail(it){
    const request=++bookDetailRequest;
    const isCurrent=()=>request===bookDetailRequest&&document.body.dataset.page==='bookDetail';
    const title = it.dataset.title || '';
    const isbn = it.dataset.isbn || '';
    const rid = it.dataset.rid || '';
    const abs = it.dataset.abs || '';
    const author = it.dataset.author || '';
    const publisher = it.dataset.publisher || '';

    $('bdTitle').textContent = title || '未知书名';
    $('bdSub').textContent = [author, publisher].filter(Boolean).join(' · ');
    $('bdIsbn').textContent = isbn ? ('ISBN ' + isbn) : '';
    $('bdCover').innerHTML = '';
    $('bdAbs').textContent = abs || '';
    $('bdSynopsis').classList.toggle('hidden',!abs);
    $('bdHold').innerHTML = '<p class="book-detail-note">加载馆藏…</p>';

    // 先放占位，拿到真封面再替换
    $('bdCover').innerHTML = '<div id="bdPh" style="width:90px;height:120px"></div>';
    coverPlaceholder($('bdPh'), '', title);
    libraryDetailScroll=window.scrollY;
    libraryHistoryScroll=history.scrollRestoration;
    history.scrollRestoration='manual';
    if(location.hash!=='#/library')history.replaceState({},'','#/library');
    showRoute('bookDetail');
    pushRoute('#/bookDetail');
    // Reuse this exact record's ISBN promise; ignore responses from a previous book.
    (async function(){
      let url = '';
      try{url=it.dataset.coverUrl||await coverSlotResult(()=>exactCover(isbn,title,rid));}catch(e){}
      if(!url||!isCurrent()) return;

      const img = document.createElement('img');
      img.alt = '';
      // onerror 必须先绑定，再设 src（顺序写反会导致失败时留下破图）
      img.onerror = function(){if(isCurrent())coverPlaceholder($('bdCover'), '', title);};
      img.src = '/api/lib/img?u=' + encodeURIComponent(url);
      $('bdCover').innerHTML = '';
      $('bdCover').appendChild(img);
    })();

    if(!rid){ $('bdHold').innerHTML = '<p class="book-detail-note">无馆藏数据</p>'; return; }
    try{
      const dd = await j('/api/lib/detail?recordId=' + encodeURIComponent(rid));
      if(!isCurrent())return;
      if(!dd.ok){ $('bdHold').innerHTML = '<p class="book-detail-note">馆藏加载失败</p>'; return; }
      if(dd.abstract && !abs){$('bdAbs').textContent=dd.abstract;$('bdSynopsis').classList.remove('hidden');}
      if(!dd.list || !dd.list.length){ $('bdHold').innerHTML = '<p class="book-detail-note">暂无馆藏</p>'; return; }
      const ok = dd.list.filter(y => (y.status || '').indexOf('在架') >= 0).length;
      $('bdHold').innerHTML =
        '<p class="book-detail-note">共 ' + esc(dd.total ?? dd.list.length) + ' 册 · 在架 ' + ok + ' 册</p>' +
        dd.list.map(y => {
          const canBorrow = (y.status || '').indexOf('在架') >= 0;
          return '<div class="book-holding">' +
            '<div><small>索书号</small><strong>' + esc(y.callNo || '—') + '</strong></div>' +
            '<span class="book-holding-status'+(canBorrow?' is-available':'')+'">' + esc(y.status || '状态未知') + '</span>' +
            '<span class="book-holding-location">' + esc(y.location || '馆藏地未提供') + '</span>' +
          '</div>';
        }).join('');
    }catch(e){if(isCurrent())$('bdHold').innerHTML = '<p class="book-detail-note">馆藏加载失败，请稍后重试</p>'; }
  }

  const LIB_CATS = [
    ['A','马列主义'],['B','哲学'],['C','社会科学'],['D','政治法律'],['E','军事'],
    ['F','经济'],['G','文化教育'],['H','语言文字'],['I','文学'],['J','艺术'],
    ['K','历史地理'],['N','自然科学'],['O','数理科学'],['P','天文地球'],['Q','生物科学'],
    ['R','医药卫生'],['S','农业科学'],['T','工业技术'],['U','交通运输'],['V','航空航天'],
    ['X','环境安全'],['Z','综合性图书']
  ];

  // 热门借阅
  async function loadHot(){
    $('libHot').innerHTML = '<div class="lbl">加载中…</div>';
    try{
      const d = await j('/api/lib/hot');
      if(!d.ok || !d.list || !d.list.length){ $('libHot').innerHTML = '<div class="lbl">暂无推荐</div>'; return; }
      const arr = d.list.slice();
      for(let i = arr.length - 1; i > 0; i--){ const j2 = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j2]; arr[j2] = t; }
      const hot = arr.slice(0, 6);
      $('libHot').innerHTML = hot.map(x =>
        '<div class="lib-item" data-rid="' + esc(x.recordId || '') + '" data-isbn="' + esc(x.isbn || '') + '" data-title="' + esc(x.title || '') + '" data-abs="" data-author="' + esc(x.author || '') + '" data-publisher="' + esc(x.publisher || '') + '" style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #eef3f0;cursor:pointer">' +
          '<div class="lib-cover" style="width:48px;height:64px;border-radius:4px;background:#f2f5f3;flex:0 0 auto;overflow:hidden"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="lib-title" style="font-size:13px;font-weight:600">' + esc(x.title) + '</div>' +
            '<div style="font-size:11px;color:#8a938e;margin-top:2px">' + esc(x.author || '') + ' · 借阅 ' + (x.loanCount || 0) + ' 次</div>' +
            '<div class="lib-more" style="display:none;font-size:11px;color:#5d6b64;margin-top:6px;line-height:1.8"></div>' +
          '</div>' +
        '</div>'
      ).join('');
      loadBookCovers($('libHot'));
      bindBookClicks($('libHot'));
    }catch(e){ $('libHot').innerHTML = '<div class="lbl">加载失败</div>'; }
  }
  $('libHotRefresh').addEventListener('click', loadHot);
  $('bdBack').addEventListener('click', () => window.appBack());
  $('tabMine').addEventListener('click', () => switchLibTab('mine'));

  $('btnAdd').addEventListener('click',()=>openModal(0,0,null,$('btnAdd')));
  $('pages').addEventListener('click',e=>{
    if(e.target.closest('.calendar-event'))return;
    const morning=e.target.closest('.morning-room-button');if(morning){openMorningRoom(morning);return;}
    const empty=e.target.closest('td.empty');if(empty){openModal(Number(empty.dataset.day),Number(empty.dataset.slot),null,empty);return;}
    const td = e.target.closest('td.c');
    if(!td || !td.dataset.info) return;
    const p = decodeURIComponent(td.dataset.info).split(',');
    openCourseDetail(p,td);
  });

  let detailOpener=null;
  const detail=$('detail'),detailMask=$('detailMask');
  // Keep the sheet mounted so both directions can interpolate, including a quick reversal.
  detailMask.classList.remove('hidden');detail.setAttribute('aria-hidden','true');detail.inert=true;
  function openCourseDetail(p,source,occurrence){
    detailOpener=source;
    detail.innerHTML='<div class="course-sheet-handle" aria-hidden="true"></div><button type="button" class="close" aria-label="关闭课程详情">×</button><div class="course-sheet-content"><span class="course-sheet-caption">课程详情</span><h2 id="courseSheetTitle">'+esc(p[0])+'</h2><dl>'+[['教室',p[1]],['教师',p[3]],['教学班',p[2]]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('')+'</dl></div>';
    if(occurrence){const subtitle=document.createElement('p');subtitle.className='preference-note';subtitle.textContent=occurrence.displayDate+' · '+minuteText(occurrence.start)+'–'+minuteText(occurrence.end)+(occurrence.transferred?' · 调休/补课':'')+(occurrence.modified?' · 本次已调整':'');detail.querySelector('.course-sheet-content h2').after(subtitle);const actions=document.createElement('div');actions.className='plan-detail-actions';actions.innerHTML='<button type="button" data-single-edit>仅修改这一次</button><button type="button" data-single-cancel>本次停课</button>';detail.querySelector('.course-sheet-content').append(actions);actions.querySelector('[data-single-edit]').onclick=()=>window.HexuPlanner?.edit(occurrence,source);actions.querySelector('[data-single-cancel]').onclick=()=>window.HexuPlanner?.cancel(occurrence);}
    detail.inert=false;detail.setAttribute('aria-hidden','false');
    detail.classList.add('show');detailMask.classList.add('show');document.body.classList.add('course-sheet-open');
    detail.querySelector('.close').focus({preventScroll:true});
  }
  function closeDetail(immediate){
    if(!detail)return;
    const wasOpen=detail.classList.contains('show');
    detail.classList.toggle('instant',immediate===true);detailMask.classList.toggle('instant',immediate===true);
    detail.classList.remove('show');detailMask.classList.remove('show');document.body.classList.remove('course-sheet-open');
    detail.inert=true;detail.setAttribute('aria-hidden','true');
    if(wasOpen&&detailOpener&&detailOpener.isConnected)detailOpener.focus({preventScroll:true});
    if(immediate===true)requestAnimationFrame(()=>{detail.classList.remove('instant');detailMask.classList.remove('instant');});
  }

  $('detailMask').addEventListener('click', closeDetail);

  $('detail').addEventListener('click', e => {
    if(e.target.classList.contains('close') || e.target === $('detail')){
      closeDetail();
    }
  });
  document.addEventListener('keydown',e=>{
    if(!detail.classList.contains('show'))return;
    if(e.key==='Escape'){e.preventDefault();closeDetail();}
    if(e.key==='Tab'){e.preventDefault();detail.querySelector('.close').focus({preventScroll:true});}
  });
  let sheetPointer=null;
  detail.addEventListener('pointerdown',e=>{if(e.target.closest('.course-sheet-handle,.course-sheet-caption')&&e.isPrimary)sheetPointer={id:e.pointerId,y:e.clientY};});
  detail.addEventListener('pointerup',e=>{if(sheetPointer&&e.pointerId===sheetPointer.id&&e.clientY-sheetPointer.y>50)closeDetail();sheetPointer=null;});
  detail.addEventListener('pointercancel',()=>{sheetPointer=null;});

  loadCustom();

  // 自动填上次登录的学号密码，只需要再输验证码
  try{
    const cred = secureData.cred;
    if(cred && cred.u){
      $('u').value = cred.u;
      $('p').value = '';updateSavedPassword();
    }
  }catch(e){}

  // ---------------- 自检诊断 ----------------
  function diagRow(name, ok, detail){
    const status = ok === null ? 'pending' : (ok ? 'ok' : 'error');
    const label = ok === null ? '未检查' : (ok ? '通过' : '未通过');
    const mark = ok === null ? '…' : (ok ? '✓' : '✗');
    return '<div class="diag-row">' +
      '<span class="diag-mark" data-status="' + status + '" role="img" aria-label="' + label + '">' + mark + '</span>' +
      '<div class="diag-result"><div class="diag-name">' + esc(name) + '</div>' +
      '<div class="diag-detail">' + esc(detail || '') + '</div></div></div>';
  }

  async function runDiag(){
    const box = $('diagList');
    const ver = $('diagVer');
    if(ver) ver.textContent = '版本 ' + (window.__VER__ || '—') + ' · 构建于 ' + (window.__BUILD__ || '—');

    const rows = [];
    function render(){
      box.innerHTML = rows.map(r => diagRow(r.name, r.ok, r.detail)).join('');
    }
    function add(name, ok, detail){ rows.push({name:name, ok:ok, detail:detail}); render(); }

    rows.length = 0;
    box.innerHTML = '<div class="lbl">检查中…</div>';

    // 1. 门户登录态
    let loggedIn = false;
    try{
      const st = await j('/api/status');
      loggedIn = !!st.logged_in;
      add('门户登录态', loggedIn, loggedIn ? ('已登录：' + (st.user || '')) : '未登录，请先在「我的」里重新登录');
    }catch(e){ add('门户登录态', false, '请求失败：' + e); }
    render();

    if(loggedIn){
      try{
        const result=await j('/api/week?n=0');
        const data=result.data||{};
        add('课表读取',!!result.ok,result.ok?('第 '+data.week+' 周 · 来源 '+(data.source==='jwgl'?'教务':data.source==='portal'?'门户':'学校')+(data.warning?' · '+data.warning:'')):(result.msg||'读取失败'));
      }catch(e){add('课表读取',false,'请求失败：'+e.message);}
    }

    // 2. 图书馆会话
    let libOk = false;
    try{
      const info = await j('/api/lib/info');
      libOk = !!info.ok;
        add('图书馆会话', libOk, libOk ? '读者信息接口已连通' : (info.msg || '未连通'));
    }catch(e){ add('图书馆会话', false, '请求失败：' + e); }
    render();

    // 3. 批量封面接口（先搜一本书拿 recordId）
    let testRid = '';
    let srList = [];
    try{
      const sr = await j('/api/lib/search?q=' + encodeURIComponent('三体'));
      if(sr && sr.ok && sr.list && sr.list.length){
        srList = sr.list;
        testRid = sr.list[0].recordId || '';
        add('书目检索', true, '搜到 ' + sr.total + ' 条，样本 recordId=' + testRid);
      }else{
        add('书目检索', false, sr.msg || '没有搜到结果');
      }
    }catch(e){ add('书目检索', false, '请求失败：' + e); }
    render();

    // 封面覆盖率：本页 20 本里有多少本图书馆给了封面图
    if(srList.length){
      const sids = srList.map(function(x){ return x.recordId; }).filter(Boolean).slice(0, 20);
      let got = 0;
      try{
        const cv = await j('/api/lib/covers?ids=' + encodeURIComponent(sids.join(',')));
        if(cv && cv.ok && cv.map){
          sids.forEach(function(id){ if(cv.map[id] && cv.map[id].url) got++; });
        }
        const pct = sids.length ? Math.round(got * 100 / sids.length) : 0;
        add('封面覆盖率', got > 0 ? true : null, '本页 ' + sids.length + ' 本，' + got + ' 本有封面（' + pct + '%）；未给封面的书将显示书名占位');
      }catch(e){ add('封面覆盖率', false, '请求失败：' + e); }
      render();
    }

    let coverUrl = '';
    if(testRid){
      try{
        const cv = await j('/api/lib/covers?ids=' + encodeURIComponent(testRid));
        if(cv && cv.ok && cv.map && cv.map[testRid]){
          add('批量封面接口', true,
            '已读取在架 '+(cv.map[testRid].onShelf||0)+' 册；批量图片可能按书名模糊匹配，实际封面使用ISBN单查');
        }else{
          add('批量封面接口', false, cv.msg || '返回为空');
        }
      }catch(e){ add('批量封面接口', false, '请求失败：' + e); }
      render();
      try{
        const sample=srList.find(x=>String(x.recordId)===String(testRid));
        coverUrl=sample?await exactCover(sample.isbn,sample.title,testRid):'';
        add('ISBN精确封面',coverUrl?true:null,coverUrl?'已按本书ISBN取得封面':'未返回该ISBN的封面，显示书名占位');
      }catch(e){add('ISBN精确封面',false,'查询失败：'+e.message);}
      render();
    }

    // 4. 分别检测WebView直连与本地代理，帮助手机端定位封面故障。
    if(coverUrl){
      const direct = await new Promise(resolve=>{
        const image=new Image();let done=false;
        const finish=value=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;resolve(value);};
        const timer=setTimeout(()=>finish(false),8000);
        image.onload=()=>finish(image.naturalWidth>0);image.onerror=()=>finish(false);image.src=coverUrl;
      });
      add('封面直连',direct?true:null,direct?'WebView可直接加载图片':'WebView直连未成功，继续检查本地代理');
      try{
        const r = await fetch('/api/lib/img?u=' + encodeURIComponent(coverUrl));
        const blob = await r.blob();
        const size = blob.size;
        const valid=r.ok&&blob.type.indexOf('image/')===0&&size>0;
        add('图片代理', valid, valid?'图片代理正常，返回 '+size+' 字节':'代理未返回有效图片，请检查网络或上游服务');
        add('封面诊断结论',valid,valid?(direct?'图片链路正常':'直连失败、代理成功；应用已统一使用代理加载'):direct?'直连成功但代理失败，请检查图片代理白名单':'直连与代理均失败，请检查网络及上游图片服务');
      }catch(e){ add('图片代理', false, '请求失败：' + e); }
    }else{
      add('图片代理', null, '上一项没拿到图片地址，跳过');
    }
    render();

    // 5. 电费
    try{
      loadElecCfg();
      if(elecCfg && elecCfg.roomId){
        const es = await j('/api/elec/summary?roomId=' + encodeURIComponent(elecCfg.roomId) +
          '&userId=' + encodeURIComponent(elecCfg.userId));
        add('空调电费接口', !!(es && es.ok), (es && es.ok) ? ('余额 ' + es.balance + ' 元') : (es.msg || '未连通'));
      }else{
        add('空调电费接口', null, '还没绑定电费账号');
      }
    }catch(e){ add('空调电费接口', false, '请求失败：' + e); }
    render();

    // 6. 本地数据
    const cached = !!(cacheKey()&&localStorage.getItem(cacheKey()));
    add('课表缓存', cached, cached ? '本地已有课表缓存' : '没有缓存，需要联网加载一次');
    add('本机凭证保护', !localStorage.getItem('cred')&&!localStorage.getItem('elec'), secureData.cred?'登录凭证已迁移到本机加密存储':'未保存登录密码');
    render();

    try{
      const st=await j('/api/life798/status');
      if(st.bound){const value=await j('/api/life798/wallet?eid=');add('798钱包',!!value.ok,value.ok?((value.cached?'缓存余额 ':'余额 ')+value.balance+' 元 · 数据截至 '+new Date(value.updatedAt).toLocaleString()):(value.msg||'需要重新绑定'));}
      else add('798钱包',null,'未绑定，可在「服务 → 798钱包」用本人手机号和验证码绑定');
    }catch(e){add('798钱包',false,'连接失败：'+e.message);}
    add('照明电费',null,'已暂停开放；本次诊断不触发照明授权或查询');
    const bad = rows.filter(r => r.ok === false).length;
    add('总结', bad === 0, bad === 0 ? '已检查项目通过；未绑定与待接入项目不计入通过项' : (bad + ' 项未通过，见上面标红项'));
    render();
  }

  // ---------------- 导航绑定 ----------------
  function bindMainNav(){
    Array.prototype.forEach.call(document.querySelectorAll('.main-tab'), function(b){
      b.addEventListener('click', function(){ switchMainTab(b.dataset.tab); });
    });

    // 今日页快捷入口
    const tdLib = $('tdLib'); if(tdLib) tdLib.addEventListener('click', openLib);
    const tdElec = $('tdElec'); if(tdElec) tdElec.addEventListener('click', openElec);
    const tdElecBalance=$('tdElecBalance');if(tdElecBalance)tdElecBalance.addEventListener('click',openElec);
    const tdSch = $('tdSchedule'); if(tdSch) tdSch.addEventListener('click', () => switchMainTab('schedule'));
    if($('tdViewSchedule'))$('tdViewSchedule').onclick=()=>switchMainTab('schedule');
    if($('homeAccount'))$('homeAccount').onclick=()=>{if(window.JxauAvatar)window.JxauAvatar.open();};
    const tdRef = $('tdRefresh'); if(tdRef)tdRef.addEventListener('click',()=>refreshSchedule(0));

    // 服务页
    if($('svcGrades'))$('svcGrades').onclick=()=>{showRoute('grades');pushRoute('#/grades');};
    if($('gradesBack'))$('gradesBack').onclick=()=>window.appBack();
    if($('gradesRefresh'))$('gradesRefresh').onclick=loadGrades;
    if($('gradesLogin'))$('gradesLogin').onclick=showLogin;
    if($('gradesTerm'))$('gradesTerm').onchange=renderGrades;
    const svcLib = $('svcLib'); if(svcLib) svcLib.addEventListener('click', openLib);
    const svcElec = $('svcElec'); if(svcElec) svcElec.addEventListener('click', openElec);
    const svcWater = $('svcWater'); if(svcWater) svcWater.addEventListener('click', () => window.dispatchEvent(new CustomEvent('jxau:service',{detail:'water'})));
    const svcCard = $('svcCard'); if(svcCard) svcCard.addEventListener('click', () => window.dispatchEvent(new CustomEvent('jxau:service',{detail:'lighting'})));
    const svcCx=$('svcChaoxing');if(svcCx)svcCx.onclick=()=>openChaoxing();
    const svcWd=$('svcWaterDevice');if(svcWd)svcWd.onclick=()=>openWaterDevice();
    if($('chaoxingBack'))$('chaoxingBack').onclick=()=>window.appBack();
    if($('waterDeviceBack'))$('waterDeviceBack').onclick=()=>window.appBack();
    if($('chaoxingLogin'))$('chaoxingLogin').onclick=chaoxingLogin;
    if($('chaoxingRefresh'))$('chaoxingRefresh').onclick=loadChaoxing;
    if($('waterDeviceRefresh'))$('waterDeviceRefresh').onclick=loadWaterDevices;

    // 课表页顶部「＋课程」
    const add2 = $('btnAdd2');
    if(add2) add2.addEventListener('click', () => openModal(0, 0, null));

    // 自检诊断
    const de = $('diagEntry');
    if(de) de.addEventListener('click', function(){
      showRoute('diag'); pushRoute('#/diag'); runDiag();
    });
    const db = $('diagBack');
    if(db) db.addEventListener('click', function(){window.appBack();});
    const dr = $('diagRun');
    if(dr) dr.addEventListener('click', runDiag);

    window.addEventListener('popstate', routeFromHash);
    window.addEventListener('hashchange', routeFromHash);
  }


  let accountName='', libPage=1, searchPage=1, historyPage=1;
  let todayElecAt=0;
  async function saveVault(key,value){
    const result=await j('/api/vault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key,value:value})});
    if(!result.ok)throw new Error(result.msg||'安全保存失败');secureData[key]=value;
  }
  async function initVault(){
    const result=await j('/api/vault');if(!result.ok)throw new Error(result.msg||'无法读取安全存储');
    secureData.cred=result.cred||null;updateSavedPassword();secureData.elec=result.elec||null;
    localStorage.removeItem('cred');
    for(const key of ['elec']){
      const legacy=localStorage.getItem(key);
      if(legacy){
        let value;try{value=JSON.parse(legacy);}catch(e){toast('旧版'+key+'数据损坏，请重新绑定');continue;}
        if(!secureData[key]&&value)await saveVault(key,value);
        localStorage.removeItem(key);
      }
    }
  }
  function loadElecCfg(){elecCfg=secureData.elec||null;}
  const pageRegistry={};
  let savedDocumentScroll=0;
  function setOverlayScroll(active){
    if(active){
      if(document.body.classList.contains('overlay-open'))return;
      savedDocumentScroll=window.scrollY;
      document.body.style.top=-savedDocumentScroll+'px';
      document.body.classList.add('overlay-open');
    }else if(document.body.classList.contains('overlay-open')){
      document.body.classList.remove('overlay-open');document.body.style.top='';
      window.scrollTo(0,savedDocumentScroll);
    }
  }
  function registerPage(id,options){pageRegistry[id]=options||{};}
  function showRoute(id){
    if(document.body.dataset.page==='cxWork'&&id!=='cxWork'&&window.JxauHomework&&!window.JxauHomework.leave())return;
    window.dispatchEvent(new CustomEvent('jxau:before-route',{detail:{from:document.body.dataset.page,to:id}}));
    closeMorningRoom();
    const current=document.body.dataset.page;if(current==='login'&&id!=='login')hideLoginPassword();
    if(id==='diag')setOverlayScroll(true);
    if(pageRegistry[current]&&pageRegistry[current].onHide)pageRegistry[current].onHide();
    Object.keys(pageRegistry).forEach(name=>{if($(name))$(name).classList.add('hidden');});
    $('bookDetail').classList.add('hidden');closeDetail(true);closeModal(true);
    if($(id))$(id).classList.remove('hidden');
    if(id!=='diag')setOverlayScroll(false);
    const main=MAIN_PAGES.indexOf(id)>=0;setTabbarVisible(main);
    if(main){activeTab=id;document.querySelectorAll('.main-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));}
    document.body.dataset.page=id;window.dispatchEvent(new CustomEvent('jxau:route',{detail:id}));
    if(pageRegistry[id]&&pageRegistry[id].onShow)pageRegistry[id].onShow({from:current});
  }
  function routeFromHash(){
    const match=/^#\/(\w+)$/.exec(location.hash||'');const id=match?match[1]:'today';
    if(id===document.body.dataset.page)return;
    if(pageRegistry[id])showRoute(id);else showRoute('today');
  }
  function applyTab(name){showRoute(name);}
  function switchMainTab(name,fromHistory){showRoute(name);if(!fromHistory)pushRoute('#/'+name);}
  let guideFrom='settings';
  function dismissGuidePrompt(){
    $('guidePrompt').classList.add('hidden');
    localStorage.setItem('hexuUsageGuideSeen','true');
  }
  function openUsageGuide(from){
    guideFrom=from;
    dismissGuidePrompt();
    showRoute('usageGuide');
    pushRoute('#/usageGuide');
  }
  function showLogin(){showRoute('login');history.replaceState({},'','#/login');loadCaptcha();}
  function openElec(){showRoute('elec');pushRoute('#/elec');loadElecCfg();if(elecCfg)refreshElec();else renderElecBind();}
  function closeElec(){window.appBack();}
  function openLib(){switchMainTab('library');}
  function openChaoxing(){showRoute('chaoxing');pushRoute('#/chaoxing');}
  function openWaterDevice(){switchMainTab('waterDevice');}
  let cxRows=[],cxData=null,cxFilter='all',cxSort='urgent',cxCourseFilter='',cxBusy=false,cxEpoch=0;
  let cxCourses=[];
  const cxCourseDialog=$('cxCourseDialog');

  function closeCxCourses(){
    if(!cxCourseDialog.open)return false;
    cxCourseDialog.close();
    $('cxCourseFilter').setAttribute('aria-expanded','false');
    return true;
  }

  function renderCxCourses(){
    const options=$('cxCourseOptions');
    const all='全部课程（'+cxCourses.length+'）';
    const label=cxCourseFilter||all;
    $('cxCourseFilterLabel').textContent=label;
    $('cxCourseFilter').setAttribute('aria-label','课程分类：'+label);
    if(!cxCourseDialog.open)return;
    const previous=options.querySelector(':focus')?.dataset.index;
    options.innerHTML=[all,...cxCourses].map((name,index)=>{
      const selected=index===0?!cxCourseFilter:cxCourses[index-1]===cxCourseFilter;
      return '<button type="button" data-index="'+index+'" aria-pressed="'+selected+'"><span>'+esc(name)+'</span><span class="cx-course-check" aria-hidden="true"></span></button>';
    }).join('');
    if(previous!==undefined)options.children[previous]?.focus({preventScroll:true});
  }
  let waterBusy=false,waterRows=[],waterActive={},waterPending=false,waterSaving=false,waterEditing=null,waterGeneration=0,waterNeedsRefresh=true;
  let waterLoginState='unknown';
  const waterSessionExpired=error=>error?.data?.code===-99||/798登录状态已过期/.test(error?.message||'');
  function showWaterLoginState(status){
    waterLoginState=status;
    $('waterLoginAlert').classList.toggle('hidden',status!=='unbound'&&status!=='expired');
    $('waterLoginTitle').textContent=status==='expired'?'798 登录已过期，无法发出接水请求':'798 尚未登录，无法发出接水请求';
  }
  async function featureApi(path,body){const d=await j(path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!d.ok){const e=new Error(d.msg||'读取失败，请稍后重试');e.data=d;throw e;}return d;}
  function installFeatureControls(){
    const trigger=$('cxCourseFilter');
    const options=$('cxCourseOptions');
    trigger.onclick=()=>{
      if(cxCourseDialog.open)return;
      cxCourseDialog.showModal();
      trigger.setAttribute('aria-expanded','true');
      renderCxCourses();
      options.querySelector('[aria-pressed=true]').scrollIntoView({block:'nearest'});
    };
    $('cxCourseClose').onclick=closeCxCourses;
    cxCourseDialog.addEventListener('cancel',e=>{e.preventDefault();closeCxCourses();});
    cxCourseDialog.onclick=e=>{if(e.target===cxCourseDialog)closeCxCourses();};
    options.onclick=e=>{
      const option=e.target.closest('[data-index]');
      if(!option)return;
      cxCourseFilter=cxCourses[Number(option.dataset.index)-1]||'';
      closeCxCourses();
      renderCx();
    };
    document.querySelectorAll('.cx-filter').forEach(b=>b.onclick=()=>{cxFilter=b.dataset.filter;renderCx();});
    document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{cxSort=b.dataset.sort;renderCx();});
    $('chaoxingRefresh').onclick=()=>loadChaoxing(true);
    $('chaoxingLogin').onclick=chaoxingLogin;
    $('cxLoginCancel').onclick=()=>window.HexuMotion.hide($('cxLoginDialog'));
    $('cxLoginForm').onsubmit=async e=>{
      e.preventDefault();const btn=$('cxLoginSubmit');if(btn.disabled)return;btn.disabled=true;$('cxLoginError').textContent='正在连接…';
      try{await featureApi('/api/chaoxing/login',{user:$('cxUser').value.trim(),password:$('cxPass').value});$('cxPass').value='';window.HexuMotion.hide($('cxLoginDialog'));cxRows=[];cxData=null;await loadChaoxing(true);}
      catch(e){$('cxLoginError').textContent=e.message;}finally{$('cxPass').value='';btn.disabled=false;}
    };
    $('chaoxingDisconnect').onclick=async()=>{if(!await window.HexuConfirm.ask('断开学习通连接？','将清除本机学习通登录状态与作业缓存，已提交的作业不受影响。','确认断开'))return;try{await featureApi('/api/chaoxing/logout',{});cxEpoch++;cxBusy=false;cxRows=[];cxData=null;await loadChaoxing();}catch(e){toast(e.message);}};
    $('waterManage').onclick=$('waterLoginAction').onclick=()=>window.dispatchEvent(new CustomEvent('jxau:service',{
      detail:waterLoginState==='expired'?'water-relogin':'water'
    }));

    $('waterDeviceAdd').onclick=()=>openWaterEditor();
    $('waterDeviceCancel').onclick=closeWaterEditor;
    $('waterDeviceForm').onsubmit=saveWaterEditor;
    $('waterDeviceRemove').onclick=removeWaterEditor;
  }
  function chaoxingLogin(){$('cxLoginError').textContent='';$('cxPass').value='';window.HexuMotion.show($('cxLoginDialog'),document.activeElement);$('cxLoginCancel').focus({preventScroll:true});}
  const cxCoursePalette=[['#397f65','#edf6ef'],['#526fa1','#eff3fa'],['#93704a','#faf4eb'],['#80629a','#f6f1f9'],['#3b8087','#edf6f7'],['#a65f68','#fbf0f2']];
  function cxCourseStyle(course){
    const courses=[...new Set(cxRows.map(r=>String(r.course||'')).concat(String(course||'')))].sort(),used=new Set();let chosen=0;
    for(const name of courses){let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))>>>0;let slot=h%cxCoursePalette.length;for(let i=0;i<cxCoursePalette.length&&used.has(slot);i++)slot=(slot+1)%cxCoursePalette.length;used.add(slot);if(name===String(course||''))chosen=slot;}
    const p=cxCoursePalette[chosen];return '--course-color:'+p[0]+';--course-bg:'+p[1];
  }
  function cxCourseInitial(course){
    const name=String(course||'课').replace(/[《》〈〉\s]/g,'');
    const aliases=[[/高等数学/,'高数'],[/线性代数/,'线代'],[/概率论|数理统计/,'概率'],[/大学英语|英语/,'英语'],[/大学物理/,'大物'],[/中国近现代史|近现代史纲要/,'史纲'],[/马克思主义基本原理/,'马原'],[/毛泽东思想/,'毛概'],[/习近平新时代/,'习概'],[/思想道德|道德与法治/,'思政'],[/形势与政策/,'形策'],[/计算机/,'计算'],[/程序设计/,'编程'],[/体育/,'体育']];
    for(const [pattern,label] of aliases)if(pattern.test(name))return label;
    return name.slice(0,2);
  }
  function cxDeadlineLabel(row,now){
    const at=Number(row.endAt),date=at>0?new Date(at):null;
    if(!date||Number.isNaN(date.getTime()))return row.left||'';
    const delta=at-now,stamp=date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    if(row.state==='done')return stamp+' 截止';
    if(delta<=0)return '已截止';
    const minutes=Math.ceil(delta/60000);
    if(minutes<60)return minutes+'分钟后截止';
    if(minutes<1440)return Math.floor(minutes/60)+'小时'+(minutes%60?minutes%60+'分':'')+'后截止';
    if(minutes<10080)return Math.ceil(minutes/1440)+'天后截止';
    return stamp+' 截止';
  }
  window.addEventListener('jxau:homework-state',event=>{
    const d=event.detail;if(!d||!d.sourceUrl)return;
    const row=cxRows.find(r=>r.url===d.sourceUrl);if(!row)return;
    if(d.submitted){row.status='已提交';row.state='done';row.verifiedAt=Date.now();}
    else if(d.canWrite){row.status='未交';row.state='todo';delete row.verifiedAt;}else return;
    renderCx();
  });
  function renderCx(){
    document.querySelectorAll('.cx-filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===cxFilter));
    document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('active',b.dataset.sort===cxSort));
    const todo=cxRows.filter(r=>r.state==='todo').length,unknown=cxRows.filter(r=>r.state!=='todo'&&r.state!=='done').length;
    $('cxSummary').textContent=cxData?todo+' 条待完成'+(unknown?' · '+unknown+' 条状态待确认':'')+' · 共 '+cxRows.length+' 条作业':'';
    cxCourses=[...new Set(cxRows.map(r=>String(r.course||'未命名课程')).concat((cxData?.courseCatalog||[]).map(c=>c.title).filter(Boolean)))];
    if(cxCourseFilter&&!cxCourses.includes(cxCourseFilter))cxCourseFilter='';
    renderCxCourses();
    const rows=cxRows.map((r,index)=>({...r,index})).filter(r=>(cxFilter==='all'||r.state===cxFilter)&&(!cxCourseFilter||String(r.course||'未命名课程')===cxCourseFilter));
    rows.sort((a,b)=>cxSort==='course'?String(a.course).localeCompare(String(b.course),'zh-CN'):(a.state==='done')-(b.state==='done')||(a.endAt||Infinity)-(b.endAt||Infinity));
    let lastCourse='';let html='';
    rows.forEach(r=>{
      if(cxSort==='course'&&lastCourse!==r.course){lastCourse=r.course;html+='<h2 class="cx-course-heading" style="'+cxCourseStyle(r.course)+'">'+esc(r.course||'未命名课程')+'</h2>';}
      const now=Date.now(),deadline=Number(r.endAt),urgent=deadline>now&&deadline-now<86400000&&r.state==='todo';
      const theme=cxCourseStyle(r.course),done=r.state==='done',stateClass=done?'done':r.state==='todo'?'todo':'unknown';
      const when=cxDeadlineLabel(r,now);
      const content='<div class="cx-title"><b>'+esc(r.title)+'</b><span class="cx-state '+stateClass+'">'+esc(r.status||'状态待确认')+'</span>'+(r.url?'<span class="cx-task-chevron" aria-hidden="true">›</span>':'')+'</div><div class="cx-task-meta"><span class="cx-course-label"><span class="cx-course-symbol" aria-hidden="true">●</span><span>'+esc(r.course)+'</span></span>'+(when?'<span class="cx-deadline'+(urgent?' urgent':'')+'">'+esc(when)+'</span>':'')+(!r.url?'<span class="cx-no-entry">暂无入口</span>':'')+'</div>';
      html+=r.url?'<button type="button" class="cx-task cx-task-compact '+stateClass+'" style="'+theme+'" data-work-index="'+r.index+'">'+content+'</button>':'<article class="cx-task cx-task-compact '+stateClass+'" style="'+theme+'">'+content+'</article>';
    });
    $('chaoxingList').innerHTML=html||'<div class="card feature-empty">'+(cxData?(cxData.scanning?'正在逐门读取课程作业，已读取的结果会立即显示':cxRows.length?'此分类暂无作业':cxData.failed&&cxData.failed.length?'暂未读取到作业，请查看下方失败课程。':'本次检查未发现作业记录。'):'连接后查看课程作业')+'</div>';
    $('chaoxingList').querySelectorAll('[data-work-index]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('jxau:homework',{detail:{...cxRows[Number(b.dataset.workIndex)],index:Number(b.dataset.workIndex)}})));
    if(cxData&&Array.isArray(cxData.failed)&&cxData.failed.length)$('chaoxingList').insertAdjacentHTML('beforeend','<details class="card cx-failures"><summary>'+cxData.failed.length+' 门课程未完整读取</summary>'+cxData.failed.map(x=>'<p><b>'+esc(x.course)+'</b><br>'+esc(x.message)+'</p>').join('')+'</details>');
  }
  async function loadChaoxing(force=false){
    if(cxBusy)return;cxBusy=true;const epoch=++cxEpoch,btn=$('chaoxingRefresh');btn.disabled=true;btn.textContent='检查中…';
    try{
      const st=await featureApi('/api/chaoxing/status');if(epoch!==cxEpoch)return;
      $('chaoxingLogin').textContent=st.bound?'重新绑定':'连接学习通';$('chaoxingDisconnect').classList.toggle('hidden',!st.bound);
      if(!st.bound){cxRows=[];cxData=null;$('chaoxingStatus').textContent='尚未连接学习通账号';renderCx();return;}
      let d=force?await featureApi('/api/chaoxing/scan',{}):await featureApi('/api/chaoxing/todo');
      if(Array.isArray(d.items)){cxData=d;cxRows=d.items;renderCx();}
      if(!d.scanning&&(!d.checkedAt||Date.now()-d.checkedAt>300000))d=await featureApi('/api/chaoxing/scan',{});
      while(d.scanning){
        if(epoch!==cxEpoch)return;if(Array.isArray(d.items)){cxData=d;cxRows=d.items;renderCx();}$('chaoxingStatus').textContent='正在检查 '+(d.completed||0)+' / '+(d.courses||'—')+' 门课'+(d.course?' · '+d.course:'');
        await new Promise(r=>setTimeout(r,900));if(epoch!==cxEpoch)return;d=await featureApi('/api/chaoxing/todo');
      }
      if(epoch!==cxEpoch)return;cxData=d;cxRows=Array.isArray(d.items)?d.items:[];
      $('chaoxingStatus').textContent='最近检查 '+new Date(d.checkedAt||Date.now()).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' · 共 '+(d.courses||0)+' 门课'+(d.warning?' · '+d.warning:'');renderCx();
    }catch(e){if(epoch===cxEpoch){$('chaoxingStatus').textContent=e.message+(cxData?' · 保留上次检查结果':'');if(!cxData){$('chaoxingList').innerHTML='<div class="card err">'+esc(e.message)+'</div>';}}}
    finally{if(epoch===cxEpoch){cxBusy=false;btn.disabled=false;btn.textContent='检查一次';}}
  }
  function closeWaterEditor(){if(waterSaving)return false;window.HexuMotion.hide($('waterDeviceDialog'));return true;}
  function openWaterEditor(row,scannedId,origin){
    if(waterPending||waterSaving||(waterBusy&&!scannedId))return false;
    if(scannedId)row=waterRows.find(r=>r.id===scannedId)||null;
    waterEditing=row||null;$('waterDeviceDialogTitle').textContent=row?'管理饮水机':scannedId?'确认扫码设备':'手动添加设备';$('waterEntryCaption').textContent=row?'已保存设备':scannedId?'二维码已识别 · 无需输入编号':'手动输入 · 保存后即可接水';
    $('waterDeviceId').value=row?row.id:(scannedId||'');$('waterDeviceId').readOnly=!!row||!!scannedId;
    $('waterDeviceAlias').value=row?(row.alias||row.name||''):'';
    $('waterDeviceError').classList.remove('scan-success');$('waterDeviceError').textContent='';$('waterDeviceRemove').classList.toggle('hidden',!row);
    $('waterDeviceRemove').disabled=!!(row&&waterActive[row.id]);
    if(row&&waterActive[row.id])$('waterDeviceError').textContent='此设备仍有接水请求，请先结束接水后再移除。';
    if(scannedId){$('waterDeviceError').classList.add('scan-success');$('waterDeviceError').textContent='已识别设备号 '+scannedId+'，确认保存即可，无需再次输入；保存不会启动设备。';}
    window.HexuMotion.show($('waterDeviceDialog'),origin||document.activeElement);$('waterDeviceCancel').focus({preventScroll:true});return true;
  }
  function acceptWaterDevices(d){waterRows=Array.isArray(d.devices)?d.devices:[];waterActive=d.active||{};renderWaterRows();}
  function lockWaterEditor(locked){
    waterSaving=locked;['waterDeviceSave','waterDeviceCancel','waterDeviceRemove','waterDeviceId','waterDeviceAlias'].forEach(id=>$(id).disabled=locked);
    $('waterDeviceSave').textContent=locked?'保存中…':'保存设备';
    if(!locked){$('waterDeviceRemove').disabled=!!(waterEditing&&waterActive[waterEditing.id]);renderWaterRows();}
  }
  async function saveWaterEditor(e){
    e.preventDefault();if(waterSaving)return;lockWaterEditor(true);waterGeneration++;
    try{const d=await featureApi('/api/water-device/save',{did:$('waterDeviceId').value.trim(),name:$('waterDeviceAlias').value.trim()});acceptWaterDevices(d);$('waterDeviceStatus').textContent=d.msg||'设备已保存';window.HexuMotion.hide($('waterDeviceDialog'));}
    catch(e){$('waterDeviceError').classList.remove('scan-success');$('waterDeviceError').textContent=e.message;}finally{lockWaterEditor(false);}
  }
  async function removeWaterEditor(){
    if(waterSaving||!waterEditing||waterActive[waterEditing.id])return;
    if(!await window.HexuConfirm.ask('移除这台饮水机？','将从本机移除“'+waterEditing.name+'”，桌面组件也会同步更新。798官方收藏不受影响。','确认移除'))return;
    if(!waterEditing||waterActive[waterEditing.id])return;
    lockWaterEditor(true);waterGeneration++;
    try{const d=await featureApi('/api/water-device/remove',{did:waterEditing.id});acceptWaterDevices(d);$('waterDeviceStatus').textContent=d.msg||'设备已移除';window.HexuMotion.hide($('waterDeviceDialog'));}
    catch(e){$('waterDeviceError').classList.remove('scan-success');$('waterDeviceError').textContent=e.message;}finally{lockWaterEditor(false);}
  }
  function renderWaterRows(){
    const box=$('waterDeviceList');$('waterDeviceCount').textContent=waterRows.length+' 台';
    const html=waterRows.length?waterRows.map(r=>{
      const active=waterActive[r.id],notice=active==='manual-required'?'需核对现场结算':active==='unknown'?'操作结果待确认':active?'请在水机上确认接水':'';
      return '<div class="water-device-row'+(active?' has-request':'')+'" data-did="'+esc(r.id)+'"><span class="device-mark" aria-hidden="true">'+(r.name&&/浴|澡/.test(r.name)?'浴':'水')+'</span><div class="device-name"><strong>'+esc(r.name||'饮水机')+'</strong><span class="device-id" title="设备号 '+esc(r.id)+'">'+esc(notice||r.id)+'</span><span class="device-row-tools"><button type="button" class="device-recover"'+(active?'':' hidden')+'>核对现场／解除记录</button></span></div><button type="button" class="device-edit" aria-label="管理设备 '+esc(r.name||r.id)+'" title="管理设备"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.65"/><circle cx="12" cy="12" r="1.65"/><circle cx="19" cy="12" r="1.65"/></svg></button><button type="button" data-action="'+(active?'end':'start')+'"'+(active?' class="stop"':'')+'>'+ (active==='manual-required'?'处理':active?'结束':'接水')+'</button></div>';
    }).join(''):'<p class="feature-empty">还没有保存设备，扫码或输入编号即可添加。</p>';
    if(box.dataset.content!==html){box.innerHTML=html;box.dataset.content=html;}
    box.querySelectorAll('button[data-action]').forEach(b=>{b.disabled=waterPending||waterSaving||(waterLoginState==='expired'&&b.dataset.action==='start');b.onclick=()=>waterAction(b);});
    box.querySelectorAll('.device-edit').forEach(b=>{b.disabled=waterPending||waterBusy||waterSaving;b.onclick=()=>openWaterEditor(waterRows.find(r=>r.id===b.closest('.water-device-row').dataset.did));});
    box.querySelectorAll('.device-recover').forEach(b=>{b.disabled=waterPending||waterBusy||waterSaving;b.onclick=()=>acknowledgeWater(b.closest('.water-device-row').dataset.did);});
    $('waterDeviceAdd').disabled=waterPending||waterBusy||waterSaving;
  }
  window.addEventListener('jxau:water-account',()=>{waterNeedsRefresh=true;showWaterLoginState('unknown');if(document.body.dataset.page==='waterDevice')void loadWaterDevices();});
  async function loadWaterDevices(){
    window.dispatchEvent(new CustomEvent('jxau:water-refresh'));
    if(waterBusy||waterPending)return;waterBusy=true;const generation=++waterGeneration;$('waterDeviceAdd').disabled=true;$('waterDeviceRefresh').disabled=true;$('waterDeviceStatus').textContent='正在更新设备…';
    try{
      const st=await featureApi('/api/life798/status');if(!st.bound){showWaterLoginState('unbound');waterRows=[];waterActive={};$('waterDeviceStatus').textContent='';$('waterBalance').textContent='未绑定';$('waterBalanceTime').textContent='—';$('waterWalletName').textContent='';return;}
      const results=await Promise.allSettled([featureApi('/api/water-device/devices'),localStorage.getItem('waterBalanceCollapsed')==='true'?Promise.resolve(null):featureApi('/api/life798/wallet?eid='+encodeURIComponent(st.selectedEid||''))]);
      if(generation!==waterGeneration)return;
      const [devices, wallet]=results;
      const expired=devices.value?.sessionExpired||results.some(result=>result.status==='rejected'&&waterSessionExpired(result.reason));
      const verified=(wallet.value&&!wallet.value.cached)||(devices.value&&!devices.value.warning);
      if(expired){
        showWaterLoginState('expired');
        waterNeedsRefresh=true;
      }else if(verified||waterLoginState!=='expired'){
        showWaterLoginState('bound');
      }
      if(devices.status==='fulfilled'){acceptWaterDevices(devices.value);waterNeedsRefresh=waterLoginState==='expired';$('waterDeviceStatus').textContent=devices.value.warning||'';}else{$('waterDeviceStatus').textContent=devices.reason.message;}
      if(waterLoginState==='expired'){$('waterBalance').textContent='登录已过期';$('waterBalanceTime').textContent='—';$('waterWalletName').textContent='';}
      else if(wallet.value){const d=wallet.value;$('waterBalance').textContent=d.balance==null?'余额未知':'¥ '+Number(d.balance).toFixed(2);$('waterBalanceTime').textContent=d.cached?'上次缓存':'刚刚更新';$('waterWalletName').textContent=d.name||'当前钱包';}
      else if(wallet.status==='rejected'){$('waterBalanceTime').textContent='更新失败';$('waterWalletName').textContent=wallet.reason.message;}
    }catch(e){$('waterDeviceStatus').textContent=e.message;}finally{waterBusy=false;$('waterDeviceRefresh').disabled=false;renderWaterRows();}
  }
  async function acknowledgeWater(did){
    if(waterPending)return;
    if(!await window.HexuConfirm.ask('确认现场没有出水及待结算状态？','若请求超时自动退出、机器一直未启动，或已完成结算，请先确认现场没有出水，也没有待结算状态。解除后仅清除本机请求记录；仍在出水或无法确认时请取消。','确认解除记录',{tone:'primary',caption:'核对设备状态',note:'解除记录不会向水机发送启动、暂停或停止命令。'}))return;
    waterPending=true;renderWaterRows();
    try{const d=await featureApi('/api/water-device/acknowledge-stopped',{did,confirmed:true});waterActive=d.active||{};$('waterDeviceStatus').textContent=d.message;window.dispatchEvent(new CustomEvent('jxau:water-spent'));}
    catch(e){$('waterDeviceStatus').textContent=e.message;}finally{waterPending=false;renderWaterRows();}
  }
  async function waterAction(btn){
    if(waterPending)return;const row=btn.closest('.water-device-row'),did=row.dataset.did,start=btn.dataset.action==='start';
    if(start&&waterLoginState==='expired')return;
    if(!start&&waterActive[did]==='manual-required'){await acknowledgeWater(did);return;}
    if(start&&!await window.HexuConfirm.ask('向“'+row.querySelector('.device-name').childNodes[0].textContent+'”发起接水？','发送请求后，请及时在水机上按“接水”。','发送接水请求',{tone:'primary',caption:'接水前确认',note:'一段时间未在水机上确认，设备可能自动退出。若未出水且无待结算，无需重复结束，可核对现场后解除本机记录。'}))return;
    if(waterPending||!waterRows.some(r=>r.id===did)||(start&&(waterActive[did]||waterLoginState==='expired')))return;
    waterPending=true;renderWaterRows();$('waterDeviceStatus').textContent=start?'正在请求接水…':'正在请求停止…';
    try{
      const d=await featureApi('/api/water-device/'+(start?'start':'end'),{did});
      if(d.active)waterActive=d.active;else if(start)waterActive[did]='requested';else delete waterActive[did];
      $('waterDeviceStatus').textContent=d.message||'操作完成';
      if(!start)window.dispatchEvent(new CustomEvent('jxau:water-spent'));
    }catch(e){if(waterSessionExpired(e)){showWaterLoginState('expired');waterNeedsRefresh=true;}$('waterDeviceStatus').textContent=e.message;if(e.data&&e.data.active)waterActive=e.data.active;else if(start&&/尚未确认|网络|Failed to fetch|超时/.test(e.message))waterActive[did]='unknown';}
    finally{waterPending=false;renderWaterRows();}
  }

  function closeLib(){window.appBack();}
  function openSettings(){switchMainTab('settings');}
  function closeSettings(){switchMainTab('today');}
  window.Jxau={plan:{morning:date=>{const p=planPosition(date);return p.week>=1&&p.week<=state.total&&morningEnabled(p.day)?[{id:'morning',day:date,name:'早检',room:morningRoom||'',start:morningTime.start,end:morningTime.end,custom:true}]:[];},day:planDay,date:planDate,position:planPosition,raw:planRaw,meta:()=>({week:state.week||realWeek(),current:realWeek(),total:state.total||20,scope:planKey(),term:cacheTerm,owner:accountName,known:!!Object.keys(weekCache).length,cachedWeeks:Object.keys(weekCache).map(Number)}),changes:()=>{ensurePlan();return JSON.parse(JSON.stringify(planChanges));},commit:c=>planCommit(custom,c,'课程或调休修改'),history:planHistory,counts:()=>{ensurePlan();return {undo:planPast.length,redo:planFuture.length};},display:(day,week)=>planDay(planDate(week,day)),render:()=>{renderPages();renderToday();},color:colorFor,styleCourseBlock,detail:e=>openCourseDetail([e.name,e.room,e.group,e.teacher],document.querySelector('[data-occurrence-id="'+window.HexuSchedule.hash(e.occurrenceKey)+'"]'),e),closeDetail:()=>closeDetail(),viewWeek:week=>{state.week=week;renderPages();}},water:{openEditor:openWaterEditor,refresh:loadWaterDevices},calendar:{room:item=>item.room&&item.room!=='19:00-20:30'?item.room:item.name==='晚自习'?nightRoom||'':item.room||'',total:()=>state.total||20,applies:appliesToWeek,items:()=>custom,visible:visibleCustom,school:schoolCourses,week:()=>state.week,currentWeek:()=>Math.max(1,Math.min(state.total||20,realWeek())),save:calendarSave,display:(day,week)=>planDay(planDate(week,day)),times:SLOT_TIMES,hm:minuteText},courseStyle:cxCourseStyle,courseInitial:cxCourseInitial,registerPage:registerPage,showRoute:showRoute,pushRoute:pushRoute,toast:toast,refreshBindings:fillSettings};
  window.appBack=function(){
    if(window.HexuConfirm&&window.HexuConfirm.close())return true;
    if(closeCxCourses())return true;
    if(window.HexuPlanner?.close())return true;
    if(window.HexuWaterSurfaces&&window.HexuWaterSurfaces.close())return true;
    if(window.JxauWaterTools&&window.JxauWaterTools.close())return true;
    if(window.JxauCalendar&&window.JxauCalendar.closeWheel())return true;
    if(document.body.dataset.page==='cxWork'&&window.JxauHomework){window.JxauHomework.back();return true;}
    if(!$('waterDeviceDialog').classList.contains('hidden')){closeWaterEditor();return true;}
    if(!$('cxLoginDialog').classList.contains('hidden')){window.HexuMotion.hide($('cxLoginDialog'));return true;}
    if(window.JxauAvatar&&window.JxauAvatar.close())return true;
    if(closeMorningRoom())return true;
    if(window.JxauDateRange&&window.JxauDateRange.close())return true;
    if(!$('modal').classList.contains('hidden')){closeModal();return true;}
    if($('detail').classList.contains('show')){closeDetail();return true;}
    if(document.body.dataset.page==='bookDetail'){
      if(history.state?.h==='#/bookDetail')history.back();
      else{showRoute('library');history.replaceState({},'','#/library');}
      return true;
    }
    if(!$('diag').classList.contains('hidden')){switchMainTab('settings');return true;}
    const id=document.body.dataset.page;
    if(id==='usageGuide'){
      if(history.state?.h==='#/usageGuide'&&location.hash==='#/usageGuide')history.back();
      else{showRoute(guideFrom);history.replaceState({},'','#/'+guideFrom);}
      return true;
    }
    if(id==='classAliases'||id==='classAliasEditor'){
      if(history.state?.h==='#/'+id&&location.hash==='#/'+id)history.back();
      else{const parent=id==='classAliasEditor'?'classAliases':'schedulePreferences';showRoute(parent);history.replaceState({},'','#/'+parent);}
      return true;
    }
    if(id==='notices'||id==='feedback'||id==='appearanceSettings'||id==='schedulePreferences'){showRoute('settings');history.replaceState({},'','#/settings');return true;}
    if(id==='waterSpendingDetail'){showRoute('waterDevice');history.replaceState({},'','#/waterDevice');return true;}
    if(id==='elec'&&history.state?.h==='#/elec'&&location.hash==='#/elec'){history.back();return true;}
    if(id==='elec'||id==='library'||id==='parcels'||id==='grades'||id==='integrations'||id==='chaoxing'||id==='waterDevice'){switchMainTab('today');return true;}
    if(id==='login'||id==='today')return false;
    switchMainTab('today');return true;
  };
  function realWeek(){
    if(!currentWeek)return state.week||1;
    const a=new Date(currentWeekAt||Date.now()),b=new Date();
    a.setHours(0,0,0,0);a.setDate(a.getDate()-((a.getDay()+6)%7));
    b.setHours(0,0,0,0);b.setDate(b.getDate()-((b.getDay()+6)%7));
    return currentWeek+Math.round((b-a)/604800000);
  }
  function rawSchoolCourses(day,weekNo){
    const rows=(weekCache[weekNo]||{}).rows||[],row=rows[day]||[],out=[];
    for(let slot=0;slot<SLOTS;slot++){
      const cell=row[slot];if(!cell)continue;let span=1;
      while(slot+span<SLOTS&&row[slot+span]===cell&&hm2min(SLOT_TIMES[slot+span][0])-hm2min(SLOT_TIMES[slot+span-1][1])<30)span++;
      const parts=String(cell).split(',');out.push({slot,endSlot:slot+span-1,name:parts[0],room:parts[1]||'',teacher:parts[3]||'',group:parts[2]||'',start:SLOT_TIMES[slot][0],end:SLOT_TIMES[slot+span-1][1],custom:false});slot+=span-1;
    }return out;
  }
  function appliesToWeek(item,weekNo){return !Array.isArray(item.weeks)||item.weeks.includes(weekNo);}
  function planKey(){return 'hexu-plan:v1:'+encodeURIComponent(accountName||'local')+':'+encodeURIComponent(cacheTerm||'local');}
  function ensurePlan(){const key=planKey();if(key===planScope)return;planScope=key;planPast=[];planFuture=[];try{const d=JSON.parse(localStorage.getItem(key)||'null');planChanges=d?window.HexuSchedule.validate(d):{overrides:{},transfers:[]};}catch(e){planChanges={overrides:{},transfers:[]};} }
  function planDate(week,day){const now=new Date(),mon=new Date(now);mon.setHours(12,0,0,0);mon.setDate(now.getDate()-((now.getDay()+6)%7)+(week-realWeek())*7+day);return window.HexuSchedule.format(mon);}
  function planPosition(date){const now=new Date(),a=window.HexuSchedule.day(date),b=window.HexuSchedule.day(planDate(realWeek(),0));return {week:realWeek()+Math.floor(Math.round((a-b)/86400000)/7),day:(a.getDay()+6)%7};}
  function planRaw(date){const p=planPosition(date);if(p.week<1||p.week>state.total)return [];
    const school=rawSchoolCourses(p.day,p.week).map(c=>({...c,id:'school-'+c.slot+'-'+window.HexuSchedule.hash(c.name+'|'+c.room+'|'+c.teacher),start:hm2min(c.start),end:hm2min(c.end),custom:false}));
    const local=custom.filter(c=>c.day===p.day&&appliesToWeek(c,p.week)&&(showNight||c.name!=='晚自习')&&!(c.name==='晚自习'&&school.some(l=>c.start<l.end&&c.end>l.start))).map(c=>({...c,room:c.room&&c.room!=='19:00-20:30'?c.room:c.name==='晚自习'?nightRoom||'':c.room||'',custom:true}));return school.concat(local);
  }
  function planDay(date){ensurePlan();return window.HexuSchedule.resolve(date,planChanges,planRaw).map(e=>({...e,day:planPosition(date).day}));}
  function schoolCourses(day,weekNo){return planDay(planDate(weekNo||realWeek(),day)).filter(c=>!c.custom).map(c=>({...c,start:minuteText(c.start),end:minuteText(c.end)}));}
  function visibleCustom(day,weekNo){return planDay(planDate(weekNo||realWeek(),day)).filter(c=>c.custom);}
  function planSnapshot(){return JSON.stringify({custom,changes:planChanges});}
  function planCommit(nextCustom,nextChanges,label){ensurePlan();const previous=planSnapshot();try{
    window.HexuSchedule.validate(nextChanges);const oldCustom=localStorage.getItem('custom'),oldChanges=localStorage.getItem(planScope);try{localStorage.setItem(planScope,JSON.stringify(nextChanges));localStorage.setItem('custom',JSON.stringify(nextCustom));}catch(e){if(oldChanges===null)localStorage.removeItem(planScope);else localStorage.setItem(planScope,oldChanges);if(oldCustom===null)localStorage.removeItem('custom');else localStorage.setItem('custom',oldCustom);throw e;}
    custom=JSON.parse(JSON.stringify(nextCustom));planChanges=JSON.parse(JSON.stringify(nextChanges));if(previous!==planSnapshot()){planPast.push({value:previous,label});if(planPast.length>20)planPast.shift();planFuture=[];}renderPages();renderToday();renderNightDays();window.dispatchEvent(new Event('jxau:plan-changed'));return true;
  }catch(e){toast(e.message||'保存失败，请检查存储空间');return false;}}
  function planHistory(redo){ensurePlan();const from=redo?planFuture:planPast,to=redo?planPast:planFuture;if(!from.length)return;const row=from[from.length-1],current=planSnapshot(),d=JSON.parse(row.value),oldChanges=localStorage.getItem(planScope),oldCustom=localStorage.getItem('custom');try{try{localStorage.setItem(planScope,JSON.stringify(d.changes));localStorage.setItem('custom',JSON.stringify(d.custom));}catch(e){if(oldChanges===null)localStorage.removeItem(planScope);else localStorage.setItem(planScope,oldChanges);if(oldCustom===null)localStorage.removeItem('custom');else localStorage.setItem('custom',oldCustom);throw e;}custom=d.custom;planChanges=d.changes;from.pop();to.push({value:current,label:row.label});renderPages();renderToday();renderNightDays();window.dispatchEvent(new Event('jxau:plan-changed'));toast((redo?'已重做：':'已撤回：')+row.label);}catch(e){toast('恢复失败，请检查存储空间');}}
  function calendarSave(next){ensurePlan();return planCommit(next,planChanges,'日程修改');}
  function coursesOfDay(day,weekNo){return planDay(planDate(weekNo||realWeek(),day)).map(c=>({...c,start:minuteText(c.start),end:minuteText(c.end)}));}
  function minuteText(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
  function renderNextClass(now){
    const el=$('tdNextClass'),dow=(now.getDay()+6)%7,week=realWeek(),list=coursesOfDay(dow,week),minutes=now.getHours()*60+now.getMinutes();
    const next=list.find(c=>hm2min(c.start)>minutes),cur=list.find(c=>minutes>=hm2min(c.start)&&minutes<hm2min(c.end));
    el.replaceChildren();
    const strong=document.createElement('strong');
    if(morningEnabled(dow)&&minutes<morningTime.end){
      const start=new Date(now);start.setHours(Math.floor(morningTime.start/60),morningTime.start%60,0,0);
      const end=new Date(now);end.setHours(Math.floor(morningTime.end/60),morningTime.end%60,0,0);
      strong.textContent=now<start?'距早检 '+timeUntil(start,now):'早检进行中';
      const detail=document.createElement('span');
      detail.textContent=(now<start?morningRange():'距结束 '+timeUntil(end,now))+' · '+(morningRoom||'早检教室未设置');
      el.append(strong,detail);el.classList.remove('muted');return;
    }
    if(!weekCache[week]&&!list.some(c=>c.custom))strong.textContent='缓存课表不完整，刷新后查看下节课提醒';
    else if(cur){const target=new Date(now),parts=cur.end.split(':');target.setHours(Number(parts[0]),Number(parts[1]),0,0);strong.textContent=(cur.custom?'当前安排进行中 · 距结束 ':'正在上课 · 距下课 ')+timeUntil(target,now);}
    else if(next){const target=new Date(now),parts=next.start.split(':');target.setHours(Number(parts[0]),Number(parts[1]),0,0);strong.textContent=(next.custom?'距下一项安排 ':'距下节课 ')+timeUntil(target,now);}
    else strong.textContent='今日已无后续安排';
    el.appendChild(strong);
    const focus=cur||next;
    if(focus&&(weekCache[week]||focus.custom)){const detail=document.createElement('span');detail.textContent=focus.start+' · '+focus.name;el.appendChild(detail);}
    el.classList.toggle('muted',!focus||(!weekCache[week]&&!focus.custom));
  }
  function timeUntil(target,now){
    const minutes=Math.max(1,Math.ceil((target-now)/60000)),hours=Math.floor(minutes/60),mins=minutes%60;
    return (hours?hours+'小时':'')+(mins?mins+'分钟':'');
  }
  function updateHomeGreeting(now=new Date()){
    const hour=now.getHours();
    $('homeGreeting').textContent=(hour>=5&&hour<11?'早上好':hour>=11&&hour<14?'中午好':hour>=14&&hour<18?'下午好':'晚上好')+'，江农er';
  }
  updateHomeGreeting();
  window.addEventListener('jxau:foreground',()=>updateHomeGreeting());
  function renderToday(){
    window.dispatchEvent(new Event('jxau:plan-changed'));
    const now=new Date(),dow=(now.getDay()+6)%7,minutes=now.getHours()*60+now.getMinutes(),week=realWeek();
    updateHomeGreeting(now);
    $('tdWeek').textContent='第 '+week+' 周 · 共 '+(state.total||20)+' 周';
    $('tdDate').textContent=(now.getMonth()+1)+' 月 '+now.getDate()+' 日 · 周'+DAYS[dow];
    const list=coursesOfDay(dow),cur=list.find(c=>minutes>=hm2min(c.start)&&minutes<hm2min(c.end)),remaining=list.filter(c=>hm2min(c.end)>minutes);
    const known=!!weekCache[week]||list.some(c=>c.custom);const next=list.find(c=>hm2min(c.start)>minutes),early=morningEnabled(dow)&&minutes<morningTime.end;
    renderNextClass(now);$('tdNextClass').classList.toggle('hidden',!early&&!!(cur||next)&&known||known&&!early&&!remaining.length);
    $('tdTip').textContent=!known?'本周课表尚未缓存，请联网刷新':cur?'正在上课 · '+cur.name:remaining.length?'今天还有 '+remaining.length+' 门课':list.length?'今天的课程已结束':'今天没有课';
    $('tdNowWrap').classList.add('hidden');
    if(cur){const start=hm2min(cur.start),end=hm2min(cur.end);$('tdNowName').textContent=cur.name;$('tdNowRoom').textContent=cur.room;$('tdBar').style.width=Math.round((minutes-start)/(end-start)*100)+'%';$('tdProg').textContent='还剩 '+(end-minutes)+' 分钟 · '+cur.start+'–'+cur.end;}
    if($('tdCourseCount'))$('tdCourseCount').textContent=remaining.length+' 项';
    $('tdList').innerHTML=remaining.length?remaining.map(c=>{
      const ended=false,isNext=!early&&!cur&&next===c,isCurrent=!early&&cur===c;
      const delta=isNext?Math.max(1,Math.ceil((hm2min(c.start)*60-now.getHours()*3600-now.getMinutes()*60-now.getSeconds())/60)):isCurrent?hm2min(c.end)-minutes:0;
      const number=delta>=60?Math.floor(delta/60):delta,unit=delta>=60?'小时':'分钟',tail=delta>=60&&delta%60?' '+delta%60+'分钟':'';
      const caption=isNext?'后开始 ↗':c.custom?'后结束':'后下课';
      return '<div class="tday-row'+(isCurrent?' cur':isNext?' next':'')+(ended?' ended':'')+'"><div class="tm">'+esc(c.start)+'<br>'+esc(c.end)+'</div><div class="bd">'+(isNext?'<small class="course-upcoming">● '+(c.custom?'下一项安排':'下一节')+'</small>':'')+'<div class="n">'+esc(c.name)+(c.custom?' <span class="custom-tag">自定义</span>':'')+'</div><div class="r">'+esc(c.room||'地点待定')+'</div></div>'+(ended?'<span class="ended-tag">已结束</span>':isNext||isCurrent?'<div class="course-countdown" aria-label="'+esc(isNext?$('tdNextClass').querySelector('strong').textContent:'进行中 · 还剩 '+delta+' 分钟')+'"><span class="sr-only">'+(isNext?(c.custom?'距下一项安排 ':'距下节课 '):'进行中 · 还剩 ')+'</span><span><b>'+number+'</b><small>'+unit+tail+'</small></span><span class="countdown-caption">'+caption+'</span></div>':'')+'</div>';
    }).join(''):'<div class="empty-day"><span class="empty-symbol" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5 3 2 5-4"/></svg></span><p>'+(known?(list.length?'今天的安排都完成了':'今天没有安排'):'本周课程尚未缓存')+'</p><small>'+(known?'留一点时间，做喜欢的事':'联网刷新后，再来看看今天的安排')+'</small></div>';
    if(Date.now()-todayElecAt>60000){todayElecAt=Date.now();loadTodayElec();}
  }
  function fillSettings(){
    $('setMorningValue').textContent=morningRoom||'未设置';
    $('swMorning').checked=showMorning;fillMorningTime();renderMorningDays();
    $('swNight').checked=showNight;$('nightRoom').value=nightRoom;updateRoomCard();
    updateSavedPassword();
    $('setUser').textContent=(accountName||secureData.cred&&secureData.cred.u||'未登录')+(secureData.cred?' · 已安全保存登录':'');
    $('setVer').textContent=window.__VER__||'—';
    if($('bindingState'))$('bindingState').textContent='校园门户：'+(secureData.cred?'已绑定':'未绑定')+'\n图书馆：复用门户登录\n空调电费：'+(elecCfg?'已绑定 · '+elecCfg.roomName:'未绑定')+'\n照明电费查询：暂未接入\n慧生活798（钱包 / 流水）：读取绑定状态中';
    window.dispatchEvent(new Event('jxau:bindings'));
  }
  function pager(container,page,total,size,onChange){
    const pages=Math.max(1,Math.ceil((total||0)/size)),wrap=document.createElement('div');wrap.className='pager';
    wrap.innerHTML='<button class="page-prev"'+(page<=1?' disabled':'')+'>上一页</button><span>'+page+' / '+pages+'</span><button class="page-next"'+(page>=pages?' disabled':'')+'>下一页</button>';
    wrap.querySelector('.page-prev').onclick=()=>onChange(page-1);wrap.querySelector('.page-next').onclick=()=>onChange(page+1);container.appendChild(wrap);
  }
  let libraryLoading=null,libraryReaderAccount=null;
  function libraryError(box,error){
    box.replaceChildren();const text=document.createElement('p');text.className='lbl';text.textContent=error.message||String(error);box.append(text);
    if(/重新登录|登录.*失效|登录.*过期|登录票据/.test(text.textContent)){const button=document.createElement('button');button.type='button';button.className='small-btn';button.textContent='重新登录门户';button.onclick=showLogin;box.append(button);}
  }
  async function loadLibrary(){
    if(libraryLoading)return libraryLoading;
    libraryReaderAccount=accountName;
    libraryLoading=(async()=>{
      $('libRefresh').disabled=true;$('libBorrow').innerHTML='<div class="lbl">加载中…</div>';$('libCount').textContent='—';$('libMoney').textContent='—';
      const info=await j('/api/lib/info').catch(e=>({ok:false,msg:e.message}));
      if(info.ok)$('libMoney').textContent=info.money==null?'暂不可用':Number(info.money).toFixed(2)+' 元';
      else if(/重新登录|登录.*失效|登录.*过期|登录票据/.test(info.msg||'')){libraryError($('libBorrow'),new Error(info.msg));return;}
      try{
        const data=await j('/api/lib/borrow?page='+libPage);if(!data.ok)throw new Error(data.msg||'借阅加载失败');
        $('libCount').textContent=data.total||0;const box=$('libBorrow');
        box.innerHTML=(data.list||[]).map((x,i)=>'<div class="reader-row"><b>'+esc(x.title)+'</b><div class="lbl">'+esc(x.author||'')+'</div><div>借出 '+esc(x.loanDate||'—')+' · 应还 '+esc(x.dueDate||'—')+'</div>'+(x.loanId!=null?'<button class="small-btn renew-book" data-index="'+i+'">续借</button>':'<div class="lbl">此记录未提供续借ID</div>')+'</div>').join('')||'<div class="lbl">暂时没有借阅中的书</div>';
      box.querySelectorAll('.renew-book').forEach(btn=>btn.onclick=async()=>{
        const item=data.list[Number(btn.dataset.index)];if(!confirm('续借《'+item.title+'》？'))return;
        btn.disabled=true;try{const result=await j('/api/lib/renew',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loanIds:[item.loanId]})});if(!result.ok)throw new Error(result.msg||'续借失败');toast(result.msg||'已提交，请核对新的到期日');await loadLibrary();}catch(e){toast(e.message);btn.disabled=false;}
      });
      pager(box,libPage,data.total,20,p=>{libPage=p;loadLibrary();});
      }catch(e){libraryError($('libBorrow'),e);}
    })();
    try{await libraryLoading;}finally{libraryLoading=null;$('libRefresh').disabled=false;}
  }
  async function doSearch(page){
    searchPage=typeof page==='number'?page:1;const q=$('libQ').value.trim(),disc=$('libDisc').value;
    if(!q&&!disc){$('libResults').innerHTML='';$('libHome').style.display='block';return;}
    $('libHome').style.display='none';$('libResults').innerHTML='<div class="lbl">搜索中…</div>';
    try{const data=await j('/api/lib/search?q='+encodeURIComponent(q)+'&discode='+encodeURIComponent(disc)+'&page='+searchPage);if(!data.ok)throw new Error(data.msg||'搜索失败');
      if(!(data.list||[]).length){$('libResults').innerHTML='<div class="lbl">没有找到相关书目</div>';return;}
      renderBookList($('libResults'),data);pager($('libResults'),searchPage,data.total,20,p=>doSearch(p));
    }catch(e){$('libResults').innerHTML='<div class="lbl">'+esc(e.message||e)+'</div>';}
  }
  async function loadHistory(){
    const box=$('libHistory');box.innerHTML='<div class="lbl">加载中…</div>';
    try{const data=await j('/api/lib/history?page='+historyPage);if(!data.ok)throw new Error(data.msg||'历史加载失败');
      box.innerHTML=(data.list||[]).map(x=>'<div class="reader-row"><b>'+esc(x.title)+'</b><div class="lbl">借出 '+esc(x.loanDate||'—')+' · 归还 '+esc(x.returnDate||'—')+'</div></div>').join('')||'<div class="lbl">暂无借阅历史</div>';
      pager(box,historyPage,data.total,20,p=>{historyPage=p;loadHistory();});
    }catch(e){libraryError(box,e);}
  }
  function readableData(value){
    const labels={loanNum:'借阅数量',loanDays:'借阅天数',renewNum:'续借次数',renewDays:'续借天数',name:'名称',title:'书名',num:'数量',count:'数量',year:'年份',month:'月份',typeName:'类别',readerTypeName:'读者类别',locationName:'馆藏地',applicableLocation:'适用馆藏地',maxPenalty:'最高逾期费用',ruleCode:'规则编号',normalLoanPeriod:'正常借期',ruleType:'规则类型',maxBorrowingNumber:'最多借阅册数',ruleName:'借阅规则',maxRenewalTime:'最多续借次数',applicablePolicy:'适用策略',keepBookNum:'保留册数',classNo:'分类',loanInfoChartDtos:'借阅趋势',callNoMapDtos:'分类借阅',callNo:'索书分类',code:'编号'};
    if(value==null)return '暂无数据';
    if(Array.isArray(value))return value.map(readableData).join('\n\n')||'暂无数据';
    if(typeof value==='object')return Object.keys(value).map(k=>(labels[k]||k)+'：'+readableData(value[k])).join('\n');return String(value);
  }
  async function readerExtra(kind){
    const box=$('libExtra');box.textContent='加载中…';
    try{const data=await j('/api/lib/'+kind);if(!data.ok)throw new Error(data.msg||'查询失败');
      if(kind==='chart'&&data.data&&Array.isArray(data.data.callNoMapDtos)){
        const rows=data.data.callNoMapDtos,classes=data.data.classNo||[],max=Math.max(1,...rows.map(x=>Number(x.num)||0));
        box.innerHTML='<b>按分类统计借阅册数</b>'+rows.map(x=>{const code=String(x.callNo||''),entry=classes.find(c=>String(c.code)===code||String(c.code)===code.slice(0,1));return '<div style="margin-top:12px"><div>'+esc(entry&&entry.name||code||'其他')+' · '+esc(x.num)+' 册</div><div style="background:var(--line);height:10px;border-radius:5px;margin-top:5px"><div style="width:'+Math.max(2,(Number(x.num)||0)/max*100)+'%;height:100%;background:var(--green2);border-radius:5px"></div></div></div>';}).join('')+(rows.length?'':'<p class="lbl">暂无借阅统计</p>');
      }else box.textContent=readableData(data.data);
    }
    catch(e){libraryError(box,e);}
  }
  let elecGeneration=0, renderedElecKey=null;
  async function refreshElec(){
    if(!elecCfg)return;
    const request=++elecGeneration, {roomId,userId,costType=0}=elecCfg;
    const cacheKey='elec_data_'+roomId+'_'+costType, viewKey=userId+'|'+cacheKey;
    const button=$('elecRefresh');
    button.classList.remove('hidden');button.disabled=true;button.textContent='刷新中';
    if(renderedElecKey!==viewKey||!$('elecRoom')){
      let cached;try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null');}catch(e){}
      if(cached){renderElec(cached);renderedElecKey=viewKey;}
      else $('elecBody').innerHTML='<div class="card elec-load" role="status">正在读取电费…</div>';
    }
    try{
      const data=await j('/api/elec/summary?roomId='+encodeURIComponent(roomId)+'&userId='+encodeURIComponent(userId)+'&costType='+costType);
      if(request!==elecGeneration)return;
      if(!data.ok)throw new Error(data.msg||'加载失败');
      data._savedAt=Date.now();
      try{localStorage.setItem(cacheKey,JSON.stringify(data));}catch(e){}
      renderElec(data);renderedElecKey=viewKey;
    }catch(e){
      if(request!==elecGeneration)return;
      if(renderedElecKey===viewKey&&$('elecRoom'))toast('刷新失败，当前显示上次用电数据');
      else{$('elecBody').innerHTML='<div class="card elec-load" role="status">'+esc(e.message||e)+'<button class="small-btn" type="button" id="retryElec">重试</button></div>';$('retryElec').onclick=refreshElec;}
    }finally{if(request===elecGeneration){button.disabled=false;button.textContent='刷新';}}
  }
  function usageValue(row){
    const raw=row.consumeTotal!=null?row.consumeTotal:row.consume;
    if(raw===null||raw===undefined||raw==='')return null;
    const value=Number(raw);return Number.isFinite(value)?value:null;
  }
  function dailyUsageBars(list){
    if(!list.length)return '<div class="usage-empty">暂无用电记录</div>';
    const values=list.map(usageValue),max=Math.max(0,...values.filter(v=>v!==null&&v>0))||1;
    return '<div class="usage-chart" aria-label="每日用电，单位度">'+list.map((row,i)=>{
      const v=values[i],label=String(row.costTime||row.date||''),width=v===null?0:Math.max(0,v)/max*100;
      return '<div class="usage-row"><time>'+esc(label.slice(5,10))+'</time><span class="usage-track" aria-hidden="true"><i style="width:'+width+'%"></i></span><strong>'+(v===null?'—':v.toFixed(2))+'</strong></div>';
    }).join('')+'</div>';
  }
  function monthlyUsageLine(list){
    const months=new Map();
    for(const row of list){
      if(!row)continue;
      const date=/^(\d{4})(?:[-/.](0?[1-9]|1[0-2])|((?:0[1-9]|1[0-2])))(?!\d)/.exec(String(row.costTime||row.date||'').trim());
      if(date)months.set(Number(date[1])*12+Number(date[2]||date[3])-1,usageValue(row));
    }
    if(!months.size||![...months.values()].some(v=>v!==null))
      return '<div class="usage-empty">暂无用电记录</div>';
    const first=Math.min(...months.keys()), last=Math.max(...months.keys()), rows=[];
    for(let m=Math.max(first,last-5);m<=last;m++)rows.push({month:m%12+1,year:Math.floor(m/12),value:months.get(m)??null});
    const values=rows.flatMap(r=>r.value===null?[]:[r.value]);
    if(!values.length)return '<div class="usage-empty">暂无近期用电记录</div>';
    const min=Math.min(0,...values), max=Math.max(1,...values);
    const y=value=>112-(value-min)/(max-min)*82;
    let path='',connected=false;
    const points=rows.map(({month,value},i)=>{
      const x=40+(i+.5)*270/rows.length;
      const label='<text class="usage-axis" x="'+x+'" y="136">'+month+'月</text>';
      if(value===null){connected=false;return label;}
      const height=y(value);
      path+=(connected?' L':' M')+x+' '+height;
      connected=true;
      return label+'<circle cx="'+x+'" cy="'+height+'" r="3.5"/><text class="usage-number" x="'+x+'" y="'+(height-9)+'">'+Number(value.toFixed(2))+'</text>';
    }).join('');
    const grid=[0,.5,1].map(p=>{
      const value=min+(max-min)*p,position=y(value);
      return '<line x1="40" x2="310" y1="'+position+'" y2="'+position+'"/><text class="usage-axis usage-scale" x="35" y="'+(position+3)+'">'+Number(value.toFixed(1))+'</text>';
    }).join('');
    const description=rows.map(({year,month,value})=>year+'年'+month+'月 '+(value===null?'无记录':value.toFixed(2)+'度')).join('，');
    return '<svg class="usage-line" viewBox="0 0 320 144" role="img" aria-label="'+esc(description)+'">'+grid+'<path d="'+path+'"/>'+points+'</svg>';
  }
  function renderElec(data){
    ++dailyGeneration;
    const rooms=elecCfg.rooms||[{roomId:elecCfg.roomId,fullName:elecCfg.roomName}],six=Array.isArray(data.sixMonth)?data.sixMonth:[];
    $('elecBody').innerHTML='<div class="card elec-summary"><label class="lbl" for="elecRoom">房间</label><select id="elecRoom" class="elec-input">'+rooms.map((r,i)=>'<option value="'+i+'"'+(r.roomId===elecCfg.roomId?' selected':'')+'>'+esc(r.fullName||r.roomName||r.roomId)+'</option>').join('')+'</select><div class="balance-caption"><span class="lbl">账户余额</span><span class="section-note">空调电费账户</span></div><div class="big">'+(data.balance==null?'—':Number(data.balance).toFixed(2))+'<span>元</span></div><div class="lbl">更新于 '+esc(new Date(data._savedAt||data.updatedAt||Date.now()).toLocaleString())+'</div><details class="fee-options"><summary>用量统计设置</summary><label class="lbl" for="elecType">统计口径</label><select id="elecType" class="elec-input">'+[0,1,2,3].map(n=>'<option value="'+n+'"'+(n===(elecCfg.costType||0)?' selected':'')+'>类型 '+n+(n===0?'（默认）':'（待核实）')+'</option>').join('')+'</select><p class="lbl">仅影响用量统计，不改变账户总余额。</p></details></div>'+
      '<div class="card monthly-stats"><div><span class="lbl">本月用电</span><div class="mid">'+(data.month&&data.month.consume!=null?Number(data.month.consume).toFixed(2):'—')+'<span>度</span></div></div><div><span class="lbl">本月电费</span><div class="mid">'+(data.month&&data.month.cost!=null?Number(data.month.cost).toFixed(2):'—')+'<span>元</span></div></div></div>'+
      '<div class="card usage-card"><div class="section-heading"><h2>近期用电</h2><span class="section-note">单位 · 度</span></div>'+monthlyUsageLine(six)+'</div>'+
      '<div class="card daily-card"><div class="section-heading"><h2>每日用电</h2><span class="section-note">度</span></div><input type="hidden" id="dailyBegin"><input type="hidden" id="dailyEnd"><div class="daily-toolbar"><button id="dailyRange" class="date-range-button" type="button" aria-haspopup="dialog"><span aria-hidden="true">▦</span><span id="dailyRangeLabel"></span><span aria-hidden="true">⌄</span></button><button class="fee-action" id="loadDaily">查询</button></div><div class="date-shortcuts"><button type="button" data-days="7">近7天</button><button type="button" data-days="14" class="selected">近14天</button><button type="button" data-days="30">近30天</button></div><div id="dailyBars" class="usage-empty">选择日期后查询每日用电</div></div>';
    $('elecType').closest('details').insertAdjacentHTML('beforebegin','<div class="elec-pay"><a class="fee-action" href="jxau-pocket://payment/open/aircon">前往完美校园缴费 ↗</a><p>打开完美校园后，请选择对应的空调电费缴费项目。</p></div>');
    $('elecRoom').onchange=async()=>{const r=rooms[Number($('elecRoom').value)];elecCfg.roomId=r.roomId;elecCfg.roomName=r.fullName||r.roomName;await saveVault('elec',elecCfg);refreshElec();};
    $('elecType').onchange=async()=>{elecCfg.costType=Number($('elecType').value);await saveVault('elec',elecCfg);refreshElec();};
    function setRange(begin,end){$('dailyBegin').value=begin;$('dailyEnd').value=end;$('dailyRangeLabel').textContent=begin.replace(/-/g,'.')+' — '+end.slice(5).replace('-','.');}
    function recent(days){const end=new Date(),begin=new Date();begin.setDate(end.getDate()-days+1);setRange(localDate(begin),localDate(end));}
    recent(14);
    $('dailyRange').onclick=()=>window.JxauDateRange.open($('dailyBegin').value,$('dailyEnd').value,(begin,end)=>{setRange(begin,end);document.querySelectorAll('.date-shortcuts button').forEach(b=>b.classList.remove('selected'));});
    document.querySelectorAll('.date-shortcuts button').forEach(b=>b.onclick=()=>{recent(Number(b.dataset.days));document.querySelectorAll('.date-shortcuts button').forEach(x=>x.classList.toggle('selected',x===b));loadDaily();});
    $('loadDaily').onclick=loadDaily;
  }
  function localDate(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
  let dailyGeneration=0;
  async function loadDaily(){
    const begin=$('dailyBegin').value,end=$('dailyEnd').value,box=$('dailyBars'),button=$('loadDaily');
    if(!begin||!end||begin>end||end>localDate(new Date())){toast('请选择有效日期范围');return;}
    if(new Date(end)-new Date(begin)>92*86400000){toast('每次最多查询93天');return;}
    const request=++dailyGeneration;box.textContent='正在读取用电记录…';button.disabled=true;button.textContent='读取中';
    try{const data=await j('/api/elec/daily?roomId='+encodeURIComponent(elecCfg.roomId)+'&userId='+encodeURIComponent(elecCfg.userId)+'&costType='+(elecCfg.costType||0)+'&begin='+begin+'&end='+end);if(!data.ok)throw new Error(data.msg||'查询失败');
      if(request!==dailyGeneration||!box.isConnected)return;
      const list=data.list||[];box.className='';box.innerHTML=list.length?dailyUsageBars(list):'<div class="usage-empty">该日期范围暂无用电记录</div>';
    }catch(e){if(request===dailyGeneration&&box.isConnected)box.textContent=e.message||e;}
    finally{if(request===dailyGeneration&&button.isConnected){button.disabled=false;button.textContent='查询';}}
  }
  let gradesRows=null, gradesRequest=0, gradesController=null;
  function clearGrades(){
    gradesRequest++;if(gradesController)gradesController.abort();gradesController=null;
    gradesRows=null;$('gradesList').textContent='';$('gradesStatus').textContent='';
    $('gradesTools').classList.add('hidden');$('gradesLogin').classList.add('hidden');
    $('gradesRefresh').disabled=false;$('gradesRefresh').textContent='刷新';
  }
  function gradeValue(v){return v===null||v===undefined||String(v).trim()===''?'—':String(v);}
  function gradeTerm(v){const t=String(v||'');return /^\d{4}[12]$/.test(t)?t.slice(0,4)+'–'+(+t.slice(0,4)+1)+' 学年 · 第'+t.slice(4)+'学期':t||'未标注学期';}
  function renderGrades(){
    if(gradesRows===null)return;
    const term=$('gradesTerm').value,rows=gradesRows.filter(r=>!term||String(r.Xq||'')===term);
    $('gradesCount').textContent=rows.length+' 门课程';
    $('gradesList').innerHTML=rows.length?rows.map(r=>{
      const pass=String(r.Jgbj),label=pass==='1'?'通过':pass==='0'?'未通过':'未标注';
      const fields=[['平时成绩',r.Pscj],['考试成绩',r.Kscj],['补考成绩',r.Bkcj],['重修成绩',r.Cxcj],['学时',r.Xs],['绩点',String(r.Point)==='-1'?'无':r.Point],['课程类别',r.Kclb],['考试类别',r.Kslb],['课程编号',r.Kcdm]];
      return '<article class="grade-card"><div class="grade-main"><div class="grade-course"><h2>'+esc(gradeValue(r.Kcmc))+'</h2><p>'+esc(gradeTerm(r.Xq))+'</p></div><div class="grade-result"><strong>'+esc(gradeValue(r.Zpcj))+'</strong><span>总评成绩</span></div></div><details><summary><span class="grade-badge '+(pass==='1'?'pass':pass==='0'?'fail':'')+'">'+label+'</span><span>成绩详情 <i>⌄</i></span></summary><dl>'+fields.map(f=>'<div><dt>'+f[0]+'</dt><dd>'+esc(gradeValue(f[1]))+'</dd></div>').join('')+'</dl>'+(r.Bz?'<p class="grade-remark">备注：'+esc(String(r.Bz))+'</p>':'')+'</details></article>';
    }).join(''):'<div class="grades-empty"><span data-icon="book" aria-hidden="true"></span><h2>暂无成绩记录</h2><p>学校教务系统暂未返回成绩。<br>如果尚未考试或成绩尚未公布，请稍后再来查看。</p></div>';
  }
  async function loadGrades(){
    if(gradesController)return;
    const request=++gradesRequest,owner=accountName,auth=loginEpoch,controller=new AbortController();gradesController=controller;
    const active=()=>request===gradesRequest&&owner===accountName&&auth===loginEpoch&&document.body.dataset.page==='grades';
    $('gradesRefresh').disabled=true;$('gradesRefresh').textContent='读取中…';
    $('gradesStatus').textContent='正在读取教务成绩…';$('gradesStatus').classList.remove('is-error');$('gradesLogin').classList.add('hidden');
    const timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const data=await j('/api/grades',{signal:controller.signal});if(!active())return;
      if(data.httpStatus===401){gradesRows=null;$('gradesList').textContent='';$('gradesTools').classList.add('hidden');$('gradesLogin').classList.remove('hidden');throw new Error('登录已失效，请重新登录后查询成绩。');}
      if(!data.ok||!Array.isArray(data.data)||data.data.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error(data.msg||'成绩数据读取失败，请稍后刷新重试。');
      gradesRows=data.data;
      const previous=$('gradesTerm').value,terms=[...new Set(gradesRows.map(r=>String(r.Xq||'')))].sort().reverse();
      $('gradesTerm').innerHTML='<option value="">全部学期</option>'+terms.filter(Boolean).map(t=>'<option value="'+esc(t)+'">'+esc(gradeTerm(t))+'</option>').join('');
      if(terms.includes(previous))$('gradesTerm').value=previous;
      $('gradesTools').classList.toggle('hidden',!gradesRows.length);renderGrades();
      $('gradesStatus').textContent='已更新 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    }catch(e){if(!active())return;$('gradesStatus').classList.add('is-error');$('gradesStatus').textContent=(e.name==='AbortError'?'读取超时，请检查网络后重试。':e instanceof TypeError?'网络连接失败，请检查网络后重试。':e.message||'成绩读取失败，请稍后重试。')+(gradesRows!==null?' 下方保留本次已读取的成绩。':'');}
    finally{clearTimeout(timeout);if(request===gradesRequest){gradesController=null;$('gradesRefresh').disabled=false;$('gradesRefresh').textContent='刷新';}}
  }

  function installExtensions(){
    // Detail is an independent page: hiding its previous page must not hide the detail.
    document.body.appendChild($('bookDetail'));
    MAIN_PAGES.concat(['login','elec','library','diag','bookDetail','grades','chaoxing','waterDevice','cxWork']).forEach(id=>registerPage(id,{}));
    registerPage('today',{onShow:()=>{renderToday();window.dispatchEvent(new Event('jxau:today'));}});registerPage('settings',{onShow:fillSettings});
    registerPage('appearanceSettings',{});registerPage('schedulePreferences',{onShow:fillSettings});
    [['openAppearanceSettings','appearanceSettings'],['openSchedulePreferences','schedulePreferences']].forEach(([button,page])=>{$(button).onclick=()=>{showRoute(page);pushRoute('#/'+page);};$(page+'Back').onclick=()=>window.appBack();});
    registerPage('usageGuide',{onShow:()=>window.scrollTo(0,0)});
    $('guidePrompt').classList.toggle('hidden',localStorage.getItem('hexuUsageGuideSeen')==='true');
    $('openFirstUseGuide').onclick=()=>openUsageGuide('today');
    $('dismissGuidePrompt').onclick=dismissGuidePrompt;
    $('openUsageGuide').onclick=()=>openUsageGuide('settings');
    $('usageGuideBack').onclick=()=>window.appBack();
    $('usageGuide').querySelectorAll('[data-guide-route]').forEach(button=>{
      button.onclick=()=>switchMainTab(button.dataset.guideRoute);
    });
    registerPage('grades',{onShow:()=>{clearGrades();void loadGrades();},onHide:clearGrades});
    registerPage('chaoxing',{onShow:()=>{void loadChaoxing();},onHide:closeCxCourses});
    registerPage('waterDevice',{onShow:({from}={})=>{if(!['waterSpendingDetail','integrations'].includes(from)||waterNeedsRefresh)void loadWaterDevices();}});
    registerPage('library',{onShow:({from})=>{
      if(from==='bookDetail')window.scrollTo(0,libraryDetailScroll);
      else{
        window.scrollTo(0,libraryScroll.get(libraryTab)||0);
        if(libraryTab==='mine'&&libraryReaderAccount!==accountName)void loadLibrary();
      }
    },onHide:()=>{libraryScroll.set(libraryTab,window.scrollY);libraryTabAnimation?.cancel();}});
    registerPage('bookDetail',{onShow:()=>window.scrollTo(0,0),onHide:()=>{
      bookDetailRequest++;
      const previous=libraryHistoryScroll;
      libraryHistoryScroll=undefined;
      if(previous)requestAnimationFrame(()=>{
        if(document.body.dataset.page!=='bookDetail')history.scrollRestoration=previous;
      });
    }});
    registerPage('schedule',{onShow:()=>{if(state.loaded)renderPages();else showSchedule(false);},onHide:()=>{resetWeekMotion();}});
    $('libQ').insertAdjacentHTML('afterend','<select id="libDisc" class="elec-input"><option value="">全部分类</option>'+LIB_CATS.map(x=>'<option value="'+x[0]+'">'+esc(x[0]+' · '+x[1])+'</option>').join('')+'</select>');
    $('libDisc').onchange=()=>doSearch(1);
    $('libMineView').insertAdjacentHTML('beforeend','<div class="card"><div class="lbl">借阅历史</div><button id="historyLoad" class="elec-btn">查看借阅历史</button><div id="libHistory"></div></div><div class="card"><div class="row2"><button id="rulesLoad" class="small-btn">借阅规则</button><button id="chartLoad" class="small-btn">借阅统计</button></div><div id="libExtra" class="reader-extra"></div></div>');
    $('historyLoad').onclick=loadHistory;$('rulesLoad').onclick=()=>readerExtra('rules');$('chartLoad').onclick=()=>readerExtra('chart');
    $('setUser').closest('.account-card').insertAdjacentHTML('afterend','<details class="card settings-binding"><summary>账号与绑定<span>管理 ›</span></summary><div id="bindingState" class="reader-extra lbl"></div><div class="settings-binding-actions"><button id="rebindPortal" class="small-btn">重新登录门户</button><button id="rebindElec" class="small-btn">重新绑定电费</button><button id="unbindElec" class="small-btn">解绑电费</button></div></details>');
    $('rebindPortal').onclick=showLogin;$('rebindElec').onclick=()=>{showRoute('elec');pushRoute('#/elec');renderElecBind();};
    $('unbindElec').onclick=async()=>{if(!await window.HexuConfirm.ask('解绑电费账号？','将清除本机电费绑定信息，之后需要重新绑定才能查询。','确认解绑'))return;try{await saveVault('elec',null);elecCfg=null;fillSettings();toast('已解绑');}catch(e){toast(e.message);}};
    $('diagRun').addEventListener('click',()=>{todayElecAt=0;});
  }

  (async function boot(){
    document.title='禾序 v'+(window.__VER__||'2.4');
    document.body.appendChild($('toast'));
    bindMainNav(); installExtensions(); installFeatureControls();
    try { await initVault(); } catch(e) { toast('安全凭证暂不可用：'+e.message); }
    loadElecCfg();
    if(secureData.cred){$('u').value=secureData.cred.u||'';$('p').value='';updateSavedPassword();}
    try {
      const status=await j('/api/status'); sessionAvailable=!!status.logged_in;accountName=status.user||(secureData.cred&&secureData.cred.u)||'';
      localStorage.removeItem('jxau_weeks');
      if(restoreCache()){
        renderPages();switchMainTab('today');
        if(status.logged_in)loadWeek(0).then(ok=>{if(activeTab==='today')renderToday();if(ok)void cacheSemester();});
        else {markOffline();toast('当前显示离线课表，可在「我的」重新登录');}
      }else if(status.logged_in){await showSchedule(false);switchMainTab('today');if(sessionAvailable&&state.loaded)void cacheSemester();}
      else showLogin();
    }catch(e){sessionAvailable=false;accountName=(secureData.cred&&secureData.cred.u)||'';if(restoreCache()){markOffline();renderPages();switchMainTab('today');}else showLogin();}
    if(new URLSearchParams(location.search).get('open')==='water')switchMainTab('waterDevice');
    if(new URLSearchParams(location.search).get('open')==='schedule')switchMainTab('schedule');
    let todayTickTimer=null;
    function tickToday(){
      clearTimeout(todayTickTimer);
      if(!$('today').classList.contains('hidden'))renderToday();
      todayTickTimer=setTimeout(tickToday,60000-Date.now()%60000);
    }
    tickToday();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tickToday();});
  })();
})();
