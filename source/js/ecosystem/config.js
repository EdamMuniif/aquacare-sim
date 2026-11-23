/* AquaCare Realistic Ecosystem Mode — Phase 1 configuration.
 * All initial values are illustrative, not manufacturer or field measurements.
 * Separate UMD module: never imported by the legacy AquaEngine.
 */
(function (root) {
  'use strict';
  var DEFAULTS = {
    schemaVersion: 1,
    seed: 20261122,
    startDateUTC: '2026-01-01',
    fixedStepMs: 60000,
    tank: {
      lengthCm: 45,
      widthCm: 25,
      heightCm: 25,
      waterDepthCm: 23,
      displacementL: 1.5,
      minimumOperatingVolumeL: 5
    },
    environment: {
      ambientTemperatureC: 27,
      relativeHumidity: 0.65,
      initialWaterTemperatureC: 27
    }
  };
  var REGISTER = {
    'seed': { unit: 'integer', provenance: 'assumed', source: 'Illustrative deterministic seed', uncertainty: 'not applicable' },
    'startDateUTC': { unit: 'ISO date', provenance: 'assumed', source: 'Configurable simulation calendar start', uncertainty: 'not applicable' },
    'fixedStepMs': { unit: 'ms', provenance: 'assumed', source: 'Numerical integration design setting; 60-second fixed interval', uncertainty: 'temporal-discretization error to quantify as models are added' },
    'tank.lengthCm': { unit: 'cm', provenance: 'assumed', source: 'Illustrative freshwater aquarium geometry', uncertainty: 'unmeasured' },
    'tank.widthCm': { unit: 'cm', provenance: 'assumed', source: 'Illustrative freshwater aquarium geometry', uncertainty: 'unmeasured' },
    'tank.heightCm': { unit: 'cm', provenance: 'assumed', source: 'Illustrative freshwater aquarium geometry', uncertainty: 'unmeasured' },
    'tank.waterDepthCm': { unit: 'cm', provenance: 'assumed', source: 'Illustrative fill level, separate from tank height', uncertainty: 'unmeasured' },
    'tank.displacementL': { unit: 'L', provenance: 'assumed', source: 'Illustrative displacement by substrate/decor/equipment', uncertainty: 'unmeasured' },
    'tank.minimumOperatingVolumeL': { unit: 'L', provenance: 'assumed', source: 'Illustrative geometry constraint only, not equipment safety rating', uncertainty: 'unmeasured' },
    'environment.ambientTemperatureC': { unit: '°C', provenance: 'assumed', source: 'Illustrative initial ambient condition', uncertainty: 'unmeasured' },
    'environment.relativeHumidity': { unit: 'fraction', provenance: 'assumed', source: 'Illustrative ambient relative humidity', uncertainty: 'unmeasured' },
    'environment.initialWaterTemperatureC': { unit: '°C', provenance: 'assumed', source: 'Illustrative initial water temperature; not a heating model', uncertainty: 'unmeasured' },
    'derived.grossCapacityL': { unit: 'L', provenance: 'calculated', source: 'length × width × height / 1000', uncertainty: 'depends on input dimensions' },
    'derived.initialWaterVolumeL': { unit: 'L', provenance: 'calculated', source: 'length × width × water depth / 1000 − displacement', uncertainty: 'depends on geometry and displacement assumptions' },
    'derived.surfaceAreaM2': { unit: 'm²', provenance: 'calculated', source: 'length × width / 10000; rectangular approximation', uncertainty: 'ignores decor-covered surface' }
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function finite(n, label, lower, upper) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < lower || n > upper) {
      throw new RangeError(label + ' must be finite, in [' + lower + ', ' + upper + ']');
    }
  }
  function mergeKnown(base, patch, prefix) {
    if (!patch) return;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError(prefix || 'config');
    Object.keys(patch).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(base, key)) throw new Error('Unknown parameter: ' + (prefix ? prefix + '.' : '') + key);
      var target = base[key], value = patch[key];
      if (target && typeof target === 'object' && !Array.isArray(target)) mergeKnown(target, value, (prefix ? prefix + '.' : '') + key);
      else base[key] = value;
    });
  }
  function normalize(patch) {
    var c = clone(DEFAULTS);
    mergeKnown(c, patch || {}, '');
    if (c.schemaVersion !== 1) throw new Error('Unsupported ecosystem config version');
    if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) throw new RangeError('seed must be a uint32');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDateUTC) ||
      new Date(c.startDateUTC + 'T00:00:00Z').toISOString().slice(0, 10) !== c.startDateUTC) {
      throw new RangeError('startDateUTC must be a valid ISO date');
    }
    if (!Number.isInteger(c.fixedStepMs)) throw new TypeError('fixedStepMs must be an integer');
    finite(c.fixedStepMs, 'fixedStepMs', 1000, 3600000);
    var t = c.tank;
    ['lengthCm', 'widthCm', 'heightCm'].forEach(function (key) { finite(t[key], 'tank.' + key, 1, 10000); });
    finite(t.waterDepthCm, 'tank.waterDepthCm', 0.1, t.heightCm);
    finite(t.displacementL, 'tank.displacementL', 0, Infinity);
    finite(t.minimumOperatingVolumeL, 'tank.minimumOperatingVolumeL', 0, Infinity);
    var waterColumnL = t.lengthCm * t.widthCm * t.waterDepthCm / 1000;
    if (!(waterColumnL - t.displacementL > 0)) throw new RangeError('Displacement must leave positive water volume');
    if (t.minimumOperatingVolumeL > waterColumnL - t.displacementL) throw new RangeError('Minimum operating volume exceeds initial volume');
    var e = c.environment;
    finite(e.ambientTemperatureC, 'ambientTemperatureC', -20, 60);
    finite(e.initialWaterTemperatureC, 'initialWaterTemperatureC', 0, 50);
    finite(e.relativeHumidity, 'relativeHumidity', 0, 1);
    return c;
  }
  function geometry(cfg) {
    var t = cfg.tank;
    var columnL = t.lengthCm * t.widthCm * t.waterDepthCm / 1000;
    return {
      grossCapacityL: t.lengthCm * t.widthCm * t.heightCm / 1000,
      filledColumnL: columnL,
      initialWaterVolumeL: columnL - t.displacementL,
      displacementL: t.displacementL,
      freeboardCm: t.heightCm - t.waterDepthCm,
      waterDepthCm: t.waterDepthCm,
      surfaceAreaM2: t.lengthCm * t.widthCm / 10000
    };
  }
  var API = { defaults: function () { return clone(DEFAULTS); }, register: function () { return clone(REGISTER); }, normalize: normalize, geometry: geometry };
  root.AquaEcosystemConfig = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
