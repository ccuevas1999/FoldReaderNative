/* Fold Reader v11: text-size control, cleaner bottom toolbar, stronger page bend.
   This layer leaves the known-good Google Docs importer and pagination unchanged. */
(() => {
  'use strict';
  const root = document.getElementById('glassBottom');
  const bottomLibrary = root.querySelector('button[aria-label="Return to library"]');
  bottomLibrary?.remove();
  const small = document.getElementById('fontDown');
  const large = document.getElementById('fontUp');
  if (small && large) {
    small.style.display='none'; large.style.display='none';
    const button = document.createElement('button');
    button.id='textSizeButton';
    button.type='button';
    button.textContent='Text size';
    button.setAttribute('aria-label','Adjust reader text size');
    small.before(button);
    const readScale = () => {
      const s=Number(localStorage.foldTextScale);
      return Number.isFinite(s) && s>0 ? s : 1;
    };
    button.addEventListener('click', () => {
      document.getElementById('read').classList.remove('hideHud');
      modal('<h2>Reader text size</h2>'+
        '<p class="muted">This changes only the reading view. Your original Google Doc stays unchanged.</p>'+
        '<div class="readerSizeControls"><button id="sizeMinus" type="button" aria-label="Smaller text">A−</button>'+
        '<strong id="sizePercent">'+Math.round(readScale()*100)+'%</strong>'+
        '<button id="sizePlus" type="button" aria-label="Larger text">A+</button></div>'+
        '<div class="actions"><button id="sizeClose" type="button">Done</button></div>');
      const update = () => { document.getElementById('sizePercent').textContent = Math.round(readScale()*100)+'%'; };
      document.getElementById('sizeMinus').onclick=()=>{small.click();update();};
      document.getElementById('sizePlus').onclick=()=>{large.click();update();};
      document.getElementById('sizeClose').onclick=hidePanel;
    });
  }
  // Keep the turn animation light while making the free corner visibly rounder.
  const style = document.createElement('style');
  style.textContent = `
    #textSizeButton { min-width:64px; }
    .readerSizeControls { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:22px 0; }
    .readerSizeControls button { font-size:17px; min-width:56px; padding:12px 10px; }
    .readerSizeControls strong { font-size:19px; font-variant-numeric:tabular-nums; }
    #view .turnSheet .leaf { clip-path:var(--curlOutline,none); }
    #view .turnSheet .leaf::before { background:linear-gradient(var(--peelAngle,90deg),transparent 22%,#fff5 60%,#1b121277 85%,#fff9 98%); }
    #view .turnSheet .leaf::after { background:linear-gradient(var(--peelAngle,90deg),#0004,transparent 23%,transparent 58%,#0009 96%,#fff8 100%); }
    @media(max-width:385px) { #textSizeButton { padding:4px 6px; } }
  `;
  document.head.appendChild(style);
  // The turning layer gets a soft corner cut and lift; source pages stay unchanged.
  visual = function(d, progress) {
    const q = Math.max(0, Math.min(1,progress));
    const sheet = document.querySelector('#view .turnSheet');
    if(!sheet) return;
    const bow = Math.pow(Math.sin(Math.PI*q), .85);
    const angle = (d.dir>0 ? -180 : 180)*q;
    const finger = Math.max(0,Math.min(100,d.touchY ?? 73));
    const topCorner=finger<36;
    const tilt=(topCorner?1:-1)*(d.dir>0?1:-1)*5.1*bow;
    const skew=(d.dir>0?-1:1)*3.4*bow;
    const lift=Math.round(15*bow);
    sheet.style.transform='rotateY('+angle+'deg) rotateZ('+tilt+'deg) skewY('+skew+'deg) translateZ('+lift+'px)';
    sheet.style.setProperty('--sheetShade',String(.82*bow));
    sheet.style.setProperty('--peelOpacity',String(Math.min(1,.35+.65*bow)));
    sheet.style.setProperty('--peelAngle',d.dir>0?'90deg':'270deg');
    sheet.style.setProperty('--peelRadius',d.dir>0?
      '0 '+Math.round(95*bow)+'px '+Math.round(165*bow)+'px 0':
      Math.round(95*bow)+'px 0 0 '+Math.round(165*bow)+'px');
    const depth=29*bow,edge=[];
    for(let i=0;i<=24;i++) {
      const y=i*100/24;
      const t=topCorner?(1-y/100):y/100;
      const cut=depth*Math.pow(t,2.45);
      const x=d.dir>0?100-cut:cut;
      edge.push(x.toFixed(2)+'% '+y.toFixed(2)+'%');
    }
    const shape=d.dir>0?
      'polygon(0 0, '+edge.join(', ')+', 0 100%)':
      'polygon(100% 0, '+edge.join(', ')+', 100% 100%)';
    sheet.style.setProperty('--curlOutline',shape);
    sheet.style.filter='drop-shadow('+((d.dir>0?-1:1)*Math.round(6*bow))+'px '+
      Math.round(10*bow)+'px '+Math.round(17*bow+4)+'px #0008)';
  };
})();
