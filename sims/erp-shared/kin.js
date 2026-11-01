// ERPNext ingress — the business model.
//
// One input: t, the film clock. One film second is one business hour, so t runs 00:00 → 24:00 over a 24 s film.
// Every pose, every counter and every chart reads these functions; nothing is keyframed by hand, so the live page,
// the film and the score can never disagree with each other.
//
// The machine is an inlet manifold. Four upstream systems hold their records in a buffer, flush them into a pipe on
// their own cadence, and the pipes feed ERPNext's plenum, where the documents are written to the Stock Ledger and the
// General Ledger. A record that fails its mapping lands in the reject bin instead of the ledgers.

import {rng} from '../kit/util.js';

export const DURATION = 24; // film seconds = business hours
export const TRANSIT = 0.25; // default hours a record spends in the pipe; each source overrides it

export const C = {
  ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6',
  panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#3d8fe0', grey: '#5d6670',
  orange: '#f05a23', green: '#1f9d55', violet: '#7a5af0',
};

// The four upstream systems. `queue` is how long a record waits before it is allowed into the pipe; `latency` is what
// the business actually sees, from the moment the event happens to the moment ERPNext has committed it.
export const SOURCES = [
  {
    id: 'pos', name: 'Point of Sale', short: 'POS', color: C.blue,
    format: 'JSON over HTTPS · per sale', doc: 'POS Invoice',
    cadence: 'REAL TIME', queue: 'none', latency: '0.4 s',
    err: 0.0024, pool: 64, transit: 0.20, why: 'the till posts the sale as it happens',
  },
  {
    id: 'ecom', name: 'Ecommerce Storefront', short: 'ECOMMERCE', color: C.green,
    format: 'Orders API · hourly pull', doc: 'Sales Order → Sales Invoice',
    cadence: 'HOURLY BATCH', queue: 'up to 60 min', latency: 'avg 30 min',
    err: 0.0140, pool: 64, transit: 0.35, why: 'the site pushes orders on the hour',
  },
  {
    id: 'tally', name: 'Tally Accounting', short: 'TALLY', color: C.orange,
    format: 'Daybook export · vouchers', doc: 'Sales Invoice + Payment Receipt',
    cadence: 'NIGHTLY 21:00', queue: 'up to 21 h', latency: 'avg 10.5 h',
    err: 0.0480, pool: 200, transit: 1.0, why: 'the books close, then the file lands',
  },
  {
    id: 'field', name: 'Field Sales App', short: 'FIELD SALES', color: C.violet,
    format: 'Offline queue · JSON', doc: 'Lead → Opportunity → Sales Order',
    cadence: 'ON RECONNECT', queue: 'up to 3.5 h', latency: 'avg 1.7 h',
    err: 0.0210, pool: 48, transit: 0.6, why: 'the rep comes back into network',
  },
];

// Hourly shape of the business day. Index 0 is 00:00.
const POS_H = [0, 0, 0, 0, 0, 0, 0, 0, 10, 45, 60, 95, 140, 110, 70, 65, 80, 120, 165, 150, 95, 35, 4, 0];
const ECOM_H = [2, 1, 1, 0, 0, 1, 3, 6, 9, 14, 18, 22, 24, 20, 23, 26, 31, 34, 38, 42, 35, 20, 9, 5];
const TALLY_N = 187; // vouchers entered in the accounting books during the day
const TALLY_SYNC = 21; // the nightly import, 21:00
// Field sales: the rep is offline between syncs. [from, to, sync hour, records]
const FIELD_WINDOWS = [[8, 13, 13, 12], [13, 15.5, 15.5, 19], [15.5, 19.5, 19.5, 16]];
const FIELD_CONV = 18; // of the leads that land, how many turn into an opportunity and a sales order

// What one committed record becomes. GL entries are double-entry rows; stock entries are Stock Ledger moves.
export const ART = {
  pos: (n) => ({docs: n, gl: 4 * n, stock: n}),
  ecom: (n) => ({docs: 2 * n, gl: 4 * n, stock: n}),
  tally: (n) => ({docs: 2 * n, gl: 4 * n, stock: 0}),
  field: (n, conv) => ({docs: n + 2 * conv, gl: 0, stock: 0}),
};

const lowerBound = (arr, v) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
};

// ---------------------------------------------------------------- the record streams
function buildStreams() {
  const out = {};
  SOURCES.forEach((spec, si) => {
    const r = rng(1000 + si * 7717);
    const pk = [];
    const push = (c, rel, ok, conv) => pk.push({c, r: rel, a: rel + spec.transit, ok, conv});
    if (spec.id === 'pos') {
      // a sale is posted the moment it happens: created and released in the same instant
      for (let h = 0; h < 24; h++) for (let i = 0; i < POS_H[h]; i++) {
        const c = h + r();
        push(c, c, r() > spec.err, false);
      }
    } else if (spec.id === 'ecom') {
      // orders land through the hour and wait in the storefront's buffer for the top of the hour
      for (let h = 0; h < 24; h++) for (let i = 0; i < ECOM_H[h]; i++) {
        push(h + r(), h + 1, r() > spec.err, false);
      }
    } else if (spec.id === 'tally') {
      // vouchers are typed into the books all day; the file lands once, at 21:00
      for (let i = 0; i < TALLY_N; i++) push(9 + r() * 12, TALLY_SYNC, r() > spec.err, false);
    } else {
      // the phone writes offline and syncs in three waves
      for (const [t0, t1, sync, n] of FIELD_WINDOWS) for (let i = 0; i < n; i++) {
        push(t0 + r() * (t1 - t0), sync, r() > spec.err, false);
      }
      // exactly FIELD_CONV of them convert; pick them with a deterministic shuffle
      const idx = pk.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      for (const i of idx.slice(0, FIELD_CONV)) pk[i].conv = true;
    }
    pk.sort((a, b) => a.r - b.r || a.c - b.c);
    out[spec.id] = {
      spec,
      pk,
      transit: spec.transit,
      c: pk.map((p) => p.c),
      r: pk.map((p) => p.r),
      a: pk.map((p) => p.a),
      ok: pk.map((p) => (p.ok ? 1 : 0)),
      conv: pk.map((p) => (p.conv ? 1 : 0)),
    };
  });
  return out;
}

export const STREAMS = buildStreams();


// ---------------------------------------------------------------- the machine's dimensions, in metres
export const GEO = {
  bulkheadX: -0.97,
  headX: -0.855,
  pipeStartX: -0.69,
  plenumX: 0.02,
  plenumR: 0.20,
  plenumL: 0.46,
  outletX0: 0.245,
  outletX1: 0.70,
  floorY: -0.46,
  hopperH: 0.13,
  hopperR: 0.036,
  bufferZ: 0.215,
  bufferFull: 200, // records: the common scale of the four hoppers
};

// where each source sits on the bulkhead, and where its runner enters the plenum
export const HEADS = {
  pos: {hy: 0.33, hz: 0.0, ey: 0.13, ez: 0.13},
  ecom: {hy: 0.11, hz: 0.0, ey: 0.13, ez: -0.13},
  tally: {hy: -0.11, hz: 0.0, ey: -0.13, ez: -0.13},
  field: {hy: -0.33, hz: 0.0, ey: -0.13, ez: 0.13},
};

// ---------------------------------------------------------------- state at a given hour
/**
 * Everything the machine knows at business hour h.
 *   created   records that exist at the source, in the buffer
 *   pending   of those, the ones still waiting for their flush
 *   inflight  flushed and travelling down the pipe
 *   committed written to ERPNext's ledgers
 *   rejected  arrived but failed their mapping
 */
export function stateAt(h) {
  const rows = [];
  for (const spec of SOURCES) {
    const st = STREAMS[spec.id];
    const m = lowerBound(st.c, h + 1e-9); // records created by now
    const k = lowerBound(st.r, h + 1e-9); // records released into the pipe by now
    const hi = lowerBound(st.a, h + 1e-9); // records arrived at the plenum by now
    let ok = 0;
    let conv = 0;
    for (let i = 0; i < hi; i++) {
      ok += st.ok[i];
      conv += st.conv[i];
    }
    const committed = ok;
    const rejected = hi - ok;
    const art = ART[spec.id](committed, conv);
    rows.push({
      spec,
      created: m,
      pending: m - k,
      inflight: k - hi,
      committed,
      rejected,
      conv,
      docs: art.docs,
      gl: art.gl,
      stock: art.stock,
    });
  }
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  return {
    h,
    rows,
    created: sum((r) => r.created),
    pending: sum((r) => r.pending),
    inflight: sum((r) => r.inflight),
    committed: sum((r) => r.committed),
    rejected: sum((r) => r.rejected),
    docs: sum((r) => r.docs),
    gl: sum((r) => r.gl),
    stock: sum((r) => r.stock),
  };
}

// The packets currently in one source's pipe, with their position along it.
export function pipeAt(id, h) {
  const st = STREAMS[id];
  const lo = lowerBound(st.a, h + 1e-9); // arrived already
  const hi = lowerBound(st.r, h + 1e-9); // released but not yet arrived
  const out = [];
  for (let i = lo; i < hi; i++) {
    out.push({u: (h - st.r[i]) / st.transit, ok: st.ok[i] === 1, conv: st.conv[i] === 1, age: h - st.c[i]});
  }
  return out;
}

// Records that arrived and failed: they fall into the reject bin instead of the ledgers.
export function rejectsAt(id, h) {
  const st = STREAMS[id];
  const hi = lowerBound(st.a, h + 1e-9);
  const out = [];
  for (let i = 0; i < hi; i++) if (!st.ok[i]) out.push({at: st.a[i], age: h - st.a[i]});
  return out;
}

// Arrivals per business hour, for the throughput chart.
export function arrivalsByHour(id) {
  const st = STREAMS[id];
  const bins = new Array(24).fill(0);
  for (let i = 0; i < st.a.length; i++) {
    const hr = Math.min(23, Math.floor(st.a[i]));
    bins[hr] += 1;
  }
  return bins;
}

export const ARRIVALS = Object.fromEntries(SOURCES.map((s) => [s.id, arrivalsByHour(s.id)]));
export const TOTAL_ARRIVALS = new Array(24).fill(0);
for (const s of SOURCES) ARRIVALS[s.id].forEach((n, i) => (TOTAL_ARRIVALS[i] += n));

// ---------------------------------------------------------------- the clock
export const clock = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
export const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:00`;

// The day ahead: what each source is going to bring, so the panels can show a whole-day total against the clock.
export const DAY_TOTALS = (() => {
  const end = stateAt(24);
  return {
    created: end.created,
    docs: end.docs,
    gl: end.gl,
    stock: end.stock,
    rejected: end.rejected,
    per: Object.fromEntries(end.rows.map((r) => [r.spec.id, {created: r.created, docs: r.docs, rejected: r.rejected}])),
  };
})();
