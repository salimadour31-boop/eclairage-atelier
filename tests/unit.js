// Unit tests for js/core.js and js/render.js (no dependencies):  node tests/unit.js
'use strict';
const C = require('../js/core.js');
const R = require('../js/render.js');
const I = require('../js/i18n.js');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);

// Optics
ok(near(C.fovDeg(35, 'ff'), 54.432, 0.01), 'FOV 35 mm full frame ≈ 54.4°');
ok(near(C.fovDeg(50, 's35'), 27.95, 0.02), 'FOV 50 mm Super 35 ≈ 28.0°');
ok(C.fovDeg(25, 'mft') < C.fovDeg(25, 'ff'), 'smaller sensor → narrower FOV');
ok(near(C.fovDeg(35, 'unknown'), C.fovDeg(35, 'ff')), 'unknown sensor falls back to FF');

// Colour temperature
const k32 = C.kelvinToRgb(3200), k56 = C.kelvinToRgb(5600), k9 = C.kelvinToRgb(9000);
ok(k32[0] === 255 && k32[2] < k32[1], '3200 K is warm (R max, B < G)');
ok(k9[2] === 255 && k9[0] < 255, '9000 K is cool (B max)');
ok(/^#[0-9a-f]{6}$/.test(C.kelvinToHex(5600)), 'kelvinToHex returns #rrggbb');
ok(k56[0] >= k56[2], '5600 K slightly warm-neutral');

// Inverse-square law
const L = C.createItem('light', 'fresnel', 0, 0, { rot: 0 });
const e1 = C.illuminance(L, 2, 0), e2 = C.illuminance(L, 4, 0);
ok(near(e1 / e2, 4, 1e-9), 'double distance → quarter illuminance');
ok(C.illuminance(L, -2, 0) === 0, 'subject behind a spot gets no light');
ok(C.illuminance(L, 2, 0.3) > 0, 'subject slightly off-axis inside beam is lit');
const L50 = C.createItem('light', 'fresnel', 0, 0, { rot: 0, intensity: 50 });
ok(near(C.illuminance(L50, 2, 0) * 2, e1, 1e-9), '50 % intensity → half the light');
const sun = C.createItem('light', 'sun', 0, 0, { rot: 0 });
ok(near(C.illuminance(sun, 1, 0), C.illuminance(sun, 5, 0)), 'sun / window ignores distance');
const prac = C.createItem('light', 'practical', 0, 0);
ok(C.illuminance(prac, 1, 0) > 0, 'practical lights forward');

// Ratio
const d = C.createDoc();
d.items.push(C.createItem('subject', null, 0, 0));
d.items.push(C.createItem('light', 'led', -2, 0, { rot: 0, role: 'key' }));
d.items.push(C.createItem('light', 'led', 4, 0, { rot: 180, role: 'fill' }));
const r = C.lightingAt(d, d.items[0]);
ok(near(r.ratio, 4, 1e-9), 'same lights at 2 m and 4 m → 4:1');
ok(near(r.stops, 2, 1e-9), '4:1 = 2 stops');
ok(C.formatRatio(4) === '4:1' && C.formatRatio(Infinity) === '∞' && C.formatRatio(2.46) === '2.5:1', 'formatRatio');
d.items.push(C.createItem('modifier', 'bounce', 1, 0, { rot: 180 }));
const rb = C.lightingAt(d, d.items[0]);
ok(rb.fill > r.fill, 'reflector facing the subject adds fill');
d.items[3].rot = 0;
ok(near(C.lightingAt(d, d.items[0]).fill, r.fill), 'reflector facing away adds nothing');

// Gear list
const g = C.createDoc();
g.items.push(C.createItem('light', 'fresnel', 0, 0, { intensity: 80 }));
g.items.push(C.createItem('light', 'fresnel', 1, 0, { intensity: 40 }));
g.items.push(C.createItem('light', 'fresnel', 2, 0, { kelvin: 5600 }));
g.items.push(C.createItem('camera', null, 0, 0));
g.items.push(C.createItem('note', null, 0, 0));
const gl = C.gearList(g);
ok(gl[0].type === 'camera', 'gear list: camera first');
const fr = gl.filter(x => x.type === 'light');
ok(fr.length === 2 && fr[0].count === 2 && fr[0].intensities.join() === '80,40', 'lights grouped by kind + K + power');
ok(!gl.some(x => x.type === 'note'), 'notes not in gear list');
ok(C.totalWatts(g) === 1950, 'total watts');

// Presets
C.PRESET_IDS.forEach(id => {
  const p = C.PRESETS[id]();
  const s = p.items.find(i => i.type === 'subject');
  const res = s && C.lightingAt(p, s);
  ok(p.items.length >= 6 && s && res.key > 0, 'preset ' + id + ' has a subject lit by a key');
  ok(JSON.stringify(C.sanitizeDoc(JSON.parse(JSON.stringify(p)))) === JSON.stringify(C.sanitizeDoc(p)), 'preset ' + id + ' round-trips');
  ok(p.items.every(i => i.x >= 0 && i.y >= 0 && i.x <= p.stage.w && i.y <= p.stage.h), 'preset ' + id + ' fits on the stage');
});
const iv = C.PRESETS.interview();
ok(C.formatRatio(C.lightingAt(iv, iv.items.find(i => i.type === 'subject')).ratio) === '3:1', 'interview preset ≈ 3:1');

// Validation
let threw = false; try { C.sanitizeDoc('{"nope":1}'); } catch (e) { threw = true; }
ok(threw, 'sanitizeDoc rejects a document without items');
threw = false; try { C.sanitizeDoc('not json'); } catch (e) { threw = true; }
ok(threw, 'sanitizeDoc rejects invalid JSON');
const bad = C.sanitizeDoc({ items: [{ type: 'light', kind: 'zzz', x: 'a', intensity: 999, kelvin: 1, role: 'hack', label: '<b>' }, { type: 'evil' }, { type: 'note', text: 42 }], grid: 7, stage: { w: 1e9 } });
ok(bad.items.length === 2, 'unknown types dropped');
ok(bad.items[0].kind === 'fresnel' && bad.items[0].intensity === 100 && bad.items[0].kelvin === 1000 && bad.items[0].role === 'key', 'values clamped / defaulted');
ok(bad.grid === 0.5 && bad.stage.w === 200, 'grid and stage sanitized');
ok(bad.items[1].text === '', 'non-string note text emptied');
const dup = C.sanitizeDoc({ items: [{ type: 'subject', id: 'a' }, { type: 'subject', id: 'a' }] });
ok(dup.items[0].id !== dup.items[1].id, 'duplicate ids repaired');

// History
const h = new C.History(3), a = C.createDoc();
h.reset(a); a.title = '1'; h.push(a); a.title = '2'; h.push(a);
ok(!h.push(a), 'identical snapshot not pushed');
ok(h.undo().title === '1' && h.undo().title === '' && !h.canUndo(), 'undo walks back');
ok(h.redo().title === '1', 'redo');
a.title = 'x'; h.push(a); ok(!h.canRedo(), 'push clears redo');
a.title = 'y'; h.push(a); a.title = 'z'; h.push(a); ok(h.stack.length === 3, 'history limit');

// Renderer
const svg = R.exportSvg(C.PRESETS.dialogue(), { palette: 'light' });
ok(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/.test(svg), 'export SVG has size');
ok((svg.match(/class="item"/g) || []).length === C.PRESETS.dialogue().items.length, 'every item drawn');
const xss = C.createDoc(); xss.title = '<script>'; xss.items.push(C.createItem('note', null, 1, 1, { text: '</text><script>alert(1)</script>' }));
ok(!/<script>/.test(R.exportSvg(xss)), 'text is escaped in SVG');
C.PALETTE.forEach(p => ok(/<svg viewBox/.test(R.paletteIcon(p[0], p[1], 'dark')), 'palette icon ' + p.join(':')));

// i18n parity
const keys = o => Object.keys(o).sort().join();
['en', 'kab'].forEach(l => {
  ok(keys(I.STR.fr) === keys(I.STR[l]), 'i18n ' + l + ' has every key');
  Object.keys(I.STR.fr).forEach(k => { if (typeof I.STR.fr[k] === 'object') ok(keys(I.STR.fr[k]) === keys(I.STR[l][k]), 'i18n ' + l + '.' + k); });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
