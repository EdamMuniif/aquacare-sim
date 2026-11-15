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
- **Auto-feeder:** hopper, servo arm, funnel, chute and an IR beam. It follows the same ask-then-fallback loop, tank button only, cap of 3 per day.
- **Dirt and algae over time:** glass film, algae on rock and wood, probe film, detritus and waterline scum build over simulated days and reset with the Clean buttons. A 30-day run shows it clearly.
- **Top camera and phone app:** the Tank tab has a phone mock showing the camera view with fish boxes and behaviour labels. The analysis is a rule-based stand-in with placeholder limits, not a trained model. Notifications stay off until you turn them on.
- **Controller from every side:** six rendered views plus a downloadable sheet (PNG).
- Toggles: **Labels**, **Camera view**, **Black / White** finish.

The simulation runs in each visitor's browser. A web page can't run while it's closed, so the run is saved in that browser and, when the page is reopened, rebuilt and caught up by the time away (at the chosen speed). Nothing is stored online, and true 24/7 running would need a server or the real ESP32. Use the CSV exports to keep the data.
