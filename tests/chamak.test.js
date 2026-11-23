const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/chamak.js');

const gen = (o) => C.generate(Object.assign({ seed: 7, text: 'Siraj', sub: 'Karachi' }, o));

// a minimal well-formedness check: tags balance, attributes are quoted, no stray < or &
function wellFormed(svg) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let m, pos = 0;
  while ((m = re.exec(svg))) {
    if (m.index !== pos) return false;                            // something the tokenizer could not read
    pos = re.lastIndex;
    if (m[5] !== undefined) { if (/&(?!amp;|lt;|gt;|quot;|#39;)/.test(m[5]) || /</.test(m[5])) return false; continue; }
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]);
  }
  return pos === svg.length && stack.length === 0;
}

test('the same seed gives the identical poster; a different seed does not', () => {
  assert.strictEqual(gen({ seed: 42 }).svg, gen({ seed: 42 }).svg);
  assert.notStrictEqual(gen({ seed: 42 }).svg, gen({ seed: 43 }).svg);
});

test('every palette and format produces well-formed SVG of the right size', () => {
  for (const pal of Object.keys(C.PALETTES)) for (const [f, [w, h]] of Object.entries(C.FORMATS)) {
    const g = gen({ palette: pal, format: f });
    assert.strictEqual(g.width, w); assert.strictEqual(g.height, h);
    assert.ok(wellFormed(g.svg), `${pal}/${f}`);
    assert.ok(g.svg.length < 600000, `${pal}/${f} is ${g.svg.length} bytes`);
  }
});

test('user text can never inject markup', () => {
  const evil = '</text><script>alert(1)</script><img src=x onerror=1> & "quotes" \'single\'';
  const g = gen({ text: evil, sub: evil });
  assert.ok(wellFormed(g.svg));
  assert.ok(!/<script/i.test(g.svg) && !/<img/i.test(g.svg));
  assert.ok(g.svg.includes('&lt;script&gt;'));
});

test('control characters are removed and length is capped', () => {
  const g = gen({ text: 'a\u0000b\u0001c' + 'x'.repeat(100) });
  assert.ok(wellFormed(g.svg));
  assert.ok(!/[\u0000-\u0008]/.test(g.svg));
  const title = g.svg.match(/<text id="title"[^>]*>([^<]*)</)[1];
  assert.ok(title.length <= 40, title.length);
});

test('empty text falls back to a default', () => {
  assert.match(gen({ text: '   ', sub: '' }).svg, />CHAMAK</);
});

test('urdu text is right-to-left and well formed', () => {
  const g = gen({ text: 'پاکستان زنداباد' });
  assert.ok(wellFormed(g.svg));
  assert.match(g.svg, /direction="rtl"/);
});

test('lettering is always readable on its banner (WCAG contrast of at least 4.5)', () => {
  for (const pal of Object.keys(C.PALETTES)) for (let s = 1; s <= 30; s++) {
    const g = gen({ palette: pal, seed: s });
    assert.ok(g.meta.contrast >= 4.5, `${pal} seed ${s}: ${g.meta.contrast} on ${g.meta.bannerColor}`);
  }
});

test('the medallion petals are evenly spaced around the circle', () => {
  for (const n of [8, 10, 12, 14, 16]) {
    const g = gen({ petals: n });
    const find = (node, id) => (node.attrs && node.attrs.id === id ? node : node.kids.map((k) => (typeof k === 'string' ? null : find(k, id))).find(Boolean));
    const ring = find(g.scene, 'ring1');
    const degs = ring.kids.map((k) => parseFloat(k.attrs['data-deg']));
    assert.strictEqual(degs.length, n);
    degs.forEach((d, i) => assert.ok(Math.abs(d - (i * 360) / n) < 0.11, `${n} petals, petal ${i}: ${d}`));
    const ring2 = find(g.scene, 'ring2').kids.map((k) => parseFloat(k.attrs['data-deg']));
    assert.ok(Math.abs(ring2[0] - 180 / n) < 0.11);                 // the second ring sits between the first ring's petals
  }
});

test('the four corner fans are exact mirror images', () => {
  const g = gen({});
  const corners = g.scene.kids.filter((k) => k.attrs && k.attrs['data-corner'] !== undefined);
  assert.strictEqual(corners.length, 4);
  const sc = corners.map((c) => c.attrs.transform.match(/scale\(([-\d]+) ([-\d]+)\)/).slice(1).map(Number));
  assert.deepStrictEqual(sc, [[1, 1], [-1, 1], [1, -1], [-1, -1]]);
  assert.ok(corners.every((c) => c.kids === corners[0].kids));       // the very same shapes, mirrored
});

test('the flower row is symmetric about the centre line', () => {
  for (let s = 1; s <= 12; s++) {
    const g = gen({ seed: s });
    const row = g.scene.kids.find((k) => k.attrs && k.attrs.id === 'flowers');
    const xs = row.kids.map((k) => parseFloat(k.attrs['data-x']));
    xs.forEach((x, i) => assert.ok(Math.abs(x - g.width / 2 + (xs[xs.length - 1 - i] - g.width / 2)) < 0.3, `seed ${s}`));
  }
});

test('density and petals options are clamped, unknown values fall back', () => {
  assert.ok(wellFormed(gen({ density: 99 }).svg));
  assert.ok(wellFormed(gen({ density: -3 }).svg));
  assert.strictEqual(gen({ petals: 7 }).meta.petals === 7, false);
  assert.strictEqual(gen({ palette: 'nope' }).meta.palette, 'classic');
  assert.strictEqual(gen({ format: 'nope' }).width, 1200);
  assert.ok(wellFormed(C.generate({}).svg));
  assert.ok(wellFormed(C.generate().svg));
});

test('seeds that are zero, negative or huge still work', () => {
  for (const seed of [0, -5, 2 ** 40, 4294967295]) assert.ok(wellFormed(gen({ seed }).svg), String(seed));
});

test('generation is fast', () => {
  const t0 = Date.now();
  for (let s = 1; s <= 20; s++) gen({ seed: s, format: 'phone' });
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms for 20 posters`);
});

test('the vocabulary is varied: many seeds make many different layouts', () => {
  const sigs = new Set();
  for (let s = 1; s <= 60; s++) { const m = gen({ seed: s }).meta; sigs.add([m.petals, m.lattice, m.band2, m.flowers].join('/')); }
  assert.ok(sigs.size >= 20, `only ${sigs.size} distinct layouts in 60 seeds`);
});
