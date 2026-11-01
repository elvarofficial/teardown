// The wheel in three.js, built from the same arrays the physics reads, so what you see is what the ball hits.
// Physics is z-up and right-handed; three is y-up: (x, y, z) -> (x, z, -y). All sizes are metres.
import * as THREE from 'three';
import {RED, SEQUENCE} from './spec.js';

const INK = '#2b2620';
export const ACCENT = '#d0592a';
const toThree = (x, y, z) => new THREE.Vector3(x, z, -y);

const v2 = (pairs) => pairs.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z));

// a lathe's shading normals are only right when each flat section keeps its own vertices
const lathe = (pairs, material, segments = 180) => {
  const g = new THREE.LatheGeometry(v2(pairs), segments);
  const geo = g.toNonIndexed();
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const ballColor = {ivory: '#efe6cf', boxwood: '#d3ab6c', marble: '#dcd7cd', phenolic: '#7c4a2a', ivorine: '#f1e6c3', acrylic: '#f4f4f0', delrin: '#fbfaf5', ptfe: '#fdfdfb', ceramic: '#f6f4ec'};

/** A wedge of the pocket floor between two angles, flat shaded. */
const wedge = (rIn, rOut, zIn, zOut, a0, a1, n = 6) => {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const p = (r, z, t) => [r * Math.cos(t), z, -r * Math.sin(t)];
    pos.push(...p(rIn, zIn, t0), ...p(rOut, zOut, t0), ...p(rOut, zOut, t1), ...p(rIn, zIn, t0), ...p(rOut, zOut, t1), ...p(rIn, zIn, t1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
};

const numberRingTexture = (fretAngle, pitch) => {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  const mid = S / 2;
  x.translate(mid, mid);
  x.font = '700 44px Inter, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let i = 0; i < SEQUENCE.length; i++) {
    const n = SEQUENCE[i];
    const a0 = fretAngle[i];
    const a1 = a0 + pitch;
    // three's texture v runs opposite to the physics y here, so the angle is negated on the canvas
    x.beginPath();
    x.arc(0, 0, mid - 2, a0, a1);
    x.arc(0, 0, mid * 0.86, a1, a0, true);
    x.closePath();
    x.fillStyle = n === 0 ? '#2e7d4f' : RED.has(n) ? '#a8322a' : '#23201c';
    x.fill();
    x.save();
    x.rotate((a0 + a1) / 2);
    x.translate(mid * 0.93, 0);
    x.rotate(Math.PI / 2);
    x.fillStyle = '#f7f1e3';
    x.fillText(String(n), 0, 0);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e2d6');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 20);

  scene.add(new THREE.HemisphereLight('#fff8ec', '#b9a98f', 1.25));
  const key = new THREE.DirectionalLight('#fff5e6', 2.6);
  key.position.set(0.7, 1.6, 0.55);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.2, far: 3.5});
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  scene.add(key);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({opacity: 0.18, polygonOffset: true, polygonOffsetFactor: -1}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.09;
  floor.receiveShadow = true;
  scene.add(floor);

  const wood = new THREE.MeshStandardMaterial({color: '#6e3f22', roughness: 0.48, metalness: 0});
  const woodDark = new THREE.MeshStandardMaterial({color: '#54301b', roughness: 0.5});
  const track = new THREE.MeshStandardMaterial({color: '#8a5a33', roughness: 0.42});
  const lower = new THREE.MeshStandardMaterial({color: '#7a4c2a', roughness: 0.45});
  const brass = new THREE.MeshStandardMaterial({color: '#c6a15b', roughness: 0.45, metalness: 0.75, envMapIntensity: 0.5});
  const nickel = new THREE.MeshStandardMaterial({color: '#c9c7c0', roughness: 0.45, metalness: 0.7});
  const accent = new THREE.MeshStandardMaterial({color: ACCENT, roughness: 0.5, emissive: ACCENT, emissiveIntensity: 0.35});

  const root = new THREE.Group();
  scene.add(root);
  const rotor = new THREE.Group();
  root.add(rotor);
  let built = [];
  let frets = null;
  let fretCount = 0;
  let wheel = null;
  let highlight = null;

  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({color: '#fdfdfb', roughness: 0.38}));
  ball.castShadow = true;
  scene.add(ball);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({color: ACCENT, roughness: 0.5}));
  mark.position.set(0, 0, 0.8);
  ball.add(mark);

  // the ball's last few seconds, in the accent
  const TRAIL = 900;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color: ACCENT, transparent: true, opacity: 0.7}));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailN = 0;

  // the putting line: where this toss is predicted to go
  const PREVIEW = 400;
  const previewPos = new Float32Array(PREVIEW * 3);
  const previewGeo = new THREE.BufferGeometry();
  previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3));
  const preview = new THREE.Line(previewGeo, new THREE.LineDashedMaterial({color: '#fbf8f1', dashSize: 0.012, gapSize: 0.008}));
  preview.frustumCulled = false;
  preview.visible = false;
  scene.add(preview);

  const clear = () => {
    for (const m of built) {
      m.parent?.remove(m);
      m.geometry?.dispose?.();
    }
    built = [];
  };
  const add = (m, parent = root) => {
    parent.add(m);
    built.push(m);
    return m;
  };

  /** Rebuild the wheel from a built parameter set. */
  const setWheel = (w, ballKey) => {
    clear();
    wheel = w;
    const S = w.stator;
    // the bowl, outside to in: skirt, top, lip, wall, tracks
    add(lathe([[0.415, -0.085], [0.415, 0.055], [0.408, S[3] + 0.02], [S[2], S[3]], [S[0], S[1]]], wood));
    add(lathe([[S[0], S[1]], [S[4], S[5]]], woodDark));
    add(lathe([[S[8], S[9]], [S[10], S[11]]], track));
    add(lathe([[S[12], S[13]], [S[14], S[15]], [S[14] - 0.0002, -0.05]], lower));

    // the rotor
    const P = w.rotorProfile;
    const apronIn = [P[2], P[3]];
    const floorOuterZ = w.floorOuterZ;
    const coneBase = [P[12], P[13]];
    add(lathe([[P[0], -0.05], [P[0], P[1]], apronIn], wood), rotor);
    add(lathe([apronIn, [P[6], P[7]]], woodDark), rotor);
    add(lathe([[P[8], P[9]], coneBase], woodDark), rotor);
    add(lathe([coneBase, [P[14], P[15]]], wood), rotor);
    add(lathe([[P[16], P[17]], [P[18], P[19] - 0.02], [0.03, P[19] - 0.012], [0.018, P[19]], [0.022, P[19] + 0.018], [0.0001, P[19] + 0.034]], brass), rotor);

    const texture = numberRingTexture(w.fretAngle, w.pitch);
    const ringGeo = new THREE.BufferGeometry();
    {
      // planar map of the number ring onto the sloped apron
      const SEG = 240;
      const pos = [];
      const uv = [];
      const rIn = P[2] * 1.0;
      const rOut = P[0];
      const uvOf = (r, t) => {
        const q = 0.5 * (0.86 + ((r - rIn) / (rOut - rIn)) * 0.14);
        // canvas y points down, physics y up, and three's flipY cancels one of them
        return [0.5 + q * Math.cos(t), 0.5 + q * Math.sin(t)];
      };
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const b = ((i + 1) / SEG) * Math.PI * 2;
        const pt = (r, z, t) => [r * Math.cos(t), z + 2e-4, -r * Math.sin(t)];
        pos.push(...pt(rIn, P[3], a), ...pt(rOut, P[1], a), ...pt(rOut, P[1], b), ...pt(rIn, P[3], a), ...pt(rOut, P[1], b), ...pt(rIn, P[3], b));
        uv.push(...uvOf(rIn, -a), ...uvOf(rOut, -a), ...uvOf(rOut, -b), ...uvOf(rIn, -a), ...uvOf(rOut, -b), ...uvOf(rIn, -b));
      }
      ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      ringGeo.computeVertexNormals();
    }
    const ring = add(new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({map: texture, roughness: 0.5, transparent: false})), rotor);
    ring.receiveShadow = true;

    // pocket floors, coloured like the ring, each at its own depth
    const colors = {red: new THREE.MeshStandardMaterial({color: '#a8322a', roughness: 0.55}), black: new THREE.MeshStandardMaterial({color: '#23201c', roughness: 0.55}), green: new THREE.MeshStandardMaterial({color: '#2e7d4f', roughness: 0.55})};
    const floorInZ = w.floorOuterZ + w.floorSlope * (w.pocketInnerR - w.pocketOuterR);
    for (let i = 0; i < w.N; i++) {
      const n = SEQUENCE[i];
      const a0 = w.fretAngle[i];
      const a1 = i + 1 < w.N ? w.fretAngle[i + 1] : w.fretAngle[0] + Math.PI * 2;
      const dz = w.floorDz[i];
      const m = add(new THREE.Mesh(wedge(w.pocketInnerR, w.pocketOuterR, floorInZ + dz, floorOuterZ + dz, a0, a1), n === 0 ? colors.green : RED.has(n) ? colors.red : colors.black), rotor);
      m.receiveShadow = true;
      m.userData.pocket = i;
    }

    // frets: a thin plate with a rounded top, one per position
    const fretLen = w.fretOuterR - w.fretInnerR;
    const fretGeo = new THREE.BoxGeometry(fretLen, 1, 2 * w.fretR);
    frets = new THREE.InstancedMesh(fretGeo, brass.clone(), w.N);
    fretCount = w.N;
    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < w.N; i++) {
      const a = w.fretAngle[i];
      const h = w.fretTop[i] - floorOuterZ;
      const r = (w.fretInnerR + w.fretOuterR) / 2;
      quat.setFromAxisAngle(yAxis, a);
      mat.compose(new THREE.Vector3(r * Math.cos(a), floorOuterZ + h / 2, -r * Math.sin(a)), quat, new THREE.Vector3(1, h, 1));
      frets.setMatrixAt(i, mat);
      frets.setColorAt(i, new THREE.Color('#ffffff'));
    }
    frets.castShadow = true;
    frets.receiveShadow = true;
    add(frets, rotor);

    // deflectors
    for (let i = 0; i < w.deflectors.length; i++) {
      const f = w.deflectors[i];
      const shape = new THREE.Shape();
      shape.moveTo(f.a, 0);
      shape.lineTo(0, f.b);
      shape.lineTo(-f.a, 0);
      shape.lineTo(0, -f.b);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {depth: f.top - f.zBase + 0.008 - 0.001, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2});
      geo.rotateX(-Math.PI / 2);
      const mesh = add(new THREE.Mesh(geo, nickel));
      mesh.position.set(f.x, f.zBase - 0.008, -f.y);
      mesh.rotation.y = Math.atan2(f.uy, f.ux);
      mesh.castShadow = true;
      mesh.userData.deflector = i;
    }

    // what you changed is what you see move
    root.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
    rotor.position.set(w.spindle.ox, w.spindle.oz, -w.spindle.oy);
    ball.scale.setScalar(w.ball.R);
    ball.material.color.set(ballColor[ballKey] ?? '#ffffff');
    applyHighlight();
  };

  const applyHighlight = () => {
    if (!frets) return;
    const base = new THREE.Color('#ffffff');
    const hot = new THREE.Color(ACCENT).multiplyScalar(2);
    for (let i = 0; i < fretCount; i++) frets.setColorAt(i, highlight?.kind === 'fret' && highlight.index === i ? hot : base);
    frets.instanceColor.needsUpdate = true;
    for (const m of built) {
      if (m.userData.deflector !== undefined) m.material = highlight?.kind === 'deflector' && highlight.index === m.userData.deflector ? accent : nickel;
      if (m.userData.pocket !== undefined && m.userData.base === undefined) m.userData.base = m.material;
      if (m.userData.pocket !== undefined) m.material = highlight?.kind === 'pocket' && highlight.index === m.userData.pocket ? accent : m.userData.base;
    }
  };

  /** Mark one element, or none: {kind:'fret'|'pocket'|'deflector', index}. */
  const setHighlight = (h) => {
    highlight = h;
    applyHighlight();
  };

  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  let lastT = 0;
  /** Pose from a physics state. */
  const pose = (s, {trailReset = false} = {}) => {
    if (wheel) {
      rotor.rotation.set(0, s.phi, 0);
      // the wobble, turning with the rotor
      const wo = wheel.rotor;
      const sp = wheel.spindle;
      rotor.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), sp.tx);
      rotor.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), sp.ty);
      rotor.rotateZ(wo.wx);
      rotor.rotateX(wo.wy);
    }
    ball.position.set(s.x, s.z, -s.y);
    // integrate the visible spin; the mark shows the ball's rotation
    const dt = Math.max(0, s.t - lastT);
    lastT = s.t;
    const om = Math.hypot(s.wx, s.wy, s.wz);
    if (om > 1e-3 && dt > 0 && dt < 0.2) {
      axis.set(s.wx / om, s.wz / om, -s.wy / om);
      q.setFromAxisAngle(axis, om * dt);
      q2.copy(ball.quaternion).premultiply(q);
      ball.quaternion.copy(q2);
    }
    if (trailReset) trailN = 0;
    if (trailN < TRAIL) trailN++;
    trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    trailPos[0] = s.x;
    trailPos[1] = s.z;
    trailPos[2] = -s.y;
    trailGeo.setDrawRange(0, trailN);
    trailGeo.attributes.position.needsUpdate = true;
  };

  /** points: flat [x, y, z, ...] in physics coordinates, or null to hide. */
  const setPreview = (points) => {
    preview.visible = !!points;
    if (!points) return;
    const n = Math.min(PREVIEW, points.length / 3);
    for (let i = 0; i < n; i++) {
      previewPos[i * 3] = points[i * 3];
      previewPos[i * 3 + 1] = points[i * 3 + 2] + 0.002;
      previewPos[i * 3 + 2] = -points[i * 3 + 1];
    }
    previewGeo.setDrawRange(0, n);
    previewGeo.attributes.position.needsUpdate = true;
    preview.computeLineDistances();
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  /** A pointer position to physics (x, y) on the horizontal plane at height z, or null. */
  const pick = (clientX, clientY, z) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -z;
    return ray.ray.intersectPlane(plane, hit) ? [hit.x, -hit.z] : null;
  };

  const look = new THREE.Vector3();
  const setCamera = (c) => {
    const ce = Math.cos(c.el);
    camera.position.set(c.tx + c.dist * ce * Math.sin(c.az), c.ty + c.dist * Math.sin(c.el), c.tz + c.dist * ce * Math.cos(c.az));
    look.set(c.tx, c.ty, c.tz);
    camera.lookAt(look);
  };

  const resize = (w, h, pr) => {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const v = new THREE.Vector3();
  return {
    renderer,
    scene,
    camera,
    setWheel,
    setHighlight,
    pose,
    setCamera,
    setPreview,
    pick,
    resize,
    ballPosition: () => ball.position,
    project: (x, y, z, w, h) => {
      v.copy(toThree(x, y, z)).project(camera);
      return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
    },
    render: () => renderer.render(scene, camera),
    INK,
  };
}
