/* Phone app mock, top-camera feed, rule-based fish analysis and the six-sided controller views.
   Everything here is SIMULATION. The analysis is a stand-in that reads the simulated fish
   positions. It is not a trained model and its limits are placeholders, not validated values. */
(function () {
  'use strict';
  var A = window.aquacare;
  if (!A || !A.tank3d) return;
  var tank = A.tank3d();
  var $ = function (id) { return document.getElementById(id); };
  if (!tank) return;                      // 2D only: leave the cards hidden
  $('camCard').hidden = false;
  $('viewsCard').hidden = false;

  var DEMO = {                            // placeholders for the project team to define
    learnSamples: 24,                     // ~6 s of camera frames to learn this tank's normal
    lowActivity: 0.4,                     // share of normal activity treated as "low"
    surfaceShare: 0.6,                    // share of fish near the surface treated as "gathered"
    holdSamples: 20,                      // ~5 s before an alert is raised
    cooldownMs: 40000,
    feederReach: 1.6
  };
  var st = {
    baseline: 0, samples: 0, sum: 0, lowRun: 0, surfRun: 0, lastAlert: {}, fedHandled: 0, fedSeen: false,
    notif: [], enabled: false
  };

  // ---------- tank profile ----------
  function fitText() {
    var d = tank.dims, f = tank.feedFov(), size = tank.size;
    var inch = d.W / 0.513, dIn = d.D / 0.513, hIn = (d.H) / 0.513;
    var dimText = size === 'p3' ? '36 × 22 × 26 cm' : inch.toFixed(1) + ' × ' + dIn.toFixed(1) + ' × ' + hIn.toFixed(1) + ' in (illustrative proportions)';
    $('appFit').textContent = 'Controller fitted to ' + A.sizeLabel(size).replace('Tank: ', '') + '. Tank ' + dimText +
      '. Rails extend to the tank edge. Camera field of view set to ' + Math.round(f.hfov) + '° across the tank.';
  }
  tank.onFit = function () {
    $('appSize').value = tank.size;
    fitText(); resetBaseline(); scheduleViews();
  };
  $('appSize').value = tank.size;
  $('appSize').addEventListener('change', function () {
    var main = $('sizeSel');
    main.value = $('appSize').value;
    main.dispatchEvent(new Event('change', { bubbles: true }));
  });
  fitText();

  // ---------- 3D tool buttons ----------
  function toggleBtn(id, fn) {
    var b = $(id);
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); fn(on);
    });
  }
  toggleBtn('tagsBtn', function (on) { tank.setTags(on); });
  toggleBtn('coneBtn', function (on) { tank.setCone(on); });
  $('finishSel').addEventListener('change', function () { tank.setFinish($('finishSel').value); scheduleViews(); });
  $('camLook').addEventListener('click', function () {
    var sel = $('tankView'); sel.value = 'top'; tank.setCamera('top');
    $('coneBtn').setAttribute('aria-pressed', 'true'); tank.setCone(true);
    $('bay').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- behaviour scenario ----------
  $('behSel').addEventListener('change', function () {
    var v = $('behSel').value;
    tank.setBehaviour(v);
    st.lowRun = st.surfRun = 0;
    var names = { normal: 'normal swimming', lethargic: 'fish barely moving', surface: 'fish gathered at the surface' };
    if (A.engine && A.engine.addLog) A.engine.addLog('demo', 'Fish behaviour demo scenario: ' + names[v] + ' (injected, simulated fish only)', { injected: true });
    A.render();
  });

  // ---------- camera feed and analysis ----------
  function resetBaseline() { st.baseline = 0; st.samples = 0; st.sum = 0; st.lowRun = st.surfRun = 0; }
  var feed = $('camFeed'), over = $('camOver'), octx = over.getContext('2d');
  var lastAnalysis = null;
  function simClock() {
    var s = A.engine && A.engine.s;
    return s ? window.AquaEngine.fmt.hhmm(s.simTime) : '--:--';
  }
  function say(el, text) { $(el).textContent = text; }

  function classify(f, ctx) {
    var spot = tank.feedSpot || tank.chute;
    if (ctx.pellets && Math.hypot(f.x - spot.x, f.z - spot.z) < DEMO.feederReach) return 'feeding';
    if (f.y > tank.dims.SURFACE - 0.75) return 'surface';
    if (st.baseline && f.speed < st.baseline * DEMO.lowActivity) return 'slow';
    return 'swimming';
  }
  var COLORS = { swimming: '#8bd9e6', slow: '#f3c735', surface: '#e6a4ff', feeding: '#9cec7c' };

  function notify(kind, text, warn) {
    if (!st.enabled) return;
    var now = performance.now();
    if (st.lastAlert[kind] && now - st.lastAlert[kind] < DEMO.cooldownMs) return;
    st.lastAlert[kind] = now;
    st.notif.unshift({ at: simClock(), text: text, warn: !!warn });
    st.notif.length = Math.min(st.notif.length, 6);
    renderNotif();
  }
  function renderNotif() {
    var ul = $('notifList'); ul.textContent = '';
    st.notif.forEach(function (n) {
      var li = document.createElement('li'); if (n.warn) li.className = 'is-warn';
      li.appendChild(document.createTextNode(n.text));
      var sm = document.createElement('small'); sm.textContent = 'Simulated clock ' + n.at + ' · demo rule'; li.appendChild(sm);
      ul.appendChild(li);
    });
  }
  $('notifOn').addEventListener('change', function () {
    st.enabled = $('notifOn').checked;
    say('notifState', st.enabled ? 'On. Using demo placeholder rules, not validated limits. Alerts appear here.' : 'Not configured. Alerts stay off until you turn them on.');
    if (!st.enabled) { st.notif = []; renderNotif(); }
  });

  function analyse(f) {
    var cw = f.canvas.width, ch = f.canvas.height, ctx = f.ctx;
    // stamp the picture itself so a saved frame is always labelled
    var u = cw / 480;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, cw, 22 * u);
    ctx.fillStyle = '#f3c735'; ctx.font = 'bold ' + 12 * u + 'px ui-monospace, Menlo, Consolas, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText('SIMULATION  TOP CAMERA  ' + simClock(), 8 * u, 11 * u);
    var fish = tank.fishStates(), n = fish.length, pellets = tank.pellets.length > 0;
    var normal = tank.behaviour === 'normal';
    var mean = n ? fish.reduce(function (a, b) { return a + b.speed; }, 0) / n : 0;
    if (!st.baseline && normal && !pellets && n) {
      st.samples++;
      if (st.samples > 6) st.sum += mean;
      if (st.samples >= DEMO.learnSamples) st.baseline = st.sum / (DEMO.learnSamples - 6) || 0.0001;
    }
    var counts = { swimming: 0, slow: 0, surface: 0, feeding: 0 };
    var W2 = over.width, H2 = Math.round(W2 / f.aspect);
    if (over.height !== H2) over.height = H2;
    octx.clearRect(0, 0, W2, H2);
    var show = $('camAI').checked;
    fish.forEach(function (fi) {
      var state = classify(fi, { pellets: pellets });
      counts[state]++;
      if (!show) return;
      var a = tank.feedProject(fi.x - 0.34, fi.y, fi.z), b = tank.feedProject(fi.x + 0.34, fi.y, fi.z), c = tank.feedProject(fi.x, fi.y, fi.z);
      var bw = Math.max(26, Math.abs(b[0] - a[0]) * W2 * 1.15), bh = bw * 0.62, cx = c[0] * W2, cy = c[1] * H2;
      octx.strokeStyle = COLORS[state]; octx.lineWidth = 2.5; octx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      var label = 'F' + fi.id + ' ' + state;
      octx.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
      var tw = octx.measureText(label).width + 8, ty = Math.max(0, cy - bh / 2 - 19);
      octx.fillStyle = 'rgba(5,10,12,.8)'; octx.fillRect(cx - bw / 2, ty, tw, 18);
      octx.fillStyle = COLORS[state]; octx.textBaseline = 'middle'; octx.fillText(label, cx - bw / 2 + 4, ty + 9.5);
    });
    // feed spot chosen from this camera view (shown while a feed is running and for a while after)
    var plan = tank.feedPlan, busy = tank.fd && tank.fd.phase !== 'rest';
    if (show && plan && tank.feedSpot && (busy || performance.now() - plan.at < 20000)) {
      var fp = tank.feedProject(tank.feedSpot.x, tank.feedSpot.y, tank.feedSpot.z), fx = fp[0] * W2, fy = fp[1] * H2;
      octx.strokeStyle = '#ffb547'; octx.lineWidth = 2.5;
      octx.beginPath(); octx.arc(fx, fy, 16, 0, Math.PI * 2); octx.moveTo(fx - 26, fy); octx.lineTo(fx + 26, fy); octx.moveTo(fx, fy - 26); octx.lineTo(fx, fy + 26); octx.stroke();
      octx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
      var lab = 'FEED SPOT · ' + plan.near + ' fish near', lw = octx.measureText(lab).width + 8;
      octx.fillStyle = 'rgba(5,10,12,.8)'; octx.fillRect(fx + 20, fy + 14, lw, 18);
      octx.fillStyle = '#ffb547'; octx.textBaseline = 'middle'; octx.fillText(lab, fx + 24, fy + 23.5);
    }
    var activity = st.baseline ? mean / st.baseline : null;
    // rules
    if (st.baseline && activity < DEMO.lowActivity) st.lowRun++; else st.lowRun = 0;
    if (n && counts.surface / n >= DEMO.surfaceShare && !pellets) st.surfRun++; else st.surfRun = 0;
    if (st.lowRun === DEMO.holdSamples) notify('low', 'Low fish activity: about ' + Math.round(activity * 100) + '% of this tank’s normal. Check the tank.', true);
    if (st.surfRun === DEMO.holdSamples) notify('surface', counts.surface + ' of ' + n + ' fish are near the surface and not feeding. Check the tank.', true);
    if (tank.lastFeedAt && tank.lastFeedAt !== st.fedHandled) {
      var since = (performance.now() - tank.lastFeedAt) / 1000;
      if (counts.feeding >= Math.max(1, Math.round(n / 3))) {
        st.fedHandled = tank.lastFeedAt;
        notify('fed' + tank.lastFeedAt, 'Feeding response seen: ' + counts.feeding + ' of ' + n + ' fish came to the food.', false);
      } else if (since > 14) {
        st.fedHandled = tank.lastFeedAt;
        if (tank.dropOutcome === 'detect') notify('nofed' + tank.lastFeedAt, 'Food was dispensed but few fish came to the food. Check the tank.', true);
      }
    }
    lastAnalysis = { n: n, counts: counts, activity: activity };
    renderPanel(lastAnalysis);
  }
  tank.onFeedFrame = analyse;

  var panelKey = '';
  function renderPanel(a) {
    var learning = !st.baseline, warn = st.baseline && (a.activity < DEMO.lowActivity || (a.n && a.counts.surface / a.n >= DEMO.surfaceShare && !tank.pellets.length));
    var rows = [
      ['Fish seen', a.n + ' of ' + a.n],
      ['Activity vs this tank’s normal', learning ? 'learning ' + Math.min(100, Math.round(st.samples / DEMO.learnSamples * 100)) + '%' : Math.round(a.activity * 100) + '%'],
      ['Swimming', String(a.counts.swimming)],
      ['Slow', String(a.counts.slow)],
      ['Near surface', String(a.counts.surface)],
      ['At the food', String(a.counts.feeding)],
      ['Feed spot', tank.feedPlan ? (tank.feedPlan.near + ' fish near' + (tank.feedPlan.clamped ? ', edge of arm reach' : '')) : 'not used yet'],
      ['Food left (camera count)', String(tank.pellets.length)]
    ];
    var chip = learning ? 'Learning normal' : (warn ? 'Check tank' : 'Looks normal');
    var key = chip + (tank.fd ? tank.fd.phase : '') + rows.map(function (r) { return r[1]; }).join('|');
    if (key === panelKey) return; panelKey = key;
    var p = $('aiPanel'); p.textContent = '';
    var head = document.createElement('div'); head.className = 'ai__head';
    head.appendChild(document.createTextNode('Fish behaviour · demo rule'));
    var c = document.createElement('span'); c.className = 'ai__chip' + (warn ? ' is-warn' : ''); c.textContent = chip; head.appendChild(c);
    p.appendChild(head);
    var dl = document.createElement('dl'); dl.className = 'ai__grid';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0]; var dd = document.createElement('dd'); dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    p.appendChild(dl);
    var note = document.createElement('p'); note.className = 'ai__note';
    note.textContent = 'SIMULATION. Rule-based stand-in on simulated fish, not a trained or validated model. Limits are placeholders for the project team to set.';
    p.appendChild(note);
  }
  renderPanel({ n: 0, counts: { swimming: 0, slow: 0, surface: 0, feeding: 0 }, activity: null });

  tank.attachFeed(feed, function (visible) { if (visible) panelKey = ''; });

  $('camSnap').addEventListener('click', function () {
    var w = 960, h = Math.round(w / (feed.width / feed.height)), c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d'); g.drawImage(feed, 0, 0, w, h);
    if ($('camAI').checked) g.drawImage(over, 0, 0, w, h);
    var s = A.engine.s, name = 'aquacare-SIMULATION-camera-snapshot-day' + s.day + '-' + simClock().replace(':', '') + '.png';
    c.toBlob(function (blob) { A.saveFile(name, blob, { mime: 'image/png', what: 'the snapshot', msg: function (m) { say('camMsg', m); } }); }, 'image/png');
  });

  // ---------- controller from every side ----------
  var viewsTimer = 0, viewsVisible = false, viewsStale = true;
  var IDS = ['front', 'back', 'left', 'right', 'top', 'under'];
  var TITLES = { front: 'Front', back: 'Back', left: 'Left end', right: 'Right end', top: 'Top', under: 'Underneath' };
  function drawViews() {
    viewsStale = false;
    var canv = {};
    IDS.forEach(function (id) { canv[id] = $('cv-' + id); });
    try {
      var v = tank.view || {};
      tank.controllerViews(canv, v.lcd, v.power || 'on');
      say('viewsMsg', 'Updated for ' + A.sizeLabel(tank.size).replace('Tank: ', '') + ', ' + tank.finish + ' finish.');
    } catch (e) { say('viewsMsg', 'Could not draw the extra views on this device.'); }
  }
  function scheduleViews() {
    viewsStale = true;
    if (!viewsVisible) return;
    clearTimeout(viewsTimer); viewsTimer = setTimeout(drawViews, 450);
  }
  new IntersectionObserver(function (entries) {
    viewsVisible = entries[0].isIntersecting;
    if (viewsVisible && viewsStale) { clearTimeout(viewsTimer); viewsTimer = setTimeout(drawViews, 250); }
  }).observe($('viewsCard'));
  $('viewsRefresh').addEventListener('click', drawViews);

  function sheet() {
    var cw = 760, ch = 500, gap = 28, pad = 48, head = 150;
    var c = document.createElement('canvas');
    c.width = pad * 2 + cw * 3 + gap * 2; c.height = head + pad + (ch + 54) * 2 + gap;
    var g = c.getContext('2d');
    g.fillStyle = '#eef3f4'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#0f2b36'; g.font = 'bold 54px system-ui, Arial, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('AquaCare universal controller, six sides', pad, 76);
    g.fillStyle = '#26414b'; g.font = '28px system-ui, Arial, sans-serif';
    g.fillText('Fitted to ' + A.sizeLabel(tank.size).replace('Tank: ', '') + ' · ' + tank.finish + ' finish · display shows live simulated readings', pad, 120);
    g.fillStyle = '#f3c735'; g.fillRect(c.width - pad - 410, 40, 410, 54);
    g.fillStyle = '#111'; g.font = 'bold 28px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle';
    g.fillText('SIMULATION · DEMO DATA', c.width - pad - 392, 68);
    g.textBaseline = 'alphabetic';
    IDS.forEach(function (id, i) {
      var x = pad + (i % 3) * (cw + gap), y = head + Math.floor(i / 3) * (ch + 54 + gap);
      g.drawImage($('cv-' + id), x, y, cw, ch);
      g.fillStyle = '#0f2b36'; g.font = 'bold 30px system-ui, Arial, sans-serif'; g.fillText(TITLES[id], x, y + ch + 38);
    });
    g.fillStyle = '#4c6069'; g.font = '22px system-ui, Arial, sans-serif';
    g.fillText('Model for the EE7008 Project 1 simulation. Not a product drawing, rating or approval.', pad, c.height - 20);
    return c;
  }
  A.controllerSheet = function () { if (viewsStale) drawViews(); return sheet(); };
  $('viewsSave').addEventListener('click', function () {
    if (viewsStale) drawViews();
    sheet().toBlob(function (blob) {
      A.saveFile('aquacare-SIMULATION-controller-six-sides-' + String(tank.size).replace('.', '_') + '.png', blob,
        { mime: 'image/png', what: 'the controller sheet', msg: function (m) { say('viewsMsg', m); } });
    }, 'image/png');
  });
})();
