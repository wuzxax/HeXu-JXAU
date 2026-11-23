(() => {
  'use strict';
  const canvas = document.createElement('canvas');
  canvas.className = 'dock-refraction';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const source = document.createElement('canvas');
  const atlas = source.getContext('2d', {willReadFrequently:true});
  const texture = document.createElement('canvas');
  const textureContext = texture.getContext('2d');
  const dock = document.getElementById('mainTabbar');
  if (!ctx || !atlas || !textureContext || !dock || !window.Path2D
      || typeof Path2D.prototype.roundRect !== 'function'
      || !CSS.supports('clip-path', 'path(evenodd, "M0 0H1V1Z")')) return;
  const margin = 12;
  const optics = {
    real: {tint:.72, refraction:6.6, dispersion:5.7},
    natural: {tint:.85, refraction:6, dispersion:4.7},
    gentle: {tint:1, refraction:5.3, dispersion:3.8}
  };
  dock.append(canvas);
  const glyphs = [...dock.querySelectorAll('.main-tab')].map(button => {
    const group = document.createElement('span');
    group.className = 'dock-glyph';
    group.append(...button.childNodes);
    button.append(group);
    return group;
  });

  let bounds, boxes, pixels, geometry, scale, dark, profile, glow, pending = 0, lensImage, lensWidth, lensHeight;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)').matches;

  function drawIcon(svg, x, y, width, height) {
    atlas.save();
    atlas.translate(x, y);
    atlas.scale(width / 24, height / 24);
    atlas.lineWidth = Number(svg.getAttribute('stroke-width')) || 1.7;
    atlas.lineCap = 'round';
    atlas.lineJoin = 'round';
    for (const child of svg.children) {
      const n = key => Number(child.getAttribute(key));
      if (child.tagName.toLowerCase() === 'path') {
        atlas.stroke(new Path2D(child.getAttribute('d')));
      } else if (child.tagName.toLowerCase() === 'rect') {
        atlas.beginPath();
        atlas.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx'));
        atlas.stroke();
      } else if (child.tagName.toLowerCase() === 'circle') {
        atlas.beginPath();
        atlas.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
        atlas.stroke();
      }
    }
    atlas.restore();
  }

  function start() {
    const {glass,colorMode,glow:touchGlow}=document.documentElement.dataset;
    profile=optics[glass];
    if (reduced() || !profile) return;
    bounds = dock.getBoundingClientRect();
    scale = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.ceil((bounds.width + margin * 2) * scale);
    const height = Math.ceil((bounds.height + margin * 2) * scale);
    canvas.width = source.width = width;
    canvas.height = source.height = height;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    atlas.setTransform(scale, 0, 0, scale, 0, 0);
    dark = colorMode === 'dark';
    glow = touchGlow === 'true';
    boxes = glyphs.map(group => {
      const rect = group.getBoundingClientRect();
      const svg = group.querySelector('svg');
      const style = getComputedStyle(group);
      const x = rect.left - bounds.left + margin;
      const y = rect.top - bounds.top + margin;
      atlas.fillStyle = atlas.strokeStyle = '#fff';
      if (svg) {
        const icon = svg.getBoundingClientRect();
        drawIcon(svg, icon.left - bounds.left + margin, icon.top - bounds.top + margin, icon.width, icon.height);
      }
      atlas.font = `600 ${style.fontSize} ${style.fontFamily}`;
      atlas.textAlign = 'center';
      atlas.textBaseline = 'middle';
      atlas.fillText(group.textContent.trim(), x + rect.width / 2, y + rect.height - parseFloat(style.lineHeight) / 2);
      return {group, x, y, width:rect.width, height:rect.height};
    });
    pixels = atlas.getImageData(0, 0, width, height).data;
    dock.classList.add('optical-scrub');
  }

  function capsule(x,y,w,h) {
    const p = new Path2D();
    p.roundRect(x, y, w, h, Math.min(w,h)/2);
    return p;
  }

  function shape(x,y,w,h) {
    const r=Math.min(w,h)/2;
    return `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
  }

  function cutGlyphs(x,y,w,h,fade) {
    for (const box of boxes) {
      if (!fade || box.x > x+w || box.x+box.width < x || box.y>y+h || box.y+box.height<y) {
        box.group.style.removeProperty('clip-path');
        continue;
      }
      const {width,height}=box;
      box.group.style.clipPath=`path(evenodd, "M-2 -2H${width+2}V${height+2}H-2Z ${shape(x-box.x,y-box.y,w,h)}")`;
    }
  }

  function signal(x,y) {
    const px = Math.round(x*scale), py = Math.round(y*scale);
    if (px<0 || py<0 || px>=source.width || py>=source.height) return 0;
    return pixels[(py*source.width+px)*4+3];
  }

  function draw() {
    pending=0;
    if (!pixels || !geometry) return;
    const {left,width,drift,touch,lift}=geometry;
    const x=margin+left-11+drift*.22, y=margin-1;
    const w=width+22+Math.abs(drift)*.65, h=bounds.height+2;
    const lens=capsule(x,y,w,h);
    const outer=capsule(margin+.7,margin+.7,bounds.width-1.4,bounds.height-1.4);
    ctx.clearRect(0,0,canvas.width/scale,canvas.height/scale);
    ctx.save();
    ctx.clip(lens);
    const tint=ctx.createLinearGradient(x,y,x,y+h);
    tint.addColorStop(0,dark?'#5d7084de':'#f8fff1df');
    tint.addColorStop(1,dark?'#344354db':'#d5e8d6db');
    ctx.globalAlpha=lift*profile.tint;
    ctx.fillStyle=tint;
    ctx.fill(lens);
    if(glow){
      const light=ctx.createRadialGradient(x+w/2,y+h*touch,0,x+w/2,y+h*touch,w*.62);
      light.addColorStop(0,dark?'#dbe9ff24':'#ffffff71');light.addColorStop(1,'#ffffff00');
      ctx.fillStyle=light;ctx.fill(lens);
    }
    ctx.restore();

    // The outer rim is cut away where the lens crosses it. There is no inner ring.
    const outside = new Path2D();
    outside.rect(0,0,canvas.width/scale,canvas.height/scale);
    outside.addPath(lens);
    ctx.save();ctx.clip(outside,'evenodd');
    ctx.strokeStyle=dark?'#a8bacb80':'#eafff5dd';ctx.lineWidth=1.1;ctx.stroke(outer);
    ctx.restore();
    ctx.save();
    const outsideDock = new Path2D();
    outsideDock.rect(0,0,canvas.width/scale,canvas.height/scale);
    outsideDock.addPath(outer);
    ctx.clip(outsideDock,'evenodd');
    ctx.strokeStyle=dark?'#d6e8ff40':'#fafffa7a';ctx.lineWidth=.9;ctx.stroke(lens);
    ctx.restore();

    const dw=Math.ceil(w*scale),dh=Math.ceil(h*scale),r=h/2;
    if (!lensImage || lensWidth!==dw || lensHeight!==dh) {
      lensWidth=dw;lensHeight=dh;lensImage=ctx.createImageData(dw,dh);
      texture.width=dw;texture.height=dh;
    }
    const colors=lensImage.data;
    for(let py=0;py<dh;py++)for(let px=0;px<dw;px++){
      const lx=px/scale,ly=py/scale;
      const dx=lx-clamp(lx,r,w-r),dy=ly-r,len=Math.hypot(dx,dy),edge=r-len;
      const i=(py*dw+px)*4;
      if(edge<.25){colors[i+3]=0;continue;}
      const power=Math.max(0,1-edge/15)**2;
      const nx=len?dx/len:0,ny=len?dy/len:0;
      const refraction=power*profile.refraction, split=power*profile.dispersion;
      const bx=x+lx+nx*refraction,by=y+ly+ny*refraction;
      const red=signal(bx+nx*split,by+ny*split);
      const green=signal(bx,by);
      const blue=signal(bx-nx*split,by-ny*split);
      const opacity=Math.max(red,green,blue);
      if(!opacity){colors[i+3]=0;continue;}
      const colorscale=255/opacity;
      colors[i]=dark?red*colorscale:255-red*.86*colorscale;
      colors[i+1]=dark?green*colorscale:255-green*.67*colorscale;
      colors[i+2]=dark?blue*colorscale:255-blue*.81*colorscale;
      colors[i+3]=opacity;
    }
    // Copy only samples hit by the optics, leaving the glass tint beneath the spaces between letters.
    textureContext.putImageData(lensImage,0,0);
    ctx.drawImage(texture,x,y,dw/scale,dh/scale);
    cutGlyphs(x,y,w,h,lift);
  }

  function move(left,width,drift,touch,lift=1) {
    if(!pixels)return;
    geometry={left,width,drift,touch,lift};
    if(!pending)pending=requestAnimationFrame(draw);
  }
  function end() {
    cancelAnimationFrame(pending);pending=0;pixels=null;
    dock.classList.remove('optical-scrub');
    glyphs.forEach(el=>el.style.removeProperty('clip-path'));
  }
  window.HexuDockLens={start,move,end};
})();
