// Runs scenarios on a pool of worker threads and turns the raw trials into summaries and comparisons.
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {selectParameters, toleranceSd, validateModel} from './contract.js';
import {angleDiff, benjaminiHochberg, chiSquareGof, chiSquareTwoSample, circular, ks, largestCategoryShift, mean, minDetectableShift, normalSf, quantile, stdev, welch, wilson} from './stats.js';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.js');

export const loadModel = async (modelPath) => {
  const abs = path.resolve(modelPath);
  return {abs, model: validateModel((await import(pathToFileURL(abs).href)).default)};
};

export class Pool {
  constructor(modelPath, size = Math.max(1, os.cpus().length - 1)) {
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.nextId = 0;
    this.workers = [];
    this.ready = Promise.all(
      Array.from({length: size}, () => new Promise((resolve, reject) => {
        const w = new Worker(WORKER, {workerData: {modelPath}});
        this.workers.push(w);
        w.on('error', (e) => {
          reject(e);
          for (const p of this.pending.values()) p.reject(e);
        });
        w.on('message', (msg) => {
          if (msg.ready) {
            this.idle.push(w);
            this.pump();
            return resolve();
          }
          const job = this.pending.get(msg.jobId);
          this.pending.delete(msg.jobId);
          this.idle.push(w);
          this.pump();
          if (msg.error) job.reject(new Error(msg.error));
          else job.resolve(msg);
        });
      })),
    );
  }
  pump() {
    while (this.idle.length && this.queue.length) this.idle.pop().postMessage(this.queue.shift());
  }
  run(job) {
    return new Promise((resolve, reject) => {
      const jobId = this.nextId++;
      this.pending.set(jobId, {resolve, reject});
      this.queue.push({...job, jobId});
      this.pump();
    });
  }
  close() {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

const normalise = (scenario) => ({name: 'scenario', seed: 1, trials: 1000, builds: 1, ...scenario});

/**
 * Runs one scenario: `trials` trials on each of `builds` built instances. Without sampled tolerances one build is all
 * there is; with them, each build is a different instance drawn from the stackup.
 */
export async function runScenario(pool, model, scenarioIn, {onProgress, batch = 50} = {}) {
  const scenario = normalise(scenarioIn);
  const metricsDecl = model.metrics ?? [];
  const nm = metricsDecl.length;
  const builds = scenario.builds;
  const total = scenario.trials * builds;
  const outcome = new Int32Array(total);
  const values = new Float64Array(total * nm);
  const t0 = Date.now();
  let done = 0;
  const jobs = [];
  for (let b = 0; b < builds; b++) {
    for (let from = 0; from < scenario.trials; from += batch) {
      const to = Math.min(scenario.trials, from + batch);
      jobs.push(
        pool.run({scenario, build: b, from, to}).then((r) => {
          const base = b * scenario.trials + r.from;
          outcome.set(r.outcome, base);
          values.set(r.values, base * nm);
          done += to - from;
          onProgress?.(done, total, scenario.name);
        }),
      );
    }
  }
  await Promise.all(jobs);
  return {scenario, outcome, values, nm, seconds: (Date.now() - t0) / 1000};
}

const metricColumn = (run, m) => {
  const out = [];
  for (let i = 0; i < run.outcome.length; i++) {
    const v = run.values[i * run.nm + m];
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
};

/** A run's counts, tests against the null, and per-metric summaries. */
export function summarize(model, run) {
  const res = {name: run.scenario.name, trials: run.outcome.length, seconds: run.seconds};
  if (model.outcome) {
    const cats = model.outcome.categories;
    const counts = new Array(cats.length).fill(0);
    let invalid = 0;
    for (const o of run.outcome) {
      if (o >= 0) counts[o]++;
      else invalid++;
    }
    const n = counts.reduce((a, b) => a + b, 0);
    const probs = model.outcome.nullProbs ?? cats.map(() => 1 / cats.length);
    const gof = chiSquareGof(counts, probs);
    const p0 = 1 / cats.length;
    res.outcome = {
      counts,
      invalid,
      valid: n,
      gofVsNull: gof,
      minDetectableShiftPerCategory: n ? minDetectableShift(n, p0) : null,
      categories: cats.map((c, i) => {
        const [lo, hi] = wilson(counts[i], n);
        return {category: c, count: counts[i], p: n ? counts[i] / n : 0, lo, hi, ratioToNull: n ? counts[i] / n / probs[i] : 0};
      }),
    };
  }
  res.metrics = {};
  metricsDecl(model).forEach((m, j) => {
    const col = metricColumn(run, j);
    if (m.kind === 'circular') {
      res.metrics[m.id] = {kind: 'circular', ...circular(col)};
    } else {
      const sorted = Float64Array.from(col).sort();
      res.metrics[m.id] = {kind: 'linear', n: col.length, mean: mean(col), sd: stdev(col), p05: quantile(sorted, 0.05), p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95)};
    }
  });
  return res;
}

const metricsDecl = (model) => model.metrics ?? [];

/**
 * The trial-by-trial difference between two runs on the same launches. A deterministic model changes only where the
 * parameter reaches, so this sees effects far smaller than an unpaired test can, for as long as the model has not gone
 * chaotic. `effect` is the mean difference in units of the baseline's spread.
 */
function pairedMetric(run, base, j, kind) {
  const n = Math.min(run.outcome.length, base.outcome.length);
  const ds = [];
  const ref = [];
  for (let i = 0; i < n; i++) {
    const a = run.values[i * run.nm + j];
    const b = base.values[i * base.nm + j];
    if (Number.isFinite(b)) ref.push(b);
    if (Number.isFinite(a) && Number.isFinite(b)) ds.push(kind === 'circular' ? angleDiff(a, b) : a - b);
  }
  if (ds.length < 2) return null;
  const m = mean(ds);
  const sd = stdev(ds);
  const se = sd / Math.sqrt(ds.length);
  const z = se > 0 ? m / se : m === 0 ? 0 : Infinity;
  let spread;
  if (kind === 'circular') {
    const R = circular(ref).rBar;
    spread = R > 1e-3 ? (Math.sqrt(-2 * Math.log(R)) * 180) / Math.PI : 104;
  } else {
    spread = stdev(ref);
  }
  return {mean: m, sd, se, z, p: Number.isFinite(z) ? Math.min(1, 2 * normalSf(z)) : 0, effect: spread > 0 ? Math.abs(m) / spread : 0, unchanged: ds.filter((d) => d === 0).length / ds.length};
}

/** How much of a run the parameter touched: trials with the same outcome, and trials with every metric identical. */
function reach(run, base) {
  const n = Math.min(run.outcome.length, base.outcome.length);
  let same = 0;
  let identical = 0;
  for (let i = 0; i < n; i++) {
    if (run.outcome[i] !== base.outcome[i]) continue;
    same++;
    let eq = true;
    for (let j = 0; j < run.nm; j++) {
      const a = run.values[i * run.nm + j];
      const b = base.values[i * base.nm + j];
      if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) {
        eq = false;
        break;
      }
    }
    if (eq) identical++;
  }
  return {sameOutcome: n ? same / n : 0, identicalTrials: n ? identical / n : 0};
}

/** Does `run` differ from `base`? Outcome by a two-sample chi-square, each metric by the test that suits its kind. */
export function compare(model, base, run) {
  const out = {name: run.scenario.name, baseline: base.scenario.name};
  if (model.outcome) {
    const count = (r) => {
      const c = new Array(model.outcome.categories.length).fill(0);
      for (const o of r.outcome) if (o >= 0) c[o]++;
      return c;
    };
    const ca = count(run);
    const cb = count(base);
    out.outcome = chiSquareTwoSample(ca, cb);
    const big = largestCategoryShift(ca, cb);
    out.outcome.largest = {...big, category: model.outcome.categories[big.index]};
  }
  out.reach = reach(run, base);
  out.metrics = {};
  metricsDecl(model).forEach((m, j) => {
    const a = metricColumn(run, j);
    const b = metricColumn(base, j);
    if (!a.length || !b.length) return;
    if (m.kind === 'circular') {
      const ca = circular(a);
      const cb = circular(b);
      // compare the two distributions after unwrapping each around the pooled mean direction
      const centre = circular([...a, ...b]).meanDeg;
      const test = ks(a.map((v) => angleDiff(v, centre)), b.map((v) => angleDiff(v, centre)));
      out.metrics[m.id] = {kind: 'circular', meanShiftDeg: angleDiff(ca.meanDeg, cb.meanDeg), rBar: ca.rBar, rBarBase: cb.rBar, ...test, paired: pairedMetric(run, base, j, 'circular')};
    } else {
      const w = welch(a, b);
      const test = ks(a, b);
      out.metrics[m.id] = {kind: 'linear', diff: w.diff, se: w.se, p: Math.min(1, 2 * Math.min(w.p, test.p)), d: test.d, paired: pairedMetric(run, base, j, 'linear')};
    }
  });
  return out;
}

/**
 * One-at-a-time sensitivity: each selected parameter pushed to +/- k tolerance widths with the others at nominal, on
 * the same launches, each compared with the shared baseline. P-values are corrected across everything tested.
 */
export async function sweep(pool, model, spec, {onProgress} = {}) {
  const k = spec.k ?? 3;
  const trials = spec.trials ?? 2000;
  const params = selectParameters(model, spec.select ?? '*').filter((p) => spec.deltas?.[p.id] !== undefined || toleranceSd(p) > 0);
  const common = {seed: spec.seed ?? 1, trials, inputs: spec.inputs, values: spec.values, deltas: spec.base};
  const base = await runScenario(pool, model, {...common, name: 'baseline'}, {onProgress});
  const rows = [];
  for (const p of params) {
    const size = spec.deltas?.[p.id] ?? k * toleranceSd(p);
    for (const sign of spec.signs ?? [1, -1]) {
      const delta = sign * size;
      const name = `${p.id} ${delta >= 0 ? '+' : ''}${+delta.toPrecision(3)}${p.unit ? ' ' + p.unit : ''}`;
      // a scenario's own seed is the same as baseline's and only the inputs are shared; the trial stream differs by
      // nothing either, so a change in the result can only come from the parameter
      const run = await runScenario(pool, model, {...common, name, deltas: {...(spec.base || {}), [p.id]: delta}}, {onProgress});
      rows.push({parameter: p.id, group: p.group, delta, unit: p.unit, ...compare(model, base, run), summary: summarize(model, run)});
    }
  }
  if (model.outcome) {
    const q = benjaminiHochberg(rows.map((r) => r.outcome.p));
    rows.forEach((r, i) => (r.outcome.q = q[i]));
  }
  for (const m of metricsDecl(model)) {
    const present = rows.filter((r) => r.metrics[m.id]);
    const q = benjaminiHochberg(present.map((r) => r.metrics[m.id].p));
    present.forEach((r, i) => (r.metrics[m.id].q = q[i]));
  }
  return {baseline: summarize(model, base), rows, k, trials};
}
