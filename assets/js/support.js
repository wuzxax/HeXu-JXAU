(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  window.Jxau.registerPage('feedback',{});
  $('openFeedback').onclick=()=>{window.Jxau.showRoute('feedback');window.Jxau.pushRoute('#/feedback');};
  $('feedbackBack').onclick=()=>window.appBack();
  $('feedbackCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText('1136772068');window.Jxau.toast('群号已复制');}
    catch(e){const input=$('feedbackGroup');input.focus();input.select();window.Jxau.toast('请长按群号复制');}
  };
})();
