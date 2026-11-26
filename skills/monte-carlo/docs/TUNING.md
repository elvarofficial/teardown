# Choosing trial counts

Do not guess N. Run a `study`, which spends a little to learn where to spend a lot. The numbers here come from the roulette wheel, whose full results are in [docs/roulette-results.md](../../../docs/roulette-results.md). They are a worked example: your model will have its own costs and limits.

```bash
echo '{"probeTrials": 200, "budgetMinutes": 10}' | node skills/monte-carlo/engine/cli.js study my.model.js -
```

## What the stages do

1. **Pilot:** what a trial costs, and whether the unmodified model passes its null.
2. **Probe:** a small N for every selected parameter, paired against the baseline.
3. **Plan:** a shortlist by effect and reach, with N fitted to `budgetMinutes`. The report prints what each N can detect.
4. **Sweep, doses, coupling, stackup:** the full run at that N.

## How many trials

N depends on the question. On the roulette wheel, these were the answers:

| Question | N per case | Evidence |
|---|---|---|
| Does this parameter do anything at all? | 200 | Reach and metric changes were clear at the probe's 200 trials. |
| How much does it change a metric? | 200 to 2,000 | Paired z values ran to the thousands, because the launches are shared. |
| Does a defect in one place shift nearby outcomes? | 6,000 to 15,000 | Scaled from 30,000-trial runs, not run directly. |
| Does a defect shift the whole distribution a little? | 30,000, paired | A ±1.3% wave round the wheel gave paired p near 1e-10 at 30,000, and it replicated. |
| Is the unmodified model uniform? | 30,000 or more | This limits one named category to a shift of about 10%, against a known null. |

Halving the shift you want to see takes four times the trials. Against a known null, the roulette wheel gave:

| Trials | Time per case | One known category, two arms | Any category, two arms | Whole pattern, Cohen w |
|---|---|---|---|---|
| 200 | 5 s | 244% | 401% | 0.514 |
| 1,000 | 26 s | 90% | 140% | 0.23 |
| 3,000 | 79 s | 48% | 73% | 0.133 |
| 10,000 | 4 min | 25% | 37% | 0.0727 |
| 30,000 | 13 min | 14% | 21% | 0.042 |
| 100,000 | 44 min | 7.7% | 11% | 0.023 |
| 300,000 | 2.2 h | 4.4% | 6.4% | 0.0133 |
| 1,000,000 | 7.3 h | 2.4% | 3.5% | 0.00727 |

Times are for 9 workers at 38 trials per second, the fastest ball. Other balls cost 3 to 6 times as much, so pilot the configuration you will actually run.

## Pairing decides the real limit

Scenarios that share a seed and inputs fly the same launches, so outcomes compare launch by launch. Only trials the change moved carry any information, so a paired run's limit comes from its churn, the share of trials that changed category:

| Change | Churn | Smallest shift in the affected number at 30,000 trials |
|---|---|---|
| Pocket 2 mm deep | 0.03% | 1.0% |
| Fret 0.3 mm high | 0.5% | 2.2% |
| Fret 1.5 mm high | 1.1% | 4.0% |
| Rotor wobble 0.3° | 25% | 6.2% |
| Table tilt 0.2°, 8,000 trials | 94% | 26% |

With 94% churn, pairing buys almost nothing, and a change like this needs the same N as two unrelated runs. The report prints `smallestShift` for each category, so use that value when you say a run found no effect.

Against-null tests miss what paired tests find. The 0.3° wobble arm scored p = 0.98 against the null at 30,000 trials, while the paired test on the same data gave p = 1.5e-10. A whole-pattern test against the null would have needed roughly 600,000 trials for that wave.

## Checks before you believe a run

- **Invalid trials.** Read the count first, and look at any non-zero rate. A launch bug once threw 3 to 4% of balls out of the wheel; those trials also had a false energy gain, so the valid ones were suspect too.
- **Two baselines.** The sweep runs two on different seeds. Their p should look unremarkable. Roulette gave 0.69.
- **Metrics that barely vary.** `Effect` is a change in units of the baseline's spread, so a nearly constant metric inflates it. `leaveSpeed` has a spread of 7e-7 m/s, which gave effects near 100,000 and put it at the top of most probe rows. Compare effects on metrics that really vary, and read the change itself.
- **Clamped deltas.** A parameter that cannot go below zero gives no negative arm. `ball.comOffset` at -0.06 mm reached 0% of trials because it stayed at nominal. Set `deltas` by hand when ±k widths would hit a limit, as the roulette study does for the friction coefficients on PTFE.
- **Zero reach.** Either the parameter is disconnected or something else must switch it on. `rotor.imbalance*` reached nothing on a level axis, which is correct, since it acts only through tilt.
- **Very few discordant trials.** The global paired test is approximate when only a handful of trials moved. Nine trials all moving one way gave a global p of 0.0027, but the exact corrected category test gave 0.14. Believe the category test here.
- **Which column.** Use `q`, corrected across all cases, in a sweep.
- **Selected extremes.** The largest of many categories always looks big, so rerun it on fresh launches as one named test. Roulette's boxwood result is an example.

## Replicating a surprise

Run it again with a new seed, and decide beforehand what would confirm it. If you can, use a test that could fail in a specific way. Reversing the wobble's sign should reverse its bias, and it did.

## Symmetry

Ask what a parameter could possibly change before spending trials on it. With a uniform random rotor phase, defects fixed to the stationary bowl (tilt, deflectors, the track) can move where and when the ball drops. They have no way to favour a number, since no number is at any particular place when the ball arrives. Only defects fixed to the rotor (frets, pockets, wobble) can. In the runs, tilt behaved this way, down to a limit of about 26%.

## Settings

| Setting | What it does | Start with |
|---|---|---|
| `probeTrials` | Trials per probe arm. | 200 |
| `k` | Probe size in tolerance widths. Bigger is clearer but less linear. | 3 |
| `deltas` | Fixed probe sizes per parameter, in place of `k` widths. | Wherever `k` would clamp |
| `budgetMinutes` | Sweep time. Sets N. | Whatever you can spare |
| `minTrials`, `maxTrials` | Bounds on the N chosen from the budget. | 2,000 and 40,000 |
| `shortlist` | How many probe results go on to the sweep. | 10 to 20 |
| `always` | Parameters that go to the sweep whatever the probe says. Use it for those that reach few trials, since a probe ranks them low. | Your rare, local defects |
| `seed` | Reproducibility. Change it to replicate. | Any |

A local parameter needs care: a defect at one position reaches about 2 trials in 37, so a 200-trial probe sees only about ten trials that it touched. Do not drop a parameter because its probe rank is low if it could plausibly bias outcomes.

A stackup of many builds at few trials each averages over builds, so one build's bias can be hidden. To test a specific build for bias, run that build with `deltas` and pair it against the baseline.
