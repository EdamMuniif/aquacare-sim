/* Real-Life Aquarium Research Simulation page. SIMULATION / DEMO DATA. Data stays in this browser tab. */
(function () {
  'use strict';
  var M = window.AquaResearchModel, $ = function (id) { return document.getElementById(id); };
  var S, running = false, carry = 0, last = 0, lastPaint = 0, lastFeeds = 0, tank = null, measured = [];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clock(m) { var d = Math.floor(m / 1440) + 1, t = m % 1440; return 'Day ' + d + ' ' + ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + t % 60).slice(-2); }
  function fix(x, dp) { return x == null ? '' : x.toFixed(dp); }

  function reset() {
    S = M.create({ start: $('rStart').value, modules: { chemistry: $('rChem').checked, evaporation: $('rEvap').checked } });
    lastFeeds = 0; carry = 0;
    $('rAmb').value = S.P.ambientC; $('rSet').value = S.P.setpointC;
    $('rFault').value = 'ok';
    paint(true);
  }
  function act(fn) { return function () { fn.call(this); paint(true); }; }

  function reading(k, dp) {
    var v = S.sensors[k], d = M.SENSORS[k];
    if (v.value == null) return '<span class="none">No data' + (v.status === 'ok' ? '' : ' (' + esc(v.status) + ')') + '</span>';
    return esc(v.value.toFixed(dp)) + (v.status === 'ok' ? '' : ' <span class="none">' + esc(v.status) + '</span>') + (d.uncalibrated ? ' <span class="none">uncalibrated</span>' : '');
  }
  function latestMeasured(key, dp) {
    var hit = null;
    measured.forEach(function (r) { if (r[key] != null && r.day * 1440 <= S.minute) hit = r; });
    return hit ? esc(hit[key].toFixed(dp)) + ' <span class="none">day ' + esc(hit.day) + '</span>' : '<span class="none">None</span>';
  }
  function paintRows() {
    var c = M.snapshot(S).calculated, none = '<span class="none">No sensor</span>', chem = S.mods.chemistry, na = '<span class="none">Not calculated</span>';
    var rows = [
      ['Temperature (°C)', fix(c.tempC, 2), reading('temp', 2), latestMeasured('tempC', 2)],
      [chem ? 'pH' : 'pH (held constant)', fix(c.pH, 2), reading('ph', 2), latestMeasured('pH', 2)],
      ['Alkalinity (meq/L)', chem ? fix(c.alkMeqL, 2) : na, none, latestMeasured('alk', 2)],
      ['Dissolved CO₂ (mg/L)', chem ? fix(c.co2MgL, 1) : na, none, '<span class="none">None</span>'],
      ['Water level (%)', S.mods.evaporation ? fix(c.levelPct, 1) : '<span class="none">Fixed at 100</span>', none, '<span class="none">None</span>'],
      ['TDS (ppm)', fix(c.tds, 0), reading('tds', 0), '<span class="none">None</span>'],
      ['Turbidity (NTU)', fix(c.turbNtu, 1), reading('turb', 1), latestMeasured('turbNtu', 1)],
      ['Dissolved oxygen (mg/L)', fix(c.doMg, 2) + ' <span class="none">' + Math.round(c.doPct) + ' % sat.</span>', none, latestMeasured('doMg', 2)],
      ['Total ammonia (mg N/L)', fix(c.tan, 3), none, latestMeasured('tan', 3)],
      ['Un-ionised NH₃ (mg N/L)', fix(c.nh3, 4), none, '<span class="none">None</span>'],
      ['Nitrite (mg N/L)', fix(c.no2, 3), none, latestMeasured('no2', 3)],
      ['Nitrate (mg N/L)', fix(c.no3, 1), none, latestMeasured('no3', 1)]
    ];
    $('rRows').innerHTML = rows.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th><td class="num">' + r[1] + '</td><td class="num">' + r[2] + '</td><td class="num">' + r[3] + '</td></tr>'; }).join('');
    $('rWaterNote').textContent = (measured.length ? 'Measured values come from the file you loaded. ' : 'No measured aquarium data has been loaded. ') + (chem ? 'pH is calculated from alkalinity and dissolved CO₂. ' : 'pH is held constant in this mode. ') + 'The turbidity sensor has no published NTU calibration.';
  }
  function paintCompare() {
    var rows = measured.length ? M.compareMeasured(S.hist, measured) : [];
    $('rCompareWrap').hidden = !rows.length;
    $('rCompare').innerHTML = rows.map(function (r) { var d = r.key === 'tan' || r.key === 'no2' ? 3 : 2; return '<tr><th scope="row">' + esc(r.label) + ' (' + esc(r.unit) + ')</th><td class="num">' + r.n + '</td><td class="num">' + r.bias.toFixed(d) + '</td><td class="num">' + r.mae.toFixed(d) + '</td><td class="num">' + r.rmse.toFixed(d) + '</td></tr>'; }).join('');
  }
  function paintFilter() {
    var c = M.snapshot(S).calculated, F = S.filter, rows = [
      ['Pump', F.state], ['Flow', Math.round(F.flow) + ' L/h'], ['Sponge load', Math.round(F.load * 100) + ' %'], ['Resistance', F.R.toFixed(1) + '×'],
      ['Biofilter maturity', Math.round(c.bioPct) + ' %'], ['Trapped solids', c.spongeMg.toFixed(0) + ' mg'], ['Settled waste', c.detritusMg.toFixed(0) + ' mg'], ['Heater', S.heaterOn ? 'Heating' : (S.heaterEnabled ? 'Idle' : 'Disabled')]
    ];
    $('rFilter').innerHTML = rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
  }
  function spark(key, label, unit, dp) {
    var h = S.hist, vals = h.map(function (x) { return x[key]; }), hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals), span = hi - lo || 1;
    var pts = vals.map(function (v, i) { return (vals.length > 1 ? i / (vals.length - 1) * 300 : 0).toFixed(1) + ',' + (58 - (v - lo) / span * 54).toFixed(1); }).join(' ');
    return '<figure><figcaption>' + label + ': ' + vals[vals.length - 1].toFixed(dp) + ' ' + unit + ' (range ' + lo.toFixed(dp) + '–' + hi.toFixed(dp) + ')</figcaption><svg viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="' + label + ' over the run, calculated simulation data"><polyline points="' + pts + '"></polyline></svg></figure>';
  }
  function paintCharts() {
    $('rCharts').innerHTML = S.hist.length < 2 ? '<p class="fine">Trends appear after the first simulated hours.</p>' :
      spark('tempC', 'Temperature', '°C', 2) + (S.mods.chemistry ? spark('pH', 'pH', 'pH', 2) + spark('alk', 'Alkalinity', 'meq/L', 2) : '') + (S.mods.evaporation ? spark('levelPct', 'Water level', '%', 1) : '') + spark('doMg', 'Dissolved oxygen', 'mg/L', 2) + spark('tan', 'Total ammonia', 'mg N/L', 3) + spark('no2', 'Nitrite', 'mg N/L', 3) + spark('no3', 'Nitrate', 'mg N/L', 1) + spark('turbNtu', 'Turbidity', 'NTU', 1);
  }
  function paint(all) {
    $('rClock').textContent = clock(S.minute);
    $('rState').textContent = running ? 'Running' : 'Paused';
    $('rRun').textContent = running ? 'Pause' : 'Start';
    var F = S.filter, pumpOn = F.pumpCmd && F.state !== 'OFF';
    $('rPump').textContent = pumpOn ? 'Stop pump' : 'Start pump';
    $('rHeater').textContent = S.heaterEnabled ? 'Disable heater' : 'Enable heater';
    $('rPower').textContent = S.power === 'on' ? 'Cut power' : 'Restore power';
    $('rAmbOut').textContent = S.P.ambientC + ' °C'; $('rSetOut').textContent = S.P.setpointC + ' °C';
    $('rTopUp').disabled = !S.mods.evaporation;
    paintRows(); paintCompare(); paintFilter(); paintCharts();
    $('rLog').innerHTML = S.events.length ? S.events.slice(0, 30).map(function (e) { return '<li><time>' + clock(e.minute) + '</time>' + esc(e.text) + '</li>'; }).join('') : '<li>No events yet</li>';
    if (tank) tank.update(M.toTank3D(S));
  }

  // Timer-driven so the run does not depend on the page being painted.
  function tick() {
    var now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (running) {
      carry += dt * +$('rSpeed').value;
      var n = Math.min(Math.floor(carry), 2880);
      carry -= n;
      M.advance(S, n);
      if (tank && S.feedCount > lastFeeds && +$('rSpeed').value <= 60) { tank.dispense('start'); tank.dispense('chute', 'detect'); }
      lastFeeds = S.feedCount;
    }
    if (now - lastPaint > 300) { lastPaint = now; paint(); }
  }

  // assumptions table
  $('rParams').innerHTML = M.PARAMS.concat(M.HIDDEN_PARAMS).map(function (x) {
    var v = typeof x.value === 'number' && !Number.isInteger(x.value) ? +x.value.toPrecision(4) : x.value;
    return '<tr><td><span class="rtag rtag--' + x.cls + '">' + x.cls.charAt(0).toUpperCase() + x.cls.slice(1) + '</span></td><td>' + esc(x.key) + '</td><td class="num">' + esc(v) + ' ' + esc(x.unit) + '</td><td>' + esc(x.source || '-') + '</td><td>' + esc(x.note) + '</td></tr>';
  }).join('');

  $('rRoadmap').innerHTML = M.ROADMAP.map(function (r) { return '<tr><th scope="row">' + esc(r.stage) + '</th><td>' + esc(r.status) + '</td><td>' + esc(r.note) + '</td></tr>'; }).join('');

  $('rChem').addEventListener('change', function () { running = false; reset(); });
  $('rEvap').addEventListener('change', function () { running = false; reset(); });
  $('rTopUp').addEventListener('click', act(function () { M.topUp(S); }));
  $('rTemplate').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([M.measuredTemplate()], { type: 'text/csv;charset=utf-8' }));
    a.download = 'aquacare-real-tank-measurements-template.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  $('rMeasured').addEventListener('change', function () {
    var file = this.files[0], input = this; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var p = M.parseMeasuredCSV(reader.result);
      measured = p.rows;
      $('rClearMeasured').disabled = !measured.length;
      $('rMeasuredState').textContent = measured.length ? 'Loaded ' + measured.length + ' measured rows from ' + file.name + (p.errors.length ? '. Skipped ' + p.errors.length + ' invalid rows: ' + p.errors.slice(0, 3).join('; ') : '.') : 'No rows loaded. ' + p.errors.slice(0, 3).join('; ');
      input.value = ''; paint(true);
    };
    reader.onerror = function () { $('rMeasuredState').textContent = 'The file could not be read.'; };
    reader.readAsText(file);
  });
  $('rClearMeasured').addEventListener('click', act(function () { measured = []; this.disabled = true; $('rMeasuredState').textContent = 'No measured data loaded.'; }));

  $('rRun').addEventListener('click', function () { running = !running; paint(); });
  $('rReset').addEventListener('click', function () { running = false; reset(); });
  $('rStart').addEventListener('change', function () { running = false; reset(); });
  $('rFeed').addEventListener('click', act(function () { M.feed(S); if (tank) { tank.dispense('start'); tank.dispense('chute', 'detect'); } lastFeeds = S.feedCount; }));
  $('rWater').addEventListener('click', act(function () { M.waterChange(S, 0.25); }));
  $('rSiphon').addEventListener('click', act(function () { M.siphon(S, 0.3); }));
  $('rSponge').addEventListener('click', act(function () { M.cleanSponge(S); }));
  $('rPump').addEventListener('click', act(function () { var F = S.filter; M.setPump(S, !(F.pumpCmd && F.state !== 'OFF')); }));
  $('rHeater').addEventListener('click', act(function () { M.setHeater(S, !S.heaterEnabled); }));
  $('rPower').addEventListener('click', act(function () { M.setPower(S, S.power !== 'on'); }));
  $('rAmb').addEventListener('input', act(function () { S.P.ambientC = +this.value; }));
  $('rSet').addEventListener('input', act(function () { S.P.setpointC = +this.value; }));
  $('rSensor').addEventListener('change', function () { $('rFault').value = S.sensors[this.value].status; });
  $('rFault').addEventListener('change', act(function () { M.setSensor(S, $('rSensor').value, this.value); }));

  try {
    if (window.AquaTank3D && window.ResizeObserver && window.IntersectionObserver) { tank = new window.AquaTank3D($('tank3d')); tank.render('5', 6); }
  } catch (e) { tank = null; }
  if (!tank) $('rTankCap').textContent = '3D graphics are unavailable in this browser. The simulation still runs.';

  reset();
  window.aquaResearch = { state: function () { return S; }, model: M };
  last = performance.now();
  setInterval(tick, 100);
})();
