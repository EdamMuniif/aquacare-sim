# Realism MVP: research simulation upgrade path

**SIMULATION / DEMO DATA.** This upgrade makes the research simulation more complete. It does not make it as realistic as a real aquarium, and it has not been validated against one.

## What the MVP adds

| Module | What it does | Evidence |
|---|---|---|
| pH, alkalinity and CO₂ | Calculates pH from alkalinity and dissolved inorganic carbon. Ammonia release adds alkalinity, nitrification removes it, and CO₂ follows respiration and gas exchange | Equilibrium constants from the USGS PHREEQC database. Stoichiometry from reaction balances. CO₂ transfer and respiration are illustrative |
| Evaporation and water level | Removes pure water, concentrates dissolved matter, lowers the level, and triggers the existing dry-run protection. Top-ups refill the tank | Mass balance. The evaporation rate is illustrative |
| Real-tank comparison | Imports measured CSV data and reports model bias, mean error and RMSE | Standard error measures. Data stays in the browser tab |

Both modules can be turned off on the page. With them off, the research model keeps its earlier behaviour. The AquaCare v5 demo does not load any of this code.

## How to make the model realistic

Run a real tank for at least 30 days, using the template from the research page. Calibrate on days 1 to 20 and test on days 21 to 30, so the test data is not used to tune the model.

| Measure | Suggested frequency | Parameter it can calibrate |
|---|---|---|
| Water and room temperature | Hourly logger | Heat-loss coefficient |
| Heater running time or energy | Continuous | Heater power and heat balance |
| Dissolved oxygen | Daily, plus one pump-off recovery test | Oxygen transfer and respiration |
| pH and KH | Daily | Alkalinity use and CO₂ transfer |
| Ammonia, nitrite and nitrate | Daily while cycling, then every 2 to 3 days | Biofilter maturity and capacity |
| Turbidity | Daily and after feeding | Solids settling and capture |
| Filter flow | Weekly | Sponge clogging rate |
| Water level | Daily, with no top-up that day | Evaporation rate |
| Food weight, fish count and fish weight | Every feed and weekly | Waste input and fish oxygen use |

Use calibrated instruments where possible, and record the test method and its accuracy. Aquarium test strips and colour kits give approximate values.

## Stages still to build

1. Automatic parameter calibration from measured data.
2. Bacteria on gravel, glass and decorations.
3. Algae, plants and the light cycle.
4. Fish biology for one chosen species, including oxygen use, stress, appetite, growth and mortality.
5. Nitrification limits at low pH, low oxygen and high ammonia.

## Known limits

- Activity corrections are ignored in the carbonate calculation.
- The tank is treated as perfectly mixed.
- Nitrification continues at low pH, so pH can fall further in the model than in a real tank.
- The 3D view does not show the falling water level.
- Passing software checks is not physical validation.
