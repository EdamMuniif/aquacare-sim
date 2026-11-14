# AquaCare digital prototype: how to run the simulation and collect data

EE7008 Project 1 · Group 2 · Prototype v4 (four sensors, feeding modes, resume after closing, phone/tablet/desktop layout)

> **Read this first.** The prototype is a **simulation**. Every reading, alert, feed and CSV row it produces is **demo data** generated in the browser. None of it is a hardware measurement or a test result. The pH ±0.1 and temperature ±0.5 °C figures are **project targets**, not results. Every exported file and every row is labelled `SIMULATION - DEMO DATA`. Keep that label wherever you use the data.
>
> **Sensors.** pH and temperature are in the AquaCare brief. **TDS (SEN0244) and turbidity (SEN0189)** were added from the reviewed paper [2] (Ayon et al., arXiv 2026), and the group still has to confirm them for the design. The operating ranges (24–28 °C, pH 6.8–8.2, 180–280 ppm, ≤ 50 NTU) are the paper's **reference values**, not fish-safe thresholds confirmed for AquaCare. The paper's accuracy figures and response times are its own results and are shown only in a reference panel.
>
> **Feeding modes.** *Manual only* and *Automatic only* are comparison conditions modelled on reviewed paper [3] (Setiawan et al., CEPAT 2024). AquaCare's design is *ask, then fall back*. Paper [3]'s fish growth, stress, survival and water-cloudiness results are shown as its reported results only. The simulation does not model any of them.

---

## 1. Open the simulation

| Option | How | When to use it |
|---|---|---|
| **Standalone file** (recommended) | Double-click `dist/aquacare-demo-standalone.html` | Presentations, USB stick, sending to a phone. One file, works offline. |
| Source files | Double-click `index.html` in the project folder (keep `css/` and `js/` beside it) | Editing the code |
| Local server | In the project folder, run `python -m http.server 8000`, then open `http://localhost:8000` | Only if a locked-down browser refuses to open local files |
| Live link | The published Claude page | Quick viewing. CSV saves ask you to confirm each file. |

It works in Chrome, Edge, Firefox and Safari. It needs no internet, account or install.

---

## 2. What is on the screen

The page works the same on an iPhone, an Android phone, a tablet and a desktop monitor. The layout changes with the screen size:

| Screen | Section menu | Presenter controls |
|---|---|---|
| Phone (portrait) | Tab bar at the bottom | **Controls** button (sliders icon) at the top right opens a bottom sheet |
| Phone (sideways) | Compact tab bar at the bottom | Slides in from the right |
| Tablet, small laptop | Tab bar at the bottom | **Controls** button opens a side drawer |
| Desktop and monitors (1280 px and wider) | Menu in the top bar | Always visible on the right |

The browser **Back** button (or Android back gesture) returns to the previous section.

| Part | What it shows |
|---|---|
| Yellow-and-black **SIMULATION** bar | Reminder that everything is demo data. The top bar also carries a **SIM** tag that stays visible while you scroll. |
| **Top bar** | AquaCare, the section menu, the simulated clock ("Day X of 30", date, speed), **Start/Pause**, **Controls** and **Show the project logic** |
| **Status strip** | Feeds today (x/3), next feed, system state, Wi-Fi/app, alerts |

The five sections:

| Section | What's in it |
|---|---|
| **Tank** | The animated tank (feeder, IR beam, probes, LCD, LED, buzzer, tank button), the feeding cycle card with the countdown and the 5 logic steps, the four sensor cards, system health and recent events |
| **Water** | The four sensor cards, the processing rule (measure → calibrate → validate → smooth 5 → compare → alert), system health, the four stacked charts, and the tabs **Sensors & processing** and **pH calibration** |
| **Feeding** | The feeding cycle card, run setup (start date, feed times), the 30-day calendar, the tabs **Feed log**, **Feeding modes** and **Scenarios**, and the charts |
| **Records** | **Event log** and **App view** |
| **Project** | Project title and summary, the tabs **Alerts & settings**, **Architecture**, **Assumptions** and **Logic self-test**, and the document title block |

A first-visit card on the Tank section explains how to start. **Got it** hides it for good on that browser.

### 2.1 What the tank picture shows

| Effect | Driven by | Status |
|---|---|---|
| Brown haze and drifting dust | The simulated **turbidity** reading. More NTU means more, larger and browner particles. | Follows the simulation data |
| Green film and spots on the glass, scum ring at the waterline | Simulated days since **Wipe glass**, slightly faster with each feed delivered | Illustrative only |
| Hair algae on the driftwood and rock arch | Days since the glass or gravel was last cleaned, plus feeds | Illustrative only |
| Mulm and debris on the gravel (heaviest in corners and behind decor) | Days since **Siphon gravel**, plus feeds | Illustrative only |
| Biofilm on the probes | Days since **Clean probes** | Illustrative only |
| Uneaten pellets darken on the gravel | Each successful dispense | Illustrative only |

The tank starts the run 1.5 simulated days after a clean, so it looks lived-in. Cleaning is in **Presenter controls → Tank upkeep (illustrative)**: **Wipe glass**, **Siphon gravel**, **Clean probes** or **Full clean**. Each one is logged as a presenter action. The upkeep model never changes a sensor reading, alert or feed decision, and it isn't a measured growth rate. Don't report it as a result.

---|---|
| Yellow-and-black **SIMULATION** bar (top) | Permanent reminder that everything is demo data |
| **Simulated clock** (top right) | Simulated time, date and "Day X of 30", the speed chip, and Running/Paused |
| **Status strip** | Feeds today (x/3), next feed, system state, Wi-Fi/app, alerts |
| **Sensor row** (below the status strip) | Four cards: pH, temperature, TDS, turbidity. Each shows the smoothed value, the latest raw reading, a range gauge, In range / Above / Below, and a trend line. TDS and turbidity carry a *Paper [2]* tag. |
| Left column | Processing rule (measure → calibrate → validate → smooth 5 → compare → alert) and system health |
| Centre | Animated tank with the proposed feeder, IR beam, probes, LCD, LED, buzzer and tank button. Below it are the **feeding cycle** card (countdown and the 5 logic steps), the scenario response card and recent events. |
| Right column (**Presenter controls**) | Run, speed, feeding, live faults for all four sensors, **perturbation tests**, water baselines, display.  |
| **30-day run** section | Run setup (start date, feed times) and the 30-day calendar |
| **Graphs** section | Four stacked charts (pH, temperature, TDS, turbidity) with range lines and perturbation markers: all 30 days, the selected day, or the last 24 h |
| Tabs | Feed log · Event log · **Sensors & processing** · **Feeding modes** · Scenarios · Alerts & settings · pH calibration · Architecture · App view · Assumptions · Logic self-test |

---

## 3. Run a simulation

### 3.1 Set up the run

1. Scroll to **30-day run**.
2. Set the **Start date**. It sets the calendar dates only and does not change the results.
3. Set up to **three feed times**. Untick a slot to switch it off. Enabled times must be at least 15 minutes apart.
4. Press **Apply and restart run**. The run goes back to Day 1, two minutes before the first feed time, paused.

### 3.2 Choose who presses the tank button

In **Presenter controls → Feeding → Who presses the tank button**:

- **Presenter (press it yourself).** Nothing confirms a feed unless you press **Simulate physical tank button press**, or click the red button on the tank enclosure. If you don't, every reminder runs out and falls back to an automatic feed. Use this for live demos.
- **Simulated owner.** A simulated owner presses the button for a set share of reminders (default **60%**), 1 to 9 minutes after the reminder starts. Use this for 30-day data runs. The response rate is a **demo assumption**, not observed behaviour.

### 3.2b Choose the feeding mode

**Presenter controls → Feeding → Feeding mode:**

- **AquaCare: ask, then fall back** (the design, default). Reminder → 10-minute window → tank button, or an automatic dispense if nobody presses.
- **Manual only** (comparison, paper [3]). Same reminder and button, but **no fallback**: if nobody presses, the feed is logged *Missed, manual-only mode*.
- **Automatic only** (comparison, paper [3]). No reminder; the feeder runs at the slot time.

### 3.3 Start and control time

Press **Start**, then pick a speed:

| Speed | 10-minute window takes | One simulated day takes | 30 days take |
|---|---|---|---|
| 1× (real time) | 10 min | 24 h | 30 days |
| 10× | 60 s | 2.4 h | 3 days |
| 60× | 10 s | 24 min | 12 h |
| 600× | 1 s | 2.4 min | 72 min |
| 1 h/s (3600×) | under 1 s | 24 s | 12 min |
| 4 h/s (14400×) | instant | 6 s | 3 min |

Anything above 1× is labelled **DEMO SPEED** on screen.

Shortcuts:

| Button | What it does |
|---|---|
| **Jump to next feed** | Moves the clock to 5 s before the next feed slot |
| **Next day →** | Simulates everything up to 2 min before the first slot tomorrow. Nothing is skipped. |
| **Run all 30 days now** | Simulates the rest of the run instantly. Every event is still processed. |
| **Reset run** | Back to Day 1, paused. The log, feed records and readings are cleared. |

The run stops on its own at the end of Day 30.

### 3.3b Closing the page and coming back

A web page can't run code while it's closed, so the simulation can't truly keep going in the background. Instead it saves the run in this browser every 2 seconds and whenever you close or hide the tab. When you open the page again it rebuilds the same run and catches up on the time you were away.

- With **Keep time running while the page is closed** ticked (the default), a running sim moves forward by *time away × speed*. Away 2 hours at 60× means 120 simulated hours, so about 5 days. Every feed, scenario and fault in that gap is simulated, the same as if the page had stayed open.
- With it unticked, the run comes back exactly where you left it.
- A paused run always comes back paused.
- A notice at the top says what happened. **Start a fresh run** discards the saved run.
- A background tab keeps true time too. Browsers slow hidden tabs down, and the sim makes up the difference on the next update.

The catch-up stops at the end of Day 30. At 1× a full run still takes 30 real days. For a 30-day run in one sitting, use 600× or faster.

What it can't do:

- It only works in the same browser on the same device. Phone and laptop each keep their own run.
- Clearing browsing data, or a private/incognito window, removes the saved run.
- Don't run the sim in two tabs at once. Whichever tab saves last wins.
- Real 24/7 operation needs something that is always on: a small server, or the actual ESP32 controller.

Export the CSV files before anything you'd hate to lose. The saved run is a convenience, not a backup.

### 3.4 Show each required flow

Set the speed to **60×** first.

| Flow | Steps | What to point at |
|---|---|---|
| Manual confirmation | **Jump to next feed** → wait for the reminder → **Simulate physical tank button press** | Log: "Manual feed confirmed", automatic dispense cancelled |
| Countdown expiry | **Jump to next feed** → let the 10 min run out (about 10 s), or press **Let reminder expire** | Cap check → servo → IR check |
| Passage detected | Next dispense set to **Passage detected** (default) | Beam flashes. Outcome "Auto, passage detected". |
| Passage not detected | Set **Not detected**, then repeat the expiry flow | Feeder fault raised. The attempt is unsuccessful and **counts toward the cap**. |
| Daily cap | After 3 feeds today, press **Inject extra trigger (test)** | "Feed skipped: daily cap reached" |
| Sensor fault | Live faults → any of the four sensors → **Disconnected** or **Faulty** | Reading shows **No data**. *Faulty* sends impossible values, which validation rejects and counts. An equipment alert appears. |
| Water-quality alert (perturbation test) | Perturbation tests → **Heater on**, **Add vinegar**, **Add soil** or **Raise TDS (demo)** | The simulated water changes, the 5-sample average follows, and an *above/below operating range* alert is raised. The detection time is logged in **Sensors & processing**. |
| LCD status bug (paper [3]) | Live faults → **LCD status: updating** (toggle) | The LCD freezes on an old status while feeding, readings and alerts carry on. The health list shows the fault, and the event log stays correct. |
| Manual vs automatic vs AquaCare | **Feeding modes** tab → **Compare feeding modes** | Three 30-day runs with the same seed, owner and faults. The table shows feeds delivered, missed, owner at the tank, and delays. |
| Bubbles artefact | **Air bubbles at turbidity sensor: on** | Raw turbidity spikes. Validation cannot reject them (they are physically possible), and smoothing damps most of them. Compare raw and smoothed in **Sensors & processing**. |
| Wi-Fi loss | **Disconnect Wi-Fi**, then run a feed | Feeding continues locally. The **App view** tab goes stale and events are tagged *queued*. |
| Power interruption | **Cut power** during a reminder → **Restore power** | The slot is marked missed (default restart policy) |
| Reset | **Reset run** | Day 1, 0/3, paused |

For a scripted version, press **Show the project logic**. This 17-step guided mode **rebuilds its own state at each step**, so **do not open it in the middle of a data-collection run**. It replaces the current run.

### 3.5 Schedule faults on chosen days (Scenarios tab)

1. Open the **Scenarios** tab.
2. Choose the **Day**, **Type**, and (where asked) the sensor, start time and duration:
   - **Wi-Fi loss**: app link down for the duration
   - **Sensor failure**: any of the four sensors, disconnected or giving invalid values
   - **Perturbation test**: heater (temperature rise), vinegar (pH drop), soil (turbidity rise) as in paper [2], or a TDS rise (demo addition). The duration is how long the stimulus lasts; the water then recovers.
   - **Air bubbles at turbidity sensor**: false spikes in raw turbidity for the duration
   - **LCD status not updating**: the display freezes for the duration (paper [3] limitation)
   - **Blocked chute**: every dispense in the window finds no IR passage
   - **Missed confirmation**: the simulated owner does not press the button all day. This only has an effect when **Simulated owner** is selected.
   - **Power interruption**: controller off for the duration
3. Press **Add scenario**.
4. Or press **Load example month** for a ready-made set of 16 scenarios (including the four perturbation tests and a bubbles day). This also switches on the simulated owner.

Add scenarios **before** the run reaches their day. A scenario whose time has already passed is shown as "Not run: time had passed". Press **Reset run** to include it.

When a scenario starts or ends, the **Scenario** card under the feeding cycle explains how the local logic responded. The full sequence is in the Event log, filtered by *Scenarios and logic responses*.

### 3.6 Optional settings (Alerts & settings tab)

- **Operating ranges** start loaded with the **reference values from paper [2]**: temperature 24–28 °C, pH 6.8–8.2, TDS 180–280 ppm, turbidity ≤ 50 NTU. The panel says where they came from. **Set all to Not configured** clears them (then no water-quality alerts are evaluated), and **Load reference ranges** restores them. If the team enters its own values, the source changes to *team-entered*.
- **Rate-of-change** limits (pH and temperature) start as *Not configured*.
- **Portion size** is a text label only.
- **After a power interruption:** choose whether to mark the slot missed or restart the window, and whether to keep or reset the daily count. Both are marked *Requires team decision*.
- **Away Mode** (proposed) skips the hand-feed reminder. Alerts stay visible.

---

## 4. Collect data

### 4.1 What the simulation records

| Record | Granularity | Where you see it |
|---|---|---|
| **Feed records** | One row per scheduled (or injected) feed event | Feed log tab, calendar |
| **Readings** | One sample per simulated minute for all four sensors: raw value, whether validation passed it, and the 5-sample smoothed value (about 42,700 rows for 30 days) | Graphs, sensor cards |
| **Perturbation tests** | One row per test: baseline, peak, how long until the alert, how long until back in range | Sensors & processing tab |
| **Feeding-mode comparison** | One table for three 30-day runs (manual only, automatic only, ask-then-fallback) | Feeding modes tab |
| **Events** | Every state change, alert, scenario, logic response and presenter action | Event log tab |

### 4.2 Export the CSV files

Open the **Feed log** tab and press:

- **Export feed log CSV**
- **Export readings CSV (raw + smoothed)**
- **Export event log CSV**

Then open the **Sensors & processing** tab and press **Export perturbation tests CSV**, and the **Feeding modes** tab and press **Export comparison CSV** (after running the comparison).

From the standalone file, the files go to your browser's Downloads folder. On the live link, confirm each save. Filenames look like:

```
aquacare-SIMULATION-DEMO-DATA-feed-log-2026-11-13.csv
aquacare-SIMULATION-DEMO-DATA-readings-2026-11-13.csv
aquacare-SIMULATION-DEMO-DATA-event-log-2026-11-13.csv
aquacare-SIMULATION-DEMO-DATA-perturbation-tests-2026-11-13.csv
aquacare-SIMULATION-DEMO-DATA-feeding-mode-comparison-2026-11-13.csv
```

**Export before you reload the page or press Reset run.** Settings and scenarios are remembered by the browser, but run data is not.

The Feed log search and filters change what you see on screen. The CSV always contains the whole run.

### 4.3 File format

Every file starts with comment lines (beginning with `#`) and a blank line: **three** comment lines in the feed and event logs, **four** in the readings, perturbation and comparison files (the extra line states the sensor scope and ranges, the detection-time caveat, or what the comparison does not model). The comments give the SIMULATION label, the run settings (start date, feed times, who pressed the button, number of scenarios) and the export time. The column header comes next.

**Feed log columns**

| Column | Meaning | Values |
|---|---|---|
| `label` | Evidence label | `SIMULATION - DEMO DATA` |
| `sim_day` | Day of the run | 1–30 |
| `date` | Calendar date from the start date | YYYY-MM-DD |
| `slot` | Feed slot | e.g. `13:00`, or `13:05 (injected)` |
| `source` | Where the trigger came from | `schedule`, `injected` |
| `feeding_mode` | Mode in force for this feed | `hybrid` (AquaCare), `manual`, `auto` |
| `reminder_time` | When the reminder started | HH:MM:SS, blank if none (Away Mode, cap skip, no power) |
| `button_press_time` | Tank-button confirmation | HH:MM:SS or blank |
| `pressed_by` | Who pressed | `simulated owner`, `presenter`, blank |
| `window_expired_time` | When the 10-minute window ran out | HH:MM:SS or blank |
| `auto_attempt_time` | When the automatic dispense started | HH:MM:SS or blank |
| `ir_result` | IR beam-break result | `passage detected`, `no passage`, `unknown` (power lost mid-dispense) |
| `outcome` | Final result | `manual`, `auto_ok`, `auto_fail`, `cap_skip`, `missed_power`, `missed_manual` (manual-only mode, nobody pressed), `in progress` |
| `count_after` | Daily count after this event | e.g. `2/3` |
| `notes` | Context | e.g. `chute blocked (scenario)`, `Wi-Fi offline`, `interrupted by power loss` |

**Readings columns:** `label, sim_day, date, time`, then for each sensor three columns (`ph_…`, `temperature_c_…`, `tds_ppm_…`, `turbidity_ntu_…`):

| Column | Meaning |
|---|---|
| `…_raw` | The raw simulated reading before processing (`no data` if disconnected or no power) |
| `…_raw_valid` | `yes` if local validation passed it, `no` if it was rejected as impossible, blank if there was no reading |
| `…_smoothed` | Mean of the last 5 valid readings: the value the controller compares with the range (`no data` after a rejection or disconnection) |

followed by `controller (on/off), wifi (connected/offline)`.

**Perturbation tests columns:** `label, sim_day, date, start_time, test, parameter, source (as in paper [2] / demo addition), triggered_by (scenario / live), stimulus_min, baseline, peak, unit, alert_after_min, back_in_range_after_min, operating_range`. A blank `alert_after_min` means no alert was raised, usually because no range was set for that parameter.

**Comparison columns:** `label, measure, manual_only, automatic_only, ask_then_fallback`. Measures: scheduled feed events, feeds delivered, owner at the tank (manual feeds), automatic with passage, automatic with no passage, feeds missed (split into manual-only and no-power), days with every feed delivered, mean and maximum delay after the scheduled time (minutes).

**Event log columns:** `label, sim_day, date, time, event_type, description, injected_by_presenter (yes/no), queued_offline (yes/no)`.

### 4.4 Recommended data-collection runs

Use **Run all 30 days now** for these. Runs started from **Reset run** with the same settings give **identical data every time**, because the simulation uses fixed random seeds. Any team member can repeat a run and get the same files. If you change a setting partway through a run, or inject faults by hand, the run can only be repeated by doing the same actions at the same points.

| Run | Settings | Purpose |
|---|---|---|
| **A: Baseline** | 3 slots (08:00 / 13:00 / 18:00), Simulated owner 60%, no scenarios | Normal operation of the ask-then-fallback loop over 30 days |
| **B: Example month** | Scenarios → **Load example month** → Reset run → Run all 30 days now | How the local logic handles each fault type |
| **C: Owner response sweep** | Repeat A with the owner at 0%, 30%, 60%, 90% | How the mix of manual and automatic feeds shifts with owner behaviour |
| **D: Your own fault plan** | Add the scenarios the group wants to discuss | Report figures for specific cases |
| **F: Feeding modes** | **Feeding modes** tab → **Compare feeding modes**. Repeat with the owner at 30 %, 60 % and 90 %, and once after **Load paper [3] study setup** (2 feeds/day, 36 × 22 × 26 cm tank, 6 fish; 08:00 and 18:00 are demo times) | Why ask-then-fallback: delivery like automatic, with the owner still at the tank |
| **E: Perturbation tests** | Reference ranges loaded. Run B already contains the four tests (days 6, 12, 16, 23) and a bubbles day (day 20). For more, schedule extra tests or press the live buttons. | How the processing rule turns a water change into an alert |

For each run:

1. Set it up, press **Reset run**, then **Run all 30 days now**.
2. Export all three CSVs.
3. Rename them with the run letter, e.g. `RunA_feed-log_SIMULATION.csv`.
4. Take screenshots of the calendar and graph. The SIMULATION label is on both.
5. Note the settings in your lab notes. They are also in the second comment line of each CSV.

**Integrity check:** Run B with default settings (60% owner, example month, reference ranges, 08:00 / 13:00 / 18:00) should give exactly **45 manual, 41 auto_ok, 2 auto_fail, 2 missed_power** feed events, and alert times of **heater 9, vinegar 3, soil 5, TDS 9** simulated minutes in the perturbation file. For Run F with default settings (3 feeds/day, 60 % owner, no scenarios), feeds delivered should be **55 / 90 / 90** (manual only / automatic only / ask-then-fallback), with the owner at the tank for **55** feeds in ask-then-fallback. With the paper [3] setup they should be **34 / 60 / 60**. If your numbers differ, a setting is different or the file was changed. These are simulation outputs, not results.

### 4.5 Open the CSVs in Excel

1. Open the CSV. The top rows are the comment header and a blank row: **4 rows** in the feed and event logs, **5 rows** in the readings and perturbation files.
2. Delete those rows, or in **Data → From Text/CSV → Transform Data**, use *Remove Top Rows* (4 or 5) and then *Use First Row as Headers*.
3. For counts, insert a **PivotTable**: rows = `sim_day`, columns = `outcome`, values = count of `slot`.
4. In the readings file, treat `no data` as blank before charting.

### 4.6 Analyse with Python (pandas)

```python
import pandas as pd

feed = pd.read_csv("RunB_feed-log_SIMULATION.csv", comment="#")
read = pd.read_csv("RunB_readings_SIMULATION.csv", comment="#", na_values=["no data"])
events = pd.read_csv("RunB_event-log_SIMULATION.csv", comment="#")
pert = pd.read_csv("RunB_perturbation-tests_SIMULATION.csv", comment="#")

# Feed outcomes for the whole run, and per day
print(feed["outcome"].value_counts())
print(pd.crosstab(feed["sim_day"], feed["outcome"]))

# Check the cap held every day (never more than 3 counted feeds)
counted = feed[feed["outcome"].isin(["manual", "auto_ok", "auto_fail"])]
print("max feeds in one day:", counted.groupby("sim_day").size().max())

# Owner response time in minutes (manual feeds only)
m = feed[feed["outcome"] == "manual"].copy()
m["response_min"] = (pd.to_timedelta(m["button_press_time"]) - pd.to_timedelta(m["reminder_time"])).dt.total_seconds() / 60
print(m["response_min"].describe())

# Readings summary (smoothed values) and downtime
smoothed = ["ph_smoothed", "temperature_c_smoothed", "tds_ppm_smoothed", "turbidity_ntu_smoothed"]
print(read[smoothed].describe())
print("minutes with controller off:", (read["controller"] == "off").sum())
print("minutes with Wi-Fi offline:", (read["wifi"] == "offline").sum())

# What validation rejected, per sensor
print((read.filter(like="_raw_valid") == "no").sum())

# What smoothing did on the bubbles day (day 20): raw spikes vs smoothed
d20 = read[read["sim_day"] == 20]
print("turbidity raw max:", d20["turbidity_ntu_raw"].max(), " smoothed max:", d20["turbidity_ntu_smoothed"].max())

# Minutes outside the operating range, per sensor (reference ranges from paper [2])
ranges = {"ph_smoothed": (6.8, 8.2), "temperature_c_smoothed": (24, 28), "tds_ppm_smoothed": (180, 280), "turbidity_ntu_smoothed": (None, 50)}
for col, (lo, hi) in ranges.items():
    out = ((read[col] < lo) if lo is not None else False) | ((read[col] > hi) if hi is not None else False)
    print(col, "minutes out of range:", int(out.sum()))

# Perturbation tests: detection and recovery times (simulated minutes)
print(pert[["sim_day", "test", "baseline", "peak", "alert_after_min", "back_in_range_after_min"]])
```

### 4.7 Screenshots for slides

- **Calendar:** shows all 30 days with outcome pips and scenario tags.
- **Graphs:** use *All 30 days* for the month, or click a day in the calendar for a one-day close-up.
- **Feed log:** filter by outcome (e.g. *Auto, no passage*) or search `chute`.
- **Sensors & processing:** the live signal-chain table (raw → validate → last 5 → smoothed → range → result) and the perturbation test table.
- **Graphs, one day:** click day 12 (vinegar) or day 16 (soil) in the calendar for a close-up of a perturbation and its alert.
- **Scenario card:** captures "how the local logic responded" at the moment a scenario fires.

Keep the yellow SIMULATION tag in the crop.

---

## 5. Using this data in the report

**You can say:**
- "In the simulation, the feeding logic blocked every fourth feed and never dispensed more than three times a day over a 30-day run."
- "The simulated controller kept feeding during a simulated Wi-Fi loss and queued app updates."
- "A simulated blocked chute raised a fault and the attempt counted toward the cap, with no automatic retry."
- "Applying the processing rule from paper [2] (validate, 5-sample average, range check) in simulation, a simulated vinegar test produced a pH alert 3 simulated minutes after the change (1-minute sampling)."
- "In simulation, 5-sample smoothing reduced simulated bubble spikes in turbidity, but did not remove false alerts completely."
- "Over 30 simulated days with an owner who answers 60 % of reminders, manual-only feeding missed 35 of 90 feeds, while ask-then-fallback delivered all 90 and kept the owner at the tank for 55 of them."

Call this **logic verification in simulation** or **simulated scenario testing**.

**Do not say:**
- That the system, sensors or feeder have been built, tested or validated.
- That the pH ±0.1 or temperature ±0.5 °C targets were met.
- That any pH or temperature value is a measurement, or that a fish ate the food (passage detected only means food left the chute).
- That the simulated owner response rate describes real owners.
- That AquaCare achieved the paper's accuracy (96.5 / 92.5 / 91 / 88 %) or response times (1.8–2.3 s). Those are **Ayon et al.'s results**. Note too that the four table figures average 92.0 %, not the 96 % in the paper's abstract.
- That AquaCare improves fish growth, reduces stress, or delays cloudy water. Those are **paper [3]'s reported comparisons** from one small study, and the slide itself warns they do not prove the feeder caused them.
- That the reference ranges are safe for any species, or that TDS and turbidity are part of the confirmed AquaCare design.

In every figure caption or table title, add: *"Simulation output (demo data), not hardware measurements."*

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Page opens blank or unstyled | Use `dist/aquacare-demo-standalone.html`, or keep `css/` and `js/` next to `index.html` |
| The export button does nothing | On the live link, accept the save prompt. In some embedded viewers downloads are blocked: open the standalone file instead. |
| A scenario says "Not run: time had passed" | It was added after its time. Press **Reset run**. |
| Missed-confirmation days look normal | Set **Who presses the tank button** to **Simulated owner** |
| My run data disappeared | **Reset run**, **Start a fresh run**, **Clear demo history** and **Show the project logic** replace the run, and clearing browser data deletes it. A normal reload keeps it. Export first. |
| The clock jumped ahead when I reopened the page | That's the catch-up (section 3.3b). Untick **Keep time running while the page is closed** to stop it. |
| Numbers differ from a teammate's | Compare the second comment line in both CSVs. The settings must match, and both runs must start from **Reset run**. |
| Animation is distracting | Display → untick **Tank animation**. Reduced-motion settings are respected automatically. |
| Feeds keep showing *Missed, manual-only mode* | Feeding mode is set to Manual only. Switch it back to AquaCare: ask, then fall back. |
| The LCD shows an old message | The LCD fault is on (live toggle or scenario). This is deliberate; see the health list. |
| A perturbation test raised no alert | No operating range is set for that parameter. Load the reference ranges in Alerts & settings. |
| Turbidity alerts keep flickering | Air bubbles are on (live or scenario). This is the paper's bubbles limitation, shown on purpose. |
| Want to confirm the logic still works | **Logic self-test** tab → **Run logic self-test** (30 checks, software only), or run `node tests/engine.test.js` |

---

## 7. Before you present

- [ ] Opened the standalone file on the **actual presentation laptop** and one phone
- [ ] Settings checked: start date, feed times, owner mode
- [ ] CSVs for Runs A and B exported and renamed
- [ ] Screenshots taken with the SIMULATION label visible
- [ ] Practised **Show the project logic** once end to end
- [ ] Open items noted for Dr. Furugaan: cap counting rule, power-restart policy, Away Mode alarms, owner response assumption, whether TDS and turbidity join the design, which operating ranges to use, validate-before-smoothing order, and how to cite paper [3] (its DOI on the slide, v2i02, does not match volume 3(1))
