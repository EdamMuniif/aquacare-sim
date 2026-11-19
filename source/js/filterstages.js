/*
 * AquaCare digital prototype - filter stages and tank nitrogen model (team-confirmed design; values to confirm by measurement)
 * ---------------------------------------------------------------------------------------------------------------
 * SIMULATION ONLY. Tracks what the four existing sensors do not: ammonia, nitrite, nitrate, dissolved oxygen,
 * dissolved organics, water level, biological maturity and activated-carbon capacity.
 *
 * Every constant in CFG is an illustrative demo assumption, to confirm by measurement. None comes from the four
 * reviewed papers, and none is a fish-safe limit. No alert limit exists for these values: they read "Not configured".
 *
 * Scope of each stage:
 *   Mechanical  captures uneaten food (the sponge pool). Turbidity and clogging stay in filter.js.
 *   Biological  ammonia -> nitrite -> nitrate. Limited by maturity, oxygen, flow and substrate. Never instant.
 *   Chemical    optional carbon adsorbs dissolved organics only. Never ammonia, nitrite, nitrate or TDS.
 * pH, temperature and TDS are never changed here.
 *
 * Deterministic: no random numbers, so seeded runs and the run journal replay exactly.
 */
(function (root) {
  'use strict';

  var CFG = {
    // nitrogen sources, mg N
    fishTanPerDay: 1.5,      // steady excretion by the demo stock
    feedTan: 1.0,            // eaten part of one feed, released gradually through the waste pool
    feedUneaten: 0.3,        // uneaten part of one feed
    wastePerHour: 0.25,      // waste pool -> ammonia, share per hour
    foodPerDay: 0.5,         // uneaten food -> ammonia, share per day
    captureEff: 0.5,         // single-pass capture of uneaten food by the sponge
    // biological stage
    bioSeed: 0.02,           // maturity of new media (0..1)
    aobMaxPerDay: 40,        // mg N/day ammonia oxidised by fully mature media
    nobMaxPerDay: 40,        // mg N/day nitrite oxidised by fully mature media
    ks: 0.5,                 // half-saturation for ammonia and nitrite, mg/L
    koDo: 2,                 // half-saturation for dissolved oxygen, mg/L
    aobGrowthPerDay: 0.6,    // ammonia oxidisers grow first
    nobGrowthPerDay: 0.4,    // nitrite oxidisers lag, which produces the nitrite peak
    bioDecayPerDay: 0.05,    // die-back while no water flows through the media
    fullFlowTurnover: 2,     // tank volumes/h at which flow no longer limits the media
    // dissolved oxygen, mg/L
    doSatAt26: 8.1,          // saturation at 26 degC
    doSatPerDeg: 0.17,       // change in saturation per degC
    doSurfacePerHour: 0.15,  // surface exchange with no circulation
    doFlowPerHour: 0.6,      // extra exchange at the return, at doFullTurnover
    doFullTurnover: 5,       // tank volumes/h
    doRespPerHour: 0.25,     // fish and tank respiration
    doPerN: 4.57,            // mg O2 per mg N fully nitrified (stoichiometric)
    // dissolved organics, mg/L
    docPerDay: 0.5,          // background source, mg/day
    docPerFoodN: 2,          // mg organics released per mg N of food that decays
    docDecayPerDay: 0.05,    // slow natural breakdown
    // chemical stage
    carbonCapacityMg: 150,   // adsorption capacity of one charge
    carbonEff: 0.3,          // single-pass adsorption by fresh carbon
    carbonLowPct: 15,        // replacement alert below this remaining capacity
    historyEveryMin: 60,
    historyMax: 1440
  };

  function create(cfg, t) {
    cfg = cfg || {};
    return {
      t: t, tan: 0.02, no2: 0.01, no3: 2, doMg: CFG.doSatAt26 - 1, doc: 2,
      waste: 0, food: 0, spongeFood: 0, level: 100,
      aob: CFG.bioSeed, nob: CFG.bioSeed,
      carbonOn: !!cfg.carbon, carbonUsed: 0, carbonLowFlag: false, lastCarbon: null,
      nextHist: t, hist: [],
      nIn: 0                 // cumulative nitrogen added, mg (used by the mass-balance check)
    };
  }

  function doSat(tempC) { return Math.max(0, CFG.doSatAt26 - CFG.doSatPerDeg * (tempC - 26)); }
  function carbonLeftPct(W) { return Math.max(0, 100 * (1 - W.carbonUsed / CFG.carbonCapacityMg)); }
  function carbonLow(W) { return W.carbonOn && carbonLeftPct(W) < CFG.carbonLowPct; }
  function bioPct(W) { return Math.round(100 * Math.min(W.aob, W.nob)); }
  function nitrogenMg(W, V) { return (W.tan + W.no2 + W.no3) * V + W.waste + W.food + W.spongeFood; }

  // One step of at most a few minutes. flow is the circulating flow in L/h (0 when too little water moves).
  function advance(W, h, env, out) {
    var V = env.V, turnover = V > 0 ? env.flow / V : 0, flowing = turnover > 0;
    var day = h / 1440, hour = h / 60;

    // sources
    var fish = CFG.fishTanPerDay * day; W.nIn += fish;
    var fromWaste = W.waste * (1 - Math.exp(-CFG.wastePerHour * hour));
    var foodShare = 1 - Math.exp(-CFG.foodPerDay * day);
    var fromFood = W.food * foodShare, fromSponge = W.spongeFood * foodShare;
    W.waste -= fromWaste; W.food -= fromFood; W.spongeFood -= fromSponge;
    W.tan += (fish + fromWaste + fromFood + fromSponge) / V;
    W.doc += (CFG.docPerDay * day + (fromFood + fromSponge) * CFG.docPerFoodN) / V;
    W.doc *= Math.exp(-CFG.docDecayPerDay * day);

    // mechanical stage: uneaten food moves to the sponge, where it still decays until the sponge is rinsed
    if (flowing && W.food > 0) {
      var caught = W.food * (1 - Math.exp(-turnover * CFG.captureEff * hour));
      W.food -= caught; W.spongeFood += caught;
    }

    // biological stage: only while water flows through the media
    var used = 0;
    if (flowing) {
      var fDo = W.doMg / (W.doMg + CFG.koDo), fFlow = Math.min(1, turnover / CFG.fullFlowTurnover);
      var sA = W.tan / (CFG.ks + W.tan), sN = W.no2 / (CFG.ks + W.no2);
      var a = Math.min(W.tan * V, CFG.aobMaxPerDay * W.aob * fDo * fFlow * sA * day);
      W.tan -= a / V; W.no2 += a / V;
      var n = Math.min(W.no2 * V, CFG.nobMaxPerDay * W.nob * fDo * fFlow * sN * day);
      W.no2 -= n / V; W.no3 += n / V;
      used = (a + n) * CFG.doPerN / 2 / V;
      W.aob = Math.min(1, W.aob + CFG.aobGrowthPerDay * W.aob * (1 - W.aob) * fDo * fFlow * sA * day);
      W.nob = Math.min(1, W.nob + CFG.nobGrowthPerDay * W.nob * (1 - W.nob) * fDo * fFlow * sN * day);
    } else {
      var keep = Math.exp(-CFG.bioDecayPerDay * day);
      W.aob = Math.max(CFG.bioSeed, W.aob * keep);
      W.nob = Math.max(CFG.bioSeed, W.nob * keep);
    }

    // chemical stage: adsorbs dissolved organics, and capacity runs out
    if (flowing && W.carbonOn) {
      var left = carbonLeftPct(W) / 100;
      var ads = Math.min(W.doc * V, W.doc * V * (1 - Math.exp(-turnover * CFG.carbonEff * left * hour)), CFG.carbonCapacityMg - W.carbonUsed);
      if (ads > 0) { W.doc -= ads / V; W.carbonUsed += ads; }
    }

    // dissolved oxygen
    var sat = doSat(env.tempC);
    var kLa = CFG.doSurfacePerHour + CFG.doFlowPerHour * Math.min(1, turnover / CFG.doFullTurnover);
    W.doMg += (sat - W.doMg) * (1 - Math.exp(-kLa * hour)) - CFG.doRespPerHour * hour - used;
    W.doMg = Math.max(0, Math.min(sat, W.doMg));

    var low = carbonLow(W);
    if (low !== W.carbonLowFlag) { W.carbonLowFlag = low; out.push({ type: 'carbonLow', on: low }); }
  }

  // Advance dtMin simulated minutes. env: { flow (L/h), V (L), tempC, t }. Returns events.
  function step(W, dtMin, env) {
    var out = [], left = dtMin;
    while (left > 1e-9) { var h = Math.min(left, 5); advance(W, h, env, out); left -= h; }
    W.t = env.t;
    if (env.t >= W.nextHist) {
      W.hist.push({ t: env.t, tan: W.tan, no2: W.no2, no3: W.no3, doMg: W.doMg, doc: W.doc, flow: env.flow, bio: bioPct(W), carbon: carbonLeftPct(W) });
      if (W.hist.length > CFG.historyMax) W.hist.shift();
      W.nextHist = env.t + CFG.historyEveryMin * 60000;
    }
    return out;
  }

  function feed(W) { W.waste += CFG.feedTan; W.food += CFG.feedUneaten; W.nIn += CFG.feedTan + CFG.feedUneaten; }
  // Rinsing removes what the sponge trapped. It never touches the biological media or the water.
  function rinseSponge(W, V) { W.nIn -= W.spongeFood; W.spongeFood = 0; return V; }
  function setCarbon(W, on) { W.carbonOn = !!on; var low = carbonLow(W), out = []; if (low !== W.carbonLowFlag) { W.carbonLowFlag = low; out.push({ type: 'carbonLow', on: low }); } return out; }
  function replaceCarbon(W, t) { W.carbonUsed = 0; W.lastCarbon = t; var out = []; if (W.carbonLowFlag) { W.carbonLowFlag = false; out.push({ type: 'carbonLow', on: false }); } return out; }
  function setLevel(W, pct) { W.level = Math.max(0, Math.min(100, +pct || 0)); }

  var AquaFilterStages = {
    CFG: CFG, create: create, step: step, feed: feed, rinseSponge: rinseSponge,
    setCarbon: setCarbon, replaceCarbon: replaceCarbon, setLevel: setLevel,
    doSat: doSat, carbonLeftPct: carbonLeftPct, carbonLow: carbonLow, bioPct: bioPct, nitrogenMg: nitrogenMg
  };
  root.AquaFilterStages = AquaFilterStages;
  if (typeof module !== 'undefined' && module.exports) module.exports = AquaFilterStages;
})(typeof window !== 'undefined' ? window : globalThis);
