(function () {
  const C = window.Chamak, $ = (id) => document.getElementById(id);
  const state = { seed: 1, text: 'Siraj', sub: 'Karachi to Khyber', palette: 'classic', format: 'portrait', petals: 0, density: 1 };
  let current = null;

  // ---- state <-> URL hash (a link recreates the exact poster) ----
  function toHash() { const p = new URLSearchParams(); for (const k of ['seed', 'text', 'sub', 'palette', 'format', 'petals', 'density']) p.set(k, state[k]); return '#' + p.toString(); }
  function fromHash() {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.has('seed')) state.seed = Math.max(1, Math.floor(+p.get('seed')) || 1);
      if (p.has('text')) state.text = p.get('text').slice(0, 40);
      if (p.has('sub')) state.sub = p.get('sub').slice(0, 60);
      if (C.PALETTES[p.get('palette')]) state.palette = p.get('palette');
      if (C.FORMATS[p.get('format')]) state.format = p.get('format');
      if ([0, 8, 10, 12, 14, 16].includes(+p.get('petals'))) state.petals = +p.get('petals');
      if (+p.get('density') >= 0.6 && +p.get('density') <= 1.6) state.density = +p.get('density');
    } catch (e) { /* a bad hash just means defaults */ }
  }

  const blobUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  let lastUrl = '';

  function render(pushHistory) {
    current = C.generate(state);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = blobUrl(current.svg);
    $('art').src = lastUrl;
    $('art').alt = `Truck-art poster saying ${state.text || 'Chamak'}, ${C.PALETTES[state.palette].name} palette, ${current.meta.petals} petals`;
    try { window.history.replaceState(null, '', toHash()); } catch (e) { /* some sandboxes forbid it; the link just will not update */ }
    if (pushHistory) addHistory();
  }

  // ---- history strip ----
  const past = [];
  function addHistory() {
    const snap = Object.assign({}, state);
    if (past.length && JSON.stringify(past[0]) === JSON.stringify(snap)) return;
    past.unshift(snap); if (past.length > 12) past.pop();
    drawHistory();
  }
  function drawHistory() {
    const box = $('hist'); box.textContent = '';
    past.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Go back to poster ' + (i + 1));
      const img = document.createElement('img'); img.alt = '';
      img.src = blobUrl(C.generate(Object.assign({}, s, { format: 'portrait' })).svg);
      img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
      b.appendChild(img);
      if (i === 0) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { Object.assign(state, s); syncControls(); render(false); });
      box.appendChild(b);
    });
  }

  // ---- controls ----
  function palettes() {
    const box = $('pal'); box.textContent = '';
    Object.entries(C.PALETTES).forEach(([key, p]) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', key === state.palette);
      const chips = document.createElement('span'); chips.className = 'chips';
      [p.bg, ...p.frames.slice(0, 3)].forEach((c) => { const i = document.createElement('i'); i.style.background = c; chips.appendChild(i); });
      b.appendChild(chips); b.appendChild(document.createTextNode(p.name));
      b.addEventListener('click', () => { state.palette = key; palettes(); render(true); });
      box.appendChild(b);
    });
  }
  function syncControls() { $('text').value = state.text; $('sub').value = state.sub; $('fmt').value = state.format; $('pet').value = String(state.petals); $('den').value = state.density; palettes(); }
  const shuffle = () => { state.seed = (Math.random() * 4294967295 >>> 0) || 1; render(true); };
  let timer = 0;
  const later = (fn) => { clearTimeout(timer); timer = setTimeout(fn, 200); };
  $('text').addEventListener('input', (e) => { state.text = e.target.value; later(() => render(true)); });
  $('sub').addEventListener('input', (e) => { state.sub = e.target.value; later(() => render(true)); });
  $('fmt').addEventListener('change', (e) => { state.format = e.target.value; render(true); });
  $('pet').addEventListener('change', (e) => { state.petals = +e.target.value; render(true); });
  $('den').addEventListener('input', (e) => { state.density = +e.target.value; later(() => render(true)); });
  $('shuf').addEventListener('click', shuffle);
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !e.target.matches('input,select,textarea,button')) { e.preventDefault(); shuffle(); } });

  // ---- downloads ----
  const msg = (t) => { $('msg').textContent = t; };
  const fileName = (ext) => 'chamak-' + (state.text || 'poster').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 24).toLowerCase() + '-' + state.seed + '.' + ext;
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  $('svg').addEventListener('click', () => { save(new Blob([current.svg], { type: 'image/svg+xml' }), fileName('svg')); msg('SVG saved.'); });
  $('png').addEventListener('click', () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = current.width; c.height = current.height;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { if (!b) { msg('PNG export failed: try SVG.'); return; } save(b, fileName('png')); msg(`PNG saved (${c.width} x ${c.height}).`); }, 'image/png');
    };
    img.onerror = () => msg('PNG export failed: try SVG.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(current.svg);
  });
  $('link').addEventListener('click', () => {
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => msg('Link copied. It recreates this exact poster.'), () => msg('Copy failed: copy the address bar instead.'));
  });

  window.addEventListener('hashchange', () => { fromHash(); syncControls(); render(true); });          // a pasted link in an open tab
  fromHash();
  if (!location.hash) state.seed = (Math.random() * 4294967295 >>> 0) || 1;
  syncControls(); render(true);
  window.ChamakApp = { state, get current() { return current; } };
})();
