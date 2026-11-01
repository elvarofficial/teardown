---
name: monte-carlo
description: Run Monte Carlo simulations on any physical model: as-built tolerance stackups, one-at-a-time sensitivity sweeps, scenario comparisons, and tests of whether a mechanical offset or bias shifts the distribution of outcomes. Use when someone wants to know how a built thing differs from its design, which tolerance matters most, whether a defect changes the results, or wants to wrap a simulator they already have (a teardown machine or any JavaScript model) so it can be run thousands of times. Not for pure financial or statistical simulations with no physical model.
---

# Monte Carlo

Turns a physical model into a distribution. Wrap the model in a small adapter, say what varies, and the engine runs it on every core, reproducibly, and reports what changed and what it could not have seen. The engine has no dependencies and knows nothing about any particular machine.

`SKILL_DIR` below is the folder this file lives in.

## Two ways in

**Adding it to a machine you already have.** Read `docs/ADDING-TO-A-MODEL.md` and follow it. The machine stays as it is, apart from pulling its constants into arguments.

**Starting from nothing.** Build the machine with the `teardown` skill first, with its math in a file that does not import three.js, then wrap it here. `docs/ADDING-TO-A-MODEL.md` covers this too.

## The job, in order

1. **Find the model's one pure step.** Something that takes values and returns a result, with no rendering. A teardown machine already has it: `kin.js`, `jansen.js`, `gear.js`. If the math is tangled with three.js, split it out first.
2. **Ask for what only the user knows.** Which outcome they care about, which parameters can vary, how far, and what real data exists. Never invent a tolerance and present it as fact: mark it `estimate` in `source`.
3. **Put physical constants in a coefficient library with units and sources**, and compile it with `tools/units.py`. Nothing that matters should be a bare number in the code.
4. **Write the adapter** (next section). Start from `examples/loaded-die.model.js`.
5. **Validate the model before running it.** A Monte Carlo of a wrong model gives wrong results with small error bars. Test the physics against closed forms, conservation laws and any real measurement, and check its dimensions. See `sims/roulette-shared/physics.test.js` and `check_units.py`.
6. **Run a `study`, not a guess at N.** It runs a small probe, then a sweep sized from it. See `docs/TUNING.md`.
7. **Report the result with its detection limit.**

## The adapter

A JavaScript module with a default export. All of this is user input to the engine:

```js
export default {
  name: 'my-machine',

  // What is fixed for one built instance. Prefer deltas from design with nominal 0, so an untouched model is as designed.
  parameters: [
    {id: 'arm.length', group: 'arm', label: 'Arm length error', unit: 'mm', nominal: 0, tol: {sd: 0.05}, source: 'estimate'},
    // tol is {sd} for a normal or {halfWidth} for a uniform; min and max are optional; no tol means it never gets sampled
  ],

  // Named sets of absolute values, chosen in a scenario: materials, variants, configurations. Optional.
  presets: {'material.steel': {label: 'Steel', values: {'material.density': 7900}}},

  // What changes on every trial. dist: fixed, uniform, normal, triangular or lognormal.
  inputs: [
    {id: 'load', label: 'Applied load', unit: 'N', dist: {dist: 'normal', mean: 100, sd: 5}},
  ],

  // One or both of an outcome and metrics.
  outcome: {kind: 'categorical', categories: ['pass', 'fail']}, // nullProbs: [..] if the null is not uniform
  metrics: [
    {id: 'peak', label: 'Peak stress', unit: 'MPa', kind: 'linear'},
    {id: 'heading', label: 'Rest heading', unit: 'deg', kind: 'circular'}, // circular metrics are in degrees
  ],

  // Optional: tolerances that move together because one thing causes both. Used when a scenario samples tolerances.
  correlations: [{ids: ['joint.*.play'], rho: 0.5, why: 'One assembly line.'}],

  // Optional: build once per instance. Whatever it returns reaches trial() as `instance`; without it, the parameter map does.
  prepare(params) { return buildMachine(params); },

  // One run. Use only `rng` for chance, never Math.random or the clock.
  trial(instance, inputs, rng) {
    return {outcome: 'pass', metrics: {peak: 1, heading: 2}};
  },
};
```

Rules the engine depends on:

- **`trial` is a pure function** of its arguments. Reuse of `instance` across trials must leave no state behind, so reset it at the start of each trial.
- **The category returned must be one declared.** Anything else, or `null`, counts as invalid and is reported. A high invalid count means the model is failing, not that the machine is odd.
- **No DOM or browser globals** where the model loads, since it runs in Node worker threads. A model that is not JavaScript needs a thin `trial` that calls it.

`rng()` is uniform in [0, 1), `rng.normal()` standard normal, `rng.uniform(a, b)`.

## Running it

```bash
node "$SKILL_DIR/engine/cli.js" inspect my.model.js                      # list everything that can vary
node "$SKILL_DIR/engine/cli.js" run my.model.js scenario.json            # one scenario, or several against a baseline
node "$SKILL_DIR/engine/cli.js" sweep my.model.js sweep.json             # every selected parameter, one at a time
node "$SKILL_DIR/engine/cli.js" study my.model.js study.json             # probe, plan, sweep, doses, coupling, stackup
python3 "$SKILL_DIR/tools/units.py" check my.model.js                    # every declared unit, parsed by pint
python3 "$SKILL_DIR/tools/units.py" compile lib.source.json lib.js       # a sourced coefficient library, converted to SI
```

Results land in `montecarlo-out/<model>/` as JSON and Markdown, or wherever `--out` says. `--workers n` sets the pool size, by default one less than the core count.

A scenario:

```json
{"name": "worn", "trials": 5000, "seed": 1,
 "presets": "material.steel",
 "deltas": {"arm.length": 0.2},
 "values": {"material.density": 7800},
 "inputs": {"load": {"dist": "fixed", "value": 120}},
 "builds": 20, "sampleTolerances": ["arm", "joint.*"]}
```

Everything but `name` is optional. `deltas` add to the nominal and `values` replace it. `builds` with `sampleTolerances` makes that many instances drawn from the tolerances (a production run). Several scenarios go in `{"baseline": {...}, "common": {...}, "scenarios": [...]}`.

A sweep pushes each selected parameter to ±k tolerance widths, with the others at nominal:

```json
{"select": ["table", "rotor.*"], "k": 3, "trials": 2000, "seed": 1, "deltas": {"rotor.wobble": 0.3}, "signs": [1, -1]}
```

A study, the normal way to run anything new:

```json
{"select": ["table.*", "rotor.*", "fret.17.*"], "k": 3, "seed": 1, "probeTrials": 200, "budgetMinutes": 30,
 "shortlist": 12, "always": ["table.tiltX"], "doseIds": ["table.tiltX"], "doses": [10, 30],
 "couplingIds": ["table.tiltX", "rotor.wobbleCos"], "builds": 20, "presets": "ball.ptfe"}
```

Its stages:

| Stage | What it answers |
|---|---|
| Pilot | What does a trial cost, and does the unmodified model pass its null? |
| Probe | Small N, every selected parameter, paired against the baseline. Which ones do anything, and how many trials do they reach? |
| Plan | Shortlist by effect and reach, then fit N to the budget. Prints what each N could detect. |
| Sweep | The shortlist at that N, with corrected p-values, and a second baseline showing what no change looks like. |
| Doses | The strongest pushed past tolerance, to find where an outcome shift first shows. |
| Coupling | Each pair's `ab - a - b + baseline`, trial by trial. Non-zero means they do not simply add. |
| Stackup | Every tolerance drawn at once on many builds, correlations included. |

Each stage is written to `study.md` and `study.json` as it finishes.

## Units

JavaScript models run in bare SI floats, because a run can take millions of steps and pint costs far too much in that loop, and does not exist in a browser. So units are enforced around the loop instead:

- `tools/units.py compile` turns a library written with units (`"3 GPa"`) into SI, and refuses a wrong dimension.
- `tools/units.py check` parses every unit a model declares.
- A `check_units.py` next to the model redoes each force law with pint quantities and compares with the numbers the code builds. Copy `sims/roulette-shared/check_units.py`.

A model written in Python can use pint directly, with a thin JavaScript `trial` that calls it, at whatever cost that has.

## Reading the result honestly

- **Quote the detection limit.** "No effect" means nothing without the shift the run could have seen; the report gives it. To find a shift half as big takes four times the trials.
- **Sweeps test many things.** Use `q`, the p-value corrected across all cases, not `p`. In 200 clean tests, ten will have p below 0.05 by chance.
- **Pairing only works until the model goes chaotic.** Scenarios share launches, so early metrics compare trial by trial with enormous precision. A chaotic final outcome is effectively independent between two runs, so it gets no benefit.
- **A symmetry can hide a bias.** Ask what a parameter could possibly change before spending trials on it. See the roulette results in `docs/TUNING.md`.
- **A model's assumptions are limits on the answer.** An `estimate` tolerance gives an estimated answer. Say which inputs were estimated, and which real measurement would most change the result.
- **Trials cannot reveal a mechanism the model does not include.**

## Worked examples

- `examples/loaded-die.model.js`: the smallest complete adapter.
- `sims/strandbeest-shared/model.js`: added to an existing teardown machine with one small change to it.
- `sims/roulette-shared/`: built for this from the start. 250+ tolerances all zero by design, balls as presets, a sourced coefficient library, physics and unit tests, and a page with a batch run on Web Workers (`batch.js`).
