/* Fold Reader v14: tap-to-read Google Docs footnotes, true spine hinge. */
(() => {
  'use strict';
  const parsed = new WeakMap();
  let activeFootnotes = new Map();
  const footnoteUrl = 'https://appassets.androidplatform.net/foldnote/';
  const priorHtmlOf = htmlOf;

  // Earlier imports keep the original [n] anchors, even though sanitizing
  // removes Google Docs IDs. Reconstruct reference-to-note links from them.
  htmlOf = function(book) {
    if (!book || !book.h) {
      activeFootnotes = new Map();
      return priorHtmlOf(book);
    }
    let data = parsed.get(book);
    if (!data || data.source !== book.h) {
      const root = document.createElement('template');
      root.innerHTML = book.h;
      const notes = new Map();
      const blocks = [...root.content.querySelectorAll('div')];
      for (const block of blocks) {
        const first = block.firstElementChild;
        if (!first || first.tagName !== 'P') continue;
        const firstLink = first.firstElementChild;
        if (!firstLink || firstLink.tagName !== 'A') continue;
        const match = /^\[(\d{1,4})\]$/.exec((firstLink.textContent || '').trim());
        if (!match) continue;
        const number = Number(match[1]);
        const noteCopy = block.cloneNode(true);
        const label = noteCopy.querySelector('p > a');
        if (label) label.remove();
        if (!noteCopy.textContent.trim()) continue;
        notes.set(number, noteCopy.innerHTML);
        block.remove();
      }
      let linked = 0;
      root.content.querySelectorAll('sup a').forEach(a => {
        const match = /^\[(\d{1,4})\]$/.exec((a.textContent || '').trim());
        if (!match) return;
        const number = Number(match[1]);
        if (!notes.has(number)) return;
        a.setAttribute('href', footnoteUrl + number);
        a.setAttribute('data-foldnote', String(number));
        a.setAttribute('aria-label', 'Read footnote ' + number);
        a.setAttribute('role', 'button');
        a.setAttribute('tabindex', '0');
        linked++;
      });
      data = {source: book.h, html: linked ? root.innerHTML : book.h,
        notes: linked ? notes : new Map()};
      parsed.set(book, data);
    }
    activeFootnotes = data.notes;
    return priorHtmlOf({...book, h: data.html});
  };

  function openFootnote(number) {
    const html = activeFootnotes.get(number);
    if (!html) return;
    document.getElementById('read')?.classList.remove('hideHud');
    modal('<div class="foldnote-head"><h2>Footnote ' + number + '</h2>' +
      '<button type="button" id="foldnoteClose" aria-label="Close footnote">Close</button></div>' +
      '<div id="foldnoteBody" class="foldnote-body"></div>');
    document.getElementById('foldnoteBody').innerHTML = html;
    document.getElementById('foldnoteClose').addEventListener('click', hidePanel);
  }
  const view = document.getElementById('view');
  ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type => {
    view.addEventListener(type, e => {
      if (e.target.closest('a[data-foldnote]')) e.stopImmediatePropagation();
    }, true);
  });
  view.addEventListener('click', e => {
    const link = e.target.closest('a[data-foldnote]');
    if (!link) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openFootnote(Number(link.dataset.foldnote));
  }, true);
  view.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('a[data-foldnote]')) {
      e.preventDefault();
      openFootnote(Number(e.target.closest('a[data-foldnote]').dataset.foldnote));
    }
  }, true);

  // Anchor each turning sheet to the center of the book, never skew the hinge.
  const earlierVisual = visual;
  visual = function(d, progress) {
    earlierVisual(d, progress);
    const sheet = view.querySelector('.turnSheet');
    if (!sheet) return;
    const q = Math.max(0, Math.min(1, progress));
    const bow = Math.pow(Math.sin(Math.PI * q), .75);
    const forward = d.dir > 0;
    sheet.style.transformOrigin = forward ? 'left center' : 'right center';
    sheet.style.transform = 'rotateY(' + ((forward ? -180 : 180) * q) + 'deg)';
    sheet.style.transformStyle = 'preserve-3d';
    sheet.style.filter = 'none';
    const cutMax = 38 * bow;
    const points = [];
    const topCorner = (d.touchY ?? 65) < 40;
    for (let i = 0; i <= 40; i++) {
      const y = i * 2.5;
      const t = topCorner ? (1 - y/100) : (y/100);
      const depth = cutMax * Math.pow(t, 2.6);
      const x = forward ? 100 - depth : depth;
      points.push(x.toFixed(2) + '% ' + y.toFixed(2) + '%');
    }
    sheet.style.setProperty('--curlOutline', forward ?
      'polygon(0 0,' + points.join(',') + ',0 100%)' :
      'polygon(100% 0,' + points.join(',') + ',100% 100%)');
    sheet.style.setProperty('--sheetShade', String(.75 * bow));
    sheet.style.setProperty('--peelOpacity', String(.3 + .67 * bow));
    const rounded = Math.round(125 * bow);
    sheet.style.setProperty('--peelRadius', forward ?
      '0 ' + rounded + 'px ' + rounded + 'px 0' :
      rounded + 'px 0 0 ' + rounded + 'px');
  };
})();