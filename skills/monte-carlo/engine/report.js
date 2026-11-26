// Markdown reports. A result is only useful with the size of effect it could have seen, so that goes in too.

const fp = (p) => (p === undefined || p === null ? '-' : p < 1e-4 ? p.toExponential(1) : p.toFixed(4));
const fn = (x, d = 3) => (x === undefined || x === null || Number.isNaN(x) ? '-' : (+x.toPrecision(d)).toString());
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const summaryBlock = (s) => {
  const lines = [`### ${s.name}`, '', `${s.trials} trials in ${s.seconds.toFixed(1)} s.`];
  if (s.outcome) {
    const o = s.outcome;
    const sorted = [...o.categories].sort((a, b) => b.ratioToNull - a.ratioToNull);
    lines.push(
      '',
      `Outcome vs null: chi-square ${fn(o.gofVsNull.x2, 4)} on ${o.gofVsNull.df} df, **p = ${fp(o.gofVsNull.p)}**. ${o.invalid} invalid trials.`,
      `At this sample size one category would have to shift by about ${o.minDetectableShiftPerCategory ? pct(o.minDetectableShiftPerCategory) : '-'} of its probability to be seen reliably (80% power, uncorrected).`,
      `Most over-represented: ${sorted.slice(0, 3).map((c) => `${c.category} (${c.ratioToNull.toFixed(3)}x)`).join(', ')}. Most under-represented: ${sorted.slice(-3).reverse().map((c) => `${c.category} (${c.ratioToNull.toFixed(3)}x)`).join(', ')}.`,
    );
  }
  const ids = Object.keys(s.metrics ?? {});
  if (ids.length) {
    lines.push('', '| Metric | n | Summary |', '|---|---|---|');
    for (const id of ids) {
      const m = s.metrics[id];
      lines.push(m.kind === 'circular'
        ? `| ${id} | ${m.n} | mean ${fn(m.meanDeg, 4)}°, concentration R ${fn(m.rBar)}, Rayleigh p ${fp(m.p)} |`
        : `| ${id} | ${m.n} | mean ${fn(m.mean, 4)}, sd ${fn(m.sd)}, 5-95% ${fn(m.p05)} to ${fn(m.p95)} |`);
    }
  }
  return lines.join('\n');
};

const comparisonLine = (c) => {
  const parts = [];
  const o = c.outcome?.paired;
  if (o) parts.push(`paired outcome p = ${fp(o.p)}, ${pct(o.discordant / o.n)} of trials changed number, most changed ${o.top.category} (gained ${o.top.gained}, lost ${o.top.lost}, corrected p ${fp(o.top.pCorrected)})`);
  else if (c.outcome) parts.push(`outcome distribution vs baseline p = ${fp(c.outcome.p)}`);
  for (const [id, m] of Object.entries(c.metrics ?? {})) {
    parts.push(m.kind === 'circular' ? `${id} mean ${fn(m.meanShiftDeg)}° (p ${fp(m.p)})` : `${id} ${fn(m.diff)} (p ${fp(m.p)})`);
  }
  return parts.join('; ');
};

export function reportRun(model, payload) {
  const lines = [`# ${model.name}: Monte Carlo run`, ''];
  if (payload.baseline) lines.push(summaryBlock(payload.baseline), '');
  for (const r of payload.results) {
    lines.push(summaryBlock(r.summary), '');
    if (r.comparison) lines.push(`Against baseline: ${comparisonLine(r.comparison)}.`, '');
  }
  return lines.join('\n');
}

export function reportSweep(model, res) {
  const metrics = model.metrics ?? [];
  const lines = [
    `# ${model.name}: one-at-a-time stackup sweep`,
    '',
    `${res.trials} trials per case, each parameter at ±${res.k} tolerance widths unless the spec set its own delta, every case on the same launches as the baseline. q is the p-value corrected across the ${res.rows.length} cases.`,
    '',
    summaryBlock(res.baseline),
    '',
  ];
  if (model.outcome) {
    const rows = [...res.rows].sort((a, b) => a.outcome.p - b.outcome.p);
    lines.push('## Outcome distribution', '', '| Case | vs baseline p | q | vs null p |', '|---|---|---|---|');
    for (const r of rows) lines.push(`| ${r.name} | ${fp(r.outcome.p)} | ${fp(r.outcome.q)} | ${fp(r.summary.outcome.gofVsNull.p)} |`);
    lines.push('');
  }
  for (const m of metrics) {
    const rows = res.rows.filter((r) => r.metrics[m.id]).sort((a, b) => a.metrics[m.id].p - b.metrics[m.id].p).slice(0, 15);
    lines.push(`## ${m.id}${m.unit ? ` (${m.unit})` : ''}: largest effects`, '', '| Case | Shift | p | q |', '|---|---|---|---|');
    for (const r of rows) {
      const x = r.metrics[m.id];
      lines.push(`| ${r.name} | ${fn(x.kind === 'circular' ? x.meanShiftDeg : x.diff)} | ${fp(x.p)} | ${fp(x.q)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
