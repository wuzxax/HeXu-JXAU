(()=>{
 'use strict';const $=id=>document.getElementById(id);let scanner=null,stream=null,epoch=0,worker=null,workerReady=null,nextJob=0,pending=new Map(),timer=0,retiring=Promise.resolve();
 const mode=()=>localStorage.getItem('homeWaterMode')==='spending'?'spending':'balance';
 function disclosure(body,button,key,apply){
  let animation=null,fade=null,generation=0;const reveal=document.createElement('div');reveal.className='water-balance-reveal';body.before(reveal);reveal.append(body);
  function fold(animate=false){
   const collapsed=localStorage.getItem(key)==='true',from=reveal.getBoundingClientRect().height,opacity=getComputedStyle(reveal).opacity,token=++generation;
   animation?.cancel();fade?.cancel();reveal.hidden=false;body.classList.remove('hidden');
   button.setAttribute('aria-expanded',String(!collapsed));button.querySelector('.fold-caption').textContent=collapsed?'展开 ⌄':'收起 ⌃';apply?.(collapsed);
   const to=collapsed?0:body.getBoundingClientRect().height;
   if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches||!reveal.animate){reveal.hidden=collapsed;return;}
   animation=reveal.animate([{height:from+'px'},{height:to+'px'}],{duration:420,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'});
   fade=reveal.animate([{opacity},{opacity:collapsed?0:1}],{duration:collapsed?240:360,easing:'ease-out',fill:'forwards'});
   animation.finished.then(()=>{if(token!==generation)return;reveal.hidden=collapsed;animation.cancel();fade.cancel();animation=fade=null;},()=>{});
  }
  button.onclick=()=>{const was=localStorage.getItem(key)==='true';if(!was&&body.contains(document.activeElement))button.focus({preventScroll:true});localStorage.setItem(key,String(!was));fold(true);};fold();return button.onclick;
 }
 const balanceClick=disclosure($('waterBalanceBody'),$('waterBalanceToggle'),'waterBalanceCollapsed',collapsed=>{$('waterAccountFolded').classList.toggle('hidden',!collapsed);$('waterBalanceToggle').closest('section').classList.toggle('folded',collapsed);});
 $('waterBalanceToggle').onclick=()=>{const was=localStorage.getItem('waterBalanceCollapsed')==='true';balanceClick();if(was)window.Jxau.water.refresh();};
 $('waterAccountFolded').onclick=()=>$('waterManage').click();
 disclosure($('waterDevicesBody'),$('waterDevicesToggle'),'waterDevicesCollapsed');
 function renderMode(){const value=mode();$('tdWater').classList.toggle('is-spending',value==='spending');$('homeWaterSummary').classList.toggle('hidden',value!=='spending');$('homeWaterMode').querySelector('span').textContent=value==='spending'?'用水花费':'798余额';document.querySelectorAll('[data-water-mode]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.waterMode===value)));}
 function setHome(){const spending=mode()==='spending';renderMode();$('tdWaterLabel').textContent=spending?'本月用水':'798钱包';$('tdWaterMoney').textContent='—';$('tdWaterMoney').classList.add('unavailable');$('tdWaterName').textContent='';$('tdWaterCache').textContent='';$('homeWaterSummary').textContent='';if(spending)window.JxauSpending.load(false);else window.dispatchEvent(new Event('jxau:today'));}
 const choice=$('homeWaterMode'),menu=$('homeWaterMenu');
 function closeMenu(focus=false){if(menu.classList.contains('hidden'))return false;menu.classList.add('hidden');choice.setAttribute('aria-expanded','false');if(focus)choice.focus({preventScroll:true});return true;}
 choice.onclick=()=>{const open=choice.getAttribute('aria-expanded')!=='true';choice.setAttribute('aria-expanded',String(open));menu.classList.toggle('hidden',!open);if(open){window.HexuMotion?.enter(menu,'menu');menu.querySelector('[aria-checked=true]').focus({preventScroll:true});}};
 menu.addEventListener('click',e=>{const b=e.target.closest('[data-water-mode]');if(!b)return;localStorage.setItem('homeWaterMode',b.dataset.waterMode);closeMenu(true);setHome();});
 menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.home-water-choice'))closeMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu(true);});
 addEventListener('jxau:before-route',()=>closeMenu());
 const help=document.createElement('dialog');help.className='action-confirm widget-help';help.setAttribute('aria-labelledby','widgetHelpTitle');
 help.innerHTML='<h2 id="widgetHelpTitle">添加接水桌面小组件</h2><p data-widget-intro></p><ol><li><strong>长按桌面空白处</strong>，点击“添加”或“小组件”。</li><li>找到<strong>禾序 · 接水</strong>；vivo 桌面可先进入“原子组件”再查看应用列表。</li><li>拖到桌面后，已保存设备会自动分页。<strong>卡片通过上下滑动切换不同设备。</strong></li></ol><p class="widget-help-note">发送请求后，请及时在水机上按“接水”；长时间未确认，设备可能自动退出。</p><p class="widget-help-note"><strong>底部圆点</strong>表示当前页，<strong>右上角</strong>可快速选择设备。</p><div class="action-confirm-buttons"><button type="button" data-widget-close>稍后</button><a href="jxau-pocket://water/home">前往桌面</a></div>';
 document.body.append(help);
 function closeHelp(){if(!help.open)return false;help.close();document.querySelector('.water-widget-link')?.focus({preventScroll:true});return true;}
 help.querySelector('[data-widget-close]').onclick=closeHelp;help.querySelector('a').addEventListener('click',closeHelp);
 help.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
 help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeHelp();}});
 addEventListener('jxau:widget-help',e=>{help.querySelector('[data-widget-intro]').textContent=e.detail?.requested?'已向桌面发出添加请求。请在系统提示中确认；未出现提示时，可按以下步骤手动添加。':e.detail?.vivo?'当前 vivo 桌面需手动添加小组件，请按以下步骤操作。':'请在桌面的小组件列表中手动添加。';if(!help.open)help.showModal();help.querySelector('[data-widget-close]').focus({preventScroll:true});});
 window.HexuWaterSurfaces={close:()=>closeHelp()||closeMenu(true)};
 window.addEventListener('jxau:home-spending',()=>{if(mode()==='spending')window.JxauSpending.load(false);});
 window.addEventListener('jxau:spending-data',e=>{if(mode()!=='spending')return;const d=e.detail,drink=d.drink?.month?.amount,bath=d.bath?.month?.amount;if(drink==null&&bath==null){$('tdWaterMoney').textContent='暂无统计';$('tdWaterMoney').classList.add('unavailable');$('homeWaterSummary').textContent='暂无已同步的饮水与洗浴记录';return;}$('tdWaterMoney').textContent=(Number(drink||0)+Number(bath||0)).toFixed(2)+' 元';$('tdWaterMoney').classList.remove('unavailable');$('tdWaterName').textContent='';$('tdWaterCache').textContent='';const summary=$('homeWaterSummary');summary.replaceChildren();['饮水 '+Number(drink||0).toFixed(2)+' 元','洗浴 '+Number(bath||0).toFixed(2)+' 元',!d.complete?'部分记录':d.cached?'缓存统计':'本月合计'].forEach(text=>{const span=document.createElement('span');span.textContent=text;summary.append(span);});});
 window.addEventListener('jxau:spending-unbound',()=>{if(mode()==='spending'){$('tdWaterMoney').textContent='未绑定';$('tdWaterName').textContent='';$('homeWaterSummary').textContent='连接798后，可统计饮水与洗浴花费';$('tdWaterCache').textContent='';}});
 window.addEventListener('jxau:spending-error',e=>{if(mode()==='spending'&&!e.detail.cached){$('tdWaterMoney').textContent='暂不可用';$('tdWaterCache').textContent='';$('homeWaterSummary').textContent='点击用水卡片，进入接水页重试';}});
 window.addEventListener('jxau:water-account',()=>{if(mode()==='spending'){$('tdWaterMoney').textContent='—';$('tdWaterName').textContent='';$('tdWaterCache').textContent='';$('homeWaterSummary').textContent='';}});
 $('tdWaterLabel').textContent=mode()==='spending'?'本月用水':'798钱包';renderMode();
 function close(){
  if(!scanner)return false;epoch++;clearTimeout(timer);
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
  if(worker)worker.terminate();worker=null;workerReady=null;
  pending.forEach(job=>job.reject(Error('扫码已关闭')));pending.clear();
  const surface=scanner;scanner=null;retiring=window.HexuMotion.hide(surface,()=>surface.remove());return true;
 }
 function job(data,transfer=[]){return new Promise((resolve,reject)=>{const id=++nextJob;pending.set(id,{resolve,reject});worker.postMessage({id,...data},transfer);});}
 function loadDecoder(){
  if(!workerReady){
   worker=new Worker('js/water-qr-worker.js');
   worker.onmessage=e=>{const task=pending.get(e.data.id);if(!task)return;pending.delete(e.data.id);if(e.data.error)task.reject(Error(e.data.error));else task.resolve(e.data);};
   worker.onerror=()=>{pending.forEach(t=>t.reject(Error('二维码识别组件加载失败，请重新打开扫码')));pending.clear();};
   workerReady=job({});
  }return workerReady;
 }
 async function decoded(text,token,status,alias){
  // Normalize using the same parser as saving; never follow the scanned URL.
  const response=await fetch('/api/water-device/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({did:text,source:"scan"})});
  const data=await response.json();if(token!==epoch)return false;
  if(!response.ok||!data.ok){status.textContent=data.msg||'二维码中没有有效设备号，请扫描机器上的设备二维码。';return false;}
  close();const handoff=epoch;await retiring;
  if(handoff!==epoch||document.body.dataset.page!=='waterDevice')return false;
  if(!window.Jxau.water.openEditor(null,data.did)){return false;}
  if(alias)$('waterDeviceAlias').value=alias;$('waterDeviceSave').focus({preventScroll:true});return true;
 }
 async function scan(){
  close();await retiring;const token=++epoch,alias=$('waterDeviceDialog').classList.contains('hidden')?'':$('waterDeviceAlias').value;
  if(!$('waterDeviceDialog').classList.contains('hidden'))await window.HexuMotion.hide($('waterDeviceDialog'));
  if(token!==epoch)return;
  let album=false,reading=false,frameCount=0,lastText='',lastAt=0,nativeDetector=null;
  scanner=document.createElement('div');scanner.className='wheel-modal water-scan-modal';scanner.setAttribute('role','dialog');scanner.setAttribute('aria-modal','true');scanner.setAttribute('aria-label','扫描设备二维码');
  scanner.innerHTML='<section class="wheel-box"><div class="wheel-head"><div><span class="water-entry-caption">扫码添加 · 自动识别设备号</span><h3>扫描设备二维码</h3></div><button type="button" data-scan-close>关闭</button></div><div class="scan-viewport"><video class="scan-video" autoplay muted playsinline></video><span class="scan-guide" aria-hidden="true"></span></div><p class="scan-warning"><strong>仅扫描 798 饮水或洗浴设备二维码，请核对设备号，勿扫描付款码或其他二维码。</strong></p><p class="scan-status" role="status">正在打开摄像头…</p><div class="scan-actions"><button type="button" data-scan-image>识别相册图片</button><button type="button" data-scan-manual>改为手动输入编号</button></div><input type="file" accept="image/*" hidden></section>';document.body.append(scanner);
  const video=scanner.querySelector('video'),status=scanner.querySelector('.scan-status'),file=scanner.querySelector('input'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  scanner.querySelector('[data-scan-close]').onclick=close;scanner.onclick=e=>{if(e.target===scanner)close();};scanner.querySelector('[data-scan-manual]').onclick=async()=>{close();const handoff=epoch;await retiring;if(handoff===epoch&&document.body.dataset.page==='waterDevice')window.Jxau.water.openEditor(null);};scanner.querySelector('[data-scan-image]').onclick=()=>file.click();
  const ready=loadDecoder();ready.catch(()=>{});
  if(window.BarcodeDetector)try{nativeDetector=new BarcodeDetector({formats:['qr_code']});}catch(e){}
  function pixels(source,width,height,max,center){
   const side=Math.min(width,height)*.78,sw=center?side:width,sh=center?side:height,sx=center?(width-sw)/2:0,sy=center?(height-sh)/2:0,scale=Math.min(1,max/Math.max(sw,sh));
   canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));ctx.drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height);
  }
  async function read(source,width,height,max,center,harder){
   await ready;if(token!==epoch)return '';const data=pixels(source,width,height,max,center),buffer=data.data.buffer;
   return (await job({buffer,width:data.width,height:data.height,harder},[buffer])).text;
  }
  async function accept(text){if(!text)return false;const now=performance.now();if(text===lastText&&now-lastAt<2000)return false;lastText=text;lastAt=now;return decoded(text,token,status,alias);}
  file.onchange=async()=>{
   const f=file.files[0];if(!f)return;if(f.size>20*1024*1024){status.textContent='请选择小于20MB的图片';file.value='';return;}
   album=true;status.textContent='正在识别图片…';const url=URL.createObjectURL(f);
   try{
    // Wait for any camera decode to finish before sharing the canvas.
    while(reading&&token===epoch)await new Promise(r=>setTimeout(r,20));
    if(token!==epoch)return;const img=new Image();img.src=url;await img.decode();if(token!==epoch)return;
    let text='';if(nativeDetector)try{text=(await nativeDetector.detect(img))[0]?.rawValue||'';}catch(e){}
    for(const max of [1280,2048]){if(text||token!==epoch)break;text=await read(img,img.naturalWidth,img.naturalHeight,max,false,true);}
    if(token!==epoch)return;if(text)await accept(text);else status.textContent='图片中未识别到设备二维码，请靠近设备重拍或手动输入。';
   }catch(e){if(token===epoch)status.textContent='图片识别失败，请换一张或手动输入。';}
   finally{URL.revokeObjectURL(url);file.value='';album=false;}
  };
  const frame=async()=>{
   if(token!==epoch)return;
   if(!album&&!reading&&video.readyState>=2&&video.videoWidth){
    reading=true;
    try{
     let text='';if(nativeDetector)try{text=(await nativeDetector.detect(video))[0]?.rawValue||'';}catch(e){nativeDetector=null;}
     if(!text){const full=frameCount++%4===3;text=await read(video,video.videoWidth,video.videoHeight,full?1280:720,!full,full);}
     if(token===epoch&&!album&&await accept(text))return;
    }catch(e){if(token===epoch)status.textContent=e.message||'识别失败，可使用相册图片或手动输入。';}
    finally{reading=false;}
   }
   if(token===epoch)timer=setTimeout(frame,65);
  };
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('当前系统无法使用摄像头，可识别相册图片或手动输入。');
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
   if(token!==epoch){media.getTracks().forEach(t=>t.stop());return;}stream=media;video.srcObject=media;
   const track=media.getVideoTracks()[0],caps=track.getCapabilities?.();if(caps?.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
   await video.play();if(token!==epoch)return;if(!album)status.textContent='将设备二维码对准方框，识别后自动填入设备号。';frame();
  }catch(e){if(token===epoch&&!album)status.textContent=/denied|Permission|NotAllowed/i.test(e.message||e.name)?'摄像头权限未开启，可在系统设置授权，或识别相册图片。':e.message;}
 }
 $('waterScan').onclick=scan;$('waterEditorScan').onclick=scan;document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 window.JxauWaterTools={close};
 if(location.hash==='#/waterDevice')setTimeout(()=>window.Jxau.showRoute('waterDevice'),100);
})();
