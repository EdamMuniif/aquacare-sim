// Alert-clearing regression checks. SIMULATION ONLY.  Run: node source/tests/alerts.test.js
// The original rule must keep the released alert behaviour exactly. The optional 'hold' rule (clear margin + 10-min hold)
// must never delay raising an alert, and must survive a page reload.
'use strict';
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const MIN = 60000;
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }
const hhmm = t => { const m = Math.floor(t / MIN) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

function faultsMonth(rule) {
  const s = Engine.defaultSettings(); s.startDate = '2026-11-19'; s.days = 30; s.tankGal = '5'; s.owner = { mode: 'simulated', respondPct: 60 };
  s.scenarios = Engine.exampleScenarios(); if (rule !== undefined) s.alertClearing = rule; else delete s.alertClearing;
  const e = new Engine({ settings: s, seed: 20261122 }); e.start(); e.quiet = true; e.runToEnd();
  const raised = e.log.filter(l => /^Alert raised/.test(l.text));
  return { e, times: raised.map(l => l.day + ' ' + hhmm(l.t)), texts: raised.map(l => l.text), delays: e.s.pertRecords.map(r => Math.round((r.detectedAt - r.start) / MIN)),
    feeds: e.s.records.filter(r => r.outcome === 'manual' || r.outcome === 'auto_ok').length };
}

// Released behaviour (v5 engine up to 88f7b56): the month with 16 scheduled faults raises these 19 alerts.
const RELEASED = ['6 13:39', '6 18:00', '8 13:11', '11 02:00', '12 10:03', '12 14:21', '12 14:29', '16 15:05', '18 10:00', '20 09:36', '20 09:55', '20 10:03', '20 10:12', '20 10:25', '23 11:09', '23 20:58', '23 21:11', '23 21:15', '23 21:55'];

const inst = faultsMonth('instant'), none = faultsMonth(undefined), hold = faultsMonth('hold');

// 1. default is the original rule
check('1 The default setting is the original rule', Engine.defaultSettings().alertClearing === 'instant');

// 2. original rule keeps the released alert sequence exactly
check('2 Original rule raises the same 19 alerts at the same times as the released engine', JSON.stringify(inst.times) === JSON.stringify(RELEASED), inst.times.length + ' alerts');

// 2b. and the whole event log, samples and feed records are byte-identical to the released engine
{
  const h = x => require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  const fp = h(inst.e.s.samples) + '/' + h(inst.e.s.records) + '/' + h(inst.e.log.map(l => [l.kind, l.text, l.t]));
  check('2b Original rule: samples, feed records and full event log match the released engine', fp === 'a97aeef8eaa22af7/fa1578fe44d6937f/a60d0f0ff0b63104', fp);
}

// 3. settings saved before this option existed behave as the original rule
check('3 Settings without the option (older saved runs) behave as the original rule', JSON.stringify(none.e.log) === JSON.stringify(inst.e.log) && JSON.stringify(none.e.s.samples) === JSON.stringify(inst.e.s.samples));

// 4. hold rule: fewer alerts, every one raised at a time the original rule also raised it, same detection delays, same feeding
{
  const subset = hold.times.every(t => RELEASED.indexOf(t) >= 0);
  check('4 Hold rule: one alert per episode, never raised later than the original, feeding unchanged',
    hold.times.length === 9 && subset && JSON.stringify(hold.delays) === JSON.stringify(inst.delays) && hold.feeds === inst.feeds && hold.feeds === 86,
    `${hold.times.length} alerts (original ${inst.times.length}), detection ${hold.delays.join('/')} min, ${hold.feeds} feeds`);
}

// 5. hold rule: alerts clear only after the reading has been clearly back for 10 min, so none closes earlier than under the original rule
{
  const closes = run => { const o = {}, c = []; run.e.log.forEach(l => { if (/^Alert raised/.test(l.text)) o[l.text] = l.t; else if (/back within operating range/.test(l.text)) c.push(l.t); }); return c; };
  const ci = closes(inst), ch = closes(hold);
  check('5 Hold rule: every water alert clears at least 10 min after the original rule would first have cleared it', ch.length === 6 && ch.every(t => ci.some(x => t - x >= 10 * MIN)), ch.length + ' clears');
}

// 6. a saved run with the hold rule, switched on mid-run, replays identically after a reload
{
  const sig = x => JSON.stringify({ s: Object.assign({}, x.s, { rand: null, ownerRand: null }), log: x.log, set: x.settings });
  const st = Engine.defaultSettings(); st.startDate = '2026-11-13';
  const a = new Engine({ settings: st, seed: 7 }); a.enableJournal(); a.setSpeed(600); a.start();
  for (let i = 0; i < 1200; i++) {
    a.tick(80 + (i % 7) * 130);
    if (i === 200) st.alertClearing = 'hold';
    if (i === 400) a.startPerturbation('vinegar', 60);
    if (i === 900) a.startPerturbation('salts', 60);
  }
  const b = new Engine({ settings: Engine.defaultSettings(), seed: 1 }); b.enableJournal();
  b.replayJournal(JSON.parse(JSON.stringify(a.journal)), a.s.simTime);
  let same = sig(a) === sig(b);
  for (let k = 0; k < 200; k++) { a.tick(500); b.tick(500); }
  same = same && sig(a) === sig(b);
  check('6 Hold rule switched on mid-run survives a reload: the replayed run is identical', same && b.settings.alertClearing === 'hold');
}

console.log(out.join('\n'));
console.log(pass + '/' + (pass + fail) + ' alert-clearing checks passed');
if (fail) process.exit(1);
