// The ball. Newton's and Euler's equations for a rigid sphere, with forces only from gravity, air and compliant contact:
//
//   normal      Hertz, F = k d^1.5, with Hunt-Crossley-Flores damping set by the coefficient of restitution
//   tangential  Coulomb with static and kinetic friction, limited to the impulse that stops the slip this step
//   rolling     viscoelastic rolling resistance as a torque, M = crr R N
//   pivoting    Hertzian spin friction about the normal, M = (3 pi / 16) mu a N
//   air         Re-dependent drag, Magnus lift, spin decay, room draft
//
// Nothing is scripted. The ball leaves the track because the wall force reaches zero, rolls in the groove on two contacts
// because the geometry demands it, and settles when the pocket has taken its energy.
//
// The rotor is a rigid body on a tilted, offset spindle, with bearing drag, static imbalance and the ball's reaction.
// Tilts are small, so frame changes are first order. No three.js in here: the Monte Carlo and the page run this same code.

const TAU = Math.PI * 2;
const IMPACT_SPEED = 0.01;
const V0_FLOOR = 0.05;
const REST_SPEED = 0.03;
const REST_TIME = 0.25;

// contact ids; each keeps its own impact speed while it lasts
const ID_STATOR = 0;
const ID_ROTOR = 10;
const ID_FLOOR = 20;
const ID_FRET = 100;
const ID_DEFLECTOR = 200;
const ID_PLANE = 300;

/** A sphere dropped on a plane through the origin, for tests. plane: {nx, ny, nz, surf} */
export function createSim(w, {plane = null, dtFine: dtFineIn, dtRoll: dtRollIn} = {}) {
  const b = w.ball;
  const R = b.R;
  const m = b.mass;
  const I = b.I;
  const mt = (2 * m) / 7; // effective mass of a sphere's contact point in the tangent plane
  const S = w.surfaces;

  // ------------------------------------------------------------ time steps from the stiffest contacts this ball meets
  const contactTime = (k) => 3.21 * Math.pow(m / k, 0.4); // Hertz duration at 1 m/s
  const kHard = Math.max(S.fret.k * Math.sqrt((w.fretR * R) / (w.fretR + R) / R), S.deflector.k * Math.sqrt((w.deflectorEdge * R) / (w.deflectorEdge + R) / R), S.floor.k);
  const dtFine = dtFineIn ?? Math.min(15e-6, Math.max(2e-6, contactTime(kHard) / 14));
  const dtRoll = dtRollIn ?? Math.min(40e-6, Math.max(dtFine, contactTime(S.track.k) / 9));

  // rounded contacts are softer: Hertz on the reduced radius
  const kFret = S.fret.k * Math.sqrt((w.fretR * R) / (w.fretR + R) / R);
  const kDefl = S.deflector.k * Math.sqrt((w.deflectorEdge * R) / (w.deflectorEdge + R) / R);
  const rStarFret = (w.fretR * R) / (w.fretR + R);
  const rStarDefl = (w.deflectorEdge * R) / (w.deflectorEdge + R);

  const gx = w.g * Math.sin(w.tiltX);
  const gy = w.g * Math.sin(w.tiltY);
  const gz = -w.g * Math.cos(Math.hypot(w.tiltX, w.tiltY));

  const area = Math.PI * R * R;
  const dragK = (0.5 * w.air.rho * area) / m;
  const spinDecay = (0.5 * w.air.rho * R * R * R * R * R * 0.1) / I;

  const hasHarmonics = w.oval[0] || w.oval[1] || w.trefoil[0] || w.trefoil[1] || w.warp[0] || w.warp[1] || w.dent.depth;
  const hasCom = b.comOffset > 0;
  const hasRound = b.outOfRound !== 0;
  const hasOri = hasCom || hasRound;

  const sp = w.spindle;
  const ro = w.rotor;
  const rotorIsTilted = sp.tx || sp.ty || ro.wx || ro.wy;
  const slotStep = new Int32Array(400).fill(-9);
  const slotDamp = new Float64Array(400);
  const slotV0 = new Float64Array(400);
  const outerRotor = w.rotorOuterR + 0.004;
  const reachR = R * (1 + Math.abs(b.outOfRound)) + 0.002;

  // ------------------------------------------------------------ state
  let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0;
  let qw = 1, qx = 0, qy = 0, qz = 0;
  let dx = 0, dy = 0, dz = 0; // centre of mass to geometric centre, world frame
  let cx = 0, cy = 0, cz = 0; // geometric centre
  let phi = 0, wr = 0, cphi = 1, sphi = 0;
  let t = 0, step = 0, dt = dtRoll;
  let done = false;
  let lastImpact = -1, impactEta = Infinity, inRotorZone = false, nearDefl = false;
  let cdEvery = 0, cd = 0.45;
  let rotorDL = 0;
  // what the trial reports
  let hitsFret = 0, hitsDeflector = 0, hitsFloor = 0, hitsTrack = 0;
  let wallTouch = -1, wallAz = NaN, wallSpeed = NaN, wallRotor = NaN;
  let tDrop = NaN, dropAz = NaN, dropSpeed = NaN, dropRotor = NaN, tRotor = NaN, rotorAz = NaN, tPocket = NaN;
  let restTimer = 0, pocket = -1, result = null;
  let surfSlip = 0;

  // ------------------------------------------------------------ one contact
  const contact = (id, s, nx, ny, nz, delta, svx, svy, svz, moving, eMult, k, rStar) => {
    let rcx = -R * nx, rcy = -R * ny, rcz = -R * nz;
    if (hasRound) {
      const ax = 2 * (qx * qz + qw * qy);
      const ay = 2 * (qy * qz - qw * qx);
      const az = 1 - 2 * (qx * qx + qy * qy);
      const c = ax * nx + ay * ny + az * nz;
      delta += R * b.outOfRound * (1.5 * c * c - 0.5);
      if (delta <= 0) return;
    }
    if (hasCom) {
      rcx -= dx;
      rcy -= dy;
      rcz -= dz;
    }
    let ux = vx + wy * rcz - wz * rcy - svx;
    let uy = vy + wz * rcx - wx * rcz - svy;
    let uz = vz + wx * rcy - wy * rcx - svz;
    const vn = ux * nx + uy * ny + uz * nz;

    if (slotStep[id] !== step - 1) {
      // a new contact: its restitution follows its impact speed, falling as v^(1/5) as Hertzian viscoelasticity predicts
      const v0 = Math.max(-vn, V0_FLOOR);
      const e1 = Math.min(0.98, s.cor * eMult);
      const e = Math.max(0.05, 1 - (1 - e1) * Math.pow(v0, 0.2));
      slotDamp[id] = (8 * (1 - e)) / (5 * e) / v0;
      slotV0[id] = v0;
      if (-vn > IMPACT_SPEED) {
        lastImpact = t;
        if (id >= ID_DEFLECTOR && id < ID_PLANE) hitsDeflector++;
        else if (id >= ID_FRET) hitsFret++;
        else if (id === ID_FLOOR) hitsFloor++;
        else if (id < ID_ROTOR) hitsTrack++;
      }
    }
    slotStep[id] = step;

    const fn = k * delta * Math.sqrt(delta) * (1 - slotDamp[id] * vn);
    if (fn <= 0) return;
    const jn = fn * dt;
    const ivm = jn / m;
    vx += ivm * nx;
    vy += ivm * ny;
    vz += ivm * nz;
    let jx = jn * nx, jy = jn * ny, jz = jn * nz;
    if (hasCom) {
      wx += (rcy * jz - rcz * jy) / I;
      wy += (rcz * jx - rcx * jz) / I;
      wz += (rcx * jy - rcy * jx) / I;
    }

    // friction at the contact point, after the normal impulse
    ux = vx + wy * rcz - wz * rcy - svx;
    uy = vy + wz * rcx - wx * rcz - svy;
    uz = vz + wx * rcy - wy * rcx - svz;
    const un = ux * nx + uy * ny + uz * nz;
    const tx = ux - un * nx, ty = uy - un * ny, tz = uz - un * nz;
    const slip = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (slip > 1e-9) {
      const mu = slip < 0.005 ? s.muS : s.muK;
      const jt = Math.min(mu * jn, mt * slip);
      const f = -jt / slip;
      const fx = f * tx, fy = f * ty, fz = f * tz;
      vx += fx / m;
      vy += fy / m;
      vz += fz / m;
      wx += (rcy * fz - rcz * fy) / I;
      wy += (rcz * fx - rcx * fz) / I;
      wz += (rcx * fy - rcy * fx) / I;
      jx += fx;
      jy += fy;
      jz += fz;
    }

    // rolling resistance and pivot friction, each stopping at most what is there
    const axisX = moving ? sp.tx : 0;
    const axisY = moving ? sp.ty : 0;
    const axisZ = moving ? 1 : 0;
    const orx = wx - wr * axisX, ory = wy - wr * axisY, orz = wz - wr * axisZ;
    const on = orx * nx + ory * ny + orz * nz;
    const tox = orx - on * nx, toy = ory - on * ny, toz = orz - on * nz;
    const rollRate = Math.sqrt(tox * tox + toy * toy + toz * toz);
    if (rollRate > 1e-9) {
      const dw = Math.min((s.crr * R * jn) / I, rollRate) / rollRate;
      wx -= dw * tox;
      wy -= dw * toy;
      wz -= dw * toz;
    }
    const a = Math.sqrt(rStar * delta);
    const dPivot = (0.589 * s.muK * a * jn) / I; // 3 pi / 16 = 0.589
    const pivot = Math.abs(on) > dPivot ? (on > 0 ? dPivot : -dPivot) : on;
    wx -= pivot * nx;
    wy -= pivot * ny;
    wz -= pivot * nz;

    if (moving) {
      // the ball's impulse on the rotor, about the spindle
      const px = cx - R * nx - sp.ox;
      const py = cy - R * ny - sp.oy;
      rotorDL -= px * jy - py * jx;
    }
    surfSlip = slip;
  };

  // ------------------------------------------------------------ the stator
  const scanStator = () => {
    const r = Math.sqrt(cx * cx + cy * cy);
    if (r < 1e-9) return;
    const c = cx / r, s = cy / r;
    let rr = r, zz = cz, dRdT = 0, dZdT = 0;
    if (hasHarmonics) {
      const th = Math.atan2(cy, cx);
      const c2 = Math.cos(2 * th), s2 = Math.sin(2 * th);
      const c3 = Math.cos(3 * th), s3 = Math.sin(3 * th);
      const [oa, ob] = w.oval;
      const [ta, tb] = w.trefoil;
      const [wa, wb] = w.warp;
      rr -= oa * c2 + ob * s2 + ta * c3 + tb * s3;
      dRdT = -2 * oa * s2 + 2 * ob * c2 - 3 * ta * s3 + 3 * tb * c3;
      zz -= wa * c2 + wb * s2;
      dZdT = -2 * wa * s2 + 2 * wb * c2;
      if (w.dent.depth) {
        let d = th - w.dent.az;
        if (d > Math.PI) d -= TAU;
        else if (d < -Math.PI) d += TAU;
        const u = d / w.dent.width;
        const g = -w.dent.depth * Math.exp(-0.5 * u * u);
        zz -= g;
        dZdT += (-g * u) / w.dent.width;
      }
    }
    const P = w.stator;
    for (let i = 0; i < 4; i++) {
      const j = i * 4;
      const ar = P[j], az = P[j + 1], br = P[j + 2], bz = P[j + 3];
      const er = br - ar, ez = bz - az;
      let u = ((rr - ar) * er + (zz - az) * ez) / (er * er + ez * ez);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qr = rr - (ar + u * er), qz2 = zz - (az + u * ez);
      const d2 = qr * qr + qz2 * qz2;
      if (d2 > (R + 0.006) * (R + 0.006)) continue;
      const d = Math.sqrt(d2);
      const nr = qr / d, nz = qz2 / d;
      let nt = 0;
      if (hasHarmonics) nt = -(nr * dRdT + nz * dZdT) / r;
      let nx = nr * c - nt * s, ny = nr * s + nt * c, nn = nz;
      if (nt !== 0) {
        const l = Math.sqrt(nx * nx + ny * ny + nn * nn);
        nx /= l;
        ny /= l;
        nn /= l;
      }
      const delta = R - d;
      if (delta > 0) {
        if (i === 1) {
          wallTouch = t;
          wallAz = Math.atan2(cy, cx);
          wallSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          wallRotor = phi;
        }
        contact(ID_STATOR + i, S.track, nx, ny, nn, delta, 0, 0, 0, false, 1, S.track.k, R);
      } else {
        const approach = -(vx * nx + vy * ny + vz * nn);
        if (approach > 0) impactEta = Math.min(impactEta, -delta / approach);
      }
    }
  };

  const scanDeflectors = () => {
    const r = Math.sqrt(cx * cx + cy * cy);
    nearDefl = false;
    const reach = w.deflectorReach + R + 0.004;
    if (r > w.deflectorR + reach + 0.005 || r < w.deflectorR - reach - 0.005) return;
    const D = w.deflectors;
    for (let i = 0; i < D.length; i++) {
      const f = D[i];
      const rx = cx - f.x, ry = cy - f.y;
      if (rx * rx + ry * ry > reach * reach) continue;
      const h = cz - f.top;
      if (h > R + 0.004) continue;
      nearDefl = true;
      const lu = rx * f.ux + ry * f.uy;
      const lv = -rx * f.uy + ry * f.ux;
      const au = Math.abs(lu), av = Math.abs(lv);
      const a = f.a, bb = f.b;
      // nearest point on the diamond's edge from (a, 0) to (0, b)
      let tt = ((a - au) * a + av * bb) / (a * a + bb * bb);
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const pu = a * (1 - tt), pv = bb * tt;
      const qu = au - pu, qv = av - pv;
      const inside = au / a + av / bb < 1;
      let d2d = Math.sqrt(qu * qu + qv * qv);
      let nu, nv;
      if (inside || d2d < 1e-9) {
        const l = Math.sqrt(a * a + bb * bb);
        nu = bb / l;
        nv = a / l;
        d2d = -d2d;
      } else {
        nu = qu / d2d;
        nv = qv / d2d;
      }
      nu *= lu < 0 ? -1 : 1;
      nv *= lv < 0 ? -1 : 1;
      let d, nh;
      let nxy;
      if (h > 0 && d2d > 0) {
        d = Math.sqrt(h * h + d2d * d2d);
        nxy = d2d / d;
        nh = h / d;
      } else if (h > d2d) {
        d = h;
        nxy = 0;
        nh = 1;
      } else {
        d = d2d;
        nxy = 1;
        nh = 0;
      }
      const nx = (nu * f.ux - nv * f.uy) * nxy;
      const ny = (nu * f.uy + nv * f.ux) * nxy;
      const gap = d - R - w.deflectorEdge;
      if (gap < 0) {
        contact(ID_DEFLECTOR + i, S.deflector, nx, ny, nh, -gap, 0, 0, 0, false, 1, kDefl, rStarDefl);
      } else {
        const approach = -(vx * nx + vy * ny + vz * nh);
        if (approach > 0) impactEta = Math.min(impactEta, gap / approach);
      }
    }
  };

  // ------------------------------------------------------------ the rotor
  const scanRotor = () => {
    // bowl -> spindle -> turning frame -> rotor as actually mounted
    const px = cx - sp.ox, py = cy - sp.oy, pz = cz - sp.oz;
    const sx = px - sp.tx * pz, sy = py - sp.ty * pz, sz = pz + sp.tx * px + sp.ty * py;
    const ux = cphi * sx + sphi * sy, uy = -sphi * sx + cphi * sy, uz = sz;
    const ax = ux - ro.ex - ro.wx * uz, ay = uy - ro.ey - ro.wy * uz, az = uz + ro.wx * ux + ro.wy * uy;
    const ra = Math.sqrt(ax * ax + ay * ay);
    if (ra < 1e-9) return;
    const c = ax / ra, s = ay / ra;

    const touch = (id, surf, nax, nay, naz, delta, eMult, k, rStar) => {
      let nux = nax, nuy = nay, nuz = naz;
      if (rotorIsTilted) {
        nux = nax + ro.wx * naz;
        nuy = nay + ro.wy * naz;
        nuz = naz - ro.wx * nax - ro.wy * nay;
      }
      const nsx = cphi * nux - sphi * nuy, nsy = sphi * nux + cphi * nuy;
      let nx = nsx, ny = nsy, nz = nuz;
      if (rotorIsTilted) {
        nx = nsx + sp.tx * nuz;
        ny = nsy + sp.ty * nuz;
        nz = nuz - sp.tx * nsx - sp.ty * nsy;
      }
      // surface velocity at the contact point, spinning about the tilted spindle axis
      const qx1 = cx - R * nx - sp.ox, qy1 = cy - R * ny - sp.oy, qz1 = cz - R * nz - sp.oz;
      const svx = wr * (sp.ty * qz1 - qy1);
      const svy = wr * (qx1 - sp.tx * qz1);
      const svz = wr * (sp.tx * qy1 - sp.ty * qx1);
      contact(id, surf, nx, ny, nz, delta, svx, svy, svz, true, eMult, k, rStar);
    };

    const P = w.rotorProfile;
    for (let i = 0; i < 5; i++) {
      const j = i * 4;
      const ar = P[j], azz = P[j + 1], br = P[j + 2], bz = P[j + 3];
      const er = br - ar, ez = bz - azz;
      let u = ((ra - ar) * er + (az - azz) * ez) / (er * er + ez * ez);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qr = ra - (ar + u * er), qz2 = az - (azz + u * ez);
      const d2 = qr * qr + qz2 * qz2;
      if (d2 > (R + 0.004) * (R + 0.004)) continue;
      const d = Math.sqrt(d2);
      const delta = R - d;
      if (delta > 0) touch(ID_ROTOR + i, S.rotor, (qr / d) * c, (qr / d) * s, qz2 / d, delta, 1, S.rotor.k, R);
    }

    // which pocket, and its floor and frets
    let th = Math.atan2(ay, ax);
    if (th < 0) th += TAU;
    const N = w.N;
    let k0 = Math.floor(th / w.pitch) % N;
    const fa = w.fretAngle;
    const angleOf = (i) => (i >= N ? fa[i - N] + TAU : i < 0 ? fa[i + N] - TAU : fa[i]);
    if (th < angleOf(k0)) k0 = (k0 - 1 + N) % N;
    else if (th > angleOf(k0 + 1)) k0 = (k0 + 1) % N;
    pocketUnder = k0;

    if (ra < w.pocketOuterR + reachR && ra > w.pocketInnerR - reachR) {
      if (ra <= w.pocketOuterR + 0.002 && ra >= w.pocketInnerR - 0.002) {
        const slope = w.floorSlope;
        const zf = w.floorOuterZ + slope * (ra - w.pocketOuterR) + w.floorDz[k0];
        const l = Math.sqrt(1 + slope * slope);
        const d = (az - zf) / l;
        const delta = R - d;
        if (delta > 0) touch(ID_FLOOR, S.floor, (-slope / l) * c, (-slope / l) * s, 1 / l, delta, w.floorCor[k0], S.floor.k, R);
      }
    }

    if (ra < w.fretOuterR + R + w.fretR + 0.003 && ra > w.fretInnerR - R - w.fretR - 0.003) {
      const fr = w.fretR;
      for (let n = 0; n < 2; n++) {
        const i = (k0 + n) % N;
        const al = fa[i];
        const ca = Math.cos(al), sa = Math.sin(al);
        const uu = -sa * ax + ca * ay;
        if (Math.abs(uu) > R + fr + 0.004) continue;
        const ss = ca * ax + sa * ay;
        const sc = ss < w.fretInnerR ? w.fretInnerR : ss > w.fretOuterR ? w.fretOuterR : ss;
        const hTop = w.fretTop[i] - fr;
        const hc = az > hTop ? hTop : az < w.floorOuterZ ? w.floorOuterZ : az;
        const ds = ss - sc, dh = az - hc;
        const d = Math.sqrt(uu * uu + ds * ds + dh * dh);
        const gap = d - R - fr;
        if (gap < 0) {
          const nu = uu / d, ns = ds / d, nh = dh / d;
          touch(ID_FRET + i, S.fret, ns * ca - nu * sa, ns * sa + nu * ca, nh, -gap, w.fretCor[i], kFret, rStarFret);
        }
      }
    }
    rotorR = ra;
    rotorZ = az;
    rotorTheta = th;
  };
  let pocketUnder = -1, rotorR = 1, rotorZ = 0, rotorTheta = 0;

  // ------------------------------------------------------------ one step
  const advance = () => {
    step++;
    const h = dt;

    // the rotor: bearing drag, static imbalance through the axis tilt, and whatever the ball did last step
    const axisTiltX = w.tiltX - sp.tx;
    const axisTiltY = w.tiltY - sp.ty;
    let tq = 0;
    if (ro.hx || ro.hy) {
      const hxw = cphi * ro.hx - sphi * ro.hy;
      const hyw = sphi * ro.hx + cphi * ro.hy;
      tq += w.g * (hxw * axisTiltY - hyw * axisTiltX);
    }
    tq -= ro.viscous * wr;
    let dw = (tq * h) / ro.I + rotorDL / ro.I;
    rotorDL = 0;
    wr += dw;
    const dragStep = (ro.drag * h) / ro.I;
    if (wr > dragStep) wr -= dragStep;
    else if (wr < -dragStep) wr += dragStep;
    else if (!(ro.hx || ro.hy)) wr = 0;
    else wr = wr > 0 ? 0 : wr;
    phi += wr * h;
    cphi = Math.cos(phi);
    sphi = Math.sin(phi);

    // gravity and air
    const ax = vx - w.draftX, ay = vy - w.draftY, az = vz;
    const sp2 = ax * ax + ay * ay + az * az;
    const speed = Math.sqrt(sp2);
    if (--cdEvery < 0) {
      cdEvery = 64;
      const Re = Math.max(1, (speed * 2 * R) / w.air.nu);
      cd = (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)) + 0.42 / (1 + 42500 * Math.pow(Re, -1.16));
    }
    const dragA = dragK * cd * speed;
    let ex = gx - dragA * ax, ey = gy - dragA * ay, ez = gz - dragA * az;
    const omega = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (omega > 1e-3 && speed > 1e-3) {
      // Magnus lift: Cl ~ 0.5 of the spin ratio, capped
      const Sr = (omega * R) / speed;
      const Cl = 0.5 * (Sr > 0.6 ? 0.6 : Sr);
      const mag = (dragK * Cl * speed) / omega;
      ex += mag * (wy * az - wz * ay);
      ey += mag * (wz * ax - wx * az);
      ez += mag * (wx * ay - wy * ax);
      const decay = 1 - spinDecay * omega * h;
      wx *= decay;
      wy *= decay;
      wz *= decay;
    }
    vx += ex * h;
    vy += ey * h;
    vz += ez * h;

    // contacts
    impactEta = Infinity;
    if (hasCom) {
      const ix = b.comOffset * 2 * (qx * qz + qw * qy);
      const iy = b.comOffset * 2 * (qy * qz - qw * qx);
      const iz = b.comOffset * (1 - 2 * (qx * qx + qy * qy));
      dx = -ix;
      dy = -iy;
      dz = -iz;
      cx = x + dx;
      cy = y + dy;
      cz = z + dz;
    } else {
      cx = x;
      cy = y;
      cz = z;
    }
    if (plane) {
      const d = cx * plane.nx + cy * plane.ny + cz * plane.nz;
      if (d < R) contact(ID_PLANE, plane.surf, plane.nx, plane.ny, plane.nz, R - d, 0, 0, 0, false, 1, plane.surf.k, R);
    } else {
      const r2 = cx * cx + cy * cy;
      inRotorZone = r2 < (outerRotor + R + 0.01) * (outerRotor + R + 0.01);
      if (r2 > (w.statorInnerR - R - 0.004) * (w.statorInnerR - R - 0.004)) {
        scanStator();
        scanDeflectors();
      } else {
        nearDefl = false;
      }
      if (inRotorZone) scanRotor();
    }

    x += vx * h;
    y += vy * h;
    z += vz * h;
    if (hasOri) {
      const dq = 0.5 * h;
      const nw = qw + dq * (-wx * qx - wy * qy - wz * qz);
      const nx = qx + dq * (wx * qw + wy * qz - wz * qy);
      const ny = qy + dq * (wy * qw + wz * qx - wx * qz);
      const nz = qz + dq * (wz * qw + wx * qy - wy * qx);
      const l = 1 / Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
      qw = nw * l;
      qx = nx * l;
      qy = ny * l;
      qz = nz * l;
    }
    t += h;

    // the next step: fine near anything sharp or just after an impact, coarse while rolling smoothly
    dt = inRotorZone || nearDefl || t - lastImpact < 0.002 || impactEta < 3 * dtRoll ? dtFine : dtRoll;

    if (!plane) observe();
  };

  // ------------------------------------------------------------ what happened
  const observe = () => {
    const r = Math.sqrt(x * x + y * y);
    if (Number.isNaN(tDrop) && r < w.trackFootR - R - 0.012) {
      tDrop = t;
      dropAz = Math.atan2(y, x);
      dropSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      dropRotor = phi;
    }
    if (Number.isNaN(tRotor) && r < w.rotorOuterR) {
      tRotor = t;
      rotorAz = Math.atan2(y, x);
    }
    if (inRotorZone && rotorR < w.pocketOuterR + 0.002 && rotorR > w.pocketInnerR - 0.002) {
      const top = w.fretTop[pocketUnder];
      if (rotorZ < top) {
        if (Number.isNaN(tPocket)) tPocket = t;
        // speed against the rotor at the ball's own position
        const rel = Math.hypot(vx + wr * y, vy - wr * x, vz);
        if (rel < REST_SPEED) {
          restTimer += dt;
          if (restTimer > REST_TIME) {
            pocket = pocketUnder;
            done = true;
          }
        } else {
          restTimer = 0;
        }
        return;
      }
    }
    restTimer = 0;
    if (r > 0.6 || z < -0.3 || z > 1) {
      done = true;
      result = 'lost';
    }
    if (!Number.isFinite(x + y + z)) {
      done = true;
      result = 'diverged';
    }
  };

  const api = {
    dtFine,
    dtRoll,
    get done() { return done; },
    get time() { return t; },
    get steps() { return step; },
    get dt() { return dt; },
    /** Place the ball at rest in the plane test world. */
    place(state) {
      ({x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0} = state);
      t = 0;
      step = 0;
      done = false;
      dt = dtFine;
      slotStep.fill(-9);
    },
    /**
     * The toss, all six degrees of freedom of a ball leaving the hand, in SI and degrees:
     *   where:  az (deg), inward (m, from the groove), lift (m, above it)
     *   moving: speed (m/s along the track), direction (-1 clockwise, +1 counter-clockwise), vr (m/s, + outward), vz (m/s, + up)
     *   spin:   rollFraction (of what rolls in the groove), spinR, spinT, sideSpin (rad/s, radial, tangential, vertical)
     * and the rotor: rotorPhase (deg), rotorSpeed (rad/s, + counter-clockwise). orient is the ball's own orientation, 3 uniforms.
     */
    launch({speed, az, rotorPhase, rotorSpeed, rollFraction = 0.9, sideSpin = 0, orient = [0.1, 0.2, 0.3], vr = 0, vz: vUp = 0, inward = 0, lift = 0, direction = -1, spinR = 0, spinT = 0}) {
      // sit in the groove between the upper track and the wall, on both surfaces
      const al = w.upper;
      const nt = [-Math.sin(al), Math.cos(al)];
      const wallN = [-Math.cos(w.lean), -Math.sin(w.lean)];
      // centre c satisfies (c - foot) . nt = R and (c - foot) . wallN = R
      const det = nt[0] * wallN[1] - nt[1] * wallN[0];
      const cr = (R * wallN[1] - R * nt[1]) / det;
      const cz1 = (nt[0] * R - wallN[0] * R) / det;
      const rc = w.trackFootR + cr;
      const zc = w.footZ + cz1;
      const a = (az * Math.PI) / 180;
      const ca = Math.cos(a), sa = Math.sin(a);
      x = (rc - inward) * ca;
      y = (rc - inward) * sa;
      z = zc + 2e-4 + lift;
      vx = -direction * speed * sa + vr * ca;
      vy = direction * speed * ca + vr * sa;
      vz = vUp;
      // the spin that rolls on both contacts at once has its axis along the chord between them
      const c1r = -R * nt[0], c1z = -R * nt[1];
      const c2r = -R * wallN[0], c2z = -R * wallN[1];
      const dl = Math.hypot(c1r - c2r, c1z - c2z);
      const dr = (c1r - c2r) / dl, dz1 = (c1z - c2z) / dl;
      const rollW = (-direction * rollFraction * speed) / (dz1 * c1r - dr * c1z);
      wx = rollW * dr * ca + spinR * ca - spinT * sa;
      wy = rollW * dr * sa + spinR * sa + spinT * ca;
      wz = rollW * dz1 + sideSpin;
      phi = (rotorPhase * Math.PI) / 180;
      cphi = Math.cos(phi);
      sphi = Math.sin(phi);
      wr = rotorSpeed;
      t = 0;
      step = 0;
      done = false;
      dt = dtRoll;
      lastImpact = -1;
      slotStep.fill(-9);
      rotorDL = 0;
      hitsFret = hitsDeflector = hitsFloor = hitsTrack = 0;
      tDrop = dropAz = dropSpeed = dropRotor = tRotor = rotorAz = tPocket = NaN;
      restTimer = 0;
      wallTouch = -1;
      wallAz = wallSpeed = wallRotor = NaN;
      pocket = -1;
      result = null;
      cdEvery = 0;
      if (hasOri) {
        // a uniform random orientation from three uniforms (Shoemake)
        const [u1, u2, u3] = orient;
        const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
        qw = s1 * Math.sin(TAU * u2);
        qx = s1 * Math.cos(TAU * u2);
        qy = s2 * Math.sin(TAU * u3);
        qz = s2 * Math.cos(TAU * u3);
      }
    },
    advance,
    /** Run to rest or tMax. */
    run(tMax = 90) {
      while (!done && t < tMax) advance();
      return api.result(tMax);
    },
    result(tMax = 90) {
      const status = pocket >= 0 ? 'pocket' : result ?? (t >= tMax ? 'timeout' : 'running');
      return {status, pocket, time: t, tLeave: wallTouch, leaveAz: wallAz, leaveSpeed: wallSpeed, leaveRotor: wallRotor, tDrop, dropAz, dropSpeed, dropRotor, tRotor, rotorAz, tPocket, hitsFret, hitsDeflector, hitsFloor, hitsTrack, steps: step, rotorPhase: phi, rotorSpeed: wr};
    },
    state() {
      return {x, y, z, vx, vy, vz, wx, wy, wz, phi, wr, t, qw, qx, qy, qz, slip: surfSlip};
    },
    energy() {
      return 0.5 * m * (vx * vx + vy * vy + vz * vz) + 0.5 * I * (wx * wx + wy * wy + wz * wz) - m * (gx * x + gy * y + gz * z);
    },
  };
  return api;
}
