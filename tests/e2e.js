// End-to-end tests (Playwright + Chromium) against a local static server.
// Usage:  npm i playwright && npx playwright install chromium   (outside the repo is fine)
//         python3 -m http.server 8765 &   then   EA_URL=http://localhost:8765/ node tests/e2e.js
//         SHOTS=1 also writes screenshots/ (desktop + mobile).
'use strict';
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { chromium } = pw;
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const URL0 = process.env.EA_URL || 'http://localhost:8765/';
const SHOTS = !!process.env.SHOTS;
let passes = 0, failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? passes++ : failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function download(page, sel) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(sel)]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
}
const doc = page => page.evaluate(() => EclairageAtelier.doc());
const count = async page => (await doc(page)).items.length;
const sel = async page => { const d = await doc(page); const id = await page.evaluate(() => EclairageAtelier.selected()); return d.items.find(i => i.id === id); };
const scr = (page, x, y) => page.evaluate(([x, y]) => EclairageAtelier.toScreen(x, y), [x, y]);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(width, height, mobile, scheme) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, acceptDownloads: true, deviceScaleFactor: mobile ? 2 : 1, colorScheme: scheme || 'dark' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    return { ctx, page };
  }

  /* ================= desktop 1440×900 ================= */
  const { ctx, page } = await newPage(1440, 900);
  await page.goto(URL0);
  await page.waitForSelector('#lItems .item');
  ok((await page.textContent('#paletteTitle')).trim() === 'Éléments', 'French by default');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme follows system');
  ok(await count(page) === 10, 'interview preset shown on first visit (10 items)');
  ok(await page.locator('#lItems .item').count() === 10, '10 items drawn');
  ok(/3:1/.test(await page.textContent('#ratio')), 'ratio readout 3:1');
  ok(/Caméra/.test(await page.textContent('#gear')), 'gear list lists the camera');
  if (SHOTS) await page.screenshot({ path: path.join(ROOT, 'screenshots/desktop.png') });

  // Drag a Fresnel from the palette onto the stage at (2 m, 6 m)
  const n0 = await count(page);
  const fres = page.locator('.pitem[data-type="light"][data-kind="fresnel"]');
  const fb = await fres.boundingBox();
  const target = await scr(page, 2, 6);
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb.x + 60, fb.y + 20, { steps: 4 });
  ok(await page.locator('#ghost.show').count() === 1, 'drag ghost shown');
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  let s = await sel(page);
  ok(await count(page) === n0 + 1 && s && s.type === 'light' && s.kind === 'fresnel', 'drag-and-drop adds a Fresnel');
  ok(Math.abs(s.x - 2) < 0.01 && Math.abs(s.y - 6) < 0.01, `dropped at the pointer, snapped (${s.x}, ${s.y})`);
  ok(await page.locator('#props input[data-k="intensity"]').count() === 1, 'properties panel shows the light');

  // Click palette = add at centre
  await page.click('.pitem[data-type="camera"]');
  s = await sel(page);
  ok(await count(page) === n0 + 2 && s.type === 'camera', 'click on palette adds a camera');
  ok(/°/.test(await page.textContent('[data-ro="fov"]')), 'camera FOV readout');
  await page.fill('#props input[data-k="focal"]', '85');
  await page.dispatchEvent('#props input[data-k="focal"]', 'change');
  s = await sel(page);
  ok(s.focal === 85 && /23\.9°/.test(await page.textContent('[data-ro="fov"]')), 'focal 85 mm FF → 23.9°');
  await page.selectOption('#props select[data-k="sensor"]', 'mft');
  ok((await sel(page)).sensor === 'mft', 'sensor changed to MFT');

  // Move the camera by dragging it
  let before = await sel(page);
  let p0 = await scr(page, before.x, before.y);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  let p1 = await scr(page, before.x + 1.5, before.y + 0.5);
  await page.mouse.move(p1.x, p1.y, { steps: 6 }); await page.mouse.up();
  let after = await sel(page);
  ok(Math.abs(after.x - (before.x + 1.5)) < 0.26 && Math.abs(after.y - (before.y + 0.5)) < 0.26, `drag moves item (${before.x},${before.y} → ${after.x},${after.y})`);

  // Rotate with the handle
  const hb = await page.locator('#lOverlay .rot-handle').boundingBox();
  ok(!!hb, 'rotation handle visible');
  const c = await scr(page, after.x, after.y);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(c.x, c.y + 120, { steps: 6 }); await page.mouse.up();
  ok((await sel(page)).rot === 90, 'rotate handle → 90° (snapped to 15°)');

  // Keyboard: rotate, nudge, duplicate, delete, undo/redo
  await page.focus('#stage');
  await page.keyboard.press('r');
  ok((await sel(page)).rot === 105, 'R rotates +15°');
  const bx = (await sel(page)).x;
  await page.keyboard.press('ArrowRight');
  ok(Math.abs((await sel(page)).x - (bx + 0.5)) < 1e-6, '→ nudges by one grid step');
  const n1 = await count(page);
  await page.keyboard.press('Control+d');
  ok(await count(page) === n1 + 1, 'Ctrl+D duplicates');
  await page.keyboard.press('Delete');
  ok(await count(page) === n1, 'Delete removes');
  await page.keyboard.press('Control+z');
  ok(await count(page) === n1 + 1, 'Ctrl+Z undoes the delete');
  await page.keyboard.press('Control+z');
  ok(await count(page) === n1, 'Ctrl+Z undoes the duplicate');
  await page.keyboard.press('Control+y');
  ok(await count(page) === n1 + 1, 'Ctrl+Y redoes');
  await page.click('#undoBtn');
  ok(await count(page) === n1, 'undo button');
  await page.click('#redoBtn');
  ok(await count(page) === n1 + 1, 'redo button');

  // Layer order (select the last item by clicking it first)
  ok(await page.evaluate(() => EclairageAtelier.selected()) === null, 'deleted item stays deselected after undo/redo');
  const lastIt = (await doc(page)).items.slice(-1)[0];
  const lp = await scr(page, lastIt.x, lastIt.y);
  await page.mouse.click(lp.x, lp.y);
  const idSel = await page.evaluate(() => EclairageAtelier.selected());
  ok(idSel === lastIt.id, 'click selects the top-most item');
  await page.click('#props [data-act="back"]');
  ok((await doc(page)).items[0].id === idSel, 'send to back');
  await page.click('#props [data-act="forward"]');
  ok((await doc(page)).items[1].id === idSel, 'bring forward');
  await page.click('#props [data-act="front"]');
  let dd = await doc(page);
  ok(dd.items[dd.items.length - 1].id === idSel, 'bring to front');

  // Light properties: select the Fresnel by clicking on it
  const fresItem = (await doc(page)).items.find(i => i.type === 'light' && i.x === 2 && i.y === 6);
  const fp = await scr(page, fresItem.x, fresItem.y);
  await page.mouse.click(fp.x, fp.y);
  ok((await sel(page)).id === fresItem.id, 'click selects an item');
  await page.fill('#props input[data-k="intensity"]', '40');
  await page.dispatchEvent('#props input[data-k="intensity"]', 'input');
  await page.click('#props [data-kelvin="5600"]');
  await page.selectOption('#props select[data-k="role"]', 'fill');
  await page.fill('#props input[data-k="label"]', 'Mon Fresnel');
  await page.dispatchEvent('#props input[data-k="label"]', 'input');
  s = await sel(page);
  ok(s.intensity === 40 && s.kelvin === 5600 && s.role === 'fill' && s.label === 'Mon Fresnel', 'light properties edited');
  ok(/Mon Fresnel/.test(await page.textContent('#lLabels')), 'label drawn on stage');
  ok(/40 %/.test(await page.textContent('#gear')), 'gear list shows intensity');
  await page.selectOption('#props select[data-k="kind"]', 'led');
  s = await sel(page);
  ok(s.kind === 'led' && s.beam === 60, 'changing light type loads its defaults');

  // Clicking empty background deselects
  const empty = await scr(page, 0.3, 0.3);
  await page.mouse.click(empty.x, empty.y);
  ok(await page.evaluate(() => EclairageAtelier.selected()) === null, 'click on background deselects');
  // Pan & zoom
  const v0 = await page.evaluate(() => EclairageAtelier.view());
  await page.mouse.move(empty.x, empty.y); await page.mouse.down(); await page.mouse.move(empty.x + 80, empty.y + 40, { steps: 4 }); await page.mouse.up();
  const v1 = await page.evaluate(() => EclairageAtelier.view());
  ok(Math.abs(v1.tx - v0.tx - 80) < 1 && Math.abs(v1.ty - v0.ty - 40) < 1, 'background drag pans');
  await page.click('#zoomIn');
  ok((await page.evaluate(() => EclairageAtelier.view())).z > v1.z, 'zoom in');
  await page.mouse.move(700, 450); await page.mouse.wheel(0, 300);
  ok((await page.evaluate(() => EclairageAtelier.view())).z < v1.z * 1.25, 'wheel zooms out');
  await page.click('#zoomFit');

  // Languages
  await page.selectOption('#lang', 'en');
  ok((await page.textContent('#paletteTitle')).trim() === 'Elements' && /Camera/.test(await page.textContent('#paletteList')), 'English UI');
  ok(/Gear list/.test(await page.textContent('#gearPanel summary')), 'English panels');
  await page.selectOption('#lang', 'kab');
  ok((await page.textContent('#paletteTitle')).trim() === 'Iferdisen' && /Takamirat/.test(await page.textContent('#paletteList')), 'Taqbaylit UI');
  ok(await page.evaluate(() => document.documentElement.lang) === 'kab', 'html lang=kab');
  await page.selectOption('#lang', 'fr');
  ok((await page.textContent('#paletteTitle')).trim() === 'Éléments', 'back to French');

  // Theme
  await page.click('#themeBtn');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme toggles to light');
  await page.click('#themeBtn');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme toggles back to dark');

  // Presets
  const expect = { interview: 10, rembrandt: 7, night: 9, product: 9, dialogue: 14 };
  for (const id of Object.keys(expect)) {
    await page.selectOption('#presetSel', id);
    const d = await doc(page);
    ok(d.items.length === expect[id] && await page.locator('#lItems .item').count() === expect[id], `preset ${id} loads (${d.items.length} items)`);
    ok(/:1|∞/.test(await page.textContent('#ratio .ratio-big')), `preset ${id} ratio readout`);
  }
  ok(/Dialogue/.test((await doc(page)).title), 'preset sets the title');
  ok(await page.locator('#ratioSubj option').count() === 2, 'two subjects → subject picker');
  const r1 = await page.textContent('#ratio .rv');
  await page.selectOption('#ratioSubj', { index: 1 });
  ok(typeof (await page.textContent('#ratio .rv')) === 'string', `subject picker switches (${r1} → ${await page.textContent('#ratio .rv')})`);
  await page.keyboard.press('Control+z');
  ok((await doc(page)).items.length === expect.product, 'undo restores previous preset');
  await page.keyboard.press('Control+y');

  // Night preset + selected light for the second screenshot
  await page.selectOption('#presetSel', 'night');
  const moon = (await doc(page)).items.find(i => i.type === 'light' && i.kind === 'fresnel');
  await page.evaluate(id => EclairageAtelier.select(id), moon.id);
  if (SHOTS) { await sleep(2600); await page.screenshot({ path: path.join(ROOT, 'screenshots/desktop-night.png') }); }

  // Exports
  const svgF = await download(page, '#svgBtn');
  const svgTxt = svgF.buf.toString('utf8');
  ok(/\.svg$/.test(svgF.name) && /^<\?xml/.test(svgTxt) && /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/.test(svgTxt), `SVG export (${svgF.name}, ${svgF.buf.length} B)`);
  ok((svgTxt.match(/class="item"/g) || []).length === 9, 'SVG contains every item');
  const pngF = await download(page, '#pngBtn');
  const sig = pngF.buf.slice(0, 8).toString('hex');
  const pw2 = pngF.buf.readUInt32BE(16), ph2 = pngF.buf.readUInt32BE(20);
  const sw = Number(svgTxt.match(/width="([\d.]+)"/)[1]);
  ok(sig === '89504e470d0a1a0a' && /@2x\.png$/.test(pngF.name), `PNG export (${pngF.name}, ${pngF.buf.length} B)`);
  ok(pw2 === Math.round(sw * 2) && ph2 > 0, `PNG is 2× (${pw2}×${ph2})`);
  const jsonF = await download(page, '#jsonBtn');
  const j = JSON.parse(jsonF.buf.toString('utf8'));
  ok(j.app === 'eclairage-atelier' && j.items.length === 9, `JSON export (${jsonF.name})`);
  if (SHOTS) fs.writeFileSync(path.join(os.tmpdir(), 'ea-export.png'), pngF.buf);

  // JSON import (after switching to another preset)
  await page.selectOption('#presetSel', 'rembrandt');
  const tmp = path.join(os.tmpdir(), 'ea-import.json');
  fs.writeFileSync(tmp, JSON.stringify(j));
  await page.setInputFiles('#fileIn', tmp);
  await page.waitForFunction(() => EclairageAtelier.doc().items.length === 9);
  ok(JSON.stringify((await doc(page)).items) === JSON.stringify(j.items), 'JSON import restores the plan');
  const tmpBad = path.join(os.tmpdir(), 'ea-bad.json');
  fs.writeFileSync(tmpBad, '{"bad":true}');
  await page.setInputFiles('#fileIn', tmpBad);
  await sleep(300);
  const toastTxt = await page.textContent('#toast');
  ok((await doc(page)).items.length === 9 && /valid/.test(toastTxt), 'invalid JSON rejected (' + toastTxt + ')');

  // Print sheet
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('#printBtn');
  ok(await page.evaluate(() => window.__printed) === 1, 'print button calls window.print');
  await page.emulateMedia({ media: 'print' });
  ok(await page.locator('#printSheet').isVisible() && !(await page.locator('.layout').isVisible()), 'print stylesheet shows only the sheet');
  ok(/Liste du matériel/.test(await page.textContent('#printSheet')) && await page.locator('#printSheet svg').count() >= 1, 'print sheet has plan + gear list');
  const pdf = await page.pdf({ format: 'A4', landscape: true });
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 5000, `real PDF generated (${pdf.length} B)`);
  if (SHOTS) fs.writeFileSync(path.join(os.tmpdir(), 'ea-print.pdf'), pdf);
  await page.emulateMedia({ media: 'screen' });

  // Persistence
  await page.selectOption('#lang', 'en');
  await sleep(400);
  const beforeReload = await doc(page);
  await page.reload();
  await page.waitForSelector('#lItems .item');
  ok(JSON.stringify((await doc(page)).items) === JSON.stringify(beforeReload.items), 'reload restores the plan from localStorage');
  ok(await page.evaluate(() => EclairageAtelier.lang()) === 'en', 'language remembered');
  await page.selectOption('#lang', 'fr');

  // Help dialog
  await page.click('#helpBtn');
  ok(await page.locator('#helpDlg[open]').count() === 1, 'help opens');
  await page.keyboard.press('Escape');
  ok(await page.locator('#helpDlg[open]').count() === 0, 'help closes with Escape');

  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'desktop: no horizontal overflow');
  await ctx.close();

  /* ================= mobile 390×844 ================= */
  const m = await newPage(390, 844, true, 'light');
  const mp = m.page;
  await mp.goto(URL0);
  await mp.waitForSelector('#lItems .item');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile: no horizontal overflow');
  ok(await mp.evaluate(() => document.documentElement.dataset.theme) === 'light', 'mobile: light theme follows system');
  const stageBox = await mp.locator('#stage').boundingBox();
  ok(stageBox.width >= 380 && stageBox.height >= 320, `mobile: stage is usable (${Math.round(stageBox.width)}×${Math.round(stageBox.height)})`);
  ok(await mp.locator('#gearPanel[open]').count() === 0, 'mobile: secondary panels start collapsed');

  // Tap to add
  const mn0 = await count(mp);
  await mp.tap('.pitem[data-type="subject"]');
  ok(await count(mp) === mn0 + 1, 'mobile: tap on palette adds an item');

  // Touch drag of an item (CDP touch events → pointer events)
  const cdp = await m.ctx.newCDPSession(mp);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  let ms = await sel(mp);
  let a0 = await scr(mp, ms.x, ms.y), a1 = await scr(mp, ms.x + 1, ms.y + 1);
  await touch('touchStart', [a0]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: a0.x + (a1.x - a0.x) * i / 6, y: a0.y + (a1.y - a0.y) * i / 6 }]);
  await touch('touchEnd', []);
  let ms2 = await sel(mp);
  ok(Math.abs(ms2.x - ms.x - 1) < 0.26 && Math.abs(ms2.y - ms.y - 1) < 0.26, `mobile: touch drag moves item (${ms.x},${ms.y} → ${ms2.x},${ms2.y})`);

  // Pinch zoom with two fingers on the background
  const z0 = (await mp.evaluate(() => EclairageAtelier.view())).z;
  const cx = stageBox.x + stageBox.width / 2, cy = stageBox.y + 30;
  await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: cx - 30 - i * 12, y: cy }, { x: cx + 30 + i * 12, y: cy }]);
  await touch('touchEnd', []);
  const z1 = (await mp.evaluate(() => EclairageAtelier.view())).z;
  ok(z1 > z0 * 1.5, `mobile: pinch zooms (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
  await mp.tap('#zoomFit');

  // Drag from the palette with a vertical touch move onto the stage
  const pal = await mp.locator('.pitem[data-type="light"][data-kind="softbox"]').boundingBox();
  const mn1 = await count(mp);
  const dst = { x: stageBox.x + stageBox.width * 0.3, y: stageBox.y + stageBox.height * 0.5 };
  const src = { x: pal.x + pal.width / 2, y: pal.y + pal.height / 2 };
  await touch('touchStart', [src]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: src.x + (dst.x - src.x) * i / 8, y: src.y + (dst.y - src.y) * i / 8 }]);
  await touch('touchEnd', []);
  await sleep(100);
  ms = await sel(mp);
  ok(await count(mp) === mn1 + 1 && ms.kind === 'softbox', 'mobile: touch drag from palette adds a softbox');
  ok(await mp.locator('#propsPanel[open]').count() === 1, 'mobile: properties open on selection');
  if (SHOTS) {
    await sleep(2600);
    await mp.screenshot({ path: path.join(ROOT, 'screenshots/mobile.png') });
    await mp.selectOption('#presetSel', 'dialogue');
    await mp.evaluate(() => { document.getElementById('ratioPanel').open = true; });
    await sleep(2600);
    await mp.screenshot({ path: path.join(ROOT, 'screenshots/mobile-full.png'), fullPage: true });
  }
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile: still no horizontal overflow');
  await m.ctx.close();

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
