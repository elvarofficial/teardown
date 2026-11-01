# Roulette wheel: results

**In this model, the as-designed wheel is fair, and within-tolerance defects show no bias at the sizes these runs could see. Well outside tolerance, defects fixed to the rotor do bias the numbers. A table tilt changes where the ball drops, but no bias in the numbers was detected.**

These results come from a simulation that has not been checked against a real wheel. Only 23 of its 118 material coefficients are sourced, and every tolerance is an estimate. See [What this rests on](#what-this-rests-on).

Unless a section says otherwise, runs use PTFE, the study's default ball. It is the fastest to simulate and spends about 8 s on the rim. Slower balls may behave differently, and only the ball comparison below tests them.

## Does a defect change which numbers come up?

These cases ran at 30,000 trials per arm, paired launch by launch with the as-designed wheel. All are well outside tolerance except the 0.3 mm fret. "Moved" is the share of trials that ended on a different number.

| Defect | Size in tolerance widths | Moved | Result | Paired p |
|---|---|---|---|---|
| Fret 0.3 mm high | 3 | 0.5% | No shift seen, limit 2.2% on 17 | 0.87 |
| Fret 1.5 mm high | 15 | 1.1% | No shift seen, limit 4.0% on 17 | 0.13 |
| Fret restitution -40% | 13 | 1.0% | **17 +10.4%, 25 +3.8%, 34 -10.8%, 6 -3.6%** | 3e-23 |
| Fret moved 0.5° | 17 | 1.0% | **25 +6.1%, 17 -4.8%** | 8e-6 |
| Pocket floor restitution -50% | 17 | 0.03% | 17 +1.1% (9 trials), not significant once corrected | 0.003 |
| Pocket 2 mm deep | 20 | 0.03% | 17 +1.1% (9 trials), not significant once corrected | 0.003 |
| Rotor wobble 0.3° | 15 | 25% | **A wave of ±1.2 to 1.6% round the wheel** | 1.5e-10 |

- **The moved fret matches geometry.** 0.5° of a 9.73° pocket is 5.1% of its width. One neighbour gained 6.1% and the other lost 4.8%.
- **A dead fret keeps the ball near it.** The pockets beside the fret gain, and the next ones along lose. That fits a ball that stops at the fret where it would have bounced on, though the runs did not trace the mechanism.
- **The wobble result is replicated.** On fresh launches the wave has nearly the same size and direction, and it reverses when the wobble's sign does. See the table below. Against the null, the same arm scored p = 0.98, because that test has no power for a wave this small at 30,000 trials.

| Wobble | Seed | Wave amplitude | Direction | p (first harmonic, paired) |
|---|---|---|---|---|
| +0.3° | 21 | 1.56% | 358° | not computed, whole-wheel p 1.5e-10 |
| +0.3° | 22 | 1.24% | 349° | 1e-12 |
| -0.3° | 22 | 1.48% | 183° | 9e-16 |

A bet on one number breaks even at a shift of +2.8%, which offsets the house edge. The dead fret (+10.4%) and the moved fret (+6.1%) pass that line in this model. The wobble does not.

The result that remains unchecked is a wobble inside tolerance. If the wave scales linearly, which was not tested, 3 widths gives about ±0.3%. By the same scaling, seeing it would take about 200,000 trials per arm.

## Which tolerances matter

Within tolerance, nothing moved the number distribution detectably, but the limits at this N were weak. The sweep ran 40 cases at 2,000 trials. The lowest corrected q was 0.85.

| Kind of parameter | Moved | Smallest shift the run could see, typical number |
|---|---|---|
| Friction, ball shape, track angle, oval bowl, table tilt | 75 to 99% | About 50% |
| Deflector 1 | 11 to 17% | About 20% |
| Deflector 2, one fret, one pocket | Under 1.5% | Too few trials moved to give a useful limit |

So the sweep rules out large effects only. Most of these parameters do have strong effects on how the ball behaves:

| Parameter | Change | Rim time | Mean drop position |
|---|---|---|---|
| `material.mu` | ±0.06 | +4.8 s, -3.6 s | -75°, +7° |
| `surface.trackMu` | ±30% | +2.6 s, -3.7 s | +80°, -132° |
| `ball.outOfRound` | 0.15% | -0.4 s | +60 to +67° |
| `ball.comOffset` | 0.06 mm | -0.3 s | +43° |
| `bowl.upperTrackDeg` | ±0.45° | -0.11 s, +0.11 s | +5°, -6° |
| `bowl.ovalSin`, `bowl.ovalCos` | ±0.45 mm | -0.05 to -0.08 s | Under 1° |

These figures are at 3 widths. Ball friction and track friction lead by a wide margin, and they are also estimates, so they are the first thing to measure on a real wheel.

- **Tilt:** tilt's effect on where the ball drops does not show in the table above, because it barely moves the mean. Read the concentration instead (R, where 0 is uniform and 1 is one spot). `leaveAz` R goes from 0.017 level to 0.34 at 0.2° and 0.65 at 1°.
- **Tilt and numbers:** the paired tests gave p = 0.47 at 0.2° and p = 0.20 at 1°, each with a limit of about 26% at 8,000 trials. That is what a uniform rotor phase predicts, since a drop point fixed in the bowl says nothing about which number is there.
- **Known launch and rotor phase:** fixing both on a level wheel still gave a uniform result (p = 0.32), though the ball's drop point was concentrated (R = 0.74). Adding a 0.5° tilt gave p = 0.04, with 19 at 1.23x and 15 at 1.19x, two neighbouring pockets. That is one uncorrected result among many tests, and it was not replicated. It is the obvious next thing to test.

## Cross-coupling and stackup

- **Coupling:** none of the 12 pair cases reached |z| > 3.5 on any metric, and no outcome p fell below 0.40. At 2,000 trials these pairs add. The pairs of tilt with imbalance showed nothing at these sizes. The wobble and imbalance pair is exactly zero, because imbalance acts only through a tilted axis.
- **Stackup:** 20 builds of 100 trials each, with every selected tolerance drawn with its correlations, gave p = 0.14 against the null and p = 0.41 against the unmodified model. This is a weak test. It has 2,000 trials in all and averages over builds, so it would hide a bias peculiar to one build.

## Balls

Each ball ran 3,000 trials, with no result significant once corrected for nine balls.

| Ball | Rim time, mean | Total time, mean | Against null p | Invalid |
|---|---|---|---|---|
| PTFE | 8.3 s | 12.2 s | 0.97 | 0 |
| Boxwood | 16.7 s | 21.2 s | 0.029 | 0 |
| Ivorine | 19.3 s | 24.6 s | 0.33 | 1 |
| Acrylic | 21.4 s | 27.4 s | 0.45 | 0 |
| Acetal | 21.8 s | 28.0 s | 0.98 | 0 |
| Elephant ivory | 23.4 s | 30.0 s | 0.78 | 0 |
| Phenolic | 23.7 s | 31.2 s | 0.52 | 0 |
| Marble | 30.3 s | 38.9 s | 0.51 | 0 |
| Alumina ceramic | 35.8 s | 47.4 s | 0.46 | 0 |

The material changes how long the ball runs and how it scatters: `scatter` R ranges from 0.57 for PTFE to 0.03 for alumina. These coefficients are all estimates, so the order is too.

- **Boxwood was chance.** Number 35 came up 1.47x in the first run, too large to dismiss, so it was rerun as one named test. It came up 1.14x at 10,000 trials and 0.96x at 30,000 (p = 0.82 overall). Pooling both reruns gives 1.006x.
- **Ivorine has a loose end.** It had the only invalid ball trial, and 5% or more of its trials left the track far slower than usual (`leaveSpeed` 5th percentile 0.34 m/s, against 0.85). Phenolic and acetal have a few such trials. This was not investigated.

## Is the model itself sound?

- As designed: p = 0.52 at 30,000 trials, 0 invalid, limit about 10% on one named number. Two baselines on different seeds agreed, at p = 0.69.
- The first full run was thrown away. Raised launches began inside the overhanging wall, which threw balls out at up to 18 m/s and lost 3 to 4% of trials. A regression test now covers it.
- That run also exposed an invalid test. A two-sample chi-square on arms sharing launches gives p near 1, so it was replaced with a paired test, which was checked for false positives on simulated data. It stayed near 5% even when moves are local, and was conservative when few trials moved.

## What this rests on

- **Nothing has been checked against a real wheel.** Physics tests cover closed forms and conservation laws. Rim times and bias sizes are model output, not measurements.
- **Coefficients:** 23 of 118 are sourced from pages actually opened. The other 95 are estimates, including every ball-on-surface pair, and no coefficient of restitution has opened data behind it. Several elastic moduli look suspect: marble, nickel, brass and ivory. See `sims/roulette-shared/data/coefficients.source.json`.
- **Tolerances:** every tolerance is an estimate, so "3 widths" is a chosen size and not a known shop limit.
- **Local defects were tested in one place.** Fret and pocket cases all use the position next to 17.
- **Not run:** in-tolerance tests of outcomes at high N, ball comparisons paired against each other, and tilt on non-PTFE balls.

## Reproducing this

```bash
node skills/monte-carlo/engine/cli.js study sims/roulette-shared/model.js sims/roulette-shared/scenarios/study.json --out montecarlo-out/roulette/study
```

```bash
node skills/monte-carlo/engine/cli.js run sims/roulette-shared/model.js sims/roulette-shared/scenarios/bias.json --out montecarlo-out/roulette/bias
```

```bash
node skills/monte-carlo/engine/cli.js run sims/roulette-shared/model.js sims/roulette-shared/scenarios/phase.json --out montecarlo-out/roulette/phase
```

```bash
node skills/monte-carlo/engine/cli.js run sims/roulette-shared/model.js sims/roulette-shared/scenarios/balls.json --out montecarlo-out/roulette/balls
```

```bash
node skills/monte-carlo/engine/cli.js run sims/roulette-shared/model.js sims/roulette-shared/scenarios/boxwood.json --out montecarlo-out/roulette/boxwood
```

```bash
node sims/roulette-shared/check-wobble.mjs 30000 22
```

Total time is about 5 hours on a 10-core Mac. Choosing trial counts for your own model: [TUNING.md](../skills/monte-carlo/docs/TUNING.md).
