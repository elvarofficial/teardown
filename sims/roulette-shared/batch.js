// In-page Monte Carlo: the same model and random streams as the command line, on Web Workers. The page is one self-contained
// HTML file, so each worker runs that page's own script again, and bootWorker() takes over instead of the interface.
import {drawInputs, resolveParameters} from '../../skills/monte-carlo/engine/contract.js';
import {createRng} from '../../skills/monte-carlo/engine/rng.js';
import model from './model.js';

export const isWorker = () => typeof document === 'undefined';

export function bootWorker() {
  let instance = null;
  self.onmessage = ({data}) => {
    if (data.scenario) {
      instance = model.prepare(resolveParameters(model, data.scenario, createRng(data.scenario.seed, 'build', 0)));
      self.scenario = data.scenario;
      return;
    }
    const {from, to} = data;
    const scenario = self.scenario;
    const counts = new Array(model.outcome.categories.length).fill(0);
    let invalid = 0;
    let rim = 0;
    let total = 0;
    let bounces = 0;
    const az = [];
    for (let i = from; i < to; i++) {
      const res = model.trial(instance, drawInputs(model, scenario, createRng(scenario.seed, 'inputs', i)), createRng(scenario.seed, 'trial', 0, i));
      const k = res.outcome === null ? -1 : model.outcome.categories.indexOf(res.outcome);
      if (k < 0) {
        invalid++;
        continue;
      }
      counts[k]++;
      rim += res.metrics.rimTime;
      total += res.metrics.totalTime;
      bounces += res.metrics.fretHits;
      az.push(res.metrics.leaveAz);
    }
    self.postMessage({counts, invalid, rim, total, bounces, az, n: to - from});
  };
}

/** Runs `trials` trials on the page's own script. onUpdate gets running totals; returns a cancel function. */
export function runBatch(scenario, trials, onUpdate) {
  const source = document.querySelector('script[type=module]').textContent;
  const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
  const size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
  const workers = [];
  const totals = {counts: new Array(model.outcome.categories.length).fill(0), invalid: 0, rim: 0, total: 0, bounces: 0, az: [], done: 0, trials};
  let next = 0;
  const chunk = 10;
  let finished = false;
  const cancel = () => {
    finished = true;
    for (const w of workers) w.terminate();
    URL.revokeObjectURL(url);
  };
  const feed = (w) => {
    if (next >= trials) return;
    const from = next;
    next = Math.min(trials, next + chunk);
    w.postMessage({from, to: next});
  };
  for (let i = 0; i < size; i++) {
    const w = new Worker(url, {type: 'module'});
    workers.push(w);
    w.postMessage({scenario});
    w.onerror = (e) => {
      if (!finished) {
        cancel();
        onUpdate({...totals, error: e.message || 'worker failed', finished: true});
      }
    };
    w.onmessage = ({data}) => {
      if (finished) return;
      data.counts.forEach((c, k) => (totals.counts[k] += c));
      totals.invalid += data.invalid;
      totals.rim += data.rim;
      totals.total += data.total;
      totals.bounces += data.bounces;
      totals.az.push(...data.az);
      totals.done += data.n;
      const over = totals.done >= trials;
      if (over) cancel();
      onUpdate({...totals, finished: over});
      if (!over) feed(w);
    };
    feed(w);
  }
  return cancel;
}
