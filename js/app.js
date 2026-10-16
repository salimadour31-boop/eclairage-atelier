/*
 * Éclairage Atelier — user interface.
 * Stage (SVG, zoom / pan / pinch), palette drag-and-drop, selection, move,
 * rotate, properties panel, undo / redo, gear list, key:fill readout,
 * presets, exports (SVG, PNG 2×, JSON, print / PDF), autosave, i18n, theme.
 *
 * MIT License — © 2026 Amirouche Amwanes (salimadour31-boop)
 */
(function () {
  'use strict';
  var C = window.EACore, R = window.EARender, I = window.EAI18N;
  var S = R.S;
  var LS_DOC = 'eclairage-atelier:doc', LS_LANG = 'eclairage-atelier:lang', LS_THEME = 'eclairage-atelier:theme';

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */
  var doc = C.createDoc();
  var selId = null;
  var view = { z: 1, tx: 40, ty: 40 };
  var hist = new C.History(200);
  var lang = 'fr', theme = 'dark';
  var ratioSubjectId = null;

  var $ = function (id) { return document.getElementById(id); };
  var svg = $('stage');

  function t(key) {
    var s = I.STR[lang] || I.STR.fr;
    return (s[key] !== undefined) ? s[key] : (I.STR.fr[key] !== undefined ? I.STR.fr[key] : key);
  }
  function tt(group, key) { var g = t(group); return (g && g[key]) || key; }
  function findItem(id) { for (var i = 0; i < doc.items.length; i++) if (doc.items[i].id === id) return doc.items[i]; return null; }
  function indexOf(id) { for (var i = 0; i < doc.items.length; i++) if (doc.items[i].id === id) return i; return -1; }

  /** Human name of an item type/kind. */
  function typeName(it) {
    if (it.type === 'light') return tt('lights', it.kind);
    if (it.type === 'modifier') return tt('mods', it.kind);
    if (it.type === 'set') return tt('sets', it.kind);
    return tt('types', it.type);
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                              */
  /* ------------------------------------------------------------------ */
  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ------------------------------------------------------------------ */
  /* Persistence & history                                              */
  /* ------------------------------------------------------------------ */
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_DOC, JSON.stringify(doc)); } catch (e) { toast(t('tStorage')); }
    }, 150);
  }
  /** Record the current document as an undo step (no-op if unchanged). */
  function commit() { hist.push(doc); save(); updateUndoButtons(); }
  var commitTimer = 0;
  function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 450); }
  function flushCommit() { if (commitTimer) { clearTimeout(commitTimer); commitTimer = 0; commit(); } }

  function updateUndoButtons() {
    $('undoBtn').disabled = !hist.canUndo();
    $('redoBtn').disabled = !hist.canRedo();
  }
  function undo() {
    flushCommit();
    var d = hist.undo();
    if (!d) { toast(t('tNothing')); return; }
    doc = d; if (!findItem(selId)) selId = null;
    save(); renderAll(); updateUndoButtons();
  }
  function redo() {
    var d = hist.redo();
    if (!d) { toast(t('tNothingRedo')); return; }
    doc = d; if (!findItem(selId)) selId = null;
    save(); renderAll(); updateUndoButtons();
  }

  /* ------------------------------------------------------------------ */
  /* View transform                                                     */
  /* ------------------------------------------------------------------ */
  function applyView() {
    $('viewport').setAttribute('transform', 'translate(' + view.tx.toFixed(2) + ' ' + view.ty.toFixed(2) + ') scale(' + view.z.toFixed(4) + ')');
    $('zoomVal').textContent = Math.round(view.z * 100) + ' %';
  }
  /** Client point → world metres. */
  function toWorld(clientX, clientY) {
    var r = svg.getBoundingClientRect();
    return { x: ((clientX - r.left) - view.tx) / view.z / S, y: ((clientY - r.top) - view.ty) / view.z / S };
  }
  function zoomAt(factor, cx, cy) {
    var r = svg.getBoundingClientRect();
    if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    var nz = C.clamp(view.z * factor, 0.15, 6);
    var px = cx - r.left, py = cy - r.top;
    view.tx = px - (px - view.tx) * (nz / view.z);
    view.ty = py - (py - view.ty) * (nz / view.z);
    view.z = nz;
    applyView(); renderOverlay();
  }
  function fitView() {
    var r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var W = doc.stage.w * S, H = doc.stage.h * S, pad = 36;
    view.z = C.clamp(Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H), 0.15, 6);
    view.tx = (r.width - W * view.z) / 2;
    view.ty = (r.height - H * view.z) / 2 + 6;
    applyView(); renderOverlay();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function labelFor(it) { return it.label; }
  function renderStage() {
    var L = R.stageLayers(doc, { palette: theme, selectedId: selId, zoom: view.z, interactive: true, labelFor: labelFor, idPrefix: 'st' });
    $('stageDefs').innerHTML = L.defs;
    $('lGrid').innerHTML = L.grid;
    $('lBeams').innerHTML = L.beams;
    $('lItems').innerHTML = L.items;
    $('lLabels').innerHTML = L.labels;
    $('lOverlay').innerHTML = L.overlay;
    svg.style.background = R.PALETTES[theme].bg;
  }
  function renderOverlay() {
    var L = R.stageLayers({ stage: doc.stage, show: { grid: false, beams: false, fov: false, labels: false }, items: doc.items }, { palette: theme, selectedId: selId, zoom: view.z });
    $('lOverlay').innerHTML = L.overlay;
  }
  /** Everything that depends on the document, except the properties form. */
  function renderLive() { renderStage(); renderGear(); renderRatio(); }
  function renderAll() { renderLive(); renderProps(); syncPlanForm(); }

  /* ------------------------------------------------------------------ */
  /* Palette                                                            */
  /* ------------------------------------------------------------------ */
  var GROUPS = [
    ['grpCamera', function (p) { return p[0] === 'camera' || p[0] === 'subject'; }],
    ['grpLights', function (p) { return p[0] === 'light'; }],
    ['grpMods', function (p) { return p[0] === 'modifier'; }],
    ['grpSet', function (p) { return p[0] === 'set'; }],
    ['grpMove', function (p) { return p[0] === 'track' || p[0] === 'arrow' || p[0] === 'note'; }]
  ];
  function paletteName(type, kind) {
    if (type === 'light') return tt('lights', kind);
    if (type === 'modifier') return tt('mods', kind);
    if (type === 'set') return tt('sets', kind);
    return tt('types', type);
  }
  function buildPalette() {
    var box = $('paletteList'), html = '';
    GROUPS.forEach(function (g) {
      html += '<div class="pgroup"><h3>' + R.esc(t(g[0])) + '</h3><div class="pgrid">';
      C.PALETTE.filter(g[1]).forEach(function (p) {
        var name = paletteName(p[0], p[1]);
        html += '<button type="button" class="pitem" data-type="' + p[0] + '" data-kind="' + (p[1] || '') + '" title="' + R.esc(name) + '">' +
          R.paletteIcon(p[0], p[1], theme) + '<span>' + R.esc(name) + '</span></button>';
      });
      html += '</div></div>';
    });
    box.innerHTML = html;
  }

  /** Add an item of the palette type at world position (metres). */
  function addItem(type, kind, x, y) {
    var extra = {};
    if (type === 'note') extra.text = t('noteDefault');
    var it = C.createItem(type, kind || null, x, y, extra);
    if (doc.snap) { it.x = C.snap(it.x, doc.grid); it.y = C.snap(it.y, doc.grid); }
    it.x = C.round(it.x, 3); it.y = C.round(it.y, 3);
    doc.items.push(it);
    selId = it.id;
    commit(); renderAll();
    toast(t('tAdded') + ' : ' + typeName(it));
    return it;
  }

  // Pointer-based drag from the palette (works with mouse, pen and touch).
  var pdrag = null;
  function onPalettePointerDown(e) {
    var btn = e.target.closest('.pitem');
    if (!btn || e.button > 0) return;
    pdrag = { btn: btn, x0: e.clientX, y0: e.clientY, active: false, id: e.pointerId, type: btn.dataset.type, kind: btn.dataset.kind || null };
  }
  function onPalettePointerMove(e) {
    if (!pdrag || e.pointerId !== pdrag.id) return;
    var dx = e.clientX - pdrag.x0, dy = e.clientY - pdrag.y0;
    if (!pdrag.active) {
      // On touch, a move along the palette's own scroll axis scrolls it;
      // a move across that axis (towards the stage) starts a drag.
      var touch = e.pointerType === 'touch';
      if (Math.hypot(dx, dy) < 8) return;
      var strip = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
      if (touch && (strip ? Math.abs(dx) > Math.abs(dy) : Math.abs(dy) > Math.abs(dx))) { pdrag = null; return; }
      pdrag.active = true;
      try { pdrag.btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      var g = $('ghost');
      g.innerHTML = pdrag.btn.querySelector('svg').outerHTML;
      g.classList.add('show');
    }
    e.preventDefault();
    var gh = $('ghost');
    gh.style.transform = 'translate(' + (e.clientX - 28) + 'px,' + (e.clientY - 28) + 'px)';
    var r = svg.getBoundingClientRect();
    var over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    svg.classList.toggle('drop-target', over);
  }
  function onPalettePointerUp(e) {
    if (!pdrag || e.pointerId !== pdrag.id) return;
    var d = pdrag; pdrag = null;
    $('ghost').classList.remove('show');
    svg.classList.remove('drop-target');
    if (d.active) {
      var r = svg.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        var w = toWorld(e.clientX, e.clientY);
        addItem(d.type, d.kind, w.x, w.y);
      }
      d.btn.dataset.dragged = '1';
    }
  }
  function onPaletteClick(e) {
    var btn = e.target.closest('.pitem');
    if (!btn) return;
    if (btn.dataset.dragged) { delete btn.dataset.dragged; return; }
    // add at the centre of the visible stage area
    var r = svg.getBoundingClientRect();
    var w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    w.x = C.clamp(w.x, 0.3, doc.stage.w - 0.3); w.y = C.clamp(w.y, 0.3, doc.stage.h - 0.3);
    // offset successive additions a little so they do not pile up exactly
    var n = doc.items.length % 5;
    addItem(btn.dataset.type, btn.dataset.kind || null, w.x + n * 0.25 - 0.5, w.y + n * 0.25 - 0.5);
  }

  /* ------------------------------------------------------------------ */
  /* Stage interaction                                                  */
  /* ------------------------------------------------------------------ */
  var pointers = {}, act = null;
  function onStageDown(e) {
    if (e.button > 1) return;
    svg.focus({ preventScroll: true });
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      // pinch zoom with two fingers: cancels any ongoing move
      if (act && act.moved && act.mode !== 'pan') commit();
      var a = pointers[ids[0]], b = pointers[ids[1]];
      act = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.z, tx0: view.tx, ty0: view.ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    var w = toWorld(e.clientX, e.clientY);
    var handle = e.target.closest('[data-handle]');
    var g = e.target.closest('[data-id]');
    if (handle && selId) {
      act = { mode: 'rotate', id: selId, moved: false };
    } else if (g && e.button === 0) {
      var it = findItem(g.getAttribute('data-id'));
      if (!it) return;
      if (selId !== it.id) { selId = it.id; renderStage(); renderProps(); renderRatio(); }
      act = { mode: 'move', id: it.id, ox: w.x - it.x, oy: w.y - it.y, x0: e.clientX, y0: e.clientY, moved: false };
    } else {
      act = { mode: 'pan', x0: e.clientX, y0: e.clientY, tx0: view.tx, ty0: view.ty, moved: false };
    }
    e.preventDefault();
  }
  function onStageMove(e) {
    var w = toWorld(e.clientX, e.clientY);
    $('cursorPos').textContent = 'x ' + w.x.toFixed(2) + ' m · y ' + w.y.toFixed(2) + ' m';
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!act) return;
    e.preventDefault();
    if (act.mode === 'pinch') {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y), r = svg.getBoundingClientRect();
      var nz = C.clamp(act.z0 * d / Math.max(1, act.d0), 0.15, 6);
      var mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, m0x = act.mx - r.left, m0y = act.my - r.top;
      view.tx = mx - (m0x - act.tx0) * (nz / act.z0);
      view.ty = my - (m0y - act.ty0) * (nz / act.z0);
      view.z = nz; applyView(); renderOverlay();
      return;
    }
    if (act.mode === 'pan') {
      var dx = e.clientX - act.x0, dy = e.clientY - act.y0;
      if (Math.hypot(dx, dy) > 3) act.moved = true;
      view.tx = act.tx0 + dx; view.ty = act.ty0 + dy; applyView();
      return;
    }
    var it = findItem(act.id); if (!it) return;
    if (act.mode === 'move') {
      if (!act.moved && Math.hypot(e.clientX - act.x0, e.clientY - act.y0) < 3) return;
      act.moved = true;
      var nx = w.x - act.ox, ny = w.y - act.oy;
      if (doc.snap && !e.altKey) { nx = C.snap(nx, doc.grid); ny = C.snap(ny, doc.grid); }
      it.x = C.round(nx, 3); it.y = C.round(ny, 3);
    } else if (act.mode === 'rotate') {
      act.moved = true;
      var ang = Math.atan2(w.y - it.y, w.x - it.x) * 180 / Math.PI;
      if (doc.snap && !e.altKey && !e.shiftKey) ang = Math.round(ang / 15) * 15;
      it.rot = C.round(C.normDeg(ang), 1);
    }
    renderLive(); syncPropsValues();
  }
  function onStageUp(e) {
    delete pointers[e.pointerId];
    if (!act) return;
    if (act.mode === 'pinch') { if (Object.keys(pointers).length === 0) act = null; else act = { mode: 'none' }; return; }
    if (act.mode === 'pan' && !act.moved && e.type === 'pointerup') {
      if (selId) { selId = null; renderStage(); renderProps(); renderRatio(); }
    }
    if ((act.mode === 'move' || act.mode === 'rotate') && act.moved) { commit(); renderProps(); }
    act = null;
  }
  function onWheel(e) {
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(factor, e.clientX, e.clientY);
  }

  /* ------------------------------------------------------------------ */
  /* Item operations                                                    */
  /* ------------------------------------------------------------------ */
  function deleteSel() {
    var i = indexOf(selId); if (i < 0) return;
    var name = typeName(doc.items[i]);
    doc.items.splice(i, 1); selId = null;
    commit(); renderAll(); toast(t('tDeleted') + ' : ' + name);
  }
  function duplicateSel() {
    var it = findItem(selId); if (!it) return;
    var c = C.clone(it); c.id = C.uid();
    var off = Math.max(doc.grid, 0.25);
    c.x = C.round(c.x + off, 3); c.y = C.round(c.y + off, 3);
    doc.items.splice(indexOf(it.id) + 1, 0, c);
    selId = c.id; commit(); renderAll(); toast(t('tDup'));
  }
  function reorder(where) {
    var i = indexOf(selId); if (i < 0) return;
    var it = doc.items.splice(i, 1)[0], j;
    if (where === 'front') j = doc.items.length;
    else if (where === 'back') j = 0;
    else if (where === 'forward') j = Math.min(doc.items.length, i + 1);
    else j = Math.max(0, i - 1);
    doc.items.splice(j, 0, it);
    commit(); renderAll();
  }
  function rotateSel(d) {
    var it = findItem(selId); if (!it) return;
    it.rot = C.round(C.normDeg((it.rot || 0) + d), 1);
    commitSoon(); renderLive(); syncPropsValues();
  }
  function nudge(dx, dy) {
    var it = findItem(selId); if (!it) return;
    it.x = C.round(it.x + dx, 3); it.y = C.round(it.y + dy, 3);
    commitSoon(); renderLive(); syncPropsValues();
  }

  /* ------------------------------------------------------------------ */
  /* Properties panel                                                   */
  /* ------------------------------------------------------------------ */
  function fieldNum(key, label, val, min, max, step, extra) {
    return '<label class="f"><span>' + R.esc(label) + '</span><input type="number" data-k="' + key + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '"' + (extra || '') + '></label>';
  }
  function fieldRange(key, label, val, min, max, step) {
    return '<label class="f wide range"><span>' + R.esc(label) + ' <output data-o="' + key + '">' + val + '</output></span>' +
      '<input type="range" data-k="' + key + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>';
  }
  function fieldSelect(key, label, val, opts) {
    return '<label class="f"><span>' + R.esc(label) + '</span><select data-k="' + key + '">' + opts.map(function (o) {
      return '<option value="' + R.esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + R.esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  function fieldText(key, label, val, wide) {
    return '<label class="f' + (wide ? ' wide' : '') + '"><span>' + R.esc(label) + '</span><input type="text" data-k="' + key + '" value="' + R.esc(val || '') + '" maxlength="120"></label>';
  }
  function fieldColor(key, label, val) {
    return '<label class="f"><span>' + R.esc(label) + '</span><input type="color" data-k="' + key + '" value="' + R.esc(val) + '"></label>';
  }

  function renderProps() {
    var box = $('props'), it = findItem(selId);
    if (!it) { box.innerHTML = '<p class="muted">' + R.esc(t('noSel')) + '</p>'; return; }
    var h = '<div class="props-head">' + R.paletteIcon(it.type, it.kind, theme) + '<strong>' + R.esc(typeName(it)) + '</strong></div><div class="form">';
    if (it.type !== 'note') h += fieldText('label', t('label'), it.label, true);
    h += fieldNum('x', t('posX'), it.x, -1000, 1000, 0.05) + fieldNum('y', t('posY'), it.y, -1000, 1000, 0.05);
    h += fieldNum('rot', t('rot'), it.rot, -360, 720, 1);
    switch (it.type) {
      case 'camera':
        h += fieldNum('focal', t('focal'), it.focal, 4, 1200, 1, ' list="focals"');
        h += fieldSelect('sensor', t('sensor'), it.sensor, Object.keys(C.SENSORS).map(function (k) { return [k, C.SENSORS[k].name]; }));
        h += fieldNum('range', t('range'), it.range, 0.5, 100, 0.1);
        h += '<p class="f wide readout">' + R.esc(t('fovOut')) + ' : <b data-ro="fov">' + C.fovDeg(it.focal, it.sensor).toFixed(1) + '°</b></p>';
        h += '<datalist id="focals"><option value="14"><option value="18"><option value="24"><option value="35"><option value="50"><option value="85"><option value="135"></datalist>';
        break;
      case 'subject':
        h += fieldColor('color', t('color'), it.color);
        break;
      case 'light':
        h += fieldSelect('kind', t('kind'), it.kind, Object.keys(C.LIGHT_KINDS).map(function (k) { return [k, tt('lights', k)]; }));
        h += fieldSelect('role', t('role'), it.role, C.ROLES.map(function (k) { return [k, tt('roles', k)]; }));
        h += fieldRange('intensity', t('intensity'), it.intensity, 0, 100, 1);
        h += fieldRange('kelvin', t('kelvin'), it.kelvin, 1800, 10000, 100);
        h += '<div class="f wide ktint"><i data-ro="ktint" style="background:' + C.kelvinToHex(it.kelvin) + '"></i>' +
          [2700, 3200, 4300, 5600, 6500].map(function (k) { return '<button type="button" class="chip" data-kelvin="' + k + '">' + k + '</button>'; }).join('') + '</div>';
        h += fieldNum('beam', t('beamAngle'), it.beam, 1, 360, 1);
        h += fieldNum('power', C.LIGHT_KINDS[it.kind].directional ? t('powerLux') : t('power'), it.power, 0, 200000, it.power >= 1000 ? 50 : 5);
        h += fieldNum('throw', t('throw'), it.throw, 0.2, 100, 0.1);
        if (it.kind === 'tube') h += fieldNum('length', t('length'), it.length, 0.1, 10, 0.1);
        break;
      case 'modifier':
        h += fieldSelect('kind', t('kind'), it.kind, Object.keys(C.MOD_KINDS).map(function (k) { return [k, tt('mods', k)]; }));
        h += fieldNum('w', t('width'), it.w, 0.05, 20, 0.05);
        break;
      case 'set':
        h += fieldSelect('kind', t('kind'), it.kind, Object.keys(C.SET_KINDS).map(function (k) { return [k, tt('sets', k)]; }));
        h += fieldNum('w', t('width'), it.w, 0.05, 100, 0.05) + fieldNum('h', t('depth'), it.h, 0.05, 100, 0.05);
        break;
      case 'track':
        h += fieldNum('length', t('length'), it.length, 0.1, 100, 0.1);
        break;
      case 'arrow':
        h += fieldNum('length', t('length'), it.length, 0.1, 100, 0.1);
        h += fieldRange('bend', t('bend'), it.bend, -1, 1, 0.05);
        h += fieldColor('color', t('color'), it.color);
        break;
      case 'note':
        h += '<label class="f wide"><span>' + R.esc(t('text')) + '</span><textarea data-k="text" rows="3" maxlength="500">' + R.esc(it.text) + '</textarea></label>';
        h += fieldNum('size', t('size'), it.size, 6, 200, 1);
        h += fieldColor('color', t('color'), it.color);
        break;
    }
    h += '</div><div class="actions">' +
      '<button type="button" class="btn" data-act="rotL">↺ 15°</button><button type="button" class="btn" data-act="rotR">↻ 15°</button>' +
      '<button type="button" class="btn" data-act="dup">' + R.esc(t('duplicate')) + '</button>' +
      '<button type="button" class="btn danger" data-act="del">' + R.esc(t('del')) + '</button></div>' +
      '<div class="actions"><span class="tlabel">' + R.esc(t('layer')) + '</span>' +
      '<button type="button" class="btn mini" data-act="back" title="' + R.esc(t('back')) + '" aria-label="' + R.esc(t('back')) + '">⤓</button>' +
      '<button type="button" class="btn mini" data-act="backward" title="' + R.esc(t('backward')) + '" aria-label="' + R.esc(t('backward')) + '">↓</button>' +
      '<button type="button" class="btn mini" data-act="forward" title="' + R.esc(t('forward')) + '" aria-label="' + R.esc(t('forward')) + '">↑</button>' +
      '<button type="button" class="btn mini" data-act="front" title="' + R.esc(t('front')) + '" aria-label="' + R.esc(t('front')) + '">⤒</button></div>';
    box.innerHTML = h;
    $('propsPanel').open = true;
  }

  /** Refresh the values shown in the form without rebuilding it (during drags). */
  function syncPropsValues() {
    var it = findItem(selId); if (!it) return;
    var box = $('props');
    ['x', 'y', 'rot'].forEach(function (k) {
      var el = box.querySelector('[data-k="' + k + '"]');
      if (el && document.activeElement !== el) el.value = it[k];
    });
  }

  function onPropInput(e) {
    var el = e.target, key = el.getAttribute('data-k');
    var it = findItem(selId);
    if (!key || !it) return;
    var v = el.value;
    if (el.type === 'number' || el.type === 'range') {
      v = Number(v);
      if (!isFinite(v) || el.value === '') return;
      if (key === 'rot') v = C.normDeg(v);
      if (el.min !== '' && key !== 'rot' && key !== 'x' && key !== 'y') v = C.clamp(v, Number(el.min), Number(el.max));
    }
    if (key === 'kind' && it.type === 'light') {
      // switching the light type loads that type's typical values
      var d = C.LIGHT_KINDS[v];
      it.kind = v; it.beam = d.beam; it.power = d.power; it.kelvin = d.kelvin; it.throw = d.throw;
      if (v === 'tube' && !it.length) it.length = 1.2;
      commit(); renderAll(); return;
    }
    if (key === 'kind' && it.type === 'set') {
      var sd = C.SET_KINDS[v]; it.kind = v; it.w = sd.w; it.h = sd.h; commit(); renderAll(); return;
    }
    if (key === 'kind' && it.type === 'modifier') { it.kind = v; commit(); renderAll(); return; }
    it[key] = v;
    var out = $('props').querySelector('[data-o="' + key + '"]'); if (out) out.textContent = v;
    if (key === 'kelvin') { var ti = $('props').querySelector('[data-ro="ktint"]'); if (ti) ti.style.background = C.kelvinToHex(v); }
    if (key === 'focal' || key === 'sensor') { var fo = $('props').querySelector('[data-ro="fov"]'); if (fo) fo.textContent = C.fovDeg(it.focal, it.sensor).toFixed(1) + '°'; }
    if (key === 'sensor' || key === 'role' || el.type === 'color') commit(); else commitSoon();
    renderLive();
  }
  function onPropClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    var it = findItem(selId); if (!it) return;
    if (b.dataset.kelvin) { it.kelvin = Number(b.dataset.kelvin); commit(); renderAll(); return; }
    switch (b.dataset.act) {
      case 'rotL': rotateSel(-15); flushCommit(); break;
      case 'rotR': rotateSel(15); flushCommit(); break;
      case 'dup': duplicateSel(); break;
      case 'del': deleteSel(); break;
      case 'front': case 'back': case 'forward': case 'backward': reorder(b.dataset.act); break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Gear list & ratio                                                  */
  /* ------------------------------------------------------------------ */
  function gearLines() {
    return C.gearList(doc).map(function (g) {
      var name, detail = '';
      if (g.type === 'light') {
        name = tt('lights', g.kind);
        var dir = C.LIGHT_KINDS[g.kind].directional;
        detail = g.kelvin + ' K · ' + g.power + (dir ? ' lx' : ' W') + ' · ' + g.intensities.map(function (v) { return v + ' %'; }).join(', ');
      } else if (g.type === 'camera') {
        name = tt('types', 'camera');
        detail = (C.SENSORS[g.sensor] || {}).name + ' · ' + g.focal + ' mm';
      } else if (g.type === 'modifier') { name = tt('mods', g.kind); detail = g.w + ' m'; }
      else if (g.type === 'set') { name = tt('sets', g.kind); detail = g.w + ' m'; }
      else if (g.type === 'track') { name = tt('types', 'track'); detail = g.length + ' m'; }
      else { name = tt('types', 'subject'); }
      return { count: g.count, name: name, detail: detail, labels: g.labels, type: g.type, kelvin: g.kelvin };
    });
  }
  function gearHtml() {
    var lines = gearLines();
    if (!lines.length) return '<p class="muted">' + R.esc(t('gearEmpty')) + '</p>';
    var h = '<table class="gear"><tbody>';
    lines.forEach(function (l) {
      h += '<tr><td class="n">' + l.count + ' ×</td><td><b>' + R.esc(l.name) + '</b>' +
        (l.type === 'light' ? ' <i class="kdot" style="background:' + C.kelvinToHex(l.kelvin) + '"></i>' : '') +
        (l.detail ? '<br><small>' + R.esc(l.detail) + '</small>' : '') +
        (l.labels.length ? '<br><small class="muted">' + R.esc(l.labels.join(' · ')) + '</small>' : '') + '</td></tr>';
    });
    h += '</tbody></table><p class="total">' + R.esc(t('totalPower')) + ' : <b>' + C.totalWatts(doc) + ' W</b></p>';
    return h;
  }
  function renderGear() { $('gear').innerHTML = gearHtml(); }

  function currentSubject() {
    var subs = doc.items.filter(function (i) { return i.type === 'subject'; });
    var sel = findItem(selId);
    if (sel && sel.type === 'subject') ratioSubjectId = sel.id;
    var s = findItem(ratioSubjectId);
    if (!s || s.type !== 'subject') s = subs[0] || null;
    return { s: s, subs: subs };
  }
  function ratioHtml(forPrint) {
    var cs = currentSubject(), s = cs.s;
    var hasKey = doc.items.some(function (i) { return i.type === 'light' && i.role === 'key'; });
    if (!s || !hasKey) return '<p class="muted">' + R.esc(t('ratioNone')) + '</p>';
    var L = C.lightingAt(doc, s), h = '';
    if (!forPrint && cs.subs.length > 1) {
      h += '<label class="f wide"><span>' + R.esc(t('ratioSubject')) + '</span><select id="ratioSubj">' + cs.subs.map(function (x, i) {
        return '<option value="' + R.esc(x.id) + '"' + (x.id === s.id ? ' selected' : '') + '>' + R.esc(x.label || (t('types').subject + ' ' + (i + 1))) + '</option>';
      }).join('') + '</select></label>';
    } else if (forPrint) h += '<p><b>' + R.esc(s.label || t('types').subject) + '</b></p>';
    h += '<div class="ratio-big"><span class="rv" data-ratio>' + C.formatRatio(L.ratio) + '</span>' +
      (L.stops !== null ? '<span class="rs">≈ ' + L.stops.toFixed(1) + ' ' + R.esc(t('stops')) + '</span>' : (isFinite(L.ratio) ? '' : '<span class="rs">' + R.esc(t('noFill')) + '</span>')) + '</div>';
    h += '<p class="ratio-sub">' + R.esc(t('keyLux')) + ' ≈ <b>' + Math.round(L.key) + ' lx</b> · ' + R.esc(t('fillLux')) + ' ≈ <b>' + Math.round(L.fill) + ' lx</b><br>' +
      R.esc(t('totalLux')) + ' ≈ <b>' + Math.round(L.total) + ' lx</b>' + (L.ev !== null ? ' · ' + R.esc(t('evLabel')) + ' ≈ <b>' + L.ev.toFixed(1) + '</b>' : '') + '</p>';
    h += '<table class="contrib"><caption>' + R.esc(t('contrib')) + '</caption><tbody>';
    L.rows.slice().sort(function (a, b) { return b.lux - a.lux; }).forEach(function (r) {
      var name = r.label || (r.passive ? tt('mods', 'bounce') : tt('lights', r.kind));
      h += '<tr><td><i class="rdot" style="background:' + R.ROLE_COLORS[r.role] + '"></i>' + R.esc(name) + (r.passive ? ' <small>(' + R.esc(t('passive')) + ')</small>' : '') + '</td>' +
        '<td>' + R.ROLE_LETTERS[r.role] + '</td><td>' + r.dist.toFixed(1) + ' m</td><td class="n">' + Math.round(r.lux) + ' lx</td></tr>';
    });
    h += '</tbody></table><p class="note">' + R.esc(t('ratioNote')) + '</p>';
    return h;
  }
  function renderRatio() { $('ratio').innerHTML = ratioHtml(false); }

  /* ------------------------------------------------------------------ */
  /* Plan settings                                                      */
  /* ------------------------------------------------------------------ */
  function syncPlanForm() {
    if (document.activeElement !== $('planTitle')) $('planTitle').value = doc.title;
    if (document.activeElement !== $('stageW')) $('stageW').value = doc.stage.w;
    if (document.activeElement !== $('stageH')) $('stageH').value = doc.stage.h;
    $('gridStep').value = String(doc.grid);
    $('snapChk').checked = doc.snap;
    $('beamsChk').checked = doc.show.beams; $('fovChk').checked = doc.show.fov;
    $('labelsChk').checked = doc.show.labels; $('gridChk').checked = doc.show.grid;
  }
  function bindPlanForm() {
    $('planTitle').addEventListener('input', function () { doc.title = this.value.slice(0, 160); commitSoon(); });
    ['stageW', 'stageH'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var v = Number(this.value); if (!isFinite(v) || v < 2 || v > 200) return;
        doc.stage[id === 'stageW' ? 'w' : 'h'] = v; commitSoon(); renderStage();
      });
      $(id).addEventListener('change', function () { fitView(); });
    });
    $('gridStep').addEventListener('change', function () { doc.grid = Number(this.value); commit(); renderStage(); });
    $('snapChk').addEventListener('change', function () { doc.snap = this.checked; commit(); });
    [['beamsChk', 'beams'], ['fovChk', 'fov'], ['labelsChk', 'labels'], ['gridChk', 'grid']].forEach(function (p) {
      $(p[0]).addEventListener('change', function () { doc.show[p[1]] = this.checked; commit(); renderStage(); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Presets & new                                                      */
  /* ------------------------------------------------------------------ */
  function buildPresetSelect() {
    var sel = $('presetSel'), cur = sel.value;
    sel.innerHTML = '<option value="">' + R.esc(t('choosePreset')) + '</option>' + C.PRESET_IDS.map(function (id) {
      return '<option value="' + id + '">' + R.esc(tt('presetNames', id)) + '</option>';
    }).join('');
    sel.value = cur;
  }
  function loadPreset(id) {
    if (!C.PRESETS[id]) return;
    flushCommit();
    doc = C.PRESETS[id]();
    doc.title = tt('presetNames', id);
    selId = null; ratioSubjectId = null;
    commit(); renderAll(); fitView(); toast(t('tPreset'));
  }
  function newPlan() {
    flushCommit();
    var d = C.createDoc(); d.stage = C.clone(doc.stage); d.grid = doc.grid; d.show = C.clone(doc.show); d.snap = doc.snap;
    doc = d; selId = null;
    commit(); renderAll(); fitView(); toast(t('tNew'));
  }

  /* ------------------------------------------------------------------ */
  /* Export                                                             */
  /* ------------------------------------------------------------------ */
  function fileBase() {
    var s = (doc.title || 'eclairage').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    s = s.replace(/^eclairage-?/, '').slice(0, 50).replace(/-+$/, '');
    return 'eclairage-' + (s || 'plan');
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast(t('tSaved') + ' : ' + name);
  }
  function svgString(palette) {
    return R.exportSvg(doc, { palette: palette || theme, footer: 'Éclairage Atelier · ' + doc.stage.w + ' × ' + doc.stage.h + ' m' });
  }
  function exportSvgFile() {
    flushCommit();
    downloadBlob(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgString()], { type: 'image/svg+xml' }), fileBase() + '.svg');
  }
  function exportPngFile() {
    flushCommit();
    var s = svgString(), m = s.match(/width="([\d.]+)" height="([\d.]+)"/);
    var w = Number(m[1]), h = Number(m[2]), scale = 2;
    var img = new Image();
    var url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    img.onload = function () {
      var c = document.createElement('canvas');
      // keep within common canvas limits for very large stages
      var sc = Math.min(scale, 8000 / Math.max(w, h));
      c.width = Math.round(w * sc); c.height = Math.round(h * sc);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { if (b) downloadBlob(b, fileBase() + '@2x.png'); }, 'image/png');
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(t('tBadFile')); };
    img.src = url;
  }
  function exportJsonFile() {
    flushCommit();
    downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), fileBase() + '.json');
  }
  function importJsonFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = C.sanitizeDoc(String(fr.result));
        flushCommit();
        doc = d; selId = null; ratioSubjectId = null;
        commit(); renderAll(); fitView(); toast(t('tImported'));
      } catch (e) { toast(t('tBadFile')); }
    };
    fr.readAsText(file);
  }
  function buildPrintSheet() {
    var date = new Date().toLocaleDateString(lang === 'kab' ? 'fr' : lang);
    $('printSheet').innerHTML =
      '<header><h1>' + R.esc(doc.title || t('appTitle')) + '</h1><p>' + R.esc(t('printDate')) + ' ' + R.esc(date) + ' · ' + doc.stage.w + ' × ' + doc.stage.h + ' m · Éclairage Atelier</p></header>' +
      '<div class="ps-plan">' + R.exportSvg(doc, { palette: 'paper' }) + '</div>' +
      '<div class="ps-cols"><section><h2>' + R.esc(t('gear')) + '</h2>' + gearHtml() + '</section>' +
      '<section><h2>' + R.esc(t('ratio')) + '</h2>' + ratioHtml(true) + '</section></div>';
  }
  function printPlan() { flushCommit(); buildPrintSheet(); window.print(); }

  /* ------------------------------------------------------------------ */
  /* Language & theme                                                   */
  /* ------------------------------------------------------------------ */
  function applyLang() {
    document.documentElement.lang = lang === 'kab' ? 'kab' : lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.title = t(el.getAttribute('data-i18n-title')); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    $('lang').value = lang;
    buildPalette(); buildPresetSelect(); renderProps(); renderGear(); renderRatio();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = theme === 'dark' ? '#14161b' : '#e9ecf1';
    buildPalette(); renderStage(); renderProps();
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                           */
  /* ------------------------------------------------------------------ */
  function onKey(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && (k === 'z' || k === 'Z') && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (k === 'y' || k === 'Y') && !typing) { e.preventDefault(); redo(); return; }
    if (typing || $('helpDlg').open) return;
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicateSel(); return; }
    if (mod) return;
    var step = e.shiftKey ? 0.01 : (doc.snap ? doc.grid : 0.1);
    switch (k) {
      case 'Delete': case 'Backspace': if (selId) { e.preventDefault(); deleteSel(); } break;
      case 'Escape': if (selId) { selId = null; renderStage(); renderProps(); } break;
      case 'ArrowLeft': if (selId) { e.preventDefault(); nudge(-step, 0); } break;
      case 'ArrowRight': if (selId) { e.preventDefault(); nudge(step, 0); } break;
      case 'ArrowUp': if (selId) { e.preventDefault(); nudge(0, -step); } break;
      case 'ArrowDown': if (selId) { e.preventDefault(); nudge(0, step); } break;
      case 'r': rotateSel(15); break;
      case 'R': rotateSel(1); break;
      case 'e': rotateSel(-15); break;
      case 'E': rotateSel(-1); break;
      case ']': reorder('forward'); break;
      case '[': reorder('backward'); break;
      case '+': case '=': zoomAt(1.2); break;
      case '-': case '_': zoomAt(1 / 1.2); break;
      case '0': fitView(); break;
      case 's': case 'S': doc.snap = !doc.snap; commit(); syncPlanForm(); toast(t('snap') + ' : ' + (doc.snap ? 'ON' : 'OFF')); break;
      case '?': $('helpDlg').showModal(); break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */
  function init() {
    try { lang = localStorage.getItem(LS_LANG) || ''; } catch (e) { lang = ''; }
    if (!I.STR[lang]) lang = 'fr';
    try { theme = localStorage.getItem(LS_THEME) || ''; } catch (e) { theme = ''; }
    if (theme !== 'light' && theme !== 'dark') theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';

    var restored = false;
    try {
      var raw = localStorage.getItem(LS_DOC);
      if (raw) { doc = C.sanitizeDoc(raw); restored = true; }
    } catch (e) { restored = false; }
    if (!restored) { doc = C.PRESETS.interview(); doc.title = I.STR[lang].presetNames.interview; }
    hist.reset(doc);

    $('lang').innerHTML = I.LANGS.map(function (l) { return '<option value="' + l[0] + '">' + l[1] + '</option>'; }).join('');
    $('lang').addEventListener('change', function () {
      lang = this.value; try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* ignore */ }
      applyLang();
    });
    $('themeBtn').addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(LS_THEME, theme); } catch (e) { /* ignore */ }
      applyTheme();
    });
    $('helpBtn').addEventListener('click', function () { $('helpDlg').showModal(); });
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('presetBtn').addEventListener('click', function () { var v = $('presetSel').value; if (v) loadPreset(v); });
    $('presetSel').addEventListener('change', function () { if (this.value) loadPreset(this.value); });
    $('newBtn').addEventListener('click', newPlan);
    $('svgBtn').addEventListener('click', exportSvgFile);
    $('pngBtn').addEventListener('click', exportPngFile);
    $('jsonBtn').addEventListener('click', exportJsonFile);
    $('openBtn').addEventListener('click', function () { $('fileIn').value = ''; $('fileIn').click(); });
    $('fileIn').addEventListener('change', function () { if (this.files && this.files[0]) importJsonFile(this.files[0]); this.value = ''; });
    $('printBtn').addEventListener('click', printPlan);
    window.addEventListener('beforeprint', buildPrintSheet);
    $('zoomIn').addEventListener('click', function () { zoomAt(1.25); });
    $('zoomOut').addEventListener('click', function () { zoomAt(1 / 1.25); });
    $('zoomFit').addEventListener('click', fitView);

    var pl = $('paletteList');
    pl.addEventListener('pointerdown', onPalettePointerDown);
    pl.addEventListener('pointermove', onPalettePointerMove);
    pl.addEventListener('pointerup', onPalettePointerUp);
    pl.addEventListener('pointercancel', function () { pdrag = null; $('ghost').classList.remove('show'); svg.classList.remove('drop-target'); });
    pl.addEventListener('click', onPaletteClick);
    pl.addEventListener('dragstart', function (e) { e.preventDefault(); });

    svg.addEventListener('pointerdown', onStageDown);
    svg.addEventListener('pointermove', onStageMove);
    svg.addEventListener('pointerup', onStageUp);
    svg.addEventListener('pointercancel', onStageUp);
    svg.addEventListener('pointerleave', function () { $('cursorPos').textContent = ''; });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('dblclick', function (e) { if (!e.target.closest('[data-id]')) fitView(); });

    var props = $('props');
    props.addEventListener('input', onPropInput);
    props.addEventListener('change', function (e) { if (e.target.getAttribute('data-k')) flushCommit(); });
    props.addEventListener('click', onPropClick);
    $('ratio').addEventListener('change', function (e) { if (e.target.id === 'ratioSubj') { ratioSubjectId = e.target.value; renderRatio(); } });

    bindPlanForm();
    document.addEventListener('keydown', onKey);

    // narrow screens: start with the secondary panels collapsed
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      $('gearPanel').open = false; $('planPanel').open = false; $('ratioPanel').open = false;
    }
    var resizeT = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(fitView, 120); });

    document.documentElement.setAttribute('data-theme', theme);
    applyLang();
    renderAll(); updateUndoButtons();
    fitView();
    if (!restored) save();
  }

  // Small API used by the end-to-end tests (read-only helpers + actions).
  window.EclairageAtelier = {
    doc: function () { return C.clone(doc); },
    selected: function () { return selId; },
    select: function (id) { selId = id; renderStage(); renderProps(); renderRatio(); },
    view: function () { return { z: view.z, tx: view.tx, ty: view.ty }; },
    toScreen: function (x, y) { var r = svg.getBoundingClientRect(); return { x: r.left + view.tx + x * S * view.z, y: r.top + view.ty + y * S * view.z }; },
    canUndo: function () { return hist.canUndo(); }, canRedo: function () { return hist.canRedo(); },
    lang: function () { return lang; }, theme: function () { return theme; },
    svgString: function () { return svgString(); }
  };

  init();
})();
