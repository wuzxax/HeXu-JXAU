(function(){
  'use strict';
  // Paused for this release: retain the HAR integration without exposing it to users.
  const lightingEnabled=false;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,body){
    const options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const response=await fetch(path,options);const result=await response.json();
    if(!result.ok)throw Error(result.msg||'平台暂不可用，请稍后重试');return result;
  }
  let seed='',walletId='',walletName='',waterPage=1,waterBound=false,overviewRequest=0,walletRequest=0;
  function showOverview(data){
    if(localStorage.getItem('homeWaterMode')==='spending')return;
    const amount=data.balance!=null?data.balance:data.total,element=$('tdWaterMoney');
    if(element){element.textContent=amount==null?'余额未知':Number(amount).toFixed(2)+' 元';element.classList.toggle('unavailable',amount==null);}
    if($('tdWaterName'))$('tdWaterName').textContent=data.name||walletName||'';
    if($('tdWaterCache'))$('tdWaterCache').textContent=data.cached?'缓存 · '+formatTime(data.updatedAt):'';
  }
  function formatTime(value){
    if(value==null||value==='')return '时间未知';
    let input=value;
    if(/^\d{10,13}$/.test(String(value)))input=Number(value)*(String(value).length===10?1000:1);
    const date=new Date(input);return Number.isNaN(date.getTime())?String(value):date.toLocaleString('zh-CN',{hour12:false});
  }
  const waiting='已验证照明项目6990。首次使用请导入本人微信照明页面HAR，应用只保存加密授权并查询剩余电量。';
  const lightingURL='https://h5cloud.17wanxiao.com:18443/CloudPayment/bill/selectPayProject.do?txcode=2&interurl=substituted_pay&payProId=6990&amtflag=0&payamt=1000&payproname=%E5%AD%A6%E7%94%9F%E7%85%A7%E6%98%8E%E7%94%A8%E7%94%B5%E7%BC%B4%E8%B4%B9&img=https://payicons.59wanmei.com/cloudpayment/images/project/img-nav_2.png&subPayProId=&fixamtlist=';
  function init(){
    if(!window.Jxau){setTimeout(init,50);return;}
    const root=document.createElement('div');root.id='integrations';root.className='hidden';
    root.innerHTML='<div class="topbar"><div class="t"><button id="integrationBack" class="backbtn" style="margin-right:10px">‹</button><span id="integrationTitle">生活服务</span></div></div><div id="integrationBody" class="elec-body" style="padding-bottom:90px"></div>';
    document.body.appendChild(root);
    window.Jxau.registerPage('integrations',{});
    $('integrationBack').onclick=()=>window.appBack();
    window.addEventListener('jxau:service',e=>open(e.detail));
    window.addEventListener('jxau:bindings',updateBindingStatus);
    window.addEventListener('jxau:today',()=>{updateOverview();updateLightingOverview();});
    if($('tdWater'))$('tdWater').onclick=()=>{if(localStorage.getItem('homeWaterMode')==='spending'){window.Jxau.showRoute('waterDevice');window.Jxau.pushRoute('#/waterDevice');}else open('water');};
    if($('tdLighting')){$('tdLighting').disabled=false;$('tdLighting').onclick=()=>open('lighting');}
    if($('svcCard')){$('svcCard').setAttribute('aria-disabled','false');$('svcCard').classList.remove('is-locked');const desc=$('svcCard').querySelector('.sd');if(desc)desc.textContent='查询暂未接入 · 前往完美校园';const arrow=$('svcCard').querySelector('.sa');if(arrow)arrow.textContent='›';}
    updateOverview();updateLightingOverview();
    setInterval(()=>{updateOverview();updateLightingOverview();},300000);
    document.addEventListener('click',e=>{
      
      if(e.target.closest('#openWaterBinding'))open('water');
    });
    const binding=$('bindingState');
    if(binding){
      binding.insertAdjacentHTML('afterend','<div class="reader-extra binding-actions"><button id="openWaterBinding" class="small-btn">管理798钱包</button></div>');
    }
  }
  async function updateBindingStatus(){
    try{
      const status=await api('/api/life798/status'),binding=$('bindingState');
      if(binding)binding.textContent=binding.textContent.replace(/慧生活798（钱包 \/ 流水）：[^\n]*/, '慧生活798（钱包 / 流水）：'+(status.bound?'已绑定':'未绑定'));
    }catch(e){const binding=$('bindingState');if(binding)binding.textContent=binding.textContent.replace('读取绑定状态中','状态暂不可用');}
  }
  async function updateOverview(){
    const request=++overviewRequest;
    try{
      const status=await api('/api/life798/status');
      if(request!==overviewRequest)return;
      const element=$('tdWaterMoney');if(!element)return;
      if(localStorage.getItem('homeWaterMode')==='spending'){window.dispatchEvent(new Event('jxau:home-spending'));return;}
      walletId=status.selectedEid||'';walletName=status.selectedName||'';
      if(!status.bound){element.textContent='未绑定';element.classList.add('unavailable');$('tdWaterName').textContent='';$('tdWaterCache').textContent='';return;}
      $('tdWaterName').textContent=walletName;
      const value=await api('/api/life798/wallet?eid='+encodeURIComponent(walletId));
      if(request===overviewRequest)showOverview(value);
    }catch(e){if(request!==overviewRequest||localStorage.getItem('homeWaterMode')==='spending')return;const el=$('tdWaterMoney');if(el){el.textContent=e.message.includes('绑定')?'请重新绑定':'暂不可用';el.classList.add('unavailable');}$('tdWaterCache').textContent='';}
  }
  function navigate(title){window.Jxau.showRoute('integrations');window.Jxau.pushRoute('#/integrations');$('integrationTitle').textContent=title;}
  async function open(kind){
    const relogin=kind==='water-relogin';
    if(relogin)kind='water';
    if(kind!=='water'&&!lightingEnabled){
      navigate('照明电费');
      $('integrationBody').innerHTML='<section class="card lighting-entry"><h2>照明电费</h2><p>照明电费查询暂未接入，敬请期待。<br>目前可前往完美校园查询与缴费。</p><a class="fee-action full-width" href="jxau-pocket://payment/open/lighting">打开完美校园 App ↗</a></section>';
      return;
    }
    if(kind==='water'){navigate('慧生活798 · 钱包');await water(relogin);}
    else {navigate('完美校园 · 照明电费');await perfect(kind);}
  }
  function message(error){if($('integrationMessage'))$('integrationMessage').textContent=error.message||String(error);}
  function loading(label){$('integrationBody').innerHTML='<div class="card"><div class="lbl">'+esc(label||'加载中…')+'</div></div>';}
  async function water(relogin=false){
    loading();
    try{const status=await api('/api/life798/status');waterBound=!!status.bound;walletId=status.selectedEid||'';walletName=status.selectedName||'';}
    catch(e){waterBound=false;}
    if(!waterBound||relogin){
      $('integrationBody').innerHTML='<div class="card"><b>绑定本人798钱包</b><p class="lbl">填写798手机号与验证码即可，登录凭证保存在本机加密区。</p><input id="lifePhone" class="elec-input" inputmode="tel" autocomplete="tel" placeholder="798手机号"><div style="display:flex;gap:10px;align-items:center"><input id="lifeCaptcha" class="elec-input" placeholder="图形验证码" style="min-width:0"><img id="lifeCaptchaImage" style="width:110px;height:44px;object-fit:contain" alt="点击刷新验证码"></div><button id="lifeSend" class="elec-btn">获取短信验证码</button><input id="lifeCode" class="elec-input" inputmode="numeric" autocomplete="one-time-code" placeholder="短信验证码"><button id="lifeLogin" class="elec-btn">绑定钱包</button><div id="integrationMessage" class="err" style="white-space:pre-wrap;margin-top:12px"></div></div><div class="card lbl">这里只查询钱包和消费记录。充值、退款等操作请使用官方798。</div>';
      const loginNotice=document.createElement('p');
      loginNotice.className='water-login-note';
      loginNotice.textContent=$('waterLoginNotice').textContent;
      $('lifeLogin').before(loginNotice);
      addPaymentEntry();
      $('lifeCaptchaImage').onclick=captcha;
      $('lifeSend').onclick=async()=>{
        const button=$('lifeSend');button.disabled=true;
        try{const result=await api('/api/life798/sms',{phone:$('lifePhone').value.trim(),captcha:$('lifeCaptcha').value.trim(),s:seed});$('integrationMessage').textContent=result.msg||'验证码已发送，请查看手机短信';let n=60;const timer=setInterval(()=>{if(!button.isConnected){clearInterval(timer);return;}button.textContent=n+'秒后重发';if(--n<0){clearInterval(timer);button.disabled=false;button.textContent='获取短信验证码';}},1000);}
        catch(e){message(e);button.disabled=false;await captcha();}
      };
      $('lifeLogin').onclick=async()=>{
        const button=$('lifeLogin');button.disabled=true;
        try{await api('/api/life798/login',{phone:$('lifePhone').value.trim(),code:$('lifeCode').value.trim()});window.dispatchEvent(new Event('jxau:water-account'));updateOverview();updateBindingStatus();await water();}
        catch(e){message(e);button.disabled=false;}
      };
      await captcha();return;
    }
    $('integrationBody').innerHTML='<div class="card wallet-summary"><div class="lbl">校区 / 钱包商户</div><select id="lifeWallet" class="elec-input"></select><div class="lbl">钱包余额</div><div class="big" id="lifeBalance">—</div><div id="lifeBreakdown" class="lbl"></div><div id="lifeTimestamp" class="lbl" style="margin-top:10px"></div><div class="wallet-actions"><button id="lifeRefresh" class="small-btn">刷新余额</button><a id="walletPayments" class="fee-action" href="jxau-pocket://payment/open/life798">支付宝充值 ↗</a><button id="lifeUnbind" class="text-button">解绑</button></div></div><div class="card wallet-history"><div class="section-heading"><h2>消费记录</h2><span class="section-note">已付款 · 元</span></div><div id="lifeHistory">加载中…</div><div class="row2"><button id="lifePrev" class="small-btn">上一页</button><span id="lifePage"></span><button id="lifeNext" class="small-btn">下一页</button></div></div><div id="integrationMessage" class="err"></div>';
    addPaymentEntry();
    $('lifeRefresh').onclick=()=>loadWallet(true);
    $('lifeWallet').onchange=async()=>{
      const select=$('lifeWallet');select.disabled=true;++overviewRequest;++walletRequest;
      try{
        const status=await api('/api/life798/select-wallet',{eid:select.value});
        walletId=status.selectedEid;walletName=status.selectedName;
        $('tdWaterMoney').textContent='加载中…';$('tdWaterName').textContent=walletName;$('tdWaterCache').textContent='';
        $('lifeBalance').textContent='加载中…';$('lifeBreakdown').textContent='';$('lifeTimestamp').textContent='';
        await loadWallet();
      }catch(e){message(e);select.value=walletId;}
      finally{if(select.isConnected)select.disabled=false;}
    };
    $('lifeUnbind').onclick=async()=>{if(!await window.HexuConfirm.ask('解绑798账号？','将清除本机798登录与钱包授权。重新绑定后可继续使用，798官方账号不受影响。','确认解绑'))return;try{await api('/api/life798/unbind',{});window.dispatchEvent(new Event('jxau:water-account'));walletId='';updateOverview();updateBindingStatus();await water();}catch(e){message(e);}};
    $('lifePrev').onclick=()=>{if(waterPage>1){waterPage--;loadHistory();}};
    $('lifeNext').onclick=()=>{waterPage++;loadHistory();};
    waterPage=1;await Promise.all([loadWallet(),loadHistory()]);
  }
  function addPaymentEntry(){
    if(!$('walletPayments'))$('integrationBody').insertAdjacentHTML('afterbegin','<div class="wallet-payment-entry"><span>慧生活798</span><a id="walletPayments" class="fee-action" href="jxau-pocket://payment/open/life798">支付宝充值 ↗</a></div>');
  }
  async function captcha(){
    try{const data=await api('/api/life798/captcha');seed=data.s;$('lifeCaptchaImage').src=data.img;}
    catch(e){if($('integrationMessage'))message(e);}
  }
  async function loadWallet(manual){
    const button=$('lifeRefresh'),select=$('lifeWallet');
    if(manual&&button&&button.disabled)return;
    const request=++walletRequest,requestedId=walletId;
    if(button){button.disabled=true;button.textContent='刷新中…';button.setAttribute('aria-busy','true');}
    if(manual)walletFeedback('正在刷新余额…','loading');
    try{
      const data=await api('/api/life798/wallet?eid='+encodeURIComponent(requestedId));
      if(request!==walletRequest||$('lifeWallet')!==select)return;
      walletId=data.eid||walletId;walletName=data.name||walletName;
      $('lifeWallet').innerHTML=(data.wallets||[]).map(w=>'<option value="'+esc(w.id)+'"'+(String(w.id)===String(walletId)?' selected':'')+'>'+esc(w.name||w.id)+'</option>').join('')||'<option>'+esc(data.name||'当前钱包')+'</option>';
      const amount=data.balance!=null?data.balance:data.total;
      $('lifeBalance').innerHTML=amount==null?'余额未知':Number(amount).toFixed(2)+' <span class="balance-unit">元</span>';
      const fields=[['线上现金','olCash'],['线上赠款','olGift'],['线下现金','ofCash'],['线下赠款','ofGift']];
      $('lifeBreakdown').innerHTML=fields.filter(x=>data[x[1]]!=null).map(x=>'<span>'+x[0]+'<b>'+Number(data[x[1]]).toFixed(2)+'</b></span>').join('');
      $('lifeTimestamp').textContent=(data.cached?'离线缓存 · ':'')+'数据截至 '+new Date(data.updatedAt||Date.now()).toLocaleString();
      $('integrationMessage').textContent=data.warning||'';
      showOverview(data);
      if(manual){
        const warning=data.cached||data.warning;
        walletFeedback(data.cached?'当前为缓存余额，暂未获取到最新数据':data.warning||'余额已更新',''+(warning?'warning':'success'));
        window.Jxau.toast(data.cached?'暂未获取最新余额':data.warning?'余额已读取，请查看提示':'余额刷新成功');
      }
    }catch(e){if(request===walletRequest&&$('lifeWallet')===select){
      if(manual){walletFeedback('刷新失败，已保留上次余额。'+(e.message||'请稍后重试'),'warning');window.Jxau.toast('余额刷新失败，请重试');}
      else {$('lifeBalance').textContent='暂不可用';$('tdWaterMoney').textContent='暂不可用';$('tdWaterMoney').classList.add('unavailable');message(e);}
    }}finally{
      if(request===walletRequest&&button&&button.isConnected){button.disabled=false;button.textContent='刷新余额';button.removeAttribute('aria-busy');}
    }
  }
  function walletFeedback(text,kind){
    let el=$('walletRefreshStatus');
    if(!el&&$('lifeRefresh')){el=document.createElement('div');el.id='walletRefreshStatus';el.setAttribute('role','status');el.setAttribute('aria-live','polite');$('lifeRefresh').closest('.wallet-actions').after(el);}
    if(el){el.className='refresh-feedback '+kind;el.textContent=text;}
  }
  async function loadHistory(){
    try{
      const data=await api('/api/life798/history?page='+waterPage);
      if(!$('lifeHistory'))return;
      $('lifeHistory').innerHTML=(data.list||[]).map(x=>'<div class="wallet-bill"><div><b>'+esc(x.title||'消费')+'</b><small>'+esc(formatTime(x.time))+'</small></div><strong>'+esc(x.amount==null?'金额未知':Number(x.amount).toFixed(2)+' 元')+'</strong></div>').join('')||'<div class="lbl">本页没有消费记录</div>';
      $('lifePage').textContent='第 '+waterPage+' 页';$('lifePrev').disabled=waterPage<=1;
      if(data.cached)$('integrationMessage').textContent='当前消费记录为缓存，数据截至 '+new Date(data.updatedAt).toLocaleString();
      $('lifeNext').disabled=data.total!=null?waterPage*(data.pageSize||10)>=data.total:(data.list||[]).length<(data.pageSize||10);
    }catch(e){message(e);}
  }
  async function perfect(kind){
    if(!lightingEnabled)return;
    loading();let status;try{status=await api('/api/lighting/status');}catch(e){$('integrationBody').innerHTML='<div class="card err">'+esc(e.message)+'</div>';return;}
    $('integrationBody').innerHTML='<div class="card"><b>照明电费授权</b><p class="lbl">导入本人从微信进入照明页面时抓取的HAR，授权仅保存在本机加密区。授权失效时需重新导入。</p><input id="lightingHar" type="file" accept=".har,application/json"><button id="lightingImport" class="elec-btn">导入并验证</button><button id="lightingUnbind" class="small-btn">清除本机照明绑定</button><div id="integrationMessage" class="err" style="margin-top:12px"></div></div><div class="card"><b>官方缴费页面</b><p class="lbl">查询失败或需要缴费时，可从完美校园公众号重新进入官方页面。</p><a class="elec-btn" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box" href="'+esc(lightingURL)+'">打开官方照明页面</a></div><div class="card lbl">这里只查询剩余电量，单位为度。缴费请在完美校园官方页面操作。</div>';
    $('lightingImport').onclick=async()=>{const button=$('lightingImport'),file=$('lightingHar').files[0];if(!file){message(Error('请选择本人HAR文件'));return;}if(file.size>8*1024*1024){message(Error('HAR文件请小于8MB'));return;}button.disabled=true;try{const raw=await file.text();const response=await fetch('/api/lighting/import-har',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});const data=await response.json();if(!data.ok)throw Error(data.msg||'导入失败');await perfect('lighting');updateLightingOverview();}catch(e){message(e);}finally{if(button.isConnected)button.disabled=false;}};
    $('lightingUnbind').onclick=async()=>{if(!await window.HexuConfirm.ask('清除照明绑定？','将删除本机照明授权与宿舍选择，之后需要重新导入授权。','确认清除'))return;try{await api('/api/lighting/unbind',{});await perfect('lighting');updateLightingOverview();}catch(e){message(e);}};
    if(status.bound){await lightingPicker();if(status.roomSelected&&$('lightingRefresh'))$('lightingRefresh').click();}
  }
  let lightingGeneration=0;
  async function updateLightingOverview(){
    const generation=++lightingGeneration,el=$('tdLightingMoney');
    if(!lightingEnabled){if(el){el.textContent='打开完美校园';el.classList.add('unavailable');}return;}
    try{const status=await api('/api/lighting/status');if(generation!==lightingGeneration)return;
      if(!status.bound){el.textContent='未绑定';el.classList.add('unavailable');return;}
      if(!status.roomSelected){el.textContent='请选择宿舍';el.classList.add('unavailable');return;}
      const data=await api('/api/lighting/summary');if(generation!==lightingGeneration)return;el.textContent=Number(data.quantity).toFixed(2)+' '+data.unit;el.classList.remove('unavailable');
    }catch(e){if(generation===lightingGeneration){el.textContent='需刷新授权';el.classList.add('unavailable');}}
  }
  async function lightingPicker(){
    if(!lightingEnabled)return;
    const card=document.createElement('div');card.className='card';card.innerHTML='<b>选择本人宿舍</b><div id="lightingLevels"></div><div id="lightingResult" class="lbl"></div><button id="lightingRefresh" class="small-btn">刷新已选宿舍电量</button>';
    $('integrationBody').prepend(card);const selected={};let generation=0;
    function show(data){if(!card.isConnected)return;$('lightingResult').textContent='剩余 '+Number(data.quantity).toFixed(2)+' '+data.unit+' · 数据截至 '+new Date(data.updatedAt).toLocaleString();const el=$('tdLightingMoney');++lightingGeneration;el.textContent=Number(data.quantity).toFixed(2)+' '+data.unit;el.classList.remove('unavailable');}
    $('lightingRefresh').onclick=async()=>{try{show(await api('/api/lighting/summary'));}catch(e){if(card.isConnected)$('lightingResult').textContent=e.message;}};
    async function level(n){
      const request=++generation;
      if(!card.isConnected)return;
      $('lightingLevels').querySelectorAll('select').forEach(x=>{if(Number(x.dataset.level)>=n)x.remove();});
      try{
        const result=await api('/api/lighting/rooms',Object.assign({level:n},selected));
        if(!card.isConnected||request!==generation)return;
        const node=document.createElement('select');node.className='elec-input';node.dataset.level=n;
        node.innerHTML='<option value="">请选择'+['','校区','楼栋','楼层','房间'][n]+'</option>'+(result.list||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+'</option>').join('');
        $('lightingLevels').appendChild(node);
        node.onchange=async()=>{
          ++generation;
          $('lightingLevels').querySelectorAll('select').forEach(x=>{if(Number(x.dataset.level)>n)x.remove();});
          $('lightingResult').textContent='';
          if(n<4){const fields=['','areaid','buildid','levelid'];for(let i=n;i<4;i++)delete selected[fields[i]];if(!node.value)return;selected[fields[n]]=node.value;await level(n+1);}
          else if(node.value){const id=++generation;try{const data=await api('/api/lighting/summary?roomverify='+encodeURIComponent(node.value));if(card.isConnected&&id===generation)show(data);}catch(e){if(card.isConnected&&id===generation)$('lightingResult').textContent=e.message;}}
        };
      }catch(e){if(card.isConnected&&request===generation)$('lightingResult').textContent=e.message;}
    }
    await level(1);
  }
  init();
})();
