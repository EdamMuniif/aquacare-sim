/*
 * AquaCare Real-Life Aquarium Research Simulation - environmental model
 * ---------------------------------------------------------------------
 * SIMULATION / DEMO DATA. Separate from the AquaCare v5 Project 1 demonstration: this file is not loaded by
 * the v5 page and v5 code never calls it. No model output here has been validated against a real aquarium.
 *
 * Every value belongs to one class, and the classes are never mixed:
 *   published     from a cited document (see source IDs, AQUACARE-RESEARCH-SOURCE-REGISTER.md)
 *   calculated    follows from conservation laws, molar masses or physical constants
 *   illustrative  a stand-in with no defensible source yet; do not report as a finding
 *   user          an operating condition the user chooses
 *
 * The environment is deterministic and uses no random numbers. Virtual sensors have their own seeded generator,
 * so sensor noise can never change the water.
 */
(function (root) {
  'use strict';

  var Filt = root.AquaFilter || (typeof require === 'function' ? require('../js/filter.js') : null);
  var Stages = root.AquaFilterStages || (typeof require === 'function' ? require('../js/filterstages.js') : null);
  var SC = Stages.CFG;      // existing illustrative biofilter and oxygen constants are reused, not duplicated

  function p(key, value, unit, cls, source, note) { return { key: key, value: value, unit: unit, cls: cls, source: source || '', note: note || '' }; }

  var PARAMS = [
    // operating conditions
    p('volumeL', 18.9, 'L', 'user', '', '5 US gal nominal'),
    p('ambientC', 24, '°C', 'user', '', 'Room air temperature'),
    p('heaterW', 50, 'W', 'user', '', 'Heater electrical power'),
    p('setpointC', 26, '°C', 'user', '', 'Heater thermostat setpoint'),
    p('pH', 7.0, 'pH', 'user', '', 'Held constant: carbonate chemistry is not modelled'),
    p('tdsPpm', 230, 'ppm', 'user', '', 'Changes only through water changes'),
    p('sourceTempC', 25, '°C', 'user', '', 'Replacement water temperature'),
    p('sourceTdsPpm', 150, 'ppm', 'user', '', 'Replacement water TDS'),
    p('feedMg', 30, 'mg dry', 'user', '', 'Dry food per feed'),
    // physical constants
    p('cpJ', 4186, 'J/(kg·K)', 'calculated', '', 'Specific heat of water'),
    p('rhoKgL', 1.0, 'kg/L', 'calculated', '', 'Water density, rounded'),
    p('o2PerNAmmonia', 48 / 14, 'mg O₂/mg N', 'calculated', '', 'NH₄⁺ to NO₂⁻, molar masses (1.5 O₂ per N), biomass ignored'),
    p('o2PerNNitrite', 16 / 14, 'mg O₂/mg N', 'calculated', '', 'NO₂⁻ to NO₃⁻, molar masses (0.5 O₂ per N), biomass ignored'),
    // published
    p('nitrifPerCDoLimited', 0.01108, 'per °C', 'published', 'R6', 'Rate change at 20 °C when oxygen limits. Extrapolated above 20 °C'),
    p('nitrifPerCTanLimited', 0.04275, 'per °C', 'published', 'R6', 'Rate change at 20 °C when ammonia limits. Extrapolated above 20 °C'),
    // illustrative: heat
    p('uaWK', 1.0, 'W/K', 'illustrative', '', 'Tank heat-loss coefficient. Must be measured on a real tank'),
    p('heaterBandC', 0.25, '°C', 'illustrative', '', 'Thermostat switching band, each side of setpoint'),
    // illustrative: gas exchange
    p('kLaSurface', SC.doSurfacePerHour, '1/h', 'illustrative', '', 'Still-surface oxygen transfer. Measure with ASCE/EWRI 2-22 (R10)'),
    p('kLaFlow', SC.doFlowPerHour, '1/h', 'illustrative', '', 'Extra transfer from the filter return at full turnover'),
    p('kLaTurnover', SC.doFullTurnover, 'volumes/h', 'illustrative', '', 'Turnover giving full return-flow transfer'),
    p('fishO2MgH', 0.5, 'mg O₂/h per fish', 'illustrative', '', 'Species and size dependent. No source yet'),
    p('fishCount', 6, 'fish', 'user', '', 'Number of fish'),
    // illustrative: feed and waste
    p('feedNFrac', 0.07, 'mg N/mg', 'illustrative', '', 'Nitrogen content of dry food'),
    p('uneatenFrac', 0.10, 'share', 'illustrative', '', 'Share of each feed left uneaten'),
    p('excretedFrac', 0.50, 'share', 'illustrative', '', 'Share of eaten nitrogen excreted as ammonia'),
    p('fecesFrac', 0.25, 'share', 'illustrative', '', 'Share of eaten nitrogen leaving as solid waste'),
    p('fishTanMgDay', SC.fishTanPerDay, 'mg N/day', 'illustrative', '', 'Steady excretion by the stock between feeds'),
    p('settlePerH', 0.5, '1/h', 'illustrative', '', 'Suspended solids settling to the gravel'),
    p('decayPerDay', 0.2, '1/day', 'illustrative', '', 'Breakdown of organic solids to ammonia'),
    p('bodMgMg', 1.0, 'mg O₂/mg', 'illustrative', '', 'Oxygen used per mg of solids broken down'),
    p('ntuPerMgL', 1.0, 'NTU per mg/L', 'illustrative', '', 'Suspended solids to turbidity. Depends on the particles'),
    p('baseNtu', 2, 'NTU', 'illustrative', '', 'Turbidity of clear tank water'),
    // illustrative: biofilter (reused from filterstages.js)
    p('aobMaxMgDay', SC.aobMaxPerDay, 'mg N/day at 20 °C', 'illustrative', '', 'Depends on the media. Reused from filterstages.js'),
    p('nobMaxMgDay', SC.nobMaxPerDay, 'mg N/day at 20 °C', 'illustrative', '', 'Depends on the media. Reused from filterstages.js'),
    p('ksMgL', SC.ks, 'mg/L', 'illustrative', '', 'Half-saturation, ammonia and nitrite'),
    p('koMgL', SC.koDo, 'mg/L', 'illustrative', '', 'Half-saturation, oxygen'),
    p('aobGrowthDay', SC.aobGrowthPerDay, '1/day', 'illustrative', '', 'Biofilm development'),
    p('nobGrowthDay', SC.nobGrowthPerDay, '1/day', 'illustrative', '', 'Biofilm development'),
    p('bioDecayDay', SC.bioDecayPerDay, '1/day', 'illustrative', '', 'Biofilm decline with no flow')
  ];

  // Virtual sensor limits. accuracy is the manufacturer's published bound.
  var SENSORS = {
    temp: { label: 'DS18B20 temperature', unit: '°C', dp: 2, accuracy: 0.5, resolution: 0.0625, range: [-55, 125], noise: 0.02, driftDay: 0.02, source: 'M4' },
    ph: { label: 'SEN0161 pH', unit: 'pH', dp: 2, accuracy: 0.1, resolution: 0.01, range: [0, 14], noise: 0.01, driftDay: 0.05, source: 'M1' },
    tds: { label: 'SEN0244 TDS', unit: 'ppm', dp: 0, accuracy: 100, resolution: 1, range: [0, 1000], noise: 2, driftDay: 3, source: 'M2' },
    turb: { label: 'SEN0189 turbidity', unit: 'NTU', dp: 1, accuracy: null, resolution: 0.1, range: [0, 3000], noise: 0.6, driftDay: 0.5, source: 'M3', uncalibrated: true }
  };

  var DEFAULT_FEEDS = [8 * 60, 13 * 60, 18 * 60];   // minutes after midnight

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // Published: Benson and Krause, as given in USGS OWQ Technical Memorandum 2011.03, eq. 7 (R1, R2).
  // Freshwater at one atmosphere, mg/L.
  function doSaturation(tC) {
    var T = tC + 273.15;
    return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / (T * T) + 1.2438e10 / (T * T * T) - 8.621949e11 / (T * T * T * T));
  }
  // Published: Emerson et al. 1975, as given in EPA-822-R-13-001 (R3, R9). Zero salinity, 0-50 °C.
  function nh3Fraction(tC, pH) {
    var pKa = 0.09018 + 2729.92 / (273.2 + tC);
    return 1 / (Math.pow(10, pKa - pH) + 1);
  }

  function create(opts) {
    opts = opts || {};
    var P = {};
    PARAMS.forEach(function (x) { P[x.key] = x.value; });
    Object.keys(opts.params || {}).forEach(function (k) { if (k in P) P[k] = opts.params[k]; });
    var mature = opts.start === 'new' ? SC.bioSeed : 0.9, seed = opts.seed || 20261122, rng = mulberry32(seed);
    var S = {
      P: P, seed: seed, minute: 0, power: 'on', heaterEnabled: true, heaterOn: false, autoFeed: opts.autoFeed !== false, feeds: DEFAULT_FEEDS.slice(),
      lastFeedDay: {}, feedCount: 0,
      tempC: opts.tempC == null ? P.setpointC : opts.tempC, doMg: doSaturation(P.setpointC) - 1,
      tan: 0.05, no2: 0.02, no3: 5, tssMgL: 0, detritusMg: 50, spongeMg: 0,
      aob: mature, nob: mature, pH: P.pH, tds: P.tdsPpm,
      nIn: 0, nOut: 0, nFish: 0,
      filter: Filt.create({ enabled: opts.filter !== false, flowLph: null, mode: 'auto' }, P.volumeL, 0),
      rng: rng, sensors: {}, hist: [], nextHist: 0, events: []
    };
    S.n0 = totalNitrogen(S);
    Object.keys(SENSORS).forEach(function (k) {
      var d = SENSORS[k];
      // One fixed error per run, anywhere inside the published bound. The distribution is an illustrative choice.
      var bias = d.accuracy == null ? 0 : (rng() * 2 - 1) * d.accuracy;
      S.sensors[k] = { status: 'ok', bias: bias, drift: 0, value: null, held: null };
    });
    readSensors(S);
    record(S);
    return S;
  }

  function totalNitrogen(S) {
    var P = S.P;
    return (S.tan + S.no2 + S.no3 + S.tssMgL * P.feedNFrac) * P.volumeL + (S.detritusMg + S.spongeMg) * P.feedNFrac;
  }
  // Nitrogen in the tank plus what left it, minus what entered. Must stay at zero.
  function nitrogenError(S) { return totalNitrogen(S) + S.nOut + S.nFish - S.n0 - S.nIn; }
  function turbidityNtu(S) { return S.P.baseNtu + S.tssMgL * S.P.ntuPerMgL; }

  function log(S, text) { S.events.unshift({ minute: S.minute, text: text }); if (S.events.length > 60) S.events.length = 60; }

  // ---------- actions ----------
  function feed(S) {
    var P = S.P, mg = P.feedMg, uneaten = mg * P.uneatenFrac, eatenN = (mg - uneaten) * P.feedNFrac;
    var excreted = eatenN * P.excretedFrac, fecesN = eatenN * P.fecesFrac;
    S.nIn += mg * P.feedNFrac;
    S.nFish += eatenN - excreted - fecesN;
    S.tan += excreted / P.volumeL;
    S.tssMgL += (uneaten + fecesN / P.feedNFrac) / P.volumeL;
    S.feedCount++;
    log(S, 'Feed: ' + mg + ' mg dry food');
  }
  // Instant exchange of a share of the water. The biofilter, sponge and gravel stay in place.
  function waterChange(S, share) {
    var f = clamp(share, 0, 1), P = S.P, V = P.volumeL;
    S.nOut += f * V * (S.tan + S.no2 + S.no3 + S.tssMgL * P.feedNFrac);
    S.tan *= 1 - f; S.no2 *= 1 - f; S.no3 *= 1 - f; S.tssMgL *= 1 - f;
    S.tempC += f * (P.sourceTempC - S.tempC);
    S.doMg += f * (doSaturation(P.sourceTempC) - S.doMg);
    S.tds += f * (P.sourceTdsPpm - S.tds);
    log(S, 'Water change: ' + Math.round(f * 100) + ' %');
  }
  function siphon(S, share) {
    var f = clamp(share, 0, 1), out = S.detritusMg * f;
    S.detritusMg -= out; S.nOut += out * S.P.feedNFrac;
    log(S, 'Gravel siphoned: ' + Math.round(f * 100) + ' % of settled waste');
  }
  // Removes trapped solids and restores flow. Water and biofilm are untouched.
  function cleanSponge(S) {
    S.nOut += S.spongeMg * S.P.feedNFrac; S.spongeMg = 0;
    Filt.clean(S.filter, S.minute * 60000, S.power === 'on');
    log(S, 'Sponge rinsed');
  }
  function setPump(S, on) { Filt.setPump(S.filter, on, S.minute * 60000); log(S, on ? 'Pump started' : 'Pump stopped'); }
  function setPower(S, on) { S.power = on ? 'on' : 'off'; log(S, on ? 'Power restored' : 'Power cut'); }
  function setHeater(S, on) { S.heaterEnabled = !!on; log(S, on ? 'Heater enabled' : 'Heater disabled'); }
  function setSensor(S, key, status) {
    var s = S.sensors[key]; if (!s) return;
    s.status = status; s.held = s.value; if (status === 'ok') s.drift = 0;
    log(S, SENSORS[key].label + ': ' + status);
  }

  // ---------- one simulated minute ----------
  function step(S) {
    var P = S.P, V = P.volumeL, dtH = 1 / 60, dtD = 1 / 1440;
    S.minute++;
    var day = Math.floor(S.minute / 1440), tod = S.minute % 1440;
    if (S.autoFeed) S.feeds.forEach(function (m) { var k = day + ':' + m; if (tod === m && !S.lastFeedDay[k]) { S.lastFeedDay[k] = 1; feed(S); } });

    // pump and sponge: reuses the existing AquaCare controller
    var F = S.filter, turb = S.sensors.turb;
    Filt.step(F, 1, { power: S.power, V: V, t: S.minute * 60000, turbNtu: turb.value, turbStatus: turb.status });
    var Q = Filt.processing(F, V) ? F.flow : 0, turnover = Q / V;

    // temperature: lumped energy balance
    if (S.power !== 'on' || !S.heaterEnabled) S.heaterOn = false;
    else if (S.tempC < P.setpointC - P.heaterBandC) S.heaterOn = true;
    else if (S.tempC > P.setpointC + P.heaterBandC) S.heaterOn = false;
    S.tempC += ((S.heaterOn ? P.heaterW : 0) - P.uaWK * (S.tempC - P.ambientC)) * 60 / (P.rhoKgL * V * P.cpJ);

    // solids: suspended -> settled or trapped -> ammonia
    var tssMg = S.tssMgL * V;
    var settled = tssMg * (1 - Math.exp(-P.settlePerH * dtH));
    var trapped = (tssMg - settled) * (1 - Math.exp(-turnover * Filt.CFG.capture * dtH));
    tssMg -= settled + trapped;
    S.detritusMg += settled; S.spongeMg += trapped;
    if (trapped > 0) Filt.capture(F, trapped * P.ntuPerMgL);
    var share = 1 - Math.exp(-P.decayPerDay * dtD);
    var dA = tssMg * share, dB = S.detritusMg * share, dC = S.spongeMg * share, decayed = dA + dB + dC;
    tssMg -= dA; S.detritusMg -= dB; S.spongeMg -= dC;
    S.tssMgL = tssMg / V;
    var fishN = P.fishTanMgDay * dtD;
    S.nIn += fishN;
    S.tan += (decayed * P.feedNFrac + fishN) / V;

    // biofilter
    var fDo = S.doMg / (S.doMg + P.koMgL), used = 0;
    if (Q > 0) {
      var fFlow = Math.min(1, turnover / SC.fullFlowTurnover);
      var sA = S.tan / (P.ksMgL + S.tan), sN = S.no2 / (P.ksMgL + S.no2);
      var tA = Math.max(0, 1 + (fDo < sA ? P.nitrifPerCDoLimited : P.nitrifPerCTanLimited) * (S.tempC - 20));
      var tN = Math.max(0, 1 + (fDo < sN ? P.nitrifPerCDoLimited : P.nitrifPerCTanLimited) * (S.tempC - 20));
      var a = Math.min(S.tan * V, P.aobMaxMgDay * S.aob * fDo * fFlow * sA * tA * dtD);
      S.tan -= a / V; S.no2 += a / V;
      var n = Math.min(S.no2 * V, P.nobMaxMgDay * S.nob * fDo * fFlow * sN * tN * dtD);
      S.no2 -= n / V; S.no3 += n / V;
      used = (a * P.o2PerNAmmonia + n * P.o2PerNNitrite) / V;
      S.aob = Math.min(1, S.aob + P.aobGrowthDay * S.aob * (1 - S.aob) * fDo * fFlow * sA * dtD);
      S.nob = Math.min(1, S.nob + P.nobGrowthDay * S.nob * (1 - S.nob) * fDo * fFlow * sN * dtD);
    } else {
      var keep = Math.exp(-P.bioDecayDay * dtD);
      S.aob = Math.max(SC.bioSeed, S.aob * keep); S.nob = Math.max(SC.bioSeed, S.nob * keep);
    }

    // dissolved oxygen: gas exchange minus biological demand
    var sat = doSaturation(S.tempC), kLa = P.kLaSurface + P.kLaFlow * Math.min(1, turnover / P.kLaTurnover);
    S.doMg += (sat - S.doMg) * (1 - Math.exp(-kLa * dtH)) - (P.fishO2MgH * P.fishCount * dtH + decayed * P.bodMgMg) / V - used;
    S.doMg = Math.max(0, S.doMg);

    readSensors(S);
    if (S.minute >= S.nextHist) record(S);
  }
  function advance(S, minutes) { for (var i = 0; i < minutes; i++) step(S); }

  // ---------- virtual sensors: readings derive from the water, never the reverse ----------
  function truth(S, k) { return k === 'temp' ? S.tempC : k === 'ph' ? S.pH : k === 'tds' ? S.tds : turbidityNtu(S); }
  function readSensors(S) {
    Object.keys(SENSORS).forEach(function (k) {
      var d = SENSORS[k], s = S.sensors[k], noise = (S.rng() + S.rng() + S.rng() - 1.5) * 2 * d.noise;
      if (s.status === 'drift') s.drift += d.driftDay / 1440;
      if (S.power !== 'on' || s.status === 'disconnected') { s.value = null; return; }
      if (s.status === 'stuck') { s.value = s.held; return; }
      // A healthy sensor stays inside its published accuracy bound. Only a drift fault can take it outside.
      var err = d.accuracy == null ? s.bias + noise : clamp(s.bias + noise, -d.accuracy, d.accuracy);
      var v = clamp(truth(S, k) + err + s.drift, d.range[0], d.range[1]);
      s.value = Math.round(v / d.resolution) * d.resolution;
    });
  }

  function snapshot(S) {
    var P = S.P, f = nh3Fraction(S.tempC, S.pH), sat = doSaturation(S.tempC);
    return {
      calculated: {
        tempC: S.tempC, doMg: S.doMg, doSat: sat, doPct: 100 * S.doMg / sat, tan: S.tan, nh3: S.tan * f, nh3Pct: f * 100, no2: S.no2, no3: S.no3,
        tssMgL: S.tssMgL, turbNtu: turbidityNtu(S), detritusMg: S.detritusMg, spongeMg: S.spongeMg, pH: S.pH, tds: S.tds,
        bioPct: 100 * Math.min(S.aob, S.nob), flowLph: S.filter.flow
      },
      virtual: Object.keys(SENSORS).reduce(function (o, k) { o[k] = { value: S.sensors[k].value, status: S.sensors[k].status, uncalibrated: !!SENSORS[k].uncalibrated }; return o; }, {}),
      measured: null,
      volumeL: P.volumeL
    };
  }
  function record(S) {
    var c = snapshot(S).calculated;
    S.hist.push({ minute: S.minute, tempC: c.tempC, doMg: c.doMg, tan: c.tan, no2: c.no2, no3: c.no3, turbNtu: c.turbNtu, flowLph: c.flowLph });
    if (S.hist.length > 1440) S.hist.shift();
    S.nextHist = S.minute + 60;
  }

  // Maps the simulated state onto the existing 3D aquarium. Algae and fish behaviour are not modelled, so they stay neutral.
  function toTank3D(S) {
    var c = snapshot(S).calculated, F = S.filter, v = S.sensors, on = S.power === 'on';
    var txt = function (k, dp) { return v[k].value == null ? '--' : v[k].value.toFixed(dp); };
    var hh = ('0' + Math.floor(S.minute % 1440 / 60)).slice(-2) + ':' + ('0' + S.minute % 60).slice(-2);
    return {
      power: S.power, led: on ? 'ok' : 'off', buzzer: false,
      lcd: on ? ['pH ' + txt('ph', 2) + ' ' + txt('temp', 1) + 'C', 'RESEARCH SIM', hh, txt('temp', 1), txt('ph', 2), txt('tds', 0), txt('turb', 0), 'DAY ' + (Math.floor(S.minute / 1440) + 1)] : ['', ''],
      turb: c.turbNtu, heater: S.heaterOn, bubbles: false,
      probes: { ph: v.ph.status === 'ok' ? 'ok' : 'fault', temp: v.temp.status === 'ok' ? 'ok' : 'fault', tds: v.tds.status === 'ok' ? 'ok' : 'fault', turb: v.turb.status === 'ok' ? 'ok' : 'fault' },
      upkeep: { glass: 0, decor: 0, probes: 0, detritus: clamp(S.detritusMg / 300, 0, 1) },
      filter: { enabled: F.enabled, state: F.state, flow: F.flow, flowSet: F.flowSet, flowMax: Filt.maxFlow(S.P.volumeL), load: F.load, bio: Math.round(c.bioPct), carbonOn: false, carbonLeft: 100 }
    };
  }

  var Model = {
    PARAMS: PARAMS, SENSORS: SENSORS, create: create, step: step, advance: advance, snapshot: snapshot, toTank3D: toTank3D,
    feed: feed, waterChange: waterChange, siphon: siphon, cleanSponge: cleanSponge, setPump: setPump, setPower: setPower, setHeater: setHeater, setSensor: setSensor,
    doSaturation: doSaturation, nh3Fraction: nh3Fraction, nitrogenError: nitrogenError, turbidityNtu: turbidityNtu
  };
  root.AquaResearchModel = Model;
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
})(typeof window !== 'undefined' ? window : globalThis);
