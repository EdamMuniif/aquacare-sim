/* Compare a fixed-seed 30-day legacy run to reference commit 91f88cf.
 * Requires an actual Git checkout with full history (git fetch --unshallow if needed).
 * Run from repository root: node source/tests/legacy-baseline.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const REFERENCE = '91f88cfc2fbcfbbc30b00c1c0b9b6bb49d1aa658';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquacare-baseline-'));
try {
  const oldSource = cp.execFileSync('git', ['show', REFERENCE + ':source/js/engine.js'], { encoding: 'utf8' });
  const oldPath = path.join(tmp, 'engine.js');
  fs.writeFileSync(oldPath, oldSource);
  const Old = require(oldPath);
  const Current = require('../js/engine.js');
  function evaluate(Engine, scenarios) {
    const settings = Engine.defaultSettings();
    settings.startDate = '2026-11-19';
    settings.days = 30;
    settings.owner = { mode: 'simulated', respondPct: 60 };
    settings.tankGal = '5';
    settings.scenarios = scenarios ? Engine.exampleScenarios() : [];
    if (settings.filter) settings.filter = { enabled: false, flowLph: null };
    const e = new Engine({ settings, seed: 20261122 });
    e.start(); e.runToEnd();
    return {
      samples: e.s.samples,
      records: e.s.records,
      feeds: e.s.feeds,
      summary: Engine.summarize(e.s.records),
      events: e.log.map(x => ({ t:x.t, day:x.day, kind:x.kind, text:x.text, injected:x.injected, pendingSync:x.pendingSync }))
    };
  }
  for (const scenarios of [false, true]) {
    const label = scenarios ? '16 example scenarios' : 'no scenarios';
    const original = evaluate(Old, scenarios);
    const current = evaluate(Current, scenarios);
    assert.deepStrictEqual(current, original, 'Legacy output changed with ' + label);
    console.log('PASS seeded 30-day legacy output matches reference (' + label + ', ' + current.samples.length + ' samples)');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
