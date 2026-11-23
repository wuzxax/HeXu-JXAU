(function(){
  'use strict';
  const paths={
    package:'<path d="m3 7 9-5 9 5v10l-9 5-9-5Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
    leaf:'<path d="M20 4c-1 8-3 14-10 14a6 6 0 0 1-6-6C4 5 12 4 20 4Z"/><path d="M5 20 15 10M10 15v-5m0 5h5"/>',
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3"/>',
    book:'<path d="M12 6C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Zm0 0v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
    refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a7 7 0 0 1 7-6h2a7 7 0 0 1 7 6v2"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    drop:'<path d="M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
    light:'<path d="M9 18v-2c-6-4-3-13 3-13s9 9 3 13v2Zm0 3h6M9 18h6"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    trend:'<path d="m3 17 6-6 4 4 8-11m-6 0h6v6"/>'
  };
  function draw(element,name){
    if(paths[name])element.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
  }
  document.querySelectorAll('[data-icon]').forEach(element=>draw(element,element.dataset.icon));
  [['tabSearch','search'],['tabHot','trend'],['tabMine','book']].forEach(pair=>{const el=document.querySelector('#'+pair[0]+' span');if(el){el.className='ic';draw(el,pair[1]);}});
})();
