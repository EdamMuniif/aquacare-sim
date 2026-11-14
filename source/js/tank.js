/*
 * AquaCare digital prototype - animated tank scene (SVG), v2
 * Decorative illustration of a small freshwater tank with the PROPOSED feeder,
 * probes and controller enclosure. Fish and shrimp are decorative: they never
 * approach or eat the food, because the system cannot detect consumption.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var SIZES = {               // visual scale per demo tank size (illustrative, not real dimensions)
    '2.5': { w: 430, h: 270 },
    '3':   { w: 460, h: 280 },
    '5':   { w: 540, h: 300 },
    '7.5': { w: 610, h: 320 },
    '10':  { w: 680, h: 340 },
    'p3':  { w: 480, h: 345 }      // 36 x 22 x 26 cm tank from reviewed paper [3] (front-view proportions)
  };
  var VB_W = 800, BOTTOM = 432;

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function Tank(svg) {
    this.svg = svg;
    this.animate = true;
    this.fish = []; this.shrimp = []; this.pellets = []; this.bubbles = [];
    this.last = 0; this.servoAngle = 0; this.servoTarget = 0; this.beam = 'idle';
    this.buttonHandler = null;
    this.render('5');
    var self = this;
    requestAnimationFrame(function loop(t) { self.frame(t); requestAnimationFrame(loop); });
  }

  Tank.prototype.render = function (size) {
    size = String(size);
    if (!SIZES[size]) size = '5';
    var d = SIZES[size], svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var tw = d.w, th = d.h, tx = (VB_W - tw) / 2, top = BOTTOM - th;
    var G = this.g = { tx: tx, tw: tw, top: top, bottom: BOTTOM, water: top + 22 };
    var sandTop = this.sandTop = BOTTOM - 34;
    var X = function (f) { return tx + tw * f; };

    var defs = el('defs', {}, svg);
    defs.innerHTML =
      '<linearGradient id="aqWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b8a9c"/><stop offset=".55" stop-color="#17606f"/><stop offset="1" stop-color="#0d3f4c"/></linearGradient>' +
      '<linearGradient id="aqSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b48a"/><stop offset="1" stop-color="#9c8762"/></linearGradient>' +
      '<linearGradient id="aqRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="aqGlass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".08" stop-color="#fff" stop-opacity="0"/><stop offset=".92" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>' +
      '<linearGradient id="aqEnclosure" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26343d"/><stop offset="1" stop-color="#1a252c"/></linearGradient>' +
      '<linearGradient id="aqWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5a40"/><stop offset="1" stop-color="#4a3424"/></linearGradient>' +
      '<radialGradient id="aqCave" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#04161c"/><stop offset="1" stop-color="#0b2e38"/></radialGradient>' +
      '<linearGradient id="aqRock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f8d92"/><stop offset="1" stop-color="#535f64"/></linearGradient>' +
      '<clipPath id="aqClip"><rect x="' + tx + '" y="' + G.water + '" width="' + tw + '" height="' + (BOTTOM - G.water) + '"/></clipPath>' +
      '<pattern id="aqGrain" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#7d6b4b" opacity=".45"/><circle cx="6.5" cy="5" r=".7" fill="#e7d7b2" opacity=".5"/></pattern>';

    el('line', { x1: 0, y1: BOTTOM + 8, x2: VB_W, y2: BOTTOM + 8, stroke: '#3a4a54', 'stroke-width': 1 }, svg);

    var water = el('g', { 'clip-path': 'url(#aqClip)' }, svg);
    el('rect', { x: tx, y: G.water, width: tw, height: BOTTOM - G.water, fill: 'url(#aqWater)' }, water);
    var rays = el('g', {}, water);
    [0.18, 0.42, 0.7].forEach(function (f, i) {
      var x = X(f);
      el('polygon', { points: (x - 18) + ',' + G.water + ' ' + (x + 26) + ',' + G.water + ' ' + (x + 70 + i * 10) + ',' + BOTTOM + ' ' + (x - 10 + i * 6) + ',' + BOTTOM, fill: 'url(#aqRay)' }, rays);
    });
    var wave = '';
    for (var wx = tx - 80; wx < tx + tw + 80; wx += 40) wave += (wave ? ' ' : 'M' + wx + ',' + G.water + ' ') + 'q10,-4 20,0 t20,0';
    el('path', { d: wave, fill: 'none', stroke: '#9fd8e3', 'stroke-opacity': '.55', 'stroke-width': 1.5, class: 'aq-surface' }, water);

    // --- back layer: tall stem plants (darker, behind everything) ---
    var back = el('g', { opacity: '.85' }, water);
    [[0.05, 0.86, '#24603a'], [0.12, 0.7, '#2c6d40'], [0.37, 0.78, '#2a6a3e'], [0.95, 0.82, '#255f39']].forEach(function (p, i) {
      stemPlant(back, X(p[0]), sandTop + 6, (BOTTOM - G.water) * p[1], p[2], i);
    });

    // --- driftwood with moss and java-fern style leaves ---
    var wood = el('g', {}, water);
    var w0 = X(0.14), w1 = X(0.50), wy = sandTop + 6;
    el('path', {
      d: 'M' + w0 + ',' + wy + ' C' + (w0 + 40) + ',' + (wy - 18) + ' ' + (w0 + 90) + ',' + (wy - 30) + ' ' + (w0 + 130) + ',' + (wy - 62) +
         ' L' + (w0 + 150) + ',' + (wy - 96) + ' L' + (w0 + 156) + ',' + (wy - 92) + ' L' + (w0 + 142) + ',' + (wy - 58) +
         ' C' + (w0 + 170) + ',' + (wy - 70) + ' ' + (w1 - 10) + ',' + (wy - 66) + ' ' + w1 + ',' + (wy - 80) +
         ' L' + (w1 + 6) + ',' + (wy - 74) + ' C' + (w1 - 20) + ',' + (wy - 52) + ' ' + (w0 + 150) + ',' + (wy - 44) + ' ' + (w0 + 120) + ',' + (wy - 30) +
         ' C' + (w0 + 90) + ',' + (wy - 10) + ' ' + (w0 + 40) + ',' + (wy + 2) + ' ' + (w0 + 6) + ',' + (wy + 6) + 'Z',
      fill: 'url(#aqWood)', stroke: '#3a291c', 'stroke-width': 1
    }, wood);
    el('path', { d: 'M' + (w0 + 30) + ',' + (wy - 6) + ' C' + (w0 + 70) + ',' + (wy - 18) + ' ' + (w0 + 100) + ',' + (wy - 30) + ' ' + (w0 + 126) + ',' + (wy - 52), fill: 'none', stroke: '#9c7a5a', 'stroke-opacity': '.45', 'stroke-width': 1.2 }, wood);
    // moss tufts
    for (var m = 0; m < 9; m++) {
      var mx = w0 + 40 + m * 14 + (m % 2) * 4, my = wy - 14 - m * 6.4 + (m > 5 ? (m - 5) * 6 : 0);
      el('ellipse', { cx: mx, cy: my, rx: 6 + (m % 3), ry: 3.6, fill: m % 2 ? '#4f9a4a' : '#3f8a44', opacity: '.95' }, wood);
    }
    // fern leaves
    var fern = el('g', { class: 'aq-plant', style: 'animation-duration:9s' }, wood);
    [[-28, 54], [-8, 62], [14, 50], [32, 40]].forEach(function (L) {
      var bx = w0 + 140, by = wy - 66;
      el('path', { d: 'M' + bx + ',' + by + ' q' + (L[0] * 0.5) + ',' + (-L[1] * 0.6) + ' ' + L[0] + ',' + (-L[1]) + ' q' + (-L[0] * 0.15) + ',' + (L[1] * 0.5) + ' ' + (-L[0] + 4) + ',' + L[1] + 'Z', fill: '#2f7a3c', stroke: '#24602f', 'stroke-width': .8 }, fern);
    });

    // --- sand and stones ---
    el('path', { d: 'M' + tx + ',' + (sandTop + 6) + ' Q' + X(0.3) + ',' + (sandTop - 6) + ' ' + X(0.55) + ',' + (sandTop + 2) + ' T' + (tx + tw) + ',' + (sandTop - 2) + ' V' + BOTTOM + ' H' + tx + 'Z', fill: 'url(#aqSand)' }, water);
    el('rect', { x: tx, y: sandTop - 6, width: tw, height: 40, fill: 'url(#aqGrain)', opacity: '.8' }, water);
    el('ellipse', { cx: X(0.52), cy: sandTop + 12, rx: 16, ry: 8, fill: '#748287' }, water);
    el('ellipse', { cx: X(0.08), cy: sandTop + 14, rx: 14, ry: 7, fill: '#6a777b' }, water);

    // --- cave: dark opening behind fish, rock arch in front of fish (a hiding place) ---
    var cx0 = X(0.60), cw = tw * 0.17, ch = 66, cyb = sandTop + 10;
    this.cave = { x: cx0 + cw / 2, y: cyb - ch * 0.38 };
    el('ellipse', { cx: cx0 + cw / 2, cy: cyb - ch * 0.36, rx: cw * 0.30, ry: ch * 0.34, fill: 'url(#aqCave)' }, water);

    this.fishGroup = el('g', {}, water);
    var caveFront = el('g', {}, water);
    el('path', {
      d: 'M' + cx0 + ',' + cyb + ' C' + (cx0 - 4) + ',' + (cyb - ch * 0.6) + ' ' + (cx0 + cw * 0.18) + ',' + (cyb - ch) + ' ' + (cx0 + cw * 0.5) + ',' + (cyb - ch) +
         ' C' + (cx0 + cw * 0.84) + ',' + (cyb - ch) + ' ' + (cx0 + cw + 6) + ',' + (cyb - ch * 0.55) + ' ' + (cx0 + cw) + ',' + cyb +
         ' L' + (cx0 + cw * 0.78) + ',' + cyb + ' C' + (cx0 + cw * 0.8) + ',' + (cyb - ch * 0.5) + ' ' + (cx0 + cw * 0.66) + ',' + (cyb - ch * 0.72) + ' ' + (cx0 + cw * 0.5) + ',' + (cyb - ch * 0.72) +
         ' C' + (cx0 + cw * 0.34) + ',' + (cyb - ch * 0.72) + ' ' + (cx0 + cw * 0.2) + ',' + (cyb - ch * 0.5) + ' ' + (cx0 + cw * 0.22) + ',' + cyb + 'Z',
      fill: 'url(#aqRock)', stroke: '#3e4a4f', 'stroke-width': 1
    }, caveFront);
    el('path', { d: 'M' + (cx0 + cw * 0.12) + ',' + (cyb - ch * 0.62) + ' q' + (cw * 0.2) + ',' + (-ch * 0.26) + ' ' + (cw * 0.42) + ',' + (-ch * 0.3), fill: 'none', stroke: '#a8b5b9', 'stroke-opacity': '.5', 'stroke-width': 1.4 }, caveFront);
    el('ellipse', { cx: cx0 - 6, cy: cyb + 2, rx: 14, ry: 8, fill: '#5d6b70' }, caveFront);
    el('ellipse', { cx: cx0 + cw + 8, cy: cyb + 3, rx: 11, ry: 6, fill: '#6a777b' }, caveFront);
    el('ellipse', { cx: cx0 + cw * 0.5, cy: cyb - ch * 1.02, rx: 7, ry: 3, fill: '#4f9a4a' }, caveFront);

    // --- foreground plants and carpet ---
    var self = this;
    this.plantGroup = el('g', {}, water);
    [{ f: 0.24, h: 0.40, c: '#5aa860', n: 4 }, { f: 0.30, h: 0.30, c: '#62b067', n: 3 },
     { f: 0.86, h: 0.66, c: '#2f7a45', n: 6 }, { f: 0.91, h: 0.42, c: '#62b067', n: 4 }].forEach(function (p, pi) {
      var bx = X(p.f), by = sandTop + 8, H = (BOTTOM - G.water) * p.h;
      var pg = el('g', { class: 'aq-plant', style: 'animation-delay:' + (-pi * 1.3) + 's' }, self.plantGroup);
      for (var i = 0; i < p.n; i++) {
        var off = (i - (p.n - 1) / 2) * 7, hh = H * (0.65 + 0.35 * ((i * 37 % 10) / 10)), lean = (i % 2 ? 1 : -1) * (10 + i * 3);
        el('path', {
          d: 'M' + (bx + off) + ',' + by + ' C' + (bx + off + lean * 0.2) + ',' + (by - hh * 0.4) + ' ' + (bx + off + lean) + ',' + (by - hh * 0.7) + ' ' + (bx + off + lean * 0.8) + ',' + (by - hh) +
             ' C' + (bx + off + lean * 0.5) + ',' + (by - hh * 0.7) + ' ' + (bx + off + 6) + ',' + (by - hh * 0.4) + ' ' + (bx + off + 5) + ',' + by + 'Z',
          fill: p.c, opacity: (0.78 + (i % 3) * 0.07).toFixed(2)
        }, pg);
      }
    });
    var carpet = el('g', {}, water);
    for (var c = 0; c < 22; c++) {
      var fx = X(0.03 + c * 0.044), fy = BOTTOM - 6 - (c % 3) * 2;
      if (fx > cx0 - 10 && fx < cx0 + cw + 10) continue;
      for (var b = 0; b < 4; b++) el('path', { d: 'M' + (fx + b * 2.4) + ',' + fy + ' q' + (b - 1.5) * 2 + ',-7 ' + (b - 1.5) * 3 + ',-' + (9 + (b * 7 + c) % 5), stroke: c % 2 ? '#6cc06a' : '#58ad5c', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, carpet);
    }

    // --- shrimp (decorative) ---
    this.shrimpGroup = el('g', {}, water);
    this.shrimp = [];
    var shrimpSpots = [[0.33, BOTTOM - 14], [0.47, BOTTOM - 10], [0.80, BOTTOM - 12]];
    shrimpSpots.forEach(function (sp, i) {
      var g = el('g', {}, self.shrimpGroup);
      var body = el('g', {}, g);
      el('path', { d: 'M-8,0 C-6,-6 4,-7 8,-2 C9,0 7,2 4,2 C0,3 -4,3 -8,0Z', fill: i === 1 ? '#e05a46' : '#cf3f33' }, body);
      el('path', { d: 'M-8,0 l-4,-3 l1,4 Z', fill: '#b83a2f' }, body);
      for (var l = 0; l < 4; l++) el('line', { x1: -3 + l * 2.4, y1: 2, x2: -4 + l * 2.4, y2: 5.5, stroke: '#a83228', 'stroke-width': .7 }, body);
      var ant = el('path', { d: 'M8,-2 q8,-8 16,-6 M8,-2 q7,-3 14,1', fill: 'none', stroke: '#e8a49b', 'stroke-width': .6 }, body);
      el('circle', { cx: 6.2, cy: -2.6, r: .9, fill: '#111' }, body);
      self.shrimp.push({ g: g, ant: ant, x: X(sp[0]), y: sp[1], min: X(sp[0]) - 40, max: X(sp[0]) + 40, vx: 0, dir: i % 2 ? -1 : 1, pause: rnd(0, 3), ph: i * 2 });
    });

    // --- fish (decorative, generic) ---
    this.fish = [];
    var big = [['#e8955a', '#c86f37', 1], ['#a9cbd9', '#7aa5b8', .86], ['#e2c66b', '#b99a3d', .95], ['#ef8a7a', '#c9604f', .72]];
    var minY = G.water + 34, maxY = sandTop - 30;
    this.bounds = { left: tx + 34, right: tx + tw - 100, minY: minY, maxY: maxY };
    big.forEach(function (col, f) {
      var fg = el('g', {}, self.fishGroup), body = el('g', {}, fg);
      el('path', { d: 'M-20,0 L-31,-9 L-28,0 L-31,9 Z', fill: col[1] }, body);
      el('ellipse', { cx: 0, cy: 0, rx: 21, ry: 10.5, fill: col[0] }, body);
      el('path', { d: 'M-4,-9 Q2,-17 9,-9 Z', fill: col[1], opacity: '.9' }, body);
      el('path', { d: 'M6,-9 Q10,0 6,9', fill: 'none', stroke: col[1], 'stroke-width': 1.2, opacity: '.7' }, body);
      el('circle', { cx: 12, cy: -2.5, r: 2.4, fill: '#0f1b22' }, body);
      el('circle', { cx: 12.8, cy: -3.2, r: .8, fill: '#fff' }, body);
      self.fish.push(self.makeFish(fg, col[2], X(0.25 + f * 0.17), minY + (maxY - minY) * ((f * 0.29 + 0.2) % 1), f === 3, 24 + f * 3));
    });
    // a small school of slender fish
    this.school = { x: X(0.4), y: minY + 30, tx: X(0.6), ty: minY + 40, vx: 0, vy: 0 };
    for (var n = 0; n < 6; n++) {
      var sg = el('g', {}, this.fishGroup), sb = el('g', {}, sg);
      el('path', { d: 'M-8,0 L-13,-4 L-12,0 L-13,4 Z', fill: '#d8564a' }, sb);
      el('ellipse', { cx: 0, cy: 0, rx: 9, ry: 3.4, fill: '#c9d6db' }, sb);
      el('path', { d: 'M-6,-.6 L8,-.6', stroke: '#3fb5e6', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, sb);
      el('path', { d: 'M-7,1.4 L-1,1.4', stroke: '#d8564a', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, sb);
      el('circle', { cx: 5.6, cy: -1.2, r: 1, fill: '#111' }, sb);
      this.fish.push({ g: sg, school: true, off: { x: (n % 3) * 16 - 16 + (n > 2 ? 8 : 0), y: (n > 2 ? 12 : 0) + (n % 2) * 4 }, x: X(0.4), y: minY + 30, dir: 1, sdir: 1, scale: 1, ph: n * 0.9 });
    }

    // bubbles from an air stone (decorative)
    this.bubbleGroup = el('g', { class: 'aq-bubbles' }, water);
    this.bubbles = [];
    for (var bb = 0; bb < 9; bb++) {
      var bub = el('circle', { r: 1.6 + (bb % 3), fill: 'none', stroke: '#d8f3f8', 'stroke-opacity': '.7', 'stroke-width': 1 }, this.bubbleGroup);
      this.bubbles.push({ node: bub, x: X(0.54) + (bb % 3) * 3, y: BOTTOM - 30 - bb * 32, sp: 26 + (bb % 4) * 7, ph: bb });
    }
    el('ellipse', { cx: X(0.54) + 3, cy: sandTop + 4, rx: 8, ry: 3.5, fill: '#8e9ca1' }, water);

    // turbidity haze (follows simulated turbidity), heater shown only during a heater test
    this.haze = el('rect', { x: tx, y: G.water, width: tw, height: BOTTOM - G.water, fill: '#7a5a34', opacity: 0, 'pointer-events': 'none' }, water);
    this.heater = el('g', { opacity: 0 }, water);
    el('rect', { x: tx + 14, y: G.water + 26, width: 10, height: 110, rx: 5, fill: '#c9d3d6', stroke: '#7d8a90' }, this.heater);
    this.heaterCoil = el('rect', { x: tx + 16, y: G.water + 40, width: 6, height: 80, rx: 3, fill: '#ff7a3d' }, this.heater);
    var hl = el('text', { x: tx + 30, y: G.water + 40, class: 'aq-label aq-label--sub' }, this.heater); hl.textContent = 'Heater (test)';
    this.tProbeX = tx + tw - 94;
    this.bubStream = el('g', { opacity: 0 }, water);
    this.bubDots = [];
    for (var q = 0; q < 6; q++) {
      var bd = el('circle', { r: 1.5 + (q % 3) * 0.8, fill: 'none', stroke: '#e6fbff', 'stroke-width': 1 }, this.bubStream);
      this.bubDots.push({ node: bd, y: top + 120 - q * 14, ph: q });
    }

    this.pelletGroup = el('g', {}, svg);
    this.pellets = [];

    // tank frame + lid
    el('rect', { x: tx, y: top, width: tw, height: th, fill: 'url(#aqGlass)', stroke: '#b8d4dc', 'stroke-opacity': '.55', 'stroke-width': 2, rx: 3 }, svg);
    el('rect', { x: tx - 4, y: BOTTOM - 4, width: tw + 8, height: 8, fill: '#33434c', rx: 2 }, svg);
    el('rect', { x: tx - 4, y: top - 10, width: tw + 8, height: 12, fill: '#33434c', rx: 2 }, svg);

    // feeder (proposed)
    var cx = tx + 74;
    this.chuteX = cx;
    var feeder = el('g', {}, svg);
    el('path', { d: 'M' + (cx - 30) + ',' + (top - 92) + ' H' + (cx + 30) + ' L' + (cx + 14) + ',' + (top - 50) + ' H' + (cx - 14) + 'Z', fill: '#d9e3e7', stroke: '#8fa3ac', 'stroke-width': 1.5 }, feeder);
    for (var k = 0; k < 7; k++) el('circle', { cx: cx - 16 + (k * 9) % 32, cy: top - 66 - (k % 3) * 5, r: 2.4, fill: '#a0703c' }, feeder);
    el('rect', { x: cx - 18, y: top - 50, width: 36, height: 22, fill: '#2e3c45', rx: 3 }, feeder);
    this.servoArm = el('rect', { x: cx - 2, y: top - 47, width: 4, height: 16, fill: '#f2c230', rx: 1 }, feeder);
    el('rect', { x: cx - 7, y: top - 28, width: 14, height: 46, fill: '#c7d3d8', stroke: '#8fa3ac', 'stroke-width': 1.2 }, feeder);
    el('rect', { x: cx - 15, y: top - 12, width: 7, height: 10, fill: '#46565f', rx: 1 }, feeder);
    el('rect', { x: cx + 8, y: top - 12, width: 7, height: 10, fill: '#46565f', rx: 1 }, feeder);
    this.beamLine = el('line', { x1: cx - 8, y1: top - 7, x2: cx + 8, y2: top - 7, stroke: '#ff6b5a', 'stroke-width': 2, 'stroke-dasharray': '2 2' }, feeder);
    el('text', { x: cx + 36, y: top - 74, class: 'aq-label' }, feeder).textContent = 'Feeder (proposed)';
    el('text', { x: cx + 36, y: top - 58, class: 'aq-label aq-label--sub' }, feeder).textContent = 'servo + chute';
    this.beamLabel = el('text', { x: cx + 20, y: top - 16, class: 'aq-label aq-label--sub' }, feeder);
    this.beamLabel.textContent = 'IR beam-break';

    // probes (proposed): pH and DS18B20 from the brief; TDS and turbidity from reviewed paper [2]
    var probes = el('g', {}, svg);
    this.probeHeads = {};
    var self3 = this;
    [{ k: 'tds', x: tx + tw - 124, len: 118, w: 4, tip: 'rect', label: 'TDS', row: 0 },
     { k: 'turb', x: tx + tw - 94, len: 104, w: 6, tip: 'box', label: 'Turbidity', row: 1 },
     { k: 'ph', x: tx + tw - 64, len: 150, w: 5, tip: 'bulb', label: 'pH', row: 0 },
     { k: 'temp', x: tx + tw - 34, len: 190, w: 3.5, tip: 'rod', label: 'DS18B20', row: 1 }].forEach(function (pr) {
      self3.probeHeads[pr.k] = el('rect', { x: pr.x - 4, y: top - 26, width: 8, height: 24, fill: '#3b4b55', rx: 2 }, probes);
      el('line', { x1: pr.x, y1: top - 2, x2: pr.x, y2: top + pr.len, stroke: '#232a2e', 'stroke-width': pr.w, 'stroke-linecap': 'round' }, probes);
      if (pr.tip === 'bulb') el('ellipse', { cx: pr.x, cy: top + pr.len + 4, rx: 4.5, ry: 7, fill: '#cfe3ea', stroke: '#2a2f33', 'stroke-width': 1.5 }, probes);
      else if (pr.tip === 'rod') el('rect', { x: pr.x - 3, y: top + pr.len - 8, width: 6, height: 16, fill: '#9aa7ad', rx: 2 }, probes);
      else if (pr.tip === 'box') el('rect', { x: pr.x - 6, y: top + pr.len - 4, width: 12, height: 16, fill: '#2d3a42', stroke: '#9aa7ad', rx: 2 }, probes);
      else { el('line', { x1: pr.x - 2, y1: top + pr.len, x2: pr.x - 2, y2: top + pr.len + 10, stroke: '#c0ccd1', 'stroke-width': 1.4 }, probes); el('line', { x1: pr.x + 2, y1: top + pr.len, x2: pr.x + 2, y2: top + pr.len + 10, stroke: '#c0ccd1', 'stroke-width': 1.4 }, probes); }
      var lb = el('text', { x: pr.x, y: top - (pr.row ? 32 : 48), class: 'aq-label aq-label--probe', 'text-anchor': 'middle' }, probes);
      lb.textContent = pr.label;
    });

    // controller enclosure (proposed)
    var ew = Math.min(tw - 24, 470), eh = 92, ex = (VB_W - ew) / 2, ey = BOTTOM + 22;
    var enc = el('g', {}, svg);
    el('rect', { x: ex, y: ey, width: ew, height: eh, rx: 8, fill: 'url(#aqEnclosure)', stroke: '#45555f', 'stroke-width': 1.2 }, enc);
    el('text', { x: ex + 14, y: ey + 18, class: 'aq-label aq-label--sub' }, enc).textContent = 'Controller enclosure (proposed ESP32)';
    el('rect', { x: ex + 14, y: ey + 28, width: 210, height: 50, rx: 4, fill: '#0f1a12', stroke: '#3a4a3c' }, enc);
    this.lcdBg = el('rect', { x: ex + 19, y: ey + 33, width: 200, height: 40, rx: 2, fill: '#24411f' }, enc);
    this.lcd1 = el('text', { x: ex + 26, y: ey + 50, class: 'aq-lcd' }, enc);
    this.lcd2 = el('text', { x: ex + 26, y: ey + 67, class: 'aq-lcd' }, enc);
    var ledX = ex + 252;
    this.led = el('circle', { cx: ledX, cy: ey + 46, r: 8, fill: '#1f6b3a', stroke: '#0c1418', 'stroke-width': 2 }, enc);
    el('text', { x: ledX, y: ey + 74, class: 'aq-label aq-label--sub', 'text-anchor': 'middle' }, enc).textContent = 'LED';
    var bzX = ledX + 50;
    el('circle', { cx: bzX, cy: ey + 46, r: 11, fill: '#11191e', stroke: '#5b6b75', 'stroke-width': 1.5 }, enc);
    el('circle', { cx: bzX, cy: ey + 46, r: 3, fill: '#5b6b75' }, enc);
    this.buzzWaves = el('path', { d: 'M' + (bzX + 15) + ',' + (ey + 38) + ' q5,8 0,16 M' + (bzX + 20) + ',' + (ey + 34) + ' q8,12 0,24', fill: 'none', stroke: '#f2c230', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0 }, enc);
    el('text', { x: bzX, y: ey + 74, class: 'aq-label aq-label--sub', 'text-anchor': 'middle' }, enc).textContent = 'Buzzer';
    var btX = ex + ew - 52;
    var btn = el('g', { class: 'aq-button', tabindex: '0', role: 'button', 'aria-label': 'Simulate physical tank button press' }, enc);
    el('circle', { cx: btX, cy: ey + 44, r: 23, fill: '#11191e', stroke: '#5b6b75', 'stroke-width': 1.5 }, btn);
    this.btnCap = el('circle', { cx: btX, cy: ey + 44, r: 16, class: 'aq-button-cap' }, btn);
    el('text', { x: btX, y: ey + 84, class: 'aq-label aq-label--sub', 'text-anchor': 'middle' }, enc).textContent = 'Tank button';
    var s2 = this;
    btn.addEventListener('click', function () { if (s2.buttonHandler) s2.buttonHandler(); s2.pulseButton(); });
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (s2.buttonHandler) s2.buttonHandler(); s2.pulseButton(); }
    });

    var vx = Math.min(tx, ex) - 28, vw = Math.max(tx + tw, ex + ew) + 28 - vx, vy = top - 104, vh = ey + eh + 14 - vy;
    svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    this.veil = el('rect', { x: vx, y: vy, width: vw, height: vh, fill: '#05090c', opacity: 0, 'pointer-events': 'none' }, svg);
    this.applyFishCount();
    this.applyStatic();
  };

  // Decorative only: shows the first n fish (large fish first, then the small school).
  Tank.prototype.applyFishCount = function () {
    var n = this.fishCount || 10;
    this.fish.forEach(function (f, i) { f.g.style.display = i < n ? '' : 'none'; });
  };

  function stemPlant(parent, x, y, H, color, seed) {
    var g = el('g', { class: 'aq-plant', style: 'animation-duration:' + (8 + seed) + 's;animation-delay:' + (-seed * 1.7) + 's' }, parent);
    for (var s = 0; s < 3; s++) {
      var sx = x + (s - 1) * 9, h = H * (0.75 + 0.25 * ((s * 5 + seed) % 3) / 2), bend = (s - 1) * 10;
      el('path', { d: 'M' + sx + ',' + y + ' q' + bend * 0.3 + ',' + (-h * 0.5) + ' ' + bend + ',' + (-h), stroke: color, 'stroke-width': 1.6, fill: 'none' }, g);
      for (var k = 1; k < 9; k++) {
        var f = k / 9, lx = sx + bend * f * f, ly = y - h * f;
        el('ellipse', { cx: lx - 5, cy: ly, rx: 5, ry: 1.8, fill: color, transform: 'rotate(-20 ' + (lx - 5) + ' ' + ly + ')' }, g);
        el('ellipse', { cx: lx + 5, cy: ly - 2, rx: 5, ry: 1.8, fill: color, transform: 'rotate(20 ' + (lx + 5) + ' ' + (ly - 2) + ')' }, g);
      }
    }
  }

  Tank.prototype.makeFish = function (g, scale, x, y, hider, speed) {
    var f = { g: g, scale: scale, x: x, y: y, dir: 1, sdir: 1, vx: 0, vy: 0, speed: speed, hider: hider, ph: Math.random() * 6, wait: 0 };
    this.pickTarget(f);
    return f;
  };
  Tank.prototype.pickTarget = function (f) {
    var B = this.bounds;
    if (f.hider && Math.random() < 0.45 && this.cave) {
      f.tx = this.cave.x + rnd(-6, 6); f.ty = this.cave.y + rnd(-4, 4); f.hide = true;   // swims into the cave
    } else {
      f.tx = rnd(B.left, B.right); f.ty = rnd(B.minY, B.maxY); f.hide = false;
    }
  };

  Tank.prototype.pulseButton = function () {
    var c = this.btnCap;
    c.classList.remove('is-pressed'); void c.getBoundingClientRect(); c.classList.add('is-pressed');
    setTimeout(function () { c.classList.remove('is-pressed'); }, 220);
  };
  Tank.prototype.onButton = function (fn) { this.buttonHandler = fn; };
  Tank.prototype.setAnimate = function (on) {
    this.animate = !!on;
    this.svg.classList.toggle('is-still', !on);
    this.applyStatic();
  };
  Tank.prototype.applyStatic = function () {
    var sc = this.school;
    this.fish.forEach(function (f) {
      var x = f.school ? sc.x + f.off.x : f.x, y = f.school ? sc.y + f.off.y : f.y;
      f.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + (f.scale) + ',' + f.scale + ')');
    });
    this.shrimp.forEach(function (s) { s.g.setAttribute('transform', 'translate(' + s.x + ',' + s.y + ') scale(' + s.dir + ',1)'); });
    this.bubbles.forEach(function (b) { b.node.setAttribute('cx', b.x); b.node.setAttribute('cy', b.y); });
  };

  Tank.prototype.update = function (v) {
    this.view = v;
    this.lcd1.textContent = (v.lcd[0] || '').slice(0, 16);
    this.lcd2.textContent = (v.lcd[1] || '').slice(0, 16);
    this.lcdBg.setAttribute('fill', v.power === 'off' ? '#0d140c' : '#24411f');
    this.veil.setAttribute('opacity', v.power === 'off' ? 0.42 : 0);
    var tb = v.turb == null ? 5 : v.turb;
    this.haze.setAttribute('opacity', Math.max(0, Math.min(0.7, (tb - 5) / 100 * 0.75)).toFixed(3));
    this.heater.setAttribute('opacity', v.heater ? 1 : 0);
    this.bubbling = !!v.bubbles;
    this.bubStream.setAttribute('opacity', v.bubbles ? 1 : 0);
    var heads = this.probeHeads;
    if (v.probes) Object.keys(heads).forEach(function (k) { heads[k].setAttribute('fill', v.probes[k] === 'ok' ? '#3b4b55' : '#b3261e'); });
  };

  Tank.prototype.dispense = function (phase, outcome) {
    if (phase === 'start') { this.servoTarget = 75; this.beam = 'idle'; }
    if (phase === 'chute') {
      this.servoTarget = 0;
      if (outcome === 'detect') { this.beam = 'broken'; if (this.pellets.length < 30) for (var i = 0; i < 6; i++) this.pellets.push(this.makePellet(i)); }
      else this.beam = 'clear';
    }
    if (phase === 'end') { var self = this; setTimeout(function () { self.beam = 'idle'; self.servoTarget = 0; }, 1600); }
  };
  Tank.prototype.makePellet = function (i) {
    var G = this.g;
    var n = el('circle', { r: 2.6, fill: '#a0703c', stroke: '#6e4a24', 'stroke-width': .6 }, this.pelletGroup);
    return { node: n, x: this.chuteX + (i % 3 - 1) * 2, y: G.top + 18 - i * 9, delay: i * 0.09, drift: (i % 2 ? 1 : -1) * (6 + i * 2), rest: this.sandTop + 4 + (i % 3) * 4, life: 0 };
  };

  Tank.prototype.frame = function (t) {
    var dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    var v = this.view || { led: 'ok', buzzer: false };
    var blinkOn = Math.floor(t / 450) % 2 === 0;
    var ledFill = '#36c26a';
    if (v.led === 'off') ledFill = '#1a2328';
    else if (v.led === 'blink') ledFill = blinkOn ? '#f2b630' : '#5a4614';
    else if (v.led === 'fault') ledFill = blinkOn ? '#ff5a4a' : '#6b1d16';
    this.led.setAttribute('fill', ledFill);
    this.buzzWaves.setAttribute('opacity', v.buzzer && blinkOn ? 1 : 0);

    var G = this.g;
    this.servoAngle += (this.servoTarget - this.servoAngle) * Math.min(1, dt * 8);
    this.servoArm.setAttribute('transform', 'rotate(' + this.servoAngle.toFixed(1) + ' ' + this.chuteX + ' ' + (G.top - 39) + ')');
    var bl = this.beamLine;
    if (this.beam === 'broken') { bl.setAttribute('stroke', blinkOn ? '#fff' : '#ff6b5a'); bl.setAttribute('stroke-dasharray', '0'); this.beamLabel.textContent = 'Beam broken: passage'; }
    else if (this.beam === 'clear') { bl.setAttribute('stroke', '#ff6b5a'); bl.setAttribute('stroke-dasharray', '2 2'); this.beamLabel.textContent = 'No passage detected'; }
    else { bl.setAttribute('stroke', v.power === 'off' ? '#3a2522' : '#ff6b5a'); bl.setAttribute('stroke-dasharray', '2 2'); this.beamLabel.textContent = 'IR beam-break'; }

    for (var p = this.pellets.length - 1; p >= 0; p--) {
      var q = this.pellets[p];
      if (q.delay > 0) { q.delay -= dt; q.node.setAttribute('opacity', 0); continue; }
      q.node.setAttribute('opacity', 1);
      if (q.y < G.water) q.y += 220 * dt;
      else if (q.y < q.rest) { q.y += 28 * dt; q.x += Math.sin(t / 400 + p) * q.drift * dt * 0.4; }
      else q.life += dt;
      q.node.setAttribute('cx', q.x.toFixed(1)); q.node.setAttribute('cy', q.y.toFixed(1));
      if (q.life > 14) { var o = Math.max(0, 1 - (q.life - 14) / 3); q.node.setAttribute('opacity', o); if (o === 0) { q.node.remove(); this.pellets.splice(p, 1); } }
    }

    if (!this.animate) return;
    var self = this, B = this.bounds;

    // school leader wanders; followers keep loose formation
    var sc = this.school;
    var dx = sc.tx - sc.x, dy = sc.ty - sc.y, dist = Math.hypot(dx, dy);
    if (dist < 12) { sc.tx = rnd(B.left + 20, B.right - 20); sc.ty = rnd(B.minY, B.minY + (B.maxY - B.minY) * 0.6); }
    sc.vx += ((dx / (dist || 1)) * 34 - sc.vx) * Math.min(1, dt * 1.2);
    sc.vy += ((dy / (dist || 1)) * 20 - sc.vy) * Math.min(1, dt * 1.2);
    sc.x += sc.vx * dt; sc.y += sc.vy * dt;

    this.fish.forEach(function (f, i) {
      var x, y, vxs;
      if (f.school) {
        x = sc.x + f.off.x * (sc.vx >= 0 ? 1 : -1) + Math.sin(t / 600 + f.ph) * 3;
        y = sc.y + f.off.y + Math.cos(t / 700 + f.ph) * 2.5;
        vxs = sc.vx;
      } else {
        if (f.wait > 0) { f.wait -= dt; }
        else {
          var ddx = f.tx - f.x, ddy = f.ty - f.y, d = Math.hypot(ddx, ddy);
          if (d < 6) { f.wait = f.hide ? rnd(3, 7) : rnd(0, 1.5); self.pickTarget(f); }
          var sp = f.hide ? f.speed * 0.7 : f.speed;
          f.vx += ((ddx / (d || 1)) * sp - f.vx) * Math.min(1, dt * 0.9);
          f.vy += ((ddy / (d || 1)) * sp * 0.6 - f.vy) * Math.min(1, dt * 0.9);
        }
        if (f.wait > 0) { f.vx *= 0.95; f.vy *= 0.95; }
        f.x += f.vx * dt; f.y += f.vy * dt;
        x = f.x; y = f.y + Math.sin(t / 1400 + f.ph) * (f.wait > 0 ? 1.5 : 4);
        vxs = f.vx;
      }
      if (Math.abs(vxs) > 2) f.dir = vxs > 0 ? 1 : -1;
      f.sdir += (f.dir - f.sdir) * Math.min(1, dt * 5);
      var sx = (Math.abs(f.sdir) < 0.15 ? 0.15 * (f.sdir < 0 ? -1 : 1) : f.sdir) * f.scale;
      f.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + sx.toFixed(3) + ',' + f.scale + ') rotate(' + (Math.sin(t / 700 + i) * 3).toFixed(1) + ')');
    });

    // shrimp: short walks, long pauses, twitching antennae
    this.shrimp.forEach(function (s) {
      if (s.pause > 0) { s.pause -= dt; s.vx *= 0.8; }
      else {
        if (!s.vx) s.vx = s.dir * rnd(6, 12);
        s.x += s.vx * dt;
        if (s.x < s.min || s.x > s.max || Math.random() < dt * 0.25) { s.pause = rnd(1.5, 5); if (s.x < s.min || s.x > s.max || Math.random() < 0.5) s.dir *= -1; s.vx = 0; s.x = Math.max(s.min, Math.min(s.max, s.x)); }
      }
      s.ant.setAttribute('transform', 'rotate(' + (Math.sin(t / 260 + s.ph) * 6).toFixed(1) + ' 8 -2)');
      s.g.setAttribute('transform', 'translate(' + s.x.toFixed(1) + ',' + s.y + ') scale(' + s.dir + ',1)');
    });

    if (this.bubbling) {
      var px = this.tProbeX, tp = G.top;
      this.bubDots.forEach(function (d) {
        d.y -= 34 * dt; if (d.y < G.water + 4) d.y = tp + 118;
        d.node.setAttribute('cx', (px + 9 + Math.sin(t / 300 + d.ph) * 2.5).toFixed(1)); d.node.setAttribute('cy', d.y.toFixed(1));
      });
    }
    if (this.heaterCoil) this.heaterCoil.setAttribute('fill', Math.floor(t / 600) % 2 ? '#ff7a3d' : '#ff9a5e');
    var water = G.water;
    this.bubbles.forEach(function (b) {
      b.y -= b.sp * dt;
      if (b.y < water + 4) b.y = G.bottom - 30;
      b.node.setAttribute('cx', (b.x + Math.sin(t / 500 + b.ph) * 2).toFixed(1));
      b.node.setAttribute('cy', b.y.toFixed(1));
    });
  };

  root.AquaTank = Tank;
})(window);
