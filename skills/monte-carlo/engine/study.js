// The study: spend a little to learn where to spend a lot.
//
//   1 pilot    what one trial costs, how often the model fails, whether the unmodified model passes its null
//   2 probe    every selected parameter at +/- k tolerance widths, small N, each paired against the baseline trial by trial
//   3 plan     rank by what the probe saw, then size the full sweep to the budget and say what that size can detect
//   4 sweep    the shortlist, at the sized N, each on the same launches, corrected across everything tested
//   5 doses    the strongest parameters pushed beyond tolerance, to see where an outcome shift first becomes visible
//   6 coupling two-factor interactions among the strongest: does a pair do more than its two effects added together?
//   7 stackup  every tolerance drawn at once on many built instances, with their correlations, the production question
//
// A pilot cannot prove a parameter does nothing. It can show which ones are worth the budget, and the report keeps what was
// dropped, with the probe's numbers, so a reader can overrule it.
import {selectParameters, toleranceSd} from './contract.js';
import {compare, runScenario, summarize} from './runner.js';
import {angleDiff, benjaminiHochberg, chiSquareLambda, circular, mean, normalSf, shiftForTrials, stdev, trialsForShift} from './stats.js';

const DEFAULTS = {select: '*', k: 3, seed: 1, probeTrials: 200, budgetMinutes: 30, minTrials: 1000, maxTrials: 100000, shortlist: 12, signs: [1, -1], doses: [10, 30], doseTop: 3, couplingTop: 4, builds: 20, targetShift: 0.2, alpha: 0.05, power: 0.8};

const strongest = (cmp) => {
  let best = {metric: null, effect: 0, z: 0, p: 1};
  for (const [id, m] of Object.entries(cmp.metrics ?? {})) {
    const e = m.paired;
    if (e && e.effect > best.effect) best = {metric: id, effect: e.effect, z: e.z, p: e.p, mean: e.mean};
    const c = m.concentration;
    if (c && Math.abs(c.z) > 3 && Math.abs(c.change) > best.effect) best = {metric: `${id} concentration`, effect: Math.abs(c.change), z: c.z, p: Math.min(1, 2 * normalSf(Math.abs(c.z))), mean: c.change};
  }
  return best;
};

/**
 * Per trial, the part of (a and b together) that (a alone) and (b alone) do not explain: ab - a - b + baseline. Zero means
 * the two simply add. Effect is in units of the baseline's spread, as in the probe.
 */
const interaction = (model, base, a, b, ab) => {
  const out = {};
  (model.metrics ?? []).forEach((m, j) => {
    const nm = base.nm;
    const ds = [];
    const ref = [];
    const diff = (x, y) => (m.kind === 'circular' ? angleDiff(x, y) : x - y);
    for (let i = 0; i < base.outcome.length; i++) {
      const v0 = base.values[i * nm + j];
      const va = a.values[i * nm + j];
      const vb = b.values[i * nm + j];
      const vc = ab.values[i * nm + j];
      if (Number.isFinite(v0)) ref.push(v0);
      if (Number.isFinite(v0 + va + vb + vc)) ds.push(diff(diff(vc, vb), diff(va, v0)));
    }
    if (ds.length < 2) return;
    const mu = mean(ds);
    const se = stdev(ds) / Math.sqrt(ds.length);
    let spread = stdev(ref);
    if (m.kind === 'circular') {
      const R = circular(ref).rBar;
      spread = R > 1e-3 ? (Math.sqrt(-2 * Math.log(R)) * 180) / Math.PI : 104;
    }
    const z = se > 0 ? mu / se : 0;
    out[m.id] = {mean: mu, se, z, effect: spread > 0 ? Math.abs(mu) / spread : 0, p: Math.min(1, 2 * normalSf(z))};
  });
  return out;
};

const trialSeconds = (run, workers) => (run.seconds * workers) / run.outcome.length;

export async function study(pool, model, specIn, {onProgress, log = () => {}, workers = 1, checkpoint = () => {}} = {}) {
  const spec = {...DEFAULTS, ...specIn};
  const common = {seed: spec.seed, inputs: spec.inputs, presets: spec.presets, values: spec.values, deltas: spec.base};
  const cats = model.outcome?.categories.length ?? 0;
  const p0 = cats ? 1 / cats : 0;
  const res = {spec, stages: {}};

  // ------------------------------------------------------------ 1 pilot
  log(`pilot: ${spec.probeTrials} trials of the unmodified model`);
  const base = await runScenario(pool, model, {...common, name: 'baseline', trials: spec.probeTrials}, {onProgress});
  const costPerTrial = trialSeconds(base, workers);
  res.stages.pilot = {trials: spec.probeTrials, costPerTrial, workers, summary: summarize(model, base)};
  checkpoint(res);

  // ------------------------------------------------------------ 2 probe
  const params = selectParameters(model, spec.select).filter((p) => spec.deltas?.[p.id] !== undefined || toleranceSd(p) > 0);
  log(`probe: ${params.length} parameters x ${spec.signs.length} signs x ${spec.probeTrials} trials`);
  const widths = (p) => spec.deltas?.[p.id] ?? spec.k * toleranceSd(p);
  const probe = [];
  for (const p of params) {
    for (const sign of spec.signs) {
      const delta = sign * widths(p);
      const run = await runScenario(pool, model, {...common, name: `probe ${p.id} ${delta}`, trials: spec.probeTrials, deltas: {...(spec.base ?? {}), [p.id]: delta}}, {onProgress});
      const cmp = compare(model, base, run);
      probe.push({parameter: p.id, group: p.group, unit: p.unit, delta, reach: cmp.reach, strongest: strongest(cmp), outcomeP: cmp.outcome?.p, metrics: cmp.metrics});
    }
    res.stages.probe = {rows: probe};
  }
  // the study's score: how far the strongest metric moved, and how many trials the parameter reached at all
  const byParam = new Map();
  for (const r of probe) {
    const cur = byParam.get(r.parameter) ?? {parameter: r.parameter, group: r.group, unit: r.unit, effect: 0, metric: null, zMax: 0, reached: 0, delta: Math.abs(r.delta)};
    if (r.strongest.effect > cur.effect) {
      cur.effect = r.strongest.effect;
      cur.metric = r.strongest.metric;
      cur.zMax = Math.abs(r.strongest.z);
    }
    cur.reached = Math.max(cur.reached, 1 - r.reach.identicalTrials);
    byParam.set(r.parameter, cur);
  }
  const ranked = [...byParam.values()].sort((a, b) => b.effect - a.effect);
  const q = benjaminiHochberg(probe.map((r) => r.strongest.p));
  probe.forEach((r, i) => (r.q = q[i]));
  res.stages.probe = {rows: probe, ranked};
  checkpoint(res);

  // ------------------------------------------------------------ 3 plan
  // a local element reaches few trials and moves little on average, so it would fall off a list ranked only by effect;
  // half of the shortlist comes from each ranking
  const half = Math.ceil(spec.shortlist / 2);
  const chosen = new Map();
  for (const r of ranked.slice(0, half)) chosen.set(r.parameter, r);
  const localRoots = [...byParam.values()].filter((r) => r.reached < 0.999).sort((a, b) => b.reached - a.reached);
  for (const r of localRoots) {
    if (chosen.size >= spec.shortlist) break;
    chosen.set(r.parameter, r);
  }
  for (const r of ranked) {
    if (chosen.size >= spec.shortlist) break;
    chosen.set(r.parameter, r);
  }
  for (const id of spec.always ?? []) if (byParam.has(id)) chosen.set(id, byParam.get(id));
  const shortlist = [...chosen.values()];
  const nPairs = (spec.couplingTop * (spec.couplingTop - 1)) / 2;
  // baseline, null check, shortlist, doses, pairs at (+,+) and (+,-), and the stackup's worth of one more case
  const cases = shortlist.length * spec.signs.length + 3 + spec.doseTop * spec.doses.length * spec.signs.length + nPairs * 2;
  const budgetTrials = (spec.budgetMinutes * 60 * workers) / costPerTrial;
  const fromBudget = Math.floor(budgetTrials / cases);
  const trials = Math.max(spec.minTrials, Math.min(spec.maxTrials, fromBudget));
  const wanted = cats ? trialsForShift(p0, spec.targetShift, {alpha: spec.alpha, power: spec.power, categories: cats}) : null;
  const ladder = cats ? [200, 1000, 3000, 10000, 30000, 100000, 300000, 1000000].map((n) => ({
    trials: n,
    secondsPerCase: (n * costPerTrial) / workers,
    oneCategoryShift: shiftForTrials(p0, n, {alpha: spec.alpha, power: spec.power}),
    oneCategoryShiftCorrected: shiftForTrials(p0, n, {alpha: spec.alpha, power: spec.power, categories: cats}),
    // the size of a pattern across all categories (Cohen's w) a chi-square test could see, two arms of n each
    chiSquareW: Math.sqrt((2 * chiSquareLambda(cats - 1, spec.alpha, spec.power)) / n),
  })) : [];
  res.stages.plan = {shortlist: shortlist.map((r) => r.parameter), cases, trials, fromBudget, trialsWantedForTarget: wanted, targetShift: spec.targetShift, secondsEstimate: (cases * trials * costPerTrial) / workers, ladder};
  checkpoint(res);
  log(`plan: ${cases} cases x ${trials} trials, about ${(res.stages.plan.secondsEstimate / 60).toFixed(0)} min`);

  // ------------------------------------------------------------ 4 sweep
  const full = await runScenario(pool, model, {...common, name: 'baseline full', trials}, {onProgress});
  // a second baseline on a different seed: what "no change" looks like at this N, and a check on the tests themselves
  const nullCheck = await runScenario(pool, model, {...common, name: 'null check', seed: spec.seed + 1000, trials}, {onProgress});
  const nullCmp = compare(model, full, nullCheck);
  res.stages.sweep = {trials, baseline: summarize(model, full), nullCheck: {outcomeP: nullCmp.outcome?.p, largest: nullCmp.outcome?.largest}, rows: []};
  const runs = new Map();
  const measure = async (id, delta, stage) => {
    const run = await runScenario(pool, model, {...common, name: `${stage} ${id} ${delta}`, trials, deltas: {...(spec.base ?? {}), [id]: delta}}, {onProgress});
    runs.set(`${id}|${delta}`, run);
    const cmp = compare(model, full, run);
    return {parameter: id, delta, unit: model.parameters.find((p) => p.id === id)?.unit, outcome: cmp.outcome, reach: cmp.reach, metrics: cmp.metrics, vsNullP: summarize(model, run).outcome?.gofVsNull.p};
  };
  const correct = (rows) => {
    if (!cats) return;
    const qs = benjaminiHochberg(rows.map((r) => r.outcome.p));
    const qm = benjaminiHochberg(rows.map((r) => r.outcome.largest.p));
    const qp = benjaminiHochberg(rows.map((r) => r.outcome.paired?.p ?? 1));
    const qt = benjaminiHochberg(rows.map((r) => r.outcome.paired?.top.pCorrected ?? 1));
    rows.forEach((r, i) => {
      r.outcome.q = qs[i];
      r.outcome.largest.q = qm[i];
      if (r.outcome.paired) {
        r.outcome.paired.q = qp[i];
        r.outcome.paired.top.q = qt[i];
      }
    });
  };
  for (const r of shortlist) {
    for (const sign of spec.signs) {
      res.stages.sweep.rows.push(await measure(r.parameter, sign * r.delta, 'sweep'));
      correct(res.stages.sweep.rows);
      checkpoint(res);
    }
  }

  // ------------------------------------------------------------ 5 doses
  const toDose = spec.doseIds ?? shortlist.slice(0, spec.doseTop).map((r) => r.parameter);
  res.stages.doses = {rows: []};
  for (const id of toDose) {
    const p = model.parameters.find((x) => x.id === id);
    for (const mult of spec.doses) {
      for (const sign of spec.signs) {
        const row = await measure(id, sign * mult * toleranceSd(p), 'dose');
        row.widths = mult;
        res.stages.doses.rows.push(row);
        correct(res.stages.doses.rows);
        checkpoint(res);
      }
    }
  }

  // ------------------------------------------------------------ 6 coupling
  const top = (spec.couplingIds ?? shortlist.slice(0, spec.couplingTop).map((r) => r.parameter)).map((id) => byParam.get(id)).filter(Boolean);
  res.stages.coupling = {rows: []};
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      for (const sb of [1, -1]) {
        const A = top[i];
        const B = top[j];
        const da = A.delta;
        const db = sb * B.delta;
        const ra = runs.get(`${A.parameter}|${da}`) ?? (await runScenario(pool, model, {...common, name: `solo ${A.parameter} ${da}`, trials, deltas: {...(spec.base ?? {}), [A.parameter]: da}}, {onProgress}));
        const rb = runs.get(`${B.parameter}|${db}`) ?? (await runScenario(pool, model, {...common, name: `solo ${B.parameter} ${db}`, trials, deltas: {...(spec.base ?? {}), [B.parameter]: db}}, {onProgress}));
        const both = await runScenario(pool, model, {...common, name: `pair ${A.parameter} ${da} ${B.parameter} ${db}`, trials, deltas: {...(spec.base ?? {}), [A.parameter]: da, [B.parameter]: db}}, {onProgress});
        const cmp = compare(model, full, both);
        res.stages.coupling.rows.push({a: A.parameter, da, b: B.parameter, db, outcome: cmp.outcome, interaction: interaction(model, full, ra, rb, both)});
        checkpoint(res);
      }
    }
  }

  // ------------------------------------------------------------ 7 stackup
  const perBuild = Math.max(50, Math.floor(trials / spec.builds));
  const stack = await runScenario(pool, model, {...common, name: 'stackup', trials: perBuild, builds: spec.builds, sampleTolerances: spec.stackupSelect ?? spec.select}, {onProgress});
  const stackCmp = compare(model, full, stack);
  res.stages.stackup = {builds: spec.builds, perBuild, summary: summarize(model, stack), outcomeVsBaseline: stackCmp.outcome};
  checkpoint(res);
  return res;
}

// ------------------------------------------------------------ report
const fn = (x, d = 3) => (x === undefined || x === null || Number.isNaN(x) ? '-' : (+x.toPrecision(d)).toString());
const fp = (p) => (p === undefined || p === null ? '-' : p < 1e-4 ? p.toExponential(1) : p.toFixed(4));
const pct = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const time = (s) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : `${(s / 3600).toFixed(1)} h`);

export function reportStudy(model, res) {
  const L = [`# ${model.name}: probe, then sweep`, ''];
  const {pilot, probe, plan, sweep, doses} = res.stages;
  if (pilot) {
    const o = pilot.summary.outcome;
    L.push('## Pilot', '', `${pilot.trials} trials of the unmodified model. One trial costs ${fn(pilot.costPerTrial)} s of one core, so ${pilot.workers} workers run ${fn(pilot.workers / pilot.costPerTrial)} trials a second.${o ? ` ${o.invalid} invalid. Against the null, p = ${fp(o.gofVsNull.p)}.` : ''}`, '');
  }
  if (probe?.ranked) {
    L.push('## Probe', '', `${probe.ranked.length} parameters, each at ±${res.spec.k} tolerance widths, ${pilot.trials} trials per case, paired trial by trial with the baseline. **Effect** is the strongest metric's mean change in units of its baseline spread. **Reached** is the share of trials the parameter changed at all.`, '', '| Parameter | Delta | Reached | Strongest metric | Effect | Paired z |', '|---|---|---|---|---|---|');
    for (const r of probe.ranked) L.push(`| ${r.parameter} | ±${fn(r.delta)} ${r.unit ?? ''} | ${pct(r.reached)} | ${r.metric ?? '-'} | ${fn(r.effect)} | ${fn(r.zMax)} |`);
    L.push('');
  }
  if (plan) {
    L.push('## Plan', '', `Shortlist of ${plan.shortlist.length}, ${plan.cases} cases, ${plan.trials} trials each, about ${time(plan.secondsEstimate)}. Telling a ${pct(plan.targetShift)} shift in one unnamed category would take ${plan.trialsWantedForTarget?.toLocaleString('en-US') ?? '-'} trials per arm.`, '');
    if (plan.ladder.length) {
      L.push('What N buys, per case:', '', '| Trials | Time per case | One known category, smallest shift | Any category, smallest shift | Whole pattern, Cohen w |', '|---|---|---|---|---|');
      for (const r of plan.ladder) L.push(`| ${r.trials.toLocaleString('en-US')} | ${time(r.secondsPerCase)} | ${pct(r.oneCategoryShift)} | ${pct(r.oneCategoryShiftCorrected)} | ${fn(r.chiSquareW)} |`);
      L.push('');
    }
  }
  const table = (rows) => {
    L.push('| Parameter | Delta | Reached | Moved outcome | Paired p | q | Most changed category | Gained / lost | Its q | Against null p |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const o = r.outcome?.paired;
      L.push(`| ${r.parameter} | ${fn(r.delta)} ${r.unit ?? ''}${r.widths ? ` (${r.widths} widths)` : ''} | ${pct(1 - r.reach.identicalTrials)} | ${o ? pct(o.discordant / o.n) : '-'} | ${fp(o?.p)} | ${fp(o?.q)} | ${o?.top.category ?? '-'} | ${o ? `${o.top.gained} / ${o.top.lost}` : '-'} | ${fp(o?.top.q)} | ${fp(r.vsNullP)} |`);
    }
    L.push('', '**Paired** compares the arms launch by launch, so only trials the change moved count. **Moved outcome** is the share of trials that ended in a different category.', '');
  };
  const metricTable = (rows) => {
    const ids = (model.metrics ?? []).map((m) => m.id);
    L.push('| Parameter | Delta | ' + ids.join(' | ') + ' |', '|---|---|' + ids.map(() => '---').join('|') + '|');
    for (const r of rows) L.push(`| ${r.parameter} | ${fn(r.delta)} | ${ids.map((id) => {
      const m = r.metrics[id]?.paired;
      return m ? `${fn(m.mean)}${Math.abs(m.z) > 3.5 ? ' *' : ''}` : '-';
    }).join(' | ')} |`);
    L.push('', '`*` marks a paired |z| above 3.5.', '');
  };
  if (sweep?.rows?.length) {
    L.push('## Sweep', '', `${sweep.trials} trials per case. Two clean baselines on different seeds gave p = ${fp(sweep.nullCheck.outcomeP)}, which is what no change looks like here.`, '');
    table(sweep.rows);
    L.push('Mean paired change in each metric:', '');
    metricTable(sweep.rows);
  }
  if (doses?.rows?.length) {
    L.push('## Beyond tolerance', '');
    table(doses.rows);
    metricTable(doses.rows);
  }
  if (res.stages.coupling?.rows?.length) {
    const ids = (model.metrics ?? []).map((m) => m.id);
    L.push('## Cross-coupling', '', 'Mean of ab - a - b + baseline, trial by trial. Zero means the pair just adds. `*` marks |z| above 3.5.', '', '| Pair | ' + ids.join(' | ') + ' | Outcome p |', '|---|' + ids.map(() => '---').join('|') + '|---|');
    for (const r of res.stages.coupling.rows) L.push(`| ${r.a} ${fn(r.da)} x ${r.b} ${fn(r.db)} | ${ids.map((id) => {
      const m = r.interaction[id];
      return m ? `${fn(m.mean)}${Math.abs(m.z) > 3.5 ? ' *' : ''}` : '-';
    }).join(' | ')} | ${fp(r.outcome?.p)} |`);
    L.push('');
  }
  if (res.stages.stackup) {
    const s = res.stages.stackup;
    const o = s.summary.outcome;
    L.push('## The whole stackup at once', '', `${s.builds} built instances, ${s.perBuild} trials each, every selected tolerance drawn with its correlations.${o ? ` Against the null, p = ${fp(o.gofVsNull.p)}; against the unmodified model, p = ${fp(s.outcomeVsBaseline?.p)}. ${o.invalid} invalid.` : ''}`, '');
  }
  return L.join('\n');
}
