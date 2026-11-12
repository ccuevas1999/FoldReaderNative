/* Fold Reader v20: responsive EPUB pagination, reader themes, muted moss slider,
   held-slider color wheel, bookshelf themes, and sound in Page settings. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const read = el('read');
  const storage = window.localStorage;
  const isEpub = () => /^local:epub:/.test(books[bookId]?.u || '');

  // EPUB used the measurement-heavy Docs paginator for the entire novel. A
  // paragraph with hundreds of words could be repeatedly cloned and measured.
  // Pre-split its semantic blocks once and estimate stable full-height pages.
  // Yield between batches so WebView stays responsive even on large books.
  // Keep source image markup in the HTML reader, splitting image-only blocks
  // from text so images do not disappear during text-only page splitting.
  const imageHtmlOf = htmlOf;
  htmlOf = function(book) {
    const markup = imageHtmlOf(book);
    if (!/\<img\b/i.test(markup) || /^local:pdf:/.test(book?.u || '')) return markup;
    const tmp = document.createElement('template');tmp.innerHTML=markup;
    tmp.content.querySelectorAll('img').forEach(img => {
      img.setAttribute('loading','eager');
      const parent=img.closest('p');
      if (parent && parent.textContent.trim() && parent.parentNode) {
        const holder=document.createElement('p');
        holder.className='foldReaderImageBlock';
        holder.style.textAlign=parent.style.textAlign || 'center';
        parent.after(holder);holder.append(img);
      } else if (parent) parent.classList.add('foldReaderImageBlock');
    });
    return tmp.innerHTML;
  };
  const slowerPaginator = paginate;
  let epubGeneration = 0;
  paginate = async function() {
    const generation = ++epubGeneration;
    if (!isEpub()) return slowerPaginator();
    read.dataset.bookType = 'epub';
    const r = el('view');
    const dual = innerWidth > innerHeight && innerWidth > 650;
    cols = dual ? 2 : 1;
    document.body.classList.toggle('portrait', !dual);
    const width = r.clientWidth / cols, height = r.clientHeight;
    const scale = Number(storage.foldTextScale) || 1;
    const px = 19 * scale;
    const bodyWidth = width * (1 - (dual ? .146 : .18));
    const lines = Math.max(8, (height - (dual ? 175 : 190)) / (px * 1.53));
    const charsPerLine = Math.max(13, bodyWidth / (px * .52));
    const pageBudget = Math.max(200, Math.floor(lines * charsPerLine * .79));
    const source = document.createElement('div');
    source.innerHTML = htmlOf(books[bookId]);
    const contents = [];
    const unwrap = node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'FOLD-PAGEBREAK') { contents.push(node); return; }
      if (/^(SECTION|ARTICLE|MAIN|DIV)$/.test(node.tagName) &&
          [...node.children].some(x => /^(P|DIV|H[1-6]|SECTION|ARTICLE|MAIN|UL|OL|BLOCKQUOTE|IMG|TABLE|FOLD-PAGEBREAK)$/.test(x.tagName))) {
        for (const child of [...node.children]) unwrap(child);
      } else contents.push(node);
    };
    for (const node of [...source.children]) unwrap(node);
    let linesUsed = 0, chunk = [], output = [], headings = [];
    function flush() {
      if (chunk.length) { output.push(chunk.join('')); chunk=[]; linesUsed=0; }
    }
    const isImage = node => node.tagName === 'IMG' || !!node.querySelector?.('img');
    function append(html, cost) {
      if (linesUsed && linesUsed + cost > pageBudget) flush();
      chunk.push(html);
      linesUsed += cost;
    }
    let done = 0;
    for (const block of contents) {
      if (generation !== epubGeneration || bookId < 0 || !isEpub()) return false;
      if (block.tagName === 'FOLD-PAGEBREAK') {flush();continue;}
      const text = block.textContent || '';
      const heading = /^H[1-6]$/.test(block.tagName);
      if (heading) headings.push({title:text.trim(),approx:output.length});
      if (isImage(block)) {
        if (linesUsed > 0) flush();
        // Page-sized artwork is handled by CSS object-fit, not text splitting.
        chunk.push(block.outerHTML);
        flush();
        continue;
      }
      if (!text.trim()) continue;
      const margin = heading ? charsPerLine * 2 : Math.min(charsPerLine * .8,30);
      // A single block must not overflow multiple sheets. segment() preserves
      // nested italics, bold spans and original EPUB font families.
      if (text.length < pageBudget - margin && (!linesUsed || linesUsed + text.length + margin <= pageBudget)) {
        append(block.outerHTML, Math.ceil(text.length + margin));
      } else {
        let offset = 0, first = true;
        while (offset < text.length) {
          const remaining = Math.floor(pageBudget - linesUsed - margin);
          if (linesUsed > 0 && remaining < 100) flush();
          const room = Math.max(120,Math.floor(pageBudget - linesUsed - margin));
          let end = Math.min(text.length, offset + room);
          if (end < text.length) {
            let cut=end;
            while(cut>offset+Math.max(50,room*.6) && !/\s/.test(text[cut])) cut--;
            if (cut>offset+40) end=cut;
          }
          if (end<=offset) end=Math.min(text.length,offset+120);
          const part=segment(block,offset,end);
          if (!part) break;
          if (!first) {
            part.style.marginTop='0';part.style.marginBottom='0';
            part.setAttribute('data-epub-continuation','true');
          }
          append(part.outerHTML, end-offset+(first?margin:0));
          offset=end;
          // Keep leading spaces if they occur inside styled content.
          first=false;
          if(offset<text.length)flush();
        }
      }
      if (++done % 45 === 0) {
        statusText('Formatting EPUB… '+Math.max(1,output.length)+' pages');
        await new Promise(requestAnimationFrame);
      }
    }
    flush();
    if (generation !== epubGeneration || !isEpub()) return false;
    pages = output.length ? output : ['<p>Book is empty.</p>'];
    titles = headings;
    buildContents();
    el('measure').replaceChildren();
    statusText('');
    return true;
  };

  // Theme choice changes the chrome only. Individual book paper preferences stay.
  let uiLight = storage.foldUiTheme === 'light';
  function applyUiTheme() {
    document.body.classList.toggle('foldUiLight', uiLight);
    if (themeButton) {
      themeButton.textContent=uiLight?'☾':'☀';
      themeButton.setAttribute('aria-label',uiLight?'Switch to dark interface':'Switch to light interface');
      themeButton.title=uiLight?'Dark interface':'Light interface';
    }
  }
  const bottom = el('glassBottom');
  const primary = bottom?.querySelector('.primaryControls');
  const secondary = bottom?.querySelector('.secondaryControls');
  const soundButton = el('sndBtn');
  if (soundButton && secondary) {secondary.append(soundButton);soundButton.style.display='none';}
  const themeButton = document.createElement('button');
  themeButton.id='foldUiThemeToggle';themeButton.type='button';
  if(primary)primary.append(themeButton);
  themeButton.onclick=()=>{uiLight=!uiLight;storage.foldUiTheme=uiLight?'light':'dark';applyUiTheme();};
  applyUiTheme();

  // Put the on/off sound control in the existing Page settings panel.
  const previousModal = modal;
  modal=function(html) {
    const pageModal = /<h2>Page settings<\/h2>/.test(String(html));
    if (pageModal) html=html.replace('<div class="actions"><button id="pageDone">Done</button>',
      '<label for="pageSoundControl">Page turn sound</label>'+
      '<button type="button" id="pageSoundControl" class="foldPageSound">'+(sound?'On':'Off')+'</button>'+
      '<div class="actions"><button id="pageDone">Done</button>');
    const result=previousModal.apply(this,[html]);
    if(pageModal) {
      const control=el('pageSoundControl');
      if(control)control.onclick=()=>{toggleSound();control.textContent=sound?'On':'Off';};
    }
    return result;
  };

  // Pale moss by default; holding the progress slider without moving for 3s
  // opens a touch-friendly hue wheel and an optional native color chooser.
  let tint=storage.foldSliderAccent || '#aabda5';
  if(!/^#[0-9a-fA-F]{6}$/.test(tint))tint='#aabda5';
  function colorize(value) {
    if(!/^#[0-9a-fA-F]{6}$/.test(value))return;
    tint=value;storage.foldSliderAccent=value;
    document.documentElement.style.setProperty('--foldMoss',value);
    document.documentElement.style.setProperty('--foldMossDim',value);
    el('progress')?.style.setProperty('accent-color',value,'important');
  }
  colorize(tint);
  function hslHex(h,s=.52,l=.66) {
    const a=s*Math.min(l,1-l);
    const f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};
    return '#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
  }
  function openColorWheel() {
    modal('<h2>Progress slider color</h2><p class="muted">Select a color or use the color picker.</p>'+
      '<div id="foldHueWheel" role="slider" tabindex="0" aria-label="Color wheel" aria-valuemin="0" aria-valuemax="359" aria-valuenow="110"></div>'+
      '<label for="foldCustomColor">Exact color</label><input type="color" id="foldCustomColor" value="'+tint+'">'+
      '<div class="actions"><button id="foldMossReset">Moss default</button><button id="foldWheelDone">Done</button></div>');
    const wheel=el('foldHueWheel'),picker=el('foldCustomColor');
    function choose(clientX,clientY){
      const r=wheel.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
      const degrees=(Math.atan2(clientY-cy,clientX-cx)*180/Math.PI+90+360)%360;
      colorize(hslHex(degrees));picker.value=tint;
      wheel.style.setProperty('--hueRotation',degrees+'deg');
      wheel.setAttribute('aria-valuenow',String(Math.round(degrees)));
    }
    wheel.onpointerdown=e=>{wheel.setPointerCapture(e.pointerId);choose(e.clientX,e.clientY)};
    wheel.onpointermove=e=>{if(e.buttons)choose(e.clientX,e.clientY)};
    wheel.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();const h=Number(wheel.getAttribute('aria-valuenow')||110)+(e.key==='ArrowRight'?5:-5);
      const v=((h%360)+360)%360;colorize(hslHex(v));picker.value=tint;wheel.setAttribute('aria-valuenow',String(v));
    }};
    picker.oninput=e=>colorize(e.target.value);
    el('foldMossReset').onclick=()=>{colorize('#aabda5');picker.value=tint};
    el('foldWheelDone').onclick=hidePanel;
  }
  const progress=el('progress');
  if(progress){
    let timer=null,hold=null;
    const cancel=()=>{if(timer)clearTimeout(timer);timer=null;hold=null};
    progress.addEventListener('pointerdown',e=>{
      cancel();hold={id:e.pointerId,x:e.clientX,y:e.clientY,value:progress.value};
      timer=setTimeout(()=>{if(!hold)return;const old=hold.value;cancel();
        progress.value=old;previewSeek(old);openColorWheel();
      },3000);
    });
    progress.addEventListener('pointermove',e=>{
      if(hold && (Math.abs(e.clientX-hold.x)>7||Math.abs(e.clientY-hold.y)>7))cancel();
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>progress.addEventListener(name,cancel));
  }

  // Four shelf themes. They change background/shelves only; custom covers stay.
  const library=el('library');
  let shelfTheme=storage.foldShelfTheme||'dark';
  const themes={dark:'Dark',aero:'Aero',wood:'Wood',white:'White'};
  function applyShelfTheme(){if(library)library.dataset.shelfTheme=themes[shelfTheme]?shelfTheme:'dark';}
  applyShelfTheme();
  const beforeShelfModal=modal;
  modal=function(html){
    const isView=/<h2>Library view<\/h2>/.test(String(html));
    if(isView)html=html.replace('<div class="actions"><button type="button" id="foldShowAll">',
      '<fieldset id="foldShelfThemes"><legend>Bookshelf appearance</legend><div class="foldThemeChoices">'+
      Object.entries(themes).map(([id,label])=>'<button type="button" data-theme="'+id+'">'+label+'</button>').join('')+
      '</div></fieldset><div class="actions"><button type="button" id="foldShowAll">');
    const res=beforeShelfModal.apply(this,[html]);
    if(isView){el('foldShelfThemes')?.querySelectorAll('button').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.theme===shelfTheme));
      b.onclick=()=>{shelfTheme=b.dataset.theme;storage.foldShelfTheme=shelfTheme;applyShelfTheme();
        el('foldShelfThemes')?.querySelectorAll('button').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));
      };
    });}
    return res;
  };
})();
