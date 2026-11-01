// The tests the runner reports. Pure functions, no dependencies.

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export const logGamma = (x) => {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
};

/** Regularized upper incomplete gamma Q(a, x). */
export const gammaQ = (a, x) => {
  if (x <= 0) return 1;
  const lead = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 2000; n++) {
      term *= x / (a + n);
      sum += term;
      if (term < sum * 1e-14) break;
    }
    return Math.max(0, 1 - sum * lead);
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.min(1, lead * h);
};

/** Pearson goodness of fit of counts against expected probabilities. */
export const chiSquareGof = (counts, probs) => {
  const n = counts.reduce((a, b) => a + b, 0);
  let x2 = 0;
  let df = -1;
  for (let i = 0; i < counts.length; i++) {
    const e = n * probs[i];
    if (e > 0) {
      x2 += ((counts[i] - e) * (counts[i] - e)) / e;
      df++;
    }
  }
  return {x2, df, p: df > 0 && n > 0 ? gammaQ(df / 2, x2 / 2) : 1, n};
};

/** Pearson test that two count vectors come from the same distribution. */
export const chiSquareTwoSample = (a, b) => {
  const na = a.reduce((s, v) => s + v, 0);
  const nb = b.reduce((s, v) => s + v, 0);
  let x2 = 0;
  let df = -1;
  for (let i = 0; i < a.length; i++) {
    const t = a[i] + b[i];
    if (t === 0) continue;
    const ea = (t * na) / (na + nb);
    const eb = (t * nb) / (na + nb);
    x2 += ((a[i] - ea) * (a[i] - ea)) / ea + ((b[i] - eb) * (b[i] - eb)) / eb;
    df++;
  }
  return {x2, df, p: df > 0 ? gammaQ(df / 2, x2 / 2) : 1};
};

/** Wilson score interval for a proportion. */
export const wilson = (k, n, z = 1.96) => {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
};

/** Benjamini-Hochberg adjusted p-values, in the input's order. */
export const benjaminiHochberg = (ps) => {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(ps.length);
  let min = 1;
  for (let r = idx.length - 1; r >= 0; r--) {
    min = Math.min(min, (idx[r][0] * idx.length) / (r + 1));
    out[idx[r][1]] = min;
  }
  return out;
};

export const mean = (xs) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
};

export const stdev = (xs) => {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) * (xs[i] - m);
  return xs.length > 1 ? Math.sqrt(s / (xs.length - 1)) : NaN;
};

export const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * q;
  const i = Math.floor(h);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (h - i);
};

export const normalSf = (z) => {
  // complementary error function, Numerical Recipes erfcc
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const r = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return 0.5 * r;
};

/** Welch's two-sample test, using the normal limit for the large samples a Monte Carlo produces. */
export const welch = (a, b) => {
  const ma = mean(a);
  const mb = mean(b);
  const sa = stdev(a);
  const sb = stdev(b);
  const se = Math.sqrt((sa * sa) / a.length + (sb * sb) / b.length);
  const z = se > 0 ? (ma - mb) / se : 0;
  return {diff: ma - mb, se, z, p: Math.min(1, 2 * normalSf(z))};
};

/** Two-sample Kolmogorov-Smirnov test, asymptotic p. */
export const ks = (a, b) => {
  const x = Float64Array.from(a).sort();
  const y = Float64Array.from(b).sort();
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i], y[j]);
    while (i < x.length && x[i] <= v) i++;
    while (j < y.length && y[j] <= v) j++;
    d = Math.max(d, Math.abs(i / x.length - j / y.length));
  }
  const en = Math.sqrt((x.length * y.length) / (x.length + y.length));
  const l = (en + 0.12 + 0.11 / en) * d;
  let p = 0;
  let sign = 1;
  for (let k = 1; k < 100; k++) {
    const t = 2 * sign * Math.exp(-2 * k * k * l * l);
    p += t;
    if (Math.abs(t) < 1e-10) break;
    sign = -sign;
  }
  return {d, p: Math.min(1, Math.max(0, p))};
};

/** Mean direction, resultant length and Rayleigh test against a uniform circle. Angles in degrees. */
export const circular = (deg) => {
  let c = 0;
  let s = 0;
  for (let i = 0; i < deg.length; i++) {
    const a = (deg[i] * Math.PI) / 180;
    c += Math.cos(a);
    s += Math.sin(a);
  }
  const n = deg.length;
  const rBar = n ? Math.hypot(c, s) / n : 0;
  const z = n * rBar * rBar;
  const p = n ? Math.exp(Math.sqrt(1 + 4 * n + 4 * (n * n - n * n * rBar * rBar)) - (1 + 2 * n)) : 1;
  return {meanDeg: ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360, rBar, z, p: Math.min(1, p), n};
};

/** Signed smallest angle a - b, degrees. */
export const angleDiff = (a, b) => ((((a - b + 180) % 360) + 360) % 360) - 180;

/**
 * The smallest shift in one category's probability this many trials can detect (two-sided alpha, power), relative to
 * its null probability, so a reader knows what a "no effect" result actually rules out.
 */
export const minDetectableShift = (n, p0, alpha = 0.05, power = 0.8) => {
  const za = alpha === 0.05 ? 1.96 : alpha === 0.01 ? 2.576 : 1.96;
  const zb = power === 0.8 ? 0.8416 : power === 0.9 ? 1.2816 : 0.8416;
  return ((za + zb) * Math.sqrt((p0 * (1 - p0)) / n)) / p0;
};

/** Chi-square upper critical value by bisection. */
export const chiSquareCritical = (df, alpha) => {
  let lo = 0;
  let hi = df + 20 * Math.sqrt(2 * df) + 50;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (gammaQ(df / 2, m / 2) > alpha) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

/** Power of a chi-square test at noncentrality lambda (Patnaik's approximation). */
export const chiSquarePower = (df, lambda, alpha = 0.05) => {
  const c = (df + 2 * lambda) / (df + lambda);
  const f = ((df + lambda) * (df + lambda)) / (df + 2 * lambda);
  return gammaQ(f / 2, chiSquareCritical(df, alpha) / (2 * c));
};

/** The noncentrality a chi-square test needs for this power. */
export const chiSquareLambda = (df, alpha = 0.05, power = 0.8) => {
  let lo = 0;
  let hi = 1;
  while (chiSquarePower(df, hi, alpha) < power && hi < 1e7) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (chiSquarePower(df, m, alpha) < power) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

const zOf = (p) => {
  // inverse normal survival by bisection on normalSf
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (normalSf(m) > p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

/**
 * Trials per arm to tell one category's probability p0 from p0 * (1 + shift), comparing two arms and correcting for
 * looking at `categories` of them.
 */
export const trialsForShift = (p0, shift, {alpha = 0.05, power = 0.8, categories = 1} = {}) => {
  const za = zOf(alpha / (2 * categories));
  const zb = zOf(1 - power);
  const p1 = p0 * (1 + shift);
  const d = p1 - p0;
  return Math.ceil(((za + zb) * (za + zb) * (p0 * (1 - p0) + p1 * (1 - p1))) / (d * d));
};

/** The relative shift in one category that n trials per arm can tell apart, the inverse of trialsForShift. */
export const shiftForTrials = (p0, n, opts = {}) => {
  let lo = 1e-4;
  let hi = 50;
  for (let i = 0; i < 60; i++) {
    const m = Math.sqrt(lo * hi);
    if (trialsForShift(p0, m, opts) > n) lo = m;
    else hi = m;
  }
  return hi;
};

/** The category that moved most between two count vectors, with its z and Bonferroni-corrected p. */
export const largestCategoryShift = (a, b) => {
  const na = a.reduce((s, v) => s + v, 0);
  const nb = b.reduce((s, v) => s + v, 0);
  let best = {index: -1, z: 0, ratio: 1, p: 1};
  for (let i = 0; i < a.length; i++) {
    const pool = (a[i] + b[i]) / (na + nb);
    const se = Math.sqrt(pool * (1 - pool) * (1 / na + 1 / nb));
    if (se === 0) continue;
    const z = (a[i] / na - b[i] / nb) / se;
    if (Math.abs(z) > Math.abs(best.z)) best = {index: i, z, ratio: b[i] ? (a[i] / na) / (b[i] / nb) : Infinity, p: Math.min(1, 2 * normalSf(z) * a.length)};
  }
  return best;
};
