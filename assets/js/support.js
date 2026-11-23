(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  window.Jxau.registerPage('feedback',{onShow:({from})=>{
    $('feedback').dataset.fromUpdate=String(from==='appUpdate');
    $('feedbackBack').textContent=from==='appUpdate'?'‹ 版本与更新':'‹ 我的';
  }});
  $('openFeedback').onclick=()=>{window.Jxau.showRoute('feedback');window.Jxau.pushRoute('#/feedback');};
  $('feedbackBack').onclick=()=>window.appBack();

  const repository='https://github.com/wuzxax/HeXu-JXAU/releases/';
  const current=String(window.__VER__||'');
  const period=6*60*60*1000;
  const retryDelay=10*60*1000;
  const check=$('updateCheck'),download=$('updateDownload'),status=$('updateStatus');
  let pending=false,lastAttempt=null,lastSuccess=null,release=null;

  function compare(a,b){
    const left=a.split('.').map(Number),right=b.split('.').map(Number);
    for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]-right[i];
    return 0;
  }

  function showRelease(data){
    const tag='v'+data.version,releaseUrl=repository+'tag/'+tag;
    const apk=repository+'download/'+tag+'/Hexu-'+tag+'.apk';
    const newer=compare(data.version,current)>0;
    const canDownload=newer&&data.downloadUrl===apk;
    $('updateAvailable').textContent=newer?' · 可更新至 '+tag:'';
    $('updateAvailable').hidden=!newer;
    $('updateLatest').textContent='v'+data.version;
    $('updateRelease').href=releaseUrl;
    download.classList.toggle('hidden',!canDownload);
    if(canDownload)download.href=apk;
    else download.removeAttribute('href');
    $('updateNotesText').textContent=String(data.notes||'').slice(0,6001);
    $('updateNotes').classList.toggle('hidden',!$('updateNotesText').textContent);
    status.textContent=newer?(canDownload?'发现新版本 '+tag+'，可以下载更新。':'发现新版本 '+tag+'，暂未上传 APK。')
      :compare(data.version,current)===0?'当前已是最新版本。':'当前版本高于 GitHub 已发布的版本。';
    status.dataset.state=newer?'new':'current';
    check.textContent='重新检查';
  }

  async function checkUpdate(manual=false){
    if(pending)return;
    const now=Date.now();
    if(!manual&&((lastSuccess!==null&&now-lastSuccess<period)||(lastAttempt!==null&&now-lastAttempt<retryDelay)))return;
    lastAttempt=now;
    pending=true;
    check.disabled=true;
    status.textContent='正在检查更新…';
    status.dataset.state='loading';
    try{
      const response=await fetch('/api/app/update');
      const data=await response.json();
      if(!response.ok||!data.ok||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(String(data.version)))throw Error();
      release=data;
      lastSuccess=Date.now();
      showRelease(data);
    }catch(_){
      status.textContent=release?'暂时无法连接 GitHub，显示上次检查结果。':'暂时无法连接 GitHub，请稍后重试。';
      status.dataset.state='offline';
      check.textContent='重新检查';
    }finally{pending=false;check.disabled=false;}
  }

  $('updateCurrent').textContent=current?'v'+current:'—';
  window.Jxau.registerPage('appUpdate',{onShow:()=>void checkUpdate()});
  $('openAppUpdate').onclick=()=>{window.Jxau.showRoute('appUpdate');window.Jxau.pushRoute('#/appUpdate');};
  $('appUpdateBack').onclick=()=>window.appBack();
  $('updateGroup').onclick=()=>$('openFeedback').click();
  check.onclick=()=>void checkUpdate(true);

  // Check after the first route settles and when returning to the app.
  let firstRoute=true;
  addEventListener('jxau:route',()=>{
    if(!firstRoute)return;
    firstRoute=false;
    setTimeout(checkUpdate,900);
  });
  addEventListener('jxau:foreground',()=>{if(!firstRoute)void checkUpdate();});
  $('feedbackCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText('1136772068');window.Jxau.toast('群号已复制');}
    catch(e){const input=$('feedbackGroup');input.focus();input.select();window.Jxau.toast('请长按群号复制');}
  };
})();
