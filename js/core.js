/*
 * Éclairage Atelier — core (no DOM).
 * Data model, element catalogue, optics (camera field of view), photometric
 * estimate (inverse-square law), gear list, presets and JSON validation.
 * Works in the browser (window.EACore) and in Node (module.exports) for tests.
 *
 * Coordinates: metres. The stage spans (0,0) → (stage.w, stage.h), y grows
 * "down" (towards the audience / bottom of the plan). Rotation `rot` is in
 * degrees, clockwise, 0 = facing right (+x). Everything an item "points at"
 * (camera lens, light beam, actor's nose) uses that direction.
 *
 * MIT License — © 2026 Amirouche Amwanes (salimadour31-boop)
 */
(function (root) {
  'use strict';

  var VERSION = 1;

  /* ------------------------------------------------------------------ */
  /* Catalogue                                                          */
  /* ------------------------------------------------------------------ */

  /** Camera sensor widths in mm (horizontal), used for the FOV cone. */
  var SENSORS = {
    ff:   { w: 36.0,  name: 'Full Frame (36 mm)' },
    s35:  { w: 24.89, name: 'Super 35 (24.9 mm)' },
    apsc: { w: 23.5,  name: 'APS-C (23.5 mm)' },
    mft:  { w: 17.3,  name: 'Micro 4/3 (17.3 mm)' },
    s16:  { w: 12.52, name: 'Super 16 (12.5 mm)' },
    one:  { w: 13.2,  name: '1" (13.2 mm)' }
  };

  /**
   * Light kinds. `eff` is a rough luminous efficacy in lumens per watt
   * (modifier losses included for softbox/octa). The sun / window is
   * "directional": its `power` is read as lux at the window, not watts.
   */
  var LIGHT_KINDS = {
    fresnel:   { beam: 30,  power: 650, kelvin: 3200, throw: 3.5, eff: 20 },
    led:       { beam: 60,  power: 200, kelvin: 5600, throw: 3,   eff: 70 },
    softbox:   { beam: 90,  power: 300, kelvin: 5600, throw: 2.5, eff: 40 },
    octa:      { beam: 100, power: 300, kelvin: 5600, throw: 2.5, eff: 40 },
    practical: { beam: 300, power: 40,  kelvin: 2700, throw: 1.2, eff: 12 },
    tube:      { beam: 120, power: 30,  kelvin: 5600, throw: 2,   eff: 60 },
    sun:       { beam: 50,  power: 2000, kelvin: 5600, throw: 6,  eff: 0, directional: true }
  };

  var ROLES = ['key', 'fill', 'back', 'rim', 'background'];
  var BOUNCE_REFLECTANCE = 0.8; // white foam-core / silver reflector, rough average
  var MOD_KINDS = { flag: { w: 0.6 }, bounce: { w: 1.0 }, diffusion: { w: 1.2 }, negfill: { w: 1.2 } };
  var SET_KINDS = {
    wall:   { w: 3.0, h: 0.15 },
    door:   { w: 0.9, h: 0.1 },
    window: { w: 1.2, h: 0.15 },
    table:  { w: 1.2, h: 0.8 },
    chair:  { w: 0.5, h: 0.5 },
    sofa:   { w: 2.0, h: 0.9 }
  };
  var CATEGORIES = ['camera', 'subject', 'light', 'modifier', 'set', 'track', 'arrow', 'note'];

  /** Palette entries in display order: [type, kind]. */
  var PALETTE = [
    ['camera', null], ['subject', null],
    ['light', 'fresnel'], ['light', 'led'], ['light', 'softbox'], ['light', 'octa'],
    ['light', 'practical'], ['light', 'tube'], ['light', 'sun'],
    ['modifier', 'flag'], ['modifier', 'bounce'], ['modifier', 'diffusion'], ['modifier', 'negfill'],
    ['set', 'wall'], ['set', 'door'], ['set', 'window'], ['set', 'table'], ['set', 'chair'], ['set', 'sofa'],
    ['track', null], ['arrow', null], ['note', null]
  ];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  var seq = 0;
  function uid() {
    seq = (seq + 1) % 1e6;
    return 'i' + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function round(v, n) { var p = Math.pow(10, n || 0); return Math.round(v * p) / p; }
  function normDeg(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function snap(v, step) { return step > 0 ? Math.round(v / step) * step : v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ */
  /* Items                                                              */
  /* ------------------------------------------------------------------ */

  /** Create a new item with sensible defaults. */
  function createItem(type, kind, x, y, extra) {
    var it = { id: uid(), type: type, x: num(x, 0), y: num(y, 0), rot: 0, label: '' };
    switch (type) {
      case 'camera':
        it.focal = 35; it.sensor = 'ff'; it.range = 4; it.rot = -90;
        break;
      case 'subject':
        it.color = '#e0a458'; it.rot = 90;
        break;
      case 'light': {
        kind = LIGHT_KINDS[kind] ? kind : 'fresnel';
        var d = LIGHT_KINDS[kind];
        it.kind = kind; it.beam = d.beam; it.power = d.power; it.kelvin = d.kelvin;
        it.intensity = 100; it.throw = d.throw; it.role = 'key';
        if (kind === 'tube') it.length = 1.2;
        break;
      }
      case 'modifier':
        kind = MOD_KINDS[kind] ? kind : 'flag';
        it.kind = kind; it.w = MOD_KINDS[kind].w;
        break;
      case 'set':
        kind = SET_KINDS[kind] ? kind : 'wall';
        it.kind = kind; it.w = SET_KINDS[kind].w; it.h = SET_KINDS[kind].h;
        break;
      case 'track':
        it.length = 3;
        break;
      case 'arrow':
        it.length = 2; it.bend = 0; it.color = '#ff6b6b';
        break;
      case 'note':
        it.text = 'Note'; it.size = 16; it.color = '#ffd166';
        break;
      default:
        throw new Error('Unknown type ' + type);
    }
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] !== undefined) it[k] = extra[k];
    it.rot = round(normDeg(num(it.rot, 0)), 2);
    return it;
  }

  /** Default empty document. */
  function createDoc() {
    return {
      app: 'eclairage-atelier', version: VERSION,
      title: '', stage: { w: 10, h: 8 }, grid: 0.5, snap: true,
      show: { beams: true, fov: true, labels: true, grid: true },
      items: []
    };
  }

  /** Horizontal field of view (degrees) for a focal length and sensor. */
  function fovDeg(focal, sensor) {
    var s = SENSORS[sensor] || SENSORS.ff;
    var f = Math.max(1, num(focal, 35));
    return 2 * Math.atan(s.w / (2 * f)) * 180 / Math.PI;
  }

  /**
   * Approximate RGB of a black-body-ish source at `k` kelvin.
   * Piecewise curve fitted by hand on CIE data (good enough for a tint).
   */
  function kelvinToRgb(k) {
    var t = clamp(num(k, 5600), 1000, 12000) / 100, r, g, b;
    if (t <= 66) r = 255; else r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661;
    else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
  }
  function kelvinToHex(k) {
    var c = kelvinToRgb(k);
    return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Photometric estimate                                               */
  /* ------------------------------------------------------------------ */

  /** Smallest absolute angle between two directions, degrees. */
  function angleDiff(a, b) { var d = Math.abs(normDeg(a) - normDeg(b)); return d > 180 ? 360 - d : d; }

  /**
   * Estimated illuminance (lux) a light puts on a point (x,y).
   * I = Φ / Ω  (candela, Φ = W × lm/W × intensity, Ω = cone solid angle)
   * E = I / d² (inverse-square law), × beam coverage (soft edge outside
   * the beam angle). The sun/window ignores distance. Flags, walls and
   * bounces are NOT taken into account: this is a planning estimate.
   */
  function illuminance(light, x, y) {
    var kd = LIGHT_KINDS[light.kind] || LIGHT_KINDS.fresnel;
    var dx = x - light.x, dy = y - light.y;
    var d = Math.max(0.3, Math.sqrt(dx * dx + dy * dy));
    var beam = clamp(num(light.beam, kd.beam), 1, 360);
    var half = beam / 2;
    var toward = Math.atan2(dy, dx) * 180 / Math.PI;
    var off = angleDiff(toward, light.rot || 0);
    var cover;
    if (beam >= 359 || off <= half) cover = 1;
    else if (off <= half + Math.max(10, half * 0.5)) cover = 1 - (off - half) / Math.max(10, half * 0.5);
    else cover = 0;
    var level = clamp(num(light.intensity, 100), 0, 100) / 100;
    if (kd.directional) return Math.max(0, num(light.power, kd.power)) * level * cover;
    var flux = Math.max(0, num(light.power, kd.power)) * kd.eff * level;
    var omega = 2 * Math.PI * (1 - Math.cos(half * Math.PI / 180));
    return flux / omega / (d * d) * cover;
  }

  /** Per-light contributions and key:fill ratio at a subject. */
  function lightingAt(doc, subject) {
    var rows = [], byRole = {};
    ROLES.forEach(function (r) { byRole[r] = 0; });
    doc.items.forEach(function (it) {
      if (it.type !== 'light') return;
      var dx = subject.x - it.x, dy = subject.y - it.y;
      var lux = illuminance(it, subject.x, subject.y);
      rows.push({ id: it.id, label: it.label, kind: it.kind, role: it.role, lux: lux, dist: Math.sqrt(dx * dx + dy * dy) });
      if (byRole[it.role] !== undefined) byRole[it.role] += lux;
    });
    // Passive bounces / reflectors: they catch light on their front face
    // and re-emit it as a diffuse (Lambertian) source, counted as fill.
    doc.items.forEach(function (b) {
      if (b.type !== 'modifier' || b.kind !== 'bounce') return;
      var faceOut = b.rot || 0, incident = 0;
      doc.items.forEach(function (it) {
        if (it.type !== 'light') return;
        var toLight = Math.atan2(it.y - b.y, it.x - b.x) * 180 / Math.PI;
        var inc = angleDiff(toLight, faceOut);
        if (inc >= 90) return;                       // hits the back side
        incident += illuminance(it, b.x, b.y) * Math.cos(inc * Math.PI / 180);
      });
      var dx = subject.x - b.x, dy = subject.y - b.y;
      var d = Math.max(0.3, Math.sqrt(dx * dx + dy * dy));
      var out = angleDiff(Math.atan2(dy, dx) * 180 / Math.PI, faceOut);
      if (out >= 90 || incident <= 0) return;
      var area = Math.PI / 4 * b.w * b.w;               // round 5-in-1 reflector
      var lum = BOUNCE_REFLECTANCE * incident / Math.PI; // cd/m²
      var lux = lum * area * Math.cos(out * Math.PI / 180) / (d * d);
      rows.push({ id: b.id, label: b.label, kind: 'bounce', role: 'fill', lux: lux, dist: d, passive: true });
      byRole.fill += lux;
    });
    var key = byRole.key, fill = byRole.fill, total = 0;
    rows.forEach(function (r) { total += r.lux; });
    var ratio = fill > 0.01 ? key / fill : (key > 0 ? Infinity : 0);
    return {
      rows: rows, byRole: byRole, key: key, fill: fill, total: total,
      ratio: ratio,
      stops: (ratio > 0 && isFinite(ratio)) ? Math.log(ratio) / Math.LN2 : null,
      // Incident EV at ISO 100 (calibration constant C = 250 → E = 2.5 × 2^EV)
      ev: total > 0 ? Math.log(total / 2.5) / Math.LN2 : null
    };
  }

  /** Format a ratio like "4:1", "2.5:1", "∞". */
  function formatRatio(r) {
    if (!isFinite(r)) return '∞';
    if (r <= 0) return '—';
    return (r >= 10 ? Math.round(r) : round(r, 1)) + ':1';
  }

  /* ------------------------------------------------------------------ */
  /* Gear list                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Group items into gear lines. Lights are grouped by kind + kelvin +
   * power; intensities are listed. Returns [{key, type, kind, count, ...}].
   */
  function gearList(doc) {
    var map = {}, order = [];
    function add(key, base) {
      if (!map[key]) { map[key] = base; base.count = 0; base.intensities = []; base.labels = []; order.push(key); }
      map[key].count++;
      return map[key];
    }
    doc.items.forEach(function (it) {
      var g;
      if (it.type === 'light') {
        g = add('light|' + it.kind + '|' + it.kelvin + '|' + it.power, { type: 'light', kind: it.kind, kelvin: it.kelvin, power: it.power });
        g.intensities.push(it.intensity);
      } else if (it.type === 'camera') {
        g = add('camera|' + it.sensor + '|' + it.focal, { type: 'camera', sensor: it.sensor, focal: it.focal });
      } else if (it.type === 'modifier' || it.type === 'set') {
        g = add(it.type + '|' + it.kind + '|' + it.w, { type: it.type, kind: it.kind, w: it.w });
      } else if (it.type === 'track') {
        g = add('track|' + it.length, { type: 'track', length: it.length });
      } else if (it.type === 'subject') {
        g = add('subject', { type: 'subject' });
      } else return;
      if (it.label) g.labels.push(it.label);
    });
    var rank = { camera: 0, light: 1, modifier: 2, track: 3, set: 4, subject: 5 };
    return order.map(function (k) { return map[k]; })
      .sort(function (a, b) { return rank[a.type] - rank[b.type]; });
  }

  /** Total of lights' rated power in watts (sun excluded). */
  function totalWatts(doc) {
    var w = 0;
    doc.items.forEach(function (it) {
      if (it.type === 'light' && !(LIGHT_KINDS[it.kind] || {}).directional) w += Math.max(0, num(it.power, 0));
    });
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* Presets (original layouts)                                         */
  /* ------------------------------------------------------------------ */

  /** Light helper: placed at (x,y) and aimed at (tx,ty). */
  function aimed(kind, x, y, tx, ty, extra) {
    var it = createItem('light', kind, x, y, extra);
    it.rot = round(normDeg(Math.atan2(ty - y, tx - x) * 180 / Math.PI), 1);
    return it;
  }
  function aimItem(type, kind, x, y, tx, ty, extra) {
    var it = createItem(type, kind, x, y, extra);
    it.rot = round(normDeg(Math.atan2(ty - y, tx - x) * 180 / Math.PI), 1);
    return it;
  }

  var PRESETS = {
    interview: function () {
      var d = createDoc(); d.title = 'Interview 3 points'; d.stage = { w: 9, h: 7 };
      var sx = 4.5, sy = 2.6;
      d.items = [
        createItem('set', 'wall', 4.5, 0.6, { w: 7 }),
        createItem('set', 'chair', sx, sy, { rot: 30 }),
        createItem('subject', null, sx, sy, { label: 'Invité·e', rot: 120 }),
        aimItem('camera', null, 3.4, 5.2, sx, sy, { focal: 50, sensor: 's35', label: 'A', range: 3.5 }),
        aimed('softbox', 2.2, 3.9, sx, sy, { label: 'Key', role: 'key', intensity: 80, kelvin: 5600 }),
        aimed('led', 6.6, 4.0, sx, sy, { label: 'Fill', role: 'fill', intensity: 21, beam: 90, kelvin: 5600 }),
        aimed('fresnel', 6.2, 1.3, sx, sy, { label: 'Back', role: 'back', intensity: 20, kelvin: 3200, power: 300, beam: 25 }),
        aimed('practical', 7.6, 1.2, 7.6, 2, { label: 'Lampe', role: 'background', intensity: 70 }),
        createItem('modifier', 'negfill', 6.9, 2.6, { rot: 75, w: 1.0 }),
        createItem('note', null, 1.2, 6.4, { text: 'Ratio cible ≈ 3:1', size: 16 })
      ];
      return d;
    },
    rembrandt: function () {
      var d = createDoc(); d.title = 'Portrait Rembrandt'; d.stage = { w: 8, h: 7 };
      var sx = 4, sy = 3;
      d.items = [
        createItem('subject', null, sx, sy, { label: 'Modèle', rot: 90 }),
        aimItem('camera', null, sx, 5.6, sx, sy, { focal: 85, sensor: 'ff', label: 'Cam', range: 3 }),
        aimed('octa', 2.4, 1.8, sx, sy, { label: 'Key 45°', role: 'key', intensity: 90, kelvin: 5600, beam: 80 }),
        aimItem('modifier', 'bounce', 4.85, 3.55, sx, sy, { label: 'Réflecteur', w: 1.0 }),
        aimed('fresnel', 5.7, 1.2, sx, sy, { label: 'Hair', role: 'rim', intensity: 15, power: 150, kelvin: 3200, beam: 20 }),
        aimItem('modifier', 'flag', 3.2, 2.2, 4.5, 3.6, { label: '', w: 0.5 }),
        createItem('note', null, 0.6, 6.4, { text: 'Triangle de lumière sur la joue ombrée', size: 15 })
      ];
      return d;
    },
    night: function () {
      var d = createDoc(); d.title = 'Nuit extérieure — clair de lune'; d.stage = { w: 14, h: 10 };
      var sx = 7, sy = 5;
      d.items = [
        aimed('fresnel', 1.5, 1.2, sx, sy, { label: 'Lune (HMI)', role: 'key', kelvin: 7000, power: 1200, intensity: 85, beam: 20, throw: 8 }),
        createItem('subject', null, sx, sy, { label: 'Personnage', rot: 200, color: '#8fb3ff' }),
        aimItem('camera', null, 10.5, 7.8, sx, sy, { focal: 32, sensor: 's35', label: 'A', range: 5 }),
        aimed('tube', 9.5, 3.4, sx, sy, { label: 'Lampadaire', role: 'rim', kelvin: 2400, intensity: 60, length: 1.2 }),
        aimed('led', 10.0, 5.5, sx, sy, { label: 'Fill bleu', role: 'fill', kelvin: 9000, intensity: 15 }),
        createItem('modifier', 'diffusion', 2.8, 2.3, { rot: 38, w: 1.8, label: '1/4 grid' }),
        createItem('track', null, 9.0, 8.7, { length: 4, rot: 180, label: 'Travelling' }),
        createItem('arrow', null, 7.4, 5.6, { length: 2.2, rot: 30, bend: 0.3, label: 'Marche' }),
        createItem('note', null, 0.6, 9.4, { text: 'Lune : HMI haut et loin, 7000 K · ratio fort', size: 16 })
      ];
      return d;
    },
    product: function () {
      var d = createDoc(); d.title = 'Produit sur table'; d.stage = { w: 6, h: 5 }; d.grid = 0.25;
      var sx = 3, sy = 2.2;
      d.items = [
        createItem('set', 'table', sx, sy, { w: 1.4, h: 0.8 }),
        createItem('subject', null, sx, sy, { label: 'Produit', rot: 90, color: '#7bd389' }),
        aimItem('camera', null, sx, 4.2, sx, sy, { focal: 100, sensor: 'ff', label: 'Macro', range: 2.2 }),
        aimed('softbox', 1.6, 1.6, sx, sy, { label: 'Key', role: 'key', intensity: 70, beam: 90 }),
        aimed('tube', 4.4, 1.5, sx, sy, { label: 'Rim', role: 'rim', intensity: 50, length: 1.0 }),
        aimItem('modifier', 'bounce', 3.65, 2.65, sx, sy, { label: 'Carton blanc', w: 0.7 }),
        aimItem('modifier', 'diffusion', 2.0, 1.95, sx, sy, { label: 'Diffuseur', w: 1.0 }),
        createItem('set', 'wall', sx, 0.5, { w: 3.6, h: 0.08, label: 'Cyclo' }),
        aimed('led', 3, 0.9, sx, 0.5, { label: 'Fond', role: 'background', intensity: 40, beam: 90, kelvin: 4300 })
      ];
      return d;
    },
    dialogue: function () {
      var d = createDoc(); d.title = 'Dialogue à deux — champ / contrechamp'; d.stage = { w: 11, h: 8 };
      var ax = 4.4, ay = 4, bx = 6.6, by = 4;
      d.items = [
        createItem('set', 'table', 5.5, 4.0, { w: 1.2, h: 0.8 }),
        createItem('set', 'chair', 4.25, 4.0, { rot: 270 }),
        createItem('set', 'chair', 6.75, 4.0, { rot: 90 }),
        createItem('subject', null, ax, ay, { label: 'A', rot: 0, color: '#e0a458' }),
        createItem('subject', null, bx, by, { label: 'B', rot: 180, color: '#c38fff' }),
        aimItem('camera', null, 3.2, 5.3, bx, by, { focal: 50, sensor: 's35', label: 'Cam 1 (OTS sur B)', range: 4.5 }),
        aimItem('camera', null, 7.8, 5.3, ax, ay, { focal: 50, sensor: 's35', label: 'Cam 2 (OTS sur A)', range: 4.5 }),
        aimed('softbox', 5.6, 1.6, ax, ay, { label: 'Key A', role: 'key', intensity: 75 }),
        aimed('softbox', 5.4, 6.4, bx, by, { label: 'Key B', role: 'key', intensity: 75 }),
        aimed('led', 1.6, 4.0, ax, ay, { label: 'Fill', role: 'fill', intensity: 25, beam: 90 }),
        aimed('fresnel', 9.4, 4.0, bx, by, { label: 'Back', role: 'back', intensity: 40, power: 300, kelvin: 3200 }),
        aimed('practical', 5.5, 4.0, 5.5, 3, { label: 'Bougie', role: 'background', intensity: 40, power: 15, kelvin: 1900 }),
        createItem('note', null, 0.5, 7.5, { text: 'Règle des 180° : caméras du même côté de l’axe A–B', size: 15 }),
        createItem('arrow', null, 5.5, 2.4, { length: 3.6, rot: 180, bend: 0, color: '#9aa4b2', label: 'Axe 180°' })
      ];
      // the 180° line is drawn between the actors, a little offset for legibility
      d.items[d.items.length - 1].x = 7.3; d.items[d.items.length - 1].y = 4.0;
      return d;
    }
  };
  var PRESET_IDS = ['interview', 'rembrandt', 'night', 'product', 'dialogue'];

  /* ------------------------------------------------------------------ */
  /* Validation (JSON import / localStorage)                            */
  /* ------------------------------------------------------------------ */

  function sanitizeItem(raw) {
    if (!raw || typeof raw !== 'object' || CATEGORIES.indexOf(raw.type) < 0) return null;
    var kind = raw.kind;
    var base;
    try { base = createItem(raw.type, kind, raw.x, raw.y); } catch (e) { return null; }
    var it = base;
    if (typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id)) it.id = raw.id;
    it.x = clamp(num(raw.x, 0), -1000, 1000);
    it.y = clamp(num(raw.y, 0), -1000, 1000);
    it.rot = normDeg(num(raw.rot, it.rot));
    it.label = typeof raw.label === 'string' ? raw.label.slice(0, 120) : '';
    function n(key, a, b) { if (key in it) it[key] = clamp(num(raw[key], it[key]), a, b); }
    function color(key) { if (key in it && typeof raw[key] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[key])) it[key] = raw[key]; }
    n('focal', 4, 1200); n('range', 0.5, 100);
    if (it.type === 'camera' && SENSORS[raw.sensor]) it.sensor = raw.sensor;
    n('beam', 1, 360); n('power', 0, 200000); n('kelvin', 1000, 12000); n('intensity', 0, 100); n('throw', 0.2, 100);
    if (it.type === 'light' && ROLES.indexOf(raw.role) >= 0) it.role = raw.role;
    n('w', 0.05, 100); n('h', 0.05, 100); n('length', 0.1, 100); n('bend', -1, 1); n('size', 6, 200);
    color('color');
    if (it.type === 'note') it.text = typeof raw.text === 'string' ? raw.text.slice(0, 500) : '';
    return it;
  }

  /** Validate and normalise a document; throws on unusable input. */
  function sanitizeDoc(raw) {
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) throw new Error('Invalid document');
    var d = createDoc();
    d.title = typeof raw.title === 'string' ? raw.title.slice(0, 160) : '';
    if (raw.stage) { d.stage.w = clamp(num(raw.stage.w, 10), 2, 200); d.stage.h = clamp(num(raw.stage.h, 8), 2, 200); }
    d.grid = [0.1, 0.25, 0.5, 1].indexOf(num(raw.grid, 0.5)) >= 0 ? num(raw.grid, 0.5) : 0.5;
    d.snap = raw.snap !== false;
    if (raw.show && typeof raw.show === 'object') ['beams', 'fov', 'labels', 'grid'].forEach(function (k) { d.show[k] = raw.show[k] !== false; });
    var seen = {};
    raw.items.slice(0, 2000).forEach(function (r) {
      var it = sanitizeItem(r);
      if (!it) return;
      if (seen[it.id]) it.id = uid();
      seen[it.id] = 1;
      d.items.push(it);
    });
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Undo / redo history (snapshots as JSON strings)                    */
  /* ------------------------------------------------------------------ */

  function History(limit) { this.limit = limit || 200; this.stack = []; this.index = -1; }
  History.prototype.push = function (doc) {
    var s = JSON.stringify(doc);
    if (this.index >= 0 && this.stack[this.index] === s) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(s);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  };
  History.prototype.canUndo = function () { return this.index > 0; };
  History.prototype.canRedo = function () { return this.index < this.stack.length - 1; };
  History.prototype.undo = function () { return this.canUndo() ? JSON.parse(this.stack[--this.index]) : null; };
  History.prototype.redo = function () { return this.canRedo() ? JSON.parse(this.stack[++this.index]) : null; };
  History.prototype.reset = function (doc) { this.stack = []; this.index = -1; this.push(doc); };

  var api = {
    VERSION: VERSION, SENSORS: SENSORS, LIGHT_KINDS: LIGHT_KINDS, ROLES: ROLES,
    MOD_KINDS: MOD_KINDS, SET_KINDS: SET_KINDS, CATEGORIES: CATEGORIES, PALETTE: PALETTE,
    PRESETS: PRESETS, PRESET_IDS: PRESET_IDS,
    uid: uid, clamp: clamp, num: num, round: round, normDeg: normDeg, snap: snap, clone: clone,
    createItem: createItem, createDoc: createDoc, fovDeg: fovDeg,
    kelvinToRgb: kelvinToRgb, kelvinToHex: kelvinToHex, angleDiff: angleDiff,
    illuminance: illuminance, lightingAt: lightingAt, formatRatio: formatRatio,
    gearList: gearList, totalWatts: totalWatts,
    sanitizeItem: sanitizeItem, sanitizeDoc: sanitizeDoc, History: History
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EACore = api;
})(this);
