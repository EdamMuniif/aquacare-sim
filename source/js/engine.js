/*
 * AquaCare digital prototype - simulation engine v2
 * --------------------------------------------------
 * SIMULATION ONLY. Models the PROPOSED ESP32 firmware logic in the browser.
 * Nothing here reads real sensors or drives real hardware; every value is demo data.
 *
 * v2 adds: a 30-day calendar run from a start date, up to three feed slots per day,
 * an event-driven clock (fast runs stay exact), a simulated owner, scheduled
 * scenarios (Wi-Fi loss, sensor failure, blocked chute, missed confirmation,
 * power interruption) and one structured record per feed event.
 */
(function (root) {
  'use strict';

  var SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var REMINDER_WINDOW = 10 * MIN;   // project requirement
  var DAILY_CAP = 3;                // project requirement
  var SAMPLE_EVERY = MIN;           // demo sampling interval
  var DISPENSE_REAL_MS = 3400;
  // Optional mechanical filter (proposal). Loaded before this file in the browser; required in Node.
  var Stages = root.AquaFilterStages || (typeof require === 'function' ? (function () { try { return require('./filterstages.js'); } catch (e) { return null; } })() : null);
  var Filt = root.AquaFilter || (typeof require === 'function' ? (function () { try { return require('./filter.js'); } catch (e) { return null; } })() : null);      // animation length at slow speeds (not a hardware timing)
  var DISPENSE_SIM_MS = 60 * SEC;   // upper bound in simulated time, so fast runs stay exact
  var BOOT_REAL_MS = 1500, BOOT_SIM_MS = 30 * SEC;
  var DISPENSE_STEPS = [
    { id: 'servo', label: 'Servo rotates (proposed feeder)', until: 0.41 },
    { id: 'chute', label: 'Food in chute: IR beam-break check', until: 0.82 },
    { id: 'result', label: 'Result logged', until: 1 }
  ];
  var SCENARIO_TYPES = {
    wifi:   { label: 'Wi-Fi loss', needsMinutes: true },
    sensor: { label: 'Sensor failure', needsMinutes: true },
    chute:  { label: 'Blocked chute', needsMinutes: true },
    missed: { label: 'Missed confirmation', needsMinutes: false },
    power:  { label: 'Power interruption', needsMinutes: true },
    perturb: { label: 'Perturbation test', needsMinutes: true },
    bubbles: { label: 'Air bubbles at the turbidity sensor', needsMinutes: true },
    lcd: { label: 'LCD status not updating', needsMinutes: true }
  };
  // Feeding modes. 'manual' and 'auto' mirror the two conditions compared in reviewed paper [3]
  // (Setiawan et al., CEPAT 2024); 'hybrid' is AquaCare's ask-then-fallback design.
  var FEED_MODES = {
    hybrid: 'AquaCare ask-then-fallback',
    manual: 'Manual only, no automatic fallback',
    auto: 'Automatic only, no hand-feed prompt'
  };

  // Sensor set. pH and temperature are in the AquaCare brief. TDS and turbidity, and the
  // part numbers, come from the reviewed paper [2] (Ayon et al., arXiv 2601.08484, 2026).
  // base / noise / pattern / plausibility values are demo choices, not sensor ratings.
  var SENSORS = {
    ph:   { key: 'ph',   name: 'pH sensor',        part: 'SEN0161', unit: 'pH',  dp: 2, base: 7.0,  noise: 0.05, pat: [0.05, 0.5],  scope: 'brief', lim: ['phMin', 'phMax'],     ref: [6.8, 8.2], plaus: [0, 14] },
    temp: { key: 'temp', name: 'DS18B20 probe',    part: 'DS18B20', unit: '\u00B0C', dp: 1, base: 27.0, noise: 0.12, pat: [0.6, 0.375], scope: 'brief', lim: ['tMin', 'tMax'], ref: [24, 28], plaus: [0, 50] },
    tds:  { key: 'tds',  name: 'TDS sensor',       part: 'SEN0244', unit: 'ppm', dp: 0, base: 230,  noise: 5,    pat: [4, 0.6],     scope: 'paper', lim: ['tdsMin', 'tdsMax'],   ref: [180, 280], plaus: [0, 2000] },
    turb: { key: 'turb', name: 'Turbidity sensor', part: 'SEN0189', unit: 'NTU', dp: 1, base: 5,    noise: 0.6,  pat: [0.8, 0.55],  scope: 'paper', lim: ['turbMin', 'turbMax'], ref: [null, 50], plaus: [0, 3000] }
  };
  var KEYS = ['ph', 'temp', 'tds', 'turb'];
  var SMOOTH_N = 5;   // five-sample smoothing, as described in the reviewed paper
  // Invalid raw values the "faulty" mode produces; local validation must reject them.
  var BAD_RAW = { ph: 15.3, temp: -127, tds: -40, turb: -12 };
  // Controlled changes. heater / vinegar / soil follow the paper's tests; magnitudes and
  // time constants (minutes) are demo choices. "salts" is a demo addition (not in the paper).
  var PERTURB = {
    heater:  { param: 'temp', label: 'Heater on: temperature rise',     mag: 3.5,  up: 45, down: 90,  src: 'paper' },
    vinegar: { param: 'ph',   label: 'Vinegar added: pH drop',           mag: -1.2, up: 4,  down: 120, src: 'paper' },
    soil:    { param: 'turb', label: 'Soil added: turbidity rise',       mag: 90,   up: 3,  down: 150, src: 'paper' },
    salts:   { param: 'tds',  label: 'Dissolved solids added: TDS rise', mag: 120,  up: 10, down: 600, src: 'demo' }
  };
  function referenceLimits() {
    return { phMin: 6.8, phMax: 8.2, tMin: 24, tMax: 28, tdsMin: 180, tdsMax: 280, turbMin: null, turbMax: 50 };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tod(ms) { return ((ms % DAY) + DAY) % DAY; }
  function hhmm(ms) { var d = tod(ms); return pad(Math.floor(d / HOUR)) + ':' + pad(Math.floor((d % HOUR) / MIN)); }
  function hhmmss(ms) { var d = tod(ms); return hhmm(ms) + ':' + pad(Math.floor((d % MIN) / 1000)); }
  function parseHHMM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * HOUR + mi * MIN;
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // Calendar date for a simulation day (UTC arithmetic avoids DST surprises)
  function dateFor(startISO, day) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startISO || '') || [0, 2026, 1, 1];
    return new Date(Date.UTC(+p[1], +p[2] - 1, +p[3] + day - 1));
  }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateLabel(startISO, day, long) {
    var d = dateFor(startISO, day);
    return (long ? WD[d.getUTCDay()] + ' ' : '') + d.getUTCDate() + ' ' + MO[d.getUTCMonth()] + (long ? ' ' + d.getUTCFullYear() : '');
  }
  function isoFor(startISO, day) {
    var d = dateFor(startISO, day);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function defaultSettings() {
    return {
      startDate: todayISO(),
      days: 30,
      slots: [
        { time: '08:00', on: true },
        { time: '13:00', on: true },
        { time: '18:00', on: true }
      ],
      portion: null,                                   // "Not configured"
      tankGal: '5',                                    // demo setting only
      limits: referenceLimits(),                       // reference values from paper [2]; team to confirm
      limitsSource: 'reference',
      roc: { phPerHour: null, tPerHour: null },
      awayMode: false,                                 // proposed feature
      feedMode: 'hybrid',                              // 'hybrid' | 'manual' | 'auto' (comparison conditions)
      fishCount: 10,                                   // decorative only
      dailyPattern: true,                              // synthetic day/night shape in demo readings
      owner: { mode: 'presenter', respondPct: 60 },    // who presses the tank button
      policy: { interruptedReminder: 'missed', countAfterRestart: 'retain' },
      filter: { enabled: false, flowLph: null, mode: 'auto', boost: false, carbon: false },   // filter proposal; off by default
      scenarios: []
    };
  }

  function exampleScenarios() {
    var id = 1;
    function s(o) { o.id = 'x' + (id++); return o; }
    return [
      s({ day: 3, time: '07:30', type: 'wifi', minutes: 360 }),
      s({ day: 5, time: '00:00', type: 'missed' }),
      s({ day: 8, time: '00:00', type: 'missed' }),
      s({ day: 8, time: '12:00', type: 'chute', minutes: 720 }),
      s({ day: 11, time: '02:00', type: 'sensor', target: 'ph', mode: 'faulty', minutes: 180 }),
      s({ day: 14, time: '08:03', type: 'power', minutes: 25 }),
      s({ day: 18, time: '10:00', type: 'sensor', target: 'temp', mode: 'disconnected', minutes: 120 }),
      s({ day: 21, time: '12:40', type: 'power', minutes: 45 }),
      s({ day: 24, time: '00:00', type: 'missed' }),
      s({ day: 27, time: '07:00', type: 'wifi', minutes: 720 }),
      s({ day: 27, time: '00:00', type: 'missed' }),
      s({ day: 6, time: '13:30', type: 'perturb', kind: 'heater', minutes: 120 }),
      s({ day: 12, time: '10:00', type: 'perturb', kind: 'vinegar', minutes: 60 }),
      s({ day: 16, time: '15:00', type: 'perturb', kind: 'soil', minutes: 60 }),
      s({ day: 20, time: '09:00', type: 'bubbles', minutes: 180 }),
      s({ day: 23, time: '11:00', type: 'perturb', kind: 'salts', minutes: 60 })
    ];
  }

  function freshState(seed) {
    return {
      running: false, speed: 1, finished: false,
      simTime: 0, day: 1,
      power: 'on', boot: null,
      wifi: true, appLastSync: 0,
      phase: 'idle', reminder: null, dispense: null,
      passageMode: 'detect',
      chuteBlocked: false, ownerSuppressed: false, lcdBug: 0, lcdFrozen: null,
      firedSlots: {},
      feeds: { counted: 0, manual: 0, autoOk: 0, autoFail: 0 },
      interrupted: null,
      sensors: (function () {
        var o = {};
        KEYS.forEach(function (k) { o[k] = { target: SENSORS[k].base, value: null, raw: null, rawValid: false, status: 'ok', buf: [], rejected: 0, water: null }; });
        return o;
      })(),
      perts: [],            // active water perturbations
      pertRecords: [],      // one record per perturbation test
      bubbles: false, bubblesScn: 0,
      nextSampleAt: 0,
      samples: [],
      alerts: [],
      feederFault: false,
      records: [], curRec: null,
      scn: {},              // scenario id -> 'pending' | 'active' | 'done' | 'late'
      lastScenario: null,   // { sc, phase, response }
      rand: mulberry32(seed || 20261122),
      ownerRand: mulberry32((seed || 20261122) ^ 0x5bd1e995)
    };
  }

  function Engine(opts) {
    opts = opts || {};
    this.listeners = [];
    this.log = [];
    this.settings = opts.settings || defaultSettings();
    this.seed = opts.seed || 20261122;
    this.quiet = false;
    this.nextId = 1;
    this.recId = 1;
    this.initRun();
  }

  Engine.REMINDER_WINDOW = REMINDER_WINDOW;
  Engine.DAILY_CAP = DAILY_CAP;
  Engine.DISPENSE_STEPS = DISPENSE_STEPS;
  Engine.SCENARIO_TYPES = SCENARIO_TYPES;
  Engine.defaultSettings = defaultSettings;
  Engine.SENSORS = SENSORS;
  Engine.FEED_MODES = FEED_MODES;
  Engine.KEYS = KEYS;
  Engine.PERTURB = PERTURB;
  Engine.SMOOTH_N = SMOOTH_N;
  Engine.referenceLimits = referenceLimits;
  Engine.exampleScenarios = exampleScenarios;
  Engine.fmt = { hhmm: hhmm, hhmmss: hhmmss, parseHHMM: parseHHMM, dateLabel: dateLabel, isoFor: isoFor, MIN: MIN, HOUR: HOUR, DAY: DAY, SEC: SEC };

  var P = Engine.prototype;

  P.on = function (fn) { this.listeners.push(fn); };
  P.emit = function (type, data) { if (this._replaying) return; for (var i = 0; i < this.listeners.length; i++) this.listeners[i](type, data); };

  P.firstSlotTime = function () {
    var t = this.slotTimes().filter(function (x) { return x != null; });
    return t.length ? Math.min.apply(null, t) : 8 * HOUR;
  };
  P.dayStartOffset = function () { return Math.max(0, this.firstSlotTime() - 2 * MIN); };
  P.endOfRun = function () { return this.settings.days * DAY; };

  P.initRun = function () {
    var speed = this.s ? this.s.speed : 1;
    this.s = freshState(this.seed);
    this.s.speed = speed;
    this.s.simTime = this.dayStartOffset();
    var lived = this.s.simTime - UPKEEP.startAgeDays * DAY;      // the tank starts lived-in, not spotless
    this.s.maint = { glass: lived, gravel: lived, probes: lived };
    this.s.filter = Filt ? Filt.create(this.settings.filter, Filt.volumeL(this.settings.tankGal), this.s.simTime) : null;
    this.s.water = Stages ? Stages.create(this.settings.filter, this.s.simTime) : null;
    this.s.nextSampleAt = Math.floor(this.s.simTime / MIN) * MIN;
    var scn = this.s.scn;
    (this.settings.scenarios || []).forEach(function (sc) { scn[sc.id] = 'pending'; });
    this.process();
  };

  // ---------- logging ----------
  P.addLog = function (kind, text, extra) {
    extra = extra || {};
    var e = {
      id: this.nextId++, t: this.s.simTime, day: this.s.day, kind: kind, text: text,
      injected: !!extra.injected, pendingSync: !this.s.wifi || this.s.power !== 'on', demo: true
    };
    this.log.push(e);
    if (this.log.length > 6000) this.log.splice(0, this.log.length - 6000);
    this.emit('log', e);
    return e;
  };

  // ---------- alerts ----------
  P.findAlert = function (key) {
    for (var i = 0; i < this.s.alerts.length; i++) if (this.s.alerts[i].key === key) return this.s.alerts[i];
    return null;
  };
  P.raise = function (key, cat, text) {
    var a = this.findAlert(key);
    if (a) return a;
    a = { key: key, cat: cat, text: text, since: this.s.simTime, day: this.s.day, ack: false };
    this.s.alerts.push(a);
    this.addLog('alert', 'Alert raised: ' + text);
    return a;
  };
  P.clear = function (key, note) {
    var i = this.s.alerts.findIndex(function (a) { return a.key === key; });
    if (i < 0) return;
    var a = this.s.alerts[i];
    this.s.alerts.splice(i, 1);
    this.addLog('alert', note || ('Alert cleared: ' + a.text));
  };
  P.ackAlert = function (key) {
    var a = this.findAlert(key);
    if (!a || a.ack) return;
    a.ack = true;
    this.addLog('alert', 'Alert marked as reviewed: ' + a.text, { injected: true });
  };

  // ---------- schedule ----------
  P.slotTimes = function () {
    return this.settings.slots.map(function (sl) { return sl.on ? parseHHMM(sl.time) : null; });
  };
  P.dayStart = function () { return Math.floor(this.s.simTime / DAY) * DAY; };

  P.nextFeed = function () {
    var times = this.slotTimes(), s = this.s, best = null, base = this.dayStart();
    for (var i = 0; i < times.length; i++) {
      if (times[i] == null || s.firedSlots[i]) continue;
      var at = base + times[i];
      if (best === null || at < best.at) best = { at: at, slot: i, today: true };
    }
    if (best) return best;
    if (base + DAY >= this.endOfRun()) return null;
    var first = this.firstSlotTime();
    return { at: base + DAY + first, slot: -1, today: false };
  };

  // Mark slots whose time already passed today (after a settings edit) so they do not fire late.
  P.markPastSlots = function () {
    var times = this.slotTimes(), base = this.dayStart(), s = this.s;
    for (var i = 0; i < times.length; i++) {
      if (times[i] == null || s.firedSlots[i]) continue;
      if (base + times[i] < s.simTime) {
        s.firedSlots[i] = true;
        this.addLog('demo', 'Slot ' + hhmm(times[i]) + ' was set to a time already passed today; it starts tomorrow', { injected: true });
      }
    }
  };

  // ---------- tank upkeep (ILLUSTRATIVE, visual only) ----------
  // Algae and debris build up on the tank drawing with simulated time since the last clean, a little
  // faster with each feed delivered (nutrients). Nothing here feeds into any sensor reading, alert or
  // feed decision: it is a picture of a lived-in tank, not a measured or validated growth model.
  var UPKEEP = { startAgeDays: 1.5, glassTau: 9, decorTau: 14, probeTau: 12, detritusTau: 18, perFeed: 0.03 };
  Engine.UPKEEP = UPKEEP;
  P.upkeep = function () {
    var s = this.s, m = s.maint || {}, t = s.simTime;
    function fed(since) {
      var n = 0;
      s.records.forEach(function (r) { if ((r.outcome === 'manual' || r.outcome === 'auto_ok') && r.scheduledAt >= since) n++; });
      return n;
    }
    function level(since, tau, nutrients) {
      var d = Math.max(0, (t - since) / DAY);
      return Math.min(1, 1 - Math.exp(-(d * (1 + UPKEEP.perFeed * nutrients)) / tau));
    }
    var fg = fed(m.glass), fv = fed(m.gravel), fp = fed(m.probes);
    return {
      glass: level(m.glass, UPKEEP.glassTau, fg),
      decor: level(Math.min(m.glass, m.gravel), UPKEEP.decorTau, Math.max(fg, fv)),
      probes: level(m.probes, UPKEEP.probeTau, fp),
      detritus: level(m.gravel, UPKEEP.detritusTau, fv * 2),
      days: { glass: (t - m.glass) / DAY, gravel: (t - m.gravel) / DAY, probes: (t - m.probes) / DAY },
      feeds: fv
    };
  };
  P.cleanTank = function (what) {
    var s = this.s, names = { glass: 'glass wiped', gravel: 'gravel siphoned', probes: 'probes cleaned', all: 'full clean (glass, gravel, probes)' };
    if (!names[what]) return;
    if (what === 'all') s.maint.glass = s.maint.gravel = s.maint.probes = s.simTime;
    else s.maint[what] = s.simTime;
    this.addLog('demo', 'Tank upkeep: ' + names[what] + '. Illustrative only; readings are not changed.', { injected: true });
    this.emit('change');
  };

  // ---------- mechanical filter (proposal) ----------
  P.filterVolume = function () { return Filt ? Filt.volumeL(this.settings.tankGal) : 0; };
  P.filterStep = function () {
    this.pumpStep();
    this.waterStep();
  };
  // Tank chemistry runs with the filter on or off. It uses no random numbers and never changes the four sensors.
  P.waterStep = function () {
    var s = this.s, W = s.water, F = s.filter, t = s.simTime, self = this;
    if (!W) return;
    var dtMin = (t - W.t) / MIN;
    if (!(dtMin > 0)) return;
    var V = this.filterVolume(), tw = s.sensors.temp.water;
    var flow = Filt && Filt.processing(F, V) ? F.flow : 0;
    Stages.step(W, dtMin, { flow: flow, V: V, tempC: tw == null ? SENSORS.temp.base : tw, t: t }).forEach(function (e) { self.waterEvent(e); });
  };
  P.waterEvent = function (e) {
    if (e.type !== 'carbonLow') return;
    if (e.on) { Filt.note(this.s.filter, this.s.simTime, 'Carbon nearly exhausted: replace the media'); this.raise('filter-carbon', 'equipment', 'Filter (proposal): carbon nearly exhausted, replace the media'); }
    else this.clear('filter-carbon');
  };
  P.saveFilterCfg = function () {
    var F = this.s.filter, W = this.s.water;
    this.settings.filter = { enabled: F.enabled, flowLph: F.flowSet, mode: F.mode, boost: F.boost, carbon: !!(W && W.carbonOn) };
  };
  P.pumpStep = function () {
    var s = this.s, F = s.filter, t = s.simTime, W = s.water;
    if (!F || !F.enabled) return;
    var dtMin = (t - F.t) / MIN;
    F.t = t;
    if (!(dtMin > 0)) return;
    var V = this.filterVolume();
    var ev = Filt.step(F, dtMin, { power: s.power, V: V, t: t, levelPct: W ? W.level : null, turbNtu: s.sensors.turb.value,
      turbStatus: s.sensors.turb.status, extraR: W && W.carbonOn ? Filt.CFG.carbonRes : 0 });
    var k = Filt.removalPerMin(F, V);
    if (k > 0) {
      var before = this.pertEffect('turb', t), keep = Math.exp(-k * dtMin);
      s.perts.forEach(function (p) { if (PERTURB[p.kind].param === 'turb' && t >= p.start) p.f = (p.f == null ? 1 : p.f) * keep; });
      Filt.capture(F, Math.max(0, before - this.pertEffect('turb', t)) * V);
    }
    this.filterEvents(ev);
  };
  P.filterEvents = function (ev) {
    var s = this.s, F = s.filter, self = this;
    (ev || []).forEach(function (e) {
      if (e.type === 'state') {
        self.addLog('logic', 'Filter (proposal): ' + (e.from ? e.from + ' \u2192 ' : '') + e.to + '. ' + e.why);
        if (e.to === 'WARNING') { Filt.note(F, s.simTime, 'Warning: ' + e.why); self.raise('filter', 'equipment', 'Filter (proposal): ' + e.why); }
        else if (e.to === 'FAULT' && F.faultKind === 'dry') Filt.note(F, s.simTime, 'Fault: ' + e.why);
        else if (e.to === 'FAULT') {
          Filt.note(F, s.simTime, 'Fault: ' + e.why);
          var a = self.findAlert('filter');
          if (a) a.text = 'Filter (proposal): ' + e.why; else self.raise('filter', 'equipment', 'Filter (proposal): ' + e.why);
        } else if (e.to === 'RUNNING' || (e.to === 'OFF' && !F.enabled)) self.clear('filter');
      }
      if (e.type === 'cleaned') self.clear('filter', 'Alert cleared: filter sponge cleaned');
      if (e.type === 'interlock') {
        if (e.on) self.raise('filter-dry', 'equipment', 'Filter (proposal): water level too low, dry-run protection active');
        else { Filt.note(F, s.simTime, 'Water level restored'); self.clear('filter-dry'); }
      }
      if (e.type === 'sensor') {
        if (e.on) { Filt.note(F, s.simTime, 'Turbidity sensor error: automatic boost disabled'); self.raise('filter-sensor', 'equipment', 'Filter (proposal): turbidity sensor error, automatic boost disabled'); }
        else self.clear('filter-sensor');
      }
      if (e.type === 'boost') { Filt.note(F, s.simTime, e.on ? 'Turbidity boost on' : 'Turbidity boost off'); self.addLog('logic', 'Filter (proposal): turbidity boost ' + (e.on ? 'on' : 'off')); }
      if (e.type === 'refused') self.addLog('logic', 'Filter (proposal): ' + e.why);
    });
  };
  P.setFilter = function (on) {
    var s = this.s, F = s.filter; if (!F) return;
    F.t = s.simTime;
    this.filterEvents(Filt.setEnabled(F, on, s.simTime));
    this.saveFilterCfg();
    if (!on) { this.clear('filter-dry'); this.clear('filter-sensor'); }
    this.addLog('demo', 'Filter (proposal) ' + (on ? 'enabled, ' + F.flowSet + ' L/h set flow' : 'disabled') + '. Never regulates pH or TDS.', { injected: true });
    this.emit('change');
  };
  P.filterPump = function (on) {
    var s = this.s, F = s.filter; if (!F || !F.enabled) return;
    this.filterEvents(Filt.setPump(F, on, s.simTime));
    this.saveFilterCfg();
    this.emit('change');
  };
  P.setFilterFlow = function (q) {
    var s = this.s, F = s.filter; if (!F) return;
    Filt.setFlow(F, +q, this.filterVolume(), s.simTime);
    this.saveFilterCfg();
    this.emit('change');
  };
  P.cleanFilter = function () {
    var s = this.s, F = s.filter; if (!F) return;
    this.filterEvents(Filt.clean(F, s.simTime, s.power === 'on'));
    if (s.water) Stages.rinseSponge(s.water, this.filterVolume());
    this.addLog('demo', 'Filter (proposal): sponge rinsed. Flow recovers; the water and the biological media are not changed by this action.', { injected: true });
    this.emit('change');
  };
  P.setFilterMode = function (mode) {
    var s = this.s, F = s.filter; if (!F) return;
    this.filterEvents(Filt.setMode(F, mode, s.simTime));
    this.saveFilterCfg();
    this.addLog('demo', 'Filter (proposal): ' + (F.mode === 'auto' ? 'automatic' : 'manual') + ' mode. Safety interlocks stay active.', { injected: true });
    this.emit('change');
  };
  P.setFilterBoost = function (on) {
    var s = this.s, F = s.filter; if (!F) return;
    Filt.setBoost(F, on, s.simTime);
    this.saveFilterCfg();
    this.emit('change');
  };
  P.setCarbon = function (on) {
    var s = this.s, W = s.water, self = this; if (!W) return;
    Stages.setCarbon(W, on).forEach(function (e) { self.waterEvent(e); });
    Filt.note(s.filter, s.simTime, on ? 'Chemical stage enabled' : 'Chemical stage disabled');
    this.saveFilterCfg();
    this.emit('change');
  };
  P.replaceCarbon = function () {
    var s = this.s, W = s.water, self = this; if (!W) return;
    Stages.replaceCarbon(W, s.simTime).forEach(function (e) { self.waterEvent(e); });
    Filt.note(s.filter, s.simTime, 'Carbon media replaced');
    this.addLog('demo', 'Filter (proposal): carbon replaced. Adsorption capacity restored; the water is not changed by this action.', { injected: true });
    this.emit('change');
  };
  P.setWaterLevel = function (pct) {
    var s = this.s, W = s.water; if (!W) return;
    Stages.setLevel(W, pct);
    this.emit('change');
  };

  // ---------- records ----------
  P.newRecord = function (slot, label, source) {
    var s = this.s;
    var r = {
      id: this.recId++, day: s.day, date: isoFor(this.settings.startDate, s.day), slot: label, source: source,
      scheduledAt: s.simTime, reminderAt: null, responseAt: null, responder: null,
      windowExpiredAt: null, attemptAt: null, ir: null, outcome: null, countAfter: null,
      wifi: s.wifi, away: !!this.settings.awayMode, mode: this.settings.feedMode || 'hybrid', notes: []
    };
    if (s.chuteBlocked) r.notes.push('chute blocked (scenario)');
    if (s.ownerSuppressed) r.notes.push('missed-confirmation day (scenario)');
    if (!s.wifi) r.notes.push('Wi-Fi offline');
    s.records.push(r);
    return r;
  };
  P.closeRecord = function (r, outcome) {
    if (!r) return;
    r.outcome = outcome;
    r.countAfter = this.s.feeds.counted;
    if (this.s.filter && (outcome === 'manual' || outcome === 'auto_ok')) Filt.feed(this.s.filter);
    if (this.s.water && (outcome === 'manual' || outcome === 'auto_ok')) Stages.feed(this.s.water);
    if (this.s.curRec === r) this.s.curRec = null;
    this.emit('record', r);
  };

  // ---------- public actions ----------
  P.start = function () {
    if (this.s.running) return;
    if (this.s.finished) { this.addLog('demo', 'The ' + this.settings.days + '-day run is complete. Reset to run again.', { injected: true }); this.emit('change'); return; }
    this.s.running = true;
    this.addLog('demo', 'Simulation started', { injected: true });
    this.emit('change');
  };
  P.pause = function () {
    if (!this.s.running) return;
    this.s.running = false;
    this.addLog('demo', 'Simulation paused', { injected: true });
    this.emit('change');
  };
  P.setSpeed = function (x) {
    x = +x || 1;
    if (x === this.s.speed) return;
    this.s.speed = x;
    this.addLog('demo', x === 1 ? 'Clock set to real time (1×)' : 'Demo speed set to ' + x + '× (accelerated time)', { injected: true });
    this.emit('change');
  };
  P.reset = function () {
    this.log.length = 0;
    this.initRun();
    this.addLog('demo', 'Simulation reset: Day 1 (' + dateLabel(this.settings.startDate, 1, true) + '), ' + hhmm(this.s.simTime) + ', paused', { injected: true });
    this.emit('change');
  };
  // Clears the event log only (used by the guided tour to start each step clean).
  P.clearLog = function () { this.log.length = 0; this.emit('change'); };
  P.clearHistory = function () {
    this.log.length = 0;
    this.s.samples.length = 0;
    this.s.records.length = 0;
    this.s.curRec = null;
    this.addLog('demo', 'Demo history cleared (event log, feed records and readings)', { injected: true });
    this.emit('change');
  };

  P.setPassageMode = function (m) {
    if ((m !== 'detect' && m !== 'none') || m === this.s.passageMode) return;
    this.s.passageMode = m;
    this.addLog('demo', 'Presenter set the next dispense to: ' + (m === 'detect' ? 'food passage detected' : 'no passage detected'), { injected: true });
    this.emit('change');
  };
  P.setTarget = function (which, v) {
    var sn = this.s.sensors[which]; v = +v;
    if (!sn || !isFinite(v)) return;
    sn.target = v;
  };
  P.commitTarget = function (which) {
    var sn = this.s.sensors[which];
    var d = SENSORS[which];
    this.addLog('demo', 'Simulated ' + d.name + ' baseline set to ' + sn.target.toFixed(d.dp === 0 ? 0 : 1) + ' ' + d.unit, { injected: true });
  };

  P.setSensorStatus = function (which, status, via) {
    var sn = this.s.sensors[which];
    if (!sn || sn.status === status) return;
    var name = SENSORS[which].name + ' (' + SENSORS[which].part + ')';
    sn.status = status;
    sn.buf = [];
    var inj = { injected: via !== 'scenario' };
    if (status === 'ok') {
      this.addLog('sensor', name + ' reconnected: readings resumed', inj);
      this.clear('sensor-' + which, 'Equipment alert cleared: ' + name + ' reporting again');
    } else {
      sn.value = null;
      var txt = status === 'disconnected' ? name + ' disconnected: no data' : name + ' reporting invalid values: readings rejected';
      this.addLog('sensor', txt, inj);
      this.raise('sensor-' + which, 'equipment', txt);
    }
    this.emit('change');
  };

  P.setWifi = function (on, via) {
    on = !!on;
    if (on === this.s.wifi) return;
    this.s.wifi = on;
    var inj = { injected: via !== 'scenario' };
    if (!on) {
      this.addLog('wifi', 'Wi-Fi disconnected: app updates unavailable; the local schedule and feeding logic continue', inj);
    } else {
      var queued = this.log.filter(function (e) { return e.pendingSync; });
      if (this.s.power === 'on') queued.forEach(function (e) { e.pendingSync = false; });
      this.s.appLastSync = this.s.simTime;
      this.addLog('wifi', 'Wi-Fi reconnected: ' + queued.length + ' queued event' + (queued.length === 1 ? '' : 's') + ' synced to the app', inj);
    }
    this.emit('change');
  };

  P.setAway = function (on) {
    on = !!on;
    if (on === this.settings.awayMode) return;
    this.settings.awayMode = on;
    this.addLog('demo', 'Away Mode (proposed) ' + (on ? 'ON: hand-feed prompt skipped; alerts stay visible' : 'OFF'), { injected: true });
    this.emit('change');
  };

  P.cutPower = function (via) {
    var s = this.s;
    if (s.power === 'off') return;
    this.addLog('power', 'Power interruption: controller off', { injected: via !== 'scenario' });
    if (s.phase === 'reminder') {
      s.interrupted = { slot: s.reminder.slot, label: s.reminder.label, rec: s.curRec };
    } else if (s.phase === 'dispensing') {
      s.feeds.autoFail++;
      if (s.curRec) { s.curRec.ir = 'unknown'; s.curRec.notes.push('power lost during dispense'); }
      this.addLog('fail', 'Dispense interrupted by power loss: outcome unknown, logged unsuccessful');
      this.closeRecord(s.curRec, 'auto_fail');
    }
    s.phase = 'idle'; s.reminder = null; s.dispense = null; s.boot = null;
    s.power = 'off';
    KEYS.forEach(function (k) { s.sensors[k].value = null; s.sensors[k].raw = null; s.sensors[k].buf = []; });
    this.emit('change');
  };

  P.restorePower = function (via) {
    var s = this.s;
    if (s.power !== 'off') return;
    s.power = 'booting';
    s.boot = { realLeft: BOOT_REAL_MS, simEnd: s.simTime + BOOT_SIM_MS };
    this.addLog('power', 'Power restored: controller restarting', { injected: via !== 'scenario' });
    this.emit('change');
  };

  P.finishBoot = function () {
    var s = this.s, pol = this.settings.policy;
    s.power = 'on'; s.boot = null;
    this.addLog('power', 'Controller running again');
    if (pol.countAfterRestart === 'reset') {
      s.feeds = { counted: 0, manual: 0, autoOk: 0, autoFail: 0 };
      this.addLog('logic', 'Restart policy: daily feed count reset to 0 (requires team decision)');
    } else {
      this.addLog('logic', 'Restart policy: daily feed count kept at ' + s.feeds.counted + '/' + DAILY_CAP + ' (assumes non-volatile storage; requires team decision)');
    }
    if (s.wifi) {
      this.log.forEach(function (e) { e.pendingSync = false; });
      s.appLastSync = s.simTime;
    }
    if (s.interrupted) {
      var it = s.interrupted;
      s.interrupted = null;
      if (pol.interruptedReminder === 'restart' && s.feeds.counted < DAILY_CAP) {
        this.addLog('logic', 'Restart policy: interrupted ' + it.label + ' reminder restarted with a fresh 10-minute window');
        if (it.rec) { it.rec.notes.push('reminder restarted after power loss'); s.curRec = it.rec; }
        this.openReminder(it.slot, it.label, 'schedule', it.rec);
      } else {
        this.addLog('logic', 'Restart policy: interrupted ' + it.label + ' slot marked missed, no automatic dispense');
        if (it.rec) { it.rec.notes.push('interrupted by power loss'); this.closeRecord(it.rec, 'missed_power'); }
      }
    }
    this.emit('change');
  };

  // The ONLY way to confirm a manual feed: the physical button at the tank.
  P.pressTankButton = function (by) {
    var s = this.s;
    var owner = by === 'owner';
    var who = owner ? 'simulated owner' : 'presenter';
    if (s.power !== 'on') {
      this.addLog('demo', 'Tank button pressed: no response (controller ' + (s.power === 'off' ? 'off' : 'restarting') + ')', { injected: !owner });
      this.emit('change'); return 'no-power';
    }
    if (s.phase === 'reminder') {
      if (s.simTime < s.reminder.deadline) {
        var r = s.reminder, rec = s.curRec;
        s.feeds.counted++; s.feeds.manual++;
        s.phase = 'idle'; s.reminder = null;
        var mins = Math.round((s.simTime - r.openedAt) / MIN * 10) / 10;
        this.addLog('manual', 'Manual feed confirmed at the tank button by the ' + who + ' after ' + mins + ' min (' + r.label + ' slot); automatic dispense cancelled', { injected: !owner });
        if (rec) { rec.responseAt = s.simTime; rec.responder = who; }
        this.closeRecord(rec, 'manual');
        this.emit('change'); return 'confirmed';
      }
      this.expireReminder();
      this.addLog('demo', 'Tank button pressed after the window closed: ignored', { injected: !owner });
      this.emit('change'); return 'late';
    }
    if (s.phase === 'dispensing') {
      this.addLog('demo', 'Tank button pressed during dispense: ignored', { injected: !owner });
      this.emit('change'); return 'busy';
    }
    this.addLog('demo', 'Tank button pressed: no active feeding reminder, no action', { injected: !owner });
    this.emit('change'); return 'idle';
  };

  P.injectTrigger = function () {
    if (this.s.power !== 'on') {
      this.addLog('demo', 'Extra trigger injected while the controller is off: ignored', { injected: true });
      this.emit('change'); return;
    }
    this.addLog('demo', 'Test injection: extra schedule trigger (not a real schedule slot)', { injected: true });
    this.fireSlot(-1, hhmm(this.s.simTime) + ' (injected)', 'injected');
    this.emit('change');
  };

  P.jumpToNextFeed = function () {
    if (this.s.phase !== 'idle') { this.addLog('demo', 'Clock jump skipped: a feed cycle is in progress', { injected: true }); this.emit('change'); return; }
    var n = this.nextFeed();
    if (!n) return;
    var target = n.at - 5 * SEC;
    if (target <= this.s.simTime) return;
    this.advanceTo(target, true);
    this.addLog('demo', 'Clock advanced to ' + hhmmss(this.s.simTime) + ' on Day ' + this.s.day + ' (5 s before the ' + hhmm(n.at) + ' slot)', { injected: true });
    this.emit('change');
  };
  P.expireNow = function () {
    if (this.s.phase !== 'reminder') return;
    this.addLog('demo', 'Clock advanced to the end of the reminder window (reminder missed)', { injected: true });
    this.advanceTo(this.s.reminder.deadline, true);
    this.emit('change');
  };
  // Runs every event in between: nothing is skipped.
  P.fastForwardToDay = function (day) {
    day = Math.max(1, Math.min(this.settings.days, day | 0));
    var target = (day - 1) * DAY + this.dayStartOffset();
    if (target <= this.s.simTime) return;
    this.addLog('demo', 'Fast-forward to Day ' + day + ' (every event in between is simulated)', { injected: true });
    this.quiet = true;
    this.advanceTo(target, true);
    this.quiet = false;
    this.emit('change');
  };
  P.fastForwardNextDay = function () { this.fastForwardToDay(this.s.day + 1); };
  P.runToEnd = function () {
    if (this.s.finished) return;
    this.addLog('demo', 'Fast-forward to the end of Day ' + this.settings.days + ' (every event is simulated)', { injected: true });
    this.quiet = true;
    this.advanceTo(this.endOfRun(), true);
    this.quiet = false;
    this.emit('change');
  };

  P.ackFeederFault = function () {
    if (!this.s.feederFault) return;
    this.s.feederFault = false;
    this.clear('feeder', 'Feeder fault acknowledged after inspection (presenter action)');
    this.emit('change');
  };

  // ---------- feeding cycle ----------
  P.fireSlot = function (slot, label, source) {
    var s = this.s;
    if (slot >= 0) s.firedSlots[slot] = true;
    if (s.phase !== 'idle') { this.addLog('demo', 'Trigger ignored: a feed cycle is already in progress'); return; }
    var rec = this.newRecord(slot, label, source);
    s.curRec = rec;
    if (s.feeds.counted >= DAILY_CAP) {
      this.addLog('cap', 'Feed skipped: daily cap reached (' + s.feeds.counted + '/' + DAILY_CAP + ' scheduled feeds today)', { injected: source === 'injected' });
      this.closeRecord(rec, 'cap_skip');
      return;
    }
    if (this.settings.feedMode === 'auto') {
      this.addLog('reminder', 'Automatic-only mode (comparison condition): no hand-feed prompt for the ' + label + ' slot');
      this.beginAuto(slot, label);
      return;
    }
    if (this.settings.awayMode && this.settings.feedMode !== 'manual') {
      this.addLog('reminder', 'Away Mode (proposed): hand-feed prompt skipped for the ' + label + ' slot');
      this.beginAuto(slot, label);
      return;
    }
    this.openReminder(slot, label, source, rec);
  };

  P.openReminder = function (slot, label, source, rec) {
    var s = this.s;
    s.phase = 'reminder';
    s.reminder = { slot: slot, label: label, openedAt: s.simTime, deadline: s.simTime + REMINDER_WINDOW, source: source, ownerPressAt: null };
    if (rec) rec.reminderAt = s.simTime;
    this.addLog('reminder', 'Feeding reminder for the ' + label + ' slot: 10-minute owner window started' + (s.wifi ? ' (app notified)' : ' (app offline: not notified)'));
    var own = this.settings.owner;
    if (own.mode === 'simulated') {
      if (s.ownerSuppressed) {
        this.addLog('owner', 'Simulated owner will not respond (missed-confirmation scenario)');
      } else if (s.ownerRand() * 100 < own.respondPct) {
        var delay = (1 + s.ownerRand() * 8) * MIN;
        s.reminder.ownerPressAt = s.simTime + Math.round(delay / SEC) * SEC;
      } else {
        this.addLog('owner', 'Simulated owner does not respond to this reminder');
      }
    }
  };

  P.expireReminder = function () {
    var s = this.s, r = s.reminder, rec = s.curRec;
    s.phase = 'idle'; s.reminder = null;
    if (rec) rec.windowExpiredAt = s.simTime;
    if (this.settings.feedMode === 'manual') {
      this.addLog('fail', 'No button press within 10 minutes (' + r.label + ' slot). Manual-only mode has no automatic fallback, so this feed was missed.');
      if (rec) rec.notes.push('manual-only mode: no fallback');
      this.closeRecord(rec, 'missed_manual');
      return;
    }
    this.addLog('reminder', 'No button press within 10 minutes (' + r.label + ' slot): checking the daily cap');
    if (s.feeds.counted >= DAILY_CAP) {
      this.addLog('cap', 'Feed skipped: daily cap reached (' + s.feeds.counted + '/' + DAILY_CAP + ')');
      this.closeRecord(rec, 'cap_skip');
      return;
    }
    this.beginAuto(r.slot, r.label);
  };

  P.beginAuto = function (slot, label) {
    var s = this.s;
    if (s.feeds.counted >= DAILY_CAP) {
      this.addLog('cap', 'Feed skipped: daily cap reached (' + s.feeds.counted + '/' + DAILY_CAP + ')');
      this.closeRecord(s.curRec, 'cap_skip');
      return;
    }
    s.feeds.counted++;   // attempts count toward the cap: no repeated dispensing after a fault
    s.phase = 'dispensing';
    var outcome = (s.chuteBlocked || s.passageMode === 'none') ? 'none' : 'detect';
    s.dispense = { slot: slot, label: label, outcome: outcome, simStart: s.simTime, realElapsed: 0, step: 0, cause: s.chuteBlocked ? 'chute blocked (scenario)' : (s.passageMode === 'none' ? 'presenter set no passage' : '') };
    if (s.curRec) s.curRec.attemptAt = s.simTime;
    this.addLog('auto', 'Automatic feed attempt (' + label + ' slot): feeder dispensing one ' +
      (this.settings.portion ? 'configured portion (' + this.settings.portion + ')' : 'portion (portion size not configured)'));
    if (!this.quiet) this.emit('dispense', { phase: 'start' });
  };

  P.dispenseProgress = function () {
    var d = this.s.dispense;
    if (!d) return 0;
    return Math.min(1, Math.max(d.realElapsed / DISPENSE_REAL_MS, (this.s.simTime - d.simStart) / DISPENSE_SIM_MS));
  };
  P.updateDispense = function () {
    var d = this.s.dispense;
    if (!d) return;
    var p = this.dispenseProgress();
    var step = p < DISPENSE_STEPS[0].until ? 0 : (p < DISPENSE_STEPS[1].until ? 1 : 2);
    if (step >= 1 && d.step < 1 && !this.quiet) this.emit('dispense', { phase: 'chute', outcome: d.outcome });
    d.step = step;
    if (p >= 1) this.finishDispense();
  };

  P.finishDispense = function () {
    var s = this.s, d = s.dispense, rec = s.curRec;
    s.phase = 'idle'; s.dispense = null;
    if (d.outcome === 'detect') {
      s.feeds.autoOk++;
      if (rec) rec.ir = 'passage detected';
      this.addLog('ok', 'Food passage detected by the IR beam-break: dispense recorded (' + d.label + ' slot). This does not confirm the food was eaten.');
      this.closeRecord(rec, 'auto_ok');
    } else {
      s.feeds.autoFail++;
      s.feederFault = true;
      if (rec) { rec.ir = 'no passage'; if (d.cause && rec.notes.indexOf(d.cause) < 0) rec.notes.push(d.cause); }
      this.addLog('fail', 'No food passage detected: fault raised, attempt logged unsuccessful and counted toward the cap (' + d.label + ' slot)');
      this.raise('feeder', 'equipment', 'Feeder fault: no food passage detected on the last attempt');
      this.closeRecord(rec, 'auto_fail');
    }
    if (!this.quiet) this.emit('dispense', { phase: 'end' });
  };

  // ---------- scenarios ----------
  P.scenarioWindow = function (sc) {
    var t = parseHHMM(sc.time) || 0;
    var start = (sc.day - 1) * DAY + (sc.type === 'missed' ? 0 : t);
    var end;
    if (sc.type === 'missed') end = sc.day * DAY;
    else end = start + Math.max(1, +sc.minutes || 60) * MIN;
    return { start: start, end: Math.min(end, this.endOfRun()) };
  };
  P.scenarioName = function (sc) {
    var base = SCENARIO_TYPES[sc.type] ? SCENARIO_TYPES[sc.type].label : sc.type;
    if (sc.type === 'sensor') { var sd = SENSORS[sc.target] || SENSORS.ph; base = sd.name + ' ' + (sc.mode === 'faulty' ? 'giving invalid values' : 'disconnected'); }
    if (sc.type === 'perturb') base = (PERTURB[sc.kind] || PERTURB.heater).label + ((PERTURB[sc.kind] || {}).src === 'demo' ? ' (demo addition)' : '');
    var w = this.scenarioWindow(sc);
    var dur = sc.type === 'missed' ? 'all day' : (Math.round((w.end - w.start) / MIN) + ' min');
    return base + ' (Day ' + sc.day + (sc.type === 'missed' ? '' : ', ' + sc.time) + ', ' + dur + ')';
  };
  var RESPONSES = {
    wifi: 'Local logic: the schedule, 10-minute window, cap check and dispense check keep running on the controller. The app goes stale and events queue until Wi-Fi returns.',
    sensor: 'Local logic: the controller rejects the reading and shows No data instead of an old value, and raises an equipment alert. Feeding is unaffected.',
    chute: 'Local logic: any dispense in this window finds no IR passage, so it raises a fault, logs the attempt as unsuccessful and counts it toward the cap. There is no automatic retry.',
    missed: 'Local logic: reminders today get no button press. After 10 minutes each slot falls back to an automatic dispense, if the cap allows.',
    power: 'Local logic: the controller is off. Slots during the outage are logged missed. On restart the selected restart policy is applied.',
    perturb: 'Local logic: each new reading is validated, averaged over the last 5 samples and compared with the operating range. An alert is raised when the smoothed value leaves the range. The detection time is logged.',
    lcd: 'Local logic: feeding, readings and alerts carry on normally, but the LCD keeps showing an old status. The controller cannot see that its own display is wrong, so the event log and app are the record to trust. Paper [3] reports an occasional LCD status bug.',
    bubbles: 'Local logic: bubbles cause short false spikes in raw turbidity. The values are physically possible, so validation cannot reject them. Five-sample smoothing damps most spikes, but a cluster of spikes can still trigger a false alert.'
  };
  P.startScenario = function (sc) {
    var s = this.s;
    s.scn[sc.id] = 'active';
    this.addLog('scenario', 'Scenario started: ' + this.scenarioName(sc));
    if (sc.type === 'wifi') this.setWifi(false, 'scenario');
    else if (sc.type === 'sensor') this.setSensorStatus(SENSORS[sc.target] ? sc.target : 'ph', sc.mode === 'faulty' ? 'faulty' : 'disconnected', 'scenario');
    else if (sc.type === 'perturb') this.startPerturbation(sc.kind, Math.max(1, +sc.minutes || 60), 'scenario');
    else if (sc.type === 'bubbles') { s.bubblesScn++; }
    else if (sc.type === 'lcd') { s.lcdBug++; }
    else if (sc.type === 'chute') { s.chuteBlocked = true; }
    else if (sc.type === 'missed') { s.ownerSuppressed = true; }
    else if (sc.type === 'power') this.cutPower('scenario');
    this.addLog('logic', RESPONSES[sc.type] || '');
    s.lastScenario = { sc: sc, phase: 'started', at: s.simTime, day: s.day, response: RESPONSES[sc.type] || '' };
    this.emit('scenario', s.lastScenario);
  };
  P.endScenario = function (sc) {
    var s = this.s;
    s.scn[sc.id] = 'done';
    this.addLog('scenario', 'Scenario ended: ' + this.scenarioName(sc));
    var note = '';
    if (sc.type === 'wifi') { this.setWifi(true, 'scenario'); note = 'Wi-Fi back: queued events synced to the app.'; }
    else if (sc.type === 'sensor') { this.setSensorStatus(SENSORS[sc.target] ? sc.target : 'ph', 'ok', 'scenario'); note = 'Sensor reporting again; the equipment alert cleared. Smoothing restarts from the first new sample.'; }
    else if (sc.type === 'perturb') { note = 'Stimulus removed. The simulated water drifts back toward its baseline, and the alert clears once the smoothed value is back in range.'; }
    else if (sc.type === 'bubbles') { s.bubblesScn = Math.max(0, s.bubblesScn - 1); note = 'Bubbles cleared. Raw turbidity is steady again.'; }
    else if (sc.type === 'lcd') { s.lcdBug = Math.max(0, s.lcdBug - 1); if (!s.lcdBug) s.lcdFrozen = null; note = 'LCD updating again.'; }
    else if (sc.type === 'chute') { s.chuteBlocked = false; note = 'Chute clear. Any feeder fault stays latched until it is acknowledged.'; }
    else if (sc.type === 'missed') { s.ownerSuppressed = false; note = 'The owner responds normally again from tomorrow.'; }
    else if (sc.type === 'power') { this.restorePower('scenario'); note = 'Power back: the controller restarts and applies the restart policy.'; }
    s.lastScenario = { sc: sc, phase: 'ended', at: s.simTime, day: s.day, response: note };
    this.emit('scenario', s.lastScenario);
  };
  // Called when settings.scenarios changes mid-run
  P.syncScenarios = function () {
    var s = this.s, self = this;
    (this.settings.scenarios || []).forEach(function (sc) {
      if (s.scn[sc.id]) return;
      var w = self.scenarioWindow(sc);
      s.scn[sc.id] = w.start < s.simTime ? 'late' : 'pending';
    });
  };

  // ---------- sensors ----------
  P.pattern = function (key, t) {
    if (!this.settings.dailyPattern) return 0;
    var f = tod(t) / DAY, p = SENSORS[key].pat;
    // Synthetic shape for the demo only, not a model of a real tank.
    return p[0] * Math.sin(2 * Math.PI * (f - p[1]));
  };

  // ---------- perturbation tests (controlled changes) ----------
  P.pertEffect = function (key, t) {
    var sum = 0;
    this.s.perts.forEach(function (p) {
      var d = PERTURB[p.kind];
      if (d.param !== key || t < p.start) return;
      var upMs = d.up * MIN, downMs = d.down * MIN, f = p.f == null ? 1 : p.f;   // p.f: share the filter has not yet removed
      if (t <= p.end) sum += f * d.mag * (1 - Math.exp(-(t - p.start) / upMs));
      else sum += f * d.mag * (1 - Math.exp(-(p.end - p.start) / upMs)) * Math.exp(-(t - p.end) / downMs);
    });
    return sum;
  };
  P.startPerturbation = function (kind, minutes, via) {
    var d = PERTURB[kind], s = this.s;
    if (!d) return;
    var p = { kind: kind, start: s.simTime, end: s.simTime + minutes * MIN };
    s.perts.push(p);
    var base = s.sensors[d.param].value;
    var rec = { id: s.pertRecords.length + 1, kind: kind, param: d.param, label: d.label, src: d.src, via: via || 'live', day: s.day, start: s.simTime,
      minutes: minutes, baseline: base, peak: base, detectedAt: null, alert: null, cleared: null };
    s.pertRecords.push(rec);
    this.addLog('perturb', 'Perturbation test started: ' + d.label + ' for ' + minutes + ' min' + (d.src === 'demo' ? ' (demo addition, not in the reviewed paper)' : ' (as in the reviewed paper’s controlled tests)'), { injected: via !== 'scenario' });
    if (via !== 'scenario') this.addLog('logic', RESPONSES.perturb);
    var lk = SENSORS[d.param].lim, L = this.settings.limits;
    if (L[lk[0]] == null && L[lk[1]] == null) this.addLog('logic', 'No operating range is configured for the ' + SENSORS[d.param].name + ', so no alert can be raised for this test.');
    this.emit('change');
  };
  P.setLcdBug = function (on) {
    var s = this.s;
    if (on && !s.lcdBug) { s.lcdBug = 1; this.addLog('scenario', 'LCD status not updating (live fault, as reported in paper [3])', { injected: true }); this.addLog('logic', RESPONSES.lcd); }
    else if (!on && s.lcdBug) { s.lcdBug = 0; s.lcdFrozen = null; this.addLog('scenario', 'LCD updating again (live)', { injected: true }); }
    this.emit('change');
  };
  P.setFeedMode = function (m) {
    if (!FEED_MODES[m] || m === this.settings.feedMode) return;
    this.settings.feedMode = m;
    this.addLog('demo', 'Feeding mode: ' + FEED_MODES[m] + (m === 'hybrid' ? '' : ' (comparison condition from paper [3])'), { injected: true });
    this.emit('change');
  };
  P.setBubbles = function (on) {
    on = !!on;
    if (on === this.s.bubbles) return;
    this.s.bubbles = on;
    this.addLog('perturb', on ? 'Air bubbles at the turbidity sensor (live): raw readings will spike' : 'Air bubbles cleared (live)', { injected: true });
    if (on) this.addLog('logic', RESPONSES.bubbles);
    this.emit('change');
  };

  // ---------- sensors: measure -> calibrate -> validate -> smooth (5) -> compare -> alert ----------
  P.sample = function () {
    var s = this.s, r = s.rand, self = this, t = s.simTime;
    var row = { t: t, day: s.day, off: s.power !== 'on', wifi: s.wifi };
    KEYS.forEach(function (k) {
      var sn = s.sensors[k], d = SENSORS[k];
      // simulated water state (what a perfect instrument would see)
      sn.water = sn.target + self.pattern(k, t) + self.pertEffect(k, t);
      if (k === 'turb' || k === 'tds') sn.water = Math.max(0, sn.water);
      var noise = (r() - 0.5) * 2 * d.noise;
      var spike = r();
      if (s.power !== 'on' || sn.status === 'disconnected') {
        sn.raw = null; sn.rawValid = false; sn.value = null; sn.buf = [];
      } else {
        var raw = sn.status === 'faulty' ? BAD_RAW[k] : sn.water + noise;
        if (k === 'turb' && (s.bubbles || s.bubblesScn > 0) && sn.status === 'ok' && spike < 0.2) raw += 40 + spike * 600;   // bubble artifact
        sn.raw = raw;
        var cal = raw;   // calibration step: no calibration data in this demo, identity applied
        // local validation: reject values outside the plausibility window (demo choice)
        var ok = isFinite(cal) && cal >= d.plaus[0] && cal <= d.plaus[1];
        sn.rawValid = ok;
        if (ok) { sn.buf.push(cal); if (sn.buf.length > SMOOTH_N) sn.buf.shift(); }
        else { sn.rejected++; sn.buf = []; }
        if (!ok) sn.value = null;
        else {
          var m = 0; for (var i = 0; i < sn.buf.length; i++) m += sn.buf[i];
          sn.value = m / sn.buf.length;
        }
      }
      var f = Math.pow(10, d.dp);
      row[k] = sn.value == null ? null : Math.round(sn.value * f) / f;
      row[k + '_raw'] = sn.raw == null ? null : Math.round(sn.raw * f * 10) / (f * 10);
      row[k + '_ok'] = sn.raw == null ? null : sn.rawValid;
    });
    s.samples.push(row);
    if (s.samples.length > 50000) s.samples.splice(0, s.samples.length - 50000);
    s.perts = s.perts.filter(function (p) { return t < p.end + 6 * PERTURB[p.kind].down * MIN; });
    s.pertRecords.forEach(function (rec) {
      var v = row[rec.param];
      if (v == null || t < rec.start || t > rec.start + DAY) return;
      if (rec.baseline == null) rec.baseline = v;
      if (Math.abs(v - rec.baseline) > Math.abs(rec.peak == null ? 0 : rec.peak - rec.baseline)) rec.peak = v;
    });
    this.evaluateWater(row);
  };

  P.evaluateWater = function (row) {
    var L = this.settings.limits, R = this.settings.roc, self = this, s = this.s;
    KEYS.forEach(function (k) {
      var d = SENSORS[k], v = row[k], lo = L[d.lim[0]], hi = L[d.lim[1]];
      var nm = k === 'temp' ? 'Temperature' : (k === 'ph' ? 'pH' : (k === 'tds' ? 'TDS' : 'Turbidity'));
      if (v == null) return;
      var u = d.unit === 'pH' ? '' : ' ' + d.unit;
      if (lo != null && v < lo) { if (!self.findAlert(k + '-low')) { self.raise(k + '-low', 'water', nm + ' below operating range (' + lo + u + ')'); self.detected(k, k + '-low'); } }
      else if (self.findAlert(k + '-low')) { self.clear(k + '-low', nm + ' back within operating range: alert cleared'); self.recovered(k); }
      if (hi != null && v > hi) { if (!self.findAlert(k + '-high')) { self.raise(k + '-high', 'water', nm + ' above operating range (' + hi + u + ')'); self.detected(k, k + '-high'); } }
      else if (self.findAlert(k + '-high')) { self.clear(k + '-high', nm + ' back within operating range: alert cleared'); self.recovered(k); }
    });
    if (R.phPerHour == null && R.tPerHour == null) return;
    var past = null;
    for (var i = s.samples.length - 2; i >= 0; i--) { if (row.t - s.samples[i].t > HOUR) break; past = s.samples[i]; }
    if (!past) return;
    var dtH = (row.t - past.t) / HOUR;
    if (dtH < 10 / 60) return;
    function roc(key, cur, prev, limit, name, unit) {
      if (limit == null || cur == null || prev == null) { if (self.findAlert(key + '-roc')) self.clear(key + '-roc'); return; }
      var rate = Math.abs(cur - prev) / dtH;
      if (rate > limit) self.raise(key + '-roc', 'water', name + ' changing faster than the configured rate (' + limit + unit + '/h)');
      else if (self.findAlert(key + '-roc')) self.clear(key + '-roc');
    }
    roc('ph', row.ph, past.ph, R.phPerHour, 'pH', '');
    roc('temp', row.temp, past.temp, R.tPerHour, 'Temperature', ' °C');
  };
  P.detected = function (param, key) {
    var s = this.s, self = this;
    s.pertRecords.forEach(function (rec) {
      if (rec.param !== param || rec.detectedAt != null || s.simTime < rec.start || s.simTime > rec.start + DAY) return;
      rec.detectedAt = s.simTime; rec.alert = key;
      var mins = Math.round((s.simTime - rec.start) / MIN);
      self.addLog('logic', 'Detection: ' + rec.label + ' raised an alert ' + mins + ' simulated min after it started (1-minute sampling and 5-sample smoothing in this demo)');
    });
  };
  P.recovered = function (param) {
    var s = this.s;
    s.pertRecords.forEach(function (rec) { if (rec.param === param && rec.detectedAt != null && rec.cleared == null) rec.cleared = s.simTime; });
  };

  // ---------- time ----------
  P.nextEventAfter = function () {
    var s = this.s, t = s.simTime, best = Infinity, self = this;
    function c(x) { if (x > t && x < best) best = x; }
    c(s.nextSampleAt);
    c(Math.floor(t / DAY) * DAY + DAY);
    c(this.endOfRun());
    if (s.reminder) { c(s.reminder.deadline); if (s.reminder.ownerPressAt) c(s.reminder.ownerPressAt); }
    if (s.dispense) c(s.dispense.simStart + DISPENSE_SIM_MS);
    if (s.boot) c(s.boot.simEnd);
    var base = Math.floor(t / DAY) * DAY, times = this.slotTimes();
    for (var i = 0; i < times.length; i++) if (times[i] != null && !s.firedSlots[i]) c(base + times[i]);
    (this.settings.scenarios || []).forEach(function (sc) {
      var st = s.scn[sc.id];
      if (st !== 'pending' && st !== 'active') return;
      var w = self.scenarioWindow(sc);
      c(w.start); c(w.end);
    });
    return best;
  };

  P.process = function () {
    var s = this.s, self = this, t = s.simTime;
    var day = Math.floor(t / DAY) + 1;
    if (day !== s.day && day <= this.settings.days) this.rollover(day);
    // scenarios: end first, then start
    (this.settings.scenarios || []).forEach(function (sc) {
      if (s.scn[sc.id] === 'active' && t >= self.scenarioWindow(sc).end) self.endScenario(sc);
    });
    (this.settings.scenarios || []).forEach(function (sc) {
      if (s.scn[sc.id] !== 'pending') return;
      var w = self.scenarioWindow(sc);
      if (t >= w.start && t < w.end) self.startScenario(sc);
      else if (t >= w.end) s.scn[sc.id] = 'late';
    });
    if (s.boot && t >= s.boot.simEnd) this.finishBoot();
    if (t >= s.nextSampleAt) {
      if (s.power === 'on' && s.wifi) s.appLastSync = t;
      this.filterStep();
      this.sample();
      s.nextSampleAt = Math.floor(t / SAMPLE_EVERY) * SAMPLE_EVERY + SAMPLE_EVERY;
    }
    if (s.power === 'on') {
      if (s.dispense) this.updateDispense();
      if (s.reminder && s.reminder.ownerPressAt && t >= s.reminder.ownerPressAt && t < s.reminder.deadline) {
        s.reminder.ownerPressAt = null;
        this.pressTankButton('owner');
      }
      if (s.reminder && t >= s.reminder.deadline) this.expireReminder();
    }
    var times = this.slotTimes(), base = Math.floor(t / DAY) * DAY;
    for (var i = 0; i < times.length; i++) {
      if (times[i] == null || s.firedSlots[i] || t < base + times[i]) continue;
      if (s.power !== 'on') {
        s.firedSlots[i] = true;
        var r = this.newRecord(i, hhmm(times[i]), 'schedule');
        r.notes.push('controller had no power');
        this.addLog('reminder', 'Feed slot ' + hhmm(times[i]) + ' missed: the controller had no power');
        this.closeRecord(r, 'missed_power');
      } else if (s.phase === 'idle') {
        this.fireSlot(i, hhmm(times[i]), 'schedule');
      }
    }
    if (t >= this.endOfRun() && !s.finished) {
      s.finished = true; s.running = false;
      this.addLog('system', this.settings.days + '-day simulation complete (end of Day ' + this.settings.days + ', ' + dateLabel(this.settings.startDate, this.settings.days, true) + ')');
    }
  };

  P.rollover = function (day) {
    var s = this.s;
    s.day = Math.min(day, this.settings.days);
    s.firedSlots = {};
    s.feeds = { counted: 0, manual: 0, autoOk: 0, autoFail: 0 };
    if (day <= this.settings.days) {
      this.addLog('system', 'New day: Day ' + day + ' (' + dateLabel(this.settings.startDate, day, true) + '). Daily feed count reset to 0/' + DAILY_CAP);
    }
  };

  // Event-driven: jumps straight to the next thing that can happen, so fast runs lose nothing.
  P.advanceTo = function (target, instant) {
    var s = this.s;
    target = Math.min(target, this.endOfRun());
    var guard = 0;
    while (s.simTime < target && guard++ < 400000) {
      var n = Math.min(this.nextEventAfter(), target);
      if (!(n > s.simTime)) n = s.simTime + 1;
      s.simTime = n;
      this.process();
      if (s.finished) break;
    }
  };

  P.tick = function (realMs) {
    var s = this.s;
    if (this._j) this._noteSettings();
    if (!s.running || s.finished) return;
    this._depth = (this._depth || 0) + 1;
    try {
      // Real-time completions are journaled so a reload replays them at the same simulated moment.
      if (s.boot) { s.boot.realLeft -= realMs; if (s.boot.realLeft <= 0) { this._jpush('_boot', []); this.finishBoot(); } }
      if (s.dispense && s.power === 'on') {
        s.dispense.realElapsed += realMs;
        var t0 = s.simTime;
        this.updateDispense();
        if (!s.dispense && this._j) this._j.entries.push({ t: t0, m: '_disp', a: [] });
      }
      this.advanceTo(s.simTime + realMs * s.speed, false);
    } finally { this._depth--; }
    this.emit('tick');
  };

  // Completes an in-flight dispense or boot immediately (used by the guided tour).
  P.settle = function () {
    var s = this.s;
    if (s.boot) this.finishBoot();
    if (s.dispense && s.power === 'on') { s.dispense.realElapsed = DISPENSE_REAL_MS; this.updateDispense(); }
  };

  // ---------- derived ----------
  P.systemState = function () {
    var s = this.s;
    if (s.finished) return { code: 'done', text: this.settings.days + '-day run complete' };
    if (s.power === 'off') return { code: 'off', text: 'Controller off (power interruption)' };
    if (s.power === 'booting') return { code: 'boot', text: 'Controller restarting' };
    if (s.phase === 'reminder') return { code: 'reminder', text: 'Waiting for button at tank' };
    if (s.phase === 'dispensing') return { code: 'dispense', text: 'Automatic dispense in progress' };
    if (s.feederFault) return { code: 'fault', text: 'Feeder fault: inspection needed' };
    if (s.feeds.counted >= DAILY_CAP) return { code: 'cap', text: 'Daily cap reached' };
    if (!s.running) return { code: 'paused', text: 'Simulation paused' };
    return { code: 'idle', text: 'Monitoring' };
  };
  P.reminderLeft = function () {
    var s = this.s;
    return s.phase === 'reminder' ? Math.max(0, s.reminder.deadline - s.simTime) : 0;
  };
  P.dateLabel = function (day, long) { return dateLabel(this.settings.startDate, day || this.s.day, long); };

  // ---------- run journal: lets a closed page resume the same run ----------
  // The engine is deterministic (seeded RNG, event-driven clock), so a run is fully described by
  // its starting settings plus every top-level action and the simulated time it happened at.
  // Replaying that list rebuilds the identical run, including all readings, without storing them.
  var JOURNALED = ['start', 'pause', 'setSpeed', 'clearHistory', 'clearLog', 'setPassageMode', 'setTarget', 'commitTarget',
    'setSensorStatus', 'setWifi', 'setAway', 'cutPower', 'restorePower', 'finishBoot', 'pressTankButton', 'injectTrigger',
    'jumpToNextFeed', 'expireNow', 'fastForwardToDay', 'fastForwardNextDay', 'runToEnd', 'ackFeederFault', 'ackAlert',
    'addLog', 'raise', 'clear', 'startScenario', 'endScenario', 'syncScenarios', 'setLcdBug', 'setFeedMode', 'setBubbles',
    'startPerturbation', 'settle', 'advanceTo', 'cleanTank', 'setFilter', 'filterPump', 'setFilterFlow', 'cleanFilter',
    'setFilterMode', 'setFilterBoost', 'setCarbon', 'replaceCarbon', 'setWaterLevel'];
  var COALESCE = { setTarget: 1, setSpeed: 1, setFilterFlow: 1, setWaterLevel: 1 };
  Engine.JOURNAL_VERSION = 1;

  P._jbase = function (kind) {
    var sj = JSON.stringify(this.settings);
    this._jSet = sj;
    this._j = { v: Engine.JOURNAL_VERSION, base: kind, seed: this.seed, speed0: this.s ? this.s.speed : 1,
      nextId0: this.nextId, recId0: this.recId, settings0: sj, entries: [] };
  };
  P._noteSettings = function () {
    var sj = JSON.stringify(this.settings);
    if (sj !== this._jSet) { this._jSet = sj; this._j.entries.push({ t: this.s.simTime, m: '_set', a: [sj] }); }
  };
  P._jpush = function (m, args) {
    var j = this._j; if (!j || this._replaying) return;
    var a = Array.prototype.map.call(args, function (x) {
      if (x && typeof x === 'object' && x.id != null && x.type) return { __sc: x.id };   // a scenario object
      return x === undefined ? null : x;
    });
    var last = j.entries[j.entries.length - 1];
    if (COALESCE[m] && last && last.m === m && last.t === this.s.simTime && (m !== 'setTarget' || last.a[0] === a[0])) { last.a = a; return; }
    j.entries.push({ t: this.s.simTime, m: m, a: a });
  };

  // Call once on the app's engine (not on throwaway engines such as the mode comparison).
  P.enableJournal = function () {
    var self = this;
    this._depth = 0;
    this._jbase('construct');
    // Rebase on the state the constructor produced; replay re-runs the constructor's initRun.
    this._j.nextId0 = 1; this._j.recId0 = 1; this._j.speed0 = 1;
    JOURNALED.forEach(function (name) {
      var fn = P[name];
      self[name] = function () {
        if (self._depth === 0 && !self._replaying) { self._noteSettings(); self._jpush(name, arguments); }
        self._depth++;
        try { return fn.apply(self, arguments); } finally { self._depth--; }
      };
    });
    this.reset = function () {
      if (self._depth === 0 && !self._replaying) { self._jbase('reset'); }
      self._depth++;
      try { return P.reset.apply(self, arguments); } finally { self._depth--; }
    };
  };
  Object.defineProperty(P, 'journal', { get: function () { return this._j; } });

  function applySettingsInPlace(target, json) {
    var src = JSON.parse(json);
    Object.keys(target).forEach(function (k) { delete target[k]; });
    Object.keys(src).forEach(function (k) { target[k] = src[k]; });
  }

  // Rebuilds the run from a journal, then advances (without real time) to untilT.
  // Throws if the journal is unusable; the caller should then start a fresh run.
  P.replayJournal = function (j, untilT) {
    if (!j || j.v !== Engine.JOURNAL_VERSION || !Array.isArray(j.entries)) throw new Error('journal version');
    var self = this;
    this._replaying = true;
    try {
      applySettingsInPlace(this.settings, j.settings0);
      this.seed = j.seed; this.nextId = j.nextId0; this.recId = j.recId0;
      this.log.length = 0;
      this.s = { speed: j.speed0 };
      if (j.base === 'reset') P.reset.call(this); else P.initRun.call(this);
      j.entries.forEach(function (e) {
        if (e.t > self.s.simTime) P.advanceTo.call(self, e.t, true);
        if (e.m === '_set') { applySettingsInPlace(self.settings, e.a[0]); return; }
        if (e.m === '_boot') { if (self.s.boot) P.finishBoot.call(self); return; }
        if (e.m === '_disp') { if (self.s.dispense) { self.s.dispense.realElapsed = DISPENSE_REAL_MS; P.updateDispense.call(self); } return; }
        if (JOURNALED.indexOf(e.m) < 0) throw new Error('unknown journal entry ' + e.m);
        var args = (e.a || []).map(function (x) {
          if (x && typeof x === 'object' && x.__sc != null) return (self.settings.scenarios || []).filter(function (sc) { return sc.id === x.__sc; })[0] || null;
          return x === null ? undefined : x;
        });
        if ((e.m === 'startScenario' || e.m === 'endScenario') && !args[0]) return;
        P[e.m].apply(self, args);
      });
      if (untilT != null && untilT > this.s.simTime) P.advanceTo.call(this, untilT, true);
      this.quiet = false;
      this._j = JSON.parse(JSON.stringify(j));
      this._jSet = JSON.stringify(this.settings);
    } finally { this._replaying = false; }
    this.emit('change');
  };

  // Applies time spent away from the page (real ms) as if the page had stayed open.
  P.catchUp = function (realMs) {
    if (!this.s.running || this.s.finished || !(realMs > 0)) return 0;
    var t0 = this.s.simTime;
    this.quiet = true;
    try { this.tick(realMs); } finally { this.quiet = false; }
    this.emit('change');
    return this.s.simTime - t0;
  };

  // ---------- feeding-mode comparison ----------
  Engine.summarize = function (records) {
    var sch = records.filter(function (r) { return r.source === 'schedule'; });
    var c = { scheduled: sch.length, manual: 0, auto_ok: 0, auto_fail: 0, missed_manual: 0, missed_power: 0, cap_skip: 0 };
    var delays = [], byDay = {};
    sch.forEach(function (r) {
      if (c[r.outcome] !== undefined) c[r.outcome]++;
      var ok = r.outcome === 'manual' || r.outcome === 'auto_ok';
      (byDay[r.day] = byDay[r.day] || []).push(ok);
      if (ok) delays.push(((r.responseAt != null ? r.responseAt : r.attemptAt) - r.scheduledAt) / MIN);
    });
    var days = Object.keys(byDay), full = days.filter(function (d) { return byDay[d].every(Boolean); }).length;
    var mean = delays.length ? delays.reduce(function (a, b) { return a + b; }, 0) / delays.length : null;
    return {
      scheduled: c.scheduled, delivered: c.manual + c.auto_ok, manual: c.manual, autoOk: c.auto_ok, autoFail: c.auto_fail,
      missed: c.missed_manual + c.missed_power, missedManual: c.missed_manual, missedPower: c.missed_power, capSkip: c.cap_skip,
      meanDelay: mean, maxDelay: delays.length ? Math.max.apply(null, delays) : null, daysAllFed: full, days: days.length
    };
  };
  // Runs the same calendar once per feeding mode: same seed, same owner model, same scenarios.
  Engine.compareModes = function (settings, seed) {
    var out = {};
    ['manual', 'auto', 'hybrid'].forEach(function (m) {
      var st = JSON.parse(JSON.stringify(settings));
      st.feedMode = m; st.awayMode = false;
      if (st.owner.mode !== 'simulated') st.owner.mode = 'simulated';
      var e = new Engine({ settings: st, seed: seed });
      e.start(); e.runToEnd();
      out[m] = Engine.summarize(e.s.records);
    });
    return out;
  };

  root.AquaEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
