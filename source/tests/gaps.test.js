// Gap checks: empty hopper, IR sensor stuck clear or blocked, and the controller clock after a power cut.
// SIMULATION ONLY.  Run: node source/tests/gaps.test.js
// All three are off by default; the released runs must not change (see alerts.test.js 2b).
'use strict';
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const MIN = 60000;
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

// One day, presenter mode (nobody presses the button), so every slot falls back to an automatic attempt at hh:10.
function day1(scenarios, extra) {
  const s = Engine.defaultSettings(); s.startDate = '2026-11-19'; s.days = 1; s.scenarios = scenarios;
  if (extra) extra(s);
  const e = new Engine({ settings: s, seed: 20261122 }); e.start(); e.quiet = true; e.runToEnd();
  return e;
}
const sc = (type, time, minutes, id) => ({ id: id || type, day: 1, time: time, type: type, minutes: minutes });
const outcomes = e => e.s.records.map(r => r.slot + ':' + r.outcome).join(' ');
const logHas = (e, re) => e.log.some(l => re.test(l.text));

// 0. defaults
check('0a Clock default keeps the released behaviour', Engine.defaultSettings().clock === 'kept');
check('0b New scenario types exist', ['hopper', 'irclear', 'irblocked'].every(t => Engine.SCENARIO_TYPES[t] && Engine.SCENARIO_TYPES[t].needsMinutes));
{
  const e = day1([]);
  check('0c Plain day: three automatic feeds succeed', outcomes(e) === '08:00:auto_ok 13:00:auto_ok 18:00:auto_ok', outcomes(e));
}

// 1. empty hopper 07:00-17:00
{
  const e = day1([sc('hopper', '07:00', 600)]);
  const r = e.s.records;
  check('1a Empty hopper: attempts in the window fail, the one after refill succeeds', outcomes(e) === '08:00:auto_fail 13:00:auto_fail 18:00:auto_ok', outcomes(e));
  check('1b Empty hopper: cause recorded on the failed attempts', r[0].notes.indexOf('hopper empty (scenario)') >= 0 && r[1].notes.indexOf('hopper empty (scenario)') >= 0);
  check('1c Empty hopper: feeder fault latched and every attempt counted toward the cap', e.s.feederFault === true && e.s.feeds.counted === 3);
  check('1d Empty hopper: the log explains there is no hopper level sensor', logHas(e, /no hopper level sensor/));
}

// 2. IR stuck clear 07:00-17:00
{
  const e = day1([sc('irclear', '07:00', 600)]);
  check('2a IR stuck clear: attempts in the window fail, later one succeeds', outcomes(e) === '08:00:auto_fail 13:00:auto_fail 18:00:auto_ok', outcomes(e));
  check('2b IR stuck clear: cause recorded', e.s.records[0].notes.indexOf('IR sensor stuck reading clear (scenario)') >= 0);
}

// 3. IR stuck blocked 07:00-17:00: never logged as a success
{
  const e = day1([sc('irblocked', '07:00', 600)]);
  const r = e.s.records;
  check('3a IR stuck blocked: attempts in the window are not logged as successes', outcomes(e) === '08:00:auto_fail 13:00:auto_fail 18:00:auto_ok', outcomes(e));
  check('3b IR stuck blocked: recorded as not verified', r[0].ir === 'not verified (IR sensor fault)');
  check('3c IR stuck blocked: self-check logged and IR sensor alert raised', logHas(e, /IR self-check \(proposed\)/) && logHas(e, /Alert raised: IR sensor fault/));
  check('3d IR stuck blocked: alert cleared when the sensor works again', !e.findAlert('ir-sensor') && logHas(e, /IR sensor alert cleared/));
  check('3e IR stuck blocked: attempts still count toward the cap', e.s.feeds.counted === 3);
}
{
  const e = day1([sc('irblocked', '07:00', 120, 'a'), sc('chute', '07:00', 120, 'b')]);
  check('3f IR stuck blocked plus blocked chute: still not a success', e.s.records[0].outcome === 'auto_fail', outcomes(e));
}

// 4. clock: Wi-Fi down 09:00-16:00, power cut 09:30-09:45 (the simulated day starts at 07:58)
const clockScen = () => [sc('wifi', '09:00', 420, 'w'), sc('power', '09:30', 15, 'p')];
{
  const e = day1(clockScen(), s => { s.clock = 'wifi'; });
  check('4a No backup clock: slots while the time is unknown are missed, feeding resumes after Wi-Fi', outcomes(e) === '08:00:auto_ok 13:00:missed_clock 18:00:auto_ok', outcomes(e));
  check('4b No backup clock: clock alert raised and cleared', logHas(e, /Alert raised: Clock not set/) && logHas(e, /Clock set from internet time over Wi-Fi: scheduled feeding resumes/) && !e.findAlert('clock'));
  check('4c No backup clock: the missed slot is not dispensed late', e.s.feeds.counted === 2);
  const sum = Engine.summarize(e.s.records);
  check('4d Summary counts clock misses', sum.missedClock === 1 && sum.missed === 1, JSON.stringify({ c: sum.missedClock, m: sum.missed }));
}
{
  const e = day1(clockScen());
  check('4e Time kept (default): the same day feeds normally', outcomes(e) === '08:00:auto_ok 13:00:auto_ok 18:00:auto_ok', outcomes(e));
}
{
  const e = day1([sc('power', '09:30', 15, 'p')], s => { s.clock = 'wifi'; });
  check('4f No backup clock but Wi-Fi up: time set at restart, no slot missed', outcomes(e) === '08:00:auto_ok 13:00:auto_ok 18:00:auto_ok' && logHas(e, /Clock set from internet time over Wi-Fi after the restart/), outcomes(e));
}
{
  // a hand feed is still possible: the reminder logic needs the time, so with the clock unset no reminder opens
  const e = day1(clockScen(), s => { s.clock = 'wifi'; });
  check('4g No backup clock: no reminder opens while the time is unknown', !e.log.some(l => /Feeding reminder for the 13:00 slot/.test(l.text)));
}

// 5. demonstration pH calibration (illustrative probe values; off by default)
{
  const DAY = 24 * 60 * MIN;
  check('5a pH demo off by default; status Not calibrated', Engine.defaultSettings().phCalDemo === false && new Engine({ settings: Engine.defaultSettings() }).phCalStatus().text === 'Not calibrated');
  const mk = on => { const s = Engine.defaultSettings(); s.startDate = '2026-11-19'; s.days = 30; s.phCalDemo = on; const e = new Engine({ settings: s, seed: 20261122 }); e.start(); e.quiet = true; return e; };
  const meanErr = (e, from, to) => { let n = 0, m = 0; e.s.samples.forEach(r => { if (r.t >= from && r.t < to && r.ph != null) { n++; m += r.ph; } }); return n ? m / n : null; };
  // the samples hold the shown (averaged) value; compare with the probe-free water value from a demo-off twin run
  const off = mk(false), on = mk(true);
  const step = (e, ms) => e.advanceTo(e.s.simTime + ms, true);
  step(off, 6 * 60 * MIN); step(on, 6 * 60 * MIN);
  const t0 = on.s.simTime - 6 * 60 * MIN;
  const before = meanErr(on, t0, on.s.simTime) - meanErr(off, t0, off.s.simTime);
  check('5b Demo probe before calibration reads about 0.2 pH high', before > 0.12 && before < 0.30, before.toFixed(3));
  check('5c calibratePh refuses when the demo is off', off.calibratePh() === 'off' && off.s.phCal === null);
  check('5d Calibration succeeds and is logged', on.calibratePh() === 'ok' && on.s.phCal && on.log.some(l => /pH two-point calibration \(demo\)/.test(l.text)) && on.phCalStatus().code === 'ok');
  const tc = on.s.simTime;
  step(off, 6 * 60 * MIN); step(on, 6 * 60 * MIN);
  const after = meanErr(on, tc + 10 * MIN, on.s.simTime) - meanErr(off, tc + 10 * MIN, off.s.simTime);
  check('5e Right after calibration the error is small', Math.abs(after) < 0.03, after.toFixed(3));
  step(off, 19 * DAY); step(on, 19 * DAY);
  const t2 = on.s.simTime - 6 * 60 * MIN;
  const drift = meanErr(on, t2, on.s.simTime) - meanErr(off, t2, off.s.simTime);
  check('5f About 19 days later the probe has drifted again (~0.2 pH)', drift > 0.14 && drift < 0.28, drift.toFixed(3));
  check('5g Not yet due before 30 days; no due alert', on.phCalStatus().code === 'ok' && !on.findAlert('ph-cal'));
  on.s.phCal.at -= 31 * DAY; step(on, 2 * MIN);
  check('5h After 30 days: status due and an equipment alert', on.phCalStatus().code === 'due' && !!on.findAlert('ph-cal'));
  on.calibratePh();
  check('5i Recalibrating clears the due alert', on.phCalStatus().code === 'ok' && !on.findAlert('ph-cal'));
}

out.forEach(l => console.log(l));
console.log(pass + '/' + (pass + fail) + ' gap checks passed');
if (fail) process.exit(1);
