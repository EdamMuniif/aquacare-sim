// Three-stage filter checks. SIMULATION ONLY.  Run: node tests/filterstages.test.js
'use strict';
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const Filt = require(path.join(__dirname, '..', 'js', 'filter.js'));
const Stages = require(path.join(__dirname, '..', 'js', 'filterstages.js'));
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

function engine(opts) {
  opts = opts || {};
  const s = Engine.defaultSettings();
  s.startDate = '2026-11-19'; s.days = opts.days || 30; s.tankGal = '5';
  s.owner = { mode: 'simulated', respondPct: 60 };
  s.filter = { enabled: !!opts.filter, flowLph: null, mode: opts.mode || 'auto', boost: !!opts.boost, carbon: !!opts.carbon };
  s.scenarios = opts.scenarios || [];
  const e = new Engine({ settings: s, seed: 20261122 });
  e.start(); e.quiet = true;
  return e;
}
const at = (e, t) => e.advanceTo(t, true);
const F = e => e.s.filter, W = e => e.s.water;

// 1. normal operation: water circulates and the stages process it progressively
{
  const e = engine({ filter: true });
  at(e, e.s.simTime + 5 * MIN);
  const running = F(e).state === 'RUNNING' && F(e).flow > 0 && Filt.processing(F(e), e.filterVolume());
  const a0 = W(e).aob;
  at(e, 3 * DAY);
  check('1 Normal: pump runs, stages process water, media develops gradually', running && W(e).aob > a0 && W(e).aob < 0.5, 'flow ' + F(e).flow.toFixed(0) + ' L/h; ammonia-oxidiser maturity ' + a0.toFixed(3) + ' -> ' + W(e).aob.toFixed(3));
}

// 2. dirty water: suspended matter rises, then clears gradually and faster with the filter
function soil(filter) {
  const e = engine({ filter });
  at(e, e.s.simTime + 30 * MIN);
  e.startPerturbation('soil', 60, 'test');
  const t0 = e.s.simTime; let peak = 0, m10 = null;
  for (let m = 1; m <= 1440; m++) { at(e, t0 + m * MIN); const v = e.s.sensors.turb.water; peak = Math.max(peak, v); if (m > 60 && m10 == null && v < 10) m10 = m; }
  return { peak, m10 };
}
{
  const a = soil(false), b = soil(true);
  check('2 Dirty water: turbidity rises and clears progressively, faster with the filter', b.peak > 40 && b.m10 > 60 && b.m10 < a.m10, 'below 10 NTU after ' + a.m10 + ' min without, ' + b.m10 + ' min with');
}

// 3. pump off: circulation and processing stop
{
  const e = engine({ filter: true });
  at(e, 2 * DAY);
  e.filterPump(false);
  at(e, e.s.simTime + 2 * MIN);
  const no3 = W(e).no3, car = W(e).carbonUsed;
  at(e, e.s.simTime + 12 * HOUR);
  check('3 Pump OFF: no flow, no nitrate made, control falls back to manual', F(e).flow === 0 && !Filt.processing(F(e), e.filterVolume()) && W(e).no3 === no3 && W(e).carbonUsed === car && F(e).mode === 'manual', 'flow ' + F(e).flow + ', nitrate unchanged at ' + no3.toFixed(3) + ' mg/L');
}

// 4. blockage: resistance up, flow down, maintenance warning
{
  const e = engine({ filter: true, days: 60 });
  at(e, 5 * MIN + e.s.simTime);
  const r0 = F(e).R, q0 = F(e).flow;
  let warned = false;
  for (let d = 1; d <= 60 && !warned; d++) { at(e, d * DAY); warned = F(e).state === 'WARNING'; }
  check('4 Blockage: resistance rises, flow falls, maintenance status shown', warned && F(e).R > r0 && F(e).flow < q0 && Filt.status(F(e), false) === 'Maintenance' && e.s.alerts.some(a => a.key === 'filter'), 'R ' + r0.toFixed(2) + ' -> ' + F(e).R.toFixed(2) + ', flow ' + q0.toFixed(0) + ' -> ' + F(e).flow.toFixed(0) + ' L/h');
}

// 5. cleaning: flow recovers; water and biological media are untouched at that moment
{
  const e = engine({ filter: true, days: 60 });
  at(e, 25 * DAY);
  const q0 = F(e).flow, snap = JSON.stringify([W(e).tan, W(e).no2, W(e).no3, W(e).doMg, W(e).aob, W(e).nob, W(e).carbonUsed]), turb = e.pertEffect('turb', e.s.simTime);
  e.cleanFilter();
  const same = JSON.stringify([W(e).tan, W(e).no2, W(e).no3, W(e).doMg, W(e).aob, W(e).nob, W(e).carbonUsed]) === snap && e.pertEffect('turb', e.s.simTime) === turb && W(e).spongeFood === 0;
  at(e, e.s.simTime + 5 * MIN);
  check('5 Cleaning: flow restored, water and biological maturity unchanged', same && F(e).flow > q0, 'flow ' + q0.toFixed(0) + ' -> ' + F(e).flow.toFixed(0) + ' L/h');
}

// 6. biological: ammonia peaks, then nitrite, then nitrate accumulates; nitrogen is conserved
{
  const e = engine({ filter: true });
  let tanPeak = { v: 0, d: 0 }, no2Peak = { v: 0, d: 0 };
  for (let d = 1; d <= 30; d++) { at(e, d * DAY); if (W(e).tan > tanPeak.v) tanPeak = { v: W(e).tan, d }; if (W(e).no2 > no2Peak.v) no2Peak = { v: W(e).no2, d }; }
  const w = W(e), n0 = (0.02 + 0.01 + 2) * e.filterVolume();
  const bal = Math.abs(Stages.nitrogenMg(w, e.filterVolume()) - (n0 + w.nIn));
  check('6 Biological: ammonia peak, later nitrite peak, then both fall as nitrate builds', tanPeak.d > 1 && no2Peak.d > tanPeak.d && w.tan < tanPeak.v * 0.5 && w.no2 < no2Peak.v * 0.5 && w.no3 > 2, 'ammonia peak day ' + tanPeak.d + ' (' + tanPeak.v.toFixed(2) + '), nitrite peak day ' + no2Peak.d + ' (' + no2Peak.v.toFixed(2) + '), nitrate ' + w.no3.toFixed(1) + ' mg/L');
  check('6b Nitrogen mass balance holds over 30 days', bal < 1e-6, 'error ' + bal.toExponential(1) + ' mg');
  const lo = engine({ filter: true }), hi = engine({ filter: true });
  lo.setFilterFlow(10); [lo, hi].forEach(x => at(x, 10 * DAY));
  check('6c Biological development depends on flow', W(lo).aob < W(hi).aob, 'maturity at 10 L/h ' + W(lo).aob.toFixed(3) + ' vs default ' + W(hi).aob.toFixed(3));
}

// 7. low water: interlock stops the pump in every mode, refuses a manual start, recovers by mode
{
  const e = engine({ filter: true, mode: 'manual' });
  at(e, e.s.simTime + 10 * MIN);
  e.setWaterLevel(50);
  at(e, e.s.simTime + 2 * MIN);
  const stopped = F(e).state === 'FAULT' && F(e).faultKind === 'dry' && F(e).flow === 0 && e.s.alerts.some(a => a.key === 'filter-dry');
  e.filterPump(true); e.cleanFilter();
  at(e, e.s.simTime + 5 * MIN);
  const held = F(e).state === 'FAULT' && F(e).flow === 0;
  e.setWaterLevel(72); at(e, e.s.simTime + 3 * MIN);
  const hyst = F(e).state === 'FAULT';
  e.setWaterLevel(100); at(e, e.s.simTime + 3 * MIN);
  const manualOff = F(e).state === 'OFF' && !e.s.alerts.some(a => a.key === 'filter-dry');
  const a = engine({ filter: true });
  at(a, a.s.simTime + 10 * MIN); a.setWaterLevel(50); at(a, a.s.simTime + 2 * MIN); a.setWaterLevel(100); at(a, a.s.simTime + 6 * MIN);
  check('7 Low water: dry-run stop holds in manual mode, and recovery follows the mode', stopped && held && hyst && manualOff && F(a).state === 'RUNNING', 'manual ends ' + F(e).state + ', automatic ends ' + F(a).state);
}

// 8. carbon: adsorption declines with use, only organics change, replacement restores capacity
{
  const rate = (used) => {
    const w = Stages.create({ carbon: true }, 0); w.carbonUsed = used; w.doc = 10;
    const d0 = w.doc; Stages.step(w, 60, { flow: 95, V: 18.9, tempC: 26, t: HOUR }); return d0 - w.doc;
  };
  const fresh = rate(0), half = rate(Stages.CFG.carbonCapacityMg / 2), spent = rate(Stages.CFG.carbonCapacityMg);
  const e = engine({ filter: true, carbon: true });
  at(e, e.s.simTime + 10 * MIN);
  W(e).carbonUsed = Stages.CFG.carbonCapacityMg * 0.9;
  at(e, e.s.simTime + 2 * MIN);
  const alerted = e.s.alerts.some(a => a.key === 'filter-carbon');
  const bio = W(e).aob; e.replaceCarbon();
  const restored = Stages.carbonLeftPct(W(e)) === 100 && !e.s.alerts.some(a => a.key === 'filter-carbon') && W(e).aob === bio;
  const c = Stages.create({ carbon: true }, 0), n = Stages.create({ carbon: false }, 0);
  [c, n].forEach(w => Stages.step(w, 600, { flow: 95, V: 18.9, tempC: 26, t: 10 * HOUR }));
  const onlyOrganics = c.doc < n.doc && c.tan === n.tan && c.no2 === n.no2 && c.no3 === n.no3;
  check('8 Carbon: adsorption declines to zero, alert raised, replacement restores it', fresh > half && half > spent && spent < 0.03 && alerted && restored, 'organics removed in 1 h: fresh ' + fresh.toFixed(2) + ', half ' + half.toFixed(2) + ', spent ' + spent.toFixed(2) + ' mg/L');
  check('8b Carbon never removes ammonia, nitrite or nitrate', onlyOrganics, 'nitrate ' + c.no3.toFixed(4) + ' vs ' + n.no3.toFixed(4));
}

// 9. existing features: sensors and feeding match a filter-off run; sensor error blocks the boost; replay is exact
{
  const a = engine({ filter: false, scenarios: Engine.exampleScenarios() }), b = engine({ filter: true, carbon: true, scenarios: Engine.exampleScenarios() });
  a.runToEnd(); b.runToEnd();
  let same = a.s.samples.length === b.s.samples.length;
  for (let i = 0; same && i < a.s.samples.length; i++) for (const k of ['ph', 'temp', 'tds']) if (a.s.samples[i][k] !== b.s.samples[i][k]) same = false;
  check('9 Existing features: pH, temperature, TDS and feeding unchanged by all stages', same && JSON.stringify(Engine.summarize(a.s.records)) === JSON.stringify(Engine.summarize(b.s.records)), a.s.samples.length + ' samples compared');
  const e = engine({ filter: true, boost: true });
  at(e, e.s.simTime + 20 * MIN);
  e.startPerturbation('soil', 120, 'test');
  let boosted = false;
  for (let m = 1; m <= 120 && !boosted; m++) { at(e, e.s.simTime + MIN); boosted = F(e).boostActive; }
  const q = F(e).flow;
  e.setSensorStatus('turb', 'disconnected');
  at(e, e.s.simTime + 3 * MIN);
  check('9b Automatic boost raises flow, and a sensor error cancels it with a warning', boosted && q > F(e).flowSet * 1.1 && !F(e).boostActive && F(e).sensorWarn && e.s.alerts.some(a => a.key === 'filter-sensor'), 'boost flow ' + q.toFixed(0) + ' L/h, set ' + F(e).flowSet + ' L/h');
  const j = engine({ filter: false, days: 7 });
  j.enableJournal();
  at(j, DAY); j.setFilter(true); at(j, 2 * DAY); j.setCarbon(true); j.setFilterBoost(true);
  at(j, 3 * DAY); j.setWaterLevel(50); at(j, 3 * DAY + HOUR); j.setWaterLevel(100); j.setFilterMode('manual');
  at(j, 4 * DAY); j.replaceCarbon(); at(j, 5 * DAY);
  const r = engine({ filter: false, days: 7 });
  r.replayJournal(JSON.parse(JSON.stringify(j.journal)), j.s.simTime);
  check('9c Replay: filter stages and chemistry rebuild exactly after reload', JSON.stringify(W(r)) === JSON.stringify(W(j)) && F(r).state === F(j).state && F(r).flow === F(j).flow, 'nitrate ' + W(j).no3.toFixed(4) + ' mg/L');
}

// 10. state machine: FAULT cannot jump to RUNNING, and only listed transitions exist
{
  const ok = Filt.NEXT.OFF.join() === 'STARTING' && Filt.NEXT.FAULT.indexOf('RUNNING') < 0 && Filt.STATES.join() === 'OFF,STARTING,RUNNING,WARNING,FAULT';
  const e = engine({ filter: true });
  at(e, e.s.simTime + 10 * MIN);
  const label = Filt.pumpLabel(F(e)); e.filterPump(false); const label2 = Filt.pumpLabel(F(e));
  check('10 Controller: transitions restricted, and pump label follows state', ok && label === 'ON' && label2 === 'OFF', label + ' -> ' + label2);
}

console.log(out.join('\n'));
console.log(pass + '/' + (pass + fail) + ' multi-stage filter checks passed');
if (fail) process.exit(1);
