/* Phase 1 deterministic aquarium geometry and clock verification.
 * Run: node source/tests/ecosystem-core.test.js (from repository root)
 */
'use strict';
const assert = require('node:assert/strict');
const Config = require('../js/ecosystem/config.js');
const Core = require('../js/ecosystem/core.js');
let count = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); ++count; }
const DAY = 86400000;

test('Geometric volume, freeboard and displacement use SI-compatible units', () => {
  const c = Config.normalize({tank:{lengthCm:40,widthCm:30,heightCm:30,waterDepthCm:25,displacementL:2}});
  const g = Config.geometry(c);
  assert.equal(g.grossCapacityL, 36);
  assert.equal(g.filledColumnL, 30);
  assert.equal(g.initialWaterVolumeL, 28);
  assert.equal(g.freeboardCm, 5);
  assert.equal(g.surfaceAreaM2, .12);
});
test('Input validation rejects impossible geometry and unknown fields', () => {
  assert.throws(() => Core.create({tank:{waterDepthCm:26}}));
  assert.throws(() => Core.create({tank:{displacementL:1000}}));
  assert.throws(() => Core.create({tank:{lengthCm:-2}}));
  assert.throws(() => Core.create({unsupported:1}));
  assert.throws(() => Core.create({fixedStepMs:0}));
});
test('Phase 1 reports no fictional nitrogen or sensor values', () => {
  const e = Core.create(); const s = e.read();
  assert.equal(s.mode,'realistic-ecosystem');
  assert.equal(s.provenance,'simulated');
  assert.equal(Object.hasOwn(s.water,'tanMgN'),false);
  assert.equal(Object.hasOwn(s,'sensors'),false);
});
test('Pause, resume, restart and fixed time-step boundaries', () => {
  const e=Core.create();
  assert.equal(e.advanceSimulatedMs(60000),0);
  e.resume();
  assert.equal(e.advanceSimulatedMs(30000),0);
  assert.equal(e.advanceSimulatedMs(30000),1);
  e.pause(); e.advanceSimulatedMs(60000);
  assert.equal(e.read().elapsedMs,60000);
  e.restart(); assert.equal(e.read().elapsedMs,0);
  assert.equal(e.read().running,false);
});
test('Duration partition and simulated acceleration do not alter results', () => {
  const a=Core.create(), b=Core.create(); a.resume(); b.resume();
  a.advanceSimulatedMs(DAY);
  for(let i=0;i<24;i++) b.advanceSimulatedMs(DAY/24);
  assert.deepEqual(a.snapshot(),b.snapshot());
});
test('Seeded 30-day run has deterministic state and safe values', () => {
  const a=Core.create({seed:7}), b=Core.create({seed:7}); a.resume(); b.resume();
  a.advanceSimulatedMs(30*DAY);
  for(let i=0;i<30;i++) b.advanceSimulatedMs(DAY);
  assert.deepEqual(a.snapshot(),b.snapshot());
  assert.equal(a.read().stepCount,43200);
  assert.ok(a.read().water.volumeL>0);
});
test('Snapshot can be saved and restored, with invalid snapshots rejected', () => {
  const a=Core.create({seed:42}); a.resume();a.advanceSimulatedMs(65654);
  const json=JSON.stringify(a.snapshot());
  const b=Core.restore(json);
  assert.deepEqual(a.snapshot(),b.snapshot());
  const bad=JSON.parse(json);bad.state.water.volumeL=-1;
  assert.throws(()=>Core.restore(bad));
});
test('Unbounded time advances are rejected before changing state', () => {
  const e = Core.create(); e.resume();
  const before = e.snapshot();
  assert.throws(() => e.advanceSimulatedMs(1e15), RangeError);
  assert.deepEqual(e.snapshot(), before);
});
test('Parameter register identifies all defined demonstration inputs', () => {
  const r=Config.register();
  for (const key of ['tank.lengthCm','tank.displacementL','environment.relativeHumidity','fixedStepMs']) {
    assert.equal(r[key].provenance,'assumed');
    assert.ok(r[key].unit && r[key].source && r[key].uncertainty);
  }
});
console.log(count + ' ecosystem Phase 1 checks passed');
