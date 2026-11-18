import { h, fill, fmt, compact, ago, whenFull, dateShort, dateLong, segmented, select, tip } from './ui.js';
import { state, qty, cutoff, median, RANGES } from './data.js';
import { barChart, lineChart, chartCard } from './charts.js';

/* ------------------------------ link helpers ------------------------------ */

const hrefItem = (id) => `#/item/${id}`;
const hrefPlayer = (n) => `#/player/${encodeURIComponent(n)}`;
const hrefSales = (p) => '#/sales?' + new URLSearchParams(p).toString();

const itemLink = (item) => h('a', { class: 'item-link', href: hrefItem(item.id) }, item.name);
const playerLink = (name) => (name ? h('a', { class: 'player-link', href: hrefPlayer(name) }, name) : h('span', { class: 'muted' }, 'Unknown'));
const stackBadge = (s) => (s.stack ? h('span', { class: 'badge', title: 'Sold as a full stack' }, `Stack ×${qty(s)}`) : null);
const catName = (id) => { const c = state.catLabel.get(id); return c ? `${c.group}, ${c.name}` : 'Uncategorised'; };

/* --------------------------------- URL state -------------------------------- */

function writeParams(route, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v);
  const s = q.toString();
  history.replaceState(null, '', '#/' + route + (s ? '?' + s : ''));
}

const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ------------------------------ shared pieces ------------------------------ */

function statStrip(stats) {
  return h('div', { class: 'strip panel' }, stats.map((s) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, s.label), h('span', { class: 'stat-value' }, s.value), s.sub ? h('span', { class: 'stat-sub' }, s.sub) : null)));
}

function empty(title, body) {
  return h('div', { class: 'empty' }, h('h3', null, title), body ? h('p', null, body) : null);
}

function pageHead(title, sub, crumb) {
  return h('header', { class: 'page-head' }, crumb || null, h('h1', null, title), sub ? h('p', { class: 'lede' }, sub) : null);
}

// A list of rows with a thin proportional bar under each.
function barList(rows) {
  if (!rows.length) return empty('Nothing here yet');
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('ul', { class: 'barlist' }, rows.map((r) =>
    h('li', null,
      h('div', { class: 'barlist-row' },
        h('div', { class: 'barlist-name' }, r.name, r.sub ? h('span', { class: 'muted small' }, r.sub) : null),
        h('div', { class: 'barlist-val' }, r.valueText)),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.max(2, (r.value / max) * 100)}%` })))));
}

export function salesTable(rows, { hide = [] } = {}) {
  const cols = ['when', 'item', 'price', 'seller', 'buyer'].filter((c) => !hide.includes(c));
  const label = { when: 'When', item: 'Item', price: 'Price (gil)', seller: 'Seller', buyer: 'Buyer' };
  const cell = {
    when: (s) => h('td', { class: 'when' }, h('time', { title: whenFull(s.t), datetime: new Date(s.t * 1000).toISOString() }, ago(s.t))),
    item: (s) => h('td', { class: 'item' }, itemLink(s.item), ' ', stackBadge(s)),
    price: (s) => h('td', { class: 'num price' }, fmt(s.price)),
    seller: (s) => h('td', { class: 'seller' }, playerLink(s.seller)),
    buyer: (s) => h('td', { class: 'buyer' }, playerLink(s.buyer)),
  };
  return h('table', { class: 'sales' },
    h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c === 'price' ? 'num' : '' }, label[c])))),
    h('tbody', null, rows.map((s) => h('tr', null, cols.map((c) => cell[c](s))))));
}

/* ---------------------------------- omnibox --------------------------------- */

let omniId = 0;
export function omnibox({ placeholder, kinds = ['item', 'player', 'sales'], value = '', big = false, autofocus = false, button = 'Search sales' }) {
  const id = 'omni-' + ++omniId;
  const input = h('input', {
    type: 'search', class: 'omni-input', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list',
    autocomplete: 'off', spellcheck: 'false', placeholder, 'aria-label': placeholder, value, autofocus,
  });
  const list = h('ul', { id, class: 'suggest', role: 'listbox', hidden: true });
  let opts = [], active = -1;

  const go = (o) => { list.hidden = true; if (o) o.go(); };

  function compute(q) {
    const ql = q.trim().toLowerCase();
    opts = [];
    if (!ql) return;
    if (kinds.includes('item')) {
      const hits = state.items.filter((i) => i.lname.includes(ql))
        .sort((a, b) => (b.lname.startsWith(ql) - a.lname.startsWith(ql)) || (b.c7 - a.c7) || a.lname.localeCompare(b.lname)).slice(0, 5);
      if (hits.length) opts.push({ head: 'Items' });
      for (const i of hits) opts.push({ label: i.name, sub: catName(i.cat), go: () => (location.hash = hrefItem(i.id)) });
    }
    if (kinds.includes('player')) {
      const hits = [...state.players.values()].filter((p) => p.name.toLowerCase().includes(ql))
        .sort((a, b) => (b.name.toLowerCase().startsWith(ql) - a.name.toLowerCase().startsWith(ql)) || (b.bought.length + b.sold.length) - (a.bought.length + a.sold.length)).slice(0, 5);
      if (hits.length) opts.push({ head: 'Characters' });
      for (const p of hits) opts.push({ label: p.name, sub: `${p.bought.length + p.sold.length} sales`, go: () => (location.hash = hrefPlayer(p.name)) });
    }
    if (kinds.includes('sales')) {
      opts.push({ head: 'Sales' });
      opts.push({ label: `Search sales for “${q.trim()}”`, go: () => (location.hash = hrefSales({ q: q.trim() })) });
    }
  }

  function render() {
    list.replaceChildren(...opts.map((o, i) => o.head
      ? h('li', { class: 'suggest-head', role: 'presentation' }, o.head)
      : h('li', { role: 'option', id: `${id}-${i}`, class: i === active ? 'on' : '', 'aria-selected': String(i === active), onpointerdown: (e) => { e.preventDefault(); go(o); } },
        h('span', null, o.label), o.sub ? h('span', { class: 'muted small' }, o.sub) : null)));
    const open = opts.length > 0 && document.activeElement === input;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  const selectable = () => opts.map((o, i) => (o.head ? -1 : i)).filter((i) => i >= 0);

  input.addEventListener('input', () => { compute(input.value); active = -1; render(); });
  input.addEventListener('focus', () => { if (input.value) { compute(input.value); render(); } });
  input.addEventListener('blur', () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); });
  input.addEventListener('keydown', (e) => {
    const sel = selectable();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!sel.length) return;
      e.preventDefault();
      const pos = sel.indexOf(active);
      active = sel[(pos + (e.key === 'ArrowDown' ? 1 : -1) + sel.length) % sel.length];
      render();
    } else if (e.key === 'Escape') { list.hidden = true; }
  });

  const form = h('form', { class: 'omni' + (big ? ' big' : ''), role: 'search', onsubmit: (e) => {
    e.preventDefault();
    compute(input.value);
    const sel = selectable();
    if (active >= 0) return go(opts[active]);
    if (kinds.length === 1 && kinds[0] === 'player') return sel.length ? go(opts[sel[0]]) : input.setCustomValidity('');
    if (kinds.includes('sales') && input.value.trim()) return go(opts[opts.length - 1]);
    if (sel.length) go(opts[sel[0]]);
  } },
  h('div', { class: 'omni-wrap' }, input, list),
  button ? h('button', { type: 'submit', class: 'btn' }, button) : null);
  return form;
}

/* --------------------------------- overview --------------------------------- */

export function overview(root) {
  const now = Date.now() / 1000;
  const day = state.sales.filter((s) => s.t > now - 86400);
  const week = state.sales.filter((s) => s.t > now - 7 * 86400);
  const gil = (a) => a.reduce((n, s) => n + s.price, 0);
  const people = new Set();
  for (const s of week) { if (s.seller) people.add(s.seller.toLowerCase()); if (s.buyer) people.add(s.buyer.toLowerCase()); }
  const listed = state.items.filter((i) => i.stockS > 0 || i.stockK > 0);

  root.append(
    h('section', { class: 'hero' },
      h('h1', null, 'Search auction house sales'),
      h('p', { class: 'lede' }, 'Find what an item sold for, or see everything a character has bought and sold.'),
      omnibox({ placeholder: 'Search an item, a buyer or a seller', big: true, autofocus: true })),
    statStrip([
      { label: 'Sales in the last day', value: fmt(day.length), sub: `${compact(gil(day))} gil` },
      { label: 'Gil traded this week', value: compact(gil(week)), sub: `${fmt(week.length)} sales` },
      { label: 'Items for sale now', value: fmt(listed.length), sub: `${fmt(listed.reduce((n, i) => n + i.stockS, 0))} singles, ${fmt(listed.reduce((n, i) => n + i.stockK, 0))} stacks` },
      { label: 'Characters trading this week', value: fmt(people.size), sub: `${state.players.size} seen in ${state.meta.retainDays} days` },
    ]));

  if (!state.sales.length) {
    root.append(empty('No sales recorded yet', 'The first collection run has not found any sales. Check back after the next scheduled update.'));
    return;
  }

  // Gil traded per day, last 14 local days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const start = d.getTime() / 1000;
    days.push({ start, end: start + 86400, value: 0, count: 0 });
  }
  for (const s of state.sales) {
    const d = days.find((x) => s.t >= x.start && s.t < x.end);
    if (d) { d.value += s.price; d.count++; }
  }
  const dayRows = days.map((d) => ({
    label: dateShort(d.start), value: d.value, count: d.count,
    aria: `${dateShort(d.start)}: ${fmt(d.value)} gil from ${d.count} sales`,
    tip: () => [h('strong', null, `${fmt(d.value)} gil`), h('span', null, new Date(d.start * 1000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })), h('span', null, `${fmt(d.count)} sales`)],
  }));

  const biggest = [...week].sort((a, b) => b.price - a.price).slice(0, 6);
  root.append(h('div', { class: 'split' },
    chartCard({
      title: 'Gil traded per day', sub: 'Last 14 days, all items',
      draw: (box) => barChart(box, dayRows, { height: 290, aria: 'Gil traded per day for the last 14 days' }),
      columns: ['Day', 'Sales', 'Gil'],
      rows: dayRows.map((r) => [r.label, fmt(r.count), fmt(r.value)]),
    }),
    h('section', null,
      h('h2', null, 'Biggest sales this week'),
      biggest.length ? h('ul', { class: 'sale-list' }, biggest.map((s) =>
        h('li', null,
          h('div', null, itemLink(s.item), ' ', stackBadge(s), h('div', { class: 'muted small' }, playerLink(s.seller), ' sold to ', playerLink(s.buyer))),
          h('div', { class: 'sale-price' }, fmt(s.price), h('div', { class: 'muted small' }, ago(s.t)))))) : empty('No sales this week'))));

  const hot = [...state.items].filter((i) => i.v7 > 0).sort((a, b) => b.v7 - a.v7).slice(0, 8);
  const agg = (key) => {
    const m = new Map();
    for (const s of week) { const n = s[key]; if (!n) continue; const r = m.get(n.toLowerCase()) || { name: n, gil: 0, n: 0 }; r.gil += s.price; r.n++; m.set(n.toLowerCase(), r); }
    return [...m.values()].sort((a, b) => b.gil - a.gil).slice(0, 6);
  };
  root.append(h('div', { class: 'cols-3' },
    h('section', null, h('h2', null, 'Busiest items this week'),
      barList(hot.map((i) => ({ name: h('a', { class: 'item-link', href: hrefItem(i.id) }, i.name), sub: `${fmt(i.c7)} sold`, value: i.v7, valueText: compact(i.v7) })))),
    h('section', null, h('h2', null, 'Top buyers this week'),
      barList(agg('buyer').map((p) => ({ name: playerLink(p.name), sub: `${fmt(p.n)} bought`, value: p.gil, valueText: compact(p.gil) })))),
    h('section', null, h('h2', null, 'Top sellers this week'),
      barList(agg('seller').map((p) => ({ name: playerLink(p.name), sub: `${fmt(p.n)} sold`, value: p.gil, valueText: compact(p.gil) }))))));

  root.append(h('section', { class: 'latest' },
    h('div', { class: 'row-between' }, h('h2', null, 'Latest sales'), h('a', { class: 'more', href: '#/sales' }, 'All sales')),
    salesTable(state.sales.slice(0, 8))));
}

// Secondary filters: always open on desktop, collapsible on phones.
function moreFilters(...kids) {
  const d = h('details', { class: 'more-filters' }, h('summary', { class: 'btn-quiet' }, 'More filters'), h('div', { class: 'filters-more' }, kids));
  d.open = window.matchMedia('(min-width: 721px)').matches;
  return d;
}

/* ---------------------------------- sales ----------------------------------- */

function parseQuery(q) {
  const terms = [];
  const rest = q.replace(/\b(item|buyer|seller|player):("([^"]+)"|(\S+))/gi, (_, f, __, quoted, bare) => {
    terms.push({ f: f.toLowerCase(), v: (quoted || bare).toLowerCase(), exact: quoted != null });
    return ' ';
  });
  return { terms, rest: rest.trim().toLowerCase() };
}

const matcher = (field, v, exact) => {
  const eq = (a) => (exact ? a === v : a.includes(v));
  switch (field) {
    case 'item': return (s) => eq(s.item.lname);
    case 'buyer': return (s) => eq(s.lbuyer);
    case 'seller': return (s) => eq(s.lseller);
    case 'player': return (s) => eq(s.lbuyer) || eq(s.lseller);
    default: return (s) => eq(s.item.lname) || eq(s.lbuyer) || eq(s.lseller);
  }
};

export function filterSales(f) {
  const since = cutoff(f.range);
  const { terms, rest } = parseQuery(f.q);
  const tests = terms.map((t) => matcher(t.f, t.v, t.exact));
  if (rest) tests.push(matcher(f.in, rest, false));
  const min = Number(f.min) || 0;
  const cat = f.cat ? Number(f.cat) : 0;
  const rows = state.sales.filter((s) =>
    s.t >= since && (!min || s.price >= min) && (!cat || s.item.cat === cat) &&
    (f.kind === 'single' ? !s.stack : f.kind === 'stack' ? s.stack : true) && tests.every((t) => t(s)));
  const sorts = { new: (a, b) => b.t - a.t, old: (a, b) => a.t - b.t, high: (a, b) => b.price - a.price, low: (a, b) => a.price - b.price };
  return rows.sort(sorts[f.sort] || sorts.new);
}

const catOptions = () => [['', 'All categories'], ...state.cats.map((g) => ({ group: g.group, options: g.cats.map((c) => [String(c.id), c.name]) }))];

export function salesView(root, p) {
  const f = { q: p.q || '', in: p.in || 'all', range: p.range || 'all', cat: p.cat || '', kind: p.kind || '', min: p.min || '', sort: p.sort || 'new', n: 50 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const update = (resetPage = true) => {
    if (resetPage) f.n = 50;
    const { n, ...rest } = f;
    writeParams('sales', { q: rest.q, in: rest.in === 'all' ? '' : rest.in, range: rest.range === 'all' ? '' : rest.range, cat: rest.cat, kind: rest.kind, min: rest.min, sort: rest.sort === 'new' ? '' : rest.sort });
    const rows = filterSales(f);
    const total = rows.reduce((a, s) => a + s.price, 0);
    const keys = new Set(rows.map((s) => `${s.id}:${s.stack}`));
    fill(results,
      h('p', { class: 'summary' },
        h('strong', null, `${fmt(rows.length)} ${rows.length === 1 ? 'sale' : 'sales'}`),
        rows.length ? h('span', null, `${compact(total)} gil in total`) : null,
        rows.length && keys.size === 1 ? h('span', null, `median ${fmt(median(rows.map((s) => s.price)))} gil`) : null),
      rows.length
        ? [salesTable(rows.slice(0, f.n)),
          rows.length > f.n ? h('button', { type: 'button', class: 'btn-quiet more-btn', onclick: () => { f.n += 100; update(false); } }, `Show more (${fmt(rows.length - f.n)} left)`) : null]
        : empty('No sales match', 'Try a shorter name, widen the time range, or search in “Anything”.'));
  };
  const typed = debounce(update, 100);

  const qInput = h('input', { type: 'search', class: 'omni-input', placeholder: 'Item, buyer or seller', 'aria-label': 'Search sales', value: f.q, autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => { f.q = e.target.value; typed(); } });

  root.append(
    pageHead('Sales', `Everything the auction house has recorded in the last ${state.meta.retainDays} days.`),
    h('div', { class: 'filters' },
      h('div', { class: 'filters-main' },
        qInput,
        select('Search in', [['all', 'Anything'], ['item', 'Item'], ['player', 'Buyer or seller'], ['buyer', 'Buyer'], ['seller', 'Seller']], f.in, (v) => { f.in = v; update(); })),
      moreFilters(
        segmented('Time range', [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']], f.range, (v) => { f.range = v; update(); }),
        select('Category', catOptions(), f.cat, (v) => { f.cat = v; update(); }),
        select('Quantity', [['', 'Any quantity'], ['single', 'Singles'], ['stack', 'Stacks']], f.kind, (v) => { f.kind = v; update(); }),
        h('label', { class: 'field' }, h('span', null, 'Minimum price'), h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', placeholder: '0', value: f.min, oninput: (e) => { f.min = e.target.value; typed(); } })),
        select('Sort', [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest price'], ['low', 'Lowest price']], f.sort, (v) => { f.sort = v; update(); }))),
    results);
  update();
}

/* ----------------------------------- items ---------------------------------- */

export function itemsView(root, p) {
  const f = { q: p.q || '', cat: p.cat || '', stock: p.stock === '1', sold: p.sold === '1', sort: p.sort || 'name', n: 100 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const sorts = {
    name: (a, b) => a.lname.localeCompare(b.lname),
    stock: (a, b) => (b.stockS + b.stockK) - (a.stockS + a.stockK) || a.lname.localeCompare(b.lname),
    price: (a, b) => (b.lastS || b.lastK) - (a.lastS || a.lastK) || a.lname.localeCompare(b.lname),
    week: (a, b) => b.v7 - a.v7 || a.lname.localeCompare(b.lname),
  };
  const update = (reset = true) => {
    if (reset) f.n = 100;
    writeParams('items', { q: f.q, cat: f.cat, stock: f.stock ? '1' : '', sold: f.sold ? '1' : '', sort: f.sort === 'name' ? '' : f.sort });
    const ql = f.q.trim().toLowerCase(), cat = f.cat ? Number(f.cat) : 0;
    const rows = state.items.filter((i) => (!ql || i.lname.includes(ql)) && (!cat || i.cat === cat) &&
      (!f.stock || i.stockS > 0 || i.stockK > 0) && (!f.sold || i.lastS || i.lastK)).sort(sorts[f.sort]);
    const money = (single, stack, i) => (single || stack)
      ? h('div', null, single ? h('div', null, fmt(single)) : null, stack ? h('div', { class: 'muted small' }, `Stack ×${i.stackSize > 1 ? i.stackSize : 12}: ${fmt(stack)}`) : null)
      : h('span', { class: 'muted' }, 'No sales');
    fill(results,
      h('p', { class: 'summary' }, h('strong', null, `${fmt(rows.length)} ${rows.length === 1 ? 'item' : 'items'}`)),
      rows.length ? h('table', { class: 'sales items' },
        h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'For sale'), h('th', { class: 'num' }, 'Last sold'), h('th', { class: 'num' }, 'Average of last 5'), h('th', { class: 'num' }, 'Sold in 7 days'))),
        h('tbody', null, rows.slice(0, f.n).map((i) => h('tr', null,
          h('td', { class: 'item' }, itemLink(i), h('div', { class: 'muted small' }, catName(i.cat))),
          h('td', { class: 'stock' }, i.stockS || i.stockK
            ? [i.stockS ? h('div', null, `${fmt(i.stockS)} ${i.stockS === 1 ? 'single' : 'singles'}`) : null, i.stockK ? h('div', null, `${fmt(i.stockK)} ${i.stockK === 1 ? 'stack' : 'stacks'}`) : null]
            : h('span', { class: 'muted' }, 'None')),
          h('td', { class: 'num' }, money(i.lastS, i.lastK, i)),
          h('td', { class: 'num' }, money(i.avgS, i.avgK, i)),
          h('td', { class: 'num' }, i.c7 ? [h('div', null, fmt(i.c7)), h('div', { class: 'muted small' }, compact(i.v7) + ' gil')] : h('span', { class: 'muted' }, 'None')))))) : empty('No items match', 'Clear a filter or try a different name.'),
      rows.length > f.n ? h('button', { type: 'button', class: 'btn-quiet more-btn', onclick: () => { f.n += 200; update(false); } }, `Show more (${fmt(rows.length - f.n)} left)`) : null);
  };
  const typed = debounce(update, 100);
  root.append(
    pageHead('Items', 'Current stock and recent prices for every item that is for sale or has sold.'),
    h('div', { class: 'filters' },
      h('div', { class: 'filters-main' },
        h('input', { type: 'search', class: 'omni-input', placeholder: 'Item name', 'aria-label': 'Search items', value: f.q, autocomplete: 'off', oninput: (e) => { f.q = e.target.value; typed(); } }),
        select('Category', catOptions(), f.cat, (v) => { f.cat = v; update(); })),
      moreFilters(
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.stock, onchange: (e) => { f.stock = e.target.checked; update(); } }), 'For sale now'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.sold, onchange: (e) => { f.sold = e.target.checked; update(); } }), 'Has sold'),
        select('Sort', [['name', 'Name'], ['stock', 'Most for sale'], ['price', 'Highest price'], ['week', 'Most gil this week']], f.sort, (v) => { f.sort = v; update(); }))),
    results);
  update();
}

/* ---------------------------------- item page -------------------------------- */

export function itemView(root, id) {
  const item = state.itemById.get(Number(id));
  if (!item) { root.append(pageHead('Item not found', null, h('a', { class: 'crumb', href: '#/items' }, 'All items')), empty('No data for that item', 'It has no sales or listings in the current data.')); return; }
  const mine = state.sales.filter((s) => s.id === item.id);
  const hasStack = mine.some((s) => s.stack), hasSingle = mine.some((s) => !s.stack);
  let kind = hasSingle || !hasStack ? 'single' : 'stack';
  const chartHost = h('div', { class: 'chart-host' });

  const draw = () => {
    const rows = mine.filter((s) => s.stack === (kind === 'stack')).sort((a, b) => a.t - b.t);
    if (!rows.length) { chartHost.replaceChildren(empty('No sales yet', 'This item has not sold in the last ' + state.meta.retainDays + ' days.')); return; }
    const pts = rows.map((s) => ({
      t: s.t, v: s.price,
      tip: () => [h('strong', null, `${fmt(s.price)} gil`), h('span', null, whenFull(s.t)), h('span', null, `${s.seller || 'Unknown'} sold to ${s.buyer || 'Unknown'}`)],
    }));
    chartHost.replaceChildren(chartCard({
      title: kind === 'stack' ? `Price history, stacks of ${qty(rows[0])}` : 'Price history, single items',
      sub: `${fmt(rows.length)} ${rows.length === 1 ? 'sale' : 'sales'} in the last ${state.meta.retainDays} days`,
      controls: hasSingle && hasStack ? segmented('Quantity', [['single', 'Single'], ['stack', 'Stack']], kind, (v) => { kind = v; draw(); }) : null,
      draw: (box) => lineChart(box, pts, { aria: `Sale prices over time for ${item.name}` }),
      columns: ['When', 'Seller', 'Buyer', 'Price (gil)'],
      rows: [...rows].reverse().map((s) => [whenFull(s.t), s.seller, s.buyer, fmt(s.price)]),
    }));
  };

  const week = mine.filter((s) => s.t > Date.now() / 1000 - 7 * 86400);
  root.append(
    pageHead(item.name, catName(item.cat), h('a', { class: 'crumb', href: '#/items' }, 'All items')),
    statStrip([
      { label: 'For sale now', value: item.stockS || item.stockK ? `${fmt(item.stockS)} ${item.stockS === 1 ? 'single' : 'singles'}` : 'None', sub: item.stockK ? `${fmt(item.stockK)} ${item.stockK === 1 ? 'stack' : 'stacks'}` : null },
      { label: 'Last sold', value: item.lastS ? fmt(item.lastS) : item.lastK ? fmt(item.lastK) : 'No sales', sub: item.lastS ? ago(item.lastST) : item.lastK ? `Stack, ${ago(item.lastKT)}` : null },
      { label: 'Average of last 5', value: item.avgS ? fmt(item.avgS) : item.avgK ? fmt(item.avgK) : 'No sales', sub: item.avgS && item.avgK ? `Stack ${fmt(item.avgK)}` : null },
      { label: 'Sold in 7 days', value: fmt(week.length), sub: week.length ? `${compact(week.reduce((n, s) => n + s.price, 0))} gil` : null },
    ]),
    chartHost,
    h('section', null, h('h2', null, 'Recent sales'), mine.length ? salesTable(mine.slice(0, 30), { hide: ['item'] }) : empty('No sales recorded')));
  draw();
}

/* ---------------------------------- players ---------------------------------- */

export function playersView(root, p) {
  let range = p.range || '7d';
  const boards = h('div', { class: 'cols-2' });
  const update = () => {
    writeParams('players', { range: range === '7d' ? '' : range });
    const since = cutoff(range);
    const agg = (key) => {
      const m = new Map();
      for (const s of state.sales) {
        if (s.t < since || !s[key]) continue;
        const k = s[key].toLowerCase(), r = m.get(k) || { name: s[key], gil: 0, n: 0 };
        r.gil += s.price; r.n++; m.set(k, r);
      }
      return [...m.values()].sort((a, b) => b.gil - a.gil).slice(0, 15);
    };
    boards.replaceChildren(
      h('section', null, h('h2', null, 'Biggest buyers'), barList(agg('buyer').map((r) => ({ name: playerLink(r.name), sub: `${fmt(r.n)} bought`, value: r.gil, valueText: compact(r.gil) + ' gil' })))),
      h('section', null, h('h2', null, 'Biggest sellers'), barList(agg('seller').map((r) => ({ name: playerLink(r.name), sub: `${fmt(r.n)} sold`, value: r.gil, valueText: compact(r.gil) + ' gil' })))));
  };
  root.append(
    pageHead('Characters', 'Look up a buyer or seller, or see who moved the most gil.'),
    h('div', { class: 'filters' },
      h('div', { class: 'filters-main' }, omnibox({ placeholder: 'Character name', kinds: ['player'], button: 'Find' })),
      h('div', { class: 'filters-more' }, segmented('Time range', [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']], range, (v) => { range = v; update(); }))),
    boards);
  update();
}

export function playerView(root, name) {
  const pl = state.players.get(name.toLowerCase());
  const back = h('a', { class: 'crumb', href: '#/players' }, 'All characters');
  if (!pl) { root.append(pageHead(name, null, back), empty('No trades found for this name', 'They have not bought or sold anything in the last ' + state.meta.retainDays + ' days, or the name is spelled differently.')); return; }
  const all = [...pl.bought, ...pl.sold];
  const first = Math.min(...all.map((s) => s.t)), last = Math.max(...all.map((s) => s.t));
  const biggest = all.reduce((a, b) => (b.price > a.price ? b : a));
  const top = (rows) => {
    const m = new Map();
    for (const s of rows) { const r = m.get(s.id) || { item: s.item, gil: 0, n: 0 }; r.gil += s.price; r.n++; m.set(s.id, r); }
    return [...m.values()].sort((a, b) => b.gil - a.gil).slice(0, 6).map((r) => ({ name: itemLink(r.item), sub: `${fmt(r.n)} ${r.n === 1 ? 'sale' : 'sales'}`, value: r.gil, valueText: compact(r.gil) + ' gil' }));
  };
  const section = (title, rows, as, hide) => h('section', null,
    h('div', { class: 'row-between' }, h('h2', null, title), rows.length > 15 ? h('a', { class: 'more', href: hrefSales({ q: `${as}:"${pl.name}"` }) }, `All ${fmt(rows.length)}`) : null),
    rows.length ? salesTable(rows.slice(0, 15), { hide }) : empty('Nothing yet'));

  root.append(
    pageHead(pl.name, `Seen trading from ${dateLong(first)} to ${dateLong(last)}.`, back),
    statStrip([
      { label: 'Bought', value: fmt(pl.bought.length), sub: `${compact(pl.gilBought)} gil spent` },
      { label: 'Sold', value: fmt(pl.sold.length), sub: `${compact(pl.gilSold)} gil earned` },
      { label: 'Biggest trade', value: fmt(biggest.price), sub: biggest.item.name },
      { label: 'Last seen', value: ago(last), sub: whenFull(last) },
    ]),
    h('div', { class: 'cols-2' },
      h('section', null, h('h2', null, 'What they buy most'), barList(top(pl.bought))),
      h('section', null, h('h2', null, 'What they sell most'), barList(top(pl.sold)))),
    section('Recent purchases', pl.bought, 'buyer', ['buyer']),
    section('Recent sales', pl.sold, 'seller', ['seller']));
}
