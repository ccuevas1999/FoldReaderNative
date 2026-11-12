/* Fold Reader v15: continuous spine, paper curl, eye comfort, font preservation,
 * endnotes on tap, original page breaks, chapter progress, and liquid glass UI. */
(() => {
  'use strict';
  const $id = id => document.getElementById(id);
  const read = $id('read'), view = $id('view');
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  // 1. Page breaks from the original document survive sanitization. A custom
  // marker survives the standard allowed-style filter without executable HTML.
  const sanitizeOriginal = sanitize;
  sanitize = function(input) {
    if (typeof input !== 'string' || !/page-break-before|break-before/i.test(input))
      return sanitizeOriginal(input);
    const d = new DOMParser().parseFromString(input, 'text/html');
    const list = [...d.body.querySelectorAll('[style]')];
    for (const node of list) {
      const styles = node.getAttribute('style') || '';
      if (!/(?:page-break-before|break-before)\s*:\s*(?:always|page)\b/i.test(styles)) continue;
      let block = node;
      while (block.parentElement && block.parentElement !== d.body) block = block.parentElement;
      const marker = d.createElement('fold-pagebreak');
      if (block.tagName === 'HR') block.replaceWith(marker);
      else block.before(marker);
    }
    return sanitizeOriginal(d.body.innerHTML);
  };

  // Also enforce a new page for numbered chapter headings on cached imports,
  // whose original page-break styles may already have been sanitized away.
  const htmlOfOriginal = htmlOf;
  htmlOf = function(book) {
    const html = htmlOfOriginal(book);
    if (!book?.h || !/<h2[\s>]/i.test(html)) return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    const nodes = [...template.content.children];
    for (const node of nodes) {
      if (node.tagName !== 'H2' || !/^\s*\d{1,3}\s+\S/.test(node.textContent||'')) continue;
      if (node.previousElementSibling?.tagName === 'FOLD-PAGEBREAK') continue;
      node.before(document.createElement('fold-pagebreak'));
    }
    return template.innerHTML;
  };

  // 2. Bottom-right chapter completion belongs to the paper, not the toolbar.
  // Use the existing page-to-heading index calculated by the measured paginator.
  const drawOriginal = draw;
  draw = function(i) {
    drawOriginal(i);
    const visible = [...view.children].filter(el=>el.classList.contains('leaf'));
    const last = visible.at(-1);
    if (!last || !pages.length) return;
    const startPage = i * cols;
    const endPage = Math.min(pages.length - 1, startPage + cols - 1);
    const chapters = titles.filter(t=>/^\s*\d{1,3}\s+\S/.test(t.title||''))
      .slice().sort((a,b)=>a.approx-b.approx);
    if (!chapters.length) return;
    const onSpread = chapters.filter(t=>t.approx>=startPage && t.approx<=endPage);
    const thisChap = [...chapters].reverse().find(t=>t.approx<=endPage) || chapters[0];
    const nextChap = chapters.find(t=>t.approx>thisChap.approx);
    const end = nextChap ? Math.max(thisChap.approx,nextChap.approx-1) : pages.length-1;
    const span = Math.max(1,end-thisChap.approx+1);
    let completed = clamp(Math.round(100*(endPage-thisChap.approx+1)/span),0,100);
    if (onSpread.length>1) completed=100;
    const badge = document.createElement('div');
    badge.className='chapterCompletion';
    badge.textContent='Chapter '+completed+'%';
    badge.setAttribute('aria-label','Chapter '+completed+' percent complete');
    last.append(badge);
  };

  // 3. Notes: remember the original paragraph typography *before* the v14
  // click handler intercepts the link. Note markup retains its bold/italics.
  document.addEventListener('click', event => {
    const link=event.target instanceof Element ? event.target.closest('a[data-foldnote]') : null;
    if (!link || !view.contains(link)) return;
    const paragraph=link.closest('p') || link.closest('.pageBody');
    const styleElement=paragraph?.querySelector('span[style*="font-family"]') || paragraph || link;
    const style=getComputedStyle(styleElement);
    const body=getComputedStyle(link.closest('.pageBody') || link);
    const family=(fontChoice!=='Original' ? chosenFonts[fontChoice] : style.fontFamily) || body.fontFamily;
    document.documentElement.style.setProperty('--noteFont',family);
    document.documentElement.style.setProperty('--noteSize',style.fontSize || body.fontSize);
    document.documentElement.style.setProperty('--noteLine',style.lineHeight==='normal'?'1.55':style.lineHeight);
  },true);

  // 4. Black OLED pages; eye comfort warms only the white sheet in light mode,
  // or the visible text in dark mode. It never changes the Google Docs source.
  let eyeLevel=clamp(Number(localStorage.foldEyeComfort||0)||0,0,100);
  const lerp = (a,b,t)=>Math.round(a+(b-a)*t);
  const rgb=(a,b,t)=>'#'+a.map((v,k)=>lerp(v,b[k],t).toString(16).padStart(2,'0')).join('');
  function refreshEye() {
    const warm=eyeLevel/100;
    const dark=paper==='dark';
    read.style.setProperty('--paper', dark?'#000000':rgb([255,255,255],[242,210,156],warm));
    read.style.setProperty('--ink', dark?rgb([250,250,247],[251,194,120],warm):'#151719');
    read.dataset.eyeWarmth=String(eyeLevel);
    const current=$id('eyeReadout'); if(current)current.textContent=eyeLevel+'%';
    const range=$id('eyeSlider'); if(range)range.value=String(eyeLevel);
  }
  const originalPaperChange=paperChange;
  paperChange=function(mode){originalPaperChange(mode);refreshEye()};
  const bottom=$id('glassBottom')?.querySelector('.secondaryControls');
  if(bottom) {
    const btn=document.createElement('button');
    btn.id='eyeComfortButton';
    btn.type='button';
    btn.textContent='Eye filter';
    btn.setAttribute('aria-label','Adjust blue light reduction');
    btn.onclick=()=>{
      read.classList.remove('hideHud');
      modal('<h2>Eye comfort</h2><p class="muted">Warm only the page in light mode or text in dark mode.</p>'+
        '<label for="eyeSlider">Warmth <strong id="eyeReadout">'+eyeLevel+'%</strong></label>'+
        '<input type="range" id="eyeSlider" min="0" max="100" step="1" value="'+eyeLevel+'" />'+
        '<div class="actions"><button id="eyeReset" type="button">Reset</button><button id="eyeClose" type="button">Done</button></div>');
      $id('eyeSlider').oninput=e=>{eyeLevel=clamp(Number(e.target.value),0,100);localStorage.foldEyeComfort=String(eyeLevel);refreshEye()};
      $id('eyeReset').onclick=()=>{eyeLevel=0;localStorage.foldEyeComfort='0';refreshEye()};
      $id('eyeClose').onclick=hidePanel;
    };
    bottom.append(btn);
  }
  refreshEye();

  // 5. Font choices sorted alphabetically. Original honors per-span source
  // styling; an override changes only family, never weight, italics, or size.
  const chosenFonts={
    'Arial':'Arial, sans-serif',
    'Cambria':'Cambria, Georgia, serif',
    'EB Garamond':'"EB Garamond", Georgia, serif',
    'Times New Roman':'"Times New Roman", Times, serif'
  };
  let fontChoice=localStorage.foldFontChoice||'Original';
  function applyFont() {
    read.dataset.fontChoice=fontChoice==='Original'?'original':'custom';
    if(fontChoice==='Original')read.style.removeProperty('--selectedReaderFont');
    else read.style.setProperty('--selectedReaderFont',chosenFonts[fontChoice]||chosenFonts.Arial);
  }
  applyFont();
  // Native Page settings can reuse the existing validated EPUB/Docs font handling.
  window.foldSetFontChoice=function(next,silent=false){
    if(next!=='Original' && !(next in chosenFonts))return;
    fontChoice=next;
    localStorage.foldFontChoice=fontChoice;
    applyFont();
    if(bookId>=0&&!silent)scheduleReflow();
  };
  window.foldSetEyeComfort=function(value){
    eyeLevel=clamp(Number(value)||0,0,100);
    localStorage.foldEyeComfort=String(eyeLevel);
    refreshEye();
  };
  if(bottom) {
    const fontButton=document.createElement('button');fontButton.id='readerFontButton';
    fontButton.type='button';fontButton.textContent='Font';
    fontButton.onclick=()=>{
      const opts=['Original','Arial','Cambria','EB Garamond','Times New Roman'];
      modal('<h2>Reader font</h2><p class="muted">Original preserves available Google Docs fonts. Your document is never edited.</p>'+
        '<label for="fontChoiceSelect">Font family</label><select id="fontChoiceSelect">'+
        opts.map(name=>'<option value="'+name+'">'+name+'</option>').join('')+'</select>'+
        '<div class="actions"><button id="fontChoiceDone" type="button">Done</button></div>');
      const choice=$id('fontChoiceSelect');choice.value=fontChoice;
      choice.onchange=()=>{fontChoice=choice.value;localStorage.foldFontChoice=fontChoice;applyFont();if(bookId>=0)scheduleReflow()};
      $id('fontChoiceDone').onclick=hidePanel;
    };
    const paperBtn=[...bottom.querySelectorAll('button')].find(b=>b.textContent.trim()==='Paper');
    if(paperBtn) bottom.insertBefore(fontButton,paperBtn);
    else bottom.append(fontButton);
  }

  // 6. A spine strip remains attached in both directions while only the free
  // edge gets a curved clipping outline. No skew/rotation at the hinge.
  const oldVisual=visual;
  visual=function(d,progress){
    oldVisual(d,progress);
    const sheet=view.querySelector('.turnSheet');if(!sheet)return;
    const q=clamp(Number(progress)||0,0,1),forward=d.dir>0;
    const bend=Math.max(0,Math.sin(Math.PI*Math.pow(q,1.8)));
    const round=Math.pow(bend,.64);
    const atTop=(d.touchY??60)<47;
    sheet.style.transformOrigin=forward?'left center':'right center';
    sheet.style.transform='rotateY('+(forward?-180:180)*q+'deg)';
    sheet.style.transformStyle='preserve-3d';sheet.style.filter='none';
    const points=[];
    for(let i=0;i<=48;i++){
      const y=100*i/48;
      const free=atTop?1-y/100:y/100;
      const cut=42*round*Math.pow(free,2.25);
      const x=forward?100-cut:cut;
      points.push(x.toFixed(2)+'% '+y.toFixed(2)+'%');
    }
    sheet.style.setProperty('--curlOutline',forward?
      'polygon(0 0,'+points.join(',')+',0 100%)':
      'polygon(100% 0,'+points.join(',')+',100% 100%)');
    const radius=Math.round(175*round);
    sheet.style.setProperty('--peelRadius',forward?'0 '+radius+'px '+radius+'px 0':radius+'px 0 0 '+radius+'px');
    sheet.style.setProperty('--peelOpacity',String(.3+.66*round));
    sheet.style.setProperty('--sheetShade',String(.85*round));
    sheet.style.setProperty('--peelAngle',forward?'90deg':'270deg');
    sheet.style.setProperty('--curlFactor',String(round));
  };

  // Force Curl permanently. Selector was removed in v13, but older books may
  // still have a legacy Instant preference saved in localStorage.
  anim='Curl';localStorage.foldFx='Curl';
})();
