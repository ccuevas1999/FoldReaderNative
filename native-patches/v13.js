/* Fold Reader v13: simplified controls, custom covers, stronger curl and soft mid-turn sound. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const fx=el('animation');
  anim='Curl';
  localStorage.foldFx='Curl';
  if(fx){fx.value='Curl';fx.style.display='none';fx.tabIndex=-1;fx.setAttribute('aria-hidden','true')}
  const beforeShelf=shelf;
  shelf=function(...args){
    const result=beforeShelf(...args);
    [...el('shelf').children].forEach((bookEl,i)=>{
      bookEl.classList.toggle('hasCustomImage',Boolean(books[i]?.img));
      const cover=bookEl.querySelector('.cover');
      if(cover)cover.setAttribute('aria-label',books[i]?.t||'Open book');
    });
    return result;
  };
  shelf();

  // The old page-turn animation played at completion. Avoid a duplicate after midpoint.
  const oldRustle=rustle;
  let lastSound=-1e6;
  rustle=function(){
    const now=performance.now();
    if(now-lastSound<450)return;
    lastSound=now;
    oldRustle();
  };

  const previousVisual=visual;
  visual=function(d,progress){
    previousVisual(d,progress);
    const sheet=el('view').querySelector('.turnSheet');
    if(!sheet)return;
    const p=Math.max(0,Math.min(1,progress));
    const bend=Math.pow(Math.sin(Math.PI*p),.68);
    const clockwise=d.dir>0;
    const touch=Math.max(0,Math.min(100,d.touchY??60));
    const topCurl=touch<38;
    const tilt=(topCurl?1:-1)*(clockwise?1:-1)*8.8*bend;
    const skew=(clockwise?-1:1)*7.2*bend;
    const lift=23*bend;
    sheet.style.transform=`rotateY(${(clockwise?-180:180)*p}deg) rotateZ(${tilt}deg) skewY(${skew}deg) translateZ(${lift}px)`;
    sheet.style.setProperty('--sheetShade',String(.87*bend));
    sheet.style.setProperty('--peelOpacity',String(.26+.74*bend));
    sheet.style.setProperty('--peelAngle',clockwise?'90deg':'270deg');
    const rounding=Math.round(180*bend),corner=Math.round(260*bend);
    sheet.style.setProperty('--peelRadius',clockwise?
      `0 ${rounding}px ${corner}px 0`:`${rounding}px 0 0 ${corner}px`);
    const depth=46*bend,points=[];
    for(let k=0;k<=40;k++){
      const y=k*2.5;
      const pos=topCurl?1-y/100:y/100;
      const curve=depth*Math.pow(pos,2.75);
      const x=clockwise?100-curve:curve;
      points.push(x.toFixed(2)+'% '+y.toFixed(2)+'%');
    }
    const clip=clockwise?
      'polygon(0 0,'+points.join(',')+',0 100%)':
      'polygon(100% 0,'+points.join(',')+',100% 100%)';
    sheet.style.setProperty('--curlOutline',clip);
    if(p>=.50 && !d._soundFired && sound){d._soundFired=true;rustle()}
  };
})();
