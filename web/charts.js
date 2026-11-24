// Hand-rolled SVG charts: a bar chart and a line chart with hover/keyboard tooltips,
// wrapped in a card that can also show the same numbers as a table.
import { h, svg, fmt, compact, tip, dateShort } from './ui.js';

function niceTicks(min, max, n = 4) {
  if (max <= min) max = min + 1;
  const step0 = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function responsive(box, draw) {
  let last = 0;
  const ro = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0].contentRect.width);
    if (w > 0 && w !== last) { last = w; box.replaceChildren(draw(w)); }
  });
  ro.observe(box);
}

/* -------------------------------- bar chart ------------------------------- */
// rows: [{ label, value, tip: () => [nodes], aria }]
export function barChart(box, rows, { height = 220, aria = 'Bar chart' } = {}) {
  responsive(box, (W) => {
    const m = { l: 52, r: 8, t: 10, b: 28 }, H = height;
    const pw = W - m.l - m.r, ph = H - m.t - m.b, y0 = m.t + ph;
    const ticks = niceTicks(0, Math.max(1, ...rows.map((r) => r.value)), 4);
    const top = ticks[ticks.length - 1];
    const y = (v) => y0 - (v / top) * ph;
    const tl = top < 10000 ? fmt : compact;
    const band = pw / rows.length, bw = Math.max(2, Math.min(24, band - 4));
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': aria });

    for (const v of ticks) {
      root.append(svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
        svg('text', { class: 'tick', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, tl(v)));
    }
    const step = Math.ceil(rows.length / Math.max(1, Math.floor(pw / 58)));
    rows.forEach((r, i) => {
      if (i % step === 0) root.append(svg('text', { class: 'tick', x: m.l + band * (i + 0.5), y: H - 8, 'text-anchor': 'middle' }, r.label));
    });

    rows.forEach((r, i) => {
      const cx = m.l + band * (i + 0.5), x = cx - bw / 2, hh = (r.value / top) * ph;
      let bar = null;
      if (hh > 0) {
        const rad = Math.min(4, hh, bw / 2), yt = y0 - hh;
        bar = svg('path', { class: 'bar', d: `M${x},${y0} V${yt + rad} Q${x},${yt} ${x + rad},${yt} H${x + bw - rad} Q${x + bw},${yt} ${x + bw},${yt + rad} V${y0} Z` });
        root.append(bar);
      }
      const hit = svg('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ph, tabindex: 0, 'aria-label': r.aria || r.label });
      const on = (px, py) => { bar?.classList.add('hot'); tip.show(r.tip(), px, py); };
      const off = () => { bar?.classList.remove('hot'); tip.hide(); };
      hit.addEventListener('pointermove', (e) => on(e.clientX, e.clientY));
      hit.addEventListener('pointerleave', off);
      hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); on(b.left + b.width / 2, b.top + 20); });
      hit.addEventListener('blur', off);
      root.append(hit);
    });
    return root;
  });
}

/* -------------------------------- line chart ------------------------------ */
// points: [{ t, v, tip: () => [nodes], aria }] sorted by time ascending
// trend (optional): [{ t, v }] drawn as a line; the points are then drawn as dots only, and the
// scale ignores the most extreme 2% of points so one silly sale cannot flatten the chart
// (those are pinned to the top edge and drawn hollow).
export function lineChart(box, points, { height = 260, aria = 'Line chart', trend = null } = {}) {
  responsive(box, (W) => {
    const m = { l: 56, r: 18, t: 14, b: 30 }, H = height;
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let t0 = points[0].t, t1 = points[points.length - 1].t;
    if (t1 - t0 < 3600) { t0 -= 43200; t1 += 43200; }
    const padT = (t1 - t0) * 0.03; t0 -= padT; t1 += padT;
    const vs = points.map((p) => p.v);
    let lo = vs.reduce((a, b) => Math.min(a, b)), hi = vs.reduce((a, b) => Math.max(a, b));
    if (trend && points.length >= 20) {
      const sorted = [...vs].sort((a, b) => a - b);
      hi = Math.max(sorted[Math.floor(sorted.length * 0.98)], ...trend.map((p) => p.v));
    }
    const pad = lo === hi ? Math.max(1, lo * 0.1) : (hi - lo) * 0.08;
    const ticks = niceTicks(Math.max(0, lo - pad), hi + pad, 4);
    const vMin = ticks[0], vMax = ticks[ticks.length - 1];
    const X = (t) => m.l + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v) => m.t + ph - ((Math.min(v, vMax) - vMin) / (vMax - vMin)) * ph;
    const tl = vMax < 10000 ? fmt : compact;

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': aria });
    for (const v of ticks) {
      root.append(svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }),
        svg('text', { class: 'tick', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, tl(v)));
    }
    const nx = Math.max(2, Math.floor(pw / 96));
    const shortSpan = t1 - t0 < 2 * 86400;
    for (let i = 0; i < nx; i++) {
      const t = t0 + ((t1 - t0) * (i + 0.5)) / nx;
      const label = shortSpan
        ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : dateShort(t);
      root.append(svg('text', { class: 'tick', x: X(t), y: H - 8, 'text-anchor': 'middle' }, label));
    }
    const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
    if (trend) {
      for (const p of points) root.append(svg('circle', { class: p.v > vMax ? 'dot over' : 'dot', cx: X(p.t), cy: Y(p.v), r: points.length > 300 ? 2.5 : 3.5 }));
      if (trend.length > 1) root.append(svg('path', { class: 'trend', d: path(trend) }));
    } else {
      if (points.length > 1) root.append(svg('path', { class: 'line', d: path(points) }));
      for (const p of points) root.append(svg('circle', { class: 'dot', cx: X(p.t), cy: Y(p.v), r: 4 }));
    }

    const cross = svg('line', { class: 'cross', y1: m.t, y2: m.t + ph, visibility: 'hidden' });
    const ring = svg('circle', { class: 'ring', r: 7, visibility: 'hidden' });
    root.append(cross, ring);

    let idx = -1;
    const focusOn = (i, px, py) => {
      idx = i;
      const p = points[i], x = X(p.t), y = Y(p.v);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('visibility', 'visible');
      if (px == null) { const b = root.getBoundingClientRect(); px = b.left + x; py = b.top + y; }
      tip.show(p.tip(), px, py);
    };
    const clear = () => { idx = -1; cross.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); tip.hide(); };
    const nearest = (clientX) => {
      const b = root.getBoundingClientRect();
      const t = t0 + ((clientX - b.left - m.l) / pw) * (t1 - t0);
      let best = 0;
      for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
      return best;
    };
    const overlay = svg('rect', { class: 'hit', x: m.l, y: m.t, width: pw, height: ph });
    overlay.addEventListener('pointermove', (e) => focusOn(nearest(e.clientX), e.clientX, e.clientY));
    overlay.addEventListener('pointerleave', clear);
    root.append(overlay);

    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = idx < 0 ? points.length - 1 : Math.min(points.length - 1, Math.max(0, idx + (e.key === 'ArrowRight' ? 1 : -1)));
      focusOn(next);
    });
    root.addEventListener('blur', clear);
    return root;
  });
}

/* ------------------------------- chart card ------------------------------- */
// draw(box) paints the chart into box. columns/rows describe the table version of the same data.
export function chartCard({ title, sub, controls, draw, columns, rows, legend }) {
  const box = h('div', { class: 'chart-box' });
  const tableBox = h('div', { class: 'chart-table', hidden: true },
    h('table', { class: 'plain' },
      h('thead', null, h('tr', null, columns.map((c, i) => h('th', { class: i === columns.length - 1 && /gil|price/i.test(c) ? 'num' : '' }, c)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: typeof c === 'string' && /^[\d,.]+[KMB]?$/.test(c) ? 'num' : '' }, c)))))));
  const toggle = h('button', {
    type: 'button', class: 'btn-quiet', 'aria-pressed': 'false',
    onclick: () => {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      toggle.textContent = on ? 'Show chart' : 'Show as table';
      box.hidden = on; tableBox.hidden = !on;
    },
  }, 'Show as table');
  draw(box);
  return h('section', { class: 'panel chart' },
    h('div', { class: 'chart-head' },
      h('div', null, h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null, legend || null),
      h('div', { class: 'chart-tools' }, controls, toggle)),
    box, tableBox);
}
