(()=>{
 'use strict';
 // Independent, static rounded-lens map. Inspired by the edge-displacement architecture
 // of rdev/liquid-glass-react; text/icons remain outside the filtered backdrop layer.
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('glass-filter-defs');svg.setAttribute('aria-hidden','true');
 const defs=document.createElementNS(ns,'defs');svg.append(defs);document.body.append(svg);
 const surfaces=[...document.querySelectorAll('.glass-surface')].filter(e=>!e.classList.contains('nav-carry'));
 const supports=window.CSS&&CSS.supports('backdrop-filter','blur(1px)');
 function node(name,attrs){const el=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
 function lens(el,index){
  if(!supports||!el.offsetWidth||!el.offsetHeight)return;
  const w=Math.round(el.offsetWidth),h=Math.round(el.offsetHeight),signature=w+'x'+h;
  if(el.dataset.lensSize===signature)return;
  const radius=Math.min(h/2,parseFloat(getComputedStyle(el).borderRadius)||22),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)return;const pixels=ctx.createImageData(w,h),r=radius,edge=10;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=x-w/2+.5,py=y-h/2+.5,qx=Math.abs(px)-(w/2-r),qy=Math.abs(py)-(h/2-r);
   const ox=Math.max(qx,0),oy=Math.max(qy,0),len=Math.hypot(ox,oy),distance=Math.min(Math.max(qx,qy),0)+len-r;
   let nx=0,ny=0;if(len>.001){nx=ox/len*Math.sign(px);ny=oy/len*Math.sign(py);}else if(qx>qy)nx=Math.sign(px);else ny=Math.sign(py);
   const t=Math.max(0,Math.min(1,1+distance/edge)),strength=t*t*(3-2*t),i=(y*w+x)*4;
   // Keep samples on the glass at the rim so the filter does not create a second edge.
   pixels.data[i]=Math.round(128-nx*strength*105);pixels.data[i+1]=Math.round(128-ny*strength*105);pixels.data[i+2]=128;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);const id='jxau-lens-'+index;let filter=document.getElementById(id);if(filter)filter.remove();
  filter=node('filter',{id,x:'-8%',y:'-24%',width:'116%',height:'148%','color-interpolation-filters':'sRGB'});
  const image=node('feImage',{href:canvas.toDataURL(),x:'0',y:'0',width:w,height:h,preserveAspectRatio:'none',result:'lens'});filter.append(image);
  ['R','G','B'].forEach((channel,i)=>{
   filter.append(node('feDisplacementMap',{in:'SourceGraphic',in2:'lens',scale:12+i*.65,xChannelSelector:'R',yChannelSelector:'G',result:'warp'+channel}));
   const matrix=Array(20).fill(0);matrix[i*5+i]=1;matrix[18]=1;
   filter.append(node('feColorMatrix',{in:'warp'+channel,type:'matrix',values:matrix.join(' '),result:'channel'+channel}));
  });
  filter.append(node('feBlend',{in:'channelR',in2:'channelG',mode:'screen',result:'rg'}),node('feBlend',{in:'rg',in2:'channelB',mode:'screen'}));defs.append(filter);
  let layer=el.querySelector(':scope>.glass-optics');if(!layer){layer=document.createElement('span');layer.className='glass-optics';layer.setAttribute('aria-hidden','true');el.prepend(layer);}
  layer.style.filter='url(#'+id+')';el.dataset.lensSize=signature;el.classList.add('has-optics');
 }
 let scheduled=0;
 function refresh(){cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(()=>surfaces.forEach((el,i)=>{try{lens(el,i);}catch(e){el.classList.remove('has-optics');}}));}
 if(supports){if(window.ResizeObserver){const observer=new ResizeObserver(refresh);surfaces.forEach(e=>observer.observe(e));}addEventListener('resize',refresh);addEventListener('jxau:route',refresh);refresh();}
})();
