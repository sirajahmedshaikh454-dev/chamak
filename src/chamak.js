// Chamak: a generative truck-art poster. Pure functions: generate(params) -> { svg, width, height, meta, scene }.
// Truck art (Pakistan's painted trucks and buses) is built from a small vocabulary: saturated flat colour, thick black outlines,
// repeating borders (dots, chain links, scallops), a kaleidoscope flower, mirrored corner fans, and a banner of bold lettering.
// Everything is drawn from a seeded random generator, so the same seed gives the same poster byte for byte.
(function (root) {
  const TAU = Math.PI * 2;

  // ---------- seeded randomness ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // ---------- palettes: bg = the field, frames = border bands, petals = flower colours, accent = centres ----------
  const PALETTES = {
    classic: { name: 'Classic', bg: '#12706a', frames: ['#d62828', '#fcbf49', '#1d4ed8', '#e91e8c'], petals: ['#fcbf49', '#d62828', '#ffffff', '#2a9d4f'], accent: '#f77f00', light: '#fff4d6', dark: '#141010' },
    peacock: { name: 'Peacock', bg: '#0b3d91', frames: ['#00a6a6', '#fcbf49', '#d62828', '#2a9d4f'], petals: ['#00a6a6', '#fcbf49', '#ffffff', '#e91e8c'], accent: '#fcbf49', light: '#f2fbff', dark: '#0a0f1f' },
    marigold: { name: 'Marigold', bg: '#c1121f', frames: ['#f77f00', '#fcbf49', '#0b7a4b', '#1d4ed8'], petals: ['#fcbf49', '#f77f00', '#ffffff', '#0b7a4b'], accent: '#1d4ed8', light: '#fff6dd', dark: '#180808' },
    jade: { name: 'Jade', bg: '#101a3a', frames: ['#2a9d4f', '#fcbf49', '#e91e8c', '#00a6a6'], petals: ['#2a9d4f', '#fcbf49', '#ffffff', '#e91e8c'], accent: '#00a6a6', light: '#eefff4', dark: '#07110c' },
    bazaar: { name: 'Bazaar', bg: '#7b1fa2', frames: ['#e91e8c', '#fcbf49', '#00a6a6', '#f77f00'], petals: ['#e91e8c', '#fcbf49', '#ffffff', '#00a6a6'], accent: '#f77f00', light: '#fff0fa', dark: '#14061a' },
    monsoon: { name: 'Monsoon', bg: '#1f2a44', frames: ['#00a6a6', '#ffffff', '#f77f00', '#1d4ed8'], petals: ['#ffffff', '#00a6a6', '#f77f00', '#fcbf49'], accent: '#e91e8c', light: '#f4f8ff', dark: '#080c16' },
  };
  const FORMATS = { portrait: [1200, 1600], landscape: [1600, 1200], square: [1400, 1400], phone: [1080, 2340] };

  // ---------- colour maths (WCAG contrast) ----------
  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const readable = (bg, p) => (contrast(bg, p.light) >= contrast(bg, p.dark) ? p.light : p.dark);

  // ---------- a tiny scene graph ----------
  const n1 = (v) => (Math.round(v * 10) / 10).toString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/\s+/g, ' ').trim();
  const el = (tag, attrs, kids) => ({ tag, attrs: attrs || {}, kids: kids || [] });
  function ser(node) {
    if (typeof node === 'string') return esc(node);
    const a = Object.keys(node.attrs).map((k) => ` ${k}="${esc(typeof node.attrs[k] === 'number' ? n1(node.attrs[k]) : node.attrs[k])}"`).join('');
    return node.kids.length ? `<${node.tag}${a}>${node.kids.map(ser).join('')}</${node.tag}>` : `<${node.tag}${a}/>`;
  }
  const OUT = (p, w) => ({ stroke: p.dark, 'stroke-width': w || 4, 'stroke-linejoin': 'round' });

  function circle(cx, cy, r, fill, p, sw) { return el('circle', Object.assign({ cx, cy, r, fill }, OUT(p, sw))); }
  function path(d, fill, p, sw) { return el('path', Object.assign({ d, fill }, OUT(p, sw))); }

  // a teardrop petal pointing up from the origin, length L, half-width w
  const petalD = (L, w) => `M0,0 C${n1(-w)},${n1(-L * 0.3)} ${n1(-w * 0.7)},${n1(-L * 0.85)} 0,${n1(-L)} C${n1(w * 0.7)},${n1(-L * 0.85)} ${n1(w)},${n1(-L * 0.3)} 0,0 Z`;

  function sides(x, y, w, h) {                                    // the four edges of a rectangle, clockwise, with inward normals
    return [
      { p0: [x, y], dir: [1, 0], nor: [0, 1], len: w },
      { p0: [x + w, y], dir: [0, 1], nor: [-1, 0], len: h },
      { p0: [x + w, y + h], dir: [-1, 0], nor: [0, -1], len: w },
      { p0: [x, y + h], dir: [0, -1], nor: [1, 0], len: h },
    ];
  }
  function along(side, step, fn) {                                // call fn at the centre of each of count equal cells along a side
    const count = Math.max(1, Math.round(side.len / step)), sp = side.len / count;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) * sp;
      fn([side.p0[0] + side.dir[0] * t, side.p0[1] + side.dir[1] * t], side.dir, side.nor, i, sp);
    }
  }

  // ---------- the poster ----------
  function generate(params) {
    params = params || {};
    const seed = (params.seed >>> 0) || 1;
    const r = rng(seed);
    const p = PALETTES[params.palette] || PALETTES.classic;
    const [W, H] = FORMATS[params.format] || FORMATS.portrait;
    const text = clean(params.text).slice(0, 40) || 'CHAMAK', sub = clean(params.sub).slice(0, 60);
    const N = [8, 10, 12, 14, 16].includes(params.petals) ? params.petals : pick(r, [8, 10, 12, 14, 16]);
    const lattice = pick(r, ['diamond', 'dots', 'cross']), band2 = pick(r, ['chain', 'beads', 'zigzag']);
    const rot = Math.floor(r() * 4), fr = (i) => p.frames[(i + rot) % 4];
    const flowers = pick(r, [3, 5, 7]);
    const dens = Math.min(1.6, Math.max(0.6, Number(params.density) || 1));
    const scene = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const defs = el('defs'), kids = scene.kids;
    kids.push(defs);
    const u = Math.min(W, H) / 1200;                                // everything scales with the short side

    // frames: four nested bands, then the field
    const t1 = 34 * u, t2 = 58 * u, t3 = 44 * u, pad = t1 + t2 + t3;
    [[0, fr(0)], [t1, fr(1)], [t1 + t2, fr(2)], [pad, p.bg]].forEach(([i, c]) => kids.push(el('rect', Object.assign({ x: i, y: i, width: W - 2 * i, height: H - 2 * i, fill: c }, OUT(p, 6 * u)))));
    const meta = { seed, petals: N, lattice, band2, flowers, palette: params.palette in PALETTES ? params.palette : 'classic', width: W, height: H };

    // band 1: glitter dots (a radial gradient gives each a little shine)
    defs.kids.push(el('radialGradient', { id: 'glit', cx: '35%', cy: '35%', r: '70%' }, [el('stop', { offset: '0', 'stop-color': '#ffffff' }), el('stop', { offset: '1', 'stop-color': p.light })]));
    sides(t1 / 2, t1 / 2, W - t1, H - t1).forEach((s) => along(s, 30 * u / dens, (c) => kids.push(el('circle', { cx: c[0], cy: c[1], r: 7 * u, fill: 'url(#glit)', stroke: p.dark, 'stroke-width': 2.5 * u }))));

    // band 2: chain links, beads or a zigzag
    sides(t1, t1, W - 2 * t1, H - 2 * t1).forEach((s) => along(s, 62 * u / dens, (c, d, nrm, i, sp) => {
      const cx = c[0] + nrm[0] * t2 / 2, cy = c[1] + nrm[1] * t2 / 2, horiz = d[0] !== 0, col = fr(1 + (i % 2) * 2);
      if (band2 === 'chain') kids.push(el('ellipse', Object.assign({ cx, cy, rx: horiz ? sp * 0.47 : t2 * 0.33, ry: horiz ? t2 * 0.33 : sp * 0.47, fill: col }, OUT(p, 4 * u))));
      else if (band2 === 'beads') kids.push(circle(cx, cy, Math.min(sp, t2) * 0.38, col, p, 4 * u));
      else {
        const a = [cx - d[0] * sp / 2 - nrm[0] * t2 * 0.28, cy - d[1] * sp / 2 - nrm[1] * t2 * 0.28], b = [cx + d[0] * sp / 2 - nrm[0] * t2 * 0.28, cy + d[1] * sp / 2 - nrm[1] * t2 * 0.28], tip = [cx + nrm[0] * t2 * 0.3, cy + nrm[1] * t2 * 0.3];
        kids.push(path(`M${n1(a[0])},${n1(a[1])} L${n1(tip[0])},${n1(tip[1])} L${n1(b[0])},${n1(b[1])} Z`, col, p, 3.5 * u));
      }
    }));

    // field texture
    const cell = 64 * u / dens;
    const pat = el('pattern', { id: 'lat', width: cell, height: cell, patternUnits: 'userSpaceOnUse' });
    if (lattice === 'diamond') pat.kids.push(el('path', { d: `M${n1(cell / 2)},0 L${n1(cell)},${n1(cell / 2)} L${n1(cell / 2)},${n1(cell)} L0,${n1(cell / 2)} Z`, fill: 'none', stroke: p.light, 'stroke-width': 2.5 * u, opacity: 0.35 }));
    else if (lattice === 'dots') pat.kids.push(el('circle', { cx: cell / 2, cy: cell / 2, r: 4.5 * u, fill: p.light, opacity: 0.4 }));
    else pat.kids.push(el('path', { d: `M${n1(cell / 2)},${n1(cell * 0.3)} V${n1(cell * 0.7)} M${n1(cell * 0.3)},${n1(cell / 2)} H${n1(cell * 0.7)}`, stroke: p.light, 'stroke-width': 3 * u, opacity: 0.4 }));
    defs.kids.push(pat);
    const fx = pad, fy = pad, fw = W - 2 * pad, fh = H - 2 * pad;
    kids.push(el('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'url(#lat)' }));

    // band 3 canopy: scallops hanging into the field from the inner frame edge
    sides(fx, fy, fw, fh).forEach((s) => along(s, 78 * u / dens, (c, d, nrm, i, sp) => {
      const a = [c[0] - d[0] * sp / 2, c[1] - d[1] * sp / 2], b = [c[0] + d[0] * sp / 2, c[1] + d[1] * sp / 2], k = sp * 0.78;
      kids.push(path(`M${n1(a[0])},${n1(a[1])} C${n1(a[0] + nrm[0] * k)},${n1(a[1] + nrm[1] * k)} ${n1(b[0] + nrm[0] * k)},${n1(b[1] + nrm[1] * k)} ${n1(b[0])},${n1(b[1])} Z`, fr(3 - (i % 2) * 2), p, 4 * u));
    }));

    // medallion
    const cx = W / 2, cy = fy + fh * 0.38, R = Math.min(fw * 0.34, fh * 0.26);
    const med = el('g', { id: 'medallion' });
    med.kids.push(circle(cx, cy, R * 1.1, fr(0), p, 7 * u));
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; med.kids.push(el('circle', { cx: cx + Math.cos(a) * R * 1.03, cy: cy + Math.sin(a) * R * 1.03, r: 5 * u, fill: 'url(#glit)', stroke: p.dark, 'stroke-width': 2 * u })); }
    const wide = R * Math.sin(Math.PI / N) * 1.55;
    const petalRing = (len, w, offset, cols, id) => {
      const g = el('g', { id });
      for (let i = 0; i < N; i++) {
        const deg = (offset + (i * 360) / N);
        const col = cols[i % 2];
        g.kids.push(el('g', { transform: `translate(${n1(cx)} ${n1(cy)}) rotate(${n1(deg)})`, 'data-deg': n1(deg) }, [
          path(petalD(len, w), col, p, 5 * u),
          path(petalD(len * 0.6, w * 0.5), cols[(i + 1) % 2 === 0 ? 2 : 3 % cols.length] || p.light, p, 3.5 * u),
          el('circle', { cx: 0, cy: -len * 0.9, r: Math.max(4, w * 0.16), fill: p.light, stroke: p.dark, 'stroke-width': 2.5 * u }),
        ]));
      }
      return g;
    };
    med.kids.push(petalRing(R, wide, 0, [p.petals[0], p.petals[1], p.petals[2], p.petals[3]], 'ring1'));
    med.kids.push(petalRing(R * 0.68, wide * 0.78, 180 / N, [p.petals[1], p.petals[3], p.petals[0], p.petals[2]], 'ring2'));
    med.kids.push(circle(cx, cy, R * 0.36, p.accent, p, 6 * u));
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU - Math.PI / 2; med.kids.push(circle(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28, 5 * u, p.light, p, 2 * u)); }
    const star = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU - Math.PI / 2, rr = i % 2 ? R * 0.1 : R * 0.2; star.push(`${n1(cx + Math.cos(a) * rr)},${n1(cy + Math.sin(a) * rr)}`); }
    med.kids.push(path(`M${star.join(' L')} Z`, p.light, p, 4 * u));
    med.kids.push(circle(cx, cy, R * 0.06, p.dark, p, 2 * u));
    kids.push(med);

    // corner fans: drawn once for the top-left and mirrored, so the poster is symmetric by construction
    const fanR = Math.min(fw, fh) * 0.2;
    const fan = el('g', {}, []);
    for (let k = 4; k >= 1; k--) {
      const rr = (fanR * k) / 4;
      fan.kids.push(path(`M0,0 L${n1(rr)},0 A${n1(rr)},${n1(rr)} 0 0 1 0,${n1(rr)} Z`, [p.petals[0], fr(0), p.petals[2], p.accent][k - 1], p, 4 * u));
      for (let s = 1; s < 4; s++) { const a = (s / 4) * (Math.PI / 2) + 0.0; fan.kids.push(el('circle', { cx: Math.cos(a) * rr * 0.96, cy: Math.sin(a) * rr * 0.96, r: 5 * u, fill: p.light, stroke: p.dark, 'stroke-width': 2 * u })); }
    }
    [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]].forEach(([x, y, sx, sy], i) =>
      kids.push(el('g', { 'data-corner': i, transform: `translate(${n1(x)} ${n1(y)}) scale(${sx} ${sy})` }, fan.kids)));

    // a row of flowers
    const bannerTop = fy + fh * 0.76, medBottom = cy + R * 1.1;
    const spacing = (fw * 0.62) / Math.max(1, flowers - 1), fy2 = (medBottom + bannerTop) / 2, fr2 = Math.min(spacing * 0.46, (bannerTop - medBottom) * 0.36);     // flowers sit midway and never overlap each other or the banner
    const row = el('g', { id: 'flowers' });
    for (let i = 0; i < flowers; i++) {
      const x = cx + (i - (flowers - 1) / 2) * spacing, g = el('g', { 'data-x': n1(x) });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.kids.push(circle(x + Math.cos(a) * fr2 * 0.62, fy2 + Math.sin(a) * fr2 * 0.62, fr2 * 0.42, p.petals[(k + i) % 2 === 0 ? 1 : 0], p, 3 * u)); }
      g.kids.push(circle(x, fy2, fr2 * 0.34, p.accent, p, 3 * u));
      row.kids.push(g);
    }
    kids.push(row);

    // the lettering banner
    const bw = fw * 0.86, bh = fh * 0.12, bx = cx - bw / 2, by = bannerTop, tail = bh * 0.38, notch = bh * 0.3;
    const banner = fr(3);
    kids.push(path(`M${n1(bx)},${n1(by)} H${n1(bx + bw)} L${n1(bx + bw + tail)},${n1(by + bh / 2)} L${n1(bx + bw)},${n1(by + bh)} H${n1(bx)} L${n1(bx - tail)},${n1(by + bh / 2)} Z`, banner, p, 7 * u));
    kids.push(path(`M${n1(bx + notch)},${n1(by + bh * 0.12)} H${n1(bx + bw - notch)} M${n1(bx + notch)},${n1(by + bh * 0.88)} H${n1(bx + bw - notch)}`, 'none', p, 3 * u));
    const fs = Math.max(24, Math.min(bh * 0.72, (bw * 0.9) / (Math.max(3, text.length) * 0.66)));
    const ink = readable(banner, p), halo = ink === p.light ? p.dark : p.light;
    const rtl = /[֐-ࣿ]/.test(text);
    const txtAttr = { x: cx, y: by + bh / 2 + fs * 0.34, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 900, 'font-family': "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Segoe UI','Arial Black','Impact',sans-serif", 'paint-order': 'stroke', 'stroke-linejoin': 'round' };
    if (rtl) txtAttr.direction = 'rtl';
    kids.push(el('text', Object.assign({}, txtAttr, { x: cx + fs * 0.05, y: txtAttr.y + fs * 0.06, fill: p.dark, stroke: p.dark, 'stroke-width': fs * 0.1 }), [text]));
    kids.push(el('text', Object.assign({ id: 'title' }, txtAttr, { fill: ink, stroke: halo, 'stroke-width': fs * 0.07 }), [text]));
    if (sub) {
      const sfs = Math.max(18, Math.min(bh * 0.34, (bw * 0.9) / (Math.max(6, sub.length) * 0.58)));
      kids.push(el('text', Object.assign({}, txtAttr, { id: 'sub', y: by + bh + sfs * 1.6, 'font-size': sfs, 'font-weight': 700, fill: readable(p.bg, p), stroke: 'none', 'stroke-width': 0, 'paint-order': 'normal' }), [sub]));
    }
    meta.layout = { medBottom, flowerTop: fy2 - fr2 * 1.04, flowerBottom: fy2 + fr2 * 1.04, bannerTop };
    meta.textColor = ink; meta.bannerColor = banner; meta.contrast = Math.round(contrast(banner, ink) * 100) / 100;
    return { svg: ser(scene), width: W, height: H, meta, scene };
  }

  const api = { generate, rng, PALETTES, FORMATS, contrast, lum, esc, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chamak = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
