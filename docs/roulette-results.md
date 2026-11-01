# Roulette wheel: results

**Pending.** The first sensitivity study is still running, so this commit reports no findings. To run it yourself:

```bash
node skills/monte-carlo/engine/cli.js study sims/roulette-shared/model.js sims/roulette-shared/scenarios/study.json
```

Only 23 of the 118 material coefficients are sourced. The other 95 are estimates, including every ball-on-surface pair, and every tolerance is an estimate too. See `sims/roulette-shared/data/coefficients.source.json`.
