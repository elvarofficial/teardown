// The wheel on paper: the as-designed geometry, the balls, and the as-built stackup. No physics and no three.js.
//
// Every stackup entry is a delta from design with nominal 0, so an unmodified wheel is exactly as designed. `tol.sd` is
// how far a real build plausibly strays, used when a scenario samples tolerances or a sweep pushes one entry.
//
// Where the numbers come from, in `source`:
//   published   a maker's sheet, a regulation or a paper (see SOURCES in bom.js)
//   standard    a catalogue or ISO part
//   handbook    typical material values; the grade in a real part will differ (ball and surface values live in data/)
//   estimate    no public figure found: engineering judgement, measure a real wheel to replace it

import {COEFFICIENTS} from './data/coefficients.js';

export const R2D = 180 / Math.PI;
export const D2R = Math.PI / 180;

export const POCKETS = 37;
export const DEFLECTORS = 8;
/** Clockwise order of a single-zero wheel, starting at zero. */
export const SEQUENCE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** As-designed geometry, metres and degrees. A 32-inch class single-zero wheel. */
export const DESIGN = {
  bowlOuterR: 0.415, // TCS John Huxley Saturn: 830 mm bowl diameter
  trackFootR: 0.367, // patent example: 734 mm wheel diameter at the ball track
  upperTrackDeg: 15, // same patent example: 15 deg inclination
  lowerTrackDeg: 20,
  trackBreakR: 0.31,
  statorInnerR: 0.2495,
  statorInnerZ: 0.0015,
  wallHeight: 0.024,
  wallLeanDeg: 9.5,
  lipOuterR: 0.385,
  lipRise: 0.012,

  rotorOuterR: 0.2475,
  apronInnerR: 0.238,
  apronOuterZ: -0.001,
  apronInnerZ: -0.006,
  pocketOuterR: 0.236,
  pocketInnerR: 0.197,
  floorOuterZ: -0.0215,
  floorRiseDeg: 3, // the floor falls outward, so a ball rests against the outer wall
  coneBaseR: 0.195,
  coneBaseZ: -0.005,
  coneDeg: 18,
  turretR: 0.085,
  turretTopR: 0.082,
  turretTopZ: 0.1,

  fretHeight: 0.012, // above mid-pocket floor
  fretThickness: 0.003,
  fretInnerR: 0.197,
  fretOuterR: 0.238,

  deflectorR: 0.28,
  deflectorLong: 0.028, // half length of the diamond
  deflectorShort: 0.009, // half width
  deflectorHeight: 0.014, // above the track
  deflectorEdge: 0.001,

  rotorInertia: 0.1974, // sum of m k^2 over the turning lines of bom.js; a test holds the two together
  bearingDragNm: 0.006,
  bearingViscous: 0.001, // N m s/rad
};

const C = (id) => {
  const c = COEFFICIENTS[id];
  if (!c) throw new Error(`no coefficient ${id}`);
  return c.typical;
};
const spread = (id) => {
  const c = COEFFICIENTS[id];
  return c && c.low !== null && c.high !== null ? (c.high - c.low) / 4 : 0;
};

/**
 * The balls, oldest first. Diameters stay inside the 3/4 to 7/8 inch that New Jersey's rule allows, and a casino ball must be
 * non-metallic, which rules out steel. Every property comes from the coefficient library in data/, where each value says
 * whether it is sourced or estimated. Most ball-on-surface values are estimates, because no one has published these pairs.
 */
const BALL_LIST = {
  ivory: {lib: 'ivory', label: 'Elephant ivory', era: '1800s to early 1900s', diameter: 21, note: 'Billiard-ball material of the period.'},
  boxwood: {lib: 'boxwood', label: 'Boxwood', era: 'Early, and home wheels', diameter: 21, note: 'Treated as isotropic, which real wood is not.'},
  marble: {lib: 'marble', label: 'Marble (stone)', era: 'Decorative and novelty', diameter: 19.05, note: 'Heavy and stiff.'},
  phenolic: {lib: 'phenolic', label: 'Phenolic (Bakelite)', era: 'From the 1920s', diameter: 21, note: 'Early plastic replacement for ivory.'},
  ivorine: {lib: 'ivorine', label: 'Ivorine (cast resin)', era: 'Mid 1900s to today', diameter: 21, note: 'The traditional casino ball. Cast polyester is the proxy.'},
  acrylic: {lib: 'acrylic', label: 'Acrylic', era: 'Late 1900s', diameter: 19.05, note: 'Light, so air drag matters more.'},
  delrin: {lib: 'acetal', label: 'Acetal (Delrin)', era: 'Late 1900s to today', diameter: 19.05, note: 'Common replacement ball.'},
  ptfe: {lib: 'ptfe', label: 'PTFE (Teflon)', era: 'Modern casino', diameter: 19.05, note: 'Soft and slippery, so it bounces less.'},
  ceramic: {lib: 'alumina', label: 'Alumina ceramic', era: 'Modern', diameter: 19.05, note: 'Very stiff.'},
};
export const BALLS = Object.fromEntries(Object.entries(BALL_LIST).map(([key, b]) => [key, {
  ...b,
  density: C(`${b.lib}.density`),
  E: C(`${b.lib}.E`) / 1e9,
  nu: C(`${b.lib}.nu`),
  cor: C(`${b.lib}_on_pu_lacquer.cor`),
  mu: C(`${b.lib}_on_pu_lacquer.mu_k`),
  muS: C(`${b.lib}_on_pu_lacquer.mu_s`),
  crr: C(`${b.lib}_on_pu_lacquer.crr`),
  corBrass: C(`${b.lib}_on_brass.cor`),
  muBrass: C(`${b.lib}_on_brass.mu_k`),
  muSBrass: C(`${b.lib}_on_brass.mu_s`),
  crrBrass: C(`${b.lib}_on_brass.crr`),
}]));
export const DEFAULT_BALL = 'ptfe';

/** Where the ball can touch. Wooden surfaces wear a lacquer film, and the ball meets the film. Nickel plate uses the brass pair. */
export const SURFACES = {
  track: {label: 'Ball track (lacquered wood)', E: C('pu_lacquer.E') / 1e9, nu: C('pu_lacquer.nu'), pair: 'lacquer'},
  rotor: {label: 'Rotor apron and cone (lacquered wood)', E: C('pu_lacquer.E') / 1e9, nu: C('pu_lacquer.nu'), pair: 'lacquer'},
  floor: {label: 'Pocket floor (lacquered wood)', E: C('pu_lacquer.E') / 1e9, nu: C('pu_lacquer.nu'), pair: 'lacquer', corFactor: 0.9},
  fret: {label: 'Fret (brass)', E: C('brass.E') / 1e9, nu: C('brass.nu'), pair: 'brass'},
  deflector: {label: 'Deflector (nickel-plated brass)', E: C('nickel.E') / 1e9, nu: C('nickel.nu'), pair: 'brass'},
};

const P = (id, group, label, unit, sd, source, extra = {}) => ({id, group, label, unit, nominal: 0, tol: {sd}, source, ...extra});

/** Everything that can be wrong with a build, by element. All nominal 0. */
export function stackup() {
  const out = [
    P('table.tiltX', 'table', 'Table tilt toward +X', 'deg', 0.05, 'published', {note: 'Thorp and Small & Tse: about 0.2 deg is enough to show.'}),
    P('table.tiltY', 'table', 'Table tilt toward +Y', 'deg', 0.05, 'published'),
    P('air.draftX', 'table', 'Room draft toward +X', 'm/s', 0.05, 'estimate'),
    P('air.draftY', 'table', 'Room draft toward +Y', 'm/s', 0.05, 'estimate'),

    P('bowl.upperTrackDeg', 'bowl', 'Upper track angle', 'deg', 0.15, 'estimate'),
    P('bowl.lowerTrackDeg', 'bowl', 'Lower track angle', 'deg', 0.2, 'estimate'),
    P('bowl.trackR', 'bowl', 'Ball track radius', 'mm', 0.3, 'estimate'),
    P('bowl.wallLeanDeg', 'bowl', 'Track wall lean', 'deg', 0.5, 'estimate'),
    P('bowl.ovalCos', 'bowl', 'Track out-of-round, 2 lobes (cos)', 'mm', 0.15, 'estimate'),
    P('bowl.ovalSin', 'bowl', 'Track out-of-round, 2 lobes (sin)', 'mm', 0.15, 'estimate'),
    P('bowl.trefoilCos', 'bowl', 'Track out-of-round, 3 lobes (cos)', 'mm', 0.08, 'estimate'),
    P('bowl.trefoilSin', 'bowl', 'Track out-of-round, 3 lobes (sin)', 'mm', 0.08, 'estimate'),
    P('bowl.warpCos', 'bowl', 'Track height warp, 2 lobes (cos)', 'mm', 0.15, 'estimate'),
    P('bowl.warpSin', 'bowl', 'Track height warp, 2 lobes (sin)', 'mm', 0.15, 'estimate'),
    P('bowl.dentDepth', 'bowl', 'Local dent in track, depth', 'mm', 0.05, 'estimate'),
    P('bowl.dentAz', 'bowl', 'Local dent, azimuth', 'deg', 0, 'estimate', {tol: undefined}),
    P('bowl.dentWidth', 'bowl', 'Local dent, added width', 'deg', 0, 'estimate', {tol: undefined}),

    P('spindle.offsetX', 'spindle', 'Spindle offset from bowl centre, X', 'mm', 0.1, 'estimate'),
    P('spindle.offsetY', 'spindle', 'Spindle offset from bowl centre, Y', 'mm', 0.1, 'estimate'),
    P('spindle.tiltX', 'spindle', 'Spindle tilt in bowl, X', 'deg', 0.03, 'estimate'),
    P('spindle.tiltY', 'spindle', 'Spindle tilt in bowl, Y', 'deg', 0.03, 'estimate'),
    P('spindle.height', 'spindle', 'Rotor height against stator', 'mm', 0.2, 'estimate', {note: 'Set by shims in real wheels.'}),
    P('spindle.dragDelta', 'spindle', 'Bearing drag torque', 'N m', 0.003, 'estimate'),

    P('rotor.eccCos', 'rotor', 'Rotor run-out, radial (cos)', 'mm', 0.05, 'estimate'),
    P('rotor.eccSin', 'rotor', 'Rotor run-out, radial (sin)', 'mm', 0.05, 'estimate'),
    P('rotor.wobbleCos', 'rotor', 'Rotor wobble on spindle (cos)', 'deg', 0.02, 'estimate'),
    P('rotor.wobbleSin', 'rotor', 'Rotor wobble on spindle (sin)', 'deg', 0.02, 'estimate'),
    P('rotor.imbalanceCos', 'rotor', 'Rotor static imbalance (cos)', 'g m', 0.2, 'estimate', {note: 'Only acts through a tilted axis.'}),
    P('rotor.imbalanceSin', 'rotor', 'Rotor static imbalance (sin)', 'g m', 0.2, 'estimate'),

    P('ball.diameter', 'ball', 'Ball diameter', 'mm', 0.03, 'estimate'),
    P('ball.massPct', 'ball', 'Ball mass', '%', 0.5, 'estimate'),
    P('ball.outOfRound', 'ball', 'Ball out-of-round (ellipsoidal)', '%', 0.05, 'estimate'),
    P('ball.comOffset', 'ball', 'Ball centre of mass offset', 'mm', 0.02, 'estimate', {note: 'A void or uneven density.'}),

    P('surface.trackCor', 'surface', 'Track restitution', '%', 3, 'estimate'),
    P('surface.trackMu', 'surface', 'Track friction', '%', 10, 'estimate', {note: 'Wax, polish, wear.'}),
    P('surface.trackCrr', 'surface', 'Track rolling resistance', '%', 15, 'estimate', {note: 'Humidity, polish, dust.'}),
    P('surface.rotorCor', 'surface', 'Apron and cone restitution', '%', 3, 'estimate'),
    P('surface.floorCor', 'surface', 'Pocket floor restitution, all', '%', 3, 'estimate'),
    P('surface.fretCor', 'surface', 'Fret restitution, all', '%', 3, 'estimate'),
    P('surface.deflectorCor', 'surface', 'Deflector restitution, all', '%', 3, 'estimate'),
  ];
  for (let i = 0; i < DEFLECTORS; i++) {
    const n = String(i + 1);
    out.push(
      P(`deflector.${n}.az`, 'deflector', `Deflector ${n} azimuth`, 'deg', 0.15, 'estimate'),
      P(`deflector.${n}.radius`, 'deflector', `Deflector ${n} radial position`, 'mm', 0.4, 'estimate'),
      P(`deflector.${n}.height`, 'deflector', `Deflector ${n} height`, 'mm', 0.2, 'estimate'),
      P(`deflector.${n}.yaw`, 'deflector', `Deflector ${n} yaw`, 'deg', 0.5, 'estimate'),
    );
  }
  for (let i = 0; i < POCKETS; i++) {
    const n = String(SEQUENCE[i]);
    out.push(
      P(`fret.${n}.height`, 'fret', `Fret clockwise of ${n}: height`, 'mm', 0.1, 'estimate'),
      P(`fret.${n}.angle`, 'fret', `Fret clockwise of ${n}: position`, 'deg', 0.03, 'estimate', {note: '0.03 deg is about 0.1 mm at the pocket.'}),
      P(`fret.${n}.cor`, 'fret', `Fret clockwise of ${n}: restitution`, '%', 3, 'estimate', {note: 'A loose fret is about -30%.'}),
      P(`pocket.${n}.depth`, 'pocket', `Pocket ${n}: floor depth`, 'mm', 0.1, 'estimate'),
      P(`pocket.${n}.cor`, 'pocket', `Pocket ${n}: floor restitution`, '%', 3, 'estimate', {note: 'A worn or soft floor reads lower.'}),
    );
  }
  return out;
}

/**
 * The ball's material as parameters: absolute values, which a preset sets all at once. Their tolerance is the library's own
 * low-to-high range for the default ball, read as about +/- 2 sd, so a study can ask how much the uncertain coefficients matter.
 */
export function ballParameters() {
  const b = BALLS[DEFAULT_BALL];
  const P2 = (key, label, unit, nominal, id, scale = 1) => {
    const sd = spread(id) * scale;
    return {id: `material.${key}`, group: 'material', label, unit, nominal, min: 0, ...(sd > 0 ? {tol: {sd}} : {}), source: COEFFICIENTS[id]?.source?.kind ?? 'design'};
  };
  const pair = `${b.lib}_on_pu_lacquer`;
  const brass = `${b.lib}_on_brass`;
  return [
    P2('diameter', 'Ball diameter, design', 'mm', b.diameter, null),
    P2('density', 'Ball density', 'kg/m**3', b.density, `${b.lib}.density`),
    P2('E', 'Ball Young\'s modulus', 'GPa', b.E, `${b.lib}.E`, 1e-9),
    P2('nu', 'Ball Poisson ratio', 'dimensionless', b.nu, `${b.lib}.nu`),
    P2('cor', 'Restitution on lacquer at 1 m/s', 'dimensionless', b.cor, `${pair}.cor`),
    P2('mu', 'Kinetic friction on lacquer', 'dimensionless', b.mu, `${pair}.mu_k`),
    P2('muS', 'Static friction on lacquer', 'dimensionless', b.muS, `${pair}.mu_s`),
    P2('crr', 'Rolling resistance on lacquer', 'dimensionless', b.crr, `${pair}.crr`),
    P2('corBrass', 'Restitution on brass at 1 m/s', 'dimensionless', b.corBrass, `${brass}.cor`),
    P2('muBrass', 'Kinetic friction on brass', 'dimensionless', b.muBrass, `${brass}.mu_k`),
    P2('muSBrass', 'Static friction on brass', 'dimensionless', b.muSBrass, `${brass}.mu_s`),
    P2('crrBrass', 'Rolling resistance on brass', 'dimensionless', b.crrBrass, `${brass}.crr`),
  ];
}

export const ballPresetValues = (key) => {
  const b = BALLS[key];
  const out = {};
  for (const k of ['diameter', 'density', 'E', 'nu', 'cor', 'mu', 'muS', 'crr', 'corBrass', 'muBrass', 'muSBrass', 'crrBrass']) out[`material.${k}`] = b[k];
  return out;
};

/** Every parameter at design, as a flat {id: value} map. */
export const designParameters = () => Object.fromEntries([...stackup(), ...ballParameters()].map((p) => [p.id, p.nominal]));

const fretIdx = new Map(SEQUENCE.map((n, i) => [String(n), i]));

/** Turn a flat parameter map into the arrays and SI numbers the physics reads. Missing ids count as design. */
export function buildWheel(params = {}, design = DESIGN) {
  const get = (id, d = 0) => params[id] ?? d;
  const b = BALLS[DEFAULT_BALL];
  const D = design;
  const mm = 1e-3;

  // ------------------------------------------------------------ ball
  const dia = (get('material.diameter', b.diameter) + get('ball.diameter')) * mm;
  const R = dia / 2;
  const density = get('material.density', b.density);
  const m = (density * Math.PI * dia * dia * dia) / 6;
  const mass = m * (1 + get('ball.massPct') / 100);
  const ball = {
    R,
    mass,
    I: 0.4 * mass * R * R,
    E: get('material.E', b.E) * 1e9,
    nu: get('material.nu', b.nu),
    cor: get('material.cor', b.cor),
    mu: get('material.mu', b.mu),
    crr: get('material.crr', b.crr),
    outOfRound: get('ball.outOfRound') / 100,
    comOffset: get('ball.comOffset') * mm,
  };

  // ------------------------------------------------------------ surfaces against this ball
  const eStar = (Es, nus) => 1 / ((1 - ball.nu * ball.nu) / ball.E + (1 - nus * nus) / Es);
  const pairs = {
    lacquer: {cor: ball.cor, muK: ball.mu, muS: get('material.muS', b.muS), crr: ball.crr},
    brass: {cor: get('material.corBrass', b.corBrass), muK: get('material.muBrass', b.muBrass), muS: get('material.muSBrass', b.muSBrass), crr: get('material.crrBrass', b.crrBrass)},
  };
  const surf = (s, corPct = 0, muPct = 0, crrPct = 0) => {
    const p = pairs[s.pair];
    return {
      Estar: eStar(s.E * 1e9, s.nu),
      k: (4 / 3) * eStar(s.E * 1e9, s.nu) * Math.sqrt(R),
      cor: Math.min(0.98, p.cor * (s.corFactor ?? 1) * (1 + corPct / 100)),
      muK: p.muK * (1 + muPct / 100),
      muS: p.muS * (1 + muPct / 100),
      crr: p.crr * (1 + crrPct / 100),
    };
  };
  const surfaces = {
    track: surf(SURFACES.track, get('surface.trackCor'), get('surface.trackMu'), get('surface.trackCrr')),
    rotor: surf(SURFACES.rotor, get('surface.rotorCor')),
    floor: surf(SURFACES.floor, get('surface.floorCor')),
    fret: surf(SURFACES.fret, get('surface.fretCor')),
    deflector: surf(SURFACES.deflector, get('surface.deflectorCor')),
  };

  // ------------------------------------------------------------ stator profile, built outward from the rotor edge
  const upper = (D.upperTrackDeg + get('bowl.upperTrackDeg')) * D2R;
  const lower = (D.lowerTrackDeg + get('bowl.lowerTrackDeg')) * D2R;
  const footR = D.trackFootR + get('bowl.trackR') * mm;
  const breakZ = D.statorInnerZ + Math.tan(lower) * (D.trackBreakR - D.statorInnerR);
  const footZ = breakZ + Math.tan(upper) * (footR - D.trackBreakR);
  const lean = (D.wallLeanDeg + get('bowl.wallLeanDeg')) * D2R;
  const wallTopR = footR - Math.tan(lean) * D.wallHeight;
  const wallTopZ = footZ + D.wallHeight;
  const stator = Float64Array.of(
    wallTopR, wallTopZ, D.lipOuterR, wallTopZ + D.lipRise, // lip over the track
    footR, footZ, wallTopR, wallTopZ, // wall, leaning in
    footR, footZ, D.trackBreakR, breakZ, // upper track
    D.trackBreakR, breakZ, D.statorInnerR, D.statorInnerZ, // lower track
  );

  // ------------------------------------------------------------ rotor profile, in the rotor's frame
  const rise = Math.tan(D.floorRiseDeg * D2R);
  const floorInnerZ = D.floorOuterZ + rise * (D.pocketOuterR - D.pocketInnerR);
  const floorMidZ = (D.floorOuterZ + floorInnerZ) / 2;
  const coneTopZ = D.coneBaseZ + Math.tan(D.coneDeg * D2R) * (D.coneBaseR - D.turretR);
  const rotorProfile = Float64Array.of(
    D.rotorOuterR, D.apronOuterZ, D.apronInnerR, D.apronInnerZ, // apron
    D.apronInnerR, D.apronInnerZ, D.pocketOuterR, D.floorOuterZ, // outer pocket wall
    D.pocketInnerR, floorInnerZ, D.coneBaseR, D.coneBaseZ, // inner pocket wall
    D.coneBaseR, D.coneBaseZ, D.turretR, coneTopZ, // cone
    D.turretR, coneTopZ, D.turretTopR, D.turretTopZ, // turret
  );

  // ------------------------------------------------------------ frets and pockets, by position round the rotor
  const N = POCKETS;
  const pitch = (2 * Math.PI) / N;
  const fretAngle = new Float64Array(N);
  const fretTop = new Float64Array(N);
  const fretCor = new Float64Array(N);
  const floorDz = new Float64Array(N);
  const floorCor = new Float64Array(N);
  for (const [key, i] of fretIdx) {
    fretAngle[i] = i * pitch + get(`fret.${key}.angle`) * D2R;
    fretTop[i] = floorMidZ + D.fretHeight + get(`fret.${key}.height`) * mm;
    fretCor[i] = 1 + get(`fret.${key}.cor`) / 100;
    floorDz[i] = -get(`pocket.${key}.depth`) * mm;
    floorCor[i] = 1 + get(`pocket.${key}.cor`) / 100;
  }

  // ------------------------------------------------------------ deflectors, alternating long-radial and long-tangential
  const deflectors = [];
  for (let i = 0; i < DEFLECTORS; i++) {
    const n = i + 1;
    const az = ((i * 360) / DEFLECTORS + 22.5 + get(`deflector.${n}.az`)) * D2R;
    const r = D.deflectorR + get(`deflector.${n}.radius`) * mm;
    const radial = i % 2 === 0;
    const yaw = (radial ? 0 : Math.PI / 2) + get(`deflector.${n}.yaw`) * D2R;
    const zBase = r > D.trackBreakR ? breakZ + Math.tan(upper) * (r - D.trackBreakR) : D.statorInnerZ + Math.tan(lower) * (r - D.statorInnerR);
    const axis = az + yaw;
    deflectors.push({
      az,
      x: r * Math.cos(az),
      y: r * Math.sin(az),
      r,
      ux: Math.cos(axis),
      uy: Math.sin(axis),
      a: D.deflectorLong,
      b: D.deflectorShort,
      zBase,
      top: zBase + D.deflectorHeight + get(`deflector.${n}.height`) * mm,
      radial,
    });
  }

  // ------------------------------------------------------------ installation and the machine
  const dentDepth = get('bowl.dentDepth') * mm;
  const hx = get('rotor.imbalanceCos') * 1e-3;
  const hy = get('rotor.imbalanceSin') * 1e-3;
  return {
    ball,
    surfaces,
    stator,
    rotorProfile,
    N,
    pitch,
    fretAngle,
    fretTop,
    fretCor,
    floorDz,
    floorCor,
    deflectors,
    fretR: D.fretThickness / 2,
    fretInnerR: D.fretInnerR,
    fretOuterR: D.fretOuterR,
    floorMidZ,
    floorOuterZ: D.floorOuterZ,
    floorSlope: -rise,
    pocketOuterR: D.pocketOuterR,
    pocketInnerR: D.pocketInnerR,
    rotorOuterR: D.rotorOuterR,
    statorInnerR: D.statorInnerR,
    trackFootR: footR,
    trackBreakR: D.trackBreakR,
    footZ,
    upper,
    lower,
    lean,
    deflectorR: D.deflectorR,
    deflectorReach: D.deflectorLong + 0.002,
    deflectorEdge: D.deflectorEdge,
    tiltX: get('table.tiltX') * D2R,
    tiltY: get('table.tiltY') * D2R,
    draftX: get('air.draftX'),
    draftY: get('air.draftY'),
    oval: [get('bowl.ovalCos') * mm, get('bowl.ovalSin') * mm],
    trefoil: [get('bowl.trefoilCos') * mm, get('bowl.trefoilSin') * mm],
    warp: [get('bowl.warpCos') * mm, get('bowl.warpSin') * mm],
    dent: {depth: dentDepth, az: get('bowl.dentAz') * D2R, width: (6 + get('bowl.dentWidth')) * D2R},
    spindle: {
      ox: get('spindle.offsetX') * mm,
      oy: get('spindle.offsetY') * mm,
      oz: get('spindle.height') * mm,
      tx: get('spindle.tiltX') * D2R,
      ty: get('spindle.tiltY') * D2R,
    },
    rotor: {
      ex: get('rotor.eccCos') * mm,
      ey: get('rotor.eccSin') * mm,
      wx: get('rotor.wobbleCos') * D2R,
      wy: get('rotor.wobbleSin') * D2R,
      // static imbalance h (kg m): gravity torque through the tilted axis
      hx,
      hy,
      I: D.rotorInertia,
      drag: Math.max(0, D.bearingDragNm + get('spindle.dragDelta')),
      viscous: D.bearingViscous,
    },
    air: {rho: C('air.rho_air'), nu: C('air.nu_air')},
    g: 9.81,
  };
}
