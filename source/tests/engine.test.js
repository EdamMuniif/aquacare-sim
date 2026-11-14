// Run with:  node tests/engine.test.js
// Checks the SIMULATION logic only - not hardware.
var Engine = require('../js/engine.js');
var runSelfTest = require('../js/selftest.js');

var results = runSelfTest(Engine);
var failed = 0;
results.forEach(function (r) {
  if (!r.pass) failed++;
  console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : '  -> ' + r.detail));
});
console.log('\n' + (results.length - failed) + '/' + results.length + ' simulation logic checks passed');
process.exit(failed ? 1 : 0);
