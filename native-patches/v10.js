/* Fold Reader v10: library-first import, responsive controls, audio asset, contents dismissal,
   size-only text scaling and page curl. Runs after the proven v7/v9 pagination engine. */
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const docId = input => /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)/.exec(input || '')?.[1] || null;
  const loadingBooks = new Set();
  const failedBooks = new Map();
  let activeImport = new Map();
  let fontScale = Math.min(1.6, Math.max(.65, Number(localStorage.foldTextScale) || 1));
  const reader = get('read');
  reader.style.setProperty('--reader-scale', String(fontScale));

  // The old modal shadow did not receive clicks. Contents has its own real backdrop.
  const tocBackdrop = document.createElement('div');
  tocBackdrop.id = 'tocBackdrop';
  tocBackdrop.setAttribute('aria-label', 'Close contents');
  tocBackdrop.addEventListener('click', () => toc(false));
  reader.insertBefore(tocBackdrop, get('toc'));
  const tocPane = get('toc');
  tocPane.setAttribute('role', 'dialog');
  tocPane.setAttribute('aria-label', 'Table of contents');
  const tocClose = document.createElement('button');
  tocClose.type = 'button';
  tocClose.id = 'tocClose';
  tocClose.textContent = '✕ Close';
  tocClose.setAttribute('aria-label', 'Close table of contents');
  tocClose.addEventListener('click', () => toc(false));
  tocPane.insertBefore(tocClose, tocPane.firstChild);
  tocPane.querySelector('.actions')?.remove();
  toc = function(show) {
    const open = !!show;
    tocPane.style.display = open ? 'block' : 'none';
    tocBackdrop.style.display = open ? 'block' : 'none';
    if(open) reader.classList.remove('hideHud');
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tocPane.style.display === 'block') { e.preventDefault(); toc(false); }
  });
  window.foldBackPressed = function() {
    if (get('shade').style.display === 'flex') { hidePanel(); return; }
    if (tocPane.style.display === 'block') { toc(false); return; }
    if (bookId >= 0) { back(); return; }
    if (window.FoldBridge) FoldBridge.finishReader();
  };

  // Split controls into two safe-area-aware rows, leaving both turn directions reachable.
  get('glassBottom').innerHTML = `
    <div class="readerControlRow primaryControls">
      <button type="button" onclick="back()" aria-label="Return to library">Library</button>
      <button type="button" class="pageArrow" onclick="turn(-1)" aria-label="Previous page">‹</button>
      <span id="pageCount" aria-live="off">1 / 1</span>
      <button type="button" class="pageArrow" onclick="turn(1)" aria-label="Next page">›</button>
      <input id="progress" type="range" min="0" max="0" value="0" aria-label="Reading progress" oninput="previewSeek(this.value)" onchange="seek(this.value)" />
    </div>
    <div class="readerControlRow secondaryControls">
      <select id="animation" aria-label="Page animation" onchange="keepSettings()"><option>Curl</option><option>Instant</option></select>
      <button type="button" id="fontDown" aria-label="Decrease reader font size">A−</button>
      <button type="button" id="fontUp" aria-label="Increase reader font size">A+</button>
      <button type="button" onclick="appearance()">Paper</button>
      <button type="button" onclick="toggleSound()" id="sndBtn" aria-label="Toggle page turn sound">Sound off</button>
    </div>`;
  get('animation').value = anim;
  get('sndBtn').textContent = sound ? 'Sound on' : 'Sound off';

  // Do not edit the Google Doc: scale only the rendered HTML, keeping source sizes intact.
  const oldHtmlOf = htmlOf;
  htmlOf = function(book) {
    return oldHtmlOf(book).replace(/font-size\s*:\s*(\d+(?:\.\d+)?(?:pt|px|em|rem|%))(?![\w\d])/gi,
      (_, value) => `font-size:calc(${value} * var(--reader-scale))`);
  };
  const oldLeaf = leaf;
  leaf = function() {
    const item = oldLeaf();
    item.firstElementChild.style.fontSize = (19 * fontScale).toFixed(2) + 'px';
    return item;
  };
  function changeReaderText(delta) {
    const next = Math.round(Math.max(.65, Math.min(1.6, fontScale + delta)) * 100) / 100;
    if(next === fontScale) return;
    fontScale = next;
    localStorage.foldTextScale = String(next);
    reader.style.setProperty('--reader-scale', String(fontScale));
    get('fontDown').disabled = fontScale <= .65;
    get('fontUp').disabled = fontScale >= 1.6;
    if(bookId >= 0) scheduleReflow();
  }
  get('fontDown').onclick = () => changeReaderText(-.05);
  get('fontUp').onclick = () => changeReaderText(.05);
  get('fontDown').disabled = fontScale <= .65;
  get('fontUp').disabled = fontScale >= 1.6;

  // This is a bundled wave file, not a synthetic per-turn sound. Its audio is local and offline.
  const pageSound = new Audio('page_turn.wav');
  pageSound.preload = 'auto';
  pageSound.volume = .095;
  rustle = function() {
    if (!sound) return;
    try { pageSound.pause(); pageSound.currentTime = 0; pageSound.play().catch(() => {}); }
    catch (e) { console.warn('Page turn audio:', e); }
  };
  const originalToggleSound = toggleSound;
  toggleSound = function() {
    originalToggleSound();
  };

  // New links return to the bookshelf immediately; import progress lives on each cover.
  showAdd = function() {
    modal('<h2>Add Google Doc</h2><label for="newUrl">Google Docs link</label>'+
      '<input id="newUrl" type="url" autocapitalize="off" autocomplete="url" placeholder="https://docs.google.com/document/d/..." />'+
      '<label for="newTitle">Book title (optional)</label><input id="newTitle" placeholder="Google Doc" />'+
      '<div class="actions"><button onclick="addDoc()">Add to library</button>'+
      '<button onclick="hidePanel()">Cancel</button></div>');
    get('newUrl').focus();
  };
  function loadingState(j, isLoading) {
    if(isLoading) loadingBooks.add(j); else loadingBooks.delete(j);
    shelf();
  }
  async function importIntoLibrary(j, openAfter = false) {
    const book = books[j];
    if(!book || !book.u) return;
    const id = docId(book.u);
    if(!id) { failedBooks.set(j, 'Invalid Google Docs URL'); shelf(); return; }
    if(activeImport.has(id)) {
      await activeImport.get(id);
      if(openAfter && books[j]?.h) openBook(j);
      return;
    }
    failedBooks.delete(j);
    loadingState(j, true);
    const work = (async () => {
      try {
        const url = window.FoldBridge ? await nativeImport(id) :
          `https://docs.google.com/document/d/${id}/export?format=html`;
        const response = await fetch(url, {credentials: window.FoldBridge ? 'same-origin' : 'omit'});
        if(!response.ok) throw Error('HTTP ' + response.status);
        const raw = await response.text();
        if(!/<(?:html|body|p|h[1-6])\b/i.test(raw)) throw Error('No readable document HTML');
        const formatted = sanitize(raw);
        if(formatted.replace(/<[^>]+>/g, '').trim().length < 100) throw Error('Document is empty');
        // Keep rich HTML only in the app session, with original Docs as the source of truth.
        const b = books[j];
        if(!b || docId(b.u) !== id) return;
        b.h = formatted; b.c = '';
        save();
      } catch(err) {
        if(books[j]) failedBooks.set(j, String(err.message || err));
      } finally {
        activeImport.delete(id);
        loadingState(j, false);
      }
    })();
    activeImport.set(id, work);
    await work;
    if(openAfter && books[j]?.h && bookId < 0) openBook(j);
  }
  addDoc = function() {
    const url = get('newUrl').value.trim();
    const id = docId(url);
    if(!id) { get('newUrl').setCustomValidity('Paste a valid Google Docs link');get('newUrl').reportValidity();return; }
    const u = `https://docs.google.com/document/d/${id}/edit`;
    let j = books.findIndex(b => b.u === u);
    if(j < 0) {
      j = books.length;
      books.push({t:get('newTitle').value.trim() || 'Google Doc',u,c:'',h:'',cover:j%6,img:'',pos:0});
    }
    save();
    hidePanel();
    if(bookId >= 0) back();
    shelf();
    // Stay on bookshelf while formatted content downloads.
    if(!books[j].h) void importIntoLibrary(j);
  };
  const originalShelf = shelf;
  shelf = function() {
    originalShelf();
    [...get('shelf').children].forEach((el, j) => {
      const cover = el.querySelector('.cover');
      if (loadingBooks.has(j)) {
        cover.setAttribute('aria-busy', 'true');
        const ring = document.createElement('span');ring.className='loadingSpinner';
        ring.setAttribute('aria-label', 'Loading formatted Google Doc');cover.append(ring);
        const b = document.createElement('span');b.className='loadingCaption';b.textContent='Loading document…';cover.append(b);
      } else if (failedBooks.has(j)) {
        const error = document.createElement('span');error.className='errorBadge';error.textContent='Retry import';
        error.title=failedBooks.get(j);cover.append(error);
      }
    });
  };
  openBook = function(j) {
    if (loadingBooks.has(j)) return;
    const book = books[j]; if(!book) return;
    if(!book.h && !book.c) {
      // Tapping a failed or not-yet-imported cover retries from the shelf.
      bookId=-1;void importIntoLibrary(j,true);return;
    }
    bookId = j;
    localStorage.foldLastOpenUrl = book.u || 'sample';
    enter();
  };
  importDoc = function() { if(bookId >= 0) {const j=bookId;bookId=-1;void importIntoLibrary(j,true);} };
  const oldBack = back;
  back = function() {
    toc(false);
    oldBack();
    localStorage.removeItem('foldLastOpenUrl');
  };
  window.foldAddUrl = function(url) {
    const id=docId(url);if(!id)return;
    const u=`https://docs.google.com/document/d/${id}/edit`;
    let j=books.findIndex(b=>b.u===u);
    if(j<0){j=books.length;books.push({t:'Google Doc',u,c:'',h:'',cover:j%6,img:'',pos:0});save();}
    if(bookId>=0)back();
    shelf();
    if(!books[j].h) void importIntoLibrary(j);
  };

  // The turning sheet rounds its free edge and bends slightly toward the gesture point.
  // This remains a lightweight CSS approximation, not a physics-based mesh curl.
  visual = function(d, progress) {
    const q = Math.max(0, Math.min(1, progress));
    const sheet = get('view').querySelector('.turnSheet');
    if(!sheet) return;
    const bulge = Math.sin(Math.PI * q);
    const angle = (d.dir > 0 ? -180 : 180) * q;
    const finger = Math.max(0,Math.min(100,d.touchY ?? 72));
    const tilt = (finger > 50 ? -1 : 1) * (d.dir > 0 ? 1 : -1) * 3.2 * bulge;
    const skew = (d.dir > 0 ? -1 : 1) * 1.8 * bulge;
    sheet.style.transform = `rotateY(${angle}deg) rotateZ(${tilt}deg) skewY(${skew}deg)`;
    sheet.style.setProperty('--sheetShade', String(.66 * bulge));
    sheet.style.setProperty('--peelOpacity', String(Math.min(.95,.28 + .67 * bulge)));
    sheet.style.setProperty('--peelAngle', d.dir > 0 ? '90deg' : '270deg');
    sheet.style.setProperty('--peelRadius', d.dir > 0 ? `0 ${Math.round(60*bulge)}px ${Math.round(96*bulge)}px 0` : `${Math.round(60*bulge)}px 0 0 ${Math.round(96*bulge)}px`);
    sheet.style.filter = `drop-shadow(${d.dir > 0 ? -1 : 1}px ${Math.round(6*bulge)}px ${Math.round(10+10*bulge)}px #0007)`;
  };

  // Fold / unfold remeasures the current book without changing the open-book selection.
  let lastViewport = '';
  window.foldViewportChanged = function() {
    const dims = `${get('view').clientWidth}x${get('view').clientHeight}`;
    if (bookId < 0 || dims === lastViewport) return;
    lastViewport = dims;
    // Avoid completing an obsolete turn in a differently sized viewport.
    if(drag){drag=null; working=false;}
    scheduleReflow();
  };
  window.addEventListener('resize', () => {
    if(bookId >= 0 && get('view').clientWidth > 0)
      clearTimeout(window.foldResizeDelay);
    window.foldResizeDelay = setTimeout(window.foldViewportChanged, 380);
  }, {passive:true});
  // Preserve visible book across rare process recreation as well as ordinary fold changes.
  const lastBook=localStorage.foldLastOpenUrl;
  if(lastBook && bookId < 0){const j=books.findIndex(b=>(b.u||'sample')===lastBook);if(j>=0)openBook(j);}
  else shelf();
})();