// The ingress explorer's overlay: the title and the committed-document count top left, the four source cards down the
// left, the transport bottom left, the legend top centre, the ERPNext core panel, the throughput chart and the reject
// list on the right, the focus and view toggles bottom right, and callouts with thin leaders into the machine.
// Fixed 1600 x 900 CSS layout; update(s) redraws every live part from the frame's state.
import {ARRIVALS, C, DAY_TOTALS, SOURCES, TOTAL_ARRIVALS, clock} from './kin.js';

export const VIEWS = ['hero', 'sources', 'core', 'outlet'];
export const FOCUSES = ['pos', 'ecom', 'tally', 'field'];
export const OVERLAYS = ['callouts', 'charts'];

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
.src{position:absolute;left:35px;width:247px;height:106px;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04);pointer-events:auto;cursor:pointer}
.src.on{border-color:${C.ink}}
`;

const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const num = (n) => Math.round(n).toLocaleString('en-US');

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };

  // ------------------------------------------------------------ title and the committed count
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">ERPNext <span style="color:${C.red}">·</span> Ingress</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">FOUR UPSTREAM SYSTEMS &nbsp;•&nbsp; ONE LEDGER &nbsp;•&nbsp; 24 H</div>`);
  const bigNum = add(`<div style="position:absolute;left:33px;top:101px;font-size:56px;font-weight:800;letter-spacing:-3.2px;color:${C.red};line-height:1"></div>`);
  const bigCap = add(`<div class="cp mu" style="position:absolute;left:35px;top:163px;font-weight:500;white-space:nowrap">DOCUMENTS COMMITTED</div>`);
  add(`<div style="position:absolute;left:35px;top:178px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  const dayFill = add(`<div style="position:absolute;left:35px;top:186px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:200px;font-size:9px;font-weight:500">00:00</div>`);
  const dayPct = add(`<div class="cp" style="position:absolute;left:120px;top:200px;font-size:9px;font-weight:500;color:${C.ink}"></div>`);
  add(`<div style="position:absolute;left:35px;top:214px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:220px;font-size:12.5px;font-weight:500">Stock &amp; General Ledger</div>`);

  // ------------------------------------------------------------ the four source cards
  add(`<div class="cp mu" style="position:absolute;left:35px;top:242px;font-weight:500">UPSTREAM SOURCES</div>`);
  const cards = {};
  SOURCES.forEach((spec, i) => {
    const y = 252 + i * 114;
    const card = add(`<div class="src" style="top:${y}px"></div>`);
    // the card's own children live inside the card, so they move with it
    const inCard = (h) => {
      const n = el(h);
      card.appendChild(n);
      return n;
    };
    const chip = inCard(`<div style="position:absolute;left:11px;top:13px;width:9px;height:9px;background:${spec.color}"></div>`);
    const name = inCard(`<div style="position:absolute;left:27px;top:10px;font-size:11.5px;font-weight:600">${spec.name}</div>`);
    const cnt = inCard(`<div style="position:absolute;right:11px;top:9px;font-size:14px;font-weight:700;letter-spacing:-.4px"></div>`);
    const doc = inCard(`<div style="position:absolute;left:27px;top:29px;font-size:8.8px;color:${C.mute};font-weight:500"></div>`);
    const cad = inCard(`<div style="position:absolute;left:27px;top:44px;font-size:8.4px;color:${C.mute};font-weight:500;letter-spacing:.7px;text-transform:uppercase"></div>`);
    inCard(`<div style="position:absolute;left:11px;top:63px;width:225px;height:5px;background:#e6e7e9"></div>`);
    const barCom = inCard(`<div style="position:absolute;left:11px;top:63px;height:5px;background:${spec.color};opacity:.28"></div>`);
    const barFly = inCard(`<div style="position:absolute;left:11px;top:63px;height:5px;background:${spec.color}"></div>`);
    const barPend = inCard(`<div style="position:absolute;left:11px;top:63px;height:5px;background:${spec.color};opacity:.45"></div>`);
    const stat = inCard(`<div style="position:absolute;left:11px;top:76px;font-size:8.2px;color:${C.mute};font-weight:500;letter-spacing:.4px"></div>`);
    cards[spec.id] = {card, chip, name, cnt, doc, cad, barCom, barFly, barPend, stat, y};
  });

  // ------------------------------------------------------------ transport, bottom left
  add(`<div class="pn" style="left:35px;top:740px;width:259px;height:145px"></div>`);
  const btn = {};
  btn.pause = add(`<div class="tb" style="left:45px;top:750px;width:99px;height:26px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.6px">❚❚ &nbsp;PAUSE</div>`);
  btn.back = add(`<div class="tb" style="left:149px;top:750px;width:66px;height:26px;font-size:9.6px">−1 H</div>`);
  btn.fwd = add(`<div class="tb" style="left:219px;top:750px;width:66px;height:26px;font-size:9.6px">+1 H</div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:786px;font-weight:500">BUSINESS CLOCK</div>`);
  const clockBig = add(`<div style="position:absolute;left:45px;top:800px;font-size:30px;font-weight:800;letter-spacing:-1.4px;line-height:1"></div>`);
  const dayTrack = add(`<div style="position:absolute;left:45px;top:842px;width:238px;height:3px;background:#e1e3e6"></div>`);
  const dayKnob = add(`<div style="position:absolute;top:837px;width:7px;height:13px;margin-left:-3.5px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:45px;top:852px;font-weight:500;font-size:8.4px">DRAG TO SCRUB THE DAY &nbsp;·&nbsp; 1 S = 1 H</div>`);
  add(`<div class="cp mu" style="position:absolute;left:45px;top:866px;font-weight:500;font-size:8.4px">CLICK A SOURCE TO FOLLOW IT</div>`);

  // ------------------------------------------------------------ legend, top centre
  add(`<div class="cp" style="position:absolute;left:598px;top:36px;display:flex;gap:16px;font-weight:500;font-size:9.6px">
    ${SOURCES.map((s) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${s.color};vertical-align:middle;margin-right:6px"></i>${s.short}</span>`).join('')}</div>`);

  // ------------------------------------------------------------ ERPNext core panel
  add(`<div class="pn" style="left:1318px;top:36px;width:245px;height:150px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:47px;font-weight:700">ERPNEXT CORE</div>`);
  const coreNow = add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:47px;font-weight:500"></div>`);
  const glBig = add(`<div style="position:absolute;left:1329px;top:63px;font-size:27px;font-weight:800;letter-spacing:-1.2px;line-height:1"></div>`);
  add(`<div style="position:absolute;left:1329px;top:96px;font-size:8.4px;letter-spacing:1.2px;color:${C.mute};font-weight:600">GENERAL LEDGER ENTRIES</div>`);
  add(`<div style="position:absolute;left:1329px;top:110px;width:224px;height:4px;background:#e6e7e9"></div>`);
  const glBar = add(`<div style="position:absolute;left:1329px;top:110px;height:4px;background:${C.orange}"></div>`);
  const stBig = add(`<div style="position:absolute;left:1329px;top:122px;font-size:14px;font-weight:700"></div>`);
  const rejBig = add(`<div style="position:absolute;right:${1600 - 1552}px;top:122px;font-size:14px;font-weight:700"></div>`);
  add(`<div style="position:absolute;left:1329px;top:142px;font-size:8.4px;letter-spacing:1.2px;color:${C.mute};font-weight:600">STOCK LEDGER</div>`);
  add(`<div style="position:absolute;right:${1600 - 1552}px;top:142px;font-size:8.4px;letter-spacing:1.2px;color:${C.mute};font-weight:600;text-align:right">REJECTED</div>`);

  // ------------------------------------------------------------ throughput chart
  add(`<div class="pn" data-g="charts" style="left:1318px;top:196px;width:245px;height:206px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:207px;font-weight:700">THROUGHPUT</div>`);
  add(`<div class="cp mu" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:207px;font-weight:500">RECORDS / HOUR</div>`);
  const tpLeg = add(`<div class="cp mu" data-g="charts" style="position:absolute;left:1329px;top:222px;font-weight:500;font-size:8.4px"></div>`);
  const tp = add(`<svg data-g="charts" style="position:absolute;left:1326px;top:236px" width="232" height="140"></svg>`);

  // ------------------------------------------------------------ rejects
  add(`<div class="pn" data-g="charts" style="left:1318px;top:412px;width:245px;height:108px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:423px;font-weight:700">REJECTED</div>`);
  const rejNote = add(`<div class="cp mu" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:423px;font-weight:500">MAPPING FAILED</div>`);
  const rejList = add(`<div data-g="charts" style="position:absolute;left:1329px;top:441px;width:224px"></div>`);

  // ------------------------------------------------------------ focus and view toggles
  add(`<div class="pn" style="left:1296px;top:720px;width:268px;height:165px"></div>`);
  const group = (title, keys, y, labels) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${y}px;font-weight:500">${title}</div>`);
    let x = 1305;
    let yy = y + 15;
    keys.forEach((k) => {
      const w = Math.round(labels[k].length * 6.2 + 14);
      if (x + w > 1556) {
        x = 1305;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${labels[k]}</div>`);
      x += w + 4;
    });
  };
  const L = Object.fromEntries([...VIEWS, ...FOCUSES, ...OVERLAYS].map((k) => [k, k.toUpperCase()]));
  group('FOLLOW A SOURCE', FOCUSES, 727, L);
  group('CAMERA', VIEWS, 771, L);
  group('OVERLAYS', OVERLAYS, 815, L);

  // ------------------------------------------------------------ callouts and the pointer
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));

  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  const REJ_REASON = {
    pos: 'Payment gateway timeout',
    ecom: 'SKU not in item master',
    tally: 'Unknown ledger code',
    field: 'Duplicate lead',
  };

  return {
    spots,
    btn,
    cards,
    root: ui,
    update(s) {
      const st = s.state;
      // the headline
      bigNum.textContent = num(st.docs);
      bigCap.textContent = 'DOCUMENTS COMMITTED';
      dayFill.style.width = `${((st.h / 24) * 247).toFixed(1)}px`;
      dayPct.textContent = `${clock(st.h)} · ${Math.round((st.h / 24) * 100)}% OF THE DAY`;
      clockBig.textContent = clock(st.h);
      dayKnob.style.left = `${45 + (st.h / 24) * 238 - 3.5}px`;
      btn.pause.innerHTML = s.paused ? '▶ &nbsp;PLAY' : '❚❚ &nbsp;PAUSE';

      // the four source cards
      for (const spec of SOURCES) {
        const r = st.rows.find((x) => x.spec.id === spec.id);
        const c = cards[spec.id];
        c.cnt.textContent = num(r.committed);
        c.doc.textContent = `${spec.doc} · ${spec.format.split('·')[0].trim()}`;
        c.cad.textContent = `${spec.cadence} · QUEUE ${spec.queue} · ${spec.latency}`;
        const w = 225;
        const scale = Math.max(r.created, 1);
        const wc = (r.committed / scale) * w;
        const wf = (r.inflight / scale) * w;
        const wp = (r.pending / scale) * w;
        c.barCom.style.width = `${wc.toFixed(1)}px`;
        c.barFly.style.left = `${wc.toFixed(1)}px`;
        c.barFly.style.width = `${wf.toFixed(1)}px`;
        c.barPend.style.left = `${(wc + wf).toFixed(1)}px`;
        c.barPend.style.width = `${wp.toFixed(1)}px`;
        c.stat.innerHTML = `QUEUE <b style="color:${C.ink}">${num(r.pending)}</b> &nbsp;·&nbsp; IN FLIGHT <b style="color:${C.ink}">${num(r.inflight)}</b> &nbsp;·&nbsp; REJECTED <b style="color:${r.rejected ? C.red : C.ink}">${r.rejected}</b>`;
        c.card.classList.toggle('on', s.focus === spec.id);
      }

      // the core panel
      coreNow.textContent = `${clock(st.h)}`;
      glBig.textContent = num(st.gl);
      glBar.style.width = `${Math.min(224, (st.gl / DAY_TOTALS.gl) * 224).toFixed(1)}px`;
      stBig.textContent = `${num(st.stock)}`;
      rejBig.innerHTML = `<span style="color:${st.rejected ? C.red : C.ink}">${st.rejected}</span>`;

      // the throughput chart: 24 stacked hourly bins, filled up to the clock
      {
        const W = 232;
        const H = 118;
        const bw = 7.2;
        const gap = (W - bw * 24) / 23;
        const max = Math.max(...TOTAL_ARRIVALS, 1);
        let h = '';
        for (let i = 0; i < 24; i++) {
          const x = 4 + i * (bw + gap);
          const past = i + 1 <= st.h;
          const now = Math.floor(st.h) === i;
          let y = H;
          if (past) {
            for (const spec of SOURCES) {
              const n = ARRIVALS[spec.id][i];
              if (!n) continue;
              const hh = (n / max) * (H - 10);
              h += `<rect x="${x.toFixed(1)}" y="${(y - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${spec.color}"/>`;
              y -= hh;
            }
          }
          if (now) h += `<rect x="${(x - 1).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${(bw + 2).toFixed(1)}" height="${(H - y + 4).toFixed(1)}" fill="none" stroke="${C.red}" stroke-width="1"/>`;
        }
        h += `<line x1="4" x2="${W - 4}" y1="${H}" y2="${H}" stroke="${C.ink}" stroke-width=".8"/>`;
        for (const hh of [0, 6, 12, 18, 24]) {
          const x = 4 + (hh / 24) * (W - 8);
          h += `<text x="${x.toFixed(1)}" y="${H + 11}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${String(hh).padStart(2, '0')}</text>`;
        }
        h += `<text x="${W - 4}" y="${H + 11}" font-size="6.5" text-anchor="end" fill="${C.mute}">PEAK ${max} / H</text>`;
        tp.innerHTML = h;
        tpLeg.innerHTML = SOURCES.map((sp) => `<span style="color:${sp.color}">■</span> ${sp.short}`).join(' &nbsp; ');
      }

      // the rejects
      {
        const rows = SOURCES.map((sp) => {
          const r = st.rows.find((x) => x.spec.id === sp.id);
          return r.rejected ? `<div style="display:flex;align-items:center;gap:8px;height:17px"><i style="display:block;width:8px;height:8px;background:${sp.color}"></i><span style="font-size:9.4px;font-weight:500;flex:1">${REJ_REASON[sp.id]}</span><b style="font-size:10.5px;font-weight:700;color:${C.red}">${r.rejected}</b></div>` : '';
        }).filter(Boolean);
        rejList.innerHTML = rows.length ? rows.join('') : `<div style="font-size:9.4px;color:${C.mute};font-weight:500">Nothing rejected so far</div>`;
        rejNote.textContent = st.rejected ? `${st.rejected} OF ${num(st.created)}` : 'NONE YET';
      }

      // toggles
      for (const k of VIEWS) {
        const on = s.view === k && !s.focus;
        btn[k].style.background = on ? C.ink : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.ink : C.line;
      }
      for (const k of FOCUSES) {
        const on = s.focus === k;
        btn[k].style.background = on ? C.red : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.red : C.line;
      }
      for (const k of OVERLAYS) {
        const on = !!s.overlays[k];
        btn[k].style.background = on ? C.red : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.red : C.line;
      }

      // callouts: a label and a thin leader to its point in the machine
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${(ly + 16).toFixed(1)} ${(lx + c.w).toFixed(1)},${(ly + 16).toFixed(1)}" fill="none" stroke="${C.mute}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
