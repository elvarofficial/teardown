#!/usr/bin/env node
// node cli.js inspect <model.js> [--group glob]
// node cli.js run     <model.js> <scenario.json | -> [--out dir] [--workers n]
// node cli.js sweep   <model.js> <sweep.json | ->    [--out dir] [--workers n]
// node cli.js study   <model.js> <study.json | ->    [--out dir] [--workers n]   small-N probe, then a sized full sweep
//
// A scenario file holds one scenario, or {"baseline": {...}, "scenarios": [{...}]} to compare several with a baseline.
import fs from 'node:fs';
import path from 'node:path';
import {selectParameters, toleranceSd} from './contract.js';
import {reportRun, reportSweep} from './report.js';
import {compare, loadModel, Pool, runScenario, summarize, sweep} from './runner.js';
import {reportStudy, study} from './study.js';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? d : argv[i + 1];
};
const [cmd, modelPath, specPath] = argv;
if (!cmd || !modelPath) {
  console.error('usage: cli.js inspect|run|sweep|study <model.js> [spec.json] [--out dir] [--workers n]');
  process.exit(1);
}
const {abs, model} = await loadModel(modelPath);

if (cmd === 'inspect' && argv.includes('--json')) {
  const units = (list) => list.map(({id, unit, label}) => ({id, unit, label}));
  console.log(JSON.stringify({name: model.name, parameters: units(model.parameters), inputs: units(model.inputs), metrics: units(model.metrics ?? [])}));
  process.exit(0);
}
if (cmd === 'inspect') {
  const params = opt('group') ? selectParameters(model, opt('group')) : model.parameters;
  const groups = new Map();
  for (const p of params) groups.set(p.group ?? '-', [...(groups.get(p.group ?? '-') ?? []), p]);
  console.log(`${model.name}: ${model.parameters.length} parameters, ${model.inputs.length} inputs, ${model.outcome?.categories.length ?? 0} outcome categories, ${(model.metrics ?? []).length} metrics`);
  for (const [g, ps] of groups) {
    console.log(`\n${g} (${ps.length})`);
    for (const p of ps) console.log(`  ${p.id.padEnd(30)} ${String(+p.nominal.toPrecision(6)).padStart(10)} ${(p.unit ?? '').padEnd(8)} ±${+toleranceSd(p).toPrecision(3)}  ${p.label ?? ''}`);
  }
  process.exit(0);
}

const readSpec = () => JSON.parse(specPath && specPath !== '-' ? fs.readFileSync(specPath, 'utf8') : fs.readFileSync(0, 'utf8'));
const pool = new Pool(abs, opt('workers') ? Number(opt('workers')) : undefined);
await pool.ready;
const spec = readSpec();
const out = path.resolve(opt('out', `montecarlo-out/${model.name}`));
fs.mkdirSync(out, {recursive: true});

let last = 0;
const onProgress = (done, total, name) => {
  const now = Date.now();
  if (now - last > 2000 || done === total) {
    last = now;
    process.stderr.write(`  ${name}: ${done}/${total}\n`);
  }
};

try {
  if (cmd === 'run') {
    const list = spec.scenarios ? spec.scenarios : [spec];
    const baseline = spec.baseline ? await runScenario(pool, model, {name: 'baseline', ...spec.baseline}, {onProgress}) : null;
    const results = [];
    for (const s of list) {
      const run = await runScenario(pool, model, {...(spec.common ?? {}), ...s}, {onProgress});
      results.push({summary: summarize(model, run), comparison: baseline ? compare(model, baseline, run) : null});
      // each case lands on disk as it finishes, as in a study
      var payload = {model: model.name, baseline: baseline ? summarize(model, baseline) : null, results};
      fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(payload, null, 1));
      var md = reportRun(model, payload);
      fs.writeFileSync(path.join(out, 'run.md'), md);
    }
    console.log(md);
  } else if (cmd === 'sweep') {
    const res = await sweep(pool, model, spec, {onProgress});
    fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(res, null, 1));
    const md = reportSweep(model, res);
    fs.writeFileSync(path.join(out, 'sweep.md'), md);
    console.log(md);
  } else if (cmd === 'study') {
    const res = await study(pool, model, spec, {
      onProgress,
      workers: pool.workers.length,
      log: (m) => process.stderr.write(`${m}\n`),
      // each stage lands on disk as it finishes, so a long study can be read, or lost, one stage at a time
      checkpoint: (r) => {
        fs.writeFileSync(path.join(out, 'study.json'), JSON.stringify(r, null, 1));
        fs.writeFileSync(path.join(out, 'study.md'), reportStudy(model, r));
      },
    });
    console.log(reportStudy(model, res));
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
  console.error(`wrote ${out}`);
} finally {
  await pool.close();
}
