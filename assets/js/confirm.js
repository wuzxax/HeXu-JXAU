(()=>{
 'use strict';
 const dialog=document.createElement('dialog');dialog.id='actionConfirm';dialog.className='action-confirm';
 dialog.setAttribute('aria-labelledby','actionConfirmTitle');dialog.setAttribute('aria-describedby','actionConfirmMessage');
 dialog.innerHTML='<span class="confirm-caption" hidden></span><h2 id="actionConfirmTitle"></h2><p id="actionConfirmMessage"></p><dl class="confirm-rows" hidden></dl><p class="confirm-note" hidden></p><div class="action-confirm-buttons"><button type="button" data-confirm-cancel>取消</button><button type="button" data-confirm-accept></button></div>';
 document.body.append(dialog);
 const cancel=dialog.querySelector('[data-confirm-cancel]'),accept=dialog.querySelector('[data-confirm-accept]');
 let resolve=null,opener=null;
 let retiring=false;
 function finish(value){
  if(!resolve)return false;if(retiring)return true;retiring=true;
  const done=resolve;
  const complete=()=>{dialog.close();dialog.classList.remove('hidden','surface-closing');resolve=null;retiring=false;if(opener?.isConnected)opener.focus({preventScroll:true});done(value);};
  if(window.HexuMotion)window.HexuMotion.hide(dialog,complete);else complete();return true;
 }
 function ask(title,message,label='确认删除',options={}){
  // Ignore repeated taps while a confirmation is already being reviewed.
  if(resolve)return Promise.resolve(false);
  document.getElementById('actionConfirmTitle').textContent=title;
  const description=document.getElementById('actionConfirmMessage');description.textContent=message;description.hidden=!message;accept.textContent=label;
  dialog.dataset.tone=options.tone||'danger';
  const caption=dialog.querySelector('.confirm-caption'),note=dialog.querySelector('.confirm-note');
  caption.textContent=options.caption||'';caption.hidden=!options.caption;note.textContent=options.note||'';note.hidden=!options.note;
  const rows=dialog.querySelector('.confirm-rows');rows.replaceChildren();rows.hidden=!options.rows?.length;
  for(const [label,value] of options.rows||[]){
   const row=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');
   term.textContent=label;detail.textContent=value;row.append(term,detail);rows.append(row);
  }
  if(!message&&options.note){note.id='actionConfirmNote';dialog.setAttribute('aria-describedby',note.id);}
  else dialog.setAttribute('aria-describedby',description.id);
  opener=document.activeElement;
  return new Promise(done=>{resolve=done;dialog.showModal();cancel.focus({preventScroll:true});});
 }
 cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);
 dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish(false);}});
 window.HexuConfirm={ask,close:()=>finish(false)};
})();
