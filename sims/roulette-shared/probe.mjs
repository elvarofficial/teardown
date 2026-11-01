// A single spin, printed. node sims/roulette-shared/probe.mjs [ball] [speed] [seed-az]
import {BALLS, buildWheel, ballPresetValues} from './spec.js';
import {createSim} from './physics.js';

const [ball = 'ptfe', speed = '3', az = '40'] = process.argv.slice(2);
const w = buildWheel(ballPresetValues(ball));
console.log(BALLS[ball].label, 'R', w.ball.R, 'm', w.ball.mass.toFixed(5), 'k track', w.surfaces.track.k.toExponential(2));
const sim = createSim(w);
console.log('dtFine', sim.dtFine, 'dtRoll', sim.dtRoll);
sim.launch({speed: +speed, az: +az, rotorPhase: 10, rotorSpeed: 2.6});
const t0 = performance.now();
let next = 0;
while (!sim.done && sim.time < 90) {
  sim.advance();
  if (sim.time >= next) {
    const s = sim.state();
    const r = Math.hypot(s.x, s.y);
    console.log(`t ${s.t.toFixed(2).padStart(6)} r ${(r * 1e3).toFixed(1).padStart(6)} z ${(s.z * 1e3).toFixed(1).padStart(6)} v ${Math.hypot(s.vx, s.vy, s.vz).toFixed(3)} w ${Math.hypot(s.wx, s.wy, s.wz).toFixed(1).padStart(6)} rot ${s.wr.toFixed(3)} slip ${s.slip.toFixed(4)}`);
    next += sim.time < 1 ? 0.1 : 2;
  }
}
const ms = performance.now() - t0;
console.log(sim.result());
console.log(`${ms.toFixed(0)} ms, ${(ms * 1e6 / sim.steps).toFixed(0)} ns/step`);
