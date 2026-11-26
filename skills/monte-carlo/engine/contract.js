// What a physical model must export to be run by this engine, and how a scenario turns into parameter values.
// The engine knows nothing else about the model. See ../SKILL.md for the contract in prose.
import {draw} from './rng.js';

const fail = (msg) => {
  throw new Error(`model contract: ${msg}`);
};

export function validateModel(m) {
  if (!m || typeof m !== 'object') fail('the module must have a default export');
  if (!m.name) fail('missing name');
  if (typeof m.trial !== 'function') fail('missing trial(instance, inputs, rng)');
  if (!Array.isArray(m.parameters)) fail('parameters must be an array');
  if (!Array.isArray(m.inputs)) fail('inputs must be an array');
  const seen = new Set();
  for (const p of m.parameters) {
    if (!p.id) fail('a parameter has no id');
    if (seen.has(p.id)) fail(`duplicate parameter id ${p.id}`);
    seen.add(p.id);
    if (typeof p.nominal !== 'number') fail(`parameter ${p.id} needs a numeric nominal`);
    if (p.tol && !(p.tol.sd >= 0 || p.tol.halfWidth >= 0)) fail(`parameter ${p.id}: tol needs sd or halfWidth`);
  }
  for (const i of m.inputs) {
    if (!i.id) fail('an input has no id');
    if (!i.dist) fail(`input ${i.id} needs a dist`);
  }
  if (m.outcome && m.outcome.kind !== 'categorical') fail('outcome.kind must be "categorical"');
  if (m.outcome && !Array.isArray(m.outcome.categories)) fail('outcome.categories must be an array');
  if (!m.outcome && !(m.metrics || []).length) fail('declare an outcome, metrics, or both');
  for (const x of m.metrics || []) {
    if (!x.id) fail('a metric has no id');
    if (x.kind && x.kind !== 'linear' && x.kind !== 'circular') fail(`metric ${x.id}: kind must be linear or circular`);
  }
  return m;
}

const matcher = (patterns) => {
  const res = [].concat(patterns).map((g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  return (id) => res.some((r) => r.test(id));
};

/** Parameters whose id or group matches a glob or list of globs. */
export const selectParameters = (model, patterns) => {
  const hit = matcher(patterns);
  return model.parameters.filter((p) => hit(p.id) || (p.group && hit(p.group)));
};

const toleranceDist = (p) => {
  if (!p.tol) return {dist: 'fixed', value: p.nominal};
  if (p.tol.halfWidth !== undefined) return {dist: 'uniform', min: p.nominal - p.tol.halfWidth, max: p.nominal + p.tol.halfWidth};
  return {dist: 'normal', mean: p.nominal, sd: p.tol.sd, min: p.min, max: p.max};
};

/**
 * Standard normal scores for correlated normal tolerances: z = sqrt(rho) f + sqrt(1 - rho) e, with f shared across one
 * model.correlations entry {ids: [globs], rho}. A parameter in no entry draws independently.
 */
const correlatedScores = (model, rng) => {
  const out = new Map();
  for (const {ids, rho} of model.correlations ?? []) {
    const hit = matcher(ids);
    const f = rng.normal();
    for (const p of model.parameters) {
      if (hit(p.id) && !out.has(p.id)) out.set(p.id, Math.sqrt(rho) * f + Math.sqrt(1 - rho) * rng.normal());
    }
  }
  return out;
};

/** One tolerance width: the sd of a normal, or the half width of a uniform over sqrt(3), so the two compare. */
export const toleranceSd = (p) => (p.tol ? (p.tol.halfWidth !== undefined ? p.tol.halfWidth / Math.sqrt(3) : p.tol.sd) : 0);

/**
 * The parameter values of one built instance.
 * scenario.values: {id: absolute}, scenario.deltas: {id: added to nominal}, scenario.sampleTolerances: glob(s) of the
 * parameters drawn from their tolerance on this build.
 */
export function resolveParameters(model, scenario, rng) {
  const out = {};
  const sample = scenario.sampleTolerances ? matcher(scenario.sampleTolerances) : () => false;
  const scores = scenario.sampleTolerances ? correlatedScores(model, rng) : new Map();
  for (const p of model.parameters) {
    const sampled = sample(p.id) || (p.group && sample(p.group));
    if (sampled && scores.has(p.id) && p.tol?.sd !== undefined) {
      out[p.id] = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, p.nominal + p.tol.sd * scores.get(p.id)));
    } else {
      out[p.id] = sampled ? draw(toleranceDist(p), rng) : p.nominal;
    }
  }
  // a preset is a named set of absolute values the model declares ("ball.marble"); deltas and values still apply on top
  for (const name of [].concat(scenario.presets ?? [])) {
    const preset = model.presets?.[name];
    if (!preset) throw new Error(`scenario.presets: no preset ${name}`);
    for (const [id, v] of Object.entries(preset.values)) {
      if (!(id in out)) throw new Error(`preset ${name}: no parameter ${id}`);
      out[id] = v;
    }
  }
  for (const [id, v] of Object.entries(scenario.deltas || {})) {
    if (!(id in out)) throw new Error(`scenario.deltas: no parameter ${id}`);
    out[id] += v;
  }
  for (const [id, v] of Object.entries(scenario.values || {})) {
    if (!(id in out)) throw new Error(`scenario.values: no parameter ${id}`);
    out[id] = v;
  }
  // a push past tolerance still has to be physical
  for (const p of model.parameters) {
    if (p.min !== undefined && out[p.id] < p.min) out[p.id] = p.min;
    if (p.max !== undefined && out[p.id] > p.max) out[p.id] = p.max;
  }
  return out;
}

/** The input values of one trial. scenario.inputs replaces a declared distribution by id. */
export function drawInputs(model, scenario, rng) {
  const out = {};
  for (const i of model.inputs) out[i.id] = draw(scenario.inputs?.[i.id] ?? i.dist, rng);
  return out;
}
