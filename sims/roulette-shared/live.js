// The wheel as a page you drive. Left: the ball and the launch. Middle: the wheel, run live by the same physics the Monte
// Carlo runs. Right: the whole as-built stackup by element, every delta zero until you move it, and the BoM. Bottom: what
// the ball is doing, and the distribution of numbers from a batch run on this exact build. Left alone it spins by itself;
// any click, drag, wheel or key hands control over, and 25 s of quiet hands it back.
import {chiSquareGof, circular, minDetectableShift} from '../../skills/monte-carlo/engine/stats.js';
import {runBatch} from './batch.js';
import {BOM, rotorInertia, rotorMass, SOURCES, wheelMass} from './bom.js';
import {COEFFICIENTS} from './data/coefficients.js';
import {createSim} from './physics.js';
import {BALLS, ballPresetValues, buildWheel, DEFAULT_BALL, RED, SEQUENCE, stackup} from './spec.js';
import {ACCENT, createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const LEFT = 288;
const RIGHT = 372;
const BOTTOM = 196;
const TOP = 46;
const GROUPS = {
  table: 'Table and room', bowl: 'Bowl and ball track', spindle: 'Spindle and bearings', rotor: 'Rotor', fret: 'Frets (37)', pocket: 'Pockets (37)', deflector: 'Deflectors (8)', ball: 'Ball, as made', surface: 'Surfaces',
};
const VIEWS = {
  wheel: {label: 'Wheel', az: 0.55, el: 0.92, dist: 1.92, tx: 0, ty: 0, tz: 0},
  top: {label: 'Top', az: 0, el: 1.53, dist: 1.92, tx: 0, ty: 0, tz: 0},
  track: {label: 'Ball track', az: 0.78, el: 0.72, dist: 0.85, tx: 0.2, ty: 0.03, tz: 0.2},
  pockets: {label: 'Pockets', az: 0.35, el: 0.95, dist: 0.42, tx: 0.08, ty: -0.01, tz: 0.2},
  follow: {label: 'Follow ball', az: 0.5, el: 0.55, dist: 0.42, tx: 0, ty: 0, tz: 0, follow: true},
};
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');

// phones get a stacked page instead of the scaled console, whose text would be a third of its size
const PHONE = '@media (max-width:820px),(max-height:500px)';
const PHONE_WIDE = '@media (max-height:500px) and (orientation:landscape)';
const phoneQuery = matchMedia(PHONE.replace('@media ', ''));

const CSS = `
html,body{background:#e9e2d6;overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;font-family:Inter,sans-serif;color:#2b2620;font-size:13px}
#gl{position:absolute;left:${LEFT}px;top:${TOP}px;width:${W - LEFT - RIGHT}px;height:${H - TOP - BOTTOM}px;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.pane{position:absolute;background:#f3eee3;box-sizing:border-box}
.head{left:0;top:0;width:100%;height:${TOP}px;display:flex;align-items:center;gap:14px;padding:0 16px;border-bottom:1px solid #cfc6b4}
.head h1{font:700 16px Inter,sans-serif;margin:0;white-space:nowrap}
.head span.lede{color:#6d6454;font-size:13px;white-space:nowrap}
.chip{margin-left:auto;display:flex;align-items:center;gap:8px;height:28px;padding:0 12px;border:1px solid #bdb29d;background:#fbf8f1;font:600 12px Inter,sans-serif;white-space:nowrap}
.chip i{width:8px;height:8px;border-radius:50%;background:#7c9a6b}
.chip.on i{background:${ACCENT}}
.left{left:0;top:${TOP}px;width:${LEFT}px;height:${H - TOP}px;border-right:1px solid #cfc6b4;padding:12px;overflow:auto}
.rpane{right:0;top:${TOP}px;width:${RIGHT}px;height:${H - TOP}px;border-left:1px solid #cfc6b4;display:flex;flex-direction:column}
.bottom{left:${LEFT}px;bottom:0;width:${W - LEFT - RIGHT}px;height:${BOTTOM}px;border-top:1px solid #cfc6b4;display:grid;grid-template-columns:262px 1fr;gap:0}
.h{font:700 11px Inter,sans-serif;letter-spacing:.8px;text-transform:uppercase;color:#6d6454;margin:0 0 7px}
.balls{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:0 0 6px}
.ball{display:grid;grid-template-columns:14px 1fr;gap:6px;align-items:center;width:100%;min-height:32px;padding:3px 6px;border:1px solid #d8cfbd;background:#fbf8f1;text-align:left;cursor:pointer;font:inherit;color:inherit}
.ball:hover{border-color:#9c917c}
.ball.on{border-color:${ACCENT};box-shadow:inset 0 0 0 1px ${ACCENT}}
.ball b{display:block;font-size:11.5px;font-weight:600;line-height:1.15}
.dot{width:13px;height:13px;border-radius:50%;border:1px solid #8e8370}
.props{font:400 10.5px 'JetBrains Mono',monospace;color:#544c3f;line-height:1.45;margin:0 0 10px;white-space:pre-wrap}
.field{display:grid;grid-template-columns:1fr auto;gap:0 8px;margin:0 0 4px;font-size:11.5px}
.field output{font-size:11px!important}
.spinrow{display:grid;grid-template-columns:84px 1fr;gap:8px;align-items:start;margin:4px 0 6px}
.spinrow canvas{width:84px;height:84px;cursor:crosshair;touch-action:none;display:block}
.spinrow p{margin:0 0 4px;font-size:11px;line-height:1.3;color:#6d6454}
.meter{position:absolute;left:${LEFT + (W - LEFT - RIGHT) / 2 - 170}px;top:${TOP + 46}px;width:340px;padding:7px 10px 8px;background:rgba(251,248,241,.95);border:1px solid #9c917c;display:none;font-size:12px}
.meter.on{display:block}
.meter b{font:700 15px 'JetBrains Mono',monospace}
.meter .bar{position:relative;height:10px;margin-top:5px;background:#e3dac8}
.meter .zone{position:absolute;top:0;bottom:0;left:30%;width:50%;background:#b6c9a3}
.meter .fill{position:absolute;top:0;bottom:0;left:0;width:0;background:${ACCENT}}
.field input{grid-column:1/3;width:100%;accent-color:${ACCENT};margin:0}
.field output{font:600 12px 'JetBrains Mono',monospace}
button.act{width:100%;height:34px;margin:0 0 6px;border:1px solid #2b2620;background:#2b2620;color:#fbf8f1;font:600 13px Inter,sans-serif;cursor:pointer}
button.act:hover{background:#463e33}
button.act.alt{background:#fbf8f1;color:#2b2620;border-color:#9c917c}
button.act.alt:hover{background:#eee7d8}
.views{position:absolute;left:${LEFT + 10}px;top:${TOP + 10}px;display:flex;gap:4px}
.views button{height:28px;padding:0 10px;border:1px solid #bdb29d;background:rgba(251,248,241,.92);font:600 12px Inter,sans-serif;color:#2b2620;cursor:pointer}
.views button.on{background:#2b2620;color:#fbf8f1;border-color:#2b2620}
.number{position:absolute;right:${RIGHT + 14}px;top:${TOP + 10}px;width:82px;height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fbf8f1;background:#23201c;font:700 36px Inter,sans-serif;line-height:1}
.number small{font:600 10px Inter,sans-serif;letter-spacing:.8px;margin-top:4px;opacity:.85}
.tabs{display:flex;border-bottom:1px solid #cfc6b4;flex:none}
.tabs button{flex:1;height:36px;border:0;border-right:1px solid #cfc6b4;background:transparent;font:600 12px Inter,sans-serif;color:#6d6454;cursor:pointer}
.tabs button:last-child{border-right:0}
.tabs button.on{color:#2b2620;background:#fbf8f1;box-shadow:inset 0 -2px 0 ${ACCENT}}
.tabbody{flex:1;overflow:auto;min-height:0}
.tools{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #dcd3c1;position:sticky;top:0;background:#f3eee3;z-index:2}
.tools input{flex:1;min-width:0;height:28px;padding:0 8px;border:1px solid #bdb29d;background:#fbf8f1;font:12px Inter,sans-serif}
.tools button{height:30px;padding:0 10px;border:1px solid #9c917c;background:#fbf8f1;font:600 12px Inter,sans-serif;cursor:pointer;white-space:nowrap;color:#2b2620}
details.g{border-bottom:1px solid #dcd3c1}
details.g summary{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;cursor:pointer;font-weight:600;font-size:13px;list-style:none}
details.g summary::-webkit-details-marker{display:none}
details.g summary::before{content:'+';font:600 13px 'JetBrains Mono',monospace;color:#6d6454;width:12px}
details.g[open] summary::before{content:'-'}
details.g summary em{margin-left:auto;font:400 11px 'JetBrains Mono',monospace;color:#6d6454}
details.g summary em.on{color:${ACCENT};font-weight:700}
.sk{display:grid;grid-template-columns:1fr 76px;gap:1px 8px;padding:5px 10px 6px;border-top:1px solid #e6dfd0}
.sk:hover{background:#fbf8f1}
.sk.on{background:#faeee5}
.sk label{font-size:12px;line-height:1.25}
.sk input[type=number]{width:100%;box-sizing:border-box;height:22px;border:1px solid #cfc6b4;background:#fff;font:11.5px 'JetBrains Mono',monospace;text-align:right;padding:0 3px}
.sk input[type=range]{grid-column:1;width:100%;margin:2px 0 0;accent-color:${ACCENT}}
.sk small{grid-column:2;font:400 10.5px 'JetBrains Mono',monospace;color:#6d6454;text-align:right;white-space:nowrap}
.sk p{grid-column:1/3;margin:2px 0 0;font-size:11px;color:#6d6454}
table.bom{border-collapse:collapse;width:100%;font-size:11.5px}
table.bom th{position:sticky;top:0;background:#f3eee3;text-align:left;font-size:10.5px;color:#6d6454;padding:5px 6px;border-bottom:1px solid #cfc6b4}
table.bom td{padding:5px 6px;border-bottom:1px solid #e6dfd0;vertical-align:top}
table.bom td b{font-weight:600}
.tag{font:600 9.5px 'JetBrains Mono',monospace;padding:1px 4px;border:1px solid #bdb29d;white-space:nowrap}
.tag.catalog{background:#e3ecd9;border-color:#9fb78b}
.tag.custom{background:#f4e4d2;border-color:#caa47e}
.note{padding:10px;font-size:12px;line-height:1.45;color:#544c3f;border-bottom:1px solid #dcd3c1}
.note a{color:#2b2620}
.live{padding:11px 12px;border-right:1px solid #cfc6b4;display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;align-content:start}
.live .phase{grid-column:1/3;font-weight:700;font-size:14px;margin-bottom:4px;min-height:18px}
.stat{display:flex;flex-direction:column;font-size:11px;color:#6d6454}
.stat b{font:600 15px 'JetBrains Mono',monospace;color:#2b2620}
.hist{padding:9px 12px 8px;display:flex;flex-direction:column;min-width:0}
.histhead{display:flex;gap:10px;align-items:baseline;font-size:12px;min-height:18px;white-space:nowrap;overflow:hidden}
.histhead b{font-weight:700}
.histhead span{color:#6d6454}
#hist{flex:1;width:100%;min-height:0;display:block}
.toast{position:absolute;left:${LEFT + 14}px;bottom:${BOTTOM + 12}px;padding:5px 9px;background:rgba(251,248,241,.92);border:1px solid #bdb29d;font-size:12px;display:flex;align-items:center;gap:8px}
.toast i{width:7px;height:7px;border-radius:50%;background:${ACCENT}}
.toast.tour i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.wheelbox,.under{display:contents}
${PHONE}{
html,body{position:fixed;inset:0;width:100%;height:100%}
#app{position:fixed!important;inset:0!important;width:auto;height:auto;transform:none!important;display:flex;flex-direction:column}
.wheelbox{display:block;position:relative;flex:none;height:46dvh;background:#e9e2d6;overflow:hidden}
.under{display:block;flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;border-top:1px solid #cfc6b4}
.pane{position:static!important;width:auto!important;height:auto!important;border-left:0!important;border-right:0!important}
.head{flex:none;height:40px!important;padding:0 10px;gap:8px}
.head span.lede{display:none}
.head h1{font-size:14px}
.chip{height:24px;padding:0 8px;font-size:10.5px;min-width:0;overflow:hidden}
#gl{position:absolute!important;inset:0;width:100%;height:100%}
.views{left:6px;top:6px;right:6px;flex-wrap:wrap}
.views button{height:30px;padding:0 8px;font-size:11.5px}
.number{right:8px;top:auto;bottom:8px;width:64px;height:64px;font-size:28px}
.toast{left:8px;bottom:8px;right:80px;font-size:11px}
.meter{left:8px;right:8px;top:44px;width:auto}
.left{padding:10px 12px}
.bottom{display:block;border-bottom:1px solid #cfc6b4}
.live{border-right:0;grid-template-columns:1fr 1fr 1fr}
.live .phase{grid-column:1/4}
.histhead{white-space:normal;flex-wrap:wrap;gap:2px 8px}
#hist{height:130px;flex:none}
.rpane{display:block;min-height:70dvh}
.tabs{position:sticky;top:0;background:#f3eee3;z-index:3}
.tabs button{height:42px}
.tools{position:static}
.tabbody{overflow:visible}
table.bom{font-size:11px}
input,button.act{font-size:16px}
button.act{height:44px}
.ball{min-height:40px}
.sk input[type=number]{height:30px;font-size:16px}
.tools input{font-size:16px;height:32px}
}
${PHONE_WIDE}{
#app{flex-flow:row wrap}
.head{width:100%!important}
.wheelbox{width:56vw;height:calc(100dvh - 40px)}
.under{width:44vw;flex:none;height:calc(100dvh - 40px);border-top:0;border-left:1px solid #cfc6b4;box-sizing:border-box}
}
`;

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const ballSwatch = {ivory: '#efe6cf', boxwood: '#d3ab6c', marble: '#dcd7cd', phenolic: '#7c4a2a', ivorine: '#f1e6c3', acrylic: '#f4f4f0', delrin: '#fbfaf5', ptfe: '#ffffff', ceramic: '#f6f4ec'};

export function runLive() {
  document.head.appendChild(el('style', '', CSS));
  document.title = 'Roulette wheel, as built';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage(canvas);

  // ------------------------------------------------------------ the build
  const items = stackup();
  const deltas = {};
  let ballKey = DEFAULT_BALL;
  const toss = {speed: 2.5, direction: -1, az: 40, vr: 0.03, vz: 0, inward: 0, lift: 0, roll: 0.9, spinR: 0, spinT: 0, spinZ: 0, rotorRpm: 25};
  const parameters = () => ({...ballPresetValues(ballKey), ...deltas});
  const activeCount = () => Object.values(deltas).filter((v) => v !== 0).length;
  let wheel = buildWheel(parameters());
  let sim = createSim(wheel);

  // ------------------------------------------------------------ the frame
  const head = el('div', 'pane head', `<h1>Roulette wheel</h1><span class="lede">37 pockets, 830 mm bowl. Every force from first principles.</span>`);
  const chip = el('div', 'chip', '<i></i><span></span>');
  head.appendChild(chip);
  app.appendChild(head);

  // ------------------------------------------------------------ left: ball and launch
  const left = el('div', 'pane left');
  left.appendChild(el('div', 'h', 'Ball'));
  const ballButtons = {};
  const ballGrid = el('div', 'balls');
  for (const [key, b] of Object.entries(BALLS)) {
    const btn = el('button', 'ball', `<span class="dot" style="background:${ballSwatch[key]}"></span><b>${b.label}</b>`);
    btn.title = `${b.era}. ${b.note}`;
    btn.onclick = () => {
      ballKey = key;
      rebuild();
      spin();
    };
    ballButtons[key] = btn;
    ballGrid.appendChild(btn);
  }
  left.appendChild(ballGrid);
  const props = el('div', 'props');
  left.appendChild(props);
  const throwBtn = el('button', 'act', `Throw it by hand${phoneQuery.matches ? '' : ' (T)'}`);
  throwBtn.onclick = () => startAim();
  left.appendChild(throwBtn);
  const spinBtn = el('button', 'act alt', `Repeat this toss${phoneQuery.matches ? '' : ' (space)'}`);
  spinBtn.onclick = () => spin();
  left.appendChild(spinBtn);
  left.appendChild(el('div', 'h', 'The toss'));
  const fields = {};
  const slider = (key, label, unit, min, max, step) => {
    const f = el('div', 'field', `<span>${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}" value="${toss[key]}">`);
    const out = f.querySelector('output');
    const input = f.querySelector('input');
    const show = () => (out.textContent = `${(+toss[key]).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0)} ${unit}`);
    show();
    input.oninput = () => {
      toss[key] = +input.value;
      show();
    };
    fields[key] = {show, input};
    left.appendChild(f);
  };
  slider('speed', 'Speed along track', 'm/s', 1.2, 4, 0.05);
  slider('vr', 'Into the wall', 'm/s', -0.3, 0.4, 0.01);
  slider('vz', 'Upward', 'm/s', -0.2, 0.3, 0.01);
  slider('inward', 'Release inward', 'mm', 0, 6, 0.1);
  slider('lift', 'Release height', 'mm', 0, 6, 0.1);
  slider('roll', 'Rolling at release', '', 0, 1, 0.05);
  const spinRow = el('div', 'spinrow', `<canvas></canvas><div><p>Spin. Drag on the ball, as you would set spin on a golf ball.</p></div>`);
  left.appendChild(spinRow);
  slider('spinZ', 'Spin about vertical', 'rad/s', -60, 60, 1);
  slider('rotorRpm', 'Rotor', 'rpm', 0, 50, 1);
  const batchBtn = el('button', 'act alt', 'Run 1,000 trials on this build');
  left.appendChild(batchBtn);
  app.appendChild(left);

  // ------------------------------------------------------------ right: stackup, BoM, sources
  const right = el('div', 'pane rpane');
  const tabs = el('div', 'tabs');
  const bodies = {};
  const tabBtns = {};
  const body = el('div', 'tabbody');
  const showTab = (k) => {
    for (const [n, b] of Object.entries(tabBtns)) b.classList.toggle('on', n === k);
    body.replaceChildren(bodies[k]);
    body.scrollTop = 0;
  };
  for (const [k, label] of [['stackup', 'As-built stackup'], ['bom', 'Bill of materials'], ['sources', 'Sources']]) {
    const b = el('button', '', label);
    b.onclick = () => showTab(k);
    tabBtns[k] = b;
    tabs.appendChild(b);
  }
  right.append(tabs, body);
  app.appendChild(right);

  // stackup rows, built when a group first opens: 200+ of them would slow the first frame
  const stackupRoot = el('div');
  const tools = el('div', 'tools', `<input type="search" placeholder="Filter, e.g. fret 17 or tilt"><button>Zero all</button>`);
  stackupRoot.appendChild(tools);
  const groupsRoot = el('div');
  stackupRoot.appendChild(groupsRoot);
  bodies.stackup = stackupRoot;
  const groupEls = {};
  const rowEls = {};
  const highlightOf = (id) => {
    const [g, key] = id.split('.');
    if (g === 'fret' || g === 'pocket') return {kind: g, index: SEQUENCE.indexOf(Number(key))};
    if (g === 'deflector') return {kind: 'deflector', index: Number(key) - 1};
    return null;
  };
  const sliderRange = (p) => (p.tol?.sd ? Math.max(p.tol.sd * 8, 0.01) : 20);
  const makeRow = (p) => {
    const span = sliderRange(p);
    const step = +(span / 100).toPrecision(1);
    const row = el('div', 'sk', `<label>${p.label}</label><input type="number" step="${step}" value="${deltas[p.id] ?? 0}"><input type="range" min="${-span}" max="${span}" step="${step}" value="${deltas[p.id] ?? 0}"><small>${p.unit}${p.tol?.sd ? ` ±${p.tol.sd}` : ''}</small>${p.note ? `<p>${p.note}</p>` : ''}`);
    const [num, rng] = row.querySelectorAll('input');
    const apply = (v) => {
      num.value = v;
      rng.value = v;
      if (v) deltas[p.id] = v;
      else delete deltas[p.id];
      row.classList.toggle('on', !!v);
      scheduleRebuild();
    };
    num.onchange = () => apply(Number(num.value) || 0);
    rng.oninput = () => apply(Number(rng.value));
    row.onmouseenter = () => st.setHighlight(highlightOf(p.id));
    row.onmouseleave = () => st.setHighlight(null);
    row.classList.toggle('on', !!deltas[p.id]);
    rowEls[p.id] = {row, num, rng};
    return row;
  };
  for (const [g, label] of Object.entries(GROUPS)) {
    const ps = items.filter((p) => p.group === g);
    const d = el('details', 'g', `<summary>${label}<em></em></summary>`);
    const content = el('div');
    d.appendChild(content);
    let filled = false;
    d.addEventListener('toggle', () => {
      if (d.open && !filled) {
        filled = true;
        content.append(...ps.map(makeRow));
      }
    });
    groupEls[g] = {details: d, content, ps, count: d.querySelector('em'), fill: () => {
      if (!filled) {
        filled = true;
        content.append(...ps.map(makeRow));
      }
    }};
    groupsRoot.appendChild(d);
  }
  groupEls.table.details.open = true;
  const filterInput = tools.querySelector('input');
  filterInput.oninput = () => {
    const words = filterInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const g of Object.values(groupEls)) {
      if (!words.length) {
        g.details.style.display = '';
        for (const p of g.ps) if (rowEls[p.id]) rowEls[p.id].row.style.display = '';
        continue;
      }
      g.fill();
      let any = false;
      for (const p of g.ps) {
        const text = `${p.id} ${p.label}`.toLowerCase();
        const hit = words.every((w) => text.includes(w));
        rowEls[p.id].row.style.display = hit ? '' : 'none';
        any = any || hit;
      }
      g.details.style.display = any ? '' : 'none';
      if (any) g.details.open = true;
    }
  };
  tools.querySelector('button').onclick = () => {
    for (const id of Object.keys(deltas)) delete deltas[id];
    for (const {row, num, rng} of Object.values(rowEls)) {
      num.value = 0;
      rng.value = 0;
      row.classList.remove('on');
    }
    rebuild();
    spin();
  };

  // BoM
  const bomRoot = el('div');
  bomRoot.appendChild(el('div', 'note', `${BOM.length} lines, about ${wheelMass().toFixed(0)} kg. The rotor is ${rotorMass().toFixed(1)} kg; its inertia, ${rotorInertia().toFixed(3)} kg m², comes from these lines. <b>catalog</b> parts can be ordered by name, <b>stock</b> is commodity material, <b>custom</b> is this model's own design, since no maker publishes drawings.`));
  bomRoot.appendChild(el('table', 'bom', `<thead><tr><th></th><th>Part</th><th>Qty</th><th>Basis</th></tr></thead><tbody>${BOM.map((l) => `<tr><td>${l.item}</td><td><b>${l.name}</b><br>${l.part}<br><span style="color:#6d6454">${l.material}</span></td><td>${l.qty}</td><td><span class="tag ${l.basis}">${l.basis}</span></td></tr>`).join('')}</tbody>`));
  bodies.bom = bomRoot;
  // sources
  const sourcesRoot = el('div');
  const lib = Object.entries(COEFFICIENTS);
  const sourced = lib.filter(([, c]) => c.source?.kind !== 'estimate').length;
  sourcesRoot.appendChild(el('div', 'note', `Few wheel dimensions are public, and every tolerance is an estimate. Of the ${lib.length} material coefficients below, ${sourced} come from a page that was opened and read, and ${lib.length - sourced} are estimates, including every ball-on-surface pair. Measure a real wheel and ball to replace them.`));
  for (const s of SOURCES) sourcesRoot.appendChild(el('div', 'note', `<b>${s.what}</b><br><a href="${s.url}" target="_blank" rel="noopener">${s.where}</a>`));
  sourcesRoot.appendChild(el('table', 'bom', `<thead><tr><th>Coefficient</th><th>Value</th><th>Basis</th></tr></thead><tbody>${lib.map(([id, c]) => {
    const kind = c.source?.kind ?? 'estimate';
    const tag = `<span class="tag ${kind === 'estimate' ? 'custom' : 'catalog'}">${kind}</span>`;
    return `<tr><td>${id}</td><td>${c.given}</td><td>${c.source?.url ? `<a href="${c.source.url}" target="_blank" rel="noopener">${tag}</a>` : tag}</td></tr>`;
  }).join('')}</tbody>`));
  bodies.sources = sourcesRoot;
  showTab('stackup');

  // ------------------------------------------------------------ bottom: live numbers and the distribution
  const bottom = el('div', 'pane bottom');
  const live = el('div', 'live', `<div class="phase"></div>${['Time|t', 'Ball speed|v', 'Spin|w', 'Rotor|r', 'Fret hits|f', 'Deflector hits|d'].map((s) => `<div class="stat"><span>${s.split('|')[0]}</span><b data-k="${s.split('|')[1]}">-</b></div>`).join('')}`);
  const hist = el('div', 'hist', `<div class="histhead"><b></b><span></span></div><canvas id="hist"></canvas>`);
  bottom.append(live, hist);
  app.appendChild(bottom);
  const statEl = Object.fromEntries([...live.querySelectorAll('b[data-k]')].map((b) => [b.dataset.k, b]));
  const phaseEl = live.querySelector('.phase');
  const histTitle = hist.querySelector('.histhead b');
  const histNote = hist.querySelector('.histhead span');
  const histCanvas = hist.querySelector('canvas');

  // ------------------------------------------------------------ views, number, tour note
  const views = el('div', 'views');
  const viewBtns = {};
  let view = 'wheel';
  const cam = {...VIEWS.wheel};
  const off = {az: 0, el: 0, k: 1};
  for (const [k, v] of Object.entries(VIEWS)) {
    const b = el('button', '', v.label);
    b.onclick = () => {
      view = k;
      off.az = 0;
      off.el = 0;
      off.k = 1;
      for (const [n, x] of Object.entries(viewBtns)) x.classList.toggle('on', n === k);
    };
    viewBtns[k] = b;
    views.appendChild(b);
  }
  viewBtns.wheel.classList.add('on');
  app.appendChild(views);
  const numberEl = el('div', 'number', '<span>-</span><small></small>');
  numberEl.style.display = 'none';
  app.appendChild(numberEl);
  const toast = el('div', 'toast', '<i></i><span></span>');
  app.appendChild(toast);
  // two boxes that mean nothing on a desktop, and on a phone hold the wheel and the scrolling panels
  const wheelBox = el('div', 'wheelbox');
  const under = el('div', 'under');
  wheelBox.append(canvas, ...[...app.querySelectorAll(':scope > .views, :scope > .number, :scope > .toast, :scope > .meter')]);
  under.append(...[...app.querySelectorAll(':scope > .left, :scope > .bottom, :scope > .rpane')]);
  app.append(wheelBox, under);

  // ------------------------------------------------------------ the spin picker: a ball you hit off-centre
  const spinCanvas = spinRow.querySelector('canvas');
  const SPIN_MAX = 60;
  const drawSpin = () => {
    const S = 168;
    spinCanvas.width = S;
    spinCanvas.height = S;
    const x = spinCanvas.getContext('2d');
    const c = S / 2;
    const r = S / 2 - 6;
    const g = x.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c9c0ad');
    x.fillStyle = g;
    x.beginPath();
    x.arc(c, c, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#6d6454';
    x.lineWidth = 2;
    x.stroke();
    x.strokeStyle = 'rgba(109,100,84,.45)';
    x.beginPath();
    x.moveTo(c - r, c);
    x.lineTo(c + r, c);
    x.moveTo(c, c - r);
    x.lineTo(c, c + r);
    x.stroke();
    const px = c + (toss.spinT / SPIN_MAX) * r;
    const py = c - (toss.spinR / SPIN_MAX) * r;
    x.strokeStyle = ACCENT;
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(c, c);
    x.lineTo(px, py);
    x.stroke();
    x.fillStyle = ACCENT;
    x.beginPath();
    x.arc(px, py, 9, 0, Math.PI * 2);
    x.fill();
    spinRow.querySelector('p').textContent = `Spin: drag on the ball. ${toss.spinT.toFixed(0)} rad/s along the track, ${toss.spinR.toFixed(0)} across it.`;
  };
  const spinAt = (e) => {
    const r = spinCanvas.getBoundingClientRect();
    let u = ((e.clientX - r.left) / r.width - 0.5) * 2;
    let v = -((e.clientY - r.top) / r.height - 0.5) * 2;
    const l = Math.hypot(u, v);
    if (l > 1) {
      u /= l;
      v /= l;
    }
    // near the middle snaps to no added spin
    toss.spinT = l < 0.08 ? 0 : Math.round(u * SPIN_MAX);
    toss.spinR = l < 0.08 ? 0 : Math.round(v * SPIN_MAX);
    drawSpin();
    updatePreview();
  };
  let spinDrag = false;
  spinCanvas.addEventListener('pointerdown', (e) => {
    spinDrag = true;
    spinCanvas.setPointerCapture(e.pointerId);
    spinAt(e);
  });
  spinCanvas.addEventListener('pointermove', (e) => spinDrag && spinAt(e));
  spinCanvas.addEventListener('pointerup', () => (spinDrag = false));
  drawSpin();

  // ------------------------------------------------------------ fit
  let scale = 1;
  const fit = () => {
    if (phoneQuery.matches) {
      scale = 1;
      st.resize(canvas.clientWidth, canvas.clientHeight, Math.min(2, devicePixelRatio || 1));
      drawHist();
      return;
    }
    // clientWidth, not innerWidth: a phone browser grows innerWidth to fit a wide page, and the page would never shrink
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    scale = Math.min(vw / W, vh / H);
    app.style.transform = `translate(${(vw - W * scale) / 2}px, ${(vh - H * scale) / 2}px) scale(${scale})`;
    st.resize(W - LEFT - RIGHT, H - TOP - BOTTOM, Math.min(2, Math.max(0.75, (devicePixelRatio || 1) * scale)));
    drawHist();
  };

  // ------------------------------------------------------------ the spin
  let launchSeed = 1;
  let spinning = false;
  let result = null;
  const phaseOf = () => {
    if (aiming) return grabbed ? 'Throwing' : 'In your hand';
    if (result) return result.status === 'pocket' ? `At rest in ${SEQUENCE[result.pocket]}` : `Ended: ${result.status}`;
    const res = sim.result();
    if (Number.isNaN(res.tDrop)) return 'Rolling on the ball track';
    if (Number.isNaN(res.tRotor)) return 'Falling down the lower track';
    if (Number.isNaN(res.tPocket)) return 'Crossing onto the rotor';
    return 'Among the frets';
  };
  const tossArgs = (rotorPhase) => ({
    speed: toss.speed,
    direction: toss.direction,
    az: toss.az,
    vr: toss.vr,
    vz: toss.vz,
    inward: toss.inward / 1000,
    lift: toss.lift / 1000,
    rollFraction: toss.roll,
    spinR: toss.spinR,
    spinT: toss.spinT,
    sideSpin: toss.spinZ,
    rotorPhase,
    rotorSpeed: (toss.rotorRpm * 2 * Math.PI) / 60,
  });
  const spin = ({fresh = false} = {}) => {
    launchSeed++;
    const u = (k) => {
      const x = Math.sin(launchSeed * 127.1 + k * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    if (fresh) toss.az = 360 * u(2);
    aiming = false;
    grabbed = false;
    st.setPreview(null);
    meter.classList.remove('on');
    const a = tossArgs(360 * u(3));
    // a hand never quite repeats: half a percent of speed is plenty for a different number
    sim.launch({...a, speed: a.speed * (1 + 0.005 * (u(1) - 0.5)), orient: [u(6), u(7), u(8)]});
    result = null;
    spinning = true;
    numberEl.style.display = 'none';
    st.pose(sim.state(), {trailReset: true});
  };

  // ------------------------------------------------------------ throwing by hand
  // Pick the ball up, and it follows the pointer round the groove. Press and flick along the track: the pointer's real speed
  // over the wheel, measured over the last tenth of a second, is the ball's speed at release. So the hand sets all of it.
  const meter = el('div', 'meter', `<span></span> <b></b><div class="bar"><div class="zone"></div><div class="fill"></div></div>`);
  wheelBox.appendChild(meter);
  let aiming = false;
  let grabbed = false;
  let trace = [];
  let aimState = null;
  let lastPreview = 0;
  const previewSim = () => createSim(wheel);
  let pSim = null;
  const updatePreview = () => {
    if (!aiming) return;
    pSim = pSim ?? previewSim();
    pSim.launch(tossArgs(0));
    const pts = [];
    let n = 0;
    while (!pSim.done && pSim.time < 4 && pts.length < 1190) {
      pSim.advance();
      if (++n % 500 === 0) {
        const s = pSim.state();
        pts.push(s.x, s.y, s.z);
      }
    }
    st.setPreview(pts);
  };
  const placeAim = () => {
    pSim = pSim ?? previewSim();
    pSim.launch({...tossArgs(0), speed: 0, vr: 0, vz: 0, rollFraction: 0});
    aimState = {...pSim.state(), phi: sim.state().phi, wr: 0, wx: 0, wy: 0, wz: 0, t: sim.time};
  };
  const startAim = () => {
    aiming = true;
    grabbed = false;
    spinning = false;
    // a throw wants the whole track in sight
    if (view !== 'top') viewBtns.wheel.click();
    result = null;
    numberEl.style.display = 'none';
    pSim = null;
    placeAim();
    meter.classList.add('on');
    meter.querySelector('span').textContent = 'Move to the release point, press, flick along the track.';
    meter.querySelector('b').textContent = '';
    meter.querySelector('.fill').style.width = '0';
    st.pose(aimState, {trailReset: true});
    updatePreview();
  };
  const pointerOnTrack = (e) => st.pick(e.clientX, e.clientY, wheel.footZ + wheel.ball.R);
  const refreshToss = () => Object.values(fields).forEach((f) => f.show());
  const flickVelocity = () => {
    const now = performance.now();
    const recent = trace.filter((p) => now - p.t < 120);
    if (recent.length < 2) return null;
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.01) return null;
    return [(b.x - a.x) / dt, (b.y - a.y) / dt];
  };
  const showMeter = (speed) => {
    const tooSoft = speed < 1.2;
    const tooHard = speed > 4;
    meter.querySelector('span').textContent = tooSoft ? 'Too soft, it would not go round.' : tooHard ? 'Too hard, held at the limit.' : 'Good throw.';
    meter.querySelector('b').textContent = `${speed.toFixed(2)} m/s`;
    // the bar runs 0 to 5 m/s; the green zone is the 1.5 to 4 a croupier uses
    meter.querySelector('.fill').style.width = `${Math.min(100, (speed / 5) * 100)}%`;
  };

  const rebuild = () => {
    wheel = buildWheel(parameters());
    sim = createSim(wheel);
    pSim = null;
    st.setWheel(wheel, ballKey);
    for (const [k, b] of Object.entries(ballButtons)) b.classList.toggle('on', k === ballKey);
    const b = BALLS[ballKey];
    props.textContent = `${b.era}\n${b.diameter} mm  ${(wheel.ball.mass * 1000).toFixed(1)} g  E ${b.E} GPa\ne ${b.cor}  mu ${b.mu}  crr ${b.crr}`;
    updateChip();
    cancelBatch?.();
    cancelBatch = null;
    batch = null;
    drawHist();
    if (!spinning && !aiming) spin();
  };
  let rebuildTimer = 0;
  const scheduleRebuild = () => {
    updateChip();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuild();
      spin();
    }, 180);
  };
  const updateChip = () => {
    const n = activeCount();
    chip.classList.toggle('on', n > 0);
    chip.querySelector('span').textContent = n ? `As built: ${n} of ${items.length} deltas set` : `As designed: all ${items.length} deltas zero`;
    for (const [g, x] of Object.entries(groupEls)) {
      const c = x.ps.filter((p) => deltas[p.id]).length;
      x.count.textContent = c ? `${c} set` : `${x.ps.length}`;
      x.count.classList.toggle('on', c > 0);
      void g;
    }
  };

  // ------------------------------------------------------------ the batch
  let batch = null;
  let cancelBatch = null;
  // the batch throws this toss, with a hand's spread around it
  const scenario = () => ({
    name: 'page',
    seed: 1,
    values: ballPresetValues(ballKey),
    deltas: {...deltas},
    inputs: {
      'launch.speed': {dist: 'normal', mean: toss.speed, sd: 0.2, min: 1.2, max: 4},
      'launch.direction': {dist: 'fixed', value: toss.direction},
      'launch.vr': {dist: 'normal', mean: toss.vr, sd: 0.05},
      'launch.vz': {dist: 'normal', mean: toss.vz, sd: 0.03},
      'launch.inward': {dist: 'uniform', min: toss.inward / 1000, max: toss.inward / 1000 + 0.003},
      'launch.lift': {dist: 'uniform', min: toss.lift / 1000, max: toss.lift / 1000 + 0.003},
      'launch.spinR': {dist: 'normal', mean: toss.spinR, sd: 8},
      'launch.spinT': {dist: 'normal', mean: toss.spinT, sd: 8},
      'launch.sideSpin': {dist: 'normal', mean: toss.spinZ, sd: 10},
      'rotor.speed': {dist: 'normal', mean: (toss.rotorRpm * 2 * Math.PI) / 60, sd: 0.3, min: 0},
    },
  });
  batchBtn.onclick = () => {
    cancelBatch?.();
    batch = {counts: new Array(37).fill(0), done: 0, trials: 1000, invalid: 0, az: []};
    batchBtn.textContent = 'Running';
    cancelBatch = runBatch(scenario(), 1000, (u) => {
      batch = u;
      drawHist();
      if (u.finished) {
        batchBtn.textContent = u.error ? `Failed: ${u.error}` : 'Run 1,000 more on this build';
        cancelBatch = null;
      }
    });
    drawHist();
  };
  function drawHist() {
    const c = histCanvas;
    const phone = phoneQuery.matches;
    const cssW = phone ? c.clientWidth : W - LEFT - RIGHT - 262 - 24;
    const cssH = phone ? c.clientHeight : BOTTOM - 44;
    const pr = Math.min(2, (devicePixelRatio || 1) * scale);
    if (c.width !== Math.round(cssW * pr) || c.height !== Math.round(cssH * pr)) {
      c.width = Math.round(cssW * pr);
      c.height = Math.round(cssH * pr);
      if (!phone) c.style.height = `${cssH}px`;
    }
    const x = c.getContext('2d');
    x.setTransform(pr, 0, 0, pr, 0, 0);
    x.clearRect(0, 0, cssW, cssH);
    const n = batch ? batch.counts.reduce((a, b) => a + b, 0) : 0;
    const base = cssH - 16;
    const bw = cssW / 37;
    const peak = n ? Math.max(...batch.counts) / n : 1 / 37;
    const top = Math.max(peak * 1.15, (1 / 37) * 1.6);
    const y = (p) => base - (p / top) * (base - 6);
    for (let i = 0; i < 37; i++) {
      const num = SEQUENCE[i];
      x.fillStyle = num === 0 ? '#2e7d4f' : RED.has(num) ? '#a8322a' : '#23201c';
      const p = n ? batch.counts[i] / n : 0;
      x.fillRect(i * bw + 1, y(p), Math.max(1, bw - 2), base - y(p));
      x.fillStyle = '#6d6454';
      x.font = '9.5px "JetBrains Mono", monospace';
      x.textAlign = 'center';
      x.fillText(String(num), i * bw + bw / 2, base + 12);
    }
    // the fair line
    x.strokeStyle = ACCENT;
    x.setLineDash([4, 3]);
    x.beginPath();
    x.moveTo(0, y(1 / 37));
    x.lineTo(cssW, y(1 / 37));
    x.stroke();
    x.setLineDash([]);
    if (!batch) {
      histTitle.textContent = 'Numbers hit';
      histNote.textContent = `Run a batch on this build. The dashed line is a fair wheel, 1 in 37.`;
    } else {
      const g = chiSquareGof(batch.counts, new Array(37).fill(1 / 37));
      const c2 = batch.az.length ? circular(batch.az) : null;
      histTitle.textContent = `${n.toLocaleString('en-US')} of ${batch.trials.toLocaleString('en-US')} trials`;
      const mde = n ? minDetectableShift(n, 1 / 37) : 0;
      histNote.textContent = n
        ? `Fairness p ${g.p < 0.001 ? '< 0.001' : g.p.toFixed(3)}. Can only see a number off by ${(mde * 100).toFixed(0)}% or more. Leaves the wall: R ${c2 ? c2.rBar.toFixed(2) : '-'} at ${c2 ? c2.meanDeg.toFixed(0) : '-'}°.${batch.invalid ? ` ${batch.invalid} invalid.` : ''}`
        : 'Starting workers';
    }
  }

  // ------------------------------------------------------------ orbit and hand-over
  let lastInput = -Infinity;
  let wall = 0;
  const touched = () => (lastInput = wall);
  ['pointerdown', 'wheel', 'keydown'].forEach((t) => addEventListener(t, touched, {passive: true}));
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (aiming) {
      grabbed = true;
      trace = [];
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    drag = {x: e.clientX, y: e.clientY, az: off.az, el: off.el};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (aiming) {
      const p = pointerOnTrack(e);
      if (!p) return;
      if (grabbed) {
        trace.push({t: performance.now(), x: p[0], y: p[1]});
        const v = flickVelocity();
        if (v) {
          const a = (toss.az * Math.PI) / 180;
          const vt = -v[0] * Math.sin(a) + v[1] * Math.cos(a);
          const vr = v[0] * Math.cos(a) + v[1] * Math.sin(a);
          showMeter(Math.abs(vt));
          toss.speed = Math.min(4, Math.max(1.2, Math.abs(vt)));
          toss.direction = vt >= 0 ? 1 : -1;
          // a pointer is sloppier than a hand across the track, so only a fifth of its radial speed counts
          toss.vr = Math.min(0.4, Math.max(-0.3, 0.2 * vr));
        }
      } else {
        toss.az = (Math.atan2(p[1], p[0]) * 180) / Math.PI;
        placeAim();
        st.pose(aimState);
      }
      if (performance.now() - lastPreview > 90) {
        lastPreview = performance.now();
        updatePreview();
      }
      return;
    }
    if (!drag) return;
    off.az = drag.az - (e.clientX - drag.x) * 0.006 / scale;
    off.el = drag.el + (e.clientY - drag.y) * 0.004 / scale;
  });
  canvas.addEventListener('pointerup', () => {
    if (!aiming || !grabbed) return;
    grabbed = false;
    const v = flickVelocity();
    const speed = v ? Math.abs(-v[0] * Math.sin((toss.az * Math.PI) / 180) + v[1] * Math.cos((toss.az * Math.PI) / 180)) : 0;
    if (speed < 0.5) {
      meter.querySelector('span').textContent = 'That was a set-down, not a throw. Flick along the track.';
      meter.querySelector('b').textContent = '';
      return;
    }
    refreshToss();
    fields.speed.input.value = toss.speed;
    fields.vr.input.value = toss.vr;
    spin();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    off.k = Math.min(2.5, Math.max(0.3, off.k * Math.exp(e.deltaY * 0.001)));
  }, {passive: false});
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') {
      e.preventDefault();
      spin();
    }
    if (e.key === 't' || e.key === 'T') startAim();
    if (e.key === 'Escape' && aiming) spin();
    const k = Object.keys(VIEWS)[Number(e.key) - 1];
    if (k) viewBtns[k].click();
  });

  // ------------------------------------------------------------ the loop
  let lastNow = 0;
  let restAt = -Infinity;
  const tour = {at: 0, step: 0};
  const TOUR = ['wheel', 'follow', 'pockets', 'top', 'track'];
  const frame = (now) => {
    const dtw = Math.min(0.05, (now - lastNow) / 1000 || 0);
    lastNow = now;
    wall += dtw;
    if (spinning) {
      // one real second of physics is about 15 ms of work, so this keeps up on anything
      const target = sim.time + dtw;
      const limit = performance.now() + 12;
      let steps = 0;
      while (!sim.done && sim.time < target) {
        sim.advance();
        if (++steps % 256 === 0 && performance.now() > limit) break;
      }
      if (sim.done || sim.time > 240) {
        spinning = false;
        result = sim.result(240);
        restAt = wall;
        if (result.status === 'pocket') {
          const n = SEQUENCE[result.pocket];
          numberEl.style.display = '';
          numberEl.style.background = n === 0 ? '#2e7d4f' : RED.has(n) ? '#a8322a' : '#23201c';
          numberEl.querySelector('span').textContent = n;
          numberEl.querySelector('small').textContent = n === 0 ? 'ZERO' : RED.has(n) ? 'RED' : 'BLACK';
        }
      }
    }
    const s = aiming && aimState ? aimState : sim.state();
    if (!spinning && result) {
      // the rotor carries the ball on after it rests
      s.wx = s.wy = s.wz = 0;
    }
    st.pose(s);

    const idle = wall - lastInput > IDLE && !aiming;
    if (idle) {
      if (!spinning && wall - restAt > 3) spin({fresh: true});
      if (wall - tour.at > 9) {
        tour.at = wall;
        tour.step = (tour.step + 1) % TOUR.length;
        const k = TOUR[tour.step];
        view = k;
        off.az = 0;
        off.el = 0;
        off.k = 1;
        for (const [n, x] of Object.entries(viewBtns)) x.classList.toggle('on', n === k);
      }
    }
    toast.classList.toggle('tour', idle);
    toast.querySelector('span').textContent = phoneQuery.matches
      ? (idle ? 'Touring. Tap to take over.' : aiming ? 'Flick along the track, or Repeat to let the panel throw.' : 'Drag to orbit. Throw and Repeat are below.')
      : idle ? 'Touring. Click or press a key to take over.' : aiming ? 'Press T again to re-grip, Esc to let the panel throw.' : 'Drag to orbit, wheel to zoom, T to throw, space to repeat.';

    const target = VIEWS[view];
    const bp = st.ballPosition();
    const tx = target.follow ? bp.x : target.tx;
    const ty = target.follow ? bp.y : target.ty;
    const tz = target.follow ? bp.z : target.tz;
    const k = 1 - Math.exp(-dtw * 3.5);
    cam.az += (target.az + off.az + (idle ? wall * 0.03 : 0) - cam.az) * k;
    cam.el += (Math.min(1.54, Math.max(0.12, target.el + off.el)) - cam.el) * k;
    cam.dist += (target.dist * off.k - cam.dist) * k;
    cam.tx += (tx - cam.tx) * k;
    cam.ty += (ty - cam.ty) * k;
    cam.tz += (tz - cam.tz) * k;
    st.setCamera(cam);
    st.render();

    phaseEl.textContent = phaseOf();
    const res = sim.result();
    statEl.t.textContent = `${s.t.toFixed(1)} s`;
    statEl.v.textContent = `${fmt(Math.hypot(s.vx, s.vy, s.vz))} m/s`;
    statEl.w.textContent = `${fmt(Math.hypot(s.wx, s.wy, s.wz) / (2 * Math.PI), 1)} rev/s`;
    statEl.r.textContent = `${fmt((s.wr * 60) / (2 * Math.PI), 1)} rpm`;
    statEl.f.textContent = res.hitsFret;
    statEl.d.textContent = res.hitsDeflector;
    window.__WHEEL_READY = true;
    requestAnimationFrame(frame);
  };

  // anything the review scripts need
  window.__ROULETTE = {
    setDelta: (id, v) => {
      if (v) deltas[id] = v;
      else delete deltas[id];
      rebuild();
    },
    setView: (k) => viewBtns[k].click(),
    aim: startAim,
    toss,
    showTab,
    state: () => ({...sim.state(), result: sim.result(), spinning, batch}),
    openGroup: (g) => (groupEls[g].details.open = true),
    highlight: (h) => st.setHighlight(h),
    fastForward: (seconds) => {
      const end = sim.time + seconds;
      while (!sim.done && sim.time < end) sim.advance();
    },
  };

  addEventListener('resize', fit);
  phoneQuery.addEventListener('change', () => {
    app.style.transform = '';
    histCanvas.style.height = '';
    fit();
  });
  rebuild();
  fit();
  requestAnimationFrame(frame);
}
