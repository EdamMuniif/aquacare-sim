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

The simulation runs in each visitor's browser. A web page can't run while it's closed, so the run is saved in that browser and, when the page is reopened, rebuilt and caught up by the time away (at the chosen speed). Nothing is stored online, and true 24/7 running would need a server or the real ESP32. Use the CSV exports to keep the data.
