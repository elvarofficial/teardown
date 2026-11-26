// The smallest complete model: a die with a heavy face. Copy this to start a new adapter.
const FACES = [1, 2, 3, 4, 5, 6];

export default {
  name: 'loaded-die',
  parameters: [
    {id: 'weight.six', group: 'die', label: 'Extra weight on landing a six', unit: 'x', nominal: 1, min: 0, tol: {sd: 0.02}, source: 'example'},
    {id: 'edge.bounce', group: 'die', label: 'Mean bounce time', unit: 's', nominal: 0.5, min: 0, tol: {halfWidth: 0.05}, source: 'example'},
  ],
  inputs: [{id: 'throw', label: 'Throw energy', unit: 'J', dist: {dist: 'uniform', min: 0.5, max: 1.5}}],
  outcome: {kind: 'categorical', categories: FACES},
  metrics: [
    {id: 'time', label: 'Time to rest', unit: 's', kind: 'linear'},
    {id: 'heading', label: 'Rest heading', unit: 'deg', kind: 'circular'},
  ],
  prepare: (p) => ({...p}),
  trial(die, inputs, rng) {
    const total = 5 + die['weight.six'];
    let u = rng() * total;
    let outcome = 6;
    for (const f of FACES) {
      u -= f === 6 ? die['weight.six'] : 1;
      if (u <= 0) {
        outcome = f;
        break;
      }
    }
    return {outcome, metrics: {time: die['edge.bounce'] * inputs.throw * (1 + 0.1 * rng.normal()), heading: rng() * 360}};
  },
};
