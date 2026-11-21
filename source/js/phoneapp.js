/* Standalone AquaCare phone app page. SIMULATION: runs its own engine in this browser.
   It is not linked to the main simulation or to any hardware. */
(function () {
  'use strict';
  var Engine = window.AquaEngine, F = Engine.fmt, CAP = Engine.DAILY_CAP;
  var $ = function (id) { return document.getElementById(id); };
  var SPEEDS = [1, 60, 600, 3600], SPEED_NAME = { 1: '1×', 60: '60×', 600: '600×', 3600: '1 h/s' };

  var settings = Engine.defaultSettings();
  var engine = new Engine({ settings: settings });
  engine.setSpeed(60);

  var tank = new window.AquaTank($('tank'));
  tank.fishCount = settings.fishCount;
  tank.render(settings.tankGal);
  tank.setAnimate(true);

  var ui = new window.AquaPhoneUI({
    engine: function () { return engine; },
    tankGal: function () { return settings.tankGal; },
    setTankGal: function (v) {
      settings.tankGal = v;
      if (engine.s.filter) engine.setFilterFlow(engine.s.filter.flowSet);
      tank.render(v); tank.setAnimate(true);
      render();
    }
  });

  engine.on(function (type, d) {
    if (type === 'dispense') tank.dispense(d.phase, d.phase === 'start' && engine.s.dispense ? engine.s.dispense.outcome : d.outcome);
    ui.onEvent(type, d);
  });

  function press() { engine.pressTankButton(); tank.pulseButton(); render(); }
  tank.onButton(press);
  $('paPress').addEventListener('click', press);
  $('paRun').addEventListener('click', function () { if (engine.s.running) engine.pause(); else engine.start(); render(); });
  $('paSpeed').addEventListener('click', function () {
    var i = SPEEDS.indexOf(engine.s.speed);
    engine.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); render();
  });
  $('paWifi').addEventListener('click', function () { engine.setWifi(!engine.s.wifi); render(); });
  $('paReset').addEventListener('click', function () {
    engine.reset(); engine.setSpeed(60); ui.reset();
    tank.render(settings.tankGal); tank.setAnimate(true); render();
  });

  function mmss(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60); }
  function setText(id, t) { var n = $(id); if (n.textContent !== t) n.textContent = t; }

  function render() {
    var s = engine.s, sv = s.sensors, code = engine.systemState().code, nf = engine.nextFeed();
    setText('paClock', 'Day ' + s.day + ' ' + F.hhmm(s.simTime));
    setText('paRun', s.finished ? 'Done' : (s.running ? 'Pause' : 'Start'));
    $('paRun').setAttribute('aria-pressed', String(s.running));
    setText('paSpeed', SPEED_NAME[s.speed] || s.speed + '×');
    $('paPress').classList.toggle('is-due', s.phase === 'reminder');
    setText('paWifi', s.wifi ? 'Disconnect Wi-Fi' : 'Reconnect Wi-Fi');
    $('paWifi').setAttribute('aria-pressed', String(!s.wifi));
    ui.render();
    // the controller's own display, LED and buzzer on the tank picture
    var l1 = 'pH ' + (sv.ph.value == null ? '--.--' : sv.ph.value.toFixed(2)) + ' ' + (sv.temp.value == null ? '--.-' : sv.temp.value.toFixed(1)) + 'C', l2;
    if (code === 'reminder') l2 = 'FEED? BTN ' + mmss(engine.reminderLeft());
    else if (code === 'dispense') l2 = 'Dispensing...';
    else if (code === 'fault') l2 = 'FEEDER FAULT';
    else if (code === 'cap') l2 = 'Cap ' + s.feeds.counted + '/' + CAP + ' reached';
    else if (!s.clockSet) l2 = 'CLOCK NOT SET';
    else if (nf) l2 = 'Next feed ' + F.hhmm(nf.at);
    else l2 = 'Day ' + s.day + ' done';
    var anyAlert = s.alerts.some(function (a) { return !a.ack; });
    tank.update({
      power: s.power,
      led: s.power !== 'on' ? 'off' : (s.phase === 'reminder' ? 'blink' : (anyAlert ? 'fault' : 'ok')),
      buzzer: s.power === 'on' && (s.phase === 'reminder' || anyAlert),
      lcd: s.power === 'off' ? ['', ''] : (s.power === 'booting' ? ['AquaCare  SIM', 'Booting...'] : [l1, l2]),
      turb: sv.turb.water == null ? 5 : sv.turb.water,
      heater: false, bubbles: false,
      probes: { ph: sv.ph.status, temp: sv.temp.status, tds: sv.tds.status, turb: sv.turb.status },
      upkeep: engine.upkeep(),
      filter: null
    });
  }

  var last = performance.now();
  setInterval(function () {
    var now = performance.now(), dt = Math.min(1000, now - last);
    last = now;
    engine.tick(dt);
    render();
  }, 100);
  render();
})();
