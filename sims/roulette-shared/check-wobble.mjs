// Replicates the rotor wobble result on fresh launches: the bias should flip with the wobble's sign. Run from the repo root.
// node check-wobble.mjs [trials] [seed] [wobbles in deg, comma-separated] [out dir]
import fs from 'node:fs';
import {compare, loadModel, Pool, runScenario} from '../../skills/monte-carlo/engine/runner.js';
import {SEQUENCE} from './spec.js';

const TRIALS = Number(process.argv[2] ?? 30000);
const SEED = Number(process.argv[3] ?? 22);
const DELTAS = (process.argv[4] ?? '0.3,-0.3').split(',').map(Number);
const OUT = process.argv[5] ?? 'montecarlo-out/roulette/wobble';

const {abs, model} = await loadModel('sims/roulette-shared/model.js');
const pool = new Pool(abs);
await pool.ready;
const position = new Map(SEQUENCE.map((n, i) => [n, i]));
const angle = model.outcome.categories.map((c) => (2 * Math.PI * position.get(Number(c))) / SEQUENCE.length);

// the change in one harmonic of the counts round the wheel, tested launch by launch
function harmonic(base, run, h) {
  let c = 0, s = 0, cc = 0, ss = 0, cs = 0, n = 0;
  for (let i = 0; i < base.outcome.length; i++) {
    if (base.outcome[i] < 0 || run.outcome[i] < 0) continue;
    const dc = Math.cos(h * angle[run.outcome[i]]) - Math.cos(h * angle[base.outcome[i]]);
    const ds = Math.sin(h * angle[run.outcome[i]]) - Math.sin(h * angle[base.outcome[i]]);
    c += dc; s += ds; cc += dc * dc; ss += ds * ds; cs += dc * ds; n++;
  }
  const det = cc * ss - cs * cs;
  const x2 = det > 0 ? (c * c * ss - 2 * c * s * cs + s * s * cc) / det : 0;
  return {h, amplitudePct: (200 * Math.hypot(c, s)) / n, phaseDeg: ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360, x2, p: Math.exp(-x2 / 2)};
}

const arm = (name, delta) => runScenario(pool, model, {name, trials: TRIALS, seed: SEED, deltas: delta ? {'rotor.wobbleCos': delta} : {}}, {onProgress: (d, t) => { if (d % 3000 === 0) console.error(name, d, '/', t); }});
const base = await arm('level rotor');
const report = {trials: TRIALS, seed: SEED, arms: []};
for (const delta of DELTAS) {
  const run = await arm(`wobble ${delta}`, delta);
  const paired = compare(model, base, run).outcome.paired;
  report.arms.push({delta, p: paired.p, x2: paired.x2, df: paired.df, discordant: paired.discordant, top: paired.top, harmonics: [1, 2, 3, 4, 5].map((h) => harmonic(base, run, h))});
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report.arms.map(({top, ...a}) => a), null, 1));
await pool.close?.();
process.exit(0);
