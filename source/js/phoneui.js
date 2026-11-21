/* AquaCare phone app UI: five pages (Home, Camera, Feeding, Alerts, Settings).
   Shared by the two phone mock-ups on the main page and by the standalone phone page.
   SIMULATION: it reads the simulated controller. When Wi-Fi is down it shows the last
   synced data, as a real app would, while the controller keeps feeding on its own.
   There is no feed button: a manual feed can only be confirmed at the tank. */
(function (root) {
  'use strict';
  var Engine = root.AquaEngine, F = Engine.fmt, CAP = Engine.DAILY_CAP, KEYS = Engine.KEYS;
  var OUT = {
    manual: ['Fed by hand at the tank', 'is-manual'], auto_ok: ['Fed automatically, food passage seen', 'is-ok'], auto_fail: ['Automatic attempt, no food passage (fault)', 'is-fail'],
    cap_skip: ['Skipped, daily limit', 'is-cap'], missed_power: ['Missed, no power', 'is-miss'], missed_manual: ['Missed, manual-only mode', 'is-missm'], open: ['In progress', 'is-open']
  };
  var TONE = { idle: 'ok', paused: 'off', reminder: 'attn', dispense: 'accent', fault: 'fault', cap: 'accent', off: 'off', boot: 'off', done: 'accent' };
  var STATE = {
    idle: 'Monitoring. All feeding runs on the controller.', paused: 'Simulation paused.',
    reminder: 'Feeding time: waiting for the button at the tank.', dispense: 'The feeder is giving one portion now.',
    fault: 'Feeder fault: no food passage seen on the last attempt. Check the chute.', cap: 'Daily limit reached: no more feeds today.'
  };
  var LIST_MAX = 3, ALERT_MAX = 2;   // keeps every page on one phone screen

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mmss(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60); }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function setT(key, t) { each('[data-app="' + key + '"]', function (n) { if (n.textContent !== t) n.textContent = t; }); }
  function setH(key, h) { each('[data-app-html="' + key + '"]', function (n) { if (n.innerHTML !== h) n.innerHTML = h; }); }
  function show(sel, on) { each(sel, function (n) { if (n.hidden === on) n.hidden = !on; }); }
  function more(n) { return n > 0 ? '<li class="papp__more">+ ' + n + ' more</li>' : ''; }

  function selectPage(screen, page, focus) {
    Array.prototype.forEach.call(screen.querySelectorAll('.ptabs [role="tab"]'), function (b) {
      var on = b.getAttribute('data-page') === page;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    Array.prototype.forEach.call(screen.querySelectorAll('.ppage'), function (pg) { pg.hidden = pg.getAttribute('data-page') !== page; });
    screen.querySelector('.ppages').scrollTop = 0;
  }

  // opts: engine() -> current Engine; tankGal() -> size value; setTankGal(v); has3d() -> bool; goCam()
  function PhoneUI(opts) {
    this.o = opts;
    this.snap = { ph: null, temp: null, tds: null, turb: null, at: null, feeds: null, alerts: [] };
    var self = this;
    each('.papp', function (screen) {
      var bar = screen.querySelector('.ptabs');
      bar.addEventListener('click', function (e) { var b = e.target.closest('[role="tab"]'); if (b) selectPage(screen, b.getAttribute('data-page')); });
      bar.addEventListener('keydown', function (e) {
        var list = Array.prototype.slice.call(bar.querySelectorAll('[role="tab"]')), i = list.indexOf(document.activeElement), n = list.length;
        var j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (i < 0 || j < 0) return;
        e.preventDefault(); selectPage(screen, list[j].getAttribute('data-page'), true);
      });
    });
    each('[data-app-size]', function (sel) { sel.addEventListener('change', function () { if (self.o.setTankGal) self.o.setTankGal(sel.value); }); });
    each('[data-app-gocam]', function (btn) { btn.addEventListener('click', function () { if (self.o.goCam) self.o.goCam(); }); });
  }
  PhoneUI.selectPage = selectPage;

  PhoneUI.prototype.take = function (at) {
    var e = this.o.engine(), sn = e.s.sensors;
    this.snap = { ph: sn.ph.value, temp: sn.temp.value, tds: sn.tds.value, turb: sn.turb.value, at: at, feeds: e.s.feeds.counted,
      alerts: e.s.alerts.map(function (a) { return { key: a.key, cat: a.cat, text: a.text, since: a.since, day: a.day, ack: a.ack }; }) };
  };
  // Call from the engine listener: keeps the data as it was when the link dropped.
  PhoneUI.prototype.onEvent = function (type, d) {
    if (type === 'log' && d.kind === 'wifi' && /disconnected/.test(d.text) && (this.snap.at == null || this.snap.at < d.t)) this.take(d.t);
  };
  PhoneUI.prototype.reset = function () { this.snap = { ph: null, temp: null, tds: null, turb: null, at: null, feeds: null, alerts: [] }; };

  PhoneUI.prototype.render = function () {
    var e = this.o.engine(), s = e.s, live = s.wifi && s.power === 'on', snap;
    if (live) this.take(s.simTime);
    snap = this.snap;
    // Home
    setT('conn', live ? 'Live (simulated link)' : (!s.wifi ? 'Offline: last data from ' + (snap.at != null ? F.hhmm(snap.at) : '-') : 'Device not responding (no power)'));
    each('[data-app="conn"]', function (n) { n.classList.toggle('is-stale', !live); });
    setT('ph', snap.ph == null ? 'No data' : snap.ph.toFixed(2));
    setT('temp', snap.temp == null ? 'No data' : snap.temp.toFixed(1) + ' °C');
    setT('tds', snap.tds == null ? 'No data' : Math.round(snap.tds) + ' ppm');
    setT('turb', snap.turb == null ? 'No data' : snap.turb.toFixed(1) + ' NTU');
    var alerts = snap.alerts || [];
    KEYS.forEach(function (k) {
      var warn = alerts.some(function (a) { return a.cat === 'water' && a.key.indexOf(k + '-') === 0; });
      each('[data-tile="' + k + '"]', function (n) { n.classList.toggle('is-warn', warn); });
    });
    var nf = e.nextFeed(), next;
    if (live && s.phase === 'reminder') next = 'Now: press the tank button';
    else if (live && s.phase === 'dispensing') next = 'Now: feeder dispensing';
    else if (!nf) next = 'None left in this run';
    else next = (snap.feeds >= CAP && nf.today) ? 'Daily limit reached' : F.hhmm(nf.at) + (nf.today ? '' : ' tomorrow');
    setT('next', next);
    setT('feeds', snap.feeds == null ? '-' : snap.feeds + ' of ' + CAP + (live ? '' : ' (may be old)'));
    var today = s.records.filter(function (r) { return r.day === s.day && (live || r.scheduledAt <= snap.at); });
    var pips = '', got = [];
    today.forEach(function (r) { if (r.outcome === 'manual' || r.outcome === 'auto_ok' || r.outcome === 'auto_fail') got.push(OUT[r.outcome][1]); });
    for (var i = 0; i < CAP; i++) pips += '<span class="pip ' + (got[i] || '') + '"></span>';
    setH('pips', pips);
    var open = alerts.filter(function (a) { return !a.ack; }).length;
    setT('alertsum', alerts.length ? alerts.length + ' active' + (open < alerts.length ? ' (' + (alerts.length - open) + ' reviewed)' : '') : 'No active alerts');
    each('[data-app-card="alerts"]', function (n) { n.classList.toggle('is-warn', alerts.length > 0); });
    setT('badge', open ? String(open) : '');
    show('[data-app="badge"]', open > 0);
    // Feeding
    var st = e.systemState(), code = st.code;
    setT('fstate', !live ? (s.wifi ? 'The controller is not responding (no power).' : 'Offline. The controller keeps feeding on its own; this page may be out of date.') : (STATE[code] || st.text + '.'));
    each('[data-app="fstate"]', function (n) { n.setAttribute('data-tone', !live ? 'off' : (TONE[code] || 'ok')); });
    var remind = live && s.phase === 'reminder';
    show('[data-app-show="remind"]', remind);
    if (remind) {
      var left = e.reminderLeft();
      setT('cd', mmss(left));
      each('[data-app-bar="cd"]', function (n) { n.style.transform = 'scaleX(' + (left / Engine.REMINDER_WINDOW).toFixed(4) + ')'; });
    }
    var recent = today.slice(-LIST_MAX);
    setH('feedlist', recent.map(function (r) {
      var o = OUT[r.outcome || 'open'], t = r.responseAt != null ? r.responseAt : (r.attemptAt != null ? r.attemptAt : r.scheduledAt);
      return '<li class="' + o[1] + '" title="' + esc(o[0]) + '"><b>' + esc(r.slot) + ' slot · ' + F.hhmm(t) + '</b>' + esc(o[0]) + '</li>';
    }).join('') || '<li>No feeds yet today.</li>');
    // Alerts
    var rev = alerts.slice().reverse();
    setH('alerts', rev.slice(0, ALERT_MAX).map(function (a) {
      return '<li class="' + (a.ack ? '' : 'is-warn') + '" title="' + esc(a.text) + '">' + esc(a.text) + '<small>' + (a.cat === 'water' ? 'Water' : 'Equipment') + ' · Day ' + a.day + ', ' + F.hhmm(a.since) + (a.ack ? ' · reviewed' : '') + '</small></li>';
    }).join('') + more(rev.length - ALERT_MAX) || '<li>No active alerts.</li>');
    var notes = [];
    for (var j = e.log.length - 1; j >= 0 && notes.length < ALERT_MAX; j--) {
      var en = e.log[j];
      if (!en.pendingSync && ['reminder', 'alert', 'fail', 'ok', 'manual', 'cap'].indexOf(en.kind) >= 0) notes.push(en);
    }
    setH('notes', notes.map(function (en) { return '<li title="' + esc(en.text) + '">' + esc(en.text) + '<small>Day ' + en.day + ', ' + F.hhmm(en.t) + '</small></li>'; }).join('') || '<li>No notifications yet.</li>');
    // Camera link and tank size
    var has3d = this.o.has3d ? this.o.has3d() : false;
    show('[data-app-gocam]', has3d);
    setT('camnote', has3d ? 'The top camera is a proposed upgrade. Its picture and fish analysis are on the phone beside the tank in the 3D Tank view.'
      : 'The top camera is a proposed upgrade shown only in the 3D Tank view. 3D graphics are not running here.');
    var gal = this.o.tankGal ? String(this.o.tankGal()) : null;
    if (gal) each('[data-app-size]', function (n) { if (document.activeElement !== n && n.value !== gal) n.value = gal; });
  };

  root.AquaPhoneUI = PhoneUI;
})(window);
