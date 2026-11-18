// Small DOM helpers, number/time formatting and the shared tooltip.
// Everything that comes from the data is inserted as text, never as HTML.

function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  add(el, kids);
  return el;
}

// Like replaceChildren, but flattens arrays and skips null/false.
export function fill(el, ...kids) {
  el.replaceChildren();
  add(el, kids);
  return el;
}

export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  add(el, kids);
  return el;
}

/* ------------------------------ formatting ------------------------------ */

const NF = new Intl.NumberFormat('en-GB');
export const fmt = (n) => NF.format(Math.round(n || 0));

const trim = (x) => (x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));
export function compact(n) {
  n = Math.round(n || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e3) return trim(n / 1e3) + 'K';
  return String(n);
}

export function ago(t) {
  const d = Math.max(0, Date.now() / 1000 - t);
  if (d < 90) return 'just now';
  if (d < 5400) return Math.round(d / 60) + ' min ago';
  if (d < 129600) return Math.round(d / 3600) + ' hours ago';
  if (d < 86400 * 45) return Math.round(d / 86400) + ' days ago';
  return new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const whenFull = (t) =>
  new Date(t * 1000).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const dateShort = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const dateLong = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* ------------------------------ controls -------------------------------- */

export function segmented(label, options, value, onChange) {
  const btns = options.map(([v, text]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { set(v); onChange(v); } }, text));
  function set(v) { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === v))); }
  return h('div', { class: 'seg', role: 'group', 'aria-label': label }, btns);
}

// options: [[value, text] | { group, options: [[value, text]] }]
export function select(label, options, value, onChange) {
  const opt = ([v, t]) => h('option', { value: v, selected: v === value }, t);
  const sel = h('select', { onchange: (e) => onChange(e.target.value) },
    options.map((o) => (Array.isArray(o) ? opt(o) : h('optgroup', { label: o.group }, o.options.map(opt)))));
  return h('label', { class: 'field' }, h('span', null, label), sel);
}

/* -------------------------------- tooltip -------------------------------- */

const tipEl = () => document.getElementById('tip');
export const tip = {
  show(nodes, x, y) {
    const el = tipEl();
    el.replaceChildren(...nodes);
    el.hidden = false;
    const r = el.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, top) + 'px';
  },
  hide() { tipEl().hidden = true; },
};
