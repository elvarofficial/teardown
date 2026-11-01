// ERPNext · Ingress, the explorer film: the manifold (engine.js) on the pale studio (stage.js) under the overlay
// (console.js). The clock runs the business day at one hour per second, so t is the hour and every source flushes on
// its own cadence as the film goes. An operator follows each source in turn, looks inside the core, then watches the
// nightly Tally import land and the committed documents run out to the screens. A pure function of t.
import {runSim} from '../kit/runtime.js';
import {createConsole} from './console.js';
import {DURATION, GEO, HEADS, SOURCES, stateAt} from './kin.js';
import {createErpStage} from './stage.js';

const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// the film's beats: the camera moves and the operator follows a source
export const SCRIPT = [
  {t: 0, cam: 'open'},
  {t: 4.2, cam: 'pos'},
  {t: 8.2, cam: 'ecom'},
  {t: 12.2, cam: 'field'},
  {t: 16.2, cam: 'core'},
  {t: 20.2, cam: 'tally'},
  {t: 22.4, cam: 'outlet'},
];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'erp', subtitle: ''}, director: {enabled: false}, watermark: ''};

// the view a source sits in, and where its runner, hopper and head are on screen
const SRC_VIEW = {pos: 'pos', ecom: 'ecom', tally: 'tally', field: 'field'};
// a source view frames the machine, its runner and the way into the plenum
const srcView = (id, u) => {
  const h = HEADS[id];
  // looking down on the machine, its buffer and the first stretch of its runner: from here no
  // other machine stands between the camera and the one being followed
  return {tx: GEO.headX + 0.08, ty: h.hy + 0.02, tz: GEO.bufferZ * 0.45, az: -18 - 3 * u, el: 26 + 2 * u, d: 1.90, sx: 0, sy: 0};
};
export const VIEW_FN = {
  // the opening: a quarter turn round the whole manifold, easing in and out, pushing in a little
  open: (u) => {
    const k = smoother(u / 4.0);
    return {tx: -0.24, ty: -0.02, tz: 0, az: -29 + 21 * k, el: 10 + 7 * k, d: 4.15 - 0.34 * k, sx: 0, sy: 0};
  },
  sources: (u) => ({tx: -0.80, ty: 0.0, tz: 0, az: -16 + 4 * u, el: 10 + 1 * u, d: 2.9, sx: 0, sy: 0}),
  pos: (u) => srcView('pos', u),
  ecom: (u) => srcView('ecom', u),
  tally: (u) => srcView('tally', u),
  field: (u) => srcView('field', u),
  core: (u) => ({tx: GEO.plenumX, ty: 0.0, tz: 0, az: -24 + 14 * u, el: 9 + 8 * u, d: 1.18, sx: 0, sy: 0}),
  outlet: (u) => ({tx: 0.54, ty: -0.04, tz: 0, az: -38 + 9 * u, el: 13 + 3 * u, d: 1.72, sx: 0, sy: 0}),
};
const CAM_BEATS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
export const camName = (t) => CAM_BEATS.filter(([t0]) => t0 <= t).pop()[1];
export const focusAt = (t) => {
  const c = camName(t);
  return SOURCES.some((s) => SRC_VIEW[s.id] === c) ? c : null;
};

// a camera move: every parameter eased, the azimuth the short way round, backing off through a wide swing
export const camAt = (t) => {
  let i = 0;
  while (i < CAM_BEATS.length - 1 && CAM_BEATS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[CAM_BEATS[i][1]](t - CAM_BEATS[i][0]);
  if (i === 0) return cur;
  const k = ss(CAM_BEATS[i][0], CAM_BEATS[i][0] + 1.5, t);
  if (k >= 1) return cur;
  return blend(VIEW_FN[CAM_BEATS[i - 1][1]](t - CAM_BEATS[i - 1][0]), cur, k);
};
function blend(a, b, k) {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 0.6 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
}

// ------------------------------------------------------------ the operator's pointer
const REST = [[800, 470], [700, 430], [900, 520], [760, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => ({
    t: e.t,
    spot: ui.spots[SRC_VIEW[e.cam]] || ui.spots[e.cam] || ui.spots.hero,
  }));
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot]);
    WP.push([e.t + 0.24, ...e.spot]);
    WP.push([e.t + 1.5, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const lin = t1 - t0 < 0.2;
    const k = lin ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = lin ? 0 : Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.18) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        rx = e.spot[0];
        ry = e.spot[1];
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the callouts
const CALLOUTS = {
  open: [
    {id: 'core', name: 'ERPNext', sub: 'STOCK + GENERAL LEDGER', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -104, dy: -48},
    {id: 'bin', name: 'Reject bin', sub: 'MAPPING FAILED', at: [GEO.plenumX, GEO.floorY + 0.075, 0], dx: 44, dy: -30},
  ],
  pos: [
    {id: 'pos', name: 'Point of Sale', sub: 'EVERY SALE, AS IT HAPPENS', at: [-0.80, 0.415, 0], dx: -108, dy: -60},
    {id: 'hop', name: 'Buffer', sub: 'NO QUEUE — THE TILL POSTS DIRECT', at: [GEO.headX + 0.02, HEADS.pos.hy + 0.01, HEADS.pos.hz + GEO.bufferZ], dx: -150, dy: 52},
    {id: 'core', name: 'ERPNext', sub: 'POS INVOICE COMMITTED', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -96, dy: -40},
  ],
  ecom: [
    {id: 'ecom', name: 'Ecommerce', sub: 'ORDERS PUSHED ON THE HOUR', at: [-0.80, 0.195, 0], dx: -112, dy: -60},
    {id: 'hop', name: 'Buffer', sub: 'HOLDS THE HOUR UNTIL THE BATCH', at: [GEO.headX + 0.02, HEADS.ecom.hy + 0.01, HEADS.ecom.hz + GEO.bufferZ], dx: -150, dy: 52},
    {id: 'core', name: 'ERPNext', sub: 'SALES ORDER → SALES INVOICE', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -104, dy: -40},
  ],
  tally: [
    {id: 'tally', name: 'Tally', sub: 'THE DAYBOOK LANDS AT 21:00', at: [-0.80, -0.025, 0], dx: -112, dy: -60},
    {id: 'hop', name: 'Buffer', sub: 'A DAY OF VOUCHERS WAITING', at: [GEO.headX + 0.02, HEADS.tally.hy + 0.01, HEADS.tally.hz + GEO.bufferZ], dx: -152, dy: 54},
    {id: 'core', name: 'ERPNext', sub: 'VOUCHERS MAPPED TO INVOICES', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -100, dy: -38},
  ],
  field: [
    {id: 'field', name: 'Field Sales', sub: 'THE PHONE SYNCS WHEN IT FINDS SIGNAL', at: [-0.80, -0.245, 0], dx: -116, dy: -60},
    {id: 'hop', name: 'Buffer', sub: 'LEADS WAITING OFFLINE', at: [GEO.headX + 0.02, HEADS.field.hy + 0.01, HEADS.field.hz + GEO.bufferZ], dx: -150, dy: 52},
    {id: 'core', name: 'ERPNext', sub: 'LEAD → OPPORTUNITY → ORDER', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -104, dy: -40},
  ],
  core: [
    {id: 'stock', name: 'Stock Ledger', sub: 'ONE MOVE PER ITEM SOLD', at: [GEO.plenumX - 0.085, 0.1, 0.05], dx: -132, dy: -30},
    {id: 'gl', name: 'General Ledger', sub: 'DOUBLE ENTRY, EVERY LINE', at: [GEO.plenumX + 0.085, 0.1, 0.05], dx: -118, dy: 26},
    {id: 'bin', name: 'Reject bin', sub: 'RECORDS THAT FAILED TO MAP', at: [GEO.plenumX, GEO.floorY + 0.075, 0], dx: 46, dy: -28},
  ],
  outlet: [
    {id: 'out', name: 'Reporting', sub: 'COMMITTED DOCUMENTS', at: [0.95, -0.24, 0], dx: -128, dy: -44},
    {id: 'core', name: 'ERPNext', sub: 'THE LEDGERS ARE WRITTEN', at: [GEO.plenumX, GEO.plenumR + 0.02, 0], dx: -96, dy: -38},
  ],
};
const CALLOUT_W = {pos: 120, ecom: 120, tally: 110, field: 120, core: 168, bin: 116, hop: 150, stock: 126, gl: 138, out: 130};

// ------------------------------------------------------------ the overlay's data for a frame
export function makeConsoleFrame(ui, st) {
  const P = (x, y, z) => st.project(x, y, z);
  return (t, {cam, cursor, since, live}) => {
    const st2 = stateAt(t);
    const focus = live ? live.focus : focusAt(t);
    const vis = ss(0.35, 0.95, since);
    const list = CALLOUTS[cam] || [];
    const callouts = [];
    for (const c of list) {
      if (live && !live.overlays.callouts) break;
      // the focused source is the one the camera is on
      const isSource = c.id === 'pos' || c.id === 'ecom' || c.id === 'tally' || c.id === 'field';
      // in the wide shot every machine is named; when one is followed, only that one is
      if (focus && isSource && c.id !== focus) continue;
      const at = P(c.at[0], c.at[1], c.at[2]);
      if (!at) continue;
      const label = c.label || [at[0] + c.dx, at[1] + c.dy];
      callouts.push({name: c.name, sub: c.sub, at, label, w: CALLOUT_W[c.id] || 120, o: vis});
    }
    ui.update({
      state: st2,
      cam,
      view: cam,
      focus,
      overlays: live ? live.overlays : {callouts: 1, charts: 1},
      callouts,
      cursor,
      paused: live ? live.paused : false,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createErpStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.ERP = st;
    return {
      resize,
      render(t) {
        const cam = camName(t);
        const c = camAt(t);
        const t0 = CAM_BEATS.filter(([a]) => a <= t).pop()[0];
        const focus = focusAt(t);
        st.frame(stateAt(t), {...c, az: c.az * D2R, el: c.el * D2R}, {focus});
        frame(t, {cam, cursor: cursorAt(t), since: t - t0});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
