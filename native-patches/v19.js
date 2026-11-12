/* Fold Reader v19: uncluttered footnotes, consistent superscript verse numbers,
   matte AMOLED controls and safer fixed-PDF/reflowable-EPUB page boundaries. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const read = $('read'), shade = $('shade'), view = $('view');
  let noteIsOpen = false;

  // The footnote popup should not blacken the book or show the toolbar behind it.
  const showModal = modal, dismissModal = hidePanel;
  modal = function(html) {
    const isNote = /class=["']foldnote-head["']/.test(String(html));
    const result = showModal.apply(this, arguments);
    noteIsOpen = isNote;
    shade?.classList.toggle('foldFootnoteOpen', isNote);
    if (isNote) read?.classList.add('hideHud');
    return result;
  };
  hidePanel = function() {
    const wasNote = noteIsOpen;
    noteIsOpen = false;
    shade?.classList.remove('foldFootnoteOpen');
    const result = dismissModal.apply(this, arguments);
    if (wasNote) read?.classList.remove('hideHud');
    return result;
  };
  shade?.addEventListener('click', event => {
    if (noteIsOpen && event.target === shade) hidePanel();
  });

  // The Quran document uses Unicode superscript digits (¹⁰⁵). Individual
  // glyphs have different fallback fonts/weights in Android WebView.
  // Convert only leading verse numbers to normal digits inside semantic SUP,
  // never the superscript links used for explanatory footnotes.
  const superscriptDigits = Object.freeze({
    '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4',
    '⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'
  });
  const superscriptStart = /^(\s*)([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,4})(?=\s|$)/u;
  const priorHtmlOf = htmlOf;
  htmlOf = function(book) {
    const html = priorHtmlOf(book);
    if (!book || /^local:(pdf|epub):/.test(book.u||'') || !/[⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(html)) return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const paragraph of template.content.querySelectorAll('p')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        if (!text.data.trim()) continue;
        if (text.parentElement?.closest('sup,a[data-foldnote]')) break;
        const match = superscriptStart.exec(text.data);
        if (!match) break;
        const number = document.createElement('sup');
        number.className = 'foldVerseNumber';
        number.textContent = [...match[2]].map(c=>superscriptDigits[c]).join('');
        if (match[1]) text.parentNode.insertBefore(document.createTextNode(match[1]), text);
        text.parentNode.insertBefore(number, text);
        text.data = text.data.slice(match[0].length);
        break;
      }
    }
    return template.innerHTML;
  };

  // Remove liquid-glass refraction without changing the existing library.
  for (const id of ['glassTop','glassBottom']) {
    const bar = $(id);
    if (!bar) continue;
    bar.classList.remove('foldLiquidGlass');
    bar.style.removeProperty('--lensX');
    bar.style.removeProperty('--lensY');
  }
  $('foldLiquidFilterSvg')?.remove();

  // PDF pages do not have reflowable font glyphs. Instead, zoom the entire
  // fixed page inside a bounded, scrollable sheet with no clipped outer text.
  if (view) {
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type => {
      view.addEventListener(type, event => {
        if (read?.dataset.bookType === 'pdf' && event.target instanceof Element &&
            event.target.closest('.pdfPage')) event.stopImmediatePropagation();
      }, true);
    });
  }
})();
