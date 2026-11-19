# Real-Life Aquarium Research Simulation: model notes

**SIMULATION / DEMO DATA.** This mode has not been validated against a real aquarium. Its output is not a measurement or an experimental finding. Its sources are separate from the four-reference EE7008 Project 1 report.

## Separation from AquaCare v5

The research page is `research.html`. It has its own model (`source/research/model.js`), interface and build script. The v5 page does not load any of these files.

It reuses three v5 files without changing them:
- `source/js/filter.js`: pump, sponge clogging and controller states.
- `source/js/filterstages.js`: illustrative biofilter and oxygen-transfer constants.
- `source/js/tank3d.js`: the 3D aquarium.

## Cause and effect

| Process | Model | Basis |
|---|---|---|
| Feeding | Food splits into uneaten solids, solid waste, excreted ammonia and nitrogen kept by the fish | Mass balance, illustrative shares |
| Solids | Suspended solids settle, get trapped in the sponge, or break down to ammonia | First-order rates, illustrative |
| Turbidity | Clear-water baseline plus suspended solids | Illustrative conversion |
| Mechanical filter | Trapped solids load the sponge, raising resistance and reducing flow | Existing `filter.js`, illustrative |
| Biofilter | Ammonia to nitrite to nitrate, limited by maturity, oxygen, flow and substrate | Illustrative kinetics, published temperature sensitivity (R6) |
| Oxygen | First-order gas exchange toward saturation, minus fish, decay and nitrification demand | Published saturation (R1, R2), molar-mass stoichiometry, illustrative transfer rates |
| NH₃ share | Depends on pH and temperature | Published (R3, R9) |
| Temperature | Lumped energy balance with heater and room air | Physics, illustrative heat-loss coefficient |
| Water change | Exact dilution and mixing | Mass and energy balance |
| Virtual sensors | Calculated water plus a fixed error, noise, resolution and faults | Published limits (M1, M2, M4). Noise and drift are illustrative |

## Value classes

Every parameter is labelled on the page as **Published**, **Calculated**, **Illustrative** or **User**. Calculated water state, virtual sensor readings and measured data appear in separate columns. No measured data exists yet, so that column stays empty.

## Known limitations

- **Illustrative parameters:** heat loss, oxygen transfer, fish oxygen use, waste shares, solids decay, solids-to-turbidity conversion, sponge clogging and biofilter capacity need measurement on a real tank.
- **Temperature sensitivity:** the published values apply at 20 °C and are extrapolated to tank temperatures.
- **Stoichiometry:** nitrification oxygen demand uses molar masses and ignores bacterial growth.
- **Food decay and organic turbidity:** the source register found no usable published values. They are included only because they are needed for the cause-and-effect chain, and they are labelled illustrative.
- **Optional realism modules:** pH, alkalinity, CO₂, evaporation and water level are available on the page. See `docs/REALISM-MVP.md`.
- **Not modelled:** algae and plants, bacteria outside the filter, fish health and behaviour, fish growth, nitrification inhibition, and activated carbon.
- **Turbidity sensor:** the manufacturer publishes no NTU range, curve or accuracy, so readings are flagged uncalibrated.
- **Sensor error:** a fixed error is drawn inside the published bound. The distribution is an illustrative choice.

## Checks

Run `node source/tests/research.test.js` and `node source/tests/research-realism.test.js`. The checks verify the software against equations and conservation laws. They do not validate the model against real aquarium behaviour.

## Rebuild

```powershell
cd source; python tools/build_research.py; cd ..; Copy-Item source/dist/aquacare-research-standalone.html research.html -Force
```
