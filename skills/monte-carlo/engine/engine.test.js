import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolveParameters, validateModel} from './contract.js';
import {createRng, draw} from './rng.js';
import {compare, loadModel, Pool, runScenario, summarize, sweep} from './runner.js';
import {benjaminiHochberg, chiSquareCritical, chiSquareGof, chiSquareLambda, chiSquarePower, chiSquareTwoSample, circular, gammaQ, ks, largestCategoryShift, shiftForTrials, trialsForShift, wilson, pairedOutcome} from './stats.js';
import {reportStudy, study} from './study.js';

const DIE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../examples/loaded-die.model.js');

test('gammaQ matches known chi-square tail values', () => {
  assert.ok(Math.abs(gammaQ(0.5, 3.841 / 2) - 0.05) < 1e-3);
  assert.ok(Math.abs(gammaQ(18, 50.998 / 2) - 0.05) < 1e-3); // df 36
  assert.ok(Math.abs(gammaQ(1, 9.21 / 2) - 0.01) < 1e-3);
});

test('chi-square rejects a loaded sample and keeps a fair one', () => {
  assert.ok(chiSquareGof([100, 100, 100, 100], [0.25, 0.25, 0.25, 0.25]).p > 0.99);
  assert.ok(chiSquareGof([150, 100, 100, 50], [0.25, 0.25, 0.25, 0.25]).p < 1e-6);
  assert.ok(chiSquareTwoSample([150, 50], [50, 150]).p < 1e-6);
});

test('wilson interval contains the proportion', () => {
  const [lo, hi] = wilson(27, 1000);
  assert.ok(lo < 0.027 && hi > 0.027 && hi - lo < 0.025);
});

test('benjamini-hochberg preserves order and caps at one', () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.9]);
  assert.ok(Math.abs(q[0] - 0.04) < 1e-12);
  assert.ok(q[3] <= 1);
});

test('rayleigh sees concentration, not a uniform circle', () => {
  const rng = createRng(1);
  const flat = Array.from({length: 5000}, () => rng() * 360);
  const peak = Array.from({length: 5000}, () => 90 + 20 * rng.normal());
  assert.ok(circular(flat).p > 0.01);
  const c = circular(peak);
  assert.ok(c.p < 1e-10);
  assert.ok(Math.abs(c.meanDeg - 90) < 2);
});

test('ks separates shifted normals', () => {
  const rng = createRng(2);
  const a = Array.from({length: 2000}, () => rng.normal());
  const b = Array.from({length: 2000}, () => rng.normal() + 0.3);
  const c = Array.from({length: 2000}, () => rng.normal());
  assert.ok(ks(a, b).p < 1e-6);
  assert.ok(ks(a, c).p > 0.001);
});

test('rng is deterministic per label and distributions have the right moments', () => {
  assert.equal(createRng(5, 'a')(), createRng(5, 'a')());
  assert.notEqual(createRng(5, 'a')(), createRng(5, 'b')());
  const rng = createRng(3);
  const xs = Array.from({length: 40000}, () => draw({dist: 'normal', mean: 2, sd: 3}, rng));
  const m = xs.reduce((a, b) => a + b) / xs.length;
  const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
  assert.ok(Math.abs(m - 2) < 0.06 && Math.abs(s - 3) < 0.06);
  const t = Array.from({length: 40000}, () => draw({dist: 'triangular', min: 0, mode: 1, max: 3}, rng));
  assert.ok(Math.abs(t.reduce((a, b) => a + b) / t.length - 4 / 3) < 0.02);
  assert.ok(Array.from({length: 2000}, () => draw({dist: 'normal', mean: 0, sd: 1, min: 0}, rng)).every((v) => v >= 0));
});

test('power tools agree with each other and with known values', () => {
  assert.ok(Math.abs(chiSquareCritical(36, 0.05) - 50.998) < 0.01);
  assert.ok(Math.abs(chiSquareCritical(1, 0.05) - 3.841) < 0.01);
  assert.ok(Math.abs(chiSquarePower(1, 7.85) - 0.8) < 0.015); // the classic lambda for 80% power on one df
  assert.ok(Math.abs(chiSquarePower(36, chiSquareLambda(36)) - 0.8) < 1e-6);
  const n = trialsForShift(1 / 37, 0.2);
  assert.ok(Math.abs(shiftForTrials(1 / 37, n) - 0.2) < 0.002);
  assert.ok(trialsForShift(1 / 37, 0.2, {categories: 37}) > n);
  const big = largestCategoryShift([200, 100, 100], [100, 100, 100]);
  assert.equal(big.index, 0);
  assert.ok(big.ratio > 1.3);
});

test('validateModel names what is wrong', () => {
  assert.throws(() => validateModel({name: 'x'}), /trial/);
  assert.throws(() => validateModel({name: 'x', trial() {}, parameters: [{id: 'a', nominal: 1}, {id: 'a', nominal: 1}], inputs: []}), /duplicate/);
});

test('resolveParameters applies nominal, deltas, values, sampled tolerance, and rejects unknown ids', () => {
  const m = {parameters: [{id: 'a', group: 'g', nominal: 1, tol: {sd: 1}}, {id: 'b', nominal: 5}]};
  const rng = createRng(1);
  assert.deepEqual(resolveParameters(m, {}, rng), {a: 1, b: 5});
  assert.equal(resolveParameters(m, {deltas: {a: 0.5}}, rng).a, 1.5);
  assert.equal(resolveParameters(m, {values: {b: 9}}, rng).b, 9);
  assert.notEqual(resolveParameters(m, {sampleTolerances: 'g'}, rng).a, 1);
  assert.throws(() => resolveParameters(m, {deltas: {zz: 1}}, rng), /zz/);
});

test('end to end on the loaded die: fair passes, loaded is caught, runs are reproducible', async () => {
  const {abs, model} = await loadModel(DIE);
  const pool = new Pool(abs, 2);
  await pool.ready;
  try {
    const fair = await runScenario(pool, model, {name: 'fair', trials: 6000, seed: 7});
    const again = await runScenario(pool, model, {name: 'fair', trials: 6000, seed: 7});
    assert.deepEqual([...fair.outcome], [...again.outcome]);
    const sFair = summarize(model, fair);
    assert.equal(sFair.outcome.invalid, 0);
    assert.ok(sFair.outcome.gofVsNull.p > 0.001);

    const loaded = await runScenario(pool, model, {name: 'loaded', trials: 6000, seed: 8, values: {'weight.six': 1.5}});
    const sLoaded = summarize(model, loaded);
    assert.ok(sLoaded.outcome.gofVsNull.p < 1e-6);
    assert.ok(sLoaded.outcome.categories[5].ratioToNull > 1.2);
    assert.ok(compare(model, fair, loaded).outcome.p < 1e-6);

    const sw = await sweep(pool, model, {trials: 4000, seed: 9, deltas: {'weight.six': 0.5, 'edge.bounce': 0.2}, signs: [1]});
    const row = (id) => sw.rows.find((r) => r.parameter === id);
    assert.ok(row('weight.six').outcome.q < 1e-4);
    assert.ok(row('edge.bounce').metrics.time.q < 1e-4);
    assert.ok(row('edge.bounce').outcome.q > 0.001);

    const builds = await runScenario(pool, model, {name: 'stackup', trials: 200, builds: 5, seed: 3, sampleTolerances: 'die'});
    assert.equal(builds.outcome.length, 1000);

    // the study finds the loaded face from a small probe, sizes the sweep and reports it
    const st = await study(pool, model, {probeTrials: 300, budgetMinutes: 0.02, minTrials: 2000, maxTrials: 2000, deltas: {'weight.six': 0.8, 'edge.bounce': 0.2}, signs: [1], doses: [3], doseTop: 1, seed: 4}, {workers: 2});
    assert.deepEqual(new Set(st.stages.plan.shortlist), new Set(['weight.six', 'edge.bounce']));
    assert.equal(st.stages.probe.ranked[0].parameter, 'edge.bounce'); // moves a metric on every trial
    const six = st.stages.sweep.rows.find((r) => r.parameter === 'weight.six');
    assert.ok(six.outcome.q < 0.01);
    assert.equal(six.outcome.largest.category, 6);
    assert.ok(st.stages.plan.ladder.length > 3);
    assert.ok(reportStudy(model, st).includes('What N buys'));
  } finally {
    await pool.close();
  }
});

test('the paired outcome test is calibrated, and sees a shift the two-sample test cannot', () => {
  const rng = createRng(5, 'paired');
  const k = 37;
  const pick = () => Math.floor(rng() * k);
  const table = (reach, toZero) => {
    const pairs = Array.from({length: k}, () => new Array(k).fill(0));
    const a = new Array(k).fill(0);
    const b = new Array(k).fill(0);
    for (let i = 0; i < 20000; i++) {
      const x = pick();
      const y = rng() < reach ? (rng() < toZero ? 0 : pick()) : x;
      pairs[x][y]++;
      a[x]++;
      b[y]++;
    }
    return {pairs, a, b};
  };
  // no net change, trials reshuffled: p should be uniform
  const ps = Array.from({length: 200}, () => pairedOutcome(table(0.05, 0).pairs).p);
  const low = ps.filter((p) => p < 0.05).length / ps.length;
  assert.ok(low < 0.12, `false positive rate ${low}`);
  // a tenth of the reached trials go to one category: 100 trials, a 18% shift in it
  const t = table(0.05, 0.1);
  const paired = pairedOutcome(t.pairs);
  assert.ok(paired.perCategory[0].p < 1e-6, `category p ${paired.perCategory[0].p}`);
  assert.equal(pairedOutcome(Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => (i === j ? 5 : 0)))).p, 1);
});
