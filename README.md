# AquaCare digital prototype — SIMULATION

**Live demo:** https://edammuniif.github.io/aquacare-sim/

Browser simulation of the proposed *Intelligent Feeding and Monitoring System for Small Freshwater Aquariums (2.5–10 Gallons) in Vilimalé'*, EE7008 Project 1, Group 2.

> **SIMULATION / DEMO DATA.** This is not connected to hardware. Every reading, alert and feeding event is generated in the browser. pH ±0.1 and temperature ±0.5 °C are project targets, not results. TDS and turbidity, and the reference operating ranges, come from reviewed paper [2] and still need team confirmation. Paper [3]'s fish outcomes are shown as its reported results only.

- `index.html`: the whole simulation in one file. It works offline when downloaded.
- `HOW-TO-RUN-AND-COLLECT-DATA.md`: how to run it and export data.
- `source/`: the readable source (engine, UI, tank, tour, self-test) and the cover plate.

## Explore the 3D tank

Open the **Tank** tab. Drag to orbit, scroll or pinch to zoom, and right-drag or drag with two fingers to pan. You can also turn on **Pan**, use the on-screen zoom buttons, or pick a view such as **Fish close-up**, **Water surface**, or **Feeder and probes**. Use **Reset view** to show the entire tank again. **Switch to 2D** returns to the original labeled illustration. Browsers without WebGL open the 2D view automatically.

The aquarium uses the same simulated turbidity, probe faults, LCD, tank button, and feeder events as the dashboard. Fish and water movement are visual approximations. The 3D renderer is bundled into the standalone file, so it can run offline.

### What the 3D model shows (v5)

- **Tank follows the Tank size setting** (2.5, 3, 5, 7.5, 10 US gal and the paper [3] 36×22×26 cm tank). Proportions for the US-gallon sizes are illustrative, not measured. Plants and hardscape are kept inside the glass at every size.
- **One universal controller:** a fixed 24 cm housing sits on the front rim. Inner bars slide out of both ends on offset tracks to the corner clamps, side rails telescope front to back, and a crossbar carries the downward camera and light bars. The probe leads run in a cover on the right side rail. Power comes in at the left end (12 V DC IN, ON/OFF) and the lead drops outside the glass. The concept sheet is in `docs/controller-sheet.html` (PNG alongside). It's a proposal for the project team to confirm, not a product.
- **Auto-feeder:** a mini 4-axis arm (turntable, shoulder, elbow, wrist) in the centre of the housing, driven by a servo model with speed limits and settling. It scoops from the hopper and pours over the water; an IR gate on the scoop lip confirms the drop. The top camera picks **where** to pour (over the fish, inside the arm's reach); the tank button still decides **whether** to feed. Pellets fall under gravity, float, sink and settle, and the fish eat what they reach. Same ask-then-fallback loop, cap of 3 per day.
- **Dirt and algae over time:** glass film, algae on rock and wood, probe film, detritus and waterline scum build over simulated days and reset with the Clean buttons. A 30-day run shows it clearly.
- **Top camera and phone app:** the Tank tab has a phone mock showing the camera view with fish boxes and behaviour labels. The analysis is a rule-based stand-in with placeholder limits, not a trained model. Notifications stay off until you turn them on.
- **Controller from every side:** six rendered views plus a downloadable sheet (PNG).
- Toggles: **Labels**, **Camera view**, **Black / White** finish.

The simulation runs in each visitor's browser. A web page can't run while it's closed, so the run is saved in that browser and, when the page is reopened, rebuilt and caught up by the time away (at the chosen speed). Nothing is stored online, and true 24/7 running would need a server or the real ESP32. Use the CSV exports to keep the data.

### Three-stage filter (team-confirmed design, values to confirm by measurement)

Off by default. Turn it on under **Presenter controls → Filter** or **Water → Filter System**. It is a pump loop beside the tank, with intake and return tubes over the back rim, and three stages: sponge, biological media and optional activated carbon.

- **Mechanical stage:** suspended matter from a soil test clears faster while water flows (removal rate = flow ÷ tank volume × 0.5 capture), and uneaten food is trapped in the sponge.
- **Biological stage:** ammonia becomes nitrite, then nitrate, limited by media maturity, dissolved oxygen and flow. Maturity builds over weeks and survives sponge cleaning.
- **Chemical stage:** carbon adsorbs dissolved organics only, and its capacity runs out until the media is replaced.
- **Controller:** OFF, STARTING, RUNNING, WARNING and FAULT states, automatic and manual modes, an optional turbidity boost, and dry-run protection that stays active in manual mode.
- **What it never changes:** pH, temperature, TDS and feeding.
- **Clogging:** the sponge loads slowly while water flows, with each delivered feed, and with the matter it captures. Resistance rises and flow falls. Below 60 % of set flow it raises a WARNING (clean the sponge). Below 30 % it makes a protective stop (FAULT) that only clears after cleaning. A power cut stops the pump, and it restarts when power returns.
- **Cleaning:** rinsing the sponge restores flow. It does not clean the water at that moment.
- **Constants:** the values in `source/js/filter.js` and `source/js/filterstages.js` are illustrative, to confirm by measurement.
- **Not modelled:** water changes, evaporation, species or stocking effects, and any pH or TDS change caused by nitrification. Ammonia, nitrite, nitrate, oxygen and water level have no sensor in the design, and their alert limits read Not configured.
- **Checks:** `node source/tests/filter.test.js` runs 11 checks and `node source/tests/filterstages.test.js` runs 15. With the filter off, a seeded 30-day run keeps the same sensor readings and feed records.
