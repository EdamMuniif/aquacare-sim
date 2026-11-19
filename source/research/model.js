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
    p('feedMgPerFish', 5, 'mg dry per fish', 'user', '', 'Dry food per fish at each feed. Each feed is this times the fish count (30 mg for 6 fish)'),
    p('alkMeqL', 2.0, 'meq/L', 'user', '', 'Starting alkalinity (100 mg/L as CaCO₃). Measure with a KH test'),
    p('sourceAlkMeqL', 2.0, 'meq/L', 'user', '', 'Replacement water alkalinity. Measure with a KH test'),
    p('pco2Atm', 0.00042, 'atm', 'user', '', 'CO₂ in room air. Occupied rooms are often higher'),
    // physical constants
    p('cpJ', 4186, 'J/(kg·K)', 'calculated', '', 'Specific heat of water'),
    p('latentHeatJkg', 2.44e6, 'J/kg', 'calculated', '', 'Latent heat of evaporation of water near 25 °C, rounded. Used only when evaporation is on'),
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
    p('fishTanMgDayPerFish', SC.fishTanPerDay / 6, 'mg N/day per fish', 'illustrative', '', 'Steady excretion per fish between feeds: the demo stock value in filterstages.js shared over 6 fish. Scales with the fish count'),
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
    p('bioDecayDay', SC.bioDecayPerDay, '1/day', 'illustrative', '', 'Biofilm decline with no flow'),
    // illustrative: realism modules
    p('rqCo2', 1.0, 'mol CO₂/mol O₂', 'illustrative', '', 'CO₂ released per oxygen used by fish and decay'),
    p('kLaCo2Ratio', 0.9, 'ratio', 'illustrative', '', 'CO₂ transfer rate relative to oxygen transfer'),
    p('evapLDay', 0.08, 'L/day', 'illustrative', '', 'Depends on room air, lid and surface area. Measure from the water-level drop')
  ];

  // Virtual sensor limits. accuracy is the manufacturer's published bound.
  var SENSORS = {
    temp: { label: 'DS18B20 temperature', unit: '°C', dp: 2, accuracy: 0.5, resolution: 0.0625, range: [-55, 125], noise: 0.02, driftDay: 0.02, source: 'M4' },
    ph: { label: 'SEN0161 pH', unit: 'pH', dp: 2, accuracy: 0.1, resolution: 0.01, range: [0, 14], noise: 0.01, driftDay: 0.05, source: 'M1' },
    tds: { label: 'SEN0244 TDS', unit: 'ppm', dp: 0, accuracy: 100, resolution: 1, range: [0, 1000], noise: 2, driftDay: 3, source: 'M2' },
    turb: { label: 'SEN0189 turbidity', unit: 'NTU', dp: 1, accuracy: null, resolution: 0.1, range: [0, 3000], noise: 0.6, driftDay: 0.5, source: 'M3', uncalibrated: true }
  };

  var DEFAULT_FEEDS = [8 * 60, 13 * 60, 18 * 60];   // minutes after midnight
  var ESTABLISHED_MATURITY = 0.9;

  // Values the model uses that are set in code rather than in PARAMS. Read live, so the page always shows what runs.
  var HIDDEN_PARAMS = [
    p('filterCapture', Filt.CFG.capture, 'share per pass', 'illustrative', '', 'Solids caught per pass through the sponge. Set in filter.js'),
    p('spongeResistanceK', Filt.CFG.resK, '-', 'illustrative', '', 'Flow resistance = 1 + K × load³. Set in filter.js'),
    p('spongeLoadPerDay', Filt.CFG.loadPerDay, 'load/day', 'illustrative', '', 'Background clogging at full flow. Set in filter.js'),
    p('spongeLoadPerNtuL', Filt.CFG.loadPerNtuL, 'load per NTU·L', 'illustrative', '', 'Clogging per amount of solids trapped. Set in filter.js'),
    p('minTurnover', Filt.CFG.minTurnover, 'volumes/h', 'illustrative', '', 'Below this flow the filter stages do not process water. Set in filter.js'),
    p('warnFlowShare', Filt.CFG.warnFlow, 'share of set flow', 'illustrative', '', 'Clean-sponge warning below this flow. Set in filter.js'),
    p('stopFlowShare', Filt.CFG.faultFlow, 'share of set flow', 'illustrative', '', 'Protective pump stop below this flow. Set in filter.js'),
    p('newFilterMaturity', SC.bioSeed, 'share', 'illustrative', '', 'Starting bacteria in a new filter. Set in filterstages.js'),
    p('establishedMaturity', ESTABLISHED_MATURITY, 'share', 'illustrative', '', 'Starting bacteria in an established filter. Set in model.js'),
    p('fullFlowTurnover', SC.fullFlowTurnover, 'volumes/h', 'illustrative', '', 'Flow at which bacteria are no longer flow-limited. Set in filterstages.js'),
    p('startState', 'TAN 0.05, nitrite 0.02, nitrate 5 mg N/L; 50 mg settled waste; oxygen 1 mg/L below saturation', '', 'illustrative', '', 'Water condition at the start of every run. Set in model.js'),
    p('sourceWaterN', 0, 'mg N/L', 'illustrative', '', 'Replacement water is assumed to carry no nitrogen. Set in model.js')
  ];

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

  // Published: USGS PHREEQC database phreeqc.dat analytic expressions (R11). log10 K = A1 + A2 T + A3/T + A4 log10 T + A5/T^2 + A6 T^2.
  var LOGK = {
    co3h: [107.8871, 0.03252849, -5151.79, -38.92561, 563713.9, 0],                 // CO3-2 + H+ = HCO3-
    co32h: [464.1965, 0.09344813, -26986.16, -165.75951, 2248628.9, 0],             // CO3-2 + 2H+ = CO2 + H2O
    henry: [10.5624, -2.3547e-2, -3972.8, 0, 5.8746e5, 1.9194e-5],                  // CO2(g) = CO2
    water: [293.29227, 0.1360833, -10576.913, -123.73158, 0, -6.996455e-5]          // H2O = OH- + H+
  };
  function logK(c, T) { return c[0] + c[1] * T + c[2] / T + c[3] * Math.log10(T) + c[4] / (T * T) + c[5] * T * T; }
  // Activity corrections are ignored, which is a simplification for low-salt fresh water.
  function carbonateK(tC) {
    var T = tC + 273.15, a = logK(LOGK.co3h, T), b = logK(LOGK.co32h, T);
    return { K1: Math.pow(10, a - b), K2: Math.pow(10, -a), KH: Math.pow(10, logK(LOGK.henry, T)), Kw: Math.pow(10, logK(LOGK.water, T)) };
  }
  // Inorganic carbon species in mmol/L.
  function carbonSpecies(dic, pH, k) {
    var H = Math.pow(10, -pH), D = H * H + H * k.K1 + k.K1 * k.K2;
    return { co2: dic * H * H / D, hco3: dic * H * k.K1 / D, co3: dic * k.K1 * k.K2 / D };
  }
  function bisectPH(f) { var lo = 2, hi = 12; for (var i = 0; i < 45; i++) { var m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; }
  // pH from alkalinity and dissolved inorganic carbon, by charge balance (both mmol/L).
  function solvePH(alk, dic, tC) {
    var k = carbonateK(tC);
    return bisectPH(function (pH) { var H = Math.pow(10, -pH), s = carbonSpecies(dic, pH, k); return s.hco3 + 2 * s.co3 + (k.Kw / H - H) * 1000 - alk; });
  }
  // Water in equilibrium with air at the given alkalinity.
  function airEquilibrium(alk, pco2, tC) {
    var k = carbonateK(tC), co2 = k.KH * pco2 * 1000;
    var pH = bisectPH(function (x) { var H = Math.pow(10, -x); return co2 * (k.K1 / H + 2 * k.K1 * k.K2 / (H * H)) + (k.Kw / H - H) * 1000 - alk; });
    var H = Math.pow(10, -pH);
    return { pH: pH, dic: co2 * (1 + k.K1 / H + k.K1 * k.K2 / (H * H)), co2: co2 };
  }

  function create(opts) {
    opts = opts || {};
    var P = {};
    PARAMS.forEach(function (x) { P[x.key] = x.value; });
    Object.keys(opts.params || {}).forEach(function (k) { if (k in P) P[k] = opts.params[k]; });
    var mature = opts.start === 'new' ? SC.bioSeed : ESTABLISHED_MATURITY, seed = opts.seed || 20261122, rng = mulberry32(seed);
    var S = {
      P: P, seed: seed, minute: 0, power: 'on', heaterEnabled: true, heaterOn: false, autoFeed: opts.autoFeed !== false, feeds: DEFAULT_FEEDS.slice(),
      lastFeedDay: {}, feedCount: 0,
      tempC: opts.tempC == null ? P.setpointC : opts.tempC, doMg: doSaturation(P.setpointC) - 1,
      tan: 0.05, no2: 0.02, no3: 5, tssMgL: 0, detritusMg: 50, spongeMg: 0,
      vol: P.volumeL, alk: P.alkMeqL, dic: 0,
      mods: { chemistry: !!(opts.modules && opts.modules.chemistry), evaporation: !!(opts.modules && opts.modules.evaporation) },
      aob: mature, nob: mature, pH: P.pH, tds: P.tdsPpm,
      nIn: 0, nOut: 0, nFish: 0,
      filter: Filt.create({ enabled: opts.filter !== false, flowLph: null, mode: 'auto' }, P.volumeL, 0),
      rng: rng, sensors: {}, hist: [], nextHist: 0, events: []
    };
    if (S.mods.chemistry) { var eq = airEquilibrium(S.alk, P.pco2Atm, S.tempC); S.dic = eq.dic; S.pH = eq.pH; }
    S.n0 = totalNitrogen(S);
    Object.keys(SENSORS).forEach(function (k) {
      var d = SENSORS[k];
      // One fixed error per run, drawn inside the published bound minus the largest noise swing (3 x noise), so a
      // healthy reading never needs clamping at the limit. The distribution is an illustrative choice.
      var bias = d.accuracy == null ? 0 : (rng() * 2 - 1) * Math.max(0, d.accuracy - 3 * d.noise);
      S.sensors[k] = { status: 'ok', bias: bias, drift: 0, value: null, held: null };
    });
    readSensors(S);
    record(S);
    return S;
  }

  function totalNitrogen(S) {
    var P = S.P;
    return (S.tan + S.no2 + S.no3 + S.tssMgL * P.feedNFrac) * S.vol + (S.detritusMg + S.spongeMg) * P.feedNFrac;
  }
  // Nitrogen in the tank plus what left it, minus what entered. Must stay at zero.
  function nitrogenError(S) { return totalNitrogen(S) + S.nOut + S.nFish - S.n0 - S.nIn; }
  function turbidityNtu(S) { return S.P.baseNtu + S.tssMgL * S.P.ntuPerMgL; }

  function log(S, text) { S.events.unshift({ minute: S.minute, text: text }); if (S.events.length > 60) S.events.length = 60; }

  // ---------- actions ----------
  function feed(S) {
    var P = S.P, mg = P.feedMgPerFish * P.fishCount, uneaten = mg * P.uneatenFrac, eatenN = (mg - uneaten) * P.feedNFrac;
    var excreted = eatenN * P.excretedFrac, fecesN = eatenN * P.fecesFrac;
    S.nIn += mg * P.feedNFrac;
    S.nFish += eatenN - excreted - fecesN;
    S.tan += excreted / S.vol;
    if (S.mods.chemistry) S.alk += excreted / 14 / S.vol;
    S.tssMgL += (uneaten + fecesN / P.feedNFrac) / S.vol;
    S.feedCount++;
    log(S, 'Feed: ' + mg + ' mg dry food');
  }
  // Instant exchange of a share of the water. The biofilter, sponge and gravel stay in place.
  function waterChange(S, share) {
    var f = clamp(share, 0, 1);
    exchange(S, f);
    log(S, 'Water change: ' + Math.round(f * 100) + ' %');
  }
  // Removes a share of the tank water, then refills to the full level with replacement water.
  function exchange(S, f) {
    var P = S.P, V = S.vol, V0 = P.volumeL, keep = (1 - f) * V / V0, add = V === V0 ? f : 1 - keep;
    S.nOut += f * V * (S.tan + S.no2 + S.no3 + S.tssMgL * P.feedNFrac);
    S.tan *= keep; S.no2 *= keep; S.no3 *= keep; S.tssMgL *= keep;
    S.tempC += add * (P.sourceTempC - S.tempC);
    S.doMg += add * (doSaturation(P.sourceTempC) - S.doMg);
    S.tds += add * (P.sourceTdsPpm - S.tds);
    if (S.mods.chemistry) {
      var src = airEquilibrium(P.sourceAlkMeqL, P.pco2Atm, P.sourceTempC);
      S.alk = S.alk * keep + P.sourceAlkMeqL * add; S.dic = S.dic * keep + src.dic * add;
      S.pH = solvePH(S.alk, S.dic, S.tempC);
    }
    S.vol = V0;
  }
  // Refills evaporated water. Nothing is removed from the tank.
  function topUp(S) { var added = S.P.volumeL - S.vol; exchange(S, 0); log(S, 'Topped up: ' + added.toFixed(2) + ' L'); }
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
    var P = S.P, dtH = 1 / 60, dtD = 1 / 1440;
    S.minute++;
    // evaporation removes water only, so everything dissolved becomes more concentrated, and it carries away latent heat
    var evapJ = 0;
    if (S.mods.evaporation && S.vol > 0.2 * P.volumeL) {
      var newV = S.vol - P.evapLDay * dtD, cf = S.vol / newV;
      evapJ = P.evapLDay * dtD * P.rhoKgL * P.latentHeatJkg;
      S.tan *= cf; S.no2 *= cf; S.no3 *= cf; S.tssMgL *= cf; S.tds *= cf; S.alk *= cf; S.dic *= cf;
      S.vol = newV;
    }
    var V = S.vol;
    var day = Math.floor(S.minute / 1440), tod = S.minute % 1440;
    if (S.autoFeed) S.feeds.forEach(function (m) { var k = day + ':' + m; if (tod === m && !S.lastFeedDay[k]) { S.lastFeedDay[k] = 1; feed(S); } });

    // pump and sponge: reuses the existing AquaCare controller
    var F = S.filter, turb = S.sensors.turb;
    Filt.step(F, 1, { power: S.power, V: P.volumeL, t: S.minute * 60000, turbNtu: turb.value, turbStatus: turb.status, levelPct: S.mods.evaporation ? 100 * S.vol / P.volumeL : null });
    var Q = Filt.processing(F, V) ? F.flow : 0, turnover = Q / V;

    // temperature: lumped energy balance
    if (S.power !== 'on' || !S.heaterEnabled) S.heaterOn = false;
    else if (S.tempC < P.setpointC - P.heaterBandC) S.heaterOn = true;
    else if (S.tempC > P.setpointC + P.heaterBandC) S.heaterOn = false;
    S.tempC += (((S.heaterOn ? P.heaterW : 0) - P.uaWK * (S.tempC - P.ambientC)) * 60 - evapJ) / (P.rhoKgL * V * P.cpJ);

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
    var fishN = P.fishTanMgDayPerFish * P.fishCount * dtD;   // feed and excretion both scale with the stock
    S.nIn += fishN;
    S.tan += (decayed * P.feedNFrac + fishN) / V;

    // biofilter
    var fDo = S.doMg / (S.doMg + P.koMgL), used = 0, oxidised = 0;
    if (Q > 0) {
      var fFlow = Math.min(1, turnover / SC.fullFlowTurnover);
      var sA = S.tan / (P.ksMgL + S.tan), sN = S.no2 / (P.ksMgL + S.no2);
      var tA = Math.max(0, 1 + (fDo < sA ? P.nitrifPerCDoLimited : P.nitrifPerCTanLimited) * (S.tempC - 20));
      var tN = Math.max(0, 1 + (fDo < sN ? P.nitrifPerCDoLimited : P.nitrifPerCTanLimited) * (S.tempC - 20));
      var a = Math.min(S.tan * V, P.aobMaxMgDay * S.aob * fDo * fFlow * sA * tA * dtD);
      S.tan -= a / V; S.no2 += a / V; oxidised = a;
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

    // carbonate chemistry: ammonia release adds alkalinity, nitrification removes it, CO2 follows respiration and gas exchange
    if (S.mods.chemistry) {
      S.alk += ((decayed * P.feedNFrac + fishN) / 14 - 2 * oxidised / 14) / V;
      S.dic += (P.fishO2MgH * P.fishCount * dtH + decayed * P.bodMgMg) / 32 * P.rqCo2 / V;
      var ck = carbonateK(S.tempC), pH1 = solvePH(S.alk, S.dic, S.tempC), co2Now = carbonSpecies(S.dic, pH1, ck).co2;
      S.dic = Math.max(1e-6, S.dic + (ck.KH * P.pco2Atm * 1000 - co2Now) * (1 - Math.exp(-kLa * P.kLaCo2Ratio * dtH)));
      S.pH = solvePH(S.alk, S.dic, S.tempC);
    }

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
        bioPct: 100 * Math.min(S.aob, S.nob), flowLph: S.filter.flow, alkMeqL: S.alk, levelPct: 100 * S.vol / P.volumeL,
        co2MgL: S.mods.chemistry ? carbonSpecies(S.dic, S.pH, carbonateK(S.tempC)).co2 * 44.01 : null
      },
      virtual: Object.keys(SENSORS).reduce(function (o, k) { o[k] = { value: S.sensors[k].value, status: S.sensors[k].status, uncalibrated: !!SENSORS[k].uncalibrated }; return o; }, {}),
      measured: null,
      volumeL: P.volumeL
    };
  }
  function record(S) {
    var c = snapshot(S).calculated;
    S.hist.push({ minute: S.minute, tempC: c.tempC, doMg: c.doMg, tan: c.tan, no2: c.no2, no3: c.no3, turbNtu: c.turbNtu, flowLph: c.flowLph, pH: c.pH, alk: c.alkMeqL, levelPct: c.levelPct });
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

  // ---------- real-tank data: never generated by the model ----------
  var MEASURES = [
    { key: 'tempC', col: 'temperature_c', label: 'Temperature', unit: '°C', min: 0, max: 50 },
    { key: 'pH', col: 'ph', label: 'pH', unit: 'pH', min: 0, max: 14 },
    { key: 'alk', col: 'alkalinity_meq_l', label: 'Alkalinity', unit: 'meq/L', min: 0, max: 50 },
    { key: 'doMg', col: 'dissolved_oxygen_mg_l', label: 'Dissolved oxygen', unit: 'mg/L', min: 0, max: 30 },
    { key: 'tan', col: 'ammonia_mg_n_l', label: 'Total ammonia', unit: 'mg N/L', min: 0, max: 100 },
    { key: 'no2', col: 'nitrite_mg_n_l', label: 'Nitrite', unit: 'mg N/L', min: 0, max: 100 },
    { key: 'no3', col: 'nitrate_mg_n_l', label: 'Nitrate', unit: 'mg N/L', min: 0, max: 500 },
    { key: 'turbNtu', col: 'turbidity_ntu', label: 'Turbidity', unit: 'NTU', min: 0, max: 3000 }
  ];
  function measuredTemplate() {
    return ['# AquaCare real-tank measurements. Enter only values you measured on a real aquarium.', '# day = days since the start of the simulated run. Leave a cell empty if it was not measured.', 'day,' + MEASURES.map(function (m) { return m.col; }).join(','), ''].join('\r\n');
  }
  function parseMeasuredCSV(text) {
    var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; });
    var out = { rows: [], errors: [], columns: [] };
    if (!lines.length) { out.errors.push('The file has no data.'); return out; }
    var head = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); }), dayAt = head.indexOf('day');
    if (dayAt < 0) { out.errors.push('The first row must include a "day" column.'); return out; }
    var used = MEASURES.filter(function (m) { return head.indexOf(m.col) >= 0; });
    out.columns = used.map(function (m) { return m.key; });
    if (!used.length) { out.errors.push('No recognised measurement columns were found.'); return out; }
    lines.slice(1).forEach(function (line, i) {
      var c = line.split(','), day = Number(c[dayAt]), row = { day: day }, bad = null;
      if (c[dayAt] === undefined || c[dayAt].trim() === '' || !isFinite(day) || day < 0) bad = 'invalid day';
      used.forEach(function (m) {
        var raw = (c[head.indexOf(m.col)] || '').trim(); if (raw === '') return;
        var v = Number(raw); if (!isFinite(v) || v < m.min || v > m.max) bad = m.col + ' is out of range'; else row[m.key] = v;
      });
      if (bad) out.errors.push('Row ' + (i + 2) + ': ' + bad); else out.rows.push(row);
    });
    out.rows.sort(function (a, b) { return a.day - b.day; });
    return out;
  }
  function historyAt(hist, minute, key) {
    if (!hist.length || minute < hist[0].minute || minute > hist[hist.length - 1].minute) return null;
    var lo = 0, hi = hist.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (hist[m].minute <= minute) lo = m; else hi = m; }
    var a = hist[lo], b = hist[hi], f = b.minute > a.minute ? (minute - a.minute) / (b.minute - a.minute) : 0;
    return a[key] + (b[key] - a[key]) * f;
  }
  // Model minus measured, at each measured time inside the simulated history.
  function compareMeasured(hist, rows) {
    return MEASURES.map(function (m) {
      var e = [];
      rows.forEach(function (r) { if (r[m.key] == null) return; var v = historyAt(hist, r.day * 1440, m.key); if (v != null) e.push(v - r[m.key]); });
      if (!e.length) return null;
      var sum = function (f) { return e.reduce(function (a, x) { return a + f(x); }, 0) / e.length; };
      return { key: m.key, label: m.label, unit: m.unit, n: e.length, bias: sum(function (x) { return x; }), mae: sum(Math.abs), rmse: Math.sqrt(sum(function (x) { return x * x; })) };
    }).filter(Boolean);
  }

  // Honest status of each realism stage, shown on the page.
  var ROADMAP = [
    { stage: 'Nitrogen, oxygen, heat and filtration', status: 'Working', note: 'Equations work, but many rates are stand-ins' },
    { stage: 'pH, alkalinity and CO₂', status: 'Working', note: 'Published carbonate equilibrium. Gas transfer is a stand-in' },
    { stage: 'Evaporation, water level and top-ups', status: 'Working', note: 'Evaporation rate is a stand-in until measured' },
    { stage: 'Real-tank data comparison', status: 'Ready for data', note: 'Import measurements to compare them with the model' },
    { stage: 'Automatic calibration to a real tank', status: 'Needs real data', note: 'Requires about 30 days of measurements' },
    { stage: 'Bacteria on gravel and glass', status: 'Planned', note: 'Needs published surface-area data' },
    { stage: 'Algae, plants and light cycle', status: 'Planned', note: 'Needs published growth data' },
    { stage: 'Fish health, stress, appetite and growth', status: 'Planned', note: 'Needs a chosen species and species data' }
  ];

  var Model = {
    PARAMS: PARAMS, SENSORS: SENSORS, create: create, step: step, advance: advance, snapshot: snapshot, toTank3D: toTank3D,
    feed: feed, waterChange: waterChange, topUp: topUp, carbonateK: carbonateK, carbonSpecies: carbonSpecies, solvePH: solvePH, airEquilibrium: airEquilibrium,
    HIDDEN_PARAMS: HIDDEN_PARAMS, MEASURES: MEASURES, ROADMAP: ROADMAP, measuredTemplate: measuredTemplate, parseMeasuredCSV: parseMeasuredCSV, compareMeasured: compareMeasured, siphon: siphon, cleanSponge: cleanSponge, setPump: setPump, setPower: setPower, setHeater: setHeater, setSensor: setSensor,
    doSaturation: doSaturation, nh3Fraction: nh3Fraction, nitrogenError: nitrogenError, turbidityNtu: turbidityNtu
  };
  root.AquaResearchModel = Model;
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
})(typeof window !== 'undefined' ? window : globalThis);
