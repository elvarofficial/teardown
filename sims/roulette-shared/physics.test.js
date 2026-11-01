// The physics checked against closed-form results. node --test sims/roulette-shared/physics.test.js
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BOM, rotorInertia} from './bom.js';
import model from './model.js';
import {createSim} from './physics.js';
import {ballPresetValues, BALLS, buildWheel, designParameters, DESIGN, stackup} from './spec.js';

const G = 9.81;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, expected ${b} within ${tol}`);

// no air, so each test isolates one law
const stillAir = (w) => {
  w.air = {rho: 0, nu: 1.5e-5};
  return w;
};
const flatWorld = (w, surf, tilt = 0) => createSim(w, {plane: {nx: Math.sin(tilt), ny: 0, nz: Math.cos(tilt), surf}});

const dropOnPlane = (key, v0, cor) => {
  const w = stillAir(buildWheel(ballPresetValues(key)));
  const surf = {...w.surfaces.track, cor, muK: 0, muS: 0, crr: 0};
  const sim = flatWorld(w, surf);
  const R = w.ball.R;
  // start just above the plane, moving down: gravity changes little during the contact
  sim.place({z: R + 1e-5, vz: -v0});
  let inContact = 0;
  let first = true;
  while (sim.time < 0.01 && first) {
    sim.advance();
    const s = sim.state();
    if (s.z < R) inContact += sim.dt;
    else if (s.vz > 0) first = false;
  }
  return {sim, surf, w, vOut: sim.state().vz, contact: inContact};
};

test('a sphere in free flight conserves energy with air off', () => {
  const w = stillAir(buildWheel());
  const sim = flatWorld(w, w.surfaces.track);
  sim.place({z: 2, vx: 1, vy: 0.5, vz: 3, wx: 40});
  const e0 = sim.energy();
  while (sim.time < 0.5) sim.advance();
  close(sim.energy() / e0, 1, 1e-3, 'energy');
  const s = sim.state();
  close(s.x, 0.5, 1e-3, 'ballistic x');
  close(s.z, 2 + 3 * 0.5 - 0.5 * G * 0.25, 2e-3, 'ballistic z');
});

test('Hertz contact time matches the analytic duration', () => {
  const v0 = 1;
  const {contact, surf, w} = dropOnPlane('ptfe', v0, 0.98);
  const k = surf.k;
  const m = w.ball.mass;
  const T = 2.94 * Math.pow((5 * m) / (4 * k * Math.sqrt(v0)) * 1, 0.4); // Johnson's form with k = 4/3 E* sqrt(R)
  close(contact / T, 1, 0.12, 'contact time ratio');
});

test('the rebound speed reproduces the restitution asked for, at the reference speed', () => {
  for (const key of ['ptfe', 'delrin', 'marble', 'ceramic']) {
    for (const cor of [0.5, 0.7, 0.85]) {
      const {vOut} = dropOnPlane(key, 1, cor);
      close(vOut, cor, 0.06, `${key} e=${cor}`);
    }
  }
});

test('restitution falls with impact speed', () => {
  const low = dropOnPlane('delrin', 0.2, 0.7).vOut / 0.2;
  const high = dropOnPlane('delrin', 3, 0.7).vOut / 3;
  assert.ok(low > high + 0.05, `e(0.2)=${low} e(3)=${high}`);
});

test('a sliding sphere ends rolling at 5/7 of its speed, after the classical distance', () => {
  const mu = 0.2;
  const v0 = 2;
  const w = stillAir(buildWheel(ballPresetValues('delrin')));
  const surf = {...w.surfaces.track, muK: mu, muS: mu, crr: 0, cor: 0.3};
  const sim = flatWorld(w, surf);
  sim.place({z: w.ball.R - 1e-7, vx: v0});
  let tRoll = -1;
  while (sim.time < 1.5) {
    sim.advance();
    const s = sim.state();
    if (tRoll < 0 && Math.abs(s.vx - s.wy * w.ball.R) < 1e-3) tRoll = s.t;
  }
  const s = sim.state();
  close(s.vx, (5 / 7) * v0, 0.01, 'final speed');
  close(tRoll, (2 * v0) / (7 * mu * G), 0.01, 'time to rolling');
  close(s.wy * w.ball.R, s.vx, 1e-2, 'no slip');
});

test('a rolling sphere descends an incline at 5/7 g sin(alpha)', () => {
  const alpha = (10 * Math.PI) / 180;
  const w = stillAir(buildWheel(ballPresetValues('delrin')));
  const surf = {...w.surfaces.track, crr: 0, muK: 0.3, muS: 0.4, cor: 0.3};
  const sim = flatWorld(w, surf, alpha);
  const R = w.ball.R;
  sim.place({x: R * Math.sin(alpha), z: R * Math.cos(alpha) - 1e-7});
  while (sim.time < 0.5) sim.advance();
  const s = sim.state();
  const speed = Math.hypot(s.vx, s.vz);
  close(speed, (5 / 7) * G * Math.sin(alpha) * 0.5, 0.01, 'rolling speed');
});

test('a sphere too steep for its friction slides at g(sin - mu cos)', () => {
  const alpha = (45 * Math.PI) / 180;
  const mu = 0.1;
  const w = stillAir(buildWheel(ballPresetValues('delrin')));
  const surf = {...w.surfaces.track, crr: 0, muK: mu, muS: mu, cor: 0.3};
  const sim = flatWorld(w, surf, alpha);
  const R = w.ball.R;
  sim.place({x: R * Math.sin(alpha), z: R * Math.cos(alpha) - 1e-7});
  while (sim.time < 0.4) sim.advance();
  const s = sim.state();
  close(Math.hypot(s.vx, s.vz), G * (Math.sin(alpha) - mu * Math.cos(alpha)) * 0.4, 0.015, 'sliding speed');
});

test('rolling resistance decelerates at 5/7 crr g', () => {
  const crr = 0.01;
  const w = stillAir(buildWheel(ballPresetValues('delrin')));
  const surf = {...w.surfaces.track, crr, muK: 0.3, muS: 0.4, cor: 0.3};
  const sim = flatWorld(w, surf);
  const v0 = 1;
  sim.place({z: w.ball.R - 1e-7, vx: v0, wy: v0 / w.ball.R});
  while (sim.time < 1) sim.advance();
  close(sim.state().vx, v0 - (5 / 7) * crr * G, 0.005, 'speed after 1 s');
});

test('air drag decelerates a free ball at the Schiller-Naumann rate', () => {
  const w = buildWheel(ballPresetValues('delrin'));
  w.g = 0;
  const sim = flatWorld(w, w.surfaces.track);
  sim.place({z: 1, vx: 3});
  while (sim.time < 0.05) sim.advance();
  const v = sim.state().vx;
  const d = 2 * w.ball.R;
  const Re = (3 * d) / w.air.nu;
  const Cd = (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)) + 0.42 / (1 + 42500 * Math.pow(Re, -1.16));
  const a = (0.5 * w.air.rho * Cd * Math.PI * w.ball.R * w.ball.R * 9) / w.ball.mass;
  close((3 - v) / 0.05, a, a * 0.05, 'drag deceleration');
});

const runSpin = (params, launch = {}, opts = {}) => {
  const w = buildWheel(params);
  const sim = createSim(w, opts);
  sim.launch({speed: 2, az: 40, rotorPhase: 10, rotorSpeed: 2.6, rollFraction: 1, ...launch});
  return {w, sim, r: sim.run(240)};
};

test('the ball leaves the wall where a rolling sphere must, not where a point mass would', () => {
  // Small & Tse's point mass leaves at v^2 = g r tan(alpha). A sphere rolling in the groove carries spin whose radial part
  // has to precess at v/r, and the friction that supplies that torque adds to the inward balance.
  const {w, r} = runSpin(ballPresetValues('delrin'));
  assert.equal(r.status, 'pocket');
  const R = w.ball.R;
  const al = w.upper;
  const lean = w.lean;
  const c1 = [R * Math.sin(al), -R * Math.cos(al)];
  const c2 = [R * Math.cos(lean), R * Math.sin(lean)];
  const dl = Math.hypot(c1[0] - c2[0], c1[1] - c2[1]);
  const dr = (c1[0] - c2[0]) / dl;
  const dz = (c1[1] - c2[1]) / dl;
  const kappa = Math.abs(dr / (dz * c1[0] - dr * c1[1])) * R; // radial spin per v/R
  const rc = w.trackFootR - R * 1.03;
  const pointMass = Math.sqrt(G * rc * Math.tan(al));
  const f = 0.4 * kappa;
  const rolling = Math.sqrt((G * rc * Math.tan(al)) / (1 + f / Math.cos(al) ** 2));
  close(r.leaveSpeed, rolling, 0.02, 'leave speed');
  assert.ok(r.leaveSpeed < pointMass - 0.08, 'below the point-mass prediction');
});

test('a tilted table moves where the ball leaves, by the tilted rim condition', () => {
  const spins = (tilt) => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const {r} = runSpin({...ballPresetValues('delrin'), 'table.tiltX': tilt}, {speed: 1.2 + i * 0.02, az: i * 15});
      out.push(r.leaveAz);
    }
    return out;
  };
  const conc = (as) => Math.hypot(as.reduce((s, a) => s + Math.cos(a), 0), as.reduce((s, a) => s + Math.sin(a), 0)) / as.length;
  assert.ok(conc(spins(0)) < 0.45, 'level: leaves anywhere');
  assert.ok(conc(spins(0.5)) > 0.7, 'tilted: leaves at one side');
});

test('a level, as-designed wheel has no preferred azimuth for leaving', () => {
  const az = [];
  for (let i = 0; i < 20; i++) az.push(runSpin(ballPresetValues('delrin'), {az: i * 18, speed: 1.4}).r.leaveAz);
  const c = az.reduce((s, a) => s + Math.cos(a), 0) / az.length;
  const s = az.reduce((s, a) => s + Math.sin(a), 0) / az.length;
  assert.ok(Math.hypot(c, s) < 0.15, `R=${Math.hypot(c, s)}`);
});

test('every ball on the list finishes in a pocket', () => {
  for (const key of Object.keys(BALLS)) {
    const {r} = runSpin(ballPresetValues(key));
    assert.equal(r.status, 'pocket', key);
    assert.ok(r.pocket >= 0 && r.pocket < 37, key);
  }
});

test('a run is exactly repeatable', () => {
  const a = runSpin(ballPresetValues('delrin')).r;
  const b = runSpin(ballPresetValues('delrin')).r;
  assert.deepEqual(a, b);
});

test('halving the time step leaves the rim phase unchanged', () => {
  const coarse = runSpin(ballPresetValues('delrin'), {}, {}).r;
  const sim = runSpin(ballPresetValues('delrin'), {}, {dtRoll: 18e-6, dtFine: 7e-6}).r;
  close(sim.tLeave, coarse.tLeave, Math.max(0.03 * coarse.tLeave, 0.1), 'rim time');
  close(sim.leaveSpeed, coarse.leaveSpeed, 0.01, 'leave speed');
});

test('the stackup is all zero and the model builds at design', () => {
  for (const p of stackup()) assert.equal(p.nominal, 0, p.id);
  const params = designParameters();
  const w = buildWheel(params);
  assert.equal(w.tiltX, 0);
  assert.equal(w.spindle.ox, 0);
  assert.ok(w.fretTop.every((v) => Math.abs(v - w.fretTop[0]) < 1e-12));
  for (let i = 0; i < 37; i++) close(w.fretAngle[i], i * w.pitch, 1e-12);
  assert.ok(model.parameters.length > 200);
});

test('every BoM line says how real it is, and the inertia comes from it', () => {
  for (const l of BOM) assert.ok(['catalog', 'stock', 'custom'].includes(l.basis), l.item);
  close(DESIGN.rotorInertia, rotorInertia(), rotorInertia() * 0.01, 'rotor inertia');
});
