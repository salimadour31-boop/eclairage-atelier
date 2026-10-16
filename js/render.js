/*
 * Éclairage Atelier — SVG renderer (no DOM access: returns markup strings,
 * so the same code draws the live stage, the exports and the palette icons).
 * All pictograms are original drawings made for this project.
 *
 * Units: 1 metre = 100 SVG units (S). Each item is drawn in local
 * coordinates, facing +x, then translated / rotated into place.
 *
 * MIT License — © 2026 Amirouche Amwanes (salimadour31-boop)
 */
(function (root) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.EACore;
  var S = 100;

  /** Colour sets for the stage. `paper` is used for print. */
  var PALETTES = {
    dark:  { bg: '#14161b', stage: '#1b1e25', grid: '#262a33', gridMajor: '#323846', border: '#4a5263', ink: '#e8ebf1', inkSoft: '#9aa4b2', body: '#2c313c', bodyLine: '#cfd6e2', fov: '#7cc4ff', sel: '#ffcf4a', wall: '#596273', furniture: '#3a4150', furnitureLine: '#8e98aa', glass: '#7cc4ff', black: '#050608', white: '#f4f6fa' },
    light: { bg: '#e9ecf1', stage: '#ffffff', grid: '#e6e9ef', gridMajor: '#cfd5df', border: '#8a93a3', ink: '#1d2230', inkSoft: '#5d6676', body: '#3a4150', bodyLine: '#1d2230', fov: '#1f7fd1', sel: '#e08a00', wall: '#7a8496', furniture: '#e8ebf1', furnitureLine: '#5d6676', glass: '#3d9be9', black: '#11141a', white: '#ffffff', beamMix: '#7a8496' }
  };
  PALETTES.paper = PALETTES.light;

  var ROLE_COLORS = { key: '#ff8a3d', fill: '#42b8f5', back: '#b38cff', rim: '#ffd166', background: '#7bd389' };
  var ROLE_LETTERS = { key: 'K', fill: 'F', back: 'B', rim: 'R', background: 'BG' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function rad(d) { return d * Math.PI / 180; }

  /* ------------------------------------------------------------------ */
  /* Local bounding boxes (SVG units, local frame)                      */
  /* ------------------------------------------------------------------ */
  function bbox(it) {
    switch (it.type) {
      case 'camera': return { x0: -26, y0: -19, x1: 30, y1: 19 };
      case 'subject': return { x0: -17, y0: -29, x1: 19, y1: 29 };
      case 'light':
        switch (it.kind) {
          case 'fresnel': return { x0: -22, y0: -22, x1: 30, y1: 22 };
          case 'led': return { x0: -14, y0: -26, x1: 10, y1: 26 };
          case 'softbox': return { x0: -14, y0: -42, x1: 16, y1: 42 };
          case 'octa': return { x0: -18, y0: -52, x1: 12, y1: 52 };
          case 'practical': return { x0: -20, y0: -20, x1: 20, y1: 20 };
          case 'tube': { var h = (it.length || 1.2) * S / 2; return { x0: -8, y0: -h, x1: 8, y1: h }; }
          case 'sun': return { x0: -26, y0: -26, x1: 26, y1: 26 };
        }
        return { x0: -20, y0: -20, x1: 20, y1: 20 };
      case 'modifier': { var m = Math.max(6, (it.w || 1) * S / 2); return { x0: -8, y0: -m, x1: 8, y1: m }; }
      case 'set': { var w = (it.w || 1) * S / 2, hh = Math.max(4, (it.h || 0.2) * S / 2); return { x0: -w, y0: -hh - (it.kind === 'door' ? (it.w || 1) * S : 0), x1: w, y1: hh }; }
      case 'track': { var l = (it.length || 3) * S / 2; return { x0: -l, y0: -16, x1: l, y1: 16 }; }
      case 'arrow': { var L = (it.length || 2) * S, b = Math.abs(it.bend || 0) * L / 2; return { x0: -6, y0: -b - 12, x1: L + 6, y1: b + 12 }; }
      case 'note': { var sz = it.size || 16, lines = String(it.text || ' ').split('\n'), wmax = 1;
        lines.forEach(function (ln) { wmax = Math.max(wmax, ln.length); });
        return { x0: -4, y0: -sz, x1: wmax * sz * 0.56 + 4, y1: (lines.length - 1) * sz * 1.25 + sz * 0.4 }; }
    }
    return { x0: -20, y0: -20, x1: 20, y1: 20 };
  }
  /** Radius used to place the label under the item (world-aligned). */
  function labelOffset(it) {
    var b = bbox(it), r = 0;
    [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].forEach(function (p) { r = Math.max(r, Math.hypot(p[0], p[1])); });
    return Math.min(r, 70) + 14;
  }

  /* ------------------------------------------------------------------ */
  /* Pictograms (local frame, facing +x)                                */
  /* ------------------------------------------------------------------ */
  function shape(it, P) {
    var o = '';
    switch (it.type) {
      case 'camera':
        // body, magazine, lens hood
        o += '<rect x="-22" y="-15" width="32" height="30" rx="5" fill="' + P.body + '" stroke="' + P.bodyLine + '" stroke-width="2"/>';
        o += '<rect x="-26" y="-9" width="6" height="18" rx="2" fill="' + P.bodyLine + '"/>';
        o += '<path d="M10 -8 L28 -14 L28 14 L10 8 Z" fill="' + P.body + '" stroke="' + P.bodyLine + '" stroke-width="2" stroke-linejoin="round"/>';
        o += '<circle cx="-5" cy="0" r="5" fill="none" stroke="' + P.fov + '" stroke-width="2"/>';
        return o;
      case 'subject': {
        var c = it.color || '#e0a458';
        o += '<ellipse cx="-2" cy="0" rx="13" ry="27" fill="' + c + '" fill-opacity="0.85" stroke="' + P.bodyLine + '" stroke-width="2"/>';
        o += '<circle cx="1" cy="0" r="11" fill="' + c + '" stroke="' + P.bodyLine + '" stroke-width="2"/>';
        o += '<path d="M11 -4 L19 0 L11 4 Z" fill="' + P.bodyLine + '"/>';
        return o;
      }
      case 'light': {
        var k = C.kelvinToHex(it.kelvin), line = P.bodyLine;
        switch (it.kind) {
          case 'fresnel':
            o += '<rect x="-20" y="-15" width="30" height="30" rx="4" fill="' + P.body + '" stroke="' + line + '" stroke-width="2"/>';
            o += '<rect x="9" y="-13" width="5" height="26" fill="' + k + '" stroke="' + line + '" stroke-width="1.5"/>';
            o += '<path d="M14 -13 L28 -21 M14 13 L28 21" stroke="' + line + '" stroke-width="3" stroke-linecap="round"/>';
            o += '<path d="M-14 -8 h14 M-14 0 h14 M-14 8 h14" stroke="' + line + '" stroke-opacity="0.45" stroke-width="2"/>';
            return o;
          case 'led':
            o += '<path d="M-12 -14 L-4 -14 M-12 14 L-4 14 M-12 -14 L-12 14" stroke="' + line + '" stroke-width="2.5" fill="none"/>';
            o += '<rect x="-4" y="-24" width="12" height="48" rx="2" fill="' + P.body + '" stroke="' + line + '" stroke-width="2"/>';
            for (var j = -18; j <= 18; j += 9) o += '<circle cx="5" cy="' + j + '" r="2.2" fill="' + k + '"/>';
            return o;
          case 'softbox':
            o += '<path d="M-10 -8 L12 -40 L12 40 L-10 8 Z" fill="' + P.body + '" stroke="' + line + '" stroke-width="2" stroke-linejoin="round"/>';
            o += '<rect x="11" y="-40" width="4" height="80" fill="' + k + '" stroke="' + line + '" stroke-width="1"/>';
            o += '<rect x="-14" y="-6" width="5" height="12" fill="' + line + '"/>';
            return o;
          case 'octa': {
            // top view of an octagonal softbox: shallow wide polygon
            o += '<path d="M-14 -6 L-6 -32 L4 -48 L10 -50 L10 50 L4 48 L-6 32 L-14 6 Z" fill="' + P.body + '" stroke="' + line + '" stroke-width="2" stroke-linejoin="round"/>';
            o += '<rect x="9" y="-50" width="4" height="100" fill="' + k + '" stroke="' + line + '" stroke-width="1"/>';
            o += '<path d="M-14 0 L10 -50 M-14 0 L10 50 M-14 0 L10 -25 M-14 0 L10 25" stroke="' + line + '" stroke-opacity="0.35" stroke-width="1.5"/>';
            return o;
          }
          case 'practical':
            o += '<circle r="18" fill="' + P.body + '" stroke="' + line + '" stroke-width="2"/>';
            o += '<circle r="8" fill="' + k + '"/>';
            for (var a = 0; a < 360; a += 45) {
              var ca = Math.cos(rad(a)), sa = Math.sin(rad(a));
              o += '<path d="M' + f(ca * 11) + ' ' + f(sa * 11) + ' L' + f(ca * 15) + ' ' + f(sa * 15) + '" stroke="' + k + '" stroke-width="2" stroke-linecap="round"/>';
            }
            return o;
          case 'tube': {
            var h = (it.length || 1.2) * S / 2;
            o += '<rect x="-5" y="' + f(-h) + '" width="10" height="' + f(2 * h) + '" rx="5" fill="' + k + '" stroke="' + line + '" stroke-width="2"/>';
            o += '<path d="M0 ' + f(-h + 8) + ' V' + f(h - 8) + '" stroke="' + P.white + '" stroke-opacity="0.7" stroke-width="2"/>';
            return o;
          }
          case 'sun':
            o += '<circle r="13" fill="' + k + '" stroke="' + line + '" stroke-width="2"/>';
            for (var b = 0; b < 360; b += 30) {
              var cb = Math.cos(rad(b)), sb = Math.sin(rad(b));
              o += '<path d="M' + f(cb * 17) + ' ' + f(sb * 17) + ' L' + f(cb * 24) + ' ' + f(sb * 24) + '" stroke="' + k + '" stroke-width="3" stroke-linecap="round"/>';
            }
            o += '<path d="M8 0 L20 0" stroke="' + line + '" stroke-width="2.5"/>';
            return o;
        }
        return o;
      }
      case 'modifier': {
        var m = (it.w || 1) * S / 2;
        switch (it.kind) {
          case 'flag':
            o += '<rect x="-3" y="' + f(-m) + '" width="6" height="' + f(2 * m) + '" fill="' + P.black + '" stroke="' + P.inkSoft + '" stroke-width="1.5"/>';
            o += '<circle cx="-9" cy="0" r="3" fill="' + P.inkSoft + '"/><path d="M-9 0 H-3" stroke="' + P.inkSoft + '" stroke-width="2"/>';
            return o;
          case 'bounce':
            o += '<ellipse cx="0" cy="0" rx="5" ry="' + f(m) + '" fill="' + P.white + '" stroke="' + P.inkSoft + '" stroke-width="2"/>';
            o += '<path d="M6 0 L14 0 M10 -4 L14 0 L10 4" stroke="' + P.inkSoft + '" stroke-width="2" fill="none"/>';
            return o;
          case 'diffusion':
            o += '<rect x="-3" y="' + f(-m) + '" width="6" height="' + f(2 * m) + '" fill="' + P.white + '" fill-opacity="0.35" stroke="' + P.ink + '" stroke-width="2" stroke-dasharray="6 4"/>';
            return o;
          case 'negfill':
            o += '<rect x="-4" y="' + f(-m) + '" width="8" height="' + f(2 * m) + '" fill="' + P.black + '" stroke="' + P.black + '" stroke-width="2"/>';
            o += '<path d="M-10 ' + f(-m) + ' V' + f(m) + '" stroke="' + P.inkSoft + '" stroke-width="1.5" stroke-dasharray="3 4"/>';
            return o;
        }
        return o;
      }
      case 'set': {
        var w = (it.w || 1) * S, hh = (it.h || 0.2) * S, x0 = -w / 2, y0 = -hh / 2;
        switch (it.kind) {
          case 'wall':
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" fill="' + P.wall + '" stroke="' + P.furnitureLine + '" stroke-width="1.5"/>';
            for (var hx = x0 + 10; hx < x0 + w; hx += 14) o += '<path d="M' + f(hx) + ' ' + f(y0 + hh) + ' l' + f(Math.min(hh, 10)) + ' ' + f(-hh) + '" stroke="' + P.furnitureLine + '" stroke-opacity="0.5" stroke-width="1"/>';
            return o;
          case 'door':
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" fill="none" stroke="' + P.furnitureLine + '" stroke-width="1" stroke-dasharray="3 3"/>';
            o += '<path d="M' + f(x0) + ' ' + f(y0) + ' V' + f(y0 - w) + '" stroke="' + P.ink + '" stroke-width="3"/>';
            o += '<path d="M' + f(x0) + ' ' + f(y0 - w) + ' A' + f(w) + ' ' + f(w) + ' 0 0 1 ' + f(x0 + w) + ' ' + f(y0) + '" fill="none" stroke="' + P.inkSoft + '" stroke-width="1.5" stroke-dasharray="5 4"/>';
            return o;
          case 'window':
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" fill="' + P.glass + '" fill-opacity="0.35" stroke="' + P.furnitureLine + '" stroke-width="2"/>';
            o += '<path d="M' + f(x0) + ' 0 H' + f(-x0) + '" stroke="' + P.glass + '" stroke-width="2"/>';
            return o;
          case 'table':
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" rx="6" fill="' + P.furniture + '" stroke="' + P.furnitureLine + '" stroke-width="2"/>';
            return o;
          case 'chair':
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" rx="6" fill="' + P.furniture + '" stroke="' + P.furnitureLine + '" stroke-width="2"/>';
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(Math.max(6, hh * 0.22)) + '" rx="3" fill="' + P.furnitureLine + '"/>';
            return o;
          case 'sofa': {
            var arm = Math.min(18, w * 0.12), back = Math.max(10, hh * 0.25);
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(hh) + '" rx="10" fill="' + P.furniture + '" stroke="' + P.furnitureLine + '" stroke-width="2"/>';
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(back) + '" rx="6" fill="' + P.furnitureLine + '" fill-opacity="0.7"/>';
            o += '<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(arm) + '" height="' + f(hh) + '" rx="6" fill="' + P.furnitureLine + '" fill-opacity="0.55"/>';
            o += '<rect x="' + f(-x0 - arm) + '" y="' + f(y0) + '" width="' + f(arm) + '" height="' + f(hh) + '" rx="6" fill="' + P.furnitureLine + '" fill-opacity="0.55"/>';
            o += '<path d="M0 ' + f(y0 + back) + ' V' + f(-y0) + '" stroke="' + P.furnitureLine + '" stroke-width="1.5"/>';
            return o;
          }
        }
        return o;
      }
      case 'track': {
        var l = (it.length || 3) * S / 2;
        for (var t = -l + 10; t <= l - 5; t += 25) o += '<rect x="' + f(t) + '" y="-15" width="6" height="30" fill="' + P.furnitureLine + '" fill-opacity="0.6"/>';
        o += '<path d="M' + f(-l) + ' -10 H' + f(l) + ' M' + f(-l) + ' 10 H' + f(l) + '" stroke="' + P.ink + '" stroke-width="3"/>';
        o += '<rect x="-14" y="-13" width="28" height="26" rx="4" fill="' + P.body + '" stroke="' + P.bodyLine + '" stroke-width="2"/>';
        o += '<path d="M' + f(l - 22) + ' 0 H' + f(l - 4) + ' M' + f(l - 10) + ' -6 L' + f(l - 4) + ' 0 L' + f(l - 10) + ' 6" stroke="' + P.inkSoft + '" stroke-width="2" fill="none"/>';
        return o;
      }
      case 'arrow': {
        var L = (it.length || 2) * S, bend = (it.bend || 0) * L / 2, col = it.color || '#ff6b6b';
        // quadratic curve, tangent at the end gives the head direction
        var cx = L / 2, cy = bend * 2, ang = Math.atan2(0 - cy, L - cx);
        var hx1 = L - 14 * Math.cos(ang - 0.45), hy1 = -14 * Math.sin(ang - 0.45);
        var hx2 = L - 14 * Math.cos(ang + 0.45), hy2 = -14 * Math.sin(ang + 0.45);
        o += '<path d="M0 0 Q' + f(cx) + ' ' + f(cy) + ' ' + f(L) + ' 0" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="12 7"/>';
        o += '<path d="M' + f(hx1) + ' ' + f(hy1) + ' L' + f(L) + ' 0 L' + f(hx2) + ' ' + f(hy2) + ' Z" fill="' + col + '" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
        o += '<circle r="5" fill="' + col + '"/>';
        return o;
      }
      case 'note': {
        var sz = it.size || 16, lines = String(it.text || '').split('\n');
        o += '<text x="0" y="0" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="' + sz + '" fill="' + (it.color || P.ink) + '" font-weight="600">';
        lines.forEach(function (ln, i) { o += '<tspan x="0" dy="' + (i ? f(sz * 1.25) : 0) + '">' + esc(ln) + '</tspan>'; });
        o += '</text>';
        return o;
      }
    }
    return o;
  }

  /* ------------------------------------------------------------------ */
  /* Beams and camera field of view                                     */
  /* ------------------------------------------------------------------ */
  function wedge(r, deg) {
    if (deg >= 359) return 'M' + f(r) + ' 0 A' + f(r) + ' ' + f(r) + ' 0 1 1 ' + f(-r) + ' 0 A' + f(r) + ' ' + f(r) + ' 0 1 1 ' + f(r) + ' 0 Z';
    var h = rad(deg / 2), x = Math.cos(h) * r, y = Math.sin(h) * r;
    return 'M0 0 L' + f(x) + ' ' + f(-y) + ' A' + f(r) + ' ' + f(r) + ' 0 ' + (deg > 180 ? 1 : 0) + ' 1 ' + f(x) + ' ' + f(y) + ' Z';
  }

  /** Mix two #rrggbb colours (t = share of b). */
  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return '#' + pa.map(function (v, i) { var m = Math.round(v + (pb[i] - v) * t); return (m < 16 ? '0' : '') + m.toString(16); }).join('');
  }

  function beam(it, P, uidPrefix) {
    var r = Math.max(0.2, it.throw || 3) * S, k = C.kelvinToHex(it.kelvin);
    // on white paper a near-white daylight beam would vanish: tone it down
    if (P.beamMix) k = mix(k, P.beamMix, 0.38);
    var op = 0.12 + 0.5 * C.clamp(it.intensity, 0, 100) / 100;
    var gid = (uidPrefix || 'g') + '-' + it.id;
    var o = '<radialGradient id="' + gid + '" cx="0" cy="0" r="' + f(r) + '" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="' + k + '" stop-opacity="' + f(op) + '"/>' +
      '<stop offset="0.65" stop-color="' + k + '" stop-opacity="' + f(op * 0.45) + '"/>' +
      '<stop offset="1" stop-color="' + k + '" stop-opacity="0"/></radialGradient>';
    o += '<path d="' + wedge(r, C.clamp(it.beam, 1, 360)) + '" fill="url(#' + gid + ')" stroke="' + k + '" stroke-opacity="' + f(op * 0.8) + '" stroke-width="1.2"/>';
    return o;
  }

  function fov(it, P) {
    var a = C.fovDeg(it.focal, it.sensor), r = Math.max(0.3, it.range || 4) * S;
    var h = rad(a / 2), x = Math.cos(h) * r, y = Math.sin(h) * r;
    var o = '<path d="M28 0 L' + f(x) + ' ' + f(-y) + ' L' + f(x) + ' ' + f(y) + ' Z" fill="' + P.fov + '" fill-opacity="0.09" stroke="' + P.fov + '" stroke-opacity="0.8" stroke-width="1.5" stroke-dasharray="8 6"/>';
    o += '<path d="M30 0 H' + f(r) + '" stroke="' + P.fov + '" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="2 6"/>';
    return o;
  }

  function tf(it) { return 'translate(' + f(it.x * S) + ' ' + f(it.y * S) + ') rotate(' + f(it.rot || 0) + ')'; }

  /* ------------------------------------------------------------------ */
  /* Whole stage                                                        */
  /* ------------------------------------------------------------------ */
  /**
   * Render the plan. opts: { palette, labels: {fn(it)->string}, selectedId,
   * zoom, idPrefix, interactive }.
   * Returns { defs, grid, beams, items, labels, overlay } markup strings.
   */
  function stageLayers(doc, opts) {
    opts = opts || {};
    var P = PALETTES[opts.palette] || PALETTES.dark, W = doc.stage.w * S, H = doc.stage.h * S;
    var out = { defs: '', grid: '', beams: '', items: '', labels: '', overlay: '' };
    // stage + grid
    out.grid += '<rect x="0" y="0" width="' + f(W) + '" height="' + f(H) + '" fill="' + P.stage + '"/>';
    if (doc.show.grid) {
      var step = (doc.grid || 0.5) * S, minor = '', major = '';
      for (var gx = step; gx < W - 0.01; gx += step) {
        var isMajor = Math.abs(gx / S - Math.round(gx / S)) < 1e-6;
        (isMajor ? (major += 'M' + f(gx) + ' 0V' + f(H)) : (minor += 'M' + f(gx) + ' 0V' + f(H)));
      }
      for (var gy = step; gy < H - 0.01; gy += step) {
        var isM = Math.abs(gy / S - Math.round(gy / S)) < 1e-6;
        (isM ? (major += 'M0 ' + f(gy) + 'H' + f(W)) : (minor += 'M0 ' + f(gy) + 'H' + f(W)));
      }
      if (minor) out.grid += '<path d="' + minor + '" stroke="' + P.grid + '" stroke-width="1"/>';
      if (major) out.grid += '<path d="' + major + '" stroke="' + P.gridMajor + '" stroke-width="1.4"/>';
    }
    out.grid += '<rect x="0" y="0" width="' + f(W) + '" height="' + f(H) + '" fill="none" stroke="' + P.border + '" stroke-width="2"/>';
    // metre rulers
    var ruler = '';
    for (var mx = 0; mx <= doc.stage.w + 1e-6; mx += (doc.stage.w > 30 ? 5 : 1)) ruler += '<text x="' + f(mx * S) + '" y="-8" text-anchor="middle">' + mx + '</text>';
    for (var my = 0; my <= doc.stage.h + 1e-6; my += (doc.stage.h > 30 ? 5 : 1)) ruler += '<text x="-8" y="' + f(my * S + 4) + '" text-anchor="end">' + my + '</text>';
    out.grid += '<g font-family="system-ui, sans-serif" font-size="11" fill="' + P.inkSoft + '">' + ruler + '</g>';

    var pre = opts.idPrefix || 'b';
    doc.items.forEach(function (it) {
      if (it.type === 'light' && doc.show.beams) out.beams += '<g transform="' + tf(it) + '" pointer-events="none">' + beam(it, P, pre) + '</g>';
      if (it.type === 'camera' && doc.show.fov) out.beams += '<g transform="' + tf(it) + '" pointer-events="none">' + fov(it, P) + '</g>';
    });
    // beam gradients must live in <defs> for some renderers: move them
    out.beams = out.beams.replace(/<radialGradient[\s\S]*?<\/radialGradient>/g, function (m) { out.defs += m; return ''; });

    doc.items.forEach(function (it) {
      var b = bbox(it);
      out.items += '<g class="item" data-id="' + esc(it.id) + '" transform="' + tf(it) + '">' +
        (opts.interactive ? '<rect class="hit" x="' + f(b.x0 - 4) + '" y="' + f(b.y0 - 4) + '" width="' + f(b.x1 - b.x0 + 8) + '" height="' + f(b.y1 - b.y0 + 8) + '" fill="transparent"/>' : '') +
        shape(it, P) + '</g>';
      if (doc.show.labels) {
        var text = opts.labelFor ? opts.labelFor(it) : it.label;
        var lx = it.x * S, ly = it.y * S + (it.type === 'note' ? 0 : labelOffset(it));
        if (text && it.type !== 'note') {
          out.labels += '<text x="' + f(lx) + '" y="' + f(ly) + '" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="' + P.ink + '" stroke="' + P.stage + '" stroke-width="3" paint-order="stroke">' + esc(text) + '</text>';
        }
        if (it.type === 'light') {
          var rc = ROLE_COLORS[it.role] || '#999', bx = it.x * S + 22, by = it.y * S - 22;
          out.labels += '<g transform="translate(' + f(bx) + ' ' + f(by) + ')"><circle r="9" fill="' + rc + '" stroke="' + P.stage + '" stroke-width="2"/>' +
            '<text y="3.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="' + (ROLE_LETTERS[it.role].length > 1 ? 7.5 : 10) + '" font-weight="800" fill="#111">' + ROLE_LETTERS[it.role] + '</text></g>';
        }
      }
    });

    if (opts.selectedId) {
      var sel = null;
      doc.items.forEach(function (it) { if (it.id === opts.selectedId) sel = it; });
      if (sel) {
        var z = opts.zoom || 1, bb = bbox(sel), hl = (bb.x1 + 26 / z);
        out.overlay += '<g transform="' + tf(sel) + '">' +
          '<rect x="' + f(bb.x0 - 6) + '" y="' + f(bb.y0 - 6) + '" width="' + f(bb.x1 - bb.x0 + 12) + '" height="' + f(bb.y1 - bb.y0 + 12) + '" fill="none" stroke="' + P.sel + '" stroke-width="' + f(1.5 / z) + '" stroke-dasharray="' + f(6 / z) + ' ' + f(4 / z) + '" pointer-events="none"/>' +
          '<path d="M' + f(bb.x1 + 6) + ' 0 H' + f(hl) + '" stroke="' + P.sel + '" stroke-width="' + f(1.5 / z) + '" pointer-events="none"/>' +
          '<circle class="rot-handle" data-handle="rot" cx="' + f(hl) + '" cy="0" r="' + f(8 / z) + '" fill="' + P.sel + '" stroke="' + P.stage + '" stroke-width="' + f(2 / z) + '"/>' +
          '<circle data-handle="rot" cx="' + f(hl) + '" cy="0" r="' + f(18 / z) + '" fill="transparent"/>' +
          '</g>';
      }
    }
    return out;
  }

  /** Standalone SVG document of the plan (for SVG / PNG / print export). */
  function exportSvg(doc, opts) {
    opts = opts || {};
    var P = PALETTES[opts.palette] || PALETTES.light, W = doc.stage.w * S, H = doc.stage.h * S;
    var m = 40, top = doc.title ? 70 : 40, bottom = 60;
    var L = stageLayers(doc, { palette: opts.palette || 'light', labelFor: opts.labelFor, idPrefix: 'x' });
    var o = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(W + 2 * m) + '" height="' + f(H + top + bottom) + '" viewBox="' + f(-m) + ' ' + f(-top) + ' ' + f(W + 2 * m) + ' ' + f(H + top + bottom) + '">';
    o += '<title>' + esc(doc.title || 'Éclairage Atelier') + '</title><defs>' + L.defs + '</defs>';
    o += '<rect x="' + f(-m) + '" y="' + f(-top) + '" width="' + f(W + 2 * m) + '" height="' + f(H + top + bottom) + '" fill="' + P.bg + '"/>';
    if (doc.title) o += '<text x="0" y="' + f(-top + 32) + '" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="' + P.ink + '">' + esc(doc.title) + '</text>';
    o += L.grid + L.beams + L.items + L.labels;
    // scale bar 1 m
    o += '<g transform="translate(0 ' + f(H + 34) + ')" font-family="system-ui, sans-serif" font-size="12" fill="' + P.inkSoft + '">' +
      '<path d="M0 0 H100 M0 -5 V5 M100 -5 V5" stroke="' + P.ink + '" stroke-width="2"/><text x="50" y="18" text-anchor="middle">1 m</text>' +
      '<text x="' + f(W) + '" y="18" text-anchor="end">' + esc(opts.footer || ('Éclairage Atelier · ' + doc.stage.w + ' × ' + doc.stage.h + ' m')) + '</text></g>';
    o += '</svg>';
    return o;
  }

  /** Small pictogram for the palette (an item drawn in a fixed box). */
  function paletteIcon(type, kind, P) {
    P = PALETTES[P] || PALETTES.dark;
    var it = C.createItem(type, kind, 0, 0);
    it.rot = 0;
    if (type === 'modifier') it.w = 0.7;
    if (type === 'set') { if (kind === 'wall') { it.w = 1; it.h = 0.18; } if (kind === 'sofa') { it.w = 1; it.h = 0.55; } if (kind === 'table') { it.w = 0.9; it.h = 0.6; } if (kind === 'door') { it.w = 0.6; } if (kind === 'window') it.w = 0.9; }
    if (type === 'track') it.length = 1;
    if (type === 'arrow') { it.length = 0.8; it.bend = 0.4; }
    if (type === 'light' && kind === 'tube') it.length = 0.9;
    if (type === 'note') { it.text = 'Aa'; it.size = 34; }
    var vb = { camera: '-30 -30 62 60', subject: '-30 -30 60 60', track: '-55 -30 110 60', arrow: '-8 -40 96 60', note: '-6 -34 56 44', modifier: '-24 -40 48 80' }[type] || '-56 -56 112 112';
    if (type === 'light' && (kind === 'fresnel' || kind === 'practical' || kind === 'sun' || kind === 'led')) vb = '-32 -32 64 64';
    if (type === 'set' && kind === 'chair') vb = '-36 -36 72 72';
    if (type === 'set' && kind === 'door') vb = '-40 -76 80 90';
    return '<svg viewBox="' + vb + '" aria-hidden="true" focusable="false">' + shape(it, P) + '</svg>';
  }

  var api = { S: S, PALETTES: PALETTES, ROLE_COLORS: ROLE_COLORS, ROLE_LETTERS: ROLE_LETTERS, bbox: bbox, shape: shape, stageLayers: stageLayers, exportSvg: exportSvg, paletteIcon: paletteIcon, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EARender = api;
})(this);
