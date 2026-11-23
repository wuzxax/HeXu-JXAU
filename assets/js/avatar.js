(function(){
  'use strict';
  const $=id=>document.getElementById(id),key='jxau_avatar:v1';
  let saved='',pending='',busy=false,generation=0,opener=null;
  try{const value=localStorage.getItem(key)||'';if(/^data:image\/jpeg;base64,/.test(value)&&value.length<350000)saved=value;}catch(e){}
  const dialog=document.createElement('dialog');dialog.id='avatarDialog';dialog.className='avatar-dialog';
  dialog.setAttribute('aria-labelledby','avatarTitle');
  dialog.innerHTML='<h2 id="avatarTitle">自定义头像</h2><p>选择喜欢的图片，仅保存在本机。</p><div id="avatarPreview" class="avatar-preview"></div><input type="file" id="avatarFile" accept="image/*" hidden><button type="button" id="avatarChoose" class="fee-outline full-width">选择图片</button><div id="avatarMessage" role="status" aria-live="polite"></div><div class="avatar-actions"><button type="button" id="avatarCancel" class="fee-outline">取消</button><button type="button" id="avatarSave" class="fee-action">保存头像</button></div><button type="button" id="avatarReset" class="room-clear">恢复默认头像</button>';
  document.body.appendChild(dialog);
  const defaultIcon=$('homeAccount').innerHTML;
  function picture(el,value){el.replaceChildren();if(value){const img=new Image();img.src=value;img.alt='自定义头像';el.appendChild(img);}else el.innerHTML=defaultIcon;}
  function paint(){picture($('homeAccount'),saved);document.querySelectorAll('.account-mark').forEach(el=>picture(el,saved));}
  function preview(){picture($('avatarPreview'),pending);$('avatarReset').disabled=busy||!pending;$('avatarSave').disabled=busy;$('avatarChoose').disabled=busy;}
  function close(){if(!dialog.open)return false;generation++;dialog.close();if(opener&&opener.isConnected)opener.focus({preventScroll:true});return true;}
  function open(){if(dialog.open)return;pending=saved;busy=false;$('avatarMessage').textContent='';$('avatarFile').value='';opener=document.activeElement;preview();dialog.showModal();}
  $('avatarChoose').onclick=()=>$('avatarFile').click();
  $('avatarCancel').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  $('avatarReset').onclick=async()=>{if(busy||!pending)return;if(!await window.HexuConfirm.ask('恢复默认头像？','当前头像预览会被清除，点击保存头像后生效。','确认恢复'))return;pending='';$('avatarMessage').textContent='保存后恢复默认头像';preview();};
  $('avatarFile').onchange=async()=>{
    const file=$('avatarFile').files[0];if(!file)return;
    if(!file.type.startsWith('image/')||file.type==='image/svg+xml'){$('avatarMessage').textContent='请选择照片或PNG、JPEG等图片';return;}
    if(file.size>12*1024*1024){$('avatarMessage').textContent='图片过大，请选择12MB以内的图片';return;}
    const current=++generation;busy=true;$('avatarMessage').textContent='正在处理图片…';preview();
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      if(current!==generation||!dialog.open)return;
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const context=canvas.getContext('2d');context.fillStyle='#eef4f0';context.fillRect(0,0,256,256);
      const size=Math.min(img.naturalWidth,img.naturalHeight);
      context.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,256,256);
      pending=canvas.toDataURL('image/jpeg',.85);$('avatarMessage').textContent='预览已更新，点击保存即可使用';
    }catch(e){if(current===generation)$('avatarMessage').textContent='无法读取这张图片，请换一张试试';}
    finally{URL.revokeObjectURL(url);if(current===generation){busy=false;preview();}}
  };
  $('avatarSave').onclick=()=>{
    if(busy)return;
    try{if(pending)localStorage.setItem(key,pending);else localStorage.removeItem(key);saved=pending;paint();close();window.Jxau.toast('头像已保存');}
    catch(e){$('avatarMessage').textContent='保存失败，请重试';}
  };
  window.JxauAvatar={open:open,close:close};paint();
})();
