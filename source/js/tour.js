/*
 * AquaCare digital prototype - guided presentation ("Show the project logic")
 * Each step rebuilds its state from a clean reset, so Back and Next always show
 * the same thing. SIMULATION ONLY.
 */
(function () {
  'use strict';
  var A = window.aquacare;
  if (!A) return;
  var E = A.engine, $ = function (id) { return document.getElementById(id); };
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function openReminder() { E.jumpToNextFeed(); E.advanceTo(E.s.simTime + 5000, true); }
  // Moves the 3D view only. It never changes the run, the filter or any setting.
  function show3d(view) {
    var t = A.tank3d && A.tank3d(), sel = $('tankView');
    if (!t) return;
    if (sel) sel.value = view;
    t.setCamera(view);
  }

  var STEPS = [
    {
      title: 'What you are looking at',
      body: '<p>This is a <b>simulation</b> of the proposed AquaCare system. Nothing on screen comes from hardware. Every reading, alert and feed is generated in this browser and labelled as demo data.</p><p>The figures <b>pH &plusmn;0.1</b> and <b>temperature &plusmn;0.5 &deg;C</b> are project targets, not results.</p>',
      target: '#appbar', act: function () {}
    },
    {
      title: 'The proposed architecture',
      body: '<p>Four inputs feed one local controller: the pH sensor, the DS18B20 probe, the physical button at the tank and the IR beam-break in the feeder chute.</p><p>The <b>ESP32 runs all of the feeding logic itself.</b> Wi-Fi and the app are a secondary connection for readings, history and notifications.</p>',
      tab: 'arch', target: '#pane-arch', act: function () {}
    },
    {
      title: 'Four sensors, one processing rule',
      body: '<p>pH and temperature are in the AquaCare brief. <b>TDS (SEN0244) and turbidity (SEN0189)</b> were added from the reviewed paper [2], and the group still has to confirm them.</p><p>Each card shows the smoothed value, the latest raw reading and where the value sits against the paper\u2019s operating range. The clock now runs at <b>60&times;</b>: one real second is one simulated minute.</p>',
      target: '#sensorRow', act: function (live) { E.start(); E.setSpeed(60); }
    },
    {
      title: 'Measure, validate, smooth, compare, alert',
      body: '<p>For every sensor: take the raw reading, apply calibration (none yet), <b>reject impossible values</b>, average the <b>last 5 valid samples</b>, then compare with the operating range.</p><p>The paper lists smoothing before validation. This demo validates first, so one bad value cannot pull the average. The team should choose the order.</p>',
      tab: 'sens', target: '#pane-sens', act: function () {}
    },
    {
      title: 'A scheduled feed: ask first',
      body: '<p>At the scheduled time the controller <b>asks the owner</b>. The LCD, a blinking LED and the buzzer indicator show a reminder, and a 10-minute window starts.</p><p>The speed is now 10&times;, so the countdown is visible. The app gets a notification, but <b>it cannot confirm the feed</b>.</p>',
      target: '#feedCard', act: function () { openReminder(); E.setSpeed(10); }
    },
    {
      title: 'Manual feed confirmed at the tank',
      body: '<p>The owner feeds by hand and presses the <b>physical button at the tank</b>. The controller logs <b>Manual feed confirmed</b> and cancels the automatic dispense for this slot.</p><p>That feed counts toward the daily cap of 3.</p>',
      target: '#feedCard', act: function () { E.pressTankButton(); }
    },
    {
      title: 'No response: automatic fallback',
      body: '<p>At the next slot nobody presses the button. After 10 minutes the controller <b>checks the daily cap</b>, then the servo dispenses one portion.</p><p>Watch the chute: the <b>IR beam-break detects food passing</b>, and only then is the feed logged as successful. Passage is not the same as the fish eating it.</p>',
      target: '#bay', act: function (live) { openReminder(); E.expireNow(); }
    },
    {
      title: 'Blocked chute: fault, no retry',
      body: '<p>Same fallback, but this time <b>no food passes the beam</b>. The controller raises a feeder fault and logs the attempt as unsuccessful.</p><p>The failed attempt <b>still counts toward the cap</b>, so a jammed feeder can never keep dispensing.</p>',
      target: '#feedCard', act: function () { E.setPassageMode('none'); openReminder(); E.expireNow(); }
    },
    {
      title: 'Daily cap: no fourth feed',
      body: '<p>Three feeds are used today. An extra trigger is injected as a test, and the controller <b>skips it: daily cap reached</b>.</p><p>The cap resets at midnight on the simulated clock.</p>',
      target: '#feedCard', act: function () { E.injectTrigger(); }
    },
    {
      title: 'Wi-Fi loss: local logic carries on',
      body: '<p>Wi-Fi is cut, and on the next day nobody answers the reminder. <b>The automatic feed still runs</b>, because the schedule, window, cap and dispense check all live on the controller.</p><p>The app goes <b>stale</b>, and events queue until Wi-Fi returns.</p>',
      tab: 'app', target: '#pane-app',
      act: function () { E.ackFeederFault(); E.setPassageMode('detect'); E.setWifi(false); E.fastForwardNextDay(); openReminder(); E.expireNow(); }
    },
    {
      title: 'Sensor failure: show no data',
      body: '<p>Wi-Fi is back and the queue synced. Now the pH sensor is disconnected.</p><p>The controller shows <b>No data</b>, never an old value, and raises an equipment alert. Feeding is not affected.</p>',
      target: '#card-ph', act: function () { E.setWifi(true); E.setSensorStatus('ph', 'disconnected'); }
    },
    {
      title: 'A controlled change: vinegar lowers pH',
      body: '<p>The pH sensor is back. Now vinegar is added, as in the paper\u2019s tests. The simulated pH falls, the 5-sample average follows a few minutes later, and the controller raises <b>pH below operating range</b>.</p><p>The detection time is logged in Sensors &amp; processing. It reflects this demo\u2019s 1-minute sampling, not the paper\u2019s measured response time.</p>',
      target: '#card-ph', act: function () { E.setSensorStatus('ph', 'ok'); E.startPerturbation('vinegar', 60, 'live'); E.advanceTo(E.s.simTime + 8 * 60000, true); }
    },
    {
      title: 'Power interruption during a reminder',
      body: '<p>Power is cut while a reminder is open, then restored. With the current restart policy, the interrupted slot is <b>marked missed</b> and nothing is dispensed automatically.</p><p>This policy is a <b>team decision still to be confirmed</b>, and it can be switched in Alerts &amp; settings.</p>',
      target: '#bay',
      act: function (live) {
        E.setSensorStatus('ph', 'ok'); openReminder(); E.cutPower();
        if (live) later(function () { E.restorePower(); A.render(); }, 2600); else { E.restorePower(); E.settle(); }
      }
    },
    {
      title: 'All 30 days at a glance',
      body: '<p>Now the rest of the month runs in one go. A <b>simulated owner</b> answers some reminders, and scheduled scenarios inject Wi-Fi loss, sensor failures, a blocked chute, missed-confirmation days and power cuts.</p><p>Each calendar day shows its three feed outcomes and the scenarios that hit it. Select a day to drill in.</p>',
      target: '#monthSec',
      act: function () {
        if (!A.settings.scenarios.length) { A.settings.scenarios = window.AquaEngine.exampleScenarios(); E.syncScenarios(); }
        A.settings.owner.mode = 'simulated'; E.setSpeed(60); E.runToEnd();
      }
    },
    {
      title: 'Why ask first: three feeding modes',
      body: '<p>Reviewed paper [3] compared <b>manual</b> and <b>automatic</b> feeding. This runs the same 30 days three times, once with each of those and once with AquaCare\u2019s <b>ask-then-fallback</b>. The owner and the faults are identical each time.</p><p>Manual only misses feeds whenever the owner is away. Automatic only feeds on time, but nobody looks at the tank. Ask-then-fallback delivers like automatic and still brings the owner to the tank. Fish growth, stress and survival are <b>not</b> modelled; those are the paper\u2019s reported results, shown below the table.</p>',
      tab: 'modes', target: '#pane-modes', act: function (live) { if (live) setTimeout(function () { $('cmpBtn').click(); }, 200); }
    },
    {
      title: 'Trends',
      body: '<p>Simulated pH, temperature, TDS and turbidity for the whole run. Yellow markers are perturbation tests, and feed events are ticks underneath. Grey bands are power cuts, hatched bands are Wi-Fi outages, and gaps are sensor faults.</p><p>These are <b>synthetic demo readings</b>, not measurements.</p>',
      target: '#trendSec', act: function () { A.setRange('all'); }
    },
    {
      title: 'Feed log and CSV export',
      body: '<p>Every feed event is one row: reminder, button press, automatic attempt, IR result, outcome and the count after it. You can search and filter it.</p><p>The <b>CSV exports</b> (feed log, raw and smoothed readings, event log, perturbation tests) are all marked <b>SIMULATION - DEMO DATA</b> for analysis and slides.</p>',
      tab: 'feed', target: '#pane-feed', act: function () {}
    },
    {
      title: 'Proposal: one controller for every tank',
      body: '<p>The next three steps are <b>proposals that need project-team confirmation</b>. The last step is the filter design your group has confirmed. All four are simulated only, and nothing has been built.</p><p>A fixed 24 cm housing rests on the front rim. Rails slide out of both ends to corner clamps, so one controller spans all six tank settings: <b>31.4&ndash;49.9 cm wide and 15.7&ndash;24.9 cm deep</b>.</p>',
      target: '#bay', act: function (live) { if (live) show3d('controller'); }
    },
    {
      title: 'Proposal: mini 4-axis feeder arm',
      body: '<p>A turntable, shoulder, elbow and wrist carry a scoop from the hopper to the water, with a reach of about <b>8.7 cm</b> from the housing centre. An IR gate on the scoop lip confirms the drop, and no passage is a fault.</p><p><b>The feeding loop does not change.</b> The tank button still decides whether to feed, with the same cap of 3 a day. The camera only picks where to pour. Needs project-team confirmation.</p>',
      target: '#bay', act: function (live) { if (live) show3d('feeder'); }
    },
    {
      title: 'Proposal: top camera and its blind spots',
      body: '<p>One fixed <b>120&deg; lens</b> sees only about <b>81&deg; under water</b>, because light bends at the surface. It covers about 100% of the floor but only about <b>3&ndash;8% of the water just under the surface</b>, so fish at the upper ends and sides can be out of view.</p><p>The behaviour analysis is a rule-based stand-in, not a trained model. Press <b>Camera view</b> to see the cone. Needs project-team confirmation.</p>',
      target: '#bay', act: function (live) { if (live) show3d('top'); }
    },
    {
      title: 'Team-confirmed design: three-stage filter',
      body: '<p>A pump loop beside the tank, <b>off by default</b>, with a sponge, biological media and optional carbon. Bacteria mature over weeks, so ammonia and nitrite fall gradually. It never regulates pH or TDS. Low flow and low water both protect the pump.</p><p>The group has confirmed this design, but it has not been built. All values are illustrative, to confirm by measurement. Open <b>Water &rarr; Filter System</b> to try it.</p><p>Exit to keep exploring this run, or use Reset run to start fresh.</p>',
      target: '#bay', act: function (live) { if (live) show3d('reset'); }
    }
  ];

  var idx = 0, active = false, spotTimer = null;
  var tour = $('tour'), spot = $('spot');

  function baseline() {
    clearTimers();
    E.reset();
    A.settings.owner.mode = 'presenter';
    A.settings.awayMode = false;
    A.settings.policy.interruptedReminder = 'missed';
    E.clearLog();   // reset() already sets the next dispense to 'passage detected'
    E.addLog('demo', 'Guided presentation: state rebuilt for this step', { injected: true });
  }

  function go(k) {
    idx = Math.max(0, Math.min(STEPS.length - 1, k));
    baseline();
    for (var j = 0; j < idx; j++) { STEPS[j].act(false); E.settle(); }
    STEPS[idx].act(true);
    var st = STEPS[idx];
    $('tourStep').textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;
    $('tourTitle').textContent = st.title;
    $('tourBody').innerHTML = st.body;
    $('tourProg').style.setProperty('--p', ((idx + 1) / STEPS.length * 100) + '%');
    $('tourBack').disabled = idx === 0;
    $('tourNext').textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next';
    A.selectDay(null);
    if (st.tab) A.selectTab(st.tab);
    A.refresh();
    var el = document.querySelector(st.target);
    if (el) A.revealEl(el);
    if (el) {
      var y = el.getBoundingClientRect().top + window.scrollY - (document.getElementById('appbar').offsetHeight + 16);
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    placeSpot();
    $('tourTitle').focus({ preventScroll: true });
  }

  function placeSpot() {
    if (!active) return;
    var el = document.querySelector(STEPS[idx].target);
    if (!el) { spot.hidden = true; return; }
    var r = el.getBoundingClientRect();
    spot.hidden = false;
    spot.style.left = (r.left + window.scrollX - 6) + 'px';
    spot.style.top = (r.top + window.scrollY - 6) + 'px';
    spot.style.width = (r.width + 12) + 'px';
    spot.style.height = (r.height + 12) + 'px';
  }

  function open() {
    active = true;
    tour.hidden = false;
    document.body.classList.add('touring');
    var sheet = $('presenter');
    if (sheet.classList.contains('is-open')) { sheet.classList.remove('is-open'); $('scrim').hidden = true; }
    $('tourTitle').setAttribute('tabindex', '-1');
    go(0);
    spotTimer = setInterval(placeSpot, 250);
  }
  function close() {
    active = false;
    clearTimers();
    clearInterval(spotTimer);
    tour.hidden = true; spot.hidden = true;
    document.body.classList.remove('touring');
    E.addLog('demo', 'Guided presentation closed', { injected: true });
    A.save(); A.refresh();
    $('tourBtn').focus();
  }

  $('tourBtn').addEventListener('click', open);
  $('tourNext').addEventListener('click', function () { if (idx === STEPS.length - 1) close(); else go(idx + 1); });
  $('tourBack').addEventListener('click', function () { go(idx - 1); });
  $('tourExit').addEventListener('click', close);
  window.addEventListener('resize', placeSpot);
  window.addEventListener('scroll', placeSpot, { passive: true });
  document.addEventListener('keydown', function (ev) {
    if (!active) return;
    var tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); if (idx < STEPS.length - 1) go(idx + 1); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); if (idx > 0) go(idx - 1); }
  });
})();
