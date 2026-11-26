// One worker thread: loads the model once, then runs batches of trials for the runner.
import {parentPort, workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {drawInputs, resolveParameters} from './contract.js';
import {createRng} from './rng.js';

const model = (await import(pathToFileURL(workerData.modelPath).href)).default;
const categoryIndex = new Map((model.outcome?.categories ?? []).map((c, i) => [String(c), i]));
const metrics = model.metrics ?? [];

// one built instance at a time; builds change between batches at most
let cached = {key: null, instance: null};
const instanceFor = (scenario, build) => {
  const key = `${scenario.name}/${build}`;
  if (cached.key !== key) {
    const params = resolveParameters(model, scenario, createRng(scenario.seed, 'build', build));
    cached = {key, instance: model.prepare ? model.prepare(params) : params};
  }
  return cached.instance;
};

parentPort.on('message', ({scenario, build, from, to, jobId}) => {
  try {
    const instance = instanceFor(scenario, build);
    const n = to - from;
    const outcome = new Int32Array(n);
    const values = new Float64Array(n * metrics.length);
    for (let k = 0; k < n; k++) {
      const i = from + k;
      // the inputs come from the trial's own stream, so every scenario sees the same launches
      const inputs = drawInputs(model, scenario, createRng(scenario.inputSeed ?? scenario.seed, 'inputs', i));
      const rng = createRng(scenario.seed, 'trial', build, i);
      const res = model.trial(instance, inputs, rng) ?? {};
      outcome[k] = res.outcome === undefined || res.outcome === null ? -1 : categoryIndex.get(String(res.outcome)) ?? -1;
      for (let m = 0; m < metrics.length; m++) values[k * metrics.length + m] = res.metrics?.[metrics[m].id] ?? NaN;
    }
    parentPort.postMessage({jobId, from, outcome, values}, [outcome.buffer, values.buffer]);
  } catch (err) {
    parentPort.postMessage({jobId, error: String(err?.stack ?? err)});
  }
});
parentPort.postMessage({ready: true});
