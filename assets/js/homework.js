(()=>{
  'use strict';
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected=null,data=null,answers={},dirty=false,busy=false,epoch=0,controller=null,leaving=false;
  const status=t=>$('cxWorkStatus').textContent=t;
  async function api(path,body,signal){
    const res=await fetch(path,body===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    let d;try{d=await res.json();}catch(e){throw new Error('返回内容异常，请检查网络后核对状态');}
    if(!res.ok||!d.ok)throw new Error(d.msg||'请求失败，请稍后重试');return d;
  }
  function rich(html){
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    const tags=new Set(['P','BR','B','STRONG','I','EM','U','S','SUB','SUP','SPAN','DIV','UL','OL','LI','TABLE','THEAD','TBODY','TR','TD','TH','BLOCKQUOTE','PRE','CODE','IMG']);
    doc.querySelectorAll('script,style,iframe,object,embed,form,svg,math,link,meta').forEach(e=>e.remove());
    [...doc.body.querySelectorAll('*')].reverse().forEach(el=>{
      if(!tags.has(el.tagName)){el.replaceWith(...el.childNodes);return;}
      [...el.attributes].forEach(a=>{if(!(el.tagName==='IMG'&&['src','alt'].includes(a.name))&&!(['TD','TH'].includes(el.tagName)&&['colspan','rowspan'].includes(a.name)))el.removeAttribute(a.name);});
      if(el.tagName==='IMG'){
        if(!validMedia(el.getAttribute('src'))){el.replaceWith(doc.createTextNode('[图片地址暂不支持]'));return;}
        el.loading='lazy';el.referrerPolicy='no-referrer';el.alt=el.alt||'题目图片';
      }
    });
    doc.querySelectorAll('p,div').forEach(el=>{if(el.querySelector('img')){while(el.firstChild?.nodeName==='BR'||el.firstChild?.nodeType===3&&!el.firstChild.textContent.trim())el.firstChild.remove();}if(!el.textContent.trim()&&!el.querySelector('img,table,br'))el.remove();});
    return doc.body.innerHTML;
  }
  function validMedia(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&/(^|\.)(chaoxing\.com|cldisk\.com)$/i.test(u.hostname);}catch(e){return false;}}
  function initial(q){if(q.type==='19'){const a={};(q.children||[]).forEach(c=>a[c.id]=initial(c));return a;}return Array.isArray(q.answer)?q.answer.slice():String(q.answer||'');}

  function plain(html){return new DOMParser().parseFromString(String(html||''),'text/html').body.textContent.trim();}
  function reviewOptions(q){
    if(Array.isArray(q.reviewOptions))return q.reviewOptions;
    if(q.options?.length)return q.options;
    const doc=new DOMParser().parseFromString(String(q.optionReview||''),'text/html'),items=[...doc.querySelectorAll('body>ul>li,body>ol>li')],out=[];
    for(const li of items){
      const match=/^\s*([A-Z])[.．、:：)）]\s*/.exec(li.textContent);if(!match)return [];
      for(const node of li.childNodes)if(node.nodeType===3&&/^\s*[A-Z][.．、:：)）]/.test(node.textContent)){node.textContent=node.textContent.replace(/^\s*[A-Z][.．、:：)）]\s*/,'');break;}
      out.push({value:match[1],html:li.innerHTML,placeholder:!li.querySelector('img')&&li.textContent.trim()===match[1]});
    }
    return out.length>=2&&new Set(out.map(o=>o.value)).size===out.length?out:[];
  }
  function assessment(q){
    if(data.canWrite||!data.submitted||!q.reviewParts)return null;
    const text=plain(q.stem),kind=q.choiceKind||(q.type==='0'?'single':q.type==='1'?'multiple':/[(（]\s*单选题/.test(text)?'single':/[(（]\s*多选题/.test(text)?'multiple':'');
    if(!['single','multiple'].includes(kind))return null;
    const options=reviewOptions(q),allowed=new Set(options.map(o=>o.value));if(allowed.size<2)return null;
    function keys(body){
      if(/<img\b/i.test(body||''))return null;
      let value=plain(body).normalize('NFKC').toUpperCase().replace(/\s/g,'');
      // Grade explicit option letters only; prose and math are never compared as answers.
      if(!/^[A-Z](?:[,，、;；/|]?[A-Z])*$/.test(value))return null;
      value=value.replace(/[,，、;；/|]/g,'');const letters=[...value];
      if(letters.some(k=>!allowed.has(k))||new Set(letters).size!==letters.length||kind==='single'&&letters.length!==1)return null;
      return letters.sort();
    }
    const mine=keys(q.reviewParts.mine),correct=keys(q.reviewParts.correct);if(!mine||!correct)return null;
    return {mine,correct,right:mine.join('')===correct.join('')};
  }
  function resultBadge(q){const a=assessment(q);return a?'<span class="cx-result '+(a.right?'right':'wrong')+'">'+(a.right?'✓ 答对':'✕ 答错')+'</span>':'';}
  function readonlyOptions(q){
    const options=reviewOptions(q),a=assessment(q);if(!options.length)return q.optionReview?'<div class="cx-work-rich cx-review-options">'+rich(q.optionReview)+'</div>':'';
    const placeholders=options.every(o=>o.placeholder||!/<img\b/i.test(o.html||'')&&plain(o.html)===o.value);
    if(placeholders&&/<img\b/i.test(q.stem||''))return '<p class="cx-image-options-note">选项见题图</p>';
    return '<div class="cx-review-options-list">'+options.map(o=>{
      const correct=a?.correct.includes(o.value),mine=a?.mine.includes(o.value),wrong=mine&&!correct;
      return '<div class="cx-review-option '+(correct?'is-correct':wrong?'is-wrong':'')+'"><b>'+esc(o.value)+'</b><div class="cx-work-rich">'+rich(o.html)+'</div>'+(correct||mine?'<span class="cx-option-note">'+(correct&&mine?'✓ 我的选择 · 正确':correct?'✓ 正确选项':'✕ 我的选择')+'</span>':'')+'</div>';
    }).join('')+'</div>';
  }
  function group(q,path){
    const val=path.length===1?answers[path[0]]:answers[path[0]]?.[path[1]];
    const k=esc(JSON.stringify(path));let html='<div class="cx-work-rich cx-question-stem">'+rich(q.stem)+'</div>';
    html+=(q.audio||[]).map((id,i)=>'<div class="cx-work-audio" data-object="'+esc(id)+'"><button type="button" class="cx-load-audio">播放音频'+((q.audio||[]).length>1?' '+(i+1):'')+'</button><p role="status"></p></div>').join('');
    if(data.canWrite&&['0','1','3'].includes(q.type))html+='<div class="cx-work-choices">'+(q.options||[]).map(o=>'<label class="cx-work-choice"><input type="'+(q.type==='1'?'checkbox':'radio')+'" name="cx-'+esc(q.id)+'" data-path="'+k+'" value="'+esc(o.value)+'"'+(q.type==='1'?(Array.isArray(val)&&val.includes(o.value)?' checked':''):(val===o.value?' checked':''))+'><b>'+esc(q.type==='3'?(o.value==='true'?'✓':'✕'):o.value)+'</b><div class="cx-work-rich">'+rich(o.html)+'</div></label>').join('')+'</div>';
    else if(data.canWrite&&['4','6'].includes(q.type))html+='<label class="cx-work-blank">我的作答<textarea data-path="'+k+'" maxlength="20000" rows="5" placeholder="填写文字答案">'+esc(val)+'</textarea></label>';
    else if(data.canWrite&&q.type==='2')html+=(Array.isArray(val)?val:[]).map((v,i)=>'<label class="cx-work-blank">第 '+(i+1)+' 空<textarea data-path="'+k+'" data-blank="'+i+'" maxlength="20000" rows="2">'+esc(v)+'</textarea></label>').join('');
    else if(q.type==='19')html+=(q.children||[]).map((c,i)=>'<section class="cx-work-sub"><header><span>子题 '+(i+1)+'</span>'+resultBadge(c)+'</header>'+group(c,[q.id,c.id])+'</section>').join('');
    else if(!data.canWrite)html+=readonlyOptions(q);
    const parts=q.reviewParts;
    const block=(key,label,body)=>'<section class="cx-answer-block '+key+'"><h4>'+label+'</h4><div class="cx-work-rich">'+rich(body)+'</div></section>';
    const visible=body=>body&&new DOMParser().parseFromString(body,'text/html').body.textContent.trim()||/<img/i.test(body||'');
    if(parts){
      const short=[parts.mine,parts.correct].every(v=>plain(v).length<=16&&!/<img|<table/i.test(v||''));
      html+='<div class="cx-answer-comparison '+(short?'compact':'')+'">'+block('mine','我的作答',visible(parts.mine)?parts.mine:'<p>学习通未返回作答内容</p>')+block('correct','正确答案',visible(parts.correct)?parts.correct:'<p>学习通暂未公布</p>')+'</div>';
      if(visible(parts.analysis))html+='<details class="cx-analysis-toggle"><summary>答案解析 <span>展开查看</span></summary>'+block('analysis','解析内容',parts.analysis)+'</details>';
      if(visible(parts.feedback))html+=block('feedback','教师评语',parts.feedback);
      if(visible(parts.unclassified))html+='<details class="cx-review-extra"><summary>其他批阅内容</summary><div class="cx-work-rich">'+rich(parts.unclassified)+'</div></details>';
    }else if(q.review)html+='<section class="cx-answer-block"><h4>批阅原文 · 暂无法分栏</h4><div class="cx-work-rich">'+rich(q.review)+'</div></section>';
    else if(!data.canWrite&&q.type!=='19'&&!q.children?.length){
      const val=path.length===1?answers[path[0]]:answers[path[0]]?.[path[1]];
      if(Array.isArray(val)?val.some(v=>String(v).trim()):String(val||'').trim())html+=block('mine',data.submitted?'我提交的作答':'我的已存作答',esc(Array.isArray(val)?val.join('；'):val));
    }
    return html;
  }
  function render(){
    const course=data.course||selected?.course||'';$('cxWork').style.cssText=window.Jxau.courseStyle(course);$('cxWorkCourse').dataset.initial=window.Jxau.courseInitial(course);
    $('cxWorkTitle').textContent=data.title||selected?.title||'作业';$('cxWorkCourse').textContent=data.course||selected?.course||'';
    $('cxWorkMeta').textContent=(data.submitted?'已提交':data.status||'状态未知')+' · '+data.questions.length+' 道大题';$('cxWorkMeta').classList.toggle('submitted',!!data.submitted);$('cxWork').classList.toggle('cx-is-submitted',!!data.submitted);
    $('cxWorkQuestions').innerHTML=data.questions.map((q,i)=>'<article class="card cx-work-question"><header><span>第 '+(i+1)+' 题</span>'+resultBadge(q)+'</header>'+group(q,[q.id])+'</article>').join('')||'<div class="card feature-empty">当前没有可展示的题目</div>';
    $('cxWorkActions').classList.toggle('hidden',!data.canWrite);$('cxWorkCheck').classList.toggle('hidden',!data.uncertain);
    $('cxWorkQuestions').querySelectorAll('[data-path]').forEach(input=>{
      input.addEventListener(input.tagName==='TEXTAREA'?'input':'change',()=>{
        if(busy||!data.canWrite)return;const path=JSON.parse(input.dataset.path);let obj=answers;
        if(path.length===2)obj=answers[path[0]];const key=path[path.length-1];
        if(input.dataset.blank!==undefined)obj[key][Number(input.dataset.blank)]=input.value;
        else if(input.type==='checkbox'){const values=new Set(Array.isArray(obj[key])?obj[key]:[]);if(input.checked)values.add(input.value);else values.delete(input.value);obj[key]=[...values];}
        else obj[key]=input.value;
        dirty=true;progress();
      });
    });
    $('cxWorkQuestions').querySelectorAll('.cx-load-audio').forEach(button=>button.onclick=()=>loadAudio(button));
    $('cxWorkQuestions').querySelectorAll('img').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','放大查看题目图片');img.onclick=()=>openImage(img);img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openImage(img);}};img.onerror=()=>{
      const msg=document.createElement('span');msg.textContent='图片加载失败，请重新读取或在学习通查看';img.replaceWith(msg);
      if(data?.canWrite){data.canWrite=false;$('cxWorkActions').classList.add('hidden');status('有题目图片未显示，已暂停保存和提交，避免漏题作答。');}
    };});
    lock(busy);progress();
  }
  function filled(q,v){if(q.type==='19')return (q.children||[]).every(c=>filled(c,v?.[c.id]));if(Array.isArray(v))return v.length>0&&v.every(s=>String(s).trim());return !!String(v||'').trim();}
  function progress(){if(!data)return;if(!data.canWrite){$('cxWorkProgress').textContent=data.submitted?'已提交 · 只读批阅':'只读查看';return;}const done=data.questions.filter(q=>filled(q,answers[q.id])).length;$('cxWorkProgress').textContent='已完成 '+done+' / '+data.questions.length+' 道大题'+(dirty?' · 有未保存修改':'');}
  function lock(value){busy=value;['cxWorkSave','cxWorkSubmit','cxWorkReload','cxWorkCheck'].forEach(id=>$(id).disabled=value);$('cxWorkQuestions').querySelectorAll('input,textarea').forEach(e=>e.disabled=value);}
  function pause(){document.querySelectorAll('#cxWork audio').forEach(a=>a.pause());}
  function leave(){
    if(leaving)return true;if(busy){window.Jxau.toast('正在处理作业请求，请稍候');return false;}
    if(dirty&&!confirm('有尚未保存到学习通的答案，确定离开？'))return false;
    dirty=false;epoch++;controller?.abort();pause();closeImage();return true;
  }
  function back(){if(closeImage())return;if(!leave())return;leaving=true;window.Jxau.showRoute('chaoxing');history.replaceState({},'','#/chaoxing');leaving=false;}
  async function load(){
    if(busy)return;if(dirty&&!confirm('重新读取会丢弃未保存的修改，是否继续？'))return;
    dirty=false;pause();const gen=++epoch;controller?.abort();controller=new AbortController();
    lock(true);status('正在读取完整题目…');const timeout=setTimeout(()=>controller?.abort(),45000);
    try{
      const d=await api('/api/chaoxing/work?index='+selected.index+'&expectedUrl='+encodeURIComponent(selected.url),undefined,controller.signal);
      if(gen!==epoch)return;if(!Array.isArray(d.questions))throw new Error('作业数据异常');
      data=d;notifyState(d);answers={};data.questions.forEach(q=>answers[q.id]=initial(q));render();status(d.notice||(d.canWrite?'答案修改后请保存草稿，完成后再确认提交。':'当前作业仅供查看'));
    }catch(e){if(gen!==epoch)return;status(e.name==='AbortError'?'读取超时，请检查网络后重试':e.message);}
    finally{clearTimeout(timeout);if(gen===epoch){controller=null;lock(false);}}
  }
  async function loadAudio(button){
    if(!data)return;const box=button.closest('.cx-work-audio'),message=box.querySelector('p'),sid=data.sessionId,gen=epoch;
    button.disabled=true;message.textContent='正在获取音频…';
    try{
      const d=await api('/api/chaoxing/work/audio?sessionId='+encodeURIComponent(sid)+'&objectId='+encodeURIComponent(box.dataset.object));
      if(gen!==epoch||sid!==data.sessionId)return;if(!validMedia(d.url))throw new Error('音频地址暂不支持');
      box.querySelector('audio')?.remove();const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=d.url;
      audio.onplay=()=>{document.querySelectorAll('#cxWork audio').forEach(a=>{if(a!==audio)a.pause();});};
      audio.onerror=()=>{message.textContent='音频加载失败，可点击重新获取';button.textContent='重新获取音频';};
      box.insertBefore(audio,message);message.textContent='点击播放器开始播放';button.textContent='重新获取音频';
    }catch(e){message.textContent=e.message;}finally{button.disabled=false;}
  }
  async function write(action){
    if(busy||!data?.canWrite)return;
    if(action==='submit'){
      if(!data.questions.every(q=>filled(q,answers[q.id]))){status('请完成所有题目后再提交；也可以先保存草稿。');return;}
      if(!confirm('确认提交“'+data.title+'”？提交后将交给学习通处理，请先检查全部答案。'))return;
    }
    const sid=data.sessionId;lock(true);status(action==='submit'?'正在校验并提交，请勿重复操作…':'正在保存到学习通…');
    try{
      const d=await api('/api/chaoxing/work/write',{sessionId:sid,action,confirmed:action==='submit',answers});
      status(d.msg||'操作完成');
      if(d.uncertain){data.uncertain=true;data.canWrite=false;$('cxWorkActions').classList.add('hidden');$('cxWorkCheck').classList.remove('hidden');}
      else if(d.submitted){dirty=false;data.questions.forEach(q=>saveCurrent(q,answers[q.id]));data.submitted=true;data.status='已提交';data.canWrite=false;pause();notifyState(data);render();status('作业提交成功，当前展示你提交的作答；重新读取可查看学习通批阅。');}
      else if(d.saved){dirty=false;progress();}
    }catch(e){
      status(e.message+'；答案保留在本页。若网络中断，请先核对状态。');
      data.canWrite=false;data.uncertain=true;$('cxWorkActions').classList.add('hidden');$('cxWorkCheck').classList.remove('hidden');
    }finally{lock(false);if(!data.canWrite)$('cxWorkQuestions').querySelectorAll('input,textarea').forEach(e=>e.disabled=true);}
  }
  async function check(){
    if(busy||!data)return;lock(true);status('正在核对学习通状态…');
    try{
      const d=await api('/api/chaoxing/work/check',{sessionId:data.sessionId});
      if(d.submitted){data=d;answers={};data.questions.forEach(q=>answers[q.id]=initial(q));notifyState(d);dirty=false;render();status('已确认作业已提交');}
      else status('尚未确认提交结果，答案仍保留。请在学习通核对，本页不会自动重试。');
    }catch(e){status(e.message);}finally{lock(false);if(!data.canWrite)$('cxWorkQuestions').querySelectorAll('input,textarea').forEach(e=>e.disabled=true);}
  }
  function saveCurrent(q,value){if(q.type==='19')(q.children||[]).forEach(c=>saveCurrent(c,value?.[c.id]));else q.answer=Array.isArray(value)?value.slice():String(value||'');}
  function notifyState(d){window.dispatchEvent(new CustomEvent('jxau:homework-state',{detail:{...d,sourceUrl:d.sourceUrl||selected?.url}}));}

  let imageScale=1,imageReturn=null;
  const viewer=document.createElement('div');viewer.id='cxImageViewer';viewer.className='hidden';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','题目图片预览');
  viewer.innerHTML='<div class="cx-image-toolbar"><button type="button" data-image="close">‹ 返回题目</button><span>图片预览</span><button type="button" data-image="minus" aria-label="缩小图片">−</button><button type="button" data-image="plus" aria-label="放大图片">＋</button></div><div class="cx-image-scroll"><img alt="题目图片放大预览"></div><p>点击 ＋ 放大后可左右滑动查看</p>';
  document.body.appendChild(viewer);
  function openImage(source){if(!validMedia(source.src))return;imageReturn=source;imageScale=1;const img=viewer.querySelector('img');img.src=source.src;img.referrerPolicy='no-referrer';img.style.width='100%';viewer.classList.remove('hidden');viewer.querySelector('.cx-image-scroll').scrollTo(0,0);document.body.classList.add('cx-image-open');viewer.querySelector('button').focus();}
  function closeImage(){if(viewer.classList.contains('hidden'))return false;viewer.classList.add('hidden');viewer.querySelector('img').removeAttribute('src');document.body.classList.remove('cx-image-open');imageReturn?.focus({preventScroll:true});return true;}
  viewer.onclick=e=>{const action=e.target.closest('[data-image]')?.dataset.image;if(action==='close')closeImage();else if(action){imageScale=Math.max(1,Math.min(4,imageScale+(action==='plus'?.5:-.5)));viewer.querySelector('img').style.width=(imageScale*100)+'%';}};
  viewer.onkeydown=e=>{if(e.key==='Escape'){closeImage();return;}if(e.key==='Tab'){const buttons=[...viewer.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&i===buttons.length-1){e.preventDefault();buttons[0].focus();}}};
  window.JxauHomework={back,leave,closeImage};
  $('cxWorkBack').onclick=back;$('cxWorkReload').onclick=()=>void load();$('cxWorkSave').onclick=()=>void write('save');$('cxWorkSubmit').onclick=()=>void write('submit');$('cxWorkCheck').onclick=()=>void check();
  window.addEventListener('jxau:homework',event=>{
    selected=event.detail;data=null;answers={};dirty=false;$('cxWorkQuestions').textContent='';$('cxWorkTitle').textContent=selected.title;$('cxWorkActions').classList.add('hidden');$('cxWorkCheck').classList.add('hidden');
    window.Jxau.showRoute('cxWork');window.Jxau.pushRoute('#/cxWork');window.scrollTo(0,0);void load();
  });
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
})();
