/* Fold Reader v12: correctly oriented next-page backside and fold-safe margins. */
(() => {
 'use strict';
 const priorVisual=visual;
 visual=function(d,p){
  priorVisual(d,p);
  const sheet=document.querySelector('#view .turnSheet');
  if(!sheet)return;
  sheet.style.filter='none';
  sheet.style.transformStyle='preserve-3d';
  sheet.style.webkitTransformStyle='preserve-3d';
  const a=sheet.querySelector('.frontLeaf'),b=sheet.querySelector('.backLeaf');
  if(a){a.style.backfaceVisibility='hidden';a.style.webkitBackfaceVisibility='hidden';}
  if(b){b.style.backfaceVisibility='hidden';b.style.webkitBackfaceVisibility='hidden';b.style.transform='rotateY(180deg) translateZ(1.5px)';}
 };
 const read=document.getElementById('read');
 const view=document.getElementById('view');
 const top=document.getElementById('glassTop');
 const bottom=document.getElementById('glassBottom');
 function clearance(){
  if(!read||!view||read.style.display==='none')return;
  const v=view.getBoundingClientRect(),t=top.getBoundingClientRect(),b=bottom.getBoundingClientRect();
  read.style.setProperty('--pageSafeTop',Math.max(58,Math.ceil(t.bottom-v.top+14))+'px');
  read.style.setProperty('--pageSafeBottom',Math.max(84,Math.ceil(v.bottom-b.top+16))+'px');
 }
 const priorPaginate=paginate;
 paginate=async function(...args){clearance();return priorPaginate(...args)};
 const priorFold=window.foldViewportChanged;
 window.foldViewportChanged=function(...args){clearance();return priorFold?.(...args)};
 window.addEventListener('resize',clearance,{passive:true});
 clearance();
})();
