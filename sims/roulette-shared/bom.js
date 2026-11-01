// The bill of materials. `basis` says how real a line is:
//   catalog     a part you can order by this designation
//   stock       commodity material or a standard form, any supplier
//   custom      made for the wheel, dimensions here are the design
// No maker publishes a wheel's drawings, so the custom lines are this model's design, not a copy of a product. The masses and
// radii of gyration below set the rotor's inertia, so the physics reads them instead of a typed number.
import {COEFFICIENTS} from './data/coefficients.js';

const brass = COEFFICIENTS['brass.density'].typical;
const ply = COEFFICIENTS['birch_ply.density'].typical;
const steel = 7900;
const alu = 2700;

const disc = (rho, rOut, rIn, h) => {
  const mass = rho * Math.PI * (rOut * rOut - rIn * rIn) * h;
  return {mass, k2: (rOut * rOut + rIn * rIn) / 2};
};

export const BOM = [
  // the rotor: everything here turns
  {item: 'R1', name: 'Rotor body', part: 'Laminated birch ply, turned to profile', basis: 'stock', material: 'Birch ply', qty: 1, turns: true, ...disc(ply, 0.2475, 0.03, 0.035), elements: ['spindle.height', 'rotor.ecc*', 'rotor.wobble*']},
  {item: 'R2', name: 'Number ring', part: 'Veneered ring, Ø495 x Ø476', basis: 'custom', material: 'Maple veneer on ply', qty: 1, turns: true, ...disc(ply, 0.2475, 0.238, 0.008), elements: ['surface.rotorCor']},
  {item: 'R3', name: 'Pocket floor ring', part: 'Turned ring with 37 lacquered floors', basis: 'custom', material: 'Birch ply, polyurethane', qty: 1, turns: true, ...disc(ply, 0.236, 0.197, 0.006), elements: ['pocket.*']},
  {item: 'R4', name: 'Frets', part: 'Brass strip, 3 x 12 x 41 mm, double-radius top', basis: 'stock', material: 'CuZn39Pb3 (C38500)', qty: 37, turns: true, mass: brass * 0.003 * 0.012 * 0.041, k2: 0.2175 * 0.2175, elements: ['fret.*']},
  {item: 'R5', name: 'Fret pins', part: 'ISO 8734 dowel, 2 x 10', basis: 'catalog', material: 'Hardened steel', qty: 74, turns: true, mass: steel * Math.PI * 0.001 * 0.001 * 0.01, k2: 0.2175 * 0.2175, elements: ['fret.*.cor']},
  {item: 'R6', name: 'Cone', part: 'Turned cone, 18 deg, lacquered', basis: 'custom', material: 'Birch ply, polyurethane', qty: 1, turns: true, ...disc(ply, 0.195, 0.085, 0.01), elements: ['surface.rotorCor']},
  {item: 'R7', name: 'Turret', part: 'Turned brass, Ø170 base, nickel plate', basis: 'custom', material: 'CuZn39Pb3, Ni', qty: 1, turns: true, ...disc(brass, 0.05, 0.015, 0.024), elements: []},
  {item: 'R8', name: 'Spindle', part: 'Ø30 x 180 mm shaft, ground', basis: 'stock', material: '1.4301 stainless', qty: 1, turns: true, ...disc(steel, 0.015, 0, 0.18), elements: ['spindle.tilt*']},
  {item: 'R9', name: 'Hub flange', part: 'Ø120 x 12 mm, bored for spindle', basis: 'custom', material: '6061-T6', qty: 1, turns: true, ...disc(alu, 0.06, 0.015, 0.012), elements: ['rotor.wobble*']},
  {item: 'R10', name: 'Hub screws', part: 'ISO 4762 M6 x 25', basis: 'catalog', material: 'A2-70', qty: 6, turns: true, mass: 0.0085, k2: 0.045 * 0.045, elements: []},
  {item: 'R11', name: 'Balance weights', part: 'Brass slug, set at balancing', basis: 'stock', material: 'CuZn39Pb3', qty: 2, turns: true, mass: 0.02, k2: 0.19 * 0.19, elements: ['rotor.imbalance*']},
  // the stator: everything here stays still
  {item: 'S1', name: 'Bowl', part: 'Laminated hardwood bowl, Ø830 outer', basis: 'custom', material: 'Beech laminate', qty: 1, mass: 22, elements: ['bowl.*']},
  {item: 'S2', name: 'Ball track finish', part: 'Polyurethane lacquer, rubbed out', basis: 'stock', material: 'Two-pack PU', qty: 1, mass: 0.15, elements: ['surface.track*']},
  {item: 'S3', name: 'Deflectors', part: 'Diamond, 56 x 18 x 14 mm, 4 long-radial, 4 long-tangential', basis: 'custom', material: 'CuZn39Pb3, Ni', qty: 8, mass: 0.06, elements: ['deflector.*', 'surface.deflectorCor']},
  {item: 'S4', name: 'Deflector screws', part: 'ISO 7380 M4 x 12', basis: 'catalog', material: 'A2-70', qty: 8, mass: 0.002, elements: ['deflector.*.yaw']},
  {item: 'S5', name: 'Bearing housing', part: 'Ø120 x 70 mm, bored 55 H7 and 47 H7', basis: 'custom', material: '6061-T6', qty: 1, mass: 1.6, elements: ['spindle.offset*', 'spindle.tilt*']},
  {item: 'S6', name: 'Radial bearings', part: 'SKF 6006-2RS1, 30 x 55 x 13 mm', basis: 'catalog', material: 'Bearing steel', qty: 2, mass: 0.116, elements: ['spindle.dragDelta', 'rotor.ecc*']},
  {item: 'S7', name: 'Thrust bearing', part: 'SKF 51106, 30 x 47 x 11 mm', basis: 'catalog', material: 'Bearing steel', qty: 1, mass: 0.066, elements: ['spindle.dragDelta']},
  {item: 'S8', name: 'Height shims', part: 'DIN 988, 30 x 42 x 0.1-0.5 mm', basis: 'catalog', material: 'Spring steel', qty: 4, mass: 0.003, elements: ['spindle.height']},
  {item: 'S9', name: 'Retaining ring', part: 'DIN 471, 30 x 1.5', basis: 'catalog', material: 'Spring steel', qty: 1, mass: 0.004, elements: []},
  {item: 'S10', name: 'Housing screws', part: 'ISO 4762 M6 x 30', basis: 'catalog', material: 'A2-70', qty: 6, mass: 0.0095, elements: []},
  {item: 'S11', name: 'Levelling feet', part: 'Threaded foot, M10, 50 mm pad', basis: 'catalog', material: 'Steel, nylon pad', qty: 4, mass: 0.12, elements: ['table.tilt*']},
  {item: 'S12', name: 'Dust cover', part: 'Lockable cover, required when the table is closed', basis: 'custom', material: 'Acrylic', qty: 1, mass: 3, elements: []},
  // the ball
  {item: 'B1', name: 'Ball', part: 'Precision sphere, 3/4 in, see BALLS in spec.js', basis: 'stock', material: 'Selected ball', qty: 1, mass: 0.0078, elements: ['ball.*', 'material.*']},
];

/** Sum of m k^2 over the parts that turn, in kg m^2. */
export const rotorInertia = () => BOM.filter((l) => l.turns).reduce((s, l) => s + l.qty * l.mass * l.k2, 0);
export const rotorMass = () => BOM.filter((l) => l.turns).reduce((s, l) => s + l.qty * l.mass, 0);
export const wheelMass = () => BOM.reduce((s, l) => s + l.qty * l.mass, 0);

export const SOURCES = [
  {what: 'Bowl diameter 830 mm', where: 'TCS John Huxley Saturn product sheet', url: 'https://tcsjohnhuxley.com/wp-content/uploads/2023/07/Saturn-Triple-Zero-CIS.pdf'},
  {what: 'Track diameter 734 mm, track angle 15 deg, ball 18 mm (given as examples)', where: 'US patent search result on roulette ball pockets', url: 'https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12667773'},
  {what: 'Rim condition, tilted rim condition, tilt of 0.2 deg is enough', where: 'Small & Tse, Predicting the outcome of roulette, Chaos 22 (2012)', url: 'https://arxiv.org/abs/1204.6412'},
  {what: 'Ball non-metallic, 3/4 to 7/8 in', where: 'N.J. Admin. Code 13:69E-1.8', url: 'https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69E-1-8'},
  {what: 'Level, spins freely, no magnets, parts secure', where: 'N.J. Admin. Code 13:69E-1.9', url: 'https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69E-1-9'},
  {what: 'Rotor on a bearing, shims set height, upper and lower tracks, horizontal and vertical deflectors', where: 'US patent 10843065 and related', url: 'https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10843065'},
  {what: 'Every material value, with its own link or marked as an estimate', where: 'The coefficient library, data/coefficients.source.json', url: 'https://github.com/lalligagger/montecarlo/blob/main/sims/roulette-shared/data/coefficients.source.json'},
  {what: 'SKF 6006-2RS1 is 30 x 55 x 13 mm', where: 'Distributor listing', url: 'https://www.coolenbearings.com/skf/ball-bearings/deep-groove/6006-2rs1'},
];
