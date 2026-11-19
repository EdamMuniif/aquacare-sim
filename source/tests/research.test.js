// Real-Life Aquarium Research Simulation checks. SIMULATION ONLY.  Run: node source/tests/research.test.js
// These verify the software against equations and conservation laws. They do not validate the model against a real aquarium.
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'research', 'model.js'));
const DAY = 1440;
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const quiet = o => M.create(Object.assign({ autoFeed: false }, o || {}));

// 1. published oxygen solubility (values computed from USGS memo 2011.03 eq. 7)
check('1 Oxygen saturation follows the published equation', near(M.doSaturation(0), 14.621, 0.001) && near(M.doSaturation(20), 9.092, 0.001) && near(M.doSaturation(25), 8.263, 0.001), '25 °C = ' + M.doSaturation(25).toFixed(3) + ' mg/L');

// 2. published ammonia split
{
  const a = M.nh3Fraction(20, 7), b = M.nh3Fraction(25, 8), c = M.nh3Fraction(30, 8);
  const exact = 1 / (Math.pow(10, 0.09018 + 2729.92 / 293.2 - 7) + 1);
  check('2 NH3 fraction follows Emerson, rising with pH and temperature', near(a, exact, 1e-12) && b > a && c > b, '20 °C pH 7 = ' + (a * 100).toFixed(3) + ' %');
}

// 3. energy balance: heater off, water relaxes to room temperature on the analytic curve
{
  const S = quiet({ tempC: 30 }); M.setHeater(S, false);
  const P = S.P, tau = P.rhoKgL * P.volumeL * P.cpJ / P.uaWK / 60;
  M.advance(S, DAY);
  const exact = P.ambientC + (30 - P.ambientC) * Math.exp(-DAY / tau);
  check('3 Temperature cools toward ambient on the analytic curve', near(S.tempC, exact, 0.01), S.tempC.toFixed(3) + ' vs ' + exact.toFixed(3) + ' °C');
}

// 4. thermostat holds setpoint; a power cut lets the tank cool
{
  const S = quiet({ tempC: 22 });
  M.advance(S, 3 * DAY);
  const held = near(S.tempC, S.P.setpointC, S.P.heaterBandC + 0.05);
  M.setPower(S, false); const t0 = S.tempC; M.advance(S, DAY);
  check('4 Heater reaches setpoint, and a power cut stops heating', held && S.tempC < t0 && !S.heaterOn, 'held ' + t0.toFixed(2) + ', after 24 h without power ' + S.tempC.toFixed(2) + ' °C');
}

// 5. oxygen: stopping circulation lowers it, restarting raises it
{
  const S = quiet(); M.advance(S, DAY);
  const on = S.doMg; M.setPump(S, false); M.advance(S, DAY);
  const off = S.doMg; M.setPump(S, true); M.advance(S, DAY);
  check('5 Oxygen falls without circulation and recovers with it', off < on && S.doMg > off && on <= M.doSaturation(S.tempC), on.toFixed(2) + ' -> ' + off.toFixed(2) + ' -> ' + S.doMg.toFixed(2) + ' mg/L');
}

// 6. nitrogen is conserved through feeding, decay, nitrification, water changes, siphoning and rinsing
{
  const S = M.create();
  let worst = 0;
  for (let d = 1; d <= 30; d++) {
    M.advance(S, DAY); worst = Math.max(worst, Math.abs(M.nitrogenError(S)));
    if (d % 7 === 0) { M.waterChange(S, 0.25); M.siphon(S, 0.3); M.cleanSponge(S); worst = Math.max(worst, Math.abs(M.nitrogenError(S))); }
  }
  check('6 Nitrogen mass balance closes over 30 days', worst < 1e-6, 'largest error ' + worst.toExponential(1) + ' mg');
}

// 7. a new biofilter: ammonia peaks before nitrite, then nitrate accumulates
{
  const S = M.create({ start: 'new' });
  let a = { v: 0, d: 0 }, n = { v: 0, d: 0 };
  for (let d = 1; d <= 45; d++) { M.advance(S, DAY); if (S.tan > a.v) a = { v: S.tan, d }; if (S.no2 > n.v) n = { v: S.no2, d }; }
  check('7 New filter: ammonia peak, later nitrite peak, then nitrate', a.d < n.d && S.tan < a.v / 2 && S.no2 < n.v / 2 && S.no3 > 5, 'ammonia day ' + a.d + ', nitrite day ' + n.d + ', nitrate ' + S.no3.toFixed(1) + ' mg/L');
}

// 8. feeding creates particles; filtration clears them; trapped solids clog the sponge
{
  const run = pump => { const S = quiet(); M.advance(S, 10); if (!pump) M.setPump(S, false); M.advance(S, 3); M.feed(S); M.feed(S); const t0 = M.turbidityNtu(S); M.advance(S, 120); return { t0, t: M.turbidityNtu(S), sponge: S.spongeMg, base: S.P.baseNtu }; };
  const a = run(true), b = run(false);
  check('8 Feeding raises turbidity, and filtration clears it faster', a.t0 > a.base && a.t < b.t && a.sponge > 0 && b.sponge === 0, 'after 2 h ' + a.t.toFixed(2) + ' NTU filtered, ' + b.t.toFixed(2) + ' NTU unfiltered');
}

// 9. clogging reduces flow; rinsing restores it without changing the water or the biofilm
{
  const S = quiet(); M.advance(S, 10);
  const q0 = S.filter.flow; S.filter.load = 0.6; M.advance(S, 5);
  const q1 = S.filter.flow, snap = JSON.stringify([S.tan, S.no2, S.no3, S.doMg, S.aob, S.nob, S.tssMgL, S.tempC]);
  M.cleanSponge(S);
  const same = JSON.stringify([S.tan, S.no2, S.no3, S.doMg, S.aob, S.nob, S.tssMgL, S.tempC]) === snap;
  M.advance(S, 5);
  check('9 Clogging cuts flow, and rinsing restores it without touching water or biofilm', q1 < q0 * 0.8 && same && S.filter.flow > q1 * 1.3, q0.toFixed(0) + ' -> ' + q1.toFixed(0) + ' -> ' + S.filter.flow.toFixed(0) + ' L/h');
}

// 10. water change dilutes exactly and leaves the biofilter alone
{
  const S = quiet(); S.no3 = 40; S.tan = 1; S.tds = 300; S.tempC = 26;
  const aob = S.aob; M.waterChange(S, 0.25);
  check('10 Water change dilutes and mixes exactly, biofilter unchanged', near(S.no3, 30, 1e-9) && near(S.tan, 0.75, 1e-9) && near(S.tds, 300 + 0.25 * (S.P.sourceTdsPpm - 300), 1e-9) && near(S.tempC, 26 + 0.25 * (S.P.sourceTempC - 26), 1e-9) && S.aob === aob, 'nitrate 40 -> ' + S.no3 + ' mg/L');
}

// 11. virtual sensors: stay within published bounds, and never change the water
{
  const a = M.create({ seed: 1 }), b = M.create({ seed: 999 });
  let maxT = 0, maxP = 0, maxD = 0;
  for (let i = 0; i < 3 * DAY; i++) {
    M.step(a); M.step(b);
    maxT = Math.max(maxT, Math.abs(a.sensors.temp.value - a.tempC)); maxP = Math.max(maxP, Math.abs(a.sensors.ph.value - a.pH)); maxD = Math.max(maxD, Math.abs(a.sensors.tds.value - a.tds));
  }
  const envSame = a.tan === b.tan && a.doMg === b.doMg && a.no3 === b.no3 && a.tempC === b.tempC;
  check('11 Healthy sensors stay inside published accuracy, and noise never alters the water', envSame && maxT <= 0.5 + 0.0625 / 2 + 1e-9 && maxP <= 0.1 + 0.01 / 2 + 1e-9 && maxD <= 100 + 0.5 + 1e-9 && a.sensors.temp.bias !== b.sensors.temp.bias, 'largest error ' + maxT.toFixed(2) + ' °C, ' + maxP.toFixed(2) + ' pH, ' + maxD.toFixed(0) + ' ppm');
}

// 12. sensor faults
{
  const S = quiet(); M.advance(S, 5);
  M.setSensor(S, 'ph', 'disconnected'); M.setSensor(S, 'temp', 'stuck'); M.setSensor(S, 'tds', 'drift');
  const held = S.sensors.temp.value, d0 = S.sensors.tds.drift; S.tempC += 2; M.advance(S, DAY);
  const cut = quiet(); M.setPower(cut, false); M.advance(cut, 2);
  check('12 Faults: disconnected reads nothing, stuck holds, drift grows, no power reads nothing', S.sensors.ph.value === null && S.sensors.temp.value === held && S.sensors.tds.drift > d0 && cut.sensors.temp.value === null, 'drift ' + S.sensors.tds.drift.toFixed(2) + ' ppm');
}

// 13. deterministic
{
  const run = () => { const S = M.create(); M.advance(S, 5 * DAY); M.waterChange(S, 0.2); M.advance(S, 2 * DAY); return JSON.stringify(M.snapshot(S)); };
  check('13 Same seed gives an identical run', run() === run());
}

// 14. value classes are declared and the turbidity sensor stays flagged uncalibrated
{
  const allowed = ['published', 'calculated', 'illustrative', 'user'];
  const typed = M.PARAMS.every(p => allowed.includes(p.cls)), sourced = M.PARAMS.filter(p => p.cls === 'published').every(p => p.source);
  const snap = M.snapshot(M.create());
  check('14 Every parameter is classified, and measured data stays empty', typed && sourced && snap.measured === null && snap.virtual.turb.uncalibrated === true, M.PARAMS.length + ' parameters');
}

// 15. the 3D view follows the simulated state
{
  const S = quiet(); M.advance(S, 10);
  const a = M.toTank3D(S); S.tssMgL = 50; S.detritusMg = 300; M.setPower(S, false); S.heaterOn = false;
  const b = M.toTank3D(S);
  check('15 3D view follows turbidity, settled waste and power', b.turb > a.turb && b.upkeep.detritus > a.upkeep.detritus && b.power === 'off' && a.filter.flow > 0, 'turbidity input ' + a.turb.toFixed(1) + ' -> ' + b.turb.toFixed(1));
}

console.log(out.join('\n'));
console.log(pass + '/' + (pass + fail) + ' research model checks passed');
if (fail) process.exit(1);
