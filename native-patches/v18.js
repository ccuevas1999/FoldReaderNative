/* Fold Reader v18: preserve formatted inline spans across page splits,
   compact reader controls, independently sized/filterable bookshelf,
   and a refraction-enabled liquid-glass lens. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const read = byId('read');

  // Range.cloneContents() discards ancestor spans when both endpoints are
  // in the same text node. That made the first/last paragraph on a page
  // inherit Arial instead of the original EB Garamond and lost inline styles.
  // Clone the original element tree, trimming text nodes while retaining every
  // enclosing font, bold, italic and footnote element across page boundaries.
  segment = function(original, first, last) {
    let offset = 0;
    function copy(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const a = offset, b = offset + node.data.length;
        offset = b;
        const start = Math.max(0, first - a);
        const end = Math.min(node.data.length, last - a);
        return start < end ? document.createTextNode(node.data.substring(start, end)) : null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const cloned = node.cloneNode(false);
      for (const child of node.childNodes) {
        const part = copy(child);
        if (part) cloned.appendChild(part);
      }
      // Keep explicit line breaks only if their surrounding text is included.
      return cloned.childNodes.length ? cloned : null;
    }
    return copy(original) || original.cloneNode(false);
  };

  // Make the reader control bar a single shallow row. Existing page navigation
  // and range seek handlers stay attached to their original DOM elements.
  const toolbar = byId('glassBottom');
  const mainRow = toolbar?.querySelector('.readerControlRow.primaryControls');
  const secondary = toolbar?.querySelector('.readerControlRow.secondaryControls');
  if (mainRow && secondary) {
    for (const element of [...secondary.children]) {
      if (element.id === 'pageSettingsButton' || element.id === 'sndBtn') mainRow.append(element);
    }
    // Keep hidden compatibility controls mounted: the existing reader and
    // Page modal still reference animation/font-size elements by ID.
    secondary.style.display = 'none';
    secondary.setAttribute('aria-hidden', 'true');
    toolbar.classList.add('foldCompactBar');
    for (const button of mainRow.querySelectorAll('button')) button.classList.add('foldToolbarButton');
  }

  // The shelf offers independent, combinable source filters, not an exclusive
  // sort: Docs+EPUB can be visible at the same time, for example.
  const shelf = byId('shelf');
  const sizes = [70,80,90,100,110,120,130,140,150,160];
  let coverPct = Number(localStorage.foldShelfCoverPct || 110);
  if (!sizes.includes(coverPct)) coverPct = 110;
  function loadFilters() {
    try {
      const value = JSON.parse(localStorage.foldShelfSources || 'null');
      return value && typeof value === 'object' ? {
        docs: value.docs !== false, epub: value.epub !== false,
        pdf: value.pdf !== false
      } : {docs:true,epub:true,pdf:true};
    } catch (_) { return {docs:true,epub:true,pdf:true}; }
  }
  let filters = loadFilters();
  function typeOf(book) {
    if (/^local:pdf:/.test(book?.u||'')) return 'pdf';
    if (/^local:epub:/.test(book?.u||'')) return 'epub';
    return 'docs'; // Includes bundled sample books.
  }
  function updateShelf() {
    if (!shelf) return;
    shelf.style.setProperty('--shelfScale', String(coverPct / 100));
    const items = [...shelf.children];
    items.forEach((item, index) => {
      const book = books[index];
      if (!book) return;
      item.hidden = !filters[typeOf(book)];
      item.style.display = item.hidden ? 'none' : '';
    });
    const noneVisible = items.length > 0 && items.every(x => x.hidden);
    let status = byId('shelfFilterEmpty');
    if (noneVisible && !status) {
      status = document.createElement('p');
      status.id = 'shelfFilterEmpty';
      status.className = 'muted';
      status.textContent = 'No books match the selected sources. Change your Library view to show more.';
      shelf.insertAdjacentElement('afterend', status);
    }
    if (status) status.style.display = noneVisible ? 'block' : 'none';
  }
  const previousShelf = window.shelf || shelf;
  // The existing function is declared globally, while the element reference
  // above is local. Rebuild with all original per-book click indices intact.
  if (typeof window.shelf === 'function') {
    const oldShelf = window.shelf;
    window.shelf = function(...args) { const value = oldShelf.apply(this, args); updateShelf(); return value; };
  }
  updateShelf();

  const topHeader = document.querySelector('body > header') || document.querySelector('header');
  if (topHeader && !byId('shelfViewButton')) {
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.id = 'shelfViewButton';
    viewButton.textContent = 'View';
    viewButton.setAttribute('aria-label', 'Library cover size and book source filters');
    topHeader.append(viewButton);
    viewButton.addEventListener('click', () => {
      modal('<h2>Library view</h2>' +
        '<label for="foldCoverSize">Cover and shelf size <strong id="foldCoverPct">' + coverPct + '%</strong></label>' +
        '<input id="foldCoverSize" type="range" min="70" max="160" step="10" value="' + coverPct + '">' +
        '<fieldset class="foldShelfFilters"><legend>Show these sources</legend>' +
        '<label><input type="checkbox" id="foldShowDocs"> Google Docs</label>' +
        '<label><input type="checkbox" id="foldShowEpub"> EPUB</label>' +
        '<label><input type="checkbox" id="foldShowPdf"> PDF</label></fieldset>' +
        '<div class="actions"><button type="button" id="foldShowAll">All books</button>' +
        '<button type="button" id="foldShelfDone">Done</button></div>');
      byId('foldCoverSize').oninput = e => {
        coverPct = Number(e.target.value);
        localStorage.foldShelfCoverPct = String(coverPct);
        byId('foldCoverPct').textContent = coverPct + '%';
        updateShelf();
      };
      const controls = {docs:'foldShowDocs',epub:'foldShowEpub',pdf:'foldShowPdf'};
      for (const [kind, id] of Object.entries(controls)) {
        const checkbox = byId(id);
        checkbox.checked = filters[kind];
        checkbox.onchange = () => {
          filters[kind] = checkbox.checked;
          localStorage.foldShelfSources = JSON.stringify(filters);
          updateShelf();
        };
      }
      byId('foldShowAll').onclick = () => {
        filters = {docs:true,epub:true,pdf:true};
        localStorage.foldShelfSources = JSON.stringify(filters);
        for (const id of Object.values(controls)) byId(id).checked = true;
        updateShelf();
      };
      byId('foldShelfDone').onclick = hidePanel;
    });
  }

  // The SVG displacement filter refracts source pixels where supported by
  // Chromium WebView's backdrop-filter:url(); a blur/frosted fallback is kept.
  const ns = 'http://www.w3.org/2000/svg';
  if (!byId('foldLiquidFilterSvg')) {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'foldLiquidFilterSvg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const defs = document.createElementNS(ns, 'defs');
    const filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', 'foldLiquidRefraction');
    filter.setAttribute('x', '-8%');filter.setAttribute('y', '-8%');
    filter.setAttribute('width', '116%');filter.setAttribute('height', '116%');
    const noise = document.createElementNS(ns, 'feTurbulence');
    noise.setAttribute('type', 'fractalNoise');
    noise.setAttribute('baseFrequency', '.012 .018');
    noise.setAttribute('numOctaves', '1');
    noise.setAttribute('seed', '3');
    noise.setAttribute('result', 'distort');
    const displacement = document.createElementNS(ns, 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic');
    displacement.setAttribute('in2', 'distort');
    displacement.setAttribute('scale', '7');
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    filter.append(noise, displacement); defs.append(filter); svg.append(defs);
    document.body.prepend(svg);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    for (const glass of [byId('glassTop'), byId('glassBottom')]) {
      if (!glass) continue;
      glass.classList.add('foldLiquidGlass');
      glass.addEventListener('pointermove', e => {
        if (reducedMotion.matches) return;
        const r = glass.getBoundingClientRect();
        const x = (e.clientX - r.left) / Math.max(1, r.width);
        const y = (e.clientY - r.top) / Math.max(1, r.height);
        glass.style.setProperty('--lensX', (x * 100).toFixed(2) + '%');
        glass.style.setProperty('--lensY', (y * 100).toFixed(2) + '%');
        displacement.setAttribute('scale', String(7 + 3 * Math.sin(Math.PI * x)));
      }, {passive:true});
      glass.addEventListener('pointerleave', () => {
        glass.style.removeProperty('--lensX');glass.style.removeProperty('--lensY');
        displacement.setAttribute('scale', '7');
      }, {passive:true});
    }
  }
})();