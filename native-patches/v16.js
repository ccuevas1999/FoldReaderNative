/* Fold Reader v16: fixed binding, outer-edge curl, unified Page settings, local books. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id),read=el('read'),view=el('view');
 const active=()=>books[bookId];
 const localId=b=>/^local:(pdf|epub):([a-f0-9]{32})$/.exec(b?.u||'');
 const oldModal=modal;
 modal=function(html){return oldModal(html.replace(/<h2>Footnote\s+(\d+)<\/h2>/g,'<h2>$1</h2>'))};
 const oldDraw=draw;
 draw=function(i){oldDraw(i);view.querySelectorAll('.chapterCompletion').forEach(n=>{
  n.textContent=n.textContent.replace(/^Chapter\s*/i,'');n.setAttribute('aria-label',n.textContent+' of chapter completed');
 })};

 // Keep Google Docs / EPUB styling: preserve class-level italics and inline emphasis.
 const oldSanitize=sanitize;
 sanitize=function(raw){
  if(typeof raw!=='string')return oldSanitize(raw);
  if(!/font-style|<em\b|<i\b|<style\b/i.test(raw))return oldSanitize(raw);
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const css=[...doc.querySelectorAll('style')].map(e=>e.textContent).join('\n');
  const rules=new Map();
  for(const rule of css.matchAll(/\.([\w-]+)\s*\{([^{}]{0,2000})\}/g)){
   const declarations=[];
   for(const decl of rule[2].split(';')){
    const i=decl.indexOf(':');if(i<0)continue;
    const key=decl.slice(0,i).trim().toLowerCase(),value=decl.slice(i+1).trim();
    if(/^(font-style|font-weight|font-family|font-size|text-decoration|vertical-align)$/.test(key)&&!/[<>]|url\s*\(/i.test(value))
     declarations.push(key+':'+value);
   }
   if(declarations.length)rules.set(rule[1],declarations.join(';'));
  }
  if(rules.size)doc.body.querySelectorAll('[class]').forEach(node=>{
   const styles=[...node.classList].filter(c=>rules.has(c)).map(c=>rules.get(c));
   if(styles.length)node.setAttribute('style',styles.join(';')+';'+(node.getAttribute('style')||''));
  });
  doc.body.querySelectorAll('em,i').forEach(node=>{
    node.style.setProperty('font-style','italic');
    node.querySelectorAll('*').forEach(child=>child.style.setProperty('font-style','italic'));
  });
  doc.body.querySelectorAll('section').forEach(s=>s.replaceWith(...[...s.childNodes]));
  return oldSanitize(doc.body.innerHTML);
 };

 // The first chapter heading should not leave an empty opening page.
 const oldHtmlOf=htmlOf;
 htmlOf=function(book){
  const html=oldHtmlOf(book);
  if(!html.includes('fold-pagebreak'))return html;
  const t=document.createElement('template');t.innerHTML=html;
  const firstHeading=[...t.content.children].find(n=>/^H[123]$/.test(n.tagName)&&/^\s*\d{1,3}\s+\S/.test(n.textContent||''));
  if(firstHeading?.previousElementSibling?.tagName==='FOLD-PAGEBREAK')firstHeading.previousElementSibling.remove();
  while(t.content.firstElementChild?.tagName==='FOLD-PAGEBREAK')t.content.firstElementChild.remove();
  return t.innerHTML;
 };

 // Keep PDF's original fixed pages; EPUB and Google Docs use text pagination.
 const oldPaginate=paginate;
 paginate=async function(){
  const b=active(),local=localId(b);
  if(!local||local[1]!=='pdf'){read.dataset.bookType=local?.[1]||'doc';return oldPaginate()}
  read.dataset.bookType='pdf';
  cols=view.clientWidth>view.clientHeight && view.clientWidth>650?2:1;
  document.body.classList.toggle('portrait',cols===1);
  const t=document.createElement('template');t.innerHTML=b.h||'';
  const images=[...t.content.querySelectorAll('img[src*="/pdf/"]')];
  if(!images.length)return false;
  pages=images.map(img=>'<div class="pdfPage"><img class="pdfImage" alt="'+
    (img.getAttribute('alt')||'PDF page')+'" src="'+img.getAttribute('src')+'"></div>');
  titles=[];buildContents();el('measure').replaceChildren();return true;
 };

 // The center stays perfectly straight; only the free outside corner bends.
 visual=function(d,progress){
  const sheet=view.querySelector('.turnSheet');if(!sheet)return;
  const q=Math.max(0,Math.min(1,Number(progress)||0)),forward=d.dir>0;
  const bow=Math.pow(Math.sin(Math.PI*q),.72)*(.65+.38*q);
  const depth=48*bow,top=(d.touchY??50)<44,points=[];
  for(let i=0;i<=64;i++){
   const y=i*100/64,t=top?1-y/100:y/100;
   points.push((forward?100-depth*Math.pow(t,2.4):depth*Math.pow(t,2.4)).toFixed(2)+'% '+y.toFixed(2)+'%');
  }
  sheet.style.transformOrigin=forward?'left center':'right center';
  sheet.style.transform='rotateY('+((forward?-180:180)*q)+'deg)';
  sheet.style.transformStyle='preserve-3d';sheet.style.filter='none';
  sheet.style.setProperty('--curlOutline',forward?'polygon(0 0,'+points.join(',')+',0 100%)':
    'polygon(100% 0,'+points.join(',')+',100% 100%)');
  sheet.style.setProperty('--peelRadius',forward?'0 '+Math.round(bow*190)+'px '+Math.round(bow*250)+'px 0':
    Math.round(bow*190)+'px 0 0 '+Math.round(bow*250)+'px');
  sheet.style.setProperty('--sheetShade',String(.83*bow));
  sheet.style.setProperty('--peelOpacity',String(.25+.74*bow));
  sheet.style.setProperty('--peelAngle',forward?'90deg':'270deg');
  if(q>=.5&&!d._soundFired&&sound){d._soundFired=true;rustle()}
 };

 // One Page button contains all former reader appearance controls.
 const bottom=el('glassBottom').querySelector('.secondaryControls');
 const oldSize=el('textSizeButton'),oldFont=el('readerFontButton'),oldEye=el('eyeComfortButton');
 const oldPaper=[...bottom.querySelectorAll('button')].find(b=>b.textContent.trim()==='Paper');
 for(const b of [oldSize,oldFont,oldEye,oldPaper])if(b)b.style.display='none';
 const page=document.createElement('button');page.id='pageSettingsButton';page.textContent='Page';
 bottom.insertBefore(page,el('sndBtn'));
 const fonts=['Original','Arial','Cambria','EB Garamond','Times New Roman'];
 function openPageSettings(){
  const scale=Math.round((Number(localStorage.foldTextScale)||1)*100),level=Number(localStorage.foldEyeComfort)||0;
  modal('<h2>Page settings</h2><div class="pageSettingsInner">'+
    '<label>Paper color</label><div class="actions"><button id="pageLight">Light</button><button id="pageDark">Dark</button></div>'+
    '<label>Text size <strong id="pageSizePct">'+scale+'%</strong></label><div class="readerSizeControls"><button id="pageMinus">A−</button><button id="pagePlus">A+</button></div>'+
    '<label for="pageFont">Font family</label><select id="pageFont">'+fonts.map(f=>'<option>'+f+'</option>').join('')+'</select>'+
    '<label for="pageEye">Blue-light filter <strong id="pageEyePct">'+level+'%</strong></label><input type="range" id="pageEye" min="0" max="100" step="1" value="'+level+'">'+
    '<div class="actions"><button id="pageDone">Done</button></div></div>');
  el('pageFont').value=localStorage.foldFontChoice||'Original';
  el('pageLight').onclick=()=>paperChange('white');
  el('pageDark').onclick=()=>paperChange('dark');
  el('pageMinus').onclick=()=>{el('fontDown')?.click();el('pageSizePct').textContent=Math.round((Number(localStorage.foldTextScale)||1)*100)+'%'};
  el('pagePlus').onclick=()=>{el('fontUp')?.click();el('pageSizePct').textContent=Math.round((Number(localStorage.foldTextScale)||1)*100)+'%'};
  el('pageFont').onchange=e=>{window.foldSetFontChoice?.(e.target.value)};
  el('pageEye').oninput=e=>{window.foldSetEyeComfort?.(Number(e.target.value));el('pageEyePct').textContent=e.target.value+'%'};
  el('pageDone').onclick=hidePanel;
 }
 page.onclick=openPageSettings;

 const add=document.querySelector('header button[onclick*="showAdd"]');if(add)add.textContent='+ Add';
 const tip=el('tip');if(tip)tip.textContent='Add a Google Doc, PDF, or EPUB to your library.';
 showAdd=function(){
  modal('<h2>Add book</h2><label for="newUrl">Google Docs link</label>'+
    '<input id="newUrl" type="url" autocapitalize="off" autocomplete="url" placeholder="https://docs.google.com/document/d/...">'+
    '<label for="newTitle">Book title (optional)</label><input id="newTitle" placeholder="Google Doc">'+
    '<div class="actions"><button id="addDocsLink">Add link</button><button id="addLocalFile">Choose PDF / EPUB</button></div>'+
    '<div class="actions"><button id="addCancel">Cancel</button></div>');
  el('addDocsLink').onclick=addDoc;el('addCancel').onclick=hidePanel;
  el('addLocalFile').onclick=()=>{
   if(window.FoldBridge&&typeof FoldBridge.chooseBookFile==='function'){hidePanel();FoldBridge.chooseBookFile()}
   else alert('Local files require the installed Android app.');
  };
 };
 const previousOpenBook=openBook;
 async function loadLocalBook(index,open){
  const book=books[index],details=localId(book);if(!details)return;
  try{
   const response=await fetch('/docs/'+details[2]+'.html',{cache:'force-cache'});
   if(!response.ok)throw Error('File not found on this device');
   const raw=await response.text(),html=details[1]==='pdf'?raw:sanitize(raw);
   if(!books[index])return;
   books[index].h=html;
   if(open)previousOpenBook(index);
  }catch(error){modal('<h2>Unable to read book</h2><p>'+String(error.message||'Import failed').replace(/[<>]/g,'')+
   '</p><div class="actions"><button onclick="hidePanel()">Close</button></div>')}
 }
 openBook=function(index){
  if(localId(books[index])&&!books[index].h){void loadLocalBook(index,true);return}
  return previousOpenBook(index);
 };
 window.foldLocalImported=function(info){
  if(!info||!/^[a-f0-9]{32}$/.test(info.id)||!['pdf','epub'].includes(info.type))return;
  const u='local:'+info.type+':'+info.id;let index=books.findIndex(b=>b.u===u);
  if(index<0){index=books.length;books.push({t:info.title||'Imported book',u,c:'',h:'',cover:books.length%6,img:'',pos:0})}
  save();shelf();void loadLocalBook(index,false);
 };
 window.foldLocalImportFailed=function(message){
  modal('<h2>Import failed</h2><p>'+String(message||'Unable to import file').replace(/[<>]/g,'')+
    '</p><div class="actions"><button onclick="hidePanel()">Close</button></div>');
 };
})();