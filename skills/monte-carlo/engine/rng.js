// Seeded random streams and the distributions a model can declare. Every stream is derived from
// (seed, ...labels), so trial 17 of a scenario draws the same launch whatever ran before it, on any worker.

const mix = (h, v) => {
  h = Math.imul(h ^ (v | 0), 0x5bd1e995);
  h ^= h >>> 15;
  return Math.imul(h, 0x97455bcb) >>> 0;
};

/** A hash of numbers and strings, used to derive a stream's seed. */
export const hashLabels = (...labels) => {
  let h = 0x811c9dc5;
  for (const l of labels) {
    if (typeof l === 'number') {
      h = mix(h, l);
      h = mix(h, Math.floor(l / 4294967296));
    } else {
      const s = String(l);
      for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
    }
    h = mix(h, 0x9e3779b9);
  }
  return h >>> 0;
};

/** xoshiro128**, seeded through splitmix32. Returns a function with .normal() and .uniform(a, b). */
export const createRng = (...labels) => {
  let z = hashLabels(...labels);
  const split = () => {
    z = (z + 0x9e3779b9) >>> 0;
    let t = z ^ (z >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let a = split();
  let b = split();
  let c = split();
  let d = split();
  const next = () => {
    const r = Math.imul(((Math.imul(b, 5) << 7) | (Math.imul(b, 5) >>> 25)), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = (d << 11) | (d >>> 21);
    return r / 4294967296;
  };
  let spare = null;
  next.normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = 1 - next();
    const v = next();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  next.uniform = (lo, hi) => lo + (hi - lo) * next();
  return next;
};

/**
 * One draw from a distribution spec:
 *   {dist:'fixed', value} | {dist:'uniform', min, max} | {dist:'normal', mean, sd, [min], [max]}
 *   {dist:'triangular', min, mode, max} | {dist:'lognormal', median, gsd}
 * A normal with bounds is truncated by redrawing.
 */
export const draw = (spec, rng) => {
  switch (spec.dist) {
    case 'fixed':
      return spec.value;
    case 'uniform':
      return rng.uniform(spec.min, spec.max);
    case 'normal': {
      const lo = spec.min ?? -Infinity;
      const hi = spec.max ?? Infinity;
      for (let i = 0; i < 64; i++) {
        const x = spec.mean + spec.sd * rng.normal();
        if (x >= lo && x <= hi) return x;
      }
      return Math.min(hi, Math.max(lo, spec.mean));
    }
    case 'triangular': {
      const {min, mode, max} = spec;
      const u = rng();
      const f = (mode - min) / (max - min);
      return u < f ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
    case 'lognormal':
      return spec.median * Math.exp(Math.log(spec.gsd) * rng.normal());
    default:
      throw new Error(`unknown distribution "${spec.dist}"`);
  }
};
