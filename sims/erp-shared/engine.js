// The ERPNext ingress manifold, built from code in metres in the look of a clean study model: a pale bulkhead with
// four source machines bolted to it (a till, a storefront, a ledger book, a phone), four runners sweeping right into
// a glass plenum where the Stock Ledger and the General Ledger turn, a reject chute under it, and an outlet pipe
// carrying the committed documents out to the reporting screens.
//
// update(state) poses everything for the business hour in state.h. Every record that moves is one the model says
// exists: the packets in a pipe are the records in flight, the hopper fill is the queue waiting, the ledger slots
// are the entries posted. Nothing is drawn that the numbers do not account for.
import * as THREE from 'three';
import {GEO, HEADS, pipeAt, rejectsAt, SOURCES, TRANSIT} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;



const mat = (o) => new THREE.MeshStandardMaterial(o);
const M = {
  body: mat({color: '#d5d8dd', roughness: 0.55, metalness: 0.18}),
  bodyLight: mat({color: '#e4e7ea', roughness: 0.5, metalness: 0.1}),
  dark: mat({color: '#2b2f36', roughness: 0.48, metalness: 0.35}),
  darker: mat({color: '#1a1d22', roughness: 0.42, metalness: 0.4}),
  steel: mat({color: '#a8adb5', roughness: 0.38, metalness: 0.65}),
  glass: mat({color: '#b6c6d6', roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false}),
  spine: mat({color: '#8d949d', roughness: 0.45, metalness: 0.4}),
  screen: mat({color: '#20242b', roughness: 0.25, metalness: 0.1}),
  accent: mat({color: '#d6182b', roughness: 0.4, metalness: 0.1}),
  bin: mat({color: '#9aa0a8', roughness: 0.6, metalness: 0.1}),
  plate: mat({color: '#7d848d', roughness: 0.55, metalness: 0.25}),
  faint: mat({color: '#f2f1ec', roughness: 0.8, metalness: 0.0}),
};

const box = (w, h, d, m, x, y, z) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};

const cyl = (r, h, m, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

// ---------------------------------------------------------------- the four source machines
function buildHead(kind, color) {
  const g = new THREE.Group();
  const trim = mat({color, roughness: 0.45, metalness: 0.12});
  const {hy, hz} = HEADS[kind];
  const y = hy;
  const z = hz;
  const x = GEO.headX;
  if (kind === 'pos') {
    // a till: a squat body, a blue drawer band, a keypad shelf and a screen on a stalk
    g.add(box(0.21, 0.10, 0.235, M.body, x, y - 0.06, z));
    g.add(box(0.215, 0.022, 0.24, trim, x, y - 0.012, z));
    g.add(box(0.13, 0.014, 0.17, trim, x - 0.04, y - 0.002, z));
    const sc = box(0.022, 0.10, 0.145, trim, x - 0.105, y + 0.048, z);
    sc.rotation.z = 20 * D2R;
    g.add(sc);
    g.add(box(0.012, 0.072, 0.115, M.screen, x - 0.113, y + 0.05, z));
  } else if (kind === 'ecom') {
    // a storefront: a box under a wide green awning, with a sign board on top
    g.add(box(0.17, 0.12, 0.245, M.body, x, y - 0.055, z));
    const aw = box(0.024, 0.105, 0.30, trim, x - 0.095, y + 0.022, z);
    aw.rotation.z = 26 * D2R;
    g.add(aw);
    g.add(box(0.016, 0.075, 0.22, trim, x - 0.012, y + 0.088, z));
    g.add(box(0.014, 0.055, 0.135, M.screen, x - 0.09, y - 0.045, z));
  } else if (kind === 'tally') {
    // a ledger book standing on its spine, orange cover, cream page edges
    g.add(box(0.115, 0.195, 0.185, trim, x + 0.012, y - 0.025, z));
    g.add(box(0.032, 0.20, 0.19, M.bodyLight, x - 0.05, y - 0.025, z));
    for (let i = 0; i < 4; i++) g.add(box(0.026, 0.0035, 0.175, M.faint, x - 0.049, y - 0.095 + i * 0.05, z));
  } else {
    // a phone on a stand, violet case, screen lit
    g.add(box(0.10, 0.016, 0.115, M.dark, x - 0.015, y - 0.1, z));
    const ph = box(0.034, 0.2, 0.098, trim, x - 0.028, y + 0.01, z);
    ph.rotation.z = -13 * D2R;
    g.add(ph);
    const sc = box(0.006, 0.155, 0.076, M.screen, x - 0.045, y + 0.015, z);
    sc.rotation.z = -13 * D2R;
    g.add(sc);
    g.add(box(0.012, 0.026, 0.076, trim, x - 0.043, y + 0.072, z));
  }
  // a plinth under each machine
  g.add(box(0.26, 0.02, 0.27, M.bodyLight, x + 0.005, y - 0.115, z));
  // its own copy of every material, so following one source can fade the others back
  const seen = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (!seen.has(o.material)) seen.set(o.material, o.material.clone());
    o.material = seen.get(o.material);
  });
  g.userData.mats = [...seen.values()];
  return g;
}

// ---------------------------------------------------------------- the machine
export function buildEngine() {
  const root = new THREE.Group();
  const byId = {};

  // the floor pan, and a low rail the machines are bolted to
  root.add(box(2.10, 0.022, 0.62, M.bodyLight, -0.10, GEO.floorY - 0.011, 0));
  root.add(box(0.05, 0.05, 0.34, M.steel, GEO.bulkheadX + 0.012, GEO.floorY + 0.025, 0));

  // the runners: a curve from each machine into the plenum
  const curves = {};
  for (const spec of SOURCES) {
    const smats = [];
    const {hy, hz, ey, ez} = HEADS[spec.id];
    const curve = new THREE.CatmullRomCurve3(
      [
        new V3(GEO.headX + 0.02, hy, hz + GEO.bufferZ),
        new V3(-0.60, hy * 1.02, hz + GEO.bufferZ * 0.95),
        new V3(-0.46, hy * 0.6 + ey * 0.4, hz * 0.6 + ez * 0.4),
        new V3(GEO.plenumX - GEO.plenumL / 2 - 0.02, ey, ez),
      ],
      false,
      'catmullrom',
      0.5,
    );
    curves[spec.id] = curve;

    // every part of this source gets its own copy of its material, so following one source
    // can fade the other three back instead of letting them crowd the frame
    const own = (m) => {
      const c = m.clone();
      smats.push(c);
      return c;
    };
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.027, 14, false), own(M.glass));
    tube.renderOrder = 2;
    root.add(tube);
    // an opaque spine down the middle, so the runner reads even when the sheath is faint
    const spine = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.007, 8, false), own(M.spine));
    root.add(spine);

    // flanges along the runner, and the elbow where it enters the plenum
    for (const u of [0.16, 0.46, 0.78]) {
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0055, 8, 24), own(M.steel));
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new V3(0, 0, 1), tan);
      ring.castShadow = true;
      root.add(ring);
    }

    // the head: the machine itself
    const head = buildHead(spec.id, spec.color);
    root.add(head);

    // the gate: a plate across the runner that swings open when the source flushes
    const gate = new THREE.Group();
    const plate = box(0.009, 0.062, 0.062, own(mat({color: spec.color, roughness: 0.4, metalness: 0.2})), 0, 0, 0);
    gate.add(plate);
    const gp = curve.getPointAt(0.045);
    gate.position.copy(gp);
    gate.rotation.y = Math.PI / 2;
    root.add(gate);

    // the hopper: a sight glass that fills with the records waiting for their flush
    const hopper = new THREE.Group();
    const glass = cyl(GEO.hopperR, GEO.hopperH, own(M.glass), 20);
    glass.position.y = GEO.hopperH / 2;
    glass.renderOrder = 2;
    hopper.add(glass);
    const fillMat = own(mat({color: spec.color, roughness: 0.45, metalness: 0.05, transparent: true, opacity: 0.85}));
    const fill = cyl(GEO.hopperR - 0.006, 1, fillMat, 20);
    fill.castShadow = false;
    fill.geometry.translate(0, 0.5, 0); // grow from the base
    fill.position.y = 0;
    fill.scale.y = 0.001;
    hopper.add(fill);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(GEO.hopperR + 0.003, 0.004, 8, 20), own(M.steel));
    ringB.rotation.x = Math.PI / 2;
    ringB.position.y = 0.002;
    hopper.add(ringB);
    // the buffer hangs off the machine's output, on the side the camera looks from
    hopper.position.set(GEO.headX + 0.02, HEADS[spec.id].hy - 0.065, HEADS[spec.id].hz + GEO.bufferZ);
    root.add(hopper);

    // the packets: the records travelling down the runner
    const pgeo = new THREE.BoxGeometry(0.026, 0.0075, 0.034);
    const pmat = own(mat({color: '#ffffff', roughness: 0.35, metalness: 0.05}));
    const packets = new THREE.InstancedMesh(pgeo, pmat, spec.pool);
    packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    packets.count = 0;
    packets.frustumCulled = false;
    packets.castShadow = false;
    root.add(packets);

    byId[spec.id] = {spec, curve, tube, gate, hopper, fill, fillMat, packets, head, mats: [...smats, ...head.userData.mats]};
  }

  // ---------------------------------------------------------------- the plenum: ERPNext
  const plenum = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(GEO.plenumR, GEO.plenumR, GEO.plenumL, 56), M.glass.clone());
  shell.rotation.z = Math.PI / 2;
  shell.renderOrder = 3;
  plenum.add(shell);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.TorusGeometry(GEO.plenumR, 0.013, 10, 40), M.steel);
    cap.rotation.y = Math.PI / 2;
    cap.position.x = (sx * GEO.plenumL) / 2;
    cap.castShadow = true;
    plenum.add(cap);
  }
  // the two ledgers turning inside
  const ledgers = [];
  for (const [i, key] of [['stock', 'stock'], ['gl', 'gl']].entries()) {
    const disc = new THREE.Group();
    const body = cyl(0.156, 0.015, M.darker, 44);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    disc.add(body);
    const hub = cyl(0.032, 0.022, M.steel, 20);
    hub.rotation.z = Math.PI / 2;
    disc.add(hub);
    // 24 radial slots: each fills as the day's entries post
    const slots = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const s = box(0.017, 0.032, 0.017, mat({color: '#3a3f47', roughness: 0.5, metalness: 0.2}), 0, Math.cos(a) * 0.122, Math.sin(a) * 0.122);
      s.rotation.x = -a;
      disc.add(s);
      slots.push(s);
    }
    disc.position.x = i === 0 ? -0.095 : 0.095;
    plenum.add(disc);
    ledgers.push({key, disc, slots});
  }
  // the commit ring: it flares when a document is written
  const commit = new THREE.Mesh(new THREE.TorusGeometry(GEO.plenumR - 0.012, 0.008, 10, 44), mat({color: '#d6182b', roughness: 0.3, emissive: '#d6182b', emissiveIntensity: 0.25}));
  commit.rotation.y = Math.PI / 2;
  commit.position.x = -GEO.plenumL / 2 + 0.03;
  plenum.add(commit);
  root.add(plenum);

  // the reject chute and bin under the plenum
  const chute = box(0.1, 0.012, 0.1, M.bin, GEO.plenumX, -0.225, 0);
  chute.rotation.z = 20 * D2R;
  root.add(chute);
  root.add(box(0.15, 0.07, 0.15, M.bin, GEO.plenumX, GEO.floorY + 0.035, 0));
  root.add(box(0.13, 0.006, 0.13, M.darker, GEO.plenumX, GEO.floorY + 0.068, 0));
  const rejGeo = new THREE.BoxGeometry(0.022, 0.006, 0.03);
  const rejects = new THREE.InstancedMesh(rejGeo, mat({color: '#8b8f95', roughness: 0.6}), 32);
  rejects.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rejects.count = 0;
  rejects.frustumCulled = false;
  root.add(rejects);

  // ---------------------------------------------------------------- the outlet and the screens
  const outlet = new THREE.Group();
  const oCurve = new THREE.CatmullRomCurve3([new V3(GEO.outletX0, 0, 0), new V3(0.42, 0.012, 0), new V3(0.62, 0.004, 0), new V3(GEO.outletX1, 0, 0)], false, 'catmullrom', 0.5);
  const oTube = new THREE.Mesh(new THREE.TubeGeometry(oCurve, 48, 0.05, 16, false), M.glass.clone());
  oTube.renderOrder = 2;
  outlet.add(oTube);
  for (const u of [0.2, 0.55, 0.88]) {
    const p = oCurve.getPointAt(u);
    const tan = oCurve.getTangentAt(u);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.006, 8, 26), M.steel);
    ring.position.copy(p);
    ring.quaternion.setFromUnitVectors(new V3(0, 0, 1), tan);
    outlet.add(ring);
  }
  root.add(outlet);
  const docs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.05, 0.036), mat({color: '#ffffff', roughness: 0.35}), 20);
  docs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  docs.count = 0;
  docs.frustumCulled = false;
  root.add(docs);
  // three reporting screens at the end of the outlet
  for (const [i, z] of [-0.17, 0, 0.17].entries()) {
    const sc = new THREE.Group();
    const back = box(0.014, 0.2, 0.25, M.dark, 0, 0, 0);
    sc.add(back);
    const face = box(0.004, 0.175, 0.225, i === 1 ? M.accent : M.bodyLight, -0.009, 0, 0);
    sc.add(face);
    sc.position.set(0.82, -0.26, z);
    sc.rotation.y = -16 * D2R;
    sc.rotation.z = 8 * D2R;
    root.add(sc);
    sc.add(box(0.05, 0.02, 0.05, M.body, 0, -0.11, 0));
  }

  // ---------------------------------------------------------------- posing
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new V3();
  const _t = new V3();
  const _side = new V3();
  const _up = new V3();
  const _sc = new V3(1, 1, 1);
  const ONE = new V3(1, 1, 1);
  const UP = new V3(0, 1, 0);

  const orient = (pos, tan) => {
    _t.copy(tan).normalize();
    _side.crossVectors(UP, _t);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();
    _up.crossVectors(_t, _side).normalize();
    _m.makeBasis(_t, _up, _side);
    _q.setFromRotationMatrix(_m);
    _m.compose(pos, _q, ONE);
    return _m;
  };

  const state = {
    t: 0,
    // per source
    open: {},
    dim: {},
    // global
    commitFlare: 0,
    stock: 0,
    gl: 0,
  };

  const update = (st, ops = {}) => {
    const h = st.h;
    const focus = ops.focus || null;
    for (const spec of SOURCES) {
      const s = byId[spec.id];
      const row = st.rows.find((r) => r.spec.id === spec.id);
      const flying = pipeAt(spec.id, h);
      const dim = focus && focus !== spec.id ? 0.28 : 1;

      // packets: the records in the pipe, at their place along the runner
      const n = Math.min(flying.length, spec.pool);
      for (let i = 0; i < n; i++) {
        const f = flying[i];
        const u = Math.min(0.999, Math.max(0, f.u));
        s.curve.getPointAt(u, _p);
        s.curve.getTangentAt(u, _t);
        s.packets.setMatrixAt(i, orient(_p, _t));
        s.packets.setColorAt(i, new THREE.Color(f.ok ? spec.color : '#8b8f95'));
      }
      s.packets.count = n;
      s.packets.instanceMatrix.needsUpdate = true;
      if (s.packets.instanceColor) s.packets.instanceColor.needsUpdate = true;

      // the gate: open while this source is flushing
      let flush = 0;
      for (const f of flying) flush = Math.max(flush, 1 - f.u / 0.18);
      if (spec.id === 'pos') flush = Math.max(flush, 0.42); // the till is always open
      s.gate.rotation.z = -Math.min(1, flush) * 82 * D2R;
      s.gate.children[0].material.color.set(spec.color);
      s.gate.children[0].material.opacity = 1;
      s.gate.children[0].transparent = dim < 1;

      // the hopper: the records waiting for their flush, on the common scale
      const fill = Math.min(1, row.pending / GEO.bufferFull);
      const target = Math.max(0.0015, fill * GEO.hopperH);
      s.fill.scale.y += (target - s.fill.scale.y) * 0.25;
      s.fillMat.opacity = 0.85 * dim;

      // fade the whole of every source that is not the one being followed
      const want = dim > 0.9 ? 1 : 0.13;
      if (s.dimState !== want) {
        s.dimState = want;
        for (const m of s.mats) {
          const glassy = m === s.fillMat || m === s.tube.material || m === s.hopper.children[0].material;
          m.opacity = glassy ? want * (m === s.fillMat ? 1.0 : 0.32) : want;
          m.transparent = m.opacity < 0.99;
          m.depthWrite = m.opacity > 0.9;
          m.needsUpdate = true;
        }
        s.packets.visible = want > 0.5;
      }
    }

    // the ledgers: 24 slots each, filling as the day's entries post
    const stockTotal = 1613;
    const glTotal = 7148;
    const stockN = Math.round((st.stock / stockTotal) * 24);
    const glN = Math.round((st.gl / glTotal) * 24);
    ledgers.forEach((L, i) => {
      const n = i === 0 ? stockN : glN;
      L.slots.forEach((s, k) => {
        const on = k < n;
        s.material.color.set(on ? (i === 0 ? '#3d8fe0' : '#f05a23') : '#3a3f47');
        s.material.emissive = new THREE.Color(on ? (i === 0 ? '#3d8fe0' : '#f05a23') : '#000000');
        s.material.emissiveIntensity = on ? 0.35 : 0;
      });
      L.disc.rotation.x = -(n / 24) * Math.PI * 2;
    });

    // the commit ring flares with the commit rate
    const recent = st.rows.reduce((a, r) => a + r.committed, 0);
    state.commitFlare = Math.min(1, st.committed > 0 ? 0.35 : 0.15) + (recent % 1) * 0;
    commit.material.emissiveIntensity = 0.18 + 0.5 * state.commitFlare;

    // the rejects: cards that failed their mapping, falling into the bin
    let rj = 0;
    for (const spec of SOURCES) {
      for (const r of rejectsAt(spec.id, h)) {
        if (rj >= 32) break;
        const age = Math.min(0.55, r.age);
        const k = age / 0.55;
        const p = new V3(
          GEO.plenumX + (spec.id === 'pos' ? 0.02 : spec.id === 'ecom' ? -0.02 : 0),
          -0.19 - 0.18 * k * k,
          (spec.id === 'tally' ? 0.04 : spec.id === 'field' ? -0.04 : 0),
        );
        const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(k * 4, k * 3, k * 2));
        _m.compose(p, rot, ONE);
        rejects.setMatrixAt(rj++, _m);
      }
    }
    rejects.count = rj;
    rejects.instanceMatrix.needsUpdate = true;

    // the outlet: the committed documents leaving for the screens
    const docsN = Math.min(20, Math.round(Math.min(20, st.docs / 130)));
    for (let i = 0; i < docsN; i++) {
      const u = ((h * 0.085 + i / docsN) % 1);
      oCurve.getPointAt(u, _p);
      oCurve.getTangentAt(u, _t);
      docs.setMatrixAt(i, orient(_p, _t));
      docs.setColorAt(i, new THREE.Color('#dfe3e8'));
    }
    docs.count = docsN;
    docs.instanceMatrix.needsUpdate = true;
    if (docs.instanceColor) docs.instanceColor.needsUpdate = true;
  };

  return {root, update, byId, ledgers, plenum, commit};
}
