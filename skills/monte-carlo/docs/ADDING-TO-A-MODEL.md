# Adding Monte Carlo to a model

The engine in this folder has no dependencies and needs nothing from the rest of the repo but Node 20 or newer. Python 3 and [pint](https://pint.readthedocs.io) are needed only for the unit tools.

## A: you already have a machine

Say you built a chameleon with the teardown skill, and it lives in your fork at `sims/chameleon-*`.

### 1. Bring the skill in

From your fork, take only this folder, so nothing of yours can conflict:

```bash
git remote add montecarlo https://github.com/lalligagger/montecarlo.git
```

```bash
git fetch montecarlo
```

```bash
git checkout montecarlo/main -- skills/monte-carlo
```

To take everything instead, including the roulette wheel, run `git merge montecarlo/main`. If git says the histories are unrelated, add `--allow-unrelated-histories`. Expect small conflicts in `README.md`, `SKILL.md`, `.gitignore` and `package.json`, if you have changed them.

### 2. Make the math callable

Open the machine's math file (`kin.js`, `gear.js`, `jansen.js` and so on). It needs three things, and teardown machines usually have the first:

| It needs | Usual problem | Fix |
|---|---|---|
| No three.js, no DOM | Math mixed into `stage.js` or `engine.js` | Move the math out to its own file |
| Constants you can change | `const BORE = 86` at module scope | Take them as an argument, and keep the old function as a wrapper |
| No state between runs | A `let` at module scope, a `Math.random`, a `Date` | Move into a `create()` function, take `rng` as an argument |

The Strandbeest shows the size of this. Its solver read fixed link lengths, so it became `solveLegWith(lengths, angle)`, with `solveLeg = (th) => solveLegWith(HOLY, th)`, and the page never knew. See `sims/strandbeest-shared/jansen.js`.

### 3. Write the adapter

`sims/chameleon-shared/model.js`, next to the math. Copy `sims/strandbeest-shared/model.js` for a kinematic machine, or `examples/loaded-die.model.js` for the bare shape. Then decide:

- **Parameters** are fixed for one built instance: lengths, clearances, materials. Use deltas from design with nominal 0, so an untouched model is as designed.
- **Inputs** change on every trial: how it was started, what it hits, the room.
- **Outcome** is a category you want a distribution of. **Metrics** are numbers you want to follow. Declare at least one of them.

If your folder has no `package.json` and you use Node older than 22.7, add one with `{"type": "module"}` next to the adapter, as `sims/strandbeest-shared/` does.

### 4. Run it

```bash
node skills/monte-carlo/engine/cli.js inspect sims/chameleon-shared/model.js
```

```bash
echo '{"probeTrials": 200, "budgetMinutes": 10}' | node skills/monte-carlo/engine/cli.js study sims/chameleon-shared/model.js -
```

Results are in `montecarlo-out/<model name>/study.md`. Then read [TUNING.md](TUNING.md) before believing them.

### 5. Optional: put it on the page

Copy `sims/roulette-shared/batch.js`. It runs the same adapter, on the same random streams, in Web Workers, from inside the page's one HTML file. A `main.js` that starts with `if (isWorker()) bootWorker();` is all the wiring it needs.

## B: starting from nothing

1. Use the teardown skill to build the machine, against a real reference and real numbers. Hold it to the kit's split from the start: math in one file with no three.js, one input drives everything, and every parameter that could vary is an argument.
2. Write a coefficient library, `data/coefficients.source.json`: every physical constant with its low, typical and high values, a unit pint can parse, and its source. Mark what you could not source as `estimate`.
3. Compile it, and import the result in your math. Nothing else should hold a physical constant:
   ```bash
   python3 skills/monte-carlo/tools/units.py compile data/coefficients.source.json data/coefficients.js
   ```
4. Write the stackup as a generated list by element, with nominal 0. See `stackup()` in `sims/roulette-shared/spec.js`.
5. Test the physics against closed forms before anything else, and add a `check_units.py`. See `sims/roulette-shared/physics.test.js`.
6. Write the adapter, then follow A4.

## What the adapter must get right

- **`trial` must not carry state.** Reset anything reused from `prepare` at the start of each trial. Running the same trial twice must give the same result; the engine's determinism test shows how to check.
- **All chance comes from the `rng` argument**, and from `inputs`. Common random numbers depend on it.
- **Return `null` when the model fails** rather than an arbitrary category. It is counted as invalid.
- **A trial that can run forever needs a limit.** One stuck trial holds a worker until it ends.
