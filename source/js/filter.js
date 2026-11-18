/*
 * AquaCare digital prototype - mechanical filter (PROPOSAL, needs project-team confirmation)
 * ------------------------------------------------------------------------------------------
 * SIMULATION ONLY. An optional pump + sponge loop that clears suspended matter (turbidity).
 * It never changes pH, temperature or TDS: a sponge does not regulate those.
 * Biological and chemical stages, dissolved oxygen and water level are not modelled (Later).
 *
 * Model (all constants below are illustrative, to confirm by measurement):
 *   - Actual flow  Q = Qset / sqrt(R), with sponge resistance R = 1 + RES_K * load^3
 *     (a fixed-head pump against a growing restriction; R is relative to a clean sponge).
 *   - Clearing: suspended-matter excess decays at k = (Q / V) * CAPTURE per hour, on top of
 *     the engine's own settling. V is the nominal tank volume for the selected size.
 *   - Clogging: load rises slowly while water flows, with each delivered feed (waste and
 *     uneaten food), and with the suspended matter the sponge actually captures.
 * Deterministic: no random numbers, so seeded runs and the run journal replay exactly.
 */
(function (root) {
  'use strict';

  var CFG = {
    capture: 0.5,            // single-pass capture of suspended matter (0..1)
    defaultTurnover: 5,      // default set flow, tank volumes per hour
    maxTurnover: 10,         // slider maximum, tank volumes per hour
    resK: 15,                // R = 1 + resK * load^3  (load 1.0 -> 16x a clean sponge)
    loadPerDay: 0.012,       // background loading at full set flow (fine particles, biofilm)
    loadPerFeed: 0.003,      // per delivered feed while water flows
    loadPerNtuL: 7e-5,       // per NTU*litre of suspended matter captured (one soil test ~ +0.12 in 5 gal)
    loadStart: 0.05,         // sponge at the start of a run
    loadAfterClean: 0.03,    // rinsing never gets a sponge back to new
    startMin: 2,             // STARTING: priming time, simulated minutes
    warnFlow: 0.60,          // WARNING below this fraction of set flow ...
    warnClear: 0.65,         // ... and back to RUNNING only above this (hysteresis)
    faultFlow: 0.30,         // FAULT (protective stop) below this fraction of set flow
    historyMax: 40
  };
  var STATES = ['OFF', 'STARTING', 'RUNNING', 'WARNING', 'FAULT'];
  // Allowed transitions; anything else is refused (and would be a bug).
  var NEXT = {
    OFF: ['STARTING'],
    STARTING: ['RUNNING', 'WARNING', 'FAULT', 'OFF'],
    RUNNING: ['WARNING', 'FAULT', 'OFF'],
    WARNING: ['RUNNING', 'FAULT', 'OFF'],
    FAULT: ['OFF', 'STARTING']            // only after the sponge is cleaned
  };

  function volumeL(tankGal) {
    if (String(tankGal) === 'p3') return 36 * 22 * 26 / 1000;      // paper [3] tank, nominal
    var g = parseFloat(tankGal);
    return (g > 0 ? g : 5) * 3.785;
  }
  function defaultFlow(V) { return Math.round(V * CFG.defaultTurnover / 5) * 5; }
  function maxFlow(V) { return Math.round(V * CFG.maxTurnover / 5) * 5; }
  function resistance(load) { return 1 + CFG.resK * Math.pow(Math.max(0, Math.min(1, load)), 3); }

  function create(cfg, V, t) {
    cfg = cfg || {};
    var F = {
      enabled: !!cfg.enabled, pumpCmd: !!cfg.enabled, state: 'OFF', why: 'Filter not enabled',
      flowSet: clampFlow(cfg.flowLph, V), flow: 0, load: CFG.loadStart, R: resistance(CFG.loadStart),
      t: t, since: t, lastClean: null, captured: 0, history: []
    };
    if (F.enabled) go(F, 'STARTING', 'Filter enabled at run start', t);
    return F;
  }
  function clampFlow(q, V) {
    var mx = maxFlow(V);
    if (typeof q !== 'number' || !(q >= 0)) return defaultFlow(V);
    return Math.max(0, Math.min(mx, Math.round(q)));
  }
  function go(F, to, why, t) {
    if (F.state === to) { F.why = why; return null; }
    if (NEXT[F.state].indexOf(to) < 0) return null;
    var ev = { type: 'state', from: F.state, to: to, why: why };
    F.state = to; F.why = why; F.since = t;
    return ev;
  }
  function flowing(F) { return F.state === 'STARTING' || F.state === 'RUNNING' || F.state === 'WARNING'; }

  // Advance dtMin simulated minutes. env: { power: 'on'|'off'|'booting', V, t }. Returns events.
  function step(F, dtMin, env) {
    var out = [];
    function push(x) { if (x) out.push(x); }
    if (!F.enabled) { F.flow = 0; return out; }
    if (env.power !== 'on') {
      if (flowing(F)) push(go(F, 'OFF', 'Controller has no power, pump stopped', env.t));
      F.flow = 0;
      return out;
    }
    if (F.state === 'OFF' && F.pumpCmd) push(go(F, 'STARTING', 'Pump starting', env.t));
    F.R = resistance(F.load);
    var ratio = 1 / Math.sqrt(F.R);
    if (F.state === 'STARTING') {
      var ramp = Math.min(1, (env.t - F.since) / (CFG.startMin * 60000));
      F.flow = F.flowSet * ratio * ramp;
      if (ramp >= 1) push(go(F, ratio < CFG.faultFlow ? 'FAULT' : (ratio < CFG.warnFlow ? 'WARNING' : 'RUNNING'), 'Water flowing through the sponge', env.t));
    } else if (F.state === 'RUNNING' || F.state === 'WARNING') {
      F.flow = F.flowSet * ratio;
      if (ratio < CFG.faultFlow) push(go(F, 'FAULT', 'Flow ' + Math.round(ratio * 100) + ' % of set: protective stop, clean the sponge', env.t));
      else if (F.state === 'RUNNING' && ratio < CFG.warnFlow) push(go(F, 'WARNING', 'Flow ' + Math.round(ratio * 100) + ' % of set: clean the sponge', env.t));
      else if (F.state === 'WARNING' && ratio >= CFG.warnClear) push(go(F, 'RUNNING', 'Flow back to ' + Math.round(ratio * 100) + ' % of set', env.t));
    }
    if (F.state === 'FAULT') F.flow = 0;
    // background loading while water passes the sponge
    if (F.flow > 0 && F.flowSet > 0) F.load = Math.min(1, F.load + CFG.loadPerDay * (dtMin / 1440) * (F.flow / F.flowSet));
    F.R = resistance(F.load);
    return out;
  }
  // Per-minute decay rate the filter adds to suspended matter.
  function removalPerMin(F, V) { return F.enabled && F.flow > 0 && V > 0 ? (F.flow / V) * CFG.capture / 60 : 0; }
  function capture(F, ntuL) {
    if (!(ntuL > 0)) return;
    F.captured += ntuL;
    F.load = Math.min(1, F.load + ntuL * CFG.loadPerNtuL);
    F.R = resistance(F.load);
  }
  function feed(F) { if (F.enabled && F.flow > 0) { F.load = Math.min(1, F.load + CFG.loadPerFeed); F.R = resistance(F.load); } }
  function note(F, t, text) {
    F.history.unshift({ t: t, text: text });
    if (F.history.length > CFG.historyMax) F.history.length = CFG.historyMax;
  }

  // Commands. Each returns events; none touch the water.
  function setEnabled(F, on, t) {
    var out = [];
    on = !!on;
    if (on === F.enabled) return out;
    F.enabled = on; F.pumpCmd = on; F.t = t;
    if (on) { var e = go(F, F.state === 'FAULT' ? 'FAULT' : 'STARTING', 'Filter enabled', t); if (e) out.push(e); note(F, t, 'Filter enabled'); }
    else { if (F.state !== 'OFF') { F.state = 'OFF'; F.why = 'Filter disabled'; F.since = t; out.push({ type: 'state', from: '', to: 'OFF', why: 'Filter disabled' }); } F.flow = 0; note(F, t, 'Filter disabled'); }
    return out;
  }
  function setPump(F, on, t) {
    var out = [], e;
    F.pumpCmd = !!on;
    if (!F.enabled) return out;
    if (on && F.state === 'OFF') e = go(F, 'STARTING', 'Pump started', t);
    else if (!on && flowing(F)) e = go(F, 'OFF', 'Pump stopped', t);
    if (e) { out.push(e); note(F, t, on ? 'Pump started' : 'Pump stopped'); }
    if (!on) F.flow = 0;
    return out;
  }
  function setFlow(F, q, V, t) {
    var before = F.flowSet;
    F.flowSet = clampFlow(q, V);
    if (F.flowSet !== before) note(F, t, 'Set flow ' + before + ' → ' + F.flowSet + ' L/h');
    return [];
  }
  function clean(F, t, powerOn) {
    var out = [], was = F.state, before = F.load;
    F.load = Math.min(F.load, CFG.loadAfterClean); F.R = resistance(F.load); F.lastClean = t;
    note(F, t, 'Sponge rinsed (condition ' + Math.round((1 - before) * 100) + ' % → ' + Math.round((1 - F.load) * 100) + ' %)');
    if (F.enabled) {
      if (was === 'FAULT' || was === 'WARNING') {
        // Clear the fault, then restart if the pump is commanded on and there is power.
        if (was === 'FAULT') { F.state = 'OFF'; F.since = t; out.push({ type: 'state', from: 'FAULT', to: 'OFF', why: 'Sponge cleaned, fault cleared' }); }
        if (F.pumpCmd && powerOn) { var e = go(F, 'STARTING', 'Restart after cleaning', t); if (e) out.push(e); }
      }
    }
    out.push({ type: 'cleaned' });
    return out;
  }
  function condition(F) { return Math.round((1 - F.load) * 100); }
  function nextInspection(F, V) {
    // Simulated days until flow would fall below the warning level at the current rates (background only).
    if (!F.enabled || !(F.flowSet > 0)) return null;
    var Lw = Math.cbrt((1 / (CFG.warnFlow * CFG.warnFlow) - 1) / CFG.resK);
    var perDay = CFG.loadPerDay + 3 * CFG.loadPerFeed;
    return F.load >= Lw ? 0 : (Lw - F.load) / perDay;
  }

  var AquaFilter = {
    CFG: CFG, STATES: STATES, NEXT: NEXT,
    volumeL: volumeL, defaultFlow: defaultFlow, maxFlow: maxFlow, resistance: resistance,
    create: create, step: step, removalPerMin: removalPerMin, capture: capture, feed: feed,
    setEnabled: setEnabled, setPump: setPump, setFlow: setFlow, clean: clean,
    condition: condition, nextInspection: nextInspection, flowing: flowing, note: note
  };
  root.AquaFilter = AquaFilter;
  if (typeof module !== 'undefined' && module.exports) module.exports = AquaFilter;
})(typeof window !== 'undefined' ? window : globalThis);
