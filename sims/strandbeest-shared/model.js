// The Strandbeest's leg as a Monte Carlo model, as a small worked example of adding the engine to an existing teardown machine.
// The only change to the machine was jansen.js taking its link lengths as an argument.
import {HOLY, solveLegWith} from './jansen.js';

const LINKS = Object.keys(HOLY);
const STEPS = 180;

export default {
  name: 'strandbeest-leg',
  // each link length's as-built error; Jansen's units are about a centimetre, so 0.05 is half a millimetre
  parameters: LINKS.map((key) => ({id: `link.${key}`, group: 'link', label: `Link ${key} length error`, unit: 'cm', nominal: 0, tol: {sd: 0.05}, source: 'estimate'})),
  // joint play: new on every step of the walk, so it is a trial's chance, not a build's
  inputs: [{id: 'play', label: 'Slack in the joints', unit: 'cm', dist: {dist: 'uniform', min: 0, max: 0.03}}],
  metrics: [
    {id: 'stride', label: 'Stride length', unit: 'cm', kind: 'linear'},
    {id: 'lift', label: 'Foot lift', unit: 'cm', kind: 'linear'},
    {id: 'bump', label: 'Height wander while the foot is down', unit: 'cm', kind: 'linear'},
  ],
  prepare: (params) => Object.fromEntries(LINKS.map((key) => [key, HOLY[key] + params[`link.${key}`]])),
  trial(links, inputs, rng) {
    const ys = [];
    const xs = [];
    for (let n = 0; n < STEPS; n++) {
      const {F} = solveLegWith(links, (n / STEPS) * Math.PI * 2);
      if (!Number.isFinite(F[0] + F[1])) return {};
      xs.push(F[0] + inputs.play * rng.normal());
      ys.push(F[1] + inputs.play * rng.normal());
    }
    const low = Math.min(...ys);
    const stance = xs.filter((_, n) => ys[n] < low + 1);
    const stanceY = ys.filter((y) => y < low + 1);
    const bump = Math.max(...stanceY) - low;
    return {
      metrics: {stride: Math.max(...stance) - Math.min(...stance), lift: Math.max(...ys) - low, bump},
    };
  },
};
