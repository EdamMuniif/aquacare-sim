# AquaCare Realistic Ecosystem Mode — Architecture and Model Contract

Status: **Phase 1 foundation only**. No chemistry, filtration kinetics, biological outcomes or hardware validation are claimed.

## Verified repository architecture

- source/js/engine.js: legacy AquaEngine, including synthetic pH, temperature, TDS and turbidity, feeding controls, scenarios, alerts and deterministic replay.
- source/js/filter.js: independent illustrative mechanical sponge-filter proposal. Turbidity only; no dissolved chemistry.
- source/js/app.js: UI, browser persistence and exports.
- source/js/tank3d.js: Three.js rendering, which will consume ecosystem state rather than producing scientific data.
- source/tests/engine.test.js and source/tests/filter.test.js: existing tests.
- source/index.html: modular application. The published index.html is a standalone file.
- The specified tools/build_single.py was not found. Establish the actual standalone build process before publishing changes.

## Isolation contract

Legacy remains the DEFAULT and must preserve its established 30-day data, feeding decisions, IR logic, alerts, scenarios, sensor assumptions and journal. The ecosystem is independently selected and owns a separate configuration, fixed-step clock, physical state, equipment/fault events, mass ledgers, and provenance. A future adapter can convert a confirmed dispenser event into food mass, but IR passage is not evidence that fish consumed it.

The ecosystem mode will be the single source of truth for physical estimates, the dashboard, trends, alerts and 3D effects. Display the provenance of each reading as measured, calculated, simulated or assumed. The original four configured sensor channels are not equivalent to physical installed hardware; the current browser application is a simulation.

## Implemented Phase 1

- source/js/ecosystem/config.js — central configuration, units, sources, uncertainty, geometry checks.
- source/js/ecosystem/core.js — independent deterministic state/clock, pause/resume/restart, fixed-step time advancement, snapshot and restore.
- source/tests/ecosystem-core.test.js — geometry, invalid inputs, fixed-step time, seeded 30-day repeatability, state restoration and provenance checks.

These modules do not modify the legacy engine and are not loaded by the current UI.

### Illustrative demonstration configuration

| Variable | Default | Type |
|---|---:|---|
| Glass length, width, height | 45, 25, 25 cm | Assumed |
| Initial depth | 23 cm | Assumed |
| Displacement | 1.5 L | Assumed |
| Gross capacity | 28.125 L | Calculated |
| Actual initial water volume | 24.375 L | Calculated |
| Freeboard | 2 cm | Calculated |
| Surface area | 0.1125 square metres | Calculated |
| Initial water/ambient temperature | 27/27 Celsius | Assumed |
| Relative humidity | 0.65 | Assumed |
| Clock step | 60 seconds | Assumed numerical method |
| Seed | 20261122 | Deterministic demonstration |

Geometry equations: gross volume in L = L_cm × W_cm × H_cm / 1000; actual water volume in L = L_cm × W_cm × water_depth_cm / 1000 minus displacement_L; freeboard = height minus depth; surface area in square metres = L_cm × W_cm / 10000.

## Next phases

2. Water chemistry: feed/organic nitrogen/TAN-N/nitrite-N/nitrate-N stocks in mg N, with explicit source/sink ledger and delayed decomposition.
3. Filtration: hydraulic actual flow, mechanical particle capture, developing nitrifying biomass, optional carbon saturation and flow-dependent effectiveness.
4. Environment: energy balance, aeration and oxygen transfer, temperature-dependent saturation, evaporation, day/night, plant uptake and progressive algae.
5. Equipment and faults: heater, pump, power, water changes, top-ups, media cleaning, fault events and deterministic action journal.
6. UI integration: mode selector defaulting to legacy, shared visualization adapter, model-estimate provenance, trends, 3D state mapping and 390 px layout.
7. Verification: legacy regression fingerprint, existing suites, mass/energy conservation, oxygen and nitrogen fluxes, replay, interval convergence, sensitivity and long-run stability.

## Future mathematical rules (NOT YET IMPLEMENTED)

All nitrogen stocks are in mg N, with concentrations mg N/L. Convert nitrite-N to nitrite-ion by multiplying 46/14, and nitrate-N to nitrate-ion by multiplying 62/14. Nitrogen is moved between organic N, TAN-N, nitrite-N and nitrate-N rather than deleted by biological filtration. Conservation requires N_after = N_before + N_inputs minus N_exports minus explicitly accounted other sinks.

Idealized oxidation stoichiometry: approximately 3.43 mg O2 per mg ammonia-N converted to nitrite, plus 1.14 mg O2 per mg nitrite-N converted to nitrate, and 7.14 mg CaCO3-equivalent alkalinity per mg ammonia-N completely oxidized. Effective rates must account for biomass synthesis, oxygen availability, substrate, temperature, pH and media maturity.

Energy: water_mass × water_heat_capacity × dT/dt = heat_inputs minus heat_losses.
Oxygen: d(DO_mass)/dt = gas_exchange + plant_production minus respiration minus oxidation_demand plus imports minus exports.
Water volume: dV/dt = topups + replacement_in minus replacement_out minus evaporation. Pure evaporation does not remove nonvolatile solute mass.
pH: calculate from carbonate/alkalinity/CO2 chemistry; never artificially decay toward a fixed target.

## Evidence starting points

- dos Santos et al. 2023, coupled recirculating aquaculture water quality/pH modelling: https://skoge.folk.ntnu.no/publications/2023/dos-santos-RAS-modelling-aque/dos-Santos_RAS_Agriculture-Engineering_2023.pdf
- US EPA Nutrient Control Design Manual, stoichiometry: https://www.epa.gov/sites/default/files/2019-08/documents/nutrient_control_design_manual.pdf
- USGS DO solubility reference: https://water.usgs.gov/water-resources/software/DOTABLES/
- USACE freshwater water-quality/alkalinity documentation: https://ce-qual-w2-erdc.github.io/cequalw2-docs/part2/04_temperature_and_water_quality_modeling/

The existing three reviewed AquaCare feeding/sensor papers are feature-specific background, NOT direct validation for new nitrogen, thermal, pump or animal-behaviour coefficients.

## Acceptance gates

Nine Phase 1 checks were executed locally against the isolated files. No existing AquaCare tests were executed in that local workspace because the full repository was not available there. Before merging or shipping, run the current engine/filter suites, verify that a seeded legacy 30-day run matches commit 91f88cf exactly, establish the standalone build procedure and conduct cross-browser mobile testing. Passing software tests is not physical validation.
