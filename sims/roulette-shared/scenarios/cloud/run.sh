#!/usr/bin/env bash
# The 24-hour cloud queue. Run from the repo root: sims/roulette-shared/scenarios/cloud/run.sh
# SCALE multiplies every job's trials (0.5 halves them), BUDGET is the study's minutes, OUT is where results go.
# A finished job leaves a .done file and is skipped on a rerun, so after a crash just run this again.
set -euo pipefail
SCALE=${SCALE:-1}
BUDGET=${BUDGET:-600}
OUT=${OUT:-montecarlo-out/cloud}
HERE=sims/roulette-shared/scenarios/cloud
CLI=skills/monte-carlo/engine/cli.js
MODEL=sims/roulette-shared/model.js
mkdir -p "$OUT/specs"

stamp() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/queue.log"; }

# a copy of a scenario file with its trial counts scaled, or the study with its budget set
spec() {
  node -e '
    const fs = require("fs");
    const [file, scale, budget] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    const fix = (o) => { if (o && o.trials) o.trials = Math.max(200, Math.round(o.trials * scale)); };
    fix(s.baseline); fix(s.common); (s.scenarios || []).forEach(fix);
    if (s.budgetMinutes !== undefined) { s.budgetMinutes = Number(budget); s.minTrials = Math.max(200, Math.round(s.minTrials * scale)); }
    process.stdout.write(JSON.stringify(s, null, 2));
  ' "$HERE/$1" "$SCALE" "$BUDGET" > "$OUT/specs/$1"
}

job() {
  local name=$1; shift
  if [ -f "$OUT/$name/.done" ]; then stamp "skip $name (done)"; return; fi
  stamp "start $name"
  mkdir -p "$OUT/$name"
  "$@" > "$OUT/$name.out" 2> "$OUT/$name.log"
  touch "$OUT/$name/.done"
  stamp "done $name"
}

job 0-tests node --test skills/monte-carlo/engine/engine.test.js sims/roulette-shared/physics.test.js
job 1-wobble node sims/roulette-shared/check-wobble.mjs "$(node -e "console.log(Math.max(200, Math.round(100000 * $SCALE)))")" 44 0.02,0.06,0.1,0.2,-0.06 "$OUT/1-wobble"
for f in 2-local 3-phase 4-tilt-boxwood 4-tilt-acetal; do
  spec "$f.json"
  job "$f" node "$CLI" run "$MODEL" "$OUT/specs/$f.json" --out "$OUT/$f"
done
spec 5-study.json
job 5-study node "$CLI" study "$MODEL" "$OUT/specs/5-study.json" --out "$OUT/5-study"
stamp "queue finished"
