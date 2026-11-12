/* Fold Reader v17: uniform reflow fonts, individual-book settings, safe chapter breaks,
   corrected turning back face, and locally embedded book covers. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const read = $('read'), view = $('view');
  const activeBook = () => bookId >= 0 ? books[bookId] : null;
  const prefKey = book => 'foldSettings:' + encodeURIComponent(book.u || book.t || 'sample');
  const snapshot = () => ({
    scale: Number(localStorage.foldTextScale) || 1,
    font: localStorage.foldFontChoice || 'Original',
    eye: Number(localStorage.foldEyeComfort) || 0,
    paper: localStorage.foldPaper || 'white'
  });
  const baseline = snapshot();
  function preferences(book) {
    if (!book) return baseline;
    try { const stored = JSON.parse(localStorage.getItem(prefKey(book)) || 'null');
      return stored && typeof stored==='object' ? {...baseline,...stored} : {...baseline};
    } catch (_) { return {...baseline}; }
  }
  function persist() {
    const book = activeBook();
    if (book) localStorage.setItem(prefKey(book), JSON.stringify(snapshot()));
  }
  let restoring = false;
  function restoreFor(book) {
    if (!book) return;
    restoring = true;
    try {
      const p = preferences(book);
      window.foldSetReaderScale?.(p.scale, true);
      window.foldSetFontChoice?.(p.font, true);
      window.foldSetEyeComfort?.(p.eye);
      paperChange(p.paper);
      read.dataset.bookType = /^local:pdf:/.test(book.u || '') ? 'pdf' :
        /^local:epub:/.test(book.u || '') ? 'epub' : 'doc';
    } finally { restoring = false; }
  }
  const previousEnter = enter;
  enter = function(...args) {
    restoreFor(activeBook());
    return previousEnter.apply(this,args);
  };
  for (const name of ['fontDown','fontUp']) {
    $(name)?.addEventListener('click', () => { if(!restoring) persist(); });
  }
  const previousPaperChange = paperChange;
  paperChange = function(...args) { const out=previousPaperChange.apply(this,args); if(!restoring)persist(); return out; };
  const oldChooseFont=window.foldSetFontChoice;
  window.foldSetFontChoice = function(v,silent=false) {
    oldChooseFont?.(v,silent); if(!restoring)persist();
  };
  const oldEye=window.foldSetEyeComfort;
  window.foldSetEyeComfort = function(v) { oldEye?.(v); if(!restoring)persist(); };

  // Mixed Google Docs inline type sizes created wildly different text sizes.
  // Respect rich emphasis/weight/family while standardizing BODY text size.
  const previousHtmlOf = htmlOf;
  htmlOf = function(book) {
    if (!book || /^local:pdf:/.test(book.u||'')) return previousHtmlOf(book);
    const html = previousHtmlOf(book);
    const template = document.createElement('template'); template.innerHTML=html;
    for (const node of template.content.querySelectorAll('[style]')) {
      // Do not clear bold/italic/font-family, only sizes and line-height.
      node.style.removeProperty('font-size');
      node.style.removeProperty('line-height');
      if (node.style.getPropertyValue('font')) node.style.removeProperty('font');
      if (!node.style.length) node.removeAttribute('style');
    }
    // Keep explicit strong/bold source styling. Google Docs often encodes it as spans.
    for (const node of template.content.querySelectorAll('strong,b')) {
      node.style.setProperty('font-weight','700');
    }
    // Remove duplicate page-break markers and any leading marker/empty block.
    let firstContent = false, previousBreak = false;
    for (const node of [...template.content.children]) {
      const breaker = node.tagName === 'FOLD-PAGEBREAK';
      const content = !!(node.textContent||'').replace(/\u00a0/g,' ').trim() ||
        !!node.querySelector?.('img,svg,video,table');
      if (breaker) {
        if (!firstContent || previousBreak) node.remove();
        else previousBreak = true;
      } else if (content) {firstContent=true;previousBreak=false;}
      else if (previousBreak && !content && !node.querySelector?.('hr')) node.remove();
    }
    return template.innerHTML;
  };

  // Mark PDF documents as zoomable fixed pages, not reflowable typeface replacements.
  function refreshPdfZoom() {
    read.style.setProperty('--pdfZoom',String(Number(localStorage.foldTextScale)||1));
  }
  refreshPdfZoom();
  for (const id of ['fontDown','fontUp']) $(id)?.addEventListener('click',refreshPdfZoom);
  const previousSizeSetter=window.foldSetReaderScale;
  window.foldSetReaderScale=function(value,silent=false) {
    previousSizeSetter?.(value,silent); refreshPdfZoom(); if(!restoring)persist();
  };

  const previousModal = modal;
  modal = function(html) {
    const book = activeBook();
    const isPdf = /^local:pdf:/.test(book?.u||'');
    if (/Page settings/.test(html) && isPdf) {
      html = html.replace('Text size <strong','PDF zoom <strong');
      html = html.replace(/<label for="pageFont">Font family<\/label>/,
        '<label for="pageFont">Font family (fixed in PDF)</label>');
    }
    const result=previousModal(html);
    if (/Page settings/.test(html)) {
      const size=$('pageSizePct'), font=$('pageFont');
      if(font && isPdf) {font.disabled=true;font.title='PDF fonts are embedded. Use PDF zoom to enlarge the original page.';}
      // The eye-comfort slider sits between paper mode and font choice.
      const eye=$('pageEye'),fontLabel=document.querySelector('label[for="pageFont"]'),
        eyeLabel=document.querySelector('label[for="pageEye"]');
      if(eye && fontLabel && eyeLabel) {fontLabel.before(eyeLabel,eye);}
    }
    return result;
  };

  // Imported PDFs use their first page, EPUBs their embedded cover artwork.
  const previousLocalImported=window.foldLocalImported;
  window.foldLocalImported=function(info) {
    previousLocalImported?.(info);
    if(!info || !info.cover) return;
    const book=books.find(b=>b.u==='local:'+info.type+':'+info.id);
    if(book && !book.img) {book.img=info.cover;save();shelf();}
  };

  // The turning back and front must clip their respective OUTSIDE edges.
  // The inner edge remains an unmodified straight line throughout the turn.
  const priorVisual=visual;
  visual=function(d,progress) {
    priorVisual(d,progress);
    const sheet=view.querySelector('.turnSheet'); if(!sheet)return;
    const q=Math.max(0,Math.min(1,Number(progress)||0));
    const bend=Math.pow(Math.sin(Math.PI*q),.72);
    const forward=d.dir>0,top=(d.touchY??55)<48;
    const cut=34*bend;
    const points=[];
    for(let i=0;i<=48;i++){
      const y=i*100/48;
      const t=top?(1-y/100):(y/100);
      const depth=cut*t*t*(.8+.2*q);
      points.push([depth,y]);
    }
    function poly(outsideRight) {
      const list=points.map(([depth,y])=>(outsideRight?100-depth:depth).toFixed(2)+'% '+y.toFixed(2)+'%');
      return outsideRight?'polygon(0 0,'+list.join(',')+',0 100%)':
        'polygon(100% 0,'+list.join(',')+',100% 100%)';
    }
    sheet.style.transformOrigin=forward?'left center':'right center';
    sheet.style.transform='rotateY('+((forward?-180:180)*q)+'deg)';
    sheet.style.setProperty('--curlFront',poly(forward));
    sheet.style.setProperty('--curlBack',poly(!forward));
    sheet.style.setProperty('--curlOutline','none');
    sheet.style.setProperty('--sheetShade',String(.75*bend));
    sheet.style.filter='none';
    // Explicitly hide the page facing away at each half turn.
    const front=sheet.querySelector('.frontLeaf'),back=sheet.querySelector('.backLeaf');
    if(front){front.style.backfaceVisibility='hidden'; front.style.webkitBackfaceVisibility='hidden';}
    if(back){back.style.backfaceVisibility='hidden';back.style.webkitBackfaceVisibility='hidden';}
  };

  // Keep the close button and popup compact, including footnote panels.
  const previousOpenNote=window.foldOpenFootnote;
  if(previousOpenNote) window.foldOpenFootnote=function(...args){return previousOpenNote(...args)};
})();