# Choosing trial counts

**Draft.** The numbers from the roulette study are still being generated. The method below is final.

Do not guess N. Run a `study`, which spends a little to learn where to spend a lot:

1. **Pilot:** what a trial costs, and whether the unmodified model passes its null.
2. **Probe:** a small N for every selected parameter, paired against the baseline. Start at 200 trials.
3. **Plan:** a shortlist by effect and reach, with N fitted to `budgetMinutes`. The report prints a table of what each N can detect.
4. **Sweep, doses, coupling, stackup:** the full run at that N.

```bash
echo '{"probeTrials": 200, "budgetMinutes": 10}' | node skills/monte-carlo/engine/cli.js study my.model.js -
```
