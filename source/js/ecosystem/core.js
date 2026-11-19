/* AquaCare Realistic Ecosystem Mode — Phase 1 deterministic state and clock.
 * No kinetics are enabled in Phase 1. No legacy imports, UI effects or sensor spoofing.
 */
(function (root) {
  'use strict';
  var Config = root.AquaEcosystemConfig ||
    (typeof require === 'function' ? require('./config.js') : null);
  if (!Config) throw new Error('AquaEcosystemConfig must load before core.js');
  var STATE_VERSION = 1;
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function validateElapsed(ms) {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('Duration must be a non-negative safe integer in milliseconds');
  }
  function create(options) {
    var cfg = Config.normalize(options || {});
    var geo = Config.geometry(cfg);
    var state;
    function initial() {
      return {
        schemaVersion: STATE_VERSION,
        provenance: 'simulated',
        mode: 'realistic-ecosystem',
        seed: cfg.seed,
        running: false,
        elapsedMs: 0,
        remainderMs: 0,
        stepCount: 0,
        water: {
          volumeL: geo.initialWaterVolumeL,
          temperatureC: cfg.environment.initialWaterTemperatureC
        },
        environment: { ambientTemperatureC: cfg.environment.ambientTemperatureC, relativeHumidity: cfg.environment.relativeHumidity }
      };
    }
    state = initial();
    function applyStep() {
      // Phase 1 establishes the simulation clock; physical state changes belong
      // in separately verified phase-specific systems, called from this boundary.
      state.elapsedMs += cfg.fixedStepMs;
      state.stepCount++;
    }
    function advanceSimulatedMs(ms) {
      validateElapsed(ms);
      if (!state.running || ms === 0) return 0;
      if (!Number.isSafeInteger(state.remainderMs + ms) || !Number.isSafeInteger(state.elapsedMs + state.remainderMs + ms)) {
        throw new RangeError('Simulation time exceeds safe integer range');
      }
      var total = state.remainderMs + ms;
      var count = Math.floor(total / cfg.fixedStepMs);
      state.remainderMs = total % cfg.fixedStepMs;
      for (var i = 0; i < count; i++) applyStep();
      return count;
    }
    function snapshot() { return copy({ version: STATE_VERSION, config: cfg, state: state }); }
    return {
      mode: 'realistic-ecosystem',
      getConfig: function () { return copy(cfg); },
      getGeometry: function () { return copy(geo); },
      read: function () { return copy(state); },
      resume: function () { state.running = true; },
      pause: function () { state.running = false; },
      restart: function () { state = initial(); },
      advanceSimulatedMs: advanceSimulatedMs,
      snapshot: snapshot
    };
  }
  function restore(saved) {
    var data = typeof saved === 'string' ? JSON.parse(saved) : copy(saved);
    if (!data || data.version !== STATE_VERSION || !data.config || !data.state) throw new Error('Unsupported ecosystem snapshot');
    var engine = create(data.config);
    var cfg = engine.getConfig(), geo = engine.getGeometry(), s = data.state;
    if (s.schemaVersion !== STATE_VERSION || s.mode !== 'realistic-ecosystem' || s.seed !== cfg.seed || typeof s.running !== 'boolean') throw new Error('Invalid snapshot identity');
    validateElapsed(s.elapsedMs);
    validateElapsed(s.remainderMs);
    if (!Number.isSafeInteger(s.stepCount) || s.stepCount < 0 || s.elapsedMs !== s.stepCount * cfg.fixedStepMs || s.remainderMs >= cfg.fixedStepMs) throw new Error('Invalid snapshot clock');
    if (!s.water || !Number.isFinite(s.water.volumeL) || s.water.volumeL <= 0 || s.water.volumeL > geo.grossCapacityL || !Number.isFinite(s.water.temperatureC)) throw new Error('Invalid snapshot water state');
    if (!s.environment || !Number.isFinite(s.environment.ambientTemperatureC) || !Number.isFinite(s.environment.relativeHumidity)) throw new Error('Invalid snapshot environment');
    // Phase 1 state is regenerated exclusively by advancing a known fixed number
    // of steps, so no externally supplied mutable physics data are trusted.
    engine.resume();
    engine.advanceSimulatedMs(s.elapsedMs + s.remainderMs);
    if (!s.running) engine.pause();
    var rec = engine.read();
    if (JSON.stringify(rec.water) !== JSON.stringify(s.water) || JSON.stringify(rec.environment) !== JSON.stringify(s.environment)) {
      throw new Error('Inconsistent Phase 1 state');
    }
    return engine;
  }
  var API = { create: create, restore: restore, STATE_VERSION: STATE_VERSION };
  root.AquaEcosystemCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
