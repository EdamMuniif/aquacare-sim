# AquaCare digital prototype (SIMULATION), v3.2

An interactive browser simulation of the proposed **Intelligent Feeding and Monitoring System for Small Freshwater Aquariums (2.5–10 Gallons) in Vilimalé'**. It is EE7008 Project 1, Group 2.

> **SIMULATION / DEMO DATA.** The prototype is not connected to any hardware. Every reading, alert and feeding event is generated in the browser. The pH ±0.1 and temperature ±0.5 °C figures are project targets, not results.

## Launch it

**Quickest:** double-click `dist/aquacare-demo-standalone.html`. It is one file and works offline in Chrome, Edge, Firefox or Safari. It needs no internet, install, account or server, so you can copy it to a USB stick or send it to a phone.

**From the source files:** double-click `index.html` in this folder. Keep the `css/` and `js/` folders next to it.

**Optional local server** (only needed if a locked-down browser blocks local files):

```
python -m http.server 8000
```

Then open http://localhost:8000.

## What's new in v3.2 (resume after closing)

- **The run survives closing the page.** It's saved in this browser as it runs. When you reopen the page, the same run is rebuilt and moved forward by the time you were away at the chosen speed. Every event in that gap is simulated.
- **Keep time running while the page is closed** switch in the Run panel (on by default), plus a notice on reopening with a **Start a fresh run** button.
- Background tabs keep true time. Earlier versions slowed the sim down when the tab was hidden.
- How it works: the engine is deterministic, so the browser stores only the starting settings and every action with its simulated time, not the readings. Reopening replays that list. A 30-day run rebuilds in well under a second.
- A closed page still can't run anything. True 24/7 operation needs a server or the real ESP32. Same browser and device only.
- Self-test now has 29 checks, including replay equivalence and catch-up.

## What was new in v3.1 (feeding paper [3])

- **Feeding mode switch.** AquaCare's ask-then-fallback (the design), plus *Manual only* and *Automatic only*, the two conditions compared in Setiawan et al. (CEPAT 2024).
- **Compare feeding modes.** Runs the same 30 days three times (same seed, owner model and faults) and reports feeds delivered, missed and late, and how often the owner was at the tank. The result can be exported to CSV. It does not model fish growth, stress, survival or water cloudiness.
- **Paper [3] study setup** preset: 2 feeds/day, a 36 × 22 × 26 cm tank and 6 fish shown.
- **LCD status bug** fault (a limitation the paper reports). The turbidity sensor damage it reports maps to the existing sensor-failure fault.
- **Reference panel** with the paper's reported outcomes (cloudiness timing, growth, stress, survival) and its limitations, labelled as its results only. The DOI on the review slide (v2i02) doesn't match volume 3(1), so check it before citing.
- Feed log CSV gains a `feeding_mode` column and a `missed_manual` outcome. The tour has 17 steps, and the self-test has 27 checks.

## What was new in v3

- **Four sensors.** pH (SEN0161) and DS18B20 temperature from the brief, plus TDS (SEN0244) and turbidity (SEN0189) from the reviewed paper [2] (Ayon et al., 2026). TDS and turbidity are tagged *Paper [2]*. The group still has to confirm them for the design.
- **The paper's processing rule.** For each reading: measure, calibrate (no calibration data yet, identity), validate (reject impossible values), take the mean of the last 5 valid samples, compare with the operating range, then alert. The **Sensors & processing** tab shows it live.
- **Reference operating ranges** from paper [2] are loaded as alert limits: 24–28 °C, pH 6.8–8.2, 180–280 ppm, ≤ 50 NTU. They are labelled as reference values, and one click sets them back to Not configured.
- **Perturbation tests** like the paper's: heater, vinegar and soil, plus a TDS rise (demo addition), live or scheduled. Detection and recovery times are logged and exportable. The **air bubbles** artefact shows the paper's turbidity limitation.
- The paper's own accuracy and timing figures appear in a reference panel only, with the 92.0 % table average versus 96 % abstract mismatch noted. They are never presented as results of this project.
- The tank has four probes, the water gets murky with turbidity, and a heater appears during heater tests. The chart, CSV exports (raw + valid flag + smoothed per sensor, plus a perturbation CSV), architecture diagram, app view and 16-step guided tour are all updated. The self-test now has 23 checks.

## What was new in v2

1. **Calendar-based simulation.** Pick a start date and up to three feed times per day, then run 30 days at 1× up to 4 simulated hours per real second. You can also step to the next feed or the next day, or run all 30 days at once. The daily cap resets at each simulated midnight. The 30-day calendar shows every day's feed outcomes, scenarios and alerts.
2. **A more reliable feeding state machine.** Each feed event is one record: reminder → 10-minute window → tank-button confirmation or automatic attempt → IR passage success or fault. Failed attempts count toward the cap and are never retried. The clock is event-driven, so a fast run processes every event exactly.
3. **Scenarios on chosen days.** Schedule Wi-Fi loss, sensor failure, a blocked chute, a missed-confirmation day or a power interruption. When one fires, a card shows how the local logic responded, step by step. **Load example month** gives a ready-made mix. A **simulated owner** can press the tank button for a set share of reminders.
4. **Graphs and export.** A 30-day pH and temperature chart, which can be zoomed to one day or the last 24 h, marks power cuts, Wi-Fi outages and sensor gaps. The feed log can be searched and filtered. There are three CSV exports (feed log, readings, event log), each marked **SIMULATION - DEMO DATA** on every row.
5. **Presentation.** The aquarium now has a school of small fish, shrimp, driftwood with moss, a rock cave the fish hide in, and layered plants. **Show the project logic** runs a guided walkthrough (16 steps in v3). Each step rebuilds its own state, so Back and Next always show the same thing.

## Presenting it

- **Guided:** press **Show the project logic**. Use Next/Back or the arrow keys, and Esc to exit.
- **Free demo:**
  1. Press Start and set the speed to 60×.
  2. Use **Jump to next feed** and press **Simulate physical tank button press** to show a manual confirmation.
  3. Let the next reminder expire to show the automatic fallback, then repeat with *Not detected* to show the fault.
  4. Press **Inject extra trigger (test)** to show the daily cap.
  5. Use the Live faults buttons, then open the Scenarios tab and press **Load example month**, then **Run all 30 days now**.
  6. Select a day in the calendar to drill into it.

On a phone, the presenter controls open from the button at the bottom of the screen.

## What's inside

| Path | Purpose |
|---|---|
| `index.html` | Page structure |
| `css/styles.css` | Design system and responsive layout |
| `js/engine.js` | Simulated firmware logic: calendar, schedule, 10-minute window, daily cap, dispense check, owner model, scenarios, alerts, Wi-Fi, power. It has no UI code. |
| `js/tank.js` | Animated aquarium illustration (SVG). Decorative only. |
| `js/app.js` | Dashboard, calendar, chart, logs, exports |
| `js/tour.js` | Guided "Show the project logic" mode |
| `js/selftest.js` | Logic self-test with 29 checks, including complete 30-day runs and scenarios. It also runs in the *Logic self-test* tab. |
| `tests/engine.test.js` | The same self-test from the command line: `node tests/engine.test.js` |
| `tools/build_single.py` | Rebuilds the standalone file: `python tools/build_single.py` |
| `cover/` | Cover plate for the presentation (PNG) and its design notes |
| `HOW-TO-RUN-AND-COLLECT-DATA.md` | Step-by-step guide to running the simulation and collecting data |

The self-test checks this **software model only**. A pass is not evidence that the physical system works.

## Decisions awaiting the team and supervisor

The **Assumptions** tab lists every rule the brief does not settle. The main ones:

- Whether failed attempts count toward the cap. The demo counts them.
- What happens after a power interruption. This is selectable in the demo.
- The alarm policy for Away Mode.
- The simulated owner's response rate, which is a demo assumption.
- Alert limits and portion size. These stay **Not configured** until the team sets them.

## Data and privacy

Everything stays in this browser. Settings and the current run are kept in local storage, so a reload or reopening continues the same run. Clearing browser data or using a private window removes them, so export the CSV files to keep the data.
