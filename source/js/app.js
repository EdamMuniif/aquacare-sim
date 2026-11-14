/*
 * AquaCare digital prototype - UI controller (v2)
 * SIMULATION ONLY. Binds the simulated engine to the page.
 */
(function () {
  'use strict';

  var Engine = window.AquaEngine;
  var F = Engine.fmt;
  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'aquacare-demo-v3';
  var SENS = Engine.SENSORS, KEYS = Engine.KEYS;
  var CAP = Engine.DAILY_CAP;

  // ---------- storage: settings only (a run is regenerated, export CSV to keep data) ----------
  var store = { ok: false, data: null };
  try {
    window.localStorage.setItem('__aq__', '1'); window.localStorage.removeItem('__aq__');
    store.ok = true;
    var raw = window.localStorage.getItem(STORE_KEY);
    if (raw) store.data = JSON.parse(raw);
  } catch (e) { store.ok = false; }

  function mergeSettings(sv) {
    var d = Engine.defaultSettings();
    if (!sv) return d;
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(sv.startDate)) d.startDate = sv.startDate;
      if (Array.isArray(sv.slots) && sv.slots.length === 3) d.slots = sv.slots.map(function (s, i) { return { time: F.parseHHMM(s.time) !== null ? s.time : d.slots[i].time, on: !!s.on }; });
      if (!d.slots.some(function (s) { return s.on; })) d.slots[0].on = true;
      if (typeof sv.portion === 'string' && sv.portion.trim()) d.portion = sv.portion.trim().slice(0, 40);
      if (['2.5', '3', '5', '7.5', '10', 'p3'].indexOf(String(sv.tankGal)) >= 0) d.tankGal = String(sv.tankGal);
      if ([4, 6, 10].indexOf(+sv.fishCount) >= 0) d.fishCount = +sv.fishCount;
      if (Engine.FEED_MODES[sv.feedMode]) d.feedMode = sv.feedMode;
      if (sv.limits) Object.keys(d.limits).forEach(function (k) { if (typeof sv.limits[k] === 'number' || sv.limits[k] === null) d.limits[k] = sv.limits[k]; });
      if (sv.limitsSource === 'custom' || sv.limitsSource === 'none' || sv.limitsSource === 'reference') d.limitsSource = sv.limitsSource;
      ['phPerHour', 'tPerHour'].forEach(function (k) { if (sv.roc && typeof sv.roc[k] === 'number') d.roc[k] = sv.roc[k]; });
      d.awayMode = !!sv.awayMode;
      if (sv.dailyPattern === false) d.dailyPattern = false;
      if (sv.owner && (sv.owner.mode === 'simulated' || sv.owner.mode === 'presenter')) d.owner.mode = sv.owner.mode;
      if (sv.owner && typeof sv.owner.respondPct === 'number') d.owner.respondPct = Math.max(0, Math.min(100, sv.owner.respondPct));
      if (sv.policy) {
        if (sv.policy.interruptedReminder === 'restart') d.policy.interruptedReminder = 'restart';
        if (sv.policy.countAfterRestart === 'reset') d.policy.countAfterRestart = 'reset';
      }
      if (Array.isArray(sv.scenarios)) d.scenarios = sv.scenarios.filter(function (s) { return s && Engine.SCENARIO_TYPES[s.type] && s.day >= 1 && s.day <= 30 && (s.type !== 'perturb' || Engine.PERTURB[s.kind]); }).slice(0, 60);
    } catch (e) { /* keep defaults */ }
    return d;
  }

  var settings = mergeSettings(store.data && store.data.settings);
  var engine = new Engine({ settings: settings });
  engine.addLog('system', 'Simulation ready: Day 1 (' + engine.dateLabel(1, true) + '), ' + F.hhmm(engine.s.simTime) + ', paused. All values are demo data.');

  var saveTimer = null;
  function save() {
    if (!store.ok) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, settings: settings })); }
      catch (e) { store.ok = false; $('storageNote').textContent = 'In-memory only (browser storage unavailable)'; }
    }, 300);
  }
  $('storageNote').textContent = store.ok ? 'Settings kept in this browser; run data via CSV export' : 'In-memory only (browser storage unavailable)';

  // ---------- downloads (hosted viewers need the platform's downloads capability) ----------
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  var dl = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (ns) { dl = ns; }, function () { dl = null; });
    }
  } catch (e) { dl = null; }
  function exportMsg(t) { $('exportMsg').textContent = t; }
  function saveFile(name, text) {
    if (dl) {
      dl.save({ filename: name, data: text }).then(function () { exportMsg('Saved ' + name + '.'); }, function (err) {
        var c = err && err.code;
        exportMsg(c === 'declined' ? 'Save cancelled.' : (c === 'rate_limited' ? 'A save prompt is already open. Try again in a moment.' : 'Saving is not available in this viewer. Open the standalone file to export.'));
      });
      return;
    }
    if (framed) { exportMsg('Downloads are blocked in this viewer. Open the standalone HTML file to export CSV.'); return; }
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    exportMsg('Downloaded ' + name + '.');
  }

  // ---------- tank ----------
  var tank = new window.AquaTank($('tank'));
  tank.fishCount = settings.fishCount;
  tank.render(settings.tankGal);
  tank.onButton(function () { engine.pressTankButton(); render(); });
  engine.on(function (type, d) {
    if (type === 'dispense') tank.dispense(d.phase, d.outcome);
    if (type === 'log' && d.kind === 'wifi' && /disconnected/.test(d.text)) {
      var sn = engine.s.sensors;
      if (appSnap.at == null || appSnap.at < d.t) appSnap = { ph: sn.ph.value, temp: sn.temp.value, tds: sn.tds.value, turb: sn.turb.value, at: d.t, feeds: engine.s.feeds.counted };
    }
    if (type === 'log' && d.kind === 'alert' && /^Alert raised/.test(d.text) && !engine.quiet) $('liveAlert').textContent = d.text;
  });
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('animChk').checked = !reduceMotion;
  tank.setAnimate(!reduceMotion);

  // ---------- helpers ----------
  function mmss(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60); }
  function durText(ms) { var m = Math.round(ms / F.MIN); if (m < 60) return m + ' min'; var h = Math.floor(m / 60); return h + ' h ' + (m % 60) + ' min'; }
  function realText(sec) { if (sec < 90) return Math.round(sec) + ' s'; if (sec < 5400) return Math.round(sec / 60) + ' min'; return (sec / 3600).toFixed(1) + ' h'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setText(id, t) { var n = $(id); if (n && n.textContent !== t) n.textContent = t; }
  function setHTML(n, h) { if (n.innerHTML !== h) n.innerHTML = h; }

  var KIND = {
    manual: 'Manual feed confirmed', auto: 'Automatic feed attempt', ok: 'Dispense, passage detected', fail: 'Unsuccessful / fault',
    cap: 'Skipped, daily cap', reminder: 'Feeding reminder', sensor: 'Sensor state', wifi: 'Wi-Fi state', power: 'Power state',
    alert: 'Alert', system: 'System', demo: 'Presenter action', scenario: 'Scenario', logic: 'Local logic response', owner: 'Simulated owner', perturb: 'Perturbation test'
  };
  var OUT = {
    manual: ['Manual at tank', 'is-manual'], auto_ok: ['Auto, passage detected', 'is-ok'], auto_fail: ['Auto, no passage (fault)', 'is-fail'],
    cap_skip: ['Skipped, daily cap', 'is-cap'], missed_power: ['Missed, no power', 'is-miss'], missed_manual: ['Missed, manual-only mode', 'is-missm'], open: ['In progress', 'is-open']
  };
  function kindClass(k) { return (k === 'sensor' || k === 'wifi' || k === 'power' || k === 'system') ? 'state' : (k === 'scenario' || k === 'logic' || k === 'perturb') ? 'scen' : (k === 'owner' ? 'manual' : k); }
  var TONE = { idle: 'ok', paused: 'off', reminder: 'attn', dispense: 'accent', fault: 'fault', cap: 'accent', off: 'off', boot: 'off', done: 'accent' };
  var SC_ABBR = { wifi: 'WIFI', sensor: 'SENS', chute: 'CHUTE', missed: 'MISS', power: 'PWR', perturb: 'TEST', bubbles: 'BUBL', lcd: 'LCD' };

  // ---------- architecture diagram ----------
  (function buildArch() {
    var B = function (id, x, y, w, h, title, sub, core, tag) {
      return '<g class="blk' + (core ? ' is-core' : '') + '" id="' + id + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6"/>' +
        '<text x="' + (x + 12) + '" y="' + (y + 18) + '" class="p">' + (tag || 'PROPOSED') + '</text><text x="' + (x + 12) + '" y="' + (y + 35) + '">' + title + '</text>' +
        (sub ? '<text x="' + (x + 12) + '" y="' + (y + 50) + '" class="s">' + sub + '</text>' : '') + '</g>';
    };
    $('arch').innerHTML = '<svg viewBox="0 0 980 540" role="img" aria-label="Proposed architecture: pH sensor, DS18B20, TDS sensor, turbidity sensor, physical button and IR beam-break feed the proposed ESP32 local controller, which drives the LCD, buzzer and LED, and the servo feeder. Wi-Fi and the mobile app are a secondary connection.">' +
      '<text x="20" y="24" class="grp-l">Inputs</text><text x="370" y="24" class="grp-l">Local controller</text><text x="700" y="24" class="grp-l">Outputs</text>' +
      B('a-ph', 20, 40, 250, 58, 'pH sensor (SEN0161)', 'water pH') + B('a-temp', 20, 110, 250, 58, 'DS18B20 probe', 'water temperature') +
      B('a-tds', 20, 180, 250, 58, 'TDS sensor (SEN0244)', 'dissolved solids', false, 'FROM PAPER [2]') + B('a-turb', 20, 250, 250, 58, 'Turbidity sensor (SEN0189)', 'water clarity', false, 'FROM PAPER [2]') +
      B('a-btn', 20, 320, 250, 58, 'Physical button at tank', 'manual feed confirmation') + B('a-ir', 20, 390, 250, 58, 'IR beam-break sensor', 'food passage in chute') +
      B('a-esp', 360, 150, 270, 170, 'ESP32 controller', 'measure, calibrate, validate,', true) +
      '<text x="372" y="218" style="font:500 11px var(--sans);fill:#b9c8ce">smooth (5), compare, alert;</text>' +
      '<text x="372" y="236" style="font:500 11px var(--sans);fill:#b9c8ce">schedule, 10-min window, cap,</text>' +
      '<text x="372" y="254" style="font:500 11px var(--sans);fill:#b9c8ce">dispense check. Runs without Wi-Fi.</text>' +
      B('a-lcd', 710, 60, 250, 66, 'LCD', 'local status') + B('a-alarm', 710, 150, 250, 66, 'Buzzer + LED', 'local alarm / reminder') +
      B('a-feed', 710, 240, 250, 66, 'Servo-driven feeder', 'one portion per cycle') +
      B('a-wifi', 360, 460, 270, 60, 'Wi-Fi link', 'secondary connection') + B('a-app', 710, 460, 250, 60, 'Mobile app', 'readings, history, notifications') +
      '<path class="wire" d="M270 69 H350 V170 H360"/><path class="wire" d="M270 139 H338 V195 H360"/><path class="wire" d="M270 209 H326 V220 H360"/>' +
      '<path class="wire" d="M270 279 H314 V245 H360"/><path class="wire" d="M270 349 H338 V270 H360"/><path class="wire" d="M270 419 H350 V295 H360"/>' +
      '<path class="wire" d="M630 190 H660 V93 H710"/><path class="wire" d="M630 215 H675 V183 H710"/><path class="wire" d="M630 245 H675 V273 H710"/>' +
      '<path class="wire wire--net" id="w-net" d="M495 320 V460"/><path class="wire wire--net" id="w-app" d="M630 490 H710"/>' +
      '<path class="wire" d="M835 306 V384 H145 V390" style="stroke-dasharray:2 4;stroke:#9aa5ab"/>' +
      '<text x="668" y="402" style="font:500 11px var(--sans);fill:#536570">food leaves the feeder through the IR beam</text></svg>';
  })();
  function setBlk(id, cls) { var n = $(id); if (!n) return; n.classList.remove('is-live', 'is-bad', 'is-off'); if (cls) n.classList.add(cls); }

  // ---------- state for heavy views ----------
  var ui = { selectedDay: null, range: 'all', lastState: null, sigCal: '', sigFeed: '', sigLog: '', sigChart: '', chartAt: 0, sigScen: '', sigAlerts: '' };
  var appSnap = { ph: null, temp: null, tds: null, turb: null, at: null, feeds: null };

  function dayRecords(day) { return engine.s.records.filter(function (r) { return r.day === day; }); }
  function currentRecordOutcome(r) { return r.outcome || 'open'; }

  // ---------- sensor UI builders ----------
  var SHORT = { ph: 'pH', temp: 'Temperature', tds: 'TDS', turb: 'Turbidity' };
  var COLOR = { ph: '#0a6672', temp: '#b5541c', tds: '#5b3a8a', turb: '#7a5a00' };
  var NOTE = {
    ph: 'Accuracy target ±0.1 pH: project target only, not yet verified.',
    temp: 'Accuracy target ±0.5 °C: project target only, not yet verified.',
    tds: 'From reviewed paper [2]. Not yet in the AquaCare design.',
    turb: 'From reviewed paper [2]. Not yet in the AquaCare design.'
  };
  function fmtV(k, v) { return v == null ? '-' : v.toFixed(SENS[k].dp); }
  function limitsOf(k) { var lk = SENS[k].lim; return [settings.limits[lk[0]], settings.limits[lk[1]]]; }
  function rangeText(k) {
    var r = limitsOf(k), u = SENS[k].unit === 'pH' ? '' : ' ' + SENS[k].unit;
    if (r[0] == null && r[1] == null) return 'Range not configured';
    if (r[0] == null) return '≤ ' + r[1] + u;
    if (r[1] == null) return '≥ ' + r[0] + u;
    return r[0] + '–' + r[1] + u;
  }
  (function buildSensorRow() {
    $('sensorRow').innerHTML = KEYS.map(function (k) {
      var d = SENS[k];
      return '<article class="card reading reading--' + k + '" id="card-' + k + '">' +
        '<header class="card__head"><h2 class="card__title">' + SHORT[k] + ' <span class="reading__part">' + d.part + '</span></h2>' +
        '<span class="reading__tags">' + (d.scope === 'paper' ? '<span class="pill pill--attn">Paper [2]</span>' : '') + '<span class="simtag">SIM</span></span></header>' +
        '<div class="reading__value"><span class="reading__num mono" id="val-' + k + '">-</span><span class="reading__unit">' + d.unit + '</span><span class="rstate" id="rs-' + k + '"></span></div>' +
        '<div class="reading__meta"><span class="status" id="st-' + k + '">Reading</span><span class="mono" id="tm-' + k + '">-</span></div>' +
        '<div class="reading__raw mono" id="raw-' + k + '">-</div>' +
        '<div class="gauge" aria-hidden="true"><span class="gauge__band" id="gb-' + k + '"></span><span class="gauge__mk" id="gm-' + k + '"></span></div>' +
        '<div class="reading__range"><span id="rg-' + k + '">-</span><span class="fine" id="rgs-' + k + '"></span></div>' +
        '<svg class="spark" id="spark-' + k + '" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"></svg>' +
        '<p class="fine" id="note-' + k + '">' + NOTE[k] + '</p></article>';
    }).join('');
    $('faultSegs').innerHTML = KEYS.map(function (k) {
      return '<div class="field"><span class="field__label" id="fl-' + k + '">' + SENS[k].name + ' <small>' + SENS[k].part + '</small></span>' +
        '<div class="seg seg--3" role="radiogroup" aria-labelledby="fl-' + k + '" id="seg-' + k + '">' +
        '<button type="button" role="radio" data-status="ok">Connected</button><button type="button" role="radio" data-status="disconnected">Disconnected</button><button type="button" role="radio" data-status="faulty">Faulty</button></div></div>';
    }).join('');
    var R = { ph: [4, 9.5, 0.1], temp: [18, 36, 0.5], tds: [50, 600, 5], turb: [0, 100, 1] };
    $('baseSliders').innerHTML = KEYS.map(function (k) {
      return '<div class="field"><label class="field__label" for="base-' + k + '">' + SHORT[k] + ' baseline <output id="bo-' + k + '" class="mono">' + fmtV(k, SENS[k].base) + ' ' + (SENS[k].unit === 'pH' ? '' : SENS[k].unit) + '</output></label>' +
        '<input type="range" id="base-' + k + '" min="' + R[k][0] + '" max="' + R[k][1] + '" step="' + R[k][2] + '" value="' + SENS[k].base + '"></div>';
    }).join('');
  })();

  // ---------- main render ----------
  function render() {
    var s = engine.s, st = engine.systemState(), code = st.code;
    var feedState = (code === 'paused' || code === 'done') ? 'idle' : code;
    var tone = TONE[code] || 'ok', f = s.feeds;

    setText('clockTime', F.hhmmss(s.simTime));
    setText('clockDate', engine.dateLabel(s.day, true));
    setText('clockDay', 'Day ' + s.day + ' of ' + settings.days);
    var sc = $('speedChip');
    if (s.speed === 1) { sc.textContent = 'Real time 1×'; sc.className = 'chip'; }
    else { sc.textContent = 'DEMO SPEED ' + speedName(s.speed); sc.className = 'chip chip--fast'; }
    var rc = $('runChip');
    rc.textContent = s.finished ? 'Run complete' : (s.running ? 'Running' : 'Paused');
    rc.className = 'chip ' + (s.running ? 'chip--live' : 'chip--quiet');

    // strip
    var recsToday = dayRecords(s.day), pips = '', counted = [];
    recsToday.forEach(function (r) { if (r.outcome === 'manual') counted.push('is-manual'); else if (r.outcome === 'auto_ok') counted.push('is-ok'); else if (r.outcome === 'auto_fail') counted.push('is-fail'); });
    if (s.phase === 'dispensing') counted.push('is-open');
    for (var i = 0; i < CAP; i++) pips += '<span class="pip ' + (counted[i] || '') + '"></span>';
    setHTML($('stripPips'), pips);
    setText('stripCount', f.counted + '/' + CAP);
    var nf = engine.nextFeed(), nextTxt = '-';
    if (nf) nextTxt = (f.counted >= CAP && nf.today) ? 'Cap reached' : F.hhmm(nf.at) + (nf.today ? '' : ' tmrw');
    if (s.phase === 'reminder') nextTxt = 'Now (' + s.reminder.label + ')';
    if (s.finished) nextTxt = 'Run complete';
    setText('stripNext', nextTxt);
    var ss = $('stripState'); ss.setAttribute('data-tone', tone);
    if (ss.lastChild.textContent !== st.text) ss.lastChild.textContent = st.text;
    setText('stripWifi', s.wifi ? (s.power === 'on' ? 'Connected, app live' : 'Connected, device offline') : 'Offline, app stale');
    var active = s.alerts.filter(function (a) { return !a.ack; }).length;
    setText('stripAlerts', s.alerts.length ? (active + ' active' + (s.alerts.length > active ? ', ' + (s.alerts.length - active) + ' reviewed' : '')) : 'None');
    $('stripAlerts').style.color = active ? 'var(--fault)' : '';

    KEYS.forEach(renderReading);
    renderHealth();

    // feed card
    $('feedCard').setAttribute('data-state', feedState);
    var title, sub;
    if (code === 'reminder') { title = 'Feeding reminder: press the button at the tank'; sub = 'Slot ' + s.reminder.label + '. If nobody presses it within 10 minutes, the feeder runs automatically.'; }
    else if (code === 'dispense') { title = 'Automatic dispense'; sub = Engine.DISPENSE_STEPS[Math.min(s.dispense.step, 2)].label + '.'; }
    else if (code === 'fault') { title = 'Feeder fault: no food passage detected'; sub = 'The attempt was logged as unsuccessful and counted toward the cap. Inspect the feeder, then acknowledge the fault.'; }
    else if (code === 'cap') { title = 'Daily cap reached (' + f.counted + '/' + CAP + ')'; sub = 'Further scheduled feeds today are skipped. The count resets at midnight on the simulated clock.'; }
    else if (code === 'off') { title = 'Controller off'; sub = 'Simulated power interruption. The schedule, sensors and feeder are stopped.'; }
    else if (code === 'boot') { title = 'Controller restarting'; sub = 'Simulated boot. The restart policy is applied when it finishes.'; }
    else if (code === 'done') { title = settings.days + '-day run complete'; sub = 'Review the calendar, graphs and feed log below, or export the CSV files. Reset to run again.'; }
    else {
      title = s.running ? 'Monitoring' : 'Simulation paused';
      sub = nf ? ('Next scheduled feed at ' + F.hhmm(nf.at) + (nf.today ? ' (in ' + durText(nf.at - s.simTime) + ', simulated)' : ' tomorrow')) : 'No more feed slots in this run';
      if (!s.running) sub = 'Press Start to run the simulated clock. ' + sub + '.';
      if (settings.awayMode) sub += ' Away Mode is on: the hand-feed reminder will be skipped.';
      if (settings.feedMode !== 'hybrid') sub += ' Feeding mode: ' + Engine.FEED_MODES[settings.feedMode] + ' (comparison condition).';
    }
    setText('feedTitle', title); setText('feedSub', sub);
    var cd = $('countdown');
    if (code === 'reminder') {
      cd.hidden = false;
      var left = engine.reminderLeft();
      setText('cdTime', mmss(left));
      $('cdBar').style.transform = 'scaleX(' + (left / Engine.REMINDER_WINDOW).toFixed(4) + ')';
      var note = s.speed === 1 ? 'Real time: 10 simulated minutes = 10 real minutes.' : 'Demo speed ' + speedName(s.speed) + ': 10 simulated minutes take about ' + realText(600 / s.speed) + ' of real time.';
      if (!s.running) note = 'Paused. ' + note;
      if (settings.owner.mode === 'simulated') note += ' Simulated owner is on.';
      if (settings.feedMode === 'manual') note += ' Manual-only mode: if nobody presses, this feed is missed.';
      setHTML($('cdNote'), (s.speed === 1 ? '' : '<span class="tapebit" aria-hidden="true"></span>') + esc(note));
    } else cd.hidden = true;
    renderFlow(code);
    setText('tCounted', f.counted + ' / ' + CAP); setText('tManual', String(f.manual)); setText('tOk', String(f.autoOk)); setText('tFail', String(f.autoFail));

    renderScenarioCard();

    // presenter
    var rb = $('runBtn');
    setText('runBtn', s.finished ? 'Run complete' : (s.running ? 'Pause' : 'Start'));
    rb.disabled = s.finished;
    setText('mRun', s.finished ? 'Done' : (s.running ? 'Pause' : 'Start'));
    setText('mSpeed', speedName(s.speed));
    segCheck('speedSeg', 'speed', String(s.speed));
    setText('speedNote', s.speed === 1 ? 'Real time. The 10-minute window lasts 10 real minutes.' :
      'Shown as DEMO SPEED. 10 simulated minutes ≈ ' + realText(600 / s.speed) + '; one simulated day ≈ ' + realText(86400 / s.speed) + '.');
    segCheck('passSeg', 'pass', s.passageMode);
    KEYS.forEach(function (k) { segCheck('seg-' + k, 'status', s.sensors[k].status); });
    var bub = s.bubbles;
    setText('bubBtn', 'Air bubbles at turbidity sensor: ' + (bub ? 'on' : 'off') + (s.bubblesScn > 0 ? ' (scenario active)' : ''));
    $('bubBtn').setAttribute('aria-pressed', String(bub));
    $('ackFaultBtn').disabled = !s.feederFault;
    $('expireBtn').disabled = s.phase !== 'reminder';
    $('jumpBtn').disabled = s.phase !== 'idle' || s.finished;
    $('dayBtn').disabled = s.finished || s.day >= settings.days;
    $('endBtn').disabled = s.finished;
    setText('wifiBtn', s.wifi ? 'Disconnect Wi-Fi' : 'Reconnect Wi-Fi'); $('wifiBtn').setAttribute('aria-pressed', String(!s.wifi));
    setText('powerBtn', s.power === 'off' ? 'Restore power' : 'Cut power'); $('powerBtn').setAttribute('aria-pressed', String(s.power === 'off'));
    $('powerBtn').disabled = s.power === 'booting';
    $('awayChk').checked = !!settings.awayMode;
    $('modeSel').value = settings.feedMode;
    setText('lcdBtn', 'LCD status: ' + (s.lcdBug ? 'not updating (fault)' : 'updating'));
    $('lcdBtn').setAttribute('aria-pressed', String(!!s.lcdBug));
    $('ownerSel').value = settings.owner.mode;
    $('ownerPctField').hidden = settings.owner.mode !== 'simulated';

    // tank view
    var sv = s.sensors, alt = Math.floor(Date.now() / 3000) % 2 === 1;
    var l1 = alt ? ('TDS' + (sv.tds.value == null ? ' ---' : ('    ' + Math.round(sv.tds.value)).slice(-4)) + ' NTU' + (sv.turb.value == null ? ' --' : ('   ' + sv.turb.value.toFixed(0)).slice(-3)))
                 : ('pH ' + (sv.ph.value == null ? '--.--' : sv.ph.value.toFixed(2)) + ' ' + (sv.temp.value == null ? '--.-' : sv.temp.value.toFixed(1)) + 'C'), l2 = '';
    if (code === 'reminder') l2 = 'FEED? BTN ' + mmss(engine.reminderLeft());
    else if (code === 'dispense') l2 = 'Dispensing...';
    else if (code === 'fault') l2 = 'FEEDER FAULT';
    else if (code === 'cap') l2 = 'Cap ' + f.counted + '/' + CAP + ' reached';
    else if (nf) l2 = 'Next feed ' + F.hhmm(nf.at);
    else l2 = 'Day ' + s.day + ' done';
    var anyAlert = s.alerts.some(function (a) { return !a.ack; });
    tank.update({
      power: s.power,
      led: s.power !== 'on' ? 'off' : (s.phase === 'reminder' ? 'blink' : (anyAlert ? 'fault' : 'ok')),
      buzzer: s.power === 'on' && (s.phase === 'reminder' || anyAlert),
      lcd: lcdLines(s.power === 'off' ? ['', ''] : (s.power === 'booting' ? ['AquaCare  SIM', 'Booting...'] : [l1, l2])),
      turb: sv.turb.water == null ? 5 : sv.turb.water,
      heater: s.perts.some(function (p) { return p.kind === 'heater' && s.simTime <= p.end; }),
      bubbles: bub || s.bubblesScn > 0,
      probes: { ph: sv.ph.status, temp: sv.temp.status, tds: sv.tds.status, turb: sv.turb.status }
    });

    // architecture
    var off = s.power !== 'on';
    setBlk('a-ph', off ? 'is-off' : (s.sensors.ph.status !== 'ok' ? 'is-bad' : 'is-live'));
    setBlk('a-temp', off ? 'is-off' : (s.sensors.temp.status !== 'ok' ? 'is-bad' : 'is-live'));
    setBlk('a-tds', off ? 'is-off' : (s.sensors.tds.status !== 'ok' ? 'is-bad' : 'is-live'));
    setBlk('a-turb', off ? 'is-off' : (s.sensors.turb.status !== 'ok' ? 'is-bad' : 'is-live'));
    setBlk('a-btn', off ? 'is-off' : (s.phase === 'reminder' ? 'is-live' : null));
    setBlk('a-ir', off ? 'is-off' : (s.feederFault ? 'is-bad' : (s.phase === 'dispensing' && s.dispense.step >= 1 ? 'is-live' : null)));
    setBlk('a-esp', off ? 'is-off' : null);
    setBlk('a-lcd', off ? 'is-off' : 'is-live');
    setBlk('a-alarm', off ? 'is-off' : ((s.phase === 'reminder' || anyAlert) ? 'is-live' : null));
    setBlk('a-feed', off ? 'is-off' : (s.feederFault ? 'is-bad' : (s.phase === 'dispensing' ? 'is-live' : null)));
    setBlk('a-wifi', !s.wifi ? 'is-bad' : (off ? 'is-off' : 'is-live'));
    setBlk('a-app', !s.wifi || off ? 'is-off' : 'is-live');
    ['w-net', 'w-app'].forEach(function (id) { var w = $(id); if (w) w.classList.toggle('is-cut', !s.wifi); });

    renderApp();
    renderAlerts();
    renderRecent();
    renderCalendar();
    renderFeedTable();
    renderEventLog();
    renderScenarioList();
    renderSensorsTab();
    var now = performance.now();
    if (now - ui.chartAt > (s.running && s.speed >= 600 ? 700 : 400)) { ui.chartAt = now; drawChart(); }

    if (code !== ui.lastState) { if (ui.lastState !== null && !engine.quiet) $('liveState').textContent = title; ui.lastState = code; }
  }

  var frozenLcd = null;
  function lcdLines(lines) {
    var s = engine.s;
    if (s.lcdBug && s.power === 'on') { if (!frozenLcd) frozenLcd = lines.slice(); return frozenLcd; }
    frozenLcd = null; return lines;
  }
  function sizeLabel(v) { return v === 'p3' ? 'Tank: 36\u00D722\u00D726 cm (paper [3])' : 'Tank: ' + v + ' US gal'; }
  function speedName(x) { return x === 3600 ? '1 h/s' : x === 14400 ? '4 h/s' : x + '×'; }

  function renderReading(k) {
    var s = engine.s, sn = s.sensors[k], d = SENS[k], v = $('val-' + k), stt = $('st-' + k), label, tone;
    if (s.power !== 'on') { label = 'No power'; tone = 'off'; }
    else if (sn.status === 'disconnected') { label = 'Disconnected'; tone = 'fault'; }
    else if (sn.status === 'faulty') { label = 'Invalid values rejected'; tone = 'fault'; }
    else { label = 'Smoothed (5 samples)'; tone = 'ok'; }
    if (sn.value == null) { if (v.textContent !== 'No data') { v.textContent = 'No data'; v.classList.add('is-nodata'); } }
    else { v.classList.remove('is-nodata'); setText('val-' + k, sn.value.toFixed(d.dp)); }
    if (stt.textContent !== label) stt.textContent = label;
    stt.setAttribute('data-tone', tone);
    var last = null;
    for (var i = s.samples.length - 1; i >= 0 && i > s.samples.length - 2000; i--) { if (s.samples[i][k] != null) { last = s.samples[i]; break; } }
    setText('tm-' + k, last ? ('Day ' + last.day + ' · ' + F.hhmm(last.t) + ' SIM') : 'No samples yet');
    var rawTxt = sn.raw == null ? 'raw: no signal' : ('raw ' + sn.raw.toFixed(d.dp + (d.dp ? 0 : 0)) + (sn.rawValid ? ' → avg of ' + sn.buf.length + ' = ' + fmtV(k, sn.value) : ' → rejected (impossible value)'));
    setText('raw-' + k, rawTxt);
    // range gauge
    var r = limitsOf(k), lo = r[0], hi = r[1], val = sn.value;
    var span = { ph: [4, 10], temp: [18, 36], tds: [0, 600], turb: [0, 150] }[k];
    function pct(x) { return Math.max(0, Math.min(100, (x - span[0]) / (span[1] - span[0]) * 100)); }
    var gb = $('gb-' + k), gm = $('gm-' + k);
    if (lo == null && hi == null) { gb.style.left = '0%'; gb.style.width = '0%'; }
    else { var a = pct(lo == null ? span[0] : lo), b2 = pct(hi == null ? span[1] : hi); gb.style.left = a + '%'; gb.style.width = (b2 - a) + '%'; }
    gm.style.display = val == null ? 'none' : 'block';
    if (val != null) gm.style.left = pct(val) + '%';
    var state = '', stone = '';
    if (val == null) { state = 'No data'; stone = 'off'; }
    else if (lo == null && hi == null) { state = 'Not configured'; stone = 'off'; }
    else if (lo != null && val < lo) { state = 'Below range'; stone = 'fault'; }
    else if (hi != null && val > hi) { state = 'Above range'; stone = 'fault'; }
    else { state = 'In range'; stone = 'ok'; }
    var rs = $('rs-' + k); setText('rs-' + k, state); rs.setAttribute('data-tone', stone);
    setText('rg-' + k, 'Range ' + rangeText(k));
    setText('rgs-' + k, (lo == null && hi == null) ? '' : (settings.limitsSource === 'reference' ? 'reference, Ayon et al. [2]' : 'team-entered'));
    var note = NOTE[k];
    if (k === 'ph' && val != null && val > 8.0) note = 'Paper [2] reports pH drift above 8.0: recalibration needed before trusting this.';
    if (k === 'tds' && val != null && val > 280) note = 'Paper [2] reports lower TDS accuracy at the high end of the range.';
    if (k === 'turb' && (s.bubbles || s.bubblesScn > 0)) note = 'Bubbles at the sensor: paper [2] notes they distort turbidity readings.';
    setText('note-' + k, note);
    drawSpark('spark-' + k, k);
  }
  function drawSpark(id, key) {
    var data = engine.s.samples.slice(-180), svg = $(id);
    var sig = data.length + ':' + (data.length ? data[data.length - 1].t : 0);
    if (svg.getAttribute('data-sig') === sig) return;
    svg.setAttribute('data-sig', sig);
    var vals = data.map(function (d) { return d[key]; }).filter(function (x) { return x != null; });
    if (data.length < 2 || !vals.length) { svg.innerHTML = ''; return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = { ph: 0.05, temp: 0.2, tds: 4, turb: 0.8 }[key];
    if (hi - lo < pad * 2) { var mid = (hi + lo) / 2; lo = mid - pad; hi = mid + pad; }
    var d = '', pen = false;
    data.forEach(function (p, i) {
      if (p[key] == null) { pen = false; return; }
      d += (pen ? 'L' : 'M') + ((i / (data.length - 1)) * 240).toFixed(1) + ',' + (40 - ((p[key] - lo) / (hi - lo)) * 36).toFixed(1);
      pen = true;
    });
    svg.innerHTML = '<path class="ln" style="stroke:' + COLOR[key] + '" d="' + d + '"/>';
  }

  function renderHealth() {
    var s = engine.s, rows = [];
    KEYS.forEach(function (k) {
      var sn = s.sensors[k], name = SENS[k].name + ' (' + SENS[k].part + ')';
      if (s.power !== 'on') rows.push([name, 'No power', 'off', 1]);
      else if (sn.status === 'disconnected') rows.push([name, 'Disconnected', 'fault', 1]);
      else if (sn.status === 'faulty') rows.push([name, 'Faulty (' + sn.rejected + ' rejected)', 'fault', 1]);
      else rows.push([name, 'Connected', 'ok', 1]);
    });
    rows.push(['ESP32 controller', s.power === 'off' ? 'Off' : (s.power === 'booting' ? 'Restarting' : (s.finished ? 'Run complete' : (s.running ? 'Running' : 'Paused (demo)'))), s.power === 'on' && s.running ? 'ok' : 'off', 1]);
    rows.push(['Feeder + IR beam-break', s.power !== 'on' ? 'No power' : (s.feederFault ? 'Fault, inspect' : (s.chuteBlocked ? 'Chute blocked (scenario)' : (s.phase === 'dispensing' ? 'Dispensing' : 'Ready'))), s.power !== 'on' ? 'off' : (s.feederFault ? 'fault' : (s.chuteBlocked ? 'attn' : 'ok')), 1]);
    rows.push(['Wi-Fi', s.wifi ? 'Connected' : 'Disconnected', s.wifi ? 'ok' : 'fault', 0]);
    rows.push(['App link', !s.wifi ? 'Stale since ' + F.hhmm(s.appLastSync) : (s.power === 'on' ? 'Live' : 'Device offline'), s.wifi && s.power === 'on' ? 'ok' : 'attn', 0]);
    rows.push(['LCD', s.power !== 'on' ? 'No power' : (s.lcdBug ? 'Status not updating (fault)' : 'Updating'), s.power !== 'on' ? 'off' : (s.lcdBug ? 'fault' : 'ok'), 1]);
    rows.push(['pH calibration', 'Not calibrated', 'attn', 0]);
    setHTML($('health'), rows.map(function (r) {
      return '<li><span class="nm">' + esc(r[0]) + (r[3] ? ' <small>proposed</small>' : '') + '</span><span class="st" data-tone="' + r[2] + '">' + esc(r[1]) + '</span></li>';
    }).join(''));
  }

  // ---------- sensors & processing tab ----------
  function renderSensorsTab() {
    if ($('pane-sens').hidden) return;
    var s = engine.s;
    var sig = s.samples.length + ':' + s.pertRecords.length + ':' + s.pertRecords.map(function (r) { return r.detectedAt + '/' + r.cleared + '/' + r.peak; }).join() + JSON.stringify(settings.limits) + KEYS.map(function (k) { return s.sensors[k].status; }).join();
    if (sig === ui.sigSens) return;
    ui.sigSens = sig;
    $('chainBody').innerHTML = KEYS.map(function (k) {
      var sn = s.sensors[k], d = SENS[k], r = limitsOf(k);
      var raw = sn.raw == null ? '<span class="fine">no signal</span>' : sn.raw.toFixed(d.dp === 0 ? 1 : d.dp + 1);
      var val = sn.raw == null ? '-' : (sn.rawValid ? '<span class="ok">pass</span>' : '<span class="bad">reject</span>');
      var buf = sn.buf.length ? sn.buf.map(function (x) { return x.toFixed(d.dp === 0 ? 0 : d.dp); }).join(', ') : '-';
      var res;
      if (sn.value == null) res = '<span class="oc oc--missed_power">No data</span>';
      else if (r[0] == null && r[1] == null) res = '<span class="oc oc--open">Not configured</span>';
      else if ((r[0] != null && sn.value < r[0]) || (r[1] != null && sn.value > r[1])) res = '<span class="oc oc--auto_fail">Alert</span>';
      else res = '<span class="oc oc--auto_ok">In range</span>';
      return '<tr><td><b>' + SHORT[k] + '</b> <span class="fine">' + d.part + '</span></td><td class="mono">' + raw + '</td><td class="fine">identity (not calibrated)</td><td>' + val +
        (sn.rejected ? ' <span class="fine">(' + sn.rejected + ' rejected so far)</span>' : '') + '</td><td class="mono">' + buf + '</td><td class="mono"><b>' + fmtV(k, sn.value) + '</b></td><td class="mono">' + rangeText(k) + '</td><td>' + res + '</td></tr>';
    }).join('');
    var recs = s.pertRecords;
    $('pertEmpty').hidden = recs.length > 0;
    function after(t, r) { return t == null ? '<span class="fine">not yet</span>' : Math.round((t - r.start) / F.MIN) + ' min'; }
    $('pertBody').innerHTML = recs.slice().reverse().map(function (r) {
      var d = SENS[r.param];
      return '<tr><td>' + r.day + '</td><td class="mono">' + F.hhmm(r.start) + '</td><td>' + esc(r.label) + ' (' + r.minutes + ' min)</td><td>' + (r.src === 'demo' ? 'demo addition' : 'as in paper [2]') + ', ' + (r.via === 'scenario' ? 'scenario' : 'live') + '</td>' +
        '<td class="mono">' + fmtV(r.param, r.baseline) + ' ' + d.unit + '</td><td class="mono">' + fmtV(r.param, r.peak) + ' ' + d.unit + '</td><td class="mono">' +
        (r.detectedAt == null && (limitsOf(r.param)[0] == null && limitsOf(r.param)[1] == null) ? '<span class="fine">no range set</span>' : after(r.detectedAt, r)) + '</td><td class="mono">' + after(r.cleared, r) + '</td></tr>';
    }).join('');
  }

  function renderFlow(code) {
    var s = engine.s, map = { reminder: '', window: '', cap: '', dispense: '', ir: '' };
    if (code === 'reminder') { map.reminder = 'is-done'; map.window = 'is-active'; }
    else if (code === 'dispense') {
      var away = s.curRec && s.curRec.reminderAt == null;
      map.reminder = away ? 'is-skip' : 'is-done'; map.window = away ? 'is-skip' : 'is-done'; map.cap = 'is-done';
      if (s.dispense.step === 0) map.dispense = 'is-active'; else { map.dispense = 'is-done'; map.ir = 'is-active'; }
    } else {
      var rs = dayRecords(s.day), r = rs[rs.length - 1];
      if (r && r.outcome) {
        if (r.outcome === 'manual') { map.reminder = map.window = 'is-done'; map.cap = map.dispense = map.ir = 'is-skip'; }
        else if (r.outcome === 'auto_ok') { map.reminder = map.window = r.reminderAt == null ? 'is-skip' : 'is-done'; map.cap = map.dispense = map.ir = 'is-done'; }
        else if (r.outcome === 'auto_fail') { map.reminder = map.window = r.reminderAt == null ? 'is-skip' : 'is-done'; map.cap = map.dispense = 'is-done'; map.ir = 'is-bad'; }
        else if (r.outcome === 'cap_skip') { map.reminder = r.reminderAt ? 'is-done' : 'is-skip'; map.window = r.windowExpiredAt ? 'is-done' : 'is-skip'; map.cap = 'is-bad'; map.dispense = map.ir = 'is-skip'; }
        else if (r.outcome === 'missed_power') { map.reminder = r.reminderAt ? 'is-bad' : 'is-skip'; map.window = map.cap = map.dispense = map.ir = 'is-skip'; }
        else if (r.outcome === 'missed_manual') { map.reminder = 'is-done'; map.window = 'is-bad'; map.cap = map.dispense = map.ir = 'is-skip'; }
      }
    }
    var lis = $('flow').children;
    for (var i = 0; i < lis.length; i++) { var c = map[lis[i].getAttribute('data-step')] || ''; if (lis[i].className !== c) lis[i].className = c; }
  }

  function segCheck(id, attr, val) {
    var b = $(id).querySelectorAll('button');
    for (var i = 0; i < b.length; i++) { var on = b[i].getAttribute('data-' + attr) === val; b[i].setAttribute('aria-checked', String(on)); b[i].tabIndex = on ? 0 : -1; }
  }

  // ---------- scenario card ----------
  function renderScenarioCard() {
    var ls = engine.s.lastScenario, card = $('scenCard');
    if (!ls) { card.hidden = true; return; }
    var sig = ls.sc.id + ls.phase + engine.log.length;
    if (sig === ui.sigScen) return;
    ui.sigScen = sig;
    card.hidden = false;
    setText('scenName', (ls.phase === 'started' ? 'Started: ' : 'Ended: ') + engine.scenarioName(ls.sc));
    setText('scenResp', ls.response);
    var trail = engine.log.filter(function (e) { return e.t >= ls.at && e.kind !== 'demo' && e.kind !== 'system'; }).slice(0, 7);
    setHTML($('scenTrail'), trail.map(function (e) { return eventRow(e, true); }).join(''));
  }

  // ---------- events ----------
  function eventRow(e, compact) {
    var kc = kindClass(e.kind);
    if (compact) return '<li><span class="t">' + F.hhmm(e.t) + '</span><span class="x"><span class="kk kk-' + kc + '">' + esc(KIND[e.kind] || e.kind) + '</span>' + esc(e.text) + '</span></li>';
    var tags = '<span class="tag tag--demo">Demo data</span>' + (e.injected ? '<span class="tag tag--inj">injected</span>' : '') + (e.pendingSync ? '<span class="tag tag--q">queued</span>' : '');
    return '<li><span class="t">D' + e.day + ' ' + F.hhmmss(e.t) + '</span><span class="k k-' + kc + '">' + esc(KIND[e.kind] || e.kind) + '</span><span class="x">' + esc(e.text) + '</span><span class="tags">' + tags + '</span></li>';
  }
  function renderRecent() {
    var last = engine.log[engine.log.length - 1];
    var sig = (last ? last.id : 0) + ':' + engine.log.length;
    if ($('recent').getAttribute('data-sig') === sig) return;
    $('recent').setAttribute('data-sig', sig);
    $('recent').innerHTML = engine.log.slice(-6).reverse().map(function (e) { return eventRow(e, true); }).join('');
  }
  function logMatch(e, f) {
    if (f === 'all') return true;
    if (f === 'feed') return ['manual', 'auto', 'ok', 'fail', 'cap', 'reminder', 'owner'].indexOf(e.kind) >= 0;
    if (f === 'state') return ['sensor', 'wifi', 'power'].indexOf(e.kind) >= 0;
    if (f === 'scenario') return e.kind === 'scenario' || e.kind === 'logic' || e.kind === 'perturb';
    return e.kind === f;
  }
  function renderEventLog() {
    if ($('pane-log').hidden) return;
    var f = $('logFilter').value, q = $('logSearch').value.trim().toLowerCase();
    var last = engine.log[engine.log.length - 1];
    var queued = 0; for (var i = Math.max(0, engine.log.length - 400); i < engine.log.length; i++) if (engine.log[i].pendingSync) queued++;
    var sig = (last ? last.id : 0) + ':' + engine.log.length + ':' + queued + ':' + f + ':' + q + ':' + ui.selectedDay;
    if (sig === ui.sigLog) return;
    ui.sigLog = sig;
    var rows = engine.log.filter(function (e) {
      return logMatch(e, f) && (ui.selectedDay == null || e.day === ui.selectedDay) && (!q || (e.text + ' ' + (KIND[e.kind] || '') + ' d' + e.day + ' ' + F.hhmm(e.t)).toLowerCase().indexOf(q) >= 0);
    }).slice(-400).reverse();
    $('logList').innerHTML = rows.map(function (e) { return eventRow(e, false); }).join('');
    $('logEmpty').hidden = rows.length > 0;
  }

  // ---------- alerts + app ----------
  function renderAlerts() {
    var s = engine.s, active = s.alerts.filter(function (a) { return !a.ack; }).length;
    var badge = $('alertBadge'); badge.hidden = active === 0; badge.textContent = String(active);
    var anyLimit = Object.keys(settings.limits).some(function (k) { return settings.limits[k] != null; }) || settings.roc.phPerHour != null || settings.roc.tPerHour != null;
    setText('limitsSource', settings.limitsSource === 'reference' ? 'Loaded: reference operating ranges from the reviewed paper [2] (Ayon et al., 2026). They are not fish-safe thresholds confirmed for AquaCare. The team should confirm or replace them.' :
      (anyLimit ? 'Team-entered values. Record where each value comes from before using it in the report.' : 'Not configured. No water-quality alerts are evaluated. Equipment alerts (sensor, feeder) still work.'));
    setText('limitsState', anyLimit ? 'Water-quality alerts are evaluated against the limits entered above (user-entered demo values).' :
      'Water-quality alerts are not evaluated: no limits configured. Equipment alerts (sensor, feeder) still work.');
    var keys = s.alerts.map(function (a) { return a.key + (a.ack ? '1' : '0'); }).join(',');
    if (keys === ui.sigAlerts) return;
    ui.sigAlerts = keys;
    $('alertList').innerHTML = s.alerts.slice().reverse().map(function (a) {
      return '<li class="' + (a.ack ? 'is-ack' : '') + '"><div><div class="a-k">' + (a.cat === 'water' ? 'Water quality' : 'Equipment') + (a.ack ? ' &middot; reviewed' : '') + '</div><div class="a-t">' + esc(a.text) + '</div>' +
        '<div class="a-m">Since Day ' + a.day + ', ' + F.hhmm(a.since) + ' SIM &middot; demo data</div></div>' + (a.ack ? '' : '<button class="btn btn--sm" type="button" data-ack="' + esc(a.key) + '">Mark reviewed</button>') + '</li>';
    }).join('');
    $('alertEmpty').hidden = s.alerts.length > 0;
  }
  function renderApp() {
    var s = engine.s, live = s.wifi && s.power === 'on';
    if (live) appSnap = { ph: s.sensors.ph.value, temp: s.sensors.temp.value, tds: s.sensors.tds.value, turb: s.sensors.turb.value, at: s.simTime, feeds: s.feeds.counted };
    if ($('pane-app').hidden) return;
    setText('appConn', live ? 'Live (simulated link)' : (!s.wifi ? 'Offline: showing last synced data from ' + (appSnap.at != null ? F.hhmm(appSnap.at) : '-') : 'Device not responding (no power)'));
    $('appConn').classList.toggle('is-stale', !live);
    setText('appPh', appSnap.ph == null ? 'No data' : appSnap.ph.toFixed(2));
    setText('appT', appSnap.temp == null ? 'No data' : appSnap.temp.toFixed(1) + ' °C');
    setText('appTds', appSnap.tds == null ? 'No data' : Math.round(appSnap.tds) + ' ppm');
    setText('appTurb', appSnap.turb == null ? 'No data' : appSnap.turb.toFixed(1) + ' NTU');
    setText('appFeed', 'Scheduled feeds today: ' + (appSnap.feeds == null ? '-' : appSnap.feeds + '/' + CAP) + (live ? '' : ' (may be out of date)'));
    var notes = [];
    for (var i = engine.log.length - 1; i >= 0 && notes.length < 5; i--) {
      var e = engine.log[i];
      if (!e.pendingSync && ['reminder', 'alert', 'fail', 'ok', 'manual', 'cap'].indexOf(e.kind) >= 0) notes.push(e);
    }
    setHTML($('appNotes'), notes.map(function (e) { return '<li><b>D' + e.day + ' ' + F.hhmm(e.t) + '</b>' + esc(e.text) + '</li>'; }).join('') || '<li>No notifications yet.</li>');
  }

  // ---------- calendar ----------
  function renderCalendar() {
    var s = engine.s, days = settings.days;
    var lastRec = s.records[s.records.length - 1];
    var alertsByDay = {};
    var sig = s.day + ':' + s.records.length + ':' + (lastRec ? lastRec.outcome : '') + ':' + ui.selectedDay + ':' + settings.startDate + ':' + JSON.stringify(s.scn) + ':' + settings.scenarios.length + ':' + settings.slots.map(function (x) { return x.on + x.time; }).join();
    if (sig === ui.sigCal) return;
    ui.sigCal = sig;
    engine.log.forEach(function (e) { if (e.kind === 'alert' && /^Alert raised/.test(e.text)) alertsByDay[e.day] = (alertsByDay[e.day] || 0) + 1; });
    var byDay = {};
    s.records.forEach(function (r) { (byDay[r.day] = byDay[r.day] || []).push(r); });
    var scByDay = {};
    settings.scenarios.forEach(function (sc) { (scByDay[sc.day] = scByDay[sc.day] || []).push(sc); });
    var enabled = settings.slots.filter(function (x) { return x.on; }).length;
    var html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (w) { return '<div class="cal__wd" aria-hidden="true">' + w + '</div>'; }).join('');
    var lead = new Date(settings.startDate + 'T00:00:00Z').getUTCDay();
    if (isNaN(lead)) lead = 0;
    for (var b = 0; b < lead; b++) html += '<div class="cal__cell cal__blank" aria-hidden="true"></div>';
    for (var d = 1; d <= days; d++) {
      var rs = byDay[d] || [], isFuture = d > s.day, isToday = d === s.day && !s.finished;
      var pips = '';
      rs.forEach(function (r) { pips += '<span class="pip ' + OUT[currentRecordOutcome(r)][1] + '" title="' + esc(r.slot + ': ' + OUT[currentRecordOutcome(r)][0]) + '"></span>'; });
      var sched = rs.filter(function (r) { return r.source === 'schedule'; }).length;
      for (var k = sched; k < enabled; k++) pips += '<span class="pip"></span>';
      var tags = (scByDay[d] || []).map(function (sc) {
        var stt = s.scn[sc.id];
        return '<span class="cal__tag' + (stt === 'pending' ? ' is-pending' : '') + '" title="' + esc(engine.scenarioName(sc)) + '">' + SC_ABBR[sc.type] + '</span>';
      }).join('');
      if (alertsByDay[d]) tags += '<span class="cal__alert">' + alertsByDay[d] + ' alert' + (alertsByDay[d] > 1 ? 's' : '') + '</span>';
      var summary = rs.length ? rs.map(function (r) { return r.slot + ' ' + OUT[currentRecordOutcome(r)][0]; }).join('; ') : (isFuture ? 'not simulated yet' : 'no feed events');
      html += '<button type="button" class="cal__cell' + (isFuture ? ' is-future' : '') + (isToday ? ' is-today' : '') + '" role="gridcell" data-day="' + d + '" aria-selected="' + (ui.selectedDay === d) + '" aria-label="Day ' + d + ', ' + engine.dateLabel(d, true) + ': ' + esc(summary) + '">' +
        '<span class="cal__top"><span class="cal__d">D' + d + '</span><span class="cal__date">' + engine.dateLabel(d) + '</span></span>' +
        '<span class="cal__pips">' + pips + '</span><span class="cal__foot">' + tags + '</span></button>';
    }
    $('cal').innerHTML = html;
    var note = 'Select a day to filter the chart, feed log and event log. Dashed tags are scenarios that have not started yet.';
    if (ui.selectedDay) {
      var rsel = byDay[ui.selectedDay] || [];
      note = 'Day ' + ui.selectedDay + ' (' + engine.dateLabel(ui.selectedDay, true) + '): ' + (rsel.length ? rsel.map(function (r) { return r.slot + ' ' + OUT[currentRecordOutcome(r)][0].toLowerCase(); }).join(', ') : (ui.selectedDay > s.day ? 'not simulated yet' : 'no feed events')) + '.';
    }
    var cn = $('calNote');
    cn.innerHTML = esc(note) + (ui.selectedDay ? ' <button class="link link--inline" type="button" id="calClear">Show all days</button>' : '') +
      (ui.selectedDay && ui.selectedDay > s.day && !s.finished ? ' <button class="link link--inline" type="button" id="calGo">Fast-forward to Day ' + ui.selectedDay + '</button>' : '');
  }
  $('cal').addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-day]'); if (!c) return;
    selectDay(+c.getAttribute('data-day'));
  });
  $('calNote').addEventListener('click', function (ev) {
    if (ev.target.id === 'calClear') selectDay(null);
    if (ev.target.id === 'calGo') { engine.fastForwardToDay(ui.selectedDay); render(); }
  });
  function selectDay(d) {
    ui.selectedDay = (d && ui.selectedDay !== d) ? d : null;
    $('feedDay').value = ui.selectedDay ? String(ui.selectedDay) : 'all';
    setRange(ui.selectedDay ? 'day' : 'all');
    ui.sigCal = ''; ui.sigFeed = ''; ui.sigLog = '';
    render();
  }

  // ---------- feed table ----------
  (function fillDaySelect() {
    var h = '<option value="all">All days</option>';
    for (var d = 1; d <= 30; d++) h += '<option value="' + d + '">Day ' + d + '</option>';
    $('feedDay').innerHTML = h;
    var sd = '';
    for (d = 1; d <= 30; d++) sd += '<option value="' + d + '">Day ' + d + '</option>';
    $('scDay').innerHTML = sd;
  })();
  function recText(r) {
    return [r.day, 'd' + r.day, 'day ' + r.day, r.date, r.slot, r.source, OUT[currentRecordOutcome(r)][0], r.responder || '', r.ir || '', r.notes.join(' ')].join(' ').toLowerCase();
  }
  function renderFeedTable() {
    if ($('pane-feed').hidden) return;
    var s = engine.s, q = $('feedSearch').value.trim().toLowerCase(), oc = $('feedOutcome').value, dv = $('feedDay').value;
    var last = s.records[s.records.length - 1];
    var sig = s.records.length + ':' + (last ? last.outcome + last.ir : '') + ':' + q + ':' + oc + ':' + dv;
    if (sig === ui.sigFeed) return;
    ui.sigFeed = sig;
    var all = s.records;
    var rows = all.filter(function (r) {
      return (dv === 'all' || r.day === +dv) && (oc === 'all' || currentRecordOutcome(r) === oc) && (!q || recText(r).indexOf(q) >= 0);
    });
    var cnt = { manual: 0, auto_ok: 0, auto_fail: 0, cap_skip: 0, missed_power: 0, missed_manual: 0 };
    all.forEach(function (r) { if (cnt[r.outcome] !== undefined) cnt[r.outcome]++; });
    setText('feedSummary', all.length ? (all.length + ' feed events in this run: ' + cnt.manual + ' manual at tank, ' + cnt.auto_ok + ' auto with passage, ' + cnt.auto_fail + ' auto with no passage, ' + cnt.cap_skip + ' skipped by the cap, ' + cnt.missed_power + ' missed with no power' + (cnt.missed_manual ? ', ' + cnt.missed_manual + ' missed in manual-only mode' : '') + '.' + (rows.length !== all.length ? ' Showing ' + rows.length + '.' : '')) : 'No feed events yet. All rows are simulated demo data.');
    function tm(t) { return t == null ? '<span class="fine">-</span>' : F.hhmm(t); }
    $('feedBody').innerHTML = rows.slice().reverse().slice(0, 500).map(function (r) {
      var o = currentRecordOutcome(r), press = r.responseAt != null ? F.hhmm(r.responseAt) + ' (' + r.responder + ')' : (r.reminderAt == null && r.outcome !== 'cap_skip' && r.outcome !== 'missed_power' && r.outcome ? 'skipped (Away)' : '-');
      return '<tr><td>' + r.day + '</td><td class="mono">' + r.date + '</td><td class="mono">' + esc(r.slot) + '</td><td class="mono">' + tm(r.reminderAt) + '</td><td class="mono">' + esc(press) + '</td>' +
        '<td class="mono">' + tm(r.attemptAt) + '</td><td>' + esc(r.ir || '-') + '</td><td><span class="oc oc--' + o + '"><span class="pip ' + OUT[o][1] + '"></span>' + OUT[o][0] + '</span></td>' +
        '<td class="mono">' + (r.countAfter == null ? '-' : r.countAfter + '/' + CAP) + '</td><td>' + esc(r.notes.join('; ') || '') + '</td></tr>';
    }).join('');
    $('feedEmpty').hidden = rows.length > 0;
  }
  ['feedSearch', 'feedOutcome', 'feedDay', 'logSearch', 'logFilter'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (id === 'feedDay') { var v = $('feedDay').value; ui.selectedDay = v === 'all' ? null : +v; setRange(ui.selectedDay ? 'day' : 'all'); ui.sigCal = ''; }
      render();
    });
  });

  // ---------- chart (canvas) ----------
  var cv = $('chart'), ctx = cv.getContext('2d'), chartGeom = null;
  var CH = { pad: { l: 54, r: 16, t: 14 }, phH: 0.42, gap: 30 };
  function niceTicks(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function rangeBounds() {
    var s = engine.s, DAY = F.DAY;
    if (ui.range === 'day' && ui.selectedDay) return [(ui.selectedDay - 1) * DAY, ui.selectedDay * DAY];
    if (ui.range === '24h') return [Math.max(0, s.simTime - DAY), Math.max(DAY, s.simTime)];
    return [0, settings.days * DAY];
  }
  function drawChart() {
    var wrap = $('chartWrap'), W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var s = engine.s, sig = W + 'x' + H + ':' + s.samples.length + ':' + ui.range + ':' + ui.selectedDay + ':' + s.records.length + ':' + JSON.stringify(settings.limits) + ':' + Math.floor(s.simTime / 60000);
    if (sig === ui.sigChart) return;
    ui.sigChart = sig;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var css = getComputedStyle(document.documentElement), sans = css.getPropertyValue('--sans');
    var pl = CH.pad.l, pr = W - CH.pad.r, top = CH.pad.t, axisH = 40, gap = 18;
    var n = KEYS.length, ph = (H - top - axisH - gap * (n - 1)) / n;
    var panels = KEYS.map(function (k, i) { return { key: k, y0: top + i * (ph + gap), y1: top + i * (ph + gap) + ph }; });
    var first = panels[0], last = panels[n - 1];
    var rb = rangeBounds(), t0 = rb[0], t1 = rb[1];
    var X = function (t) { return pl + (t - t0) / (t1 - t0) * (pr - pl); };
    chartGeom = { pl: pl, pr: pr, t0: t0, t1: t1, p1: first };
    var ink = '#0f1f27', muted = '#536570', line = '#d3dce0';

    var cols = Math.max(1, Math.round(pr - pl)), bk = new Array(cols), offB = new Array(cols), wifiB = new Array(cols);
    var lo = 0, hi = s.samples.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (s.samples[mid].t < t0) lo = mid + 1; else hi = mid; }
    var any = false;
    for (var i = lo; i < s.samples.length; i++) {
      var p = s.samples[i]; if (p.t > t1) break;
      var c = Math.min(cols - 1, Math.max(0, Math.floor((p.t - t0) / (t1 - t0) * cols)));
      var b = bk[c] || (bk[c] = { ph: [], temp: [], tds: [], turb: [] });
      KEYS.forEach(function (k) { if (p[k] != null) b[k].push(p[k]); });
      if (p.off) offB[c] = true;
      if (!p.wifi) wifiB[c] = true;
      any = true;
    }
    var L = settings.limits;
    var MINSPAN = { ph: 0.3, temp: 1.2, tds: 20, turb: 4 }, DEF = { ph: [6.6, 7.4], temp: [25, 29], tds: [200, 260], turb: [0, 10] };
    function rangeFor(k) {
      var mn = Infinity, mx = -Infinity;
      bk.forEach(function (b) { if (!b) return; b[k].forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); });
      if (!isFinite(mn)) { mn = DEF[k][0]; mx = DEF[k][1]; }
      SENS[k].lim.forEach(function (lk) { var v = L[lk]; if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
      var span = Math.max(mx - mn, MINSPAN[k]), c2 = (mn + mx) / 2;
      var r = [c2 - span * 0.58, c2 + span * 0.58];
      if (k === 'tds' || k === 'turb') r[0] = Math.max(r[0], k === 'turb' ? -0.5 : 0);
      return r;
    }

    var hatch = document.createElement('canvas'); hatch.width = hatch.height = 8;
    var hx = hatch.getContext('2d'); hx.strokeStyle = 'rgba(217,138,30,.45)'; hx.lineWidth = 1.2; hx.beginPath(); hx.moveTo(0, 8); hx.lineTo(8, 0); hx.stroke();
    var hpat = ctx.createPattern(hatch, 'repeat');
    function bands(arr, style) {
      var start = -1;
      for (var c = 0; c <= cols; c++) {
        if (c < cols && arr[c]) { if (start < 0) start = c; }
        else if (start >= 0) { ctx.fillStyle = style; panels.forEach(function (pn) { ctx.fillRect(pl + start, pn.y0, c - start, pn.y1 - pn.y0); }); start = -1; }
      }
    }
    bands(wifiB, hpat);
    bands(offB, 'rgba(70,82,90,.22)');

    panels.forEach(function (pn) {
      var k = pn.key, rng = rangeFor(k), color = COLOR[k], d = SENS[k];
      var Y = function (v) { return pn.y1 - (v - rng[0]) / (rng[1] - rng[0]) * (pn.y1 - pn.y0); };
      ctx.font = '12px ' + sans; ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      niceTicks(rng[0], rng[1], 3).forEach(function (v) {
        var y = Math.round(Y(v)) + 0.5; if (y < pn.y0 + 4 || y > pn.y1 - 2) return;
        ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pr, y); ctx.stroke();
        ctx.fillText(k === 'tds' ? v.toFixed(0) : v.toFixed(1), pl - 8, y);
      });
      d.lim.forEach(function (lk) {
        var v = L[lk]; if (v == null) return;
        var y = Math.round(Y(v)) + 0.5;
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#d98a1e'; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pr, y); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#8f4700'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(v + (d.unit === 'pH' ? '' : ' ' + d.unit), pr - 4, y - 3);
      });
      ctx.fillStyle = color + '22';
      for (var c = 0; c < cols; c++) {
        var b = bk[c]; if (!b || b[k].length < 2) continue;
        var mn = Math.min.apply(null, b[k]), mx = Math.max.apply(null, b[k]);
        ctx.fillRect(pl + c, Y(mx), 1, Math.max(1, Y(mn) - Y(mx)));
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
      var pen = false;
      for (c = 0; c < cols; c++) {
        b = bk[c];
        var a2 = b && b[k];
        if (!a2 || !a2.length) { if (b) pen = false; continue; }
        var m = 0; for (var j = 0; j < a2.length; j++) m += a2[j]; m /= a2.length;
        if (pen) ctx.lineTo(pl + c + 0.5, Y(m)); else ctx.moveTo(pl + c + 0.5, Y(m));
        pen = true;
      }
      ctx.stroke();
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(pl + 0.5, pn.y0 + 0.5, pr - pl - 1, pn.y1 - pn.y0 - 1);
      pn.label = SHORT[k] + (d.unit === 'pH' ? '' : ' (' + d.unit + ')') + (d.scope === 'paper' ? ' · paper [2] sensor' : '');
    });

    var axY = last.y1 + 12, DAY = F.DAY, HOUR = F.HOUR;
    ctx.font = '12px ' + sans; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    function vline(x, col) { ctx.strokeStyle = col; ctx.beginPath(); panels.forEach(function (pn) { ctx.moveTo(x, pn.y0); ctx.lineTo(x, pn.y1); }); ctx.stroke(); }
    var spanDays = (t1 - t0) / DAY;
    if (spanDays > 2) {
      var every = (pr - pl) / spanDays < 26 ? 5 : ((pr - pl) / spanDays < 50 ? 2 : 1);
      for (var dd = 0; dd <= spanDays; dd++) {
        vline(Math.round(X(t0 + dd * DAY)) + 0.5, dd % every === 0 ? '#c3ced3' : '#e6ecee');
        if (dd < spanDays && dd % every === 0) ctx.fillText('D' + (Math.floor(t0 / DAY) + dd + 1), X(t0 + (dd + 0.5) * DAY), axY + 10);
      }
    } else {
      for (var h = Math.ceil(t0 / (3 * HOUR)) * 3 * HOUR; h <= t1; h += 3 * HOUR) {
        var xh = Math.round(X(h)) + 0.5;
        vline(xh, h % DAY === 0 ? '#c3ced3' : '#e6ecee');
        ctx.textAlign = xh > pr - 40 ? 'right' : (xh < pl + 30 ? 'left' : 'center');
        ctx.fillText((h % DAY === 0 ? 'D' + (Math.floor(h / DAY) + 1) + ' ' : '') + F.hhmm(h), xh, axY + 10);
      }
    }
    var colors = { manual: '#0a6672', auto_ok: '#1b6e38', auto_fail: '#a8221a', cap_skip: '#5b3a8a', missed_power: '#46525a', missed_manual: '#c2410c', open: '#d98a1e' };
    s.records.forEach(function (r) {
      var t = r.responseAt || r.attemptAt || r.reminderAt || r.scheduledAt;
      if (t < t0 || t > t1) return;
      var x = Math.round(X(t)) + 0.5;
      ctx.strokeStyle = colors[r.outcome || 'open']; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, last.y1 + 2); ctx.lineTo(x, last.y1 + 9); ctx.stroke();
    });
    // perturbation markers
    s.pertRecords.forEach(function (r) {
      if (r.start < t0 || r.start > t1) return;
      var pn = panels[KEYS.indexOf(r.param)], x = Math.round(X(r.start)) + 0.5;
      ctx.strokeStyle = '#8a6a06'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(x, pn.y0); ctx.lineTo(x, pn.y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(x - 5, pn.y0); ctx.lineTo(x + 5, pn.y0); ctx.lineTo(x, pn.y0 + 7); ctx.closePath(); ctx.fill();
    });
    ctx.lineWidth = 1;
    if (s.simTime >= t0 && s.simTime <= t1) {
      var xn = Math.round(X(s.simTime)) + 0.5;
      ctx.strokeStyle = ink; ctx.setLineDash([2, 3]); vline(xn, ink); ctx.setLineDash([]);
    }
    panels.forEach(function (pn) {
      ctx.font = '600 12px ' + sans;
      var lw = ctx.measureText(pn.label).width;
      ctx.fillStyle = 'rgba(251,252,252,.94)'; ctx.fillRect(pl + 1, pn.y0 + 1, lw + 14, 19);
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(pn.label, pl + 7, pn.y0 + 14);
    });
    ctx.font = '12px ' + sans;
    if (!any) {
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '14px ' + sans;
      ctx.fillText('No simulated readings in this range yet. Start the run.', (pl + pr) / 2, (first.y0 + last.y1) / 2);
    }
  }
  function sampleAt(t) {
    var a = engine.s.samples, lo = 0, hi = a.length - 1;
    if (!a.length) return null;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid].t < t) lo = mid + 1; else hi = mid; }
    var c = a[lo]; if (lo > 0 && Math.abs(a[lo - 1].t - t) < Math.abs(c.t - t)) c = a[lo - 1];
    return Math.abs(c.t - t) < 30 * F.MIN ? c : null;
  }
  function tipAt(clientX) {
    var g = chartGeom, r = cv.getBoundingClientRect(), x = clientX - r.left;
    if (!g || x < g.pl || x > g.pr) { $('chartTip').hidden = true; return; }
    var t = g.t0 + (x - g.pl) / (g.pr - g.pl) * (g.t1 - g.t0), smp = sampleAt(t), tip = $('chartTip');
    if (!smp) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = 'Day ' + smp.day + ' · ' + F.hhmm(smp.t) + ' SIM<br>' + KEYS.map(function (k) { return SHORT[k] + ' <b>' + (smp[k] == null ? 'no data' : smp[k].toFixed(SENS[k].dp) + (SENS[k].unit === 'pH' ? '' : ' ' + SENS[k].unit)) + '</b>'; }).join('<br>') + (smp.off ? '<br>controller off' : '') + (!smp.wifi ? '<br>Wi-Fi offline' : '');
    tip.style.left = Math.max(80, Math.min(r.width - 80, x)) + 'px';
    tip.style.top = g.p1.y0 + 40 + 'px';
  }
  cv.addEventListener('mousemove', function (e) { tipAt(e.clientX); });
  cv.addEventListener('mouseleave', function () { $('chartTip').hidden = true; });
  cv.addEventListener('touchmove', function (e) { if (e.touches[0]) tipAt(e.touches[0].clientX); }, { passive: true });
  cv.addEventListener('touchend', function () { setTimeout(function () { $('chartTip').hidden = true; }, 1500); });
  window.addEventListener('resize', function () { ui.sigChart = ''; drawChart(); });
  function setRange(r) {
    if (r === 'day' && !ui.selectedDay) { ui.selectedDay = engine.s.day; ui.sigCal = ''; $('feedDay').value = String(ui.selectedDay); }
    ui.range = r; segCheck('rangeSeg', 'range', r); ui.sigChart = ''; drawChart();
  }

  // ---------- scenarios tab ----------
  function scenStatus(sc) {
    var st = engine.s.scn[sc.id] || 'pending';
    return { pending: 'Scheduled', active: 'Active now', done: 'Done', late: 'Not run (time had passed)' }[st] ? [st, { pending: 'Scheduled', active: 'Active now', done: 'Done', late: 'Not run: time had passed' }[st]] : ['pending', 'Scheduled'];
  }
  function renderScenarioList() {
    var list = settings.scenarios.slice().sort(function (a, b) { return a.day - b.day || String(a.time).localeCompare(String(b.time)); });
    var sig = JSON.stringify(list) + JSON.stringify(engine.s.scn);
    if (sig === ui.sigScenList) return;
    ui.sigScenList = sig;
    $('scenList').innerHTML = list.map(function (sc) {
      var st = scenStatus(sc);
      return '<li><div><div class="n">' + esc(engine.scenarioName(sc)) + '<span class="st st--' + st[0] + '">' + st[1] + '</span></div>' +
        '<div class="s">' + esc(engine.dateLabel(sc.day, true)) + '</div></div><button class="btn btn--sm" type="button" data-rm="' + esc(sc.id) + '">Remove</button></li>';
    }).join('');
    $('scenEmpty').hidden = list.length > 0;
  }
  function syncScenForm() {
    var t = $('scType').value;
    $('scTargetRow').hidden = t !== 'sensor';
    $('scKindRow').hidden = t !== 'perturb';
    $('scTimeRow').hidden = t === 'missed';
    $('scDurRow').hidden = t === 'missed';
  }
  $('scType').addEventListener('change', syncScenForm); syncScenForm();
  $('scenForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('scenMsg'), t = $('scType').value, day = +$('scDay').value, time = $('scTime').value, mins = Math.round(+$('scMin').value);
    if (t !== 'missed' && F.parseHHMM(time) == null) { msg.textContent = 'Enter a start time.'; msg.className = 'form-msg is-bad'; return; }
    if (t !== 'missed' && (!isFinite(mins) || mins < 1 || mins > 4320)) { msg.textContent = 'Duration must be 1 to 4320 minutes.'; msg.className = 'form-msg is-bad'; return; }
    if (settings.scenarios.length >= 60) { msg.textContent = 'Up to 60 scenarios.'; msg.className = 'form-msg is-bad'; return; }
    var sc = { id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), day: day, time: t === 'missed' ? '00:00' : time, type: t };
    if (t !== 'missed') sc.minutes = mins;
    if (t === 'sensor') { var tv = $('scTarget').value.split(':'); sc.target = tv[0]; sc.mode = tv[1]; }
    if (t === 'perturb') sc.kind = $('scKind').value;
    settings.scenarios.push(sc);
    engine.syncScenarios();
    var late = engine.s.scn[sc.id] === 'late';
    engine.addLog('demo', 'Scenario scheduled: ' + engine.scenarioName(sc) + (late ? ' (its time has already passed in this run; reset to include it)' : ''), { injected: true });
    msg.textContent = late ? 'Added, but its time has already passed. Reset the run to include it.' : 'Added.';
    msg.className = 'form-msg ' + (late ? 'is-bad' : 'is-good');
    if (t === 'missed' && settings.owner.mode !== 'simulated') msg.textContent += ' Tip: set "Who presses the tank button" to Simulated owner so this has an effect.';
    save(); render();
  });
  $('scExample').addEventListener('click', function () {
    settings.scenarios.forEach(function (sc) { if (engine.s.scn[sc.id] === 'active') engine.endScenario(sc); });
    settings.scenarios = Engine.exampleScenarios();
    settings.owner.mode = 'simulated';
    engine.syncScenarios();
    var anyLate = settings.scenarios.some(function (sc) { return engine.s.scn[sc.id] === 'late'; });
    engine.addLog('demo', 'Example month loaded: ' + settings.scenarios.length + ' scenarios; simulated owner on (' + settings.owner.respondPct + '% response)', { injected: true });
    $('scenMsg').textContent = 'Example month loaded and Simulated owner switched on.' + (anyLate ? ' Some times have passed: reset the run to include them.' : '');
    $('scenMsg').className = 'form-msg is-good';
    save(); render();
  });
  $('scClear').addEventListener('click', function () {
    settings.scenarios.forEach(function (sc) { if (engine.s.scn[sc.id] === 'active') engine.endScenario(sc); });
    settings.scenarios = [];
    engine.addLog('demo', 'All scheduled scenarios removed', { injected: true });
    save(); render();
  });
  $('scenList').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-rm]'); if (!b) return;
    var id = b.getAttribute('data-rm'), sc = settings.scenarios.filter(function (x) { return x.id === id; })[0];
    if (!sc) return;
    if (engine.s.scn[id] === 'active') engine.endScenario(sc);
    settings.scenarios = settings.scenarios.filter(function (x) { return x.id !== id; });
    engine.addLog('demo', 'Scenario removed: ' + engine.scenarioName(sc), { injected: true });
    save(); render();
  });

  // ---------- setup form ----------
  function fillSetup() {
    $('startDate').value = settings.startDate;
    settings.slots.forEach(function (sl, i) { $('s' + i).value = sl.time; $('on' + i).checked = !!sl.on; });
  }
  fillSetup();
  $('setupForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('setupMsg'), date = $('startDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.textContent = 'Choose a start date.'; msg.className = 'form-msg is-bad'; return; }
    var slots = [0, 1, 2].map(function (i) { return { time: $('s' + i).value, on: $('on' + i).checked }; });
    if (!slots.some(function (x) { return x.on; })) { msg.textContent = 'Enable at least one feed time.'; msg.className = 'form-msg is-bad'; return; }
    var bad = slots.some(function (x) { return x.on && F.parseHHMM(x.time) == null; });
    if (bad) { msg.textContent = 'Enter a time for every enabled slot.'; msg.className = 'form-msg is-bad'; return; }
    var on = slots.filter(function (x) { return x.on; }).map(function (x) { return x.time; });
    if (on.length !== new Set(on).size) { msg.textContent = 'Feed times must be different.'; msg.className = 'form-msg is-bad'; return; }
    var times = on.map(F.parseHHMM).sort(function (a, b) { return a - b; });
    for (var i = 1; i < times.length; i++) if (times[i] - times[i - 1] < 15 * F.MIN) { msg.textContent = 'Keep enabled feed times at least 15 minutes apart, so each 10-minute window can finish.'; msg.className = 'form-msg is-bad'; return; }
    settings.startDate = date;
    settings.slots = slots;
    engine.reset();
    ui.selectedDay = null; ui.sigCal = '';
    msg.textContent = 'Run restarted: Day 1 is ' + engine.dateLabel(1, true) + ', ' + on.length + ' feed time' + (on.length > 1 ? 's' : '') + ' per day.';
    msg.className = 'form-msg is-good';
    save(); render();
  });

  // ---------- controls ----------
  function toggleRun() { if (engine.s.running) engine.pause(); else engine.start(); render(); }
  $('runBtn').addEventListener('click', toggleRun);
  $('mRun').addEventListener('click', toggleRun);
  $('resetBtn').addEventListener('click', function () { engine.reset(); ui.selectedDay = null; ui.sigCal = ''; setRange('all'); tank.render(settings.tankGal); tank.setAnimate($('animChk').checked); render(); });
  $('pressBtn').addEventListener('click', function () { engine.pressTankButton(); tank.pulseButton(); render(); });
  $('jumpBtn').addEventListener('click', function () { engine.jumpToNextFeed(); render(); });
  $('dayBtn').addEventListener('click', function () { engine.fastForwardNextDay(); render(); });
  $('endBtn').addEventListener('click', function () { engine.runToEnd(); render(); });
  $('expireBtn').addEventListener('click', function () { engine.expireNow(); render(); });
  $('injectBtn').addEventListener('click', function () { engine.injectTrigger(); render(); });
  $('ackFaultBtn').addEventListener('click', function () { engine.ackFeederFault(); render(); });
  $('wifiBtn').addEventListener('click', function () { engine.setWifi(!engine.s.wifi); render(); });
  $('powerBtn').addEventListener('click', function () { if (engine.s.power === 'off') engine.restorePower(); else engine.cutPower(); render(); });
  $('ownerSel').addEventListener('change', function () {
    settings.owner.mode = $('ownerSel').value;
    engine.addLog('demo', 'Tank button pressed by: ' + (settings.owner.mode === 'simulated' ? 'simulated owner (' + settings.owner.respondPct + '% of reminders)' : 'presenter'), { injected: true });
    save(); render();
  });
  $('ownerPct').value = settings.owner.respondPct; $('ownerPctOut').textContent = settings.owner.respondPct + '%';
  $('ownerPct').addEventListener('input', function () { settings.owner.respondPct = +$('ownerPct').value; $('ownerPctOut').textContent = settings.owner.respondPct + '%'; });
  $('ownerPct').addEventListener('change', function () { engine.addLog('demo', 'Simulated owner now responds to ' + settings.owner.respondPct + '% of reminders', { injected: true }); save(); });

  function bindSeg(id, attr, fn) {
    var seg = $(id);
    seg.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; fn(b.getAttribute('data-' + attr)); render(); });
    seg.addEventListener('keydown', function (ev) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(ev.key) < 0) return;
      ev.preventDefault();
      var bs = Array.prototype.slice.call(seg.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
      var n = bs[(i + (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? bs.length - 1 : 1)) % bs.length];
      n.focus(); n.click();
    });
  }
  bindSeg('speedSeg', 'speed', function (v) { engine.setSpeed(+v); });
  bindSeg('passSeg', 'pass', function (v) { engine.setPassageMode(v); });
  KEYS.forEach(function (k) { bindSeg('seg-' + k, 'status', function (v) { engine.setSensorStatus(k, v); }); });
  document.querySelectorAll('[data-pert]').forEach(function (b) {
    b.addEventListener('click', function () { engine.startPerturbation(b.getAttribute('data-pert'), +$('pertMin').value, 'live'); render(); });
  });
  $('bubBtn').addEventListener('click', function () { engine.setBubbles(!engine.s.bubbles); render(); });
  bindSeg('rangeSeg', 'range', function (v) { setRange(v); });
  segCheck('rangeSeg', 'range', 'all');

  KEYS.forEach(function (k) {
    var r = $('base-' + k), u = SENS[k].unit === 'pH' ? '' : ' ' + SENS[k].unit;
    r.addEventListener('input', function () { engine.setTarget(k, r.value); $('bo-' + k).textContent = (+r.value).toFixed(SENS[k].dp === 2 ? 1 : SENS[k].dp) + u; });
    r.addEventListener('change', function () { engine.commitTarget(k); render(); });
  });
  $('patternChk').checked = settings.dailyPattern !== false;
  $('patternChk').addEventListener('change', function () { settings.dailyPattern = $('patternChk').checked; save(); });

  $('sizeSel').value = String(settings.tankGal);
  $('baySize').textContent = sizeLabel(settings.tankGal) + ' · demo setting';
  $('sizeSel').addEventListener('change', function () {
    settings.tankGal = $('sizeSel').value;
    tank.render(settings.tankGal); tank.setAnimate($('animChk').checked);
    $('baySize').textContent = sizeLabel(settings.tankGal) + ' · demo setting';
    engine.addLog('demo', 'Tank size demo setting changed to ' + sizeLabel(settings.tankGal).replace('Tank: ', '') + ' (illustration only)', { injected: true });
    save(); render();
  });
  $('awayChk').addEventListener('change', function () { engine.setAway($('awayChk').checked); save(); render(); });
  $('animChk').addEventListener('change', function () { tank.setAnimate($('animChk').checked); });

  // limits + settings
  var limitFields = [['lPhMin', 'limits', 'phMin'], ['lPhMax', 'limits', 'phMax'], ['lTMin', 'limits', 'tMin'], ['lTMax', 'limits', 'tMax'],
    ['lTdsMin', 'limits', 'tdsMin'], ['lTdsMax', 'limits', 'tdsMax'], ['lTurbMin', 'limits', 'turbMin'], ['lTurbMax', 'limits', 'turbMax'],
    ['lPhRoc', 'roc', 'phPerHour'], ['lTRoc', 'roc', 'tPerHour']];
  function fillLimits() {
    limitFields.forEach(function (f) { var v = settings[f[1]][f[2]]; $(f[0]).value = v == null ? '' : String(v); });
    $('portion').value = settings.portion || '';
    $('polReminder').value = settings.policy.interruptedReminder;
    $('polCount').value = settings.policy.countAfterRestart;
  }
  fillLimits();
  $('limitsForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('limitsMsg'), next = {}, bad = null;
    limitFields.forEach(function (f) {
      var raw = $(f[0]).value.trim().replace(',', '.');
      if (raw === '') { next[f[2]] = null; return; }
      var v = Number(raw);
      if (!isFinite(v)) bad = 'Enter numbers only, or leave a field empty.';
      else if (f[2].indexOf('ph') === 0 && f[1] === 'limits' && (v < 0 || v > 14)) bad = 'pH limits must be between 0 and 14.';
      else if (f[1] === 'roc' && v <= 0) bad = 'Rate-of-change limits must be above 0.';
      next[f[2]] = v;
    });
    if (!bad && next.phMin != null && next.phMax != null && next.phMin >= next.phMax) bad = 'pH low limit must be below the high limit.';
    if (!bad && next.tMin != null && next.tMax != null && next.tMin >= next.tMax) bad = 'Temperature low limit must be below the high limit.';
    if (!bad && next.tdsMin != null && next.tdsMax != null && next.tdsMin >= next.tdsMax) bad = 'TDS low limit must be below the high limit.';
    if (!bad && next.turbMin != null && next.turbMax != null && next.turbMin >= next.turbMax) bad = 'Turbidity low limit must be below the high limit.';
    if (!bad && ['tdsMin', 'tdsMax', 'turbMin', 'turbMax'].some(function (k) { return next[k] != null && next[k] < 0; })) bad = 'TDS and turbidity limits cannot be negative.';
    if (bad) { msg.textContent = bad; msg.className = 'form-msg is-bad'; return; }
    var ref = Engine.referenceLimits(), same = true;
    Object.keys(ref).forEach(function (k) { if (next[k] !== ref[k]) same = false; });
    Object.keys(ref).forEach(function (k) { settings.limits[k] = next[k]; });
    var none = Object.keys(ref).every(function (k) { return next[k] == null; });
    settings.limitsSource = same ? 'reference' : (none ? 'none' : 'custom');
    settings.roc.phPerHour = next.phPerHour; settings.roc.tPerHour = next.tPerHour;
    engine.s.alerts.filter(function (a) { return a.cat === 'water'; }).map(function (a) { return a.key; }).forEach(function (k) { engine.clear(k, 'Water alert cleared (limits changed)'); });
    var L = settings.limits, R = settings.roc, nc = function (v, u) { return v == null ? 'not configured' : v + (u || ''); };
    engine.addLog('demo', 'Operating ranges applied (' + (settings.limitsSource === 'reference' ? 'reference values from paper [2]' : 'user-entered demo values') + '): pH ' + nc(L.phMin) + ' to ' + nc(L.phMax) + '; temp ' + nc(L.tMin) + ' to ' + nc(L.tMax, ' °C') +
      '; TDS ' + nc(L.tdsMin) + ' to ' + nc(L.tdsMax, ' ppm') + '; turbidity ' + nc(L.turbMin) + ' to ' + nc(L.turbMax, ' NTU') + '; rate of change pH ' + nc(R.phPerHour, '/h') + ', temp ' + nc(R.tPerHour, ' °C/h'), { injected: true });
    msg.textContent = 'Applied.'; msg.className = 'form-msg is-good';
    ui.sigChart = '';
    save(); render();
  });
  $('limitsRef').addEventListener('click', function () {
    var ref = Engine.referenceLimits();
    limitFields.forEach(function (f) { if (f[1] === 'limits') $(f[0]).value = ref[f[2]] == null ? '' : String(ref[f[2]]); });
    $('limitsForm').requestSubmit ? $('limitsForm').requestSubmit() : $('limitsForm').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  $('limitsClear').addEventListener('click', function () {
    limitFields.forEach(function (f) { $(f[0]).value = ''; });
    $('limitsForm').requestSubmit ? $('limitsForm').requestSubmit() : $('limitsForm').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  $('portion').addEventListener('change', function () {
    var v = $('portion').value.trim().slice(0, 40);
    settings.portion = v || null;
    engine.addLog('demo', 'Portion label ' + (v ? 'set to "' + v + '" (label only, not a confirmed amount)' : 'cleared: Not configured'), { injected: true });
    save();
  });
  $('polReminder').addEventListener('change', function () { settings.policy.interruptedReminder = $('polReminder').value; engine.addLog('demo', 'Restart policy for interrupted reminders: ' + $('polReminder').selectedOptions[0].text + ' (requires team decision)', { injected: true }); save(); });
  $('polCount').addEventListener('change', function () { settings.policy.countAfterRestart = $('polCount').value; engine.addLog('demo', 'Restart policy for the daily count: ' + $('polCount').selectedOptions[0].text + ' (requires team decision)', { injected: true }); save(); });
  $('defaultsBtn').addEventListener('click', function () {
    var d = Engine.defaultSettings(), keep = { startDate: settings.startDate, slots: settings.slots, scenarios: settings.scenarios };
    Object.keys(d).forEach(function (k) { settings[k] = d[k]; });
    Object.keys(keep).forEach(function (k) { settings[k] = keep[k]; });
    fillLimits();
    $('sizeSel').value = String(settings.tankGal); tank.render(settings.tankGal); tank.setAnimate($('animChk').checked);
    $('baySize').textContent = sizeLabel(settings.tankGal) + ' · demo setting';
    $('ownerPct').value = settings.owner.respondPct; $('ownerPctOut').textContent = settings.owner.respondPct + '%';
    $('patternChk').checked = true;
    engine.s.alerts.filter(function (a) { return a.cat === 'water'; }).map(function (a) { return a.key; }).forEach(function (k) { engine.clear(k, 'Water alert cleared (settings restored)'); });
    engine.addLog('demo', 'Default demo settings restored (limits Not configured; run setup and scenarios kept)', { injected: true });
    save(); render();
  });
  $('alertList').addEventListener('click', function (ev) { var b = ev.target.closest('[data-ack]'); if (!b) return; engine.ackAlert(b.getAttribute('data-ack')); render(); });

  var audioCtx = null;
  $('buzzBtn').addEventListener('click', function () {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 2300;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.4);
    } catch (e) { /* audio unavailable */ }
  });

  // ---------- CSV export ----------
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csvHead(what) {
    return [
      '# SIMULATION - DEMO DATA. ' + what + ' generated by the AquaCare digital prototype in a web browser. Not hardware measurements or test results.',
      '# Run: start ' + settings.startDate + ', ' + settings.days + ' days, feed times ' + settings.slots.filter(function (x) { return x.on; }).map(function (x) { return x.time; }).join(' / ') +
        ', button pressed by ' + (settings.owner.mode === 'simulated' ? 'simulated owner (' + settings.owner.respondPct + '%)' : 'presenter') + ', ' + settings.scenarios.length + ' scheduled scenarios',
      '# Exported ' + new Date().toISOString() + '; simulated clock ' + (engine.s.finished ? 'at the end of Day ' + settings.days + ' (run complete)' : 'at Day ' + engine.s.day + ' ' + F.hhmm(engine.s.simTime)),
      ''
    ];
  }
  function fname(kind) { return 'aquacare-SIMULATION-DEMO-DATA-' + kind + '-' + settings.startDate + '.csv'; }
  $('expFeed').addEventListener('click', function () {
    var L = csvHead('Feed log');
    L.push('label,sim_day,date,slot,source,feeding_mode,reminder_time,button_press_time,pressed_by,window_expired_time,auto_attempt_time,ir_result,outcome,count_after,notes');
    engine.s.records.forEach(function (r) {
      L.push(['SIMULATION - DEMO DATA', r.day, r.date, r.slot, r.source, r.mode || 'hybrid', r.reminderAt == null ? '' : F.hhmmss(r.reminderAt), r.responseAt == null ? '' : F.hhmmss(r.responseAt), r.responder || '',
        r.windowExpiredAt == null ? '' : F.hhmmss(r.windowExpiredAt), r.attemptAt == null ? '' : F.hhmmss(r.attemptAt), r.ir || '', r.outcome || 'in progress', r.countAfter == null ? '' : r.countAfter + '/' + CAP, r.notes.join('; ')].map(csvCell).join(','));
    });
    saveFile(fname('feed-log'), L.join('\r\n'));
  });
  $('expRead').addEventListener('click', function () {
    var L = csvHead('Readings (one sample per simulated minute; raw and 5-sample smoothed)');
    L.splice(3, 0, '# TDS and turbidity sensors come from reviewed paper [2] and are not yet in the AquaCare design. Operating ranges: ' + KEYS.map(function (k) { return SHORT[k] + ' ' + rangeText(k); }).join('; ') + (settings.limitsSource === 'reference' ? ' (reference values from paper [2])' : ''));
    L.push('label,sim_day,date,time,' + KEYS.map(function (k) { var u = { ph: 'ph', temp: 'temperature_c', tds: 'tds_ppm', turb: 'turbidity_ntu' }[k]; return u + '_raw,' + u + '_raw_valid,' + u + '_smoothed'; }).join(',') + ',controller,wifi');
    var cacheDate = {};
    engine.s.samples.forEach(function (r) {
      var dt = cacheDate[r.day] || (cacheDate[r.day] = F.isoFor(settings.startDate, r.day));
      var cols = ['SIMULATION - DEMO DATA', r.day, dt, F.hhmm(r.t)];
      KEYS.forEach(function (k) {
        var dp = SENS[k].dp;
        cols.push(r[k + '_raw'] == null ? 'no data' : r[k + '_raw'].toFixed(dp + 1));
        cols.push(r[k + '_ok'] == null ? '' : (r[k + '_ok'] ? 'yes' : 'no'));
        cols.push(r[k] == null ? 'no data' : r[k].toFixed(dp));
      });
      cols.push(r.off ? 'off' : 'on', r.wifi ? 'connected' : 'offline');
      L.push(cols.join(','));
    });
    saveFile(fname('readings'), L.join('\r\n'));
  });
  $('expPert').addEventListener('click', function () {
    var L = csvHead('Perturbation tests');
    L.splice(3, 0, '# Detection time depends on this demo\'s 1-minute sampling and 5-sample smoothing. It is not the reviewed paper\'s response time and not a hardware result.');
    L.push('label,sim_day,date,start_time,test,parameter,source,triggered_by,stimulus_min,baseline,peak,unit,alert_after_min,back_in_range_after_min,operating_range');
    engine.s.pertRecords.forEach(function (r) {
      var d = SENS[r.param];
      L.push(['SIMULATION - DEMO DATA', r.day, F.isoFor(settings.startDate, r.day), F.hhmm(r.start), r.label, SHORT[r.param], r.src === 'demo' ? 'demo addition' : 'as in paper [2]', r.via === 'scenario' ? 'scenario' : 'live',
        r.minutes, r.baseline == null ? '' : r.baseline.toFixed(d.dp), r.peak == null ? '' : r.peak.toFixed(d.dp), d.unit,
        r.detectedAt == null ? '' : Math.round((r.detectedAt - r.start) / F.MIN), r.cleared == null ? '' : Math.round((r.cleared - r.start) / F.MIN), rangeText(r.param)].map(csvCell).join(','));
    });
    saveFile(fname('perturbation-tests'), L.join('\r\n'));
  });
  $('expEvents').addEventListener('click', function () {
    var L = csvHead('Event log');
    L.push('label,sim_day,date,time,event_type,description,injected_by_presenter,queued_offline');
    engine.log.forEach(function (e) {
      L.push(['SIMULATION - DEMO DATA', e.day, F.isoFor(settings.startDate, e.day), F.hhmmss(e.t), KIND[e.kind] || e.kind, e.text, e.injected ? 'yes' : 'no', e.pendingSync ? 'yes' : 'no'].map(csvCell).join(','));
    });
    saveFile(fname('event-log'), L.join('\r\n'));
  });
  var clearArmed = null;
  $('clearBtn').addEventListener('click', function () {
    var b = $('clearBtn');
    if (!clearArmed) { b.textContent = 'Press again to clear'; clearArmed = setTimeout(function () { clearArmed = null; b.textContent = 'Clear demo history'; }, 3000); return; }
    clearTimeout(clearArmed); clearArmed = null; b.textContent = 'Clear demo history';
    engine.clearHistory(); ui.sigCal = ''; render();
  });

  // ---------- feeding modes ----------
  $('modeSel').addEventListener('change', function () { engine.setFeedMode($('modeSel').value); save(); render(); });
  $('lcdBtn').addEventListener('click', function () { engine.setLcdBug(!engine.s.lcdBug); render(); });
  $('fishSel').value = String(settings.fishCount);
  $('fishSel').addEventListener('change', function () { settings.fishCount = +$('fishSel').value; tank.fishCount = settings.fishCount; tank.render(settings.tankGal); tank.setAnimate($('animChk').checked); save(); });
  var lastCmp = null;
  function fmtMin(v) { return v == null ? '-' : v.toFixed(1) + ' min'; }
  $('cmpBtn').addEventListener('click', function () {
    $('cmpBtn').disabled = true; $('cmpBtn').textContent = 'Running 3 \u00D7 30 days...';
    setTimeout(function () {
      var res = Engine.compareModes(settings, engine.seed);
      lastCmp = { res: res, pct: settings.owner.respondPct, scen: settings.scenarios.length, slots: settings.slots.filter(function (x) { return x.on; }).map(function (x) { return x.time; }).join(' / ') };
      var M = ['manual', 'auto', 'hybrid'];
      var rows = [
        ['Scheduled feed events', 'scheduled'],
        ['Feeds delivered (manual + automatic with passage)', 'delivered'],
        ['Owner at the tank (manual feeds)', 'manual'],
        ['Automatic feeds with passage detected', 'autoOk'],
        ['Automatic attempts with no passage (fault)', 'autoFail'],
        ['Feeds missed (nobody fed / no power)', 'missed'],
        ['Days with every scheduled feed delivered', 'daysAllFed'],
        ['Average delay after the scheduled time', 'meanDelay'],
        ['Longest delay', 'maxDelay']
      ];
      $('cmpBody').innerHTML = rows.map(function (r) {
        return '<tr><td>' + r[0] + '</td>' + M.map(function (m) {
          var v = res[m][r[1]];
          var txt = (r[1] === 'meanDelay' || r[1] === 'maxDelay') ? fmtMin(v) : (r[1] === 'daysAllFed' ? v + ' / ' + res[m].days : String(v));
          return '<td class="mono' + (m === 'hybrid' ? ' is-design' : '') + '">' + txt + '</td>';
        }).join('') + '</tr>';
      }).join('');
      $('cmpWrap').hidden = false; $('expCmp').hidden = false;
      $('cmpNote').textContent = 'Simulated owner answers ' + lastCmp.pct + '% of reminders after 1\u20139 min (a demo assumption). Feed times ' + lastCmp.slots + '. ' + lastCmp.scen + ' scheduled scenarios applied to all three runs. Change the owner response rate in Presenter controls and compare again to see how sensitive the result is.';
      $('cmpMsg').textContent = 'Done. Manual only depends entirely on the owner. Automatic only feeds on time but never brings the owner to the tank. Ask-then-fallback delivers like automatic while keeping the owner involved, at the cost of a few minutes\u2019 delay.';
      $('cmpMsg').className = 'form-msg is-good';
      $('cmpBtn').disabled = false; $('cmpBtn').textContent = 'Compare feeding modes';
      engine.addLog('demo', 'Feeding modes compared over ' + settings.days + ' simulated days (manual only / automatic only / ask-then-fallback): delivered ' + res.manual.delivered + ' / ' + res.auto.delivered + ' / ' + res.hybrid.delivered + ' of ' + res.hybrid.scheduled, { injected: true });
    }, 30);
  });
  $('expCmp').addEventListener('click', function () {
    if (!lastCmp) return;
    var L = csvHead('Feeding-mode comparison (three 30-day runs, same seed and scenarios)');
    L.splice(3, 0, '# Compares feeding logic under a simulated owner (' + lastCmp.pct + '% response). Does not model fish growth, stress, survival or water cloudiness.');
    L.push('label,measure,manual_only,automatic_only,ask_then_fallback');
    var keys = [['scheduled', 'scheduled_feed_events'], ['delivered', 'feeds_delivered'], ['manual', 'owner_at_tank_manual_feeds'], ['autoOk', 'automatic_with_passage'], ['autoFail', 'automatic_no_passage_fault'],
      ['missed', 'feeds_missed'], ['missedManual', 'missed_manual_only_no_fallback'], ['missedPower', 'missed_no_power'], ['daysAllFed', 'days_all_feeds_delivered'], ['meanDelay', 'mean_delay_min'], ['maxDelay', 'max_delay_min']];
    keys.forEach(function (k) {
      L.push(['SIMULATION - DEMO DATA', k[1]].concat(['manual', 'auto', 'hybrid'].map(function (m) { var v = lastCmp.res[m][k[0]]; return v == null ? '' : (typeof v === 'number' && v % 1 ? v.toFixed(2) : v); })).map(csvCell).join(','));
    });
    saveFile(fname('feeding-mode-comparison'), L.join('\r\n'));
  });
  $('p3Btn').addEventListener('click', function () {
    settings.slots = [{ time: '08:00', on: true }, { time: '13:00', on: false }, { time: '18:00', on: true }];
    settings.tankGal = 'p3'; settings.fishCount = 6;
    $('sizeSel').value = 'p3'; $('fishSel').value = '6'; tank.fishCount = 6;
    tank.render(settings.tankGal); tank.setAnimate($('animChk').checked);
    $('baySize').textContent = sizeLabel(settings.tankGal) + ' \u00B7 demo setting';
    engine.reset(); ui.selectedDay = null; ui.sigCal = '';
    fillSetup();
    engine.addLog('demo', 'Paper [3] study setup loaded: 2 feeds per day (08:00 and 18:00 are demo times; the slide gives no times), 36\u00D722\u00D726 cm tank, 6 fish shown', { injected: true });
    $('cmpMsg').textContent = 'Paper [3] setup loaded: 2 feeds/day, 36\u00D722\u00D726 cm tank, 6 fish. The feed times 08:00 and 18:00 are demo choices. The run was reset.';
    $('cmpMsg').className = 'form-msg is-good';
    save(); render();
  });

  // ---------- self-test ----------
  $('testBtn').addEventListener('click', function () {
    $('testBtn').disabled = true; $('testBtn').textContent = 'Running...';
    setTimeout(function () {
      var res = window.AquaSelfTest(Engine), pass = res.filter(function (r) { return r.pass; }).length;
      $('testList').innerHTML = res.map(function (r) {
        return '<li><span class="r ' + (r.pass ? 'pass' : 'failr') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</span><span>' + esc(r.name) + (r.pass ? '' : ' <small>(' + esc(r.detail) + ')</small>') + '</span></li>';
      }).join('') + '<li><span class="sum">' + pass + ' of ' + res.length + ' simulation logic checks passed. Software model only, not a hardware result.</span></li>';
      $('testBtn').disabled = false; $('testBtn').textContent = 'Run logic self-test';
    }, 30);
  });

  // ---------- tabs ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#tabs [role="tab"]'));
  function selectTab(t, focus) {
    if (typeof t === 'string') t = $('tab-' + t);
    tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; $(x.getAttribute('aria-controls')).hidden = !on; });
    ui.sigFeed = ''; ui.sigLog = ''; ui.sigSens = '';
    if (focus) t.focus();
    render();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (ev) {
      var j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (ev.key === 'Home') j = 0;
      if (ev.key === 'End') j = tabs.length - 1;
      if (j !== null) { ev.preventDefault(); selectTab(tabs[j], true); }
    });
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-goto-tab]'); if (!b) return;
    var t = $('tab-' + b.getAttribute('data-goto-tab'));
    if (sheet.classList.contains('is-open')) openSheet(false);
    selectTab(t, true);
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- mobile presenter sheet ----------
  var sheet = $('presenter'), scrim = $('scrim'), opener = $('mOpen');
  function openSheet(on) {
    sheet.classList.toggle('is-open', on); scrim.hidden = !on; opener.setAttribute('aria-expanded', String(on));
    if (on) $('presenterClose').focus(); else opener.focus();
  }
  opener.addEventListener('click', function () { openSheet(true); });
  $('presenterClose').addEventListener('click', function () { openSheet(false); });
  scrim.addEventListener('click', function () { openSheet(false); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && sheet.classList.contains('is-open')) openSheet(false); });

  // keep sticky offsets right when the notice bar wraps
  function syncBars() { document.documentElement.style.setProperty('--sbh', $('simbar').offsetHeight + 'px'); }
  window.addEventListener('resize', syncBars); syncBars();

  // ---------- loop ----------
  var last = performance.now();
  setInterval(function () {
    var now = performance.now(), dt = Math.min(1000, now - last);
    last = now;
    engine.tick(dt);
    render();
  }, 100);
  render();

  window.aquacare = { engine: engine, tank: tank, settings: settings, render: render, selectTab: selectTab, selectDay: selectDay, setRange: setRange, save: save,
    refresh: function () { ui.sigCal = ui.sigFeed = ui.sigLog = ui.sigChart = ui.sigScen = ui.sigAlerts = ''; ui.sigScenList = ''; ui.sigSens = ''; fillSetup(); fillLimits(); render(); } };
})();
