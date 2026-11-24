/*
 * AquaCare digital prototype - demo clips for screen recordings.
 * A clip is an ordered list of { at: seconds, caption, run }, played from one
 * timer queue. Only public engine calls are used, so every step is journaled
 * like a presenter control. SIMULATION ONLY.
 */
(function () {
  'use strict';
  var A = window.aquacare;
  if (!A) return;
  var E = A.engine, $ = function (id) { return document.getElementById(id); };
  var cap = $('clipCap'), tag = $('clipTag'), stopBtn = $('clipStopBtn');
  var timers = [], playing = null;

  function say(text) { cap.textContent = text; cap.hidden = false; }

  function stop() {
    timers.forEach(clearTimeout); timers = [];
    playing = null;
    cap.hidden = true; cap.textContent = ''; tag.hidden = true;
    stopBtn.disabled = true;
  }

  function play(clip) {
    stop();
    var tour = $('tour');
    if (tour && !tour.hidden) $('tourExit').click();        // a clip replaces a running tour
    var sheet = $('presenter');
    if (sheet.classList.contains('is-open')) $('presenterClose').click();
    $('scrim').hidden = true;
    playing = clip;
    stopBtn.disabled = false;
    tag.style.top = (Math.max(0, $('appbar').getBoundingClientRect().bottom) + 10) + 'px';
    tag.hidden = false;
    clip.steps.forEach(function (st) {
      timers.push(setTimeout(function () {
        if (st.run) st.run();
        if (st.caption) say(st.caption);
        A.refresh();
      }, st.at * 1000));
    });
    timers.push(setTimeout(stop, clip.end * 1000));        // caption and tag go; the final state stays
  }

  // Same clean start as the guided tour's baseline(), plus the default feed times and a clean screen.
  function baseline(name) {
    A.settings.slots = ['08:00', '13:00', '18:00'].map(function (t) { return { time: t, on: true }; });
    if (A.settings.feedMode !== 'hybrid') E.setFeedMode('hybrid');
    E.reset();
    A.settings.owner.mode = 'presenter';
    A.settings.awayMode = false;
    A.settings.policy.interruptedReminder = 'missed';
    E.clearLog();   // reset() already sets the next dispense to 'passage detected'
    E.addLog('demo', name + ': state rebuilt for this clip', { injected: true });
    E.start(); E.setSpeed(60);
    A.selectDay(null);
    A.setView('tank', { noScroll: true });
    window.scrollTo(0, 0);
  }
  function openReminder() { E.jumpToNextFeed(); E.advanceTo(E.s.simTime + 5000, true); }
  function letExpire() { if (E.s.phase === 'reminder') E.expireNow(); }
  function pressAtTank() { E.pressTankButton(); A.tank.pulseButton(); A.render(); }

  var DEMO1 = {
    name: 'Demo 1: one feed cycle', end: 29,
    steps: [
      { at: 0, run: function () { baseline('Demo 1: one feed cycle'); } },
      { at: 1, run: openReminder },
      { at: 1.6, caption: '08:00 scheduled feed: the controller asks the owner first' },
      { at: 5.6, run: pressAtTank },
      { at: 6.2, caption: 'Owner presses the button at the tank: manual feed logged' },
      { at: 10.5, run: openReminder },
      { at: 11.1, caption: '13:00 feed: no answer, the 10-minute window runs out' },
      { at: 19, run: letExpire },                            // about 9 of the 10 simulated minutes have run at 60x
      { at: 21, caption: 'Automatic fallback: dispense, IR check, logged' },
      { at: 24.5, caption: 'One cycle: ask, wait, dispense, check, log' }
    ]
  };

  var DEMO2 = {
    name: 'Demo 2: blocked chute', end: 28.5,
    steps: [
      { at: 0, run: function () { baseline('Demo 2: blocked chute'); } },
      { at: 1, run: openReminder },
      { at: 1.6, caption: '08:00 feed: the controller asks the owner' },
      { at: 5.5, run: function () { E.setPassageMode('none'); }, caption: 'Presenter injects a blocked chute: no food will pass the beam' },
      { at: 10.5, run: letExpire },
      { at: 12.5, caption: 'IR beam sees nothing: fault alert, not a false success' },
      { at: 17, caption: 'Fault alert latched. The feed is logged as failed.' },
      { at: 21.5, caption: 'The failed attempt still counts toward the daily cap: no retry' }
    ]
  };

  $('clip1Btn').addEventListener('click', function () { play(DEMO1); });
  $('clip2Btn').addEventListener('click', function () { play(DEMO2); });
  stopBtn.addEventListener('click', stop);
  $('tourBtn').addEventListener('click', function () { if (playing) stop(); });   // starting the tour ends a clip
})();
