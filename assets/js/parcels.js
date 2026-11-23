(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function open(){window.Jxau.showRoute('parcels');window.Jxau.pushRoute('#/parcels');window.scrollTo(0,0);}
  function init(){
    if(!window.Jxau){setTimeout(init,30);return;}
    window.Jxau.registerPage('parcels',{});
    ['tdParcels','svcParcels'].forEach(id=>{if($(id))$(id).onclick=open;});
    $('parcelsBack').onclick=()=>{window.Jxau.showRoute('today');window.Jxau.pushRoute('#/today');window.scrollTo(0,0);};
  }
  init();
})();
