// The wheel as a Monte Carlo model: the adapter skills/monte-carlo/engine runs. Nothing else in the wheel knows the engine exists.
import {createSim} from './physics.js';
import {BALLS, ballParameters, ballPresetValues, buildWheel, SEQUENCE, stackup} from './spec.js';

const R2D = 180 / Math.PI;
const wrap = (deg) => ((deg % 360) + 360) % 360;

export default {
  name: 'roulette',
  parameters: [...stackup(), ...ballParameters()],
  presets: Object.fromEntries(Object.entries(BALLS).map(([key, b]) => [`ball.${key}`, {label: b.label, values: ballPresetValues(key)}])),
  // the toss: a hand's reasonable spread in all six degrees of freedom, and a rotor anywhere
  inputs: [
    {id: 'launch.speed', label: 'Ball speed along the track', unit: 'm/s', dist: {dist: 'normal', mean: 2.5, sd: 0.2, min: 1.2, max: 4}},
    {id: 'launch.direction', label: 'Direction, -1 clockwise', unit: 'dimensionless', dist: {dist: 'fixed', value: -1}},
    {id: 'launch.az', label: 'Release azimuth', unit: 'deg', dist: {dist: 'uniform', min: 0, max: 360}},
    {id: 'launch.inward', label: 'Release point inward of the groove', unit: 'm', dist: {dist: 'uniform', min: 0, max: 0.003}},
    {id: 'launch.lift', label: 'Release height above the groove', unit: 'm', dist: {dist: 'uniform', min: 0, max: 0.003}},
    {id: 'launch.vr', label: 'Radial speed, + into the wall', unit: 'm/s', dist: {dist: 'normal', mean: 0.03, sd: 0.05, min: -0.3, max: 0.4}},
    {id: 'launch.vz', label: 'Vertical speed, + up', unit: 'm/s', dist: {dist: 'normal', mean: 0, sd: 0.03, min: -0.2, max: 0.3}},
    {id: 'launch.roll', label: 'Spin, fraction of pure rolling', unit: 'dimensionless', dist: {dist: 'uniform', min: 0.8, max: 1}},
    {id: 'launch.spinR', label: 'Added spin, radial axis', unit: 'rad/s', dist: {dist: 'normal', mean: 0, sd: 8}},
    {id: 'launch.spinT', label: 'Added spin, tangential axis', unit: 'rad/s', dist: {dist: 'normal', mean: 0, sd: 8}},
    {id: 'launch.sideSpin', label: 'Added spin, vertical axis', unit: 'rad/s', dist: {dist: 'normal', mean: 0, sd: 10}},
    {id: 'rotor.phase', label: 'Rotor phase at launch', unit: 'deg', dist: {dist: 'uniform', min: 0, max: 360}},
    {id: 'rotor.speed', label: 'Rotor speed at launch, + against the ball', unit: 'rad/s', dist: {dist: 'normal', mean: 2.6, sd: 0.3, min: 1, max: 5}},
  ],
  // tolerances that move together because one thing causes both
  correlations: [
    {ids: ['surface.trackMu', 'surface.trackCrr', 'surface.trackCor'], rho: 0.5, why: 'Humidity, polish and dust act on all three.'},
    {ids: ['fret.*.height'], rho: 0.4, why: 'One fret-setting jig, one operator.'},
    {ids: ['pocket.*.depth'], rho: 0.4, why: 'Turned in one setup.'},
    {ids: ['deflector.*.height'], rho: 0.3, why: 'One batch of parts.'},
    {ids: ['ball.diameter', 'ball.massPct'], rho: 0.6, why: 'A bigger ball of the same stock is heavier.'},
  ],
  outcome: {kind: 'categorical', categories: SEQUENCE},
  metrics: [
    {id: 'rimTime', label: 'Time until the ball leaves the wall', unit: 's', kind: 'linear'},
    {id: 'totalTime', label: 'Time until it rests in a pocket', unit: 's', kind: 'linear'},
    {id: 'settleTime', label: 'Time from first in a pocket to rest', unit: 's', kind: 'linear'},
    {id: 'leaveSpeed', label: 'Speed when it leaves the wall', unit: 'm/s', kind: 'linear'},
    {id: 'fretHits', label: 'Fret impacts', kind: 'linear'},
    {id: 'deflectorHits', label: 'Deflector impacts', kind: 'linear'},
    {id: 'leaveAz', label: 'Bowl azimuth where it leaves the wall', unit: 'deg', kind: 'circular'},
    {id: 'rotorEntryAz', label: 'Bowl azimuth where it reaches the rotor', unit: 'deg', kind: 'circular'},
    {id: 'scatter', label: 'Pocket hit, against the pocket under the ball when it left the wall', unit: 'deg', kind: 'circular'},
  ],
  prepare: (params) => {
    const wheel = buildWheel(params);
    return {wheel, sim: createSim(wheel)};
  },
  trial({wheel, sim}, inp, rng) {
    sim.launch({
      speed: inp['launch.speed'],
      direction: inp['launch.direction'],
      az: inp['launch.az'],
      inward: inp['launch.inward'],
      lift: inp['launch.lift'],
      vr: inp['launch.vr'],
      vz: inp['launch.vz'],
      rollFraction: inp['launch.roll'],
      spinR: inp['launch.spinR'],
      spinT: inp['launch.spinT'],
      sideSpin: inp['launch.sideSpin'],
      rotorPhase: inp['rotor.phase'],
      rotorSpeed: inp['rotor.speed'],
      orient: [rng(), rng(), rng()],
    });
    const r = sim.run(240);
    if (r.status !== 'pocket') return {outcome: null, metrics: {rimTime: r.tLeave, totalTime: r.time}};
    const pocketAz = (wheel.fretAngle[r.pocket] + wheel.pitch / 2 + r.leaveRotor) * R2D;
    return {
      outcome: SEQUENCE[r.pocket],
      metrics: {
        rimTime: r.tLeave,
        totalTime: r.time,
        settleTime: r.time - r.tPocket,
        leaveSpeed: r.leaveSpeed,
        fretHits: r.hitsFret,
        deflectorHits: r.hitsDeflector,
        leaveAz: wrap(r.leaveAz * R2D),
        rotorEntryAz: wrap(r.rotorAz * R2D),
        scatter: wrap(pocketAz - r.leaveAz * R2D),
      },
    };
  },
};
