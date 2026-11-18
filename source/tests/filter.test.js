// Mechanical filter (proposal) checks. SIMULATION ONLY.  Run: node tests/filter.test.js
'use strict';
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const Filt = require(path.join(__dirname, '..', 'js', 'filter.js'));
const MIN = 60000, DAY = 86400000;
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

function engine(opts) {
  opts = opts || {};
  const s = Engine.defaultSettings();
  s.startDate = '2026-11-19'; s.days = opts.days || 30; s.tankGal = opts.tankGal || '5';
  s.owner = { mode: 'simulated', respondPct: 60 };
  s.filter = { enabled: !!opts.filter, flowLph: opts.flow == null ? null : opts.flow };
  s.scenarios = opts.scenarios || [];
  const e = new Engine({ settings: s, seed: 20261122 });
  e.start(); e.quiet = true;
  return e;
}
const at = (e, t) => e.advanceTo(t, true);
const turbWater = e => e.s.sensors.turb.water;
const F = e => e.s.filter;

// 1. normal operation: pump starts, primes, runs; flow follows the set value
{
  const e = engine({ filter: true });
  const t0 = e.s.simTime;
  at(e, t0 + 1 * MIN); const s1 = F(e).state, q1 = F(e).flow;
  at(e, t0 + 5 * MIN);
  check('1 Normal: STARTING then RUNNING with flow near set', s1 === 'STARTING' && F(e).state === 'RUNNING' && F(e).flow > 0.9 * F(e).flowSet,
    'after 1 min ' + s1 + ' ' + q1.toFixed(0) + ' L/h; after 5 min ' + F(e).state + ' ' + F(e).flow.toFixed(1) + ' of ' + F(e).flowSet + ' L/h set');
}

// 2 + 5. dirty water: soil test clears faster with the pump on; time back below 50 NTU and below 10 NTU
function soilRun(filter) {
  const e = engine({ filter });
  at(e, e.s.simTime + 30 * MIN);
  e.startPerturbation('soil', 60, 'test');
  const t0 = e.s.simTime; let peak = 0, below50 = null, below10 = null;
  for (let m = 1; m <= 24 * 60; m++) {
    at(e, t0 + m * MIN);
    const w = turbWater(e); peak = Math.max(peak, w);
    if (m > 60 && below50 == null && w < 50) below50 = m;
    if (m > 60 && below10 == null && w < 10) below10 = m;
  }
  return { peak, below50, below10, load: F(e).load };
}
{
  const off = soilRun(false), on = soilRun(true);
  check('2 Dirty water: soil test raises turbidity, filter clears it faster', on.peak > 40 && on.below10 < off.below10 && on.below50 <= off.below50,
    'peak off ' + off.peak.toFixed(0) + ' / on ' + on.peak.toFixed(0) + ' NTU; <10 NTU after ' + off.below10 + ' min (no filter) vs ' + on.below10 + ' min (filter)');
  check('2b Captured matter loads the sponge', on.load > Filt.CFG.loadStart + 0.05, 'load after one soil test ' + on.load.toFixed(3));
}

// 3. pump off: no flow, no clearing (same decay as no filter)
{
  const ref = engine({ filter: false }), e = engine({ filter: true });
  [ref, e].forEach(x => at(x, x.s.simTime + 30 * MIN));
  e.filterPump(false);
  [ref, e].forEach(x => x.startPerturbation('soil', 60, 'test'));
  const t0 = e.s.simTime;
  [ref, e].forEach(x => at(x, t0 + 180 * MIN));
  check('3 Pump OFF: flow 0 and turbidity decays exactly as with no filter', F(e).flow === 0 && F(e).state === 'OFF' && Math.abs(turbWater(e) - turbWater(ref)) < 1e-9,
    'flow ' + F(e).flow + ', turbidity ' + turbWater(e).toFixed(3) + ' vs ' + turbWater(ref).toFixed(3) + ' NTU');
}

// 4. blockage: load rises over weeks, flow falls, WARNING then FAULT (protective stop)
let warnDay = null, faultDay = null;
{
  const e = engine({ filter: true, days: 60 });
  const rows = [];
  for (let d = 1; d <= 60; d++) {
    at(e, d * DAY);
    if (d % 10 === 0) rows.push('d' + d + ' load ' + F(e).load.toFixed(2) + ' flow ' + Math.round(F(e).flow));
    if (warnDay == null && (F(e).state === 'WARNING' || F(e).state === 'FAULT')) warnDay = d;
    if (faultDay == null && F(e).state === 'FAULT') faultDay = d;
  }
  const alert = e.s.alerts.find(a => a.key === 'filter');
  check('4 Blockage: load up, flow down, warning raised, protective stop later', warnDay != null && faultDay != null && faultDay > warnDay && !!alert && F(e).flow === 0,
    'warning on day ' + warnDay + ', fault on day ' + faultDay + '; ' + rows.join('; '));
}

// 5. cleaning restores flow but does not clean the water at that instant
{
  const e = engine({ filter: true, days: 60 });
  at(e, 25 * DAY);
  e.startPerturbation('soil', 60, 'test');
  at(e, 25 * DAY + 90 * MIN);
  const qBefore = F(e).flow, wBefore = e.pertEffect('turb', e.s.simTime), stBefore = F(e).state;
  e.cleanFilter();
  const wAfter = e.pertEffect('turb', e.s.simTime);
  at(e, e.s.simTime + 5 * MIN);
  check('5 Cleaning: flow recovers, water unchanged at the moment of cleaning', wAfter === wBefore && F(e).flow > qBefore * 1.3 && F(e).state === 'RUNNING' && !e.s.alerts.some(a => a.key === 'filter'),
    stBefore + ' ' + qBefore.toFixed(0) + ' L/h -> ' + F(e).state + ' ' + F(e).flow.toFixed(0) + ' L/h; turbidity excess ' + wBefore.toFixed(2) + ' -> ' + wAfter.toFixed(2) + ' NTU');
}

// 6. pH, temperature and TDS are identical with the filter on or off (30 days, all 16 scenarios)
{
  const sc = Engine.exampleScenarios();
  const a = engine({ filter: false, scenarios: sc }), b = engine({ filter: true, scenarios: Engine.exampleScenarios() });
  a.runToEnd(); b.runToEnd();
  let same = a.s.samples.length === b.s.samples.length, turbDiff = 0;
  for (let i = 0; same && i < a.s.samples.length; i++) {
    const x = a.s.samples[i], y = b.s.samples[i];
    for (const k of ['ph', 'ph_raw', 'temp', 'temp_raw', 'tds', 'tds_raw']) if (x[k] !== y[k]) { same = false; break; }
    if (x.turb !== y.turb) turbDiff++;
  }
  check('6 pH, temperature and TDS untouched by the filter', same && turbDiff > 0, a.s.samples.length + ' samples compared; turbidity differs in ' + turbDiff);
  const sa = Engine.summarize(a.s.records), sb = Engine.summarize(b.s.records);
  check('6b Feeding unaffected by the filter', JSON.stringify(sa) === JSON.stringify(sb), 'delivered ' + sa.delivered + ' vs ' + sb.delivered);
}

// 7. power cut stops the pump; it restarts when power returns
{
  const e = engine({ filter: true });
  at(e, e.s.simTime + 10 * MIN);
  e.cutPower();
  at(e, e.s.simTime + 5 * MIN);
  const offState = F(e).state, offFlow = F(e).flow;
  e.restorePower();
  at(e, e.s.simTime + 15 * MIN);
  check('7 Power cut: pump stops, restarts after power returns', offState === 'OFF' && offFlow === 0 && F(e).state === 'RUNNING', offState + ' -> ' + F(e).state);
}

// 8. invalid transitions refused: a FAULT only clears through cleaning
{
  const f = Filt.create({ enabled: true }, 18.9, 0);
  f.state = 'FAULT'; f.load = 0;
  Filt.step(f, 1, { power: 'on', V: 18.9, t: MIN });
  const stillFault = f.state === 'FAULT' && f.flow === 0;
  Filt.setPump(f, true, 2 * MIN);
  const afterPump = f.state;
  Filt.clean(f, 3 * MIN, true);
  check('8 State machine: FAULT holds until the sponge is cleaned', stillFault && afterPump === 'FAULT' && f.state === 'STARTING', 'after clean: ' + f.state);
}

// 9. journal replay reproduces a run with filter actions exactly
{
  const e = engine({ filter: false, days: 7 });
  e.enableJournal();
  at(e, 1 * DAY); e.setFilter(true);
  at(e, 1 * DAY + 3 * 3600000); e.startPerturbation('soil', 60);
  at(e, 2 * DAY); e.setFilterFlow(60);
  at(e, 3 * DAY); e.filterPump(false);
  at(e, 3 * DAY + 3600000); e.filterPump(true);
  at(e, 4 * DAY); e.cleanFilter();
  at(e, 5 * DAY);
  const j = JSON.parse(JSON.stringify(e.journal));
  const r = engine({ filter: false, days: 7 });
  r.replayJournal(j, e.s.simTime);
  const strip = f => JSON.stringify({ st: f.state, q: f.flow, l: f.load, set: f.flowSet, h: f.history.length });
  check('9 Replay: same filter state and readings after reload', strip(F(r)) === strip(F(e)) && JSON.stringify(r.s.samples) === JSON.stringify(e.s.samples), strip(F(e)));
}

console.log(out.join('\n'));
console.log(pass + '/' + (pass + fail) + ' filter checks passed');
if (fail) process.exit(1);
