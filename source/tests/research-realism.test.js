// Research simulation realism MVP checks. SIMULATION ONLY.  Run: node source/tests/research-realism.test.js
// These verify software against published constants and conservation laws. They do not validate the model against a real aquarium.
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'research', 'model.js'));
const DAY = 1440, FULL = { chemistry: true, evaporation: true };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { (ok ? pass++ : fail++); out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1. equilibrium constants match the log K values listed in the USGS PHREEQC database at 25 °C
{
  const k = M.carbonateK(25), l = x => Math.log10(x);
  check('1 Carbonate constants match the USGS database at 25 °C', near(l(k.K1), 16.681 * -1 + 10.329, 0.01) && near(l(k.K2), -10.329, 0.01) && near(l(k.KH), -1.468, 0.01) && near(l(k.Kw), -14, 0.02), `pK1 ${(-l(k.K1)).toFixed(3)}, pK2 ${(-l(k.K2)).toFixed(3)}`);
}

// 2. pH solver satisfies the charge balance
{
  const k = M.carbonateK(26), pH = M.solvePH(2, 2.05, 26), s = M.carbonSpecies(2.05, pH, k), H = Math.pow(10, -pH);
  const err = s.hco3 + 2 * s.co3 + (k.Kw / H - H) * 1000 - 2;
  check('2 pH solver closes the charge balance, and carbon species sum to the total', Math.abs(err) < 1e-8 && near(s.co2 + s.hco3 + s.co3, 2.05, 1e-10), `pH ${pH.toFixed(3)}`);
}

// 3. air equilibrium agrees with the independent bicarbonate approximation
{
  const k = M.carbonateK(25), e = M.airEquilibrium(2, 0.00042, 25), approx = Math.log10(2 / (k.K1 * k.KH * 0.00042 * 1000));
  check('3 Air-equilibrium pH agrees with the bicarbonate approximation', near(e.pH, approx, 0.02), `${e.pH.toFixed(3)} vs ${approx.toFixed(3)}`);
}

// 4. alkalinity follows nitrification stoichiometry exactly
{
  const S = M.create({ autoFeed: false, modules: { chemistry: true }, params: { fishTanMgDay: 0 } });
  S.detritusMg = 0; S.tan = 3;
  const alk0 = S.alk, n0 = S.no2 + S.no3; M.advance(S, 3 * DAY);
  const expected = -2 * ((S.no2 + S.no3) - n0) / 14;
  check('4 Alkalinity falls by 2 mmol for every mmol of ammonia oxidised', near(S.alk - alk0, expected, 1e-9), `${(S.alk - alk0).toFixed(4)} meq/L`);
}

// 5. without water changes pH falls; regular water changes protect it
{
  const a = M.create({ modules: { chemistry: true } }), b = M.create({ modules: { chemistry: true } }), pH0 = a.pH, alk0 = a.alk;
  for (let d = 1; d <= 60; d++) { M.advance(a, DAY); M.advance(b, DAY); if (d % 7 === 0) M.waterChange(b, 0.25); }
  check('5 Alkalinity and pH fall without water changes, and water changes protect them', a.alk < alk0 && a.pH < pH0 && b.alk > a.alk && b.pH > a.pH, `60 days: pH ${pH0.toFixed(2)} -> ${a.pH.toFixed(2)} unchanged water, ${b.pH.toFixed(2)} weekly changes`);
}

// 6. more CO2 in room air lowers pH
{
  const a = M.airEquilibrium(2, 0.00042, 26), b = M.airEquilibrium(2, 0.002, 26);
  check('6 Higher room CO₂ lowers pH', b.pH < a.pH, `${a.pH.toFixed(2)} at 420 ppm, ${b.pH.toFixed(2)} at 2000 ppm`);
}

// 7. evaporation concentrates dissolved matter and conserves mass
{
  const S = M.create({ autoFeed: false, modules: { evaporation: true }, params: { fishTanMgDay: 0 } });
  M.setPump(S, false);
  const tds = S.tds * S.vol, no3 = S.no3; M.advance(S, 10 * DAY);
  check('7 Evaporation lowers the level, concentrates solids, and conserves mass', S.vol < S.P.volumeL && near(S.tds * S.vol, tds, 1e-6) && S.no3 > no3 && Math.abs(M.nitrogenError(S)) < 1e-8, `level ${(100 * S.vol / S.P.volumeL).toFixed(1)} %, TDS ${S.tds.toFixed(1)} ppm`);
}

// 8. top-up refills the tank and dilutes it
{
  const S = M.create({ autoFeed: false, modules: FULL }); M.advance(S, 10 * DAY);
  const v = S.vol, tds = S.tds, n = M.nitrogenError(S); M.topUp(S);
  check('8 Top-up restores the level, dilutes solids and keeps nitrogen balanced', v < S.P.volumeL && S.vol === S.P.volumeL && S.tds < tds && near(M.nitrogenError(S), n, 1e-8), `TDS ${tds.toFixed(1)} -> ${S.tds.toFixed(1)} ppm`);
}

// 9. low water trips the existing dry-run interlock, and a top-up recovers
{
  const S = M.create({ autoFeed: false, modules: { evaporation: true }, params: { evapLDay: 6 } });
  let d = 0; while (S.filter.state !== 'FAULT' && d++ < 5 * DAY) M.step(S);
  const stopped = S.filter.state === 'FAULT' && S.filter.faultKind === 'dry' && S.filter.flow === 0, level = 100 * S.vol / S.P.volumeL;
  S.P.evapLDay = 0; M.topUp(S); M.advance(S, 10);
  check('9 Evaporation triggers dry-run protection, and a top-up restarts the pump', stopped && level < 70 && S.filter.state === 'RUNNING', `stopped at ${level.toFixed(1)} % level`);
}

// 10. modules off keep the earlier fixed-pH behaviour
{
  const S = M.create(); M.advance(S, 5 * DAY);
  check('10 Modules are off by default: pH, volume and alkalinity stay fixed', S.pH === S.P.pH && S.vol === S.P.volumeL && S.alk === S.P.alkMeqL);
}

// 11. full run stays physical and repeatable
{
  const run = () => { const S = M.create({ modules: FULL }); let ok = true; for (let d = 1; d <= 30; d++) { M.advance(S, DAY); ok = ok && S.pH > 2 && S.pH < 12 && S.doMg >= 0 && S.vol > 0; if (d % 7 === 0) M.waterChange(S, 0.25); } return { ok, e: Math.abs(M.nitrogenError(S)), j: JSON.stringify(M.snapshot(S)) }; };
  const a = run(), b = run();
  check('11 Full 30-day run stays physical, balanced and repeatable', a.ok && a.e < 1e-6 && a.j === b.j, 'nitrogen error ' + a.e.toExponential(1) + ' mg');
}

// 12. measured data parser
{
  const good = M.parseMeasuredCSV('﻿# real data\r\nday,temperature_c,ph,nitrate_mg_n_l\r\n1,26.1,7.8,\r\n2,26.0,,6.5\r\n');
  const bad = M.parseMeasuredCSV('day,ph\n1,20\nx,7\n3,7.5\n'), none = M.parseMeasuredCSV('time,ph\n1,7\n');
  check('12 Measured data import accepts valid rows and rejects bad ones', good.rows.length === 2 && good.errors.length === 0 && good.rows[1].no3 === 6.5 && good.rows[0].no3 === undefined && bad.rows.length === 1 && bad.errors.length === 2 && none.rows.length === 0 && none.errors.length === 1, `${bad.errors.length} bad rows rejected`);
}

// 13. comparison metrics
{
  const hist = [{ minute: 0, pH: 7, tempC: 26 }, { minute: 1440, pH: 8, tempC: 26 }];
  const r = M.compareMeasured(hist, [{ day: 0.5, pH: 7 }, { day: 1, pH: 9 }, { day: 5, pH: 1 }]), p = r.find(x => x.key === 'pH');
  check('13 Comparison reports bias, mean error and RMSE, and skips times outside the run', r.length === 1 && p.n === 2 && near(p.bias, -0.25, 1e-12) && near(p.mae, 0.75, 1e-12) && near(p.rmse, Math.sqrt(0.625), 1e-12), `bias ${p.bias}, RMSE ${p.rmse.toFixed(3)}`);
}

// 14. the template contains no data, and real data never enters the model state
{
  const t = M.parseMeasuredCSV(M.measuredTemplate());
  check('14 The measured-data template is blank, and the model holds no measured data', t.rows.length === 0 && t.columns.length === M.MEASURES.length && M.snapshot(M.create({ modules: FULL })).measured === null, t.columns.length + ' columns');
}

console.log(out.join('\n'));
console.log(pass + '/' + (pass + fail) + ' research realism checks passed');
if (fail) process.exit(1);
