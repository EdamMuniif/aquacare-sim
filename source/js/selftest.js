/*
 * Logic self-test for the AquaCare SIMULATION engine (v2).
 * Checks the software model only. A pass says nothing about real hardware,
 * which has not been built or tested.
 */
(function (root) {
  'use strict';

  function runSelfTest(Engine) {
    var results = [];
    var DAY = Engine.fmt.DAY, MIN = Engine.fmt.MIN;

    function make(mod) {
      var st = Engine.defaultSettings();
      st.startDate = '2026-11-13';
      if (mod) mod(st);
      var e = new Engine({ settings: st, seed: 7 });
      e.start();
      return e;
    }
    function run(e, ms) { for (var t = 0; t < ms; t += 100) e.tick(100); }
    function toReminder(e) { e.jumpToNextFeed(); run(e, 5200); }
    function has(e, kind, re) { return e.log.some(function (x) { return x.kind === kind && (!re || re.test(x.text)); }); }
    function recs(e, day) { return e.s.records.filter(function (r) { return !day || r.day === day; }); }
    function count(list, outcome) { return list.filter(function (r) { return r.outcome === outcome; }).length; }
    function check(name, fn) {
      try {
        var r = fn();
        results.push(r === true ? { name: name, pass: true, detail: 'OK' } : { name: name, pass: false, detail: String(r) });
      } catch (err) {
        results.push({ name: name, pass: false, detail: 'Error: ' + (err && err.message ? err.message : err) });
      }
    }

    check('Manual confirmation at the tank cancels the automatic dispense', function () {
      var e = make(); toReminder(e);
      if (e.s.phase !== 'reminder') return 'reminder did not open';
      if (e.pressTankButton() !== 'confirmed') return 'press not accepted';
      e.setSpeed(60); run(e, 15000);
      return e.s.feeds.counted === 1 && e.s.feeds.manual === 1 && !has(e, 'auto') && recs(e)[0].outcome === 'manual' || 'unexpected state';
    });

    check('Countdown expiry starts exactly one automatic attempt', function () {
      var e = make(); toReminder(e); e.setSpeed(60); run(e, 10200);
      if (!has(e, 'auto')) return 'no automatic attempt after 10 min';
      run(e, 4000);
      return e.s.feeds.autoOk === 1 && e.s.phase === 'idle' && recs(e)[0].outcome === 'auto_ok' || 'dispense did not complete';
    });

    check('Passage detected: dispense logged as successful', function () {
      var e = make(); toReminder(e); e.expireNow(); run(e, 4000);
      return has(e, 'ok', /passage detected/i) && !e.s.feederFault && recs(e)[0].ir === 'passage detected' || 'no success entry';
    });

    check('No passage: fault raised, attempt unsuccessful and counted', function () {
      var e = make(); e.setPassageMode('none'); toReminder(e); e.expireNow(); run(e, 4000);
      return e.s.feeds.autoFail === 1 && e.s.feederFault && !!e.findAlert('feeder') && e.s.feeds.counted === 1 || 'fault path incorrect';
    });

    check('Daily cap blocks a 4th feed (injected trigger)', function () {
      var e = make();
      for (var i = 0; i < 3; i++) { toReminder(e); e.pressTankButton(); }
      if (e.s.feeds.counted !== 3) return 'expected 3/3, got ' + e.s.feeds.counted;
      e.injectTrigger();
      return e.log[e.log.length - 1].kind === 'cap' && e.s.feeds.counted === 3 && recs(e)[3].outcome === 'cap_skip' || '4th not blocked';
    });

    check('Failed attempts use up the cap: no repeated dispensing', function () {
      var e = make(); e.setPassageMode('none');
      for (var i = 0; i < 3; i++) { toReminder(e); e.expireNow(); run(e, 4000); }
      e.injectTrigger();
      return e.s.feeds.autoFail === 3 && e.s.feeds.counted === 3 && !has(e, 'ok') && count(recs(e), 'cap_skip') === 1 || 'failed attempts not counted';
    });

    check('Sensor fault shows No data and raises an equipment alert', function () {
      var e = make(); e.setSensorStatus('temp', 'disconnected'); e.setSpeed(60); run(e, 1500);
      if (e.s.sensors.temp.value !== null) return 'stale value shown';
      if (!e.findAlert('sensor-temp')) return 'no alert';
      e.setSensorStatus('temp', 'ok'); run(e, 1500);
      return !e.findAlert('sensor-temp') && typeof e.s.sensors.temp.value === 'number' || 'did not recover';
    });

    check('Wi-Fi loss: feeding continues locally; events queue then sync', function () {
      var e = make(); e.setWifi(false); toReminder(e); e.expireNow(); run(e, 4000);
      if (e.s.feeds.autoOk !== 1) return 'local feed did not run offline';
      if (e.log.filter(function (x) { return x.pendingSync; }).length < 2) return 'events not queued';
      e.setWifi(true);
      return e.log.filter(function (x) { return x.pendingSync; }).length === 0 || 'queue not flushed';
    });

    check('Power cut during a reminder: slot marked missed, no auto feed', function () {
      var e = make(); toReminder(e); e.cutPower(); e.restorePower(); run(e, 2000);
      return e.s.power === 'on' && recs(e)[0].outcome === 'missed_power' && !has(e, 'auto') && e.s.feeds.counted === 0 || 'restart policy not applied';
    });

    check('Press at 10:00 is too late; press during dispense is ignored', function () {
      var e = make(); toReminder(e);
      e.advanceTo(e.s.reminder.deadline - 1000, true);
      if (e.s.phase !== 'reminder') return 'window closed early';
      var e2 = make(); toReminder(e2); e2.advanceTo(e2.s.reminder.deadline, true);
      if (e2.s.phase !== 'dispensing') return 'expiry not processed at 10:00';
      return e2.pressTankButton() === 'busy' && e.pressTankButton() === 'confirmed' || 'boundary handling wrong';
    });

    check('30-day calendar: 90 feed events, cap reset daily, run stops at Day 30', function () {
      var e = make(function (st) { st.owner = { mode: 'simulated', respondPct: 50 }; });
      e.runToEnd();
      var all = recs(e);
      if (all.length !== 90) return 'expected 90 records, got ' + all.length;
      for (var d = 1; d <= 30; d++) {
        var n = recs(e, d).filter(function (r) { return r.outcome === 'manual' || r.outcome === 'auto_ok' || r.outcome === 'auto_fail'; }).length;
        if (n > 3) return 'more than 3 feeds on day ' + d;
      }
      return e.s.finished && !e.s.running && e.s.day === 30 && count(all, 'manual') > 0 && count(all, 'auto_ok') > 0 || 'run did not finish cleanly';
    });

    check('Only enabled slots run (2 slots/day = 60 events)', function () {
      var e = make(function (st) { st.slots[1].on = false; st.days = 30; });
      e.runToEnd();
      return recs(e).length === 60 || 'got ' + recs(e).length;
    });

    check('Scenario: blocked chute makes attempts fail and count toward the cap', function () {
      var e = make(function (st) { st.scenarios = [{ id: 'c', day: 2, time: '00:00', type: 'chute', minutes: 1440 }]; });
      e.fastForwardToDay(3);
      var d2 = recs(e, 2);
      return d2.length === 3 && count(d2, 'auto_fail') === 3 && count(recs(e, 1), 'auto_fail') === 0 || 'day 2: ' + d2.map(function (r) { return r.outcome; }).join(',');
    });

    check('Scenario: missed confirmation day falls back to automatic feeding', function () {
      var e = make(function (st) { st.owner = { mode: 'simulated', respondPct: 100 }; st.scenarios = [{ id: 'm', day: 2, time: '00:00', type: 'missed' }]; });
      e.fastForwardToDay(4);
      return count(recs(e, 1), 'manual') === 3 && count(recs(e, 2), 'auto_ok') === 3 && count(recs(e, 3), 'manual') === 3 || 'owner model or scenario wrong';
    });

    check('Scenario: power outage over a slot logs it as missed', function () {
      var e = make(function (st) { st.scenarios = [{ id: 'p', day: 2, time: '12:30', type: 'power', minutes: 60 }]; });
      e.fastForwardToDay(3);
      var d2 = recs(e, 2);
      var mid = d2.filter(function (r) { return r.slot === '13:00'; })[0];
      return mid && mid.outcome === 'missed_power' && e.s.power === 'on' || 'slot not marked missed';
    });

    check('Scenario: Wi-Fi loss queues events, then syncs when it ends', function () {
      var e = make(function (st) { st.scenarios = [{ id: 'w', day: 1, time: '12:00', type: 'wifi', minutes: 120 }]; });
      e.advanceTo(13 * 60 * MIN + 30 * MIN, true);
      if (e.s.wifi) return 'Wi-Fi still on during scenario';
      var queued = e.log.filter(function (x) { return x.pendingSync; }).length;
      e.advanceTo(14 * 60 * MIN + 30 * MIN, true);
      return queued > 0 && e.s.wifi && e.log.filter(function (x) { return x.pendingSync; }).length === 0 && recs(e, 1).length === 2 || 'queue/sync wrong';
    });

    check('Five-sample smoothing: shown value is the mean of the last 5 valid readings', function () {
      var e = make(); e.setSpeed(60); run(e, 8000);
      var sn = e.s.sensors.tds;
      if (sn.buf.length !== Engine.SMOOTH_N) return 'buffer length ' + sn.buf.length;
      var m = sn.buf.reduce(function (a, b) { return a + b; }, 0) / sn.buf.length;
      return Math.abs(m - sn.value) < 1e-9 || 'smoothed value is not the mean';
    });

    check('Local validation rejects impossible raw values (no data shown)', function () {
      var e = make(); e.setSpeed(60);
      ['ph', 'temp', 'tds', 'turb'].forEach(function (k) { e.setSensorStatus(k, 'faulty'); });
      run(e, 3000);
      var bad = ['ph', 'temp', 'tds', 'turb'].filter(function (k) { var sn = e.s.sensors[k]; return sn.value !== null || sn.rejected < 2; });
      return bad.length === 0 || 'not rejected: ' + bad.join(',');
    });

    check('Perturbation tests (heater, vinegar, soil, TDS) raise range alerts', function () {
      var e = make(); e.setSpeed(60);
      ['heater', 'vinegar', 'soil', 'salts'].forEach(function (k) { e.startPerturbation(k, 60); });
      e.advanceTo(e.s.simTime + 90 * MIN, true);
      var miss = e.s.pertRecords.filter(function (r) { return r.detectedAt == null; }).map(function (r) { return r.kind; });
      return miss.length === 0 && !!e.findAlert('temp-high') && !!e.findAlert('ph-low') && !!e.findAlert('turb-high') && !!e.findAlert('tds-high') || 'not detected: ' + miss.join(',');
    });

    check('No operating range configured: perturbation raises no alert', function () {
      var e = make(function (st) { st.limits.tMin = null; st.limits.tMax = null; });
      e.startPerturbation('heater', 120);
      e.advanceTo(e.s.simTime + 3 * 60 * MIN, true);
      return !e.findAlert('temp-high') && e.s.pertRecords[0].detectedAt == null || 'alert raised without a range';
    });

    check('Air bubbles: smoothing damps raw turbidity spikes', function () {
      var e = make(function (st) { st.limits.turbMax = null; });
      e.setBubbles(true);
      e.advanceTo(e.s.simTime + 4 * 60 * MIN, true);
      var rows = e.s.samples.slice(-200), rawMax = 0, smMax = 0;
      rows.forEach(function (r) { if (r.turb_raw > rawMax) rawMax = r.turb_raw; if (r.turb > smMax) smMax = r.turb; });
      return rawMax > 40 && smMax < rawMax * 0.75 || 'raw max ' + rawMax + ', smoothed max ' + smMax;
    });

    check('Manual-only mode: no automatic fallback, unanswered feeds are missed', function () {
      var e = make(function (st) { st.feedMode = 'manual'; });
      toReminder(e); e.expireNow(); run(e, 4000);
      return e.s.records[0].outcome === 'missed_manual' && !has(e, 'auto') && e.s.feeds.counted === 0 || 'outcome ' + e.s.records[0].outcome;
    });

    check('Automatic-only mode: no hand-feed prompt, feeder runs at the slot time', function () {
      var e = make(function (st) { st.feedMode = 'auto'; });
      e.jumpToNextFeed(); run(e, 5200);
      if (e.s.phase !== 'dispensing') return 'expected dispensing, got ' + e.s.phase;
      run(e, 4000);
      return e.s.records[0].reminderAt == null && e.s.records[0].outcome === 'auto_ok' || 'reminder was shown';
    });

    check('Mode comparison: same seed, ask-then-fallback delivers at least as many feeds as manual only', function () {
      var st = Engine.defaultSettings(); st.owner = { mode: 'simulated', respondPct: 60 };
      var r = Engine.compareModes(st, 7);
      return r.hybrid.delivered >= r.manual.delivered && r.hybrid.manual === r.manual.manual && r.auto.manual === 0 && r.hybrid.scheduled === 90 || JSON.stringify(r);
    });

    check('LCD fault does not affect feeding or alerts', function () {
      var e = make(); e.setLcdBug(true); toReminder(e); e.expireNow(); run(e, 4000);
      return e.s.feeds.autoOk === 1 && e.s.lcdBug === 1 || 'feeding affected';
    });

    check('New day resets the daily count', function () {
      var e = make();
      for (var i = 0; i < 3; i++) { toReminder(e); e.pressTankButton(); }
      e.fastForwardNextDay();
      return e.s.day === 2 && e.s.feeds.counted === 0 || 'count not reset';
    });

    check('Reset returns to the known start state', function () {
      var e = make(); toReminder(e); e.pressTankButton(); e.reset();
      return e.s.feeds.counted === 0 && e.s.phase === 'idle' && !e.s.running && e.s.day === 1 && e.s.records.length === 0 || 'reset incomplete';
    });

    check('Resume: replaying the saved journal rebuilds the identical run (page closed and reopened)', function () {
      function sig(x) { return JSON.stringify({ s: Object.assign({}, x.s, { rand: null, ownerRand: null }), log: x.log, set: x.settings }); }
      var st = Engine.defaultSettings(); st.startDate = '2026-11-13';
      var a = new Engine({ settings: st, seed: 7 }); a.enableJournal();
      st.scenarios = Engine.exampleScenarios(); st.owner.mode = 'simulated'; a.syncScenarios();
      a.setSpeed(600); a.start();
      for (var i = 0; i < 1500; i++) {
        a.tick(80 + (i % 7) * 130);
        if (i === 100) a.pressTankButton();
        if (i === 300) a.cutPower();
        if (i === 304) a.restorePower();
        if (i === 600) a.startPerturbation('vinegar', 60);
        if (i === 900) a.setSpeed(3600);
      }
      var b = new Engine({ settings: Engine.defaultSettings(), seed: 1 }); b.enableJournal();
      b.replayJournal(JSON.parse(JSON.stringify(a.journal)), a.s.simTime);
      if (sig(a) !== sig(b)) return 'replayed run differs';
      for (var k = 0; k < 200; k++) { a.tick(500); b.tick(500); }
      return sig(a) === sig(b) || 'runs diverged after resuming';
    });

    check('Resume: time away is caught up with every event simulated', function () {
      var e = make(); e.setSpeed(60);
      var gained = e.catchUp(3 * 3600 * 1000);   // 3 real hours at 60x = 180 simulated hours
      return Math.abs(gained - 180 * 60 * MIN) < MIN && e.s.day === 8 && recs(e).length >= 21 || ('gained ' + gained / MIN + ' min, day ' + e.s.day);
    });

    return results;
  }

  root.AquaSelfTest = runSelfTest;
  if (typeof module !== 'undefined' && module.exports) module.exports = runSelfTest;
})(typeof window !== 'undefined' ? window : globalThis);
