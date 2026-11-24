import { h, fill, fmt, compact, ago, whenFull, dateShort, dateLong, segmented, select, norm } from './ui.js';
import { state, qty, stackQty, cutoff, median, loadOlder } from './data.js';
import { barChart, lineChart, chartCard } from './charts.js';
import { isWatched, toggle as toggleWatch, watchedItems, watchedPlayers, watchCount } from './watch.js';

/* ------------------------------ link helpers ------------------------------ */

const hrefItem = (id) => `#/item/${id}`;
const hrefPlayer = (n) => `#/player/${encodeURIComponent(n)}`;
const hrefSales = (p) => '#/sales?' + new URLSearchParams(p).toString();

const itemLink = (item) => h('a', { class: 'item-link', href: hrefItem(item.id) }, item.name);
const playerLink = (name) => (name ? h('a', { class: 'player-link', href: hrefPlayer(name) }, name) : h('span', { class: 'muted' }, 'Unknown'));
const stackBadge = (s) => (s.stack ? h('span', { class: 'badge', title: 'Sold as a full stack' }, `Stack ×${qty(s)}`) : null);
const catName = (id) => { const c = state.catLabel.get(id); return c ? `${c.group}, ${c.name}` : 'Uncategorised'; };

// "12,000" plus "(1,000 each)" for stacks.
const each = (price, item) => fmt(price / stackQty(item));
function priceCell(price, stack, item) {
  return stack ? [fmt(price), h('span', { class: 'each' }, `${each(price, item)} each`)] : fmt(price);
}

/* --------------------------------- URL state -------------------------------- */

function writeParams(route, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v);
  const s = q.toString();
  history.replaceState(null, '', '#/' + route + (s ? '?' + s : ''));
}

const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------------------------- staged data loading --------------------------- */

// Runs fn once the older sales have arrived, if `node` is still on the page by then.
function afterFull(node, fn) {
  if (state.complete) return;
  loadOlder().then(() => { if (node.isConnected) fn(); });
}

function loadingNote() {
  if (!state.complete) return h('p', { class: 'loading-note', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `Showing the last ${state.meta.recentHours || 24} hours while older sales load…`);
  if (state.olderError) return h('p', { class: 'loading-note warn', role: 'status' }, `Older sales could not be loaded, so only the last ${state.meta.recentHours || 24} hours are shown. Reload the page to try again.`);
  return null;
}

/* ------------------------------ shared pieces ------------------------------ */

function statStrip(stats) {
  return h('div', { class: 'strip panel' }, stats.map((s) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, s.label), h('span', { class: 'stat-value' }, s.value), s.sub ? h('span', { class: 'stat-sub' }, s.sub) : null)));
}

function empty(title, body) {
  return h('div', { class: 'empty' }, h('h3', null, title), body ? h('p', null, body) : null);
}

function pageHead(title, sub, crumb, action) {
  return h('header', { class: 'page-head' }, crumb || null,
    h('div', { class: 'title-row' }, h('h1', null, title), action || null),
    sub ? h('p', { class: 'lede' }, sub) : null);
}

function starButton(kind, key, what) {
  const label = (on) => (on ? '★ Watching' : '☆ Watch');
  const btn = h('button', {
    type: 'button', class: 'btn-quiet star', 'aria-pressed': String(isWatched(kind, key)),
    title: `Add ${what} to your watchlist on the overview page (saved in this browser)`,
    onclick: () => {
      const on = toggleWatch(kind, key);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = label(on);
    },
  }, label(isWatched(kind, key)));
  return btn;
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
    price: (s) => h('td', { class: 'num price' }, priceCell(s.price, s.stack, s.item)),
    seller: (s) => h('td', { class: 'seller' }, playerLink(s.seller)),
    buyer: (s) => h('td', { class: 'buyer' }, playerLink(s.buyer)),
  };
  return h('table', { class: 'sales' + (hide.includes('item') ? ' no-item' : '') },
    h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c === 'price' ? 'num' : '' }, label[c])))),
    h('tbody', null, rows.map((s) => h('tr', null, cols.map((c) => cell[c](s))))));
}

// A sales table that shows `step` rows at a time with a "Show more" button.
function pagedSales(rows, opts = {}, step = 30) {
  const box = h('div');
  let n = step;
  const draw = () => fill(box,
    salesTable(rows.slice(0, n), opts),
    rows.length > n ? h('button', { type: 'button', class: 'btn-quiet more-btn', onclick: () => { n += step * 3; draw(); } }, `Show more (${fmt(rows.length - n)} left)`) : null);
  draw();
  return box;
}

/* ---------------------------------- omnibox --------------------------------- */

// Prefix matches first, then the busiest.
function rank(list, qn, key, busy) {
  return list.filter((x) => key(x).includes(qn))
    .sort((a, b) => (key(b).startsWith(qn) - key(a).startsWith(qn)) || busy(b) - busy(a) || key(a).localeCompare(key(b)));
}

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
    const qn = norm(q);
    opts = [];
    if (!qn) return;
    if (kinds.includes('item')) {
      const hits = rank(state.items, qn, (i) => i.nname, (i) => i.c7).slice(0, 5);
      if (hits.length) opts.push({ head: 'Items' });
      for (const i of hits) opts.push({ label: i.name, sub: catName(i.cat), go: () => (location.hash = hrefItem(i.id)) });
    }
    if (kinds.includes('player')) {
      const hits = rank([...state.players.values()], qn, (p) => p.nname, (p) => p.bought.length + p.sold.length).slice(0, 5);
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
    if (kinds.length === 1 && kinds[0] === 'player') return sel.length ? go(opts[sel[0]]) : null;
    if (kinds.includes('sales') && input.value.trim()) return go(opts[opts.length - 1]);
    if (sel.length) go(opts[sel[0]]);
  } },
  h('div', { class: 'omni-wrap' }, input, list),
  button ? h('button', { type: 'submit', class: 'btn' }, button) : null);
  return form;
}

/* --------------------------------- overview --------------------------------- */

// Sale-like object from an overview row [t, id, stack, price, seller, buyer].
function saleFromRow(r) {
  const item = state.itemById.get(r[1]) || { id: r[1], name: `Item #${r[1]}`, stackSize: 1 };
  return { t: r[0], id: r[1], stack: !!r[2], price: r[3], seller: r[4], buyer: r[5], item };
}

function watchlistSection() {
  const box = h('section', { class: 'watchlist' });
  const draw = () => {
    const items = watchedItems().map((id) => state.itemById.get(id)).filter(Boolean);
    const players = watchedPlayers().map((k) => state.players.get(k) || { name: k, missing: true });
    if (!items.length && !players.length) { fill(box); return; }
    fill(box,
      h('div', { class: 'row-between' }, h('h2', null, 'Your watchlist'), h('span', { class: 'muted small' }, 'Saved in this browser. Use ☆ Watch on an item or character page to add more.')),
      items.length ? h('table', { class: 'sales watch-items' },
        h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'num' }, 'Last sold'), h('th', { class: 'num' }, 'Average of last 5'), h('th', null, 'For sale'), h('th', { class: 'num' }, 'Sold in 7 days'))),
        h('tbody', null, items.map((i) => {
          const single = i.lastS || !i.lastK;
          return h('tr', null,
            h('td', { class: 'item' }, itemLink(i)),
            h('td', { class: 'num' }, i.lastS || i.lastK ? [priceCell(single ? i.lastS : i.lastK, !single, i), h('div', { class: 'muted small' }, ago(single ? i.lastST : i.lastKT))] : h('span', { class: 'muted' }, 'No sales')),
            h('td', { class: 'num' }, i.avgS || i.avgK ? priceCell(i.avgS || i.avgK, !i.avgS, i) : h('span', { class: 'muted' }, '–')),
            h('td', { class: 'stock' }, stockText(i)),
            h('td', { class: 'num' }, fmt(i.c7)));
        }))) : null,
      players.length ? h('ul', { class: 'watch-players' }, players.map((p) => {
        const last = p.missing ? null : [...p.bought, ...p.sold].reduce((a, b) => (!a || b.t > a.t ? b : a), null);
        return h('li', null, playerLink(p.name),
          last ? h('span', { class: 'muted small' }, `${last.buyer === p.name ? 'bought' : 'sold'} `, itemLink(last.item), ` ${ago(last.t)}`)
            : h('span', { class: 'muted small' }, state.complete ? 'No trades recorded' : 'Loading…'));
      })) : null);
  };
  draw();
  if (watchedPlayers().length) afterFull(box, draw);
  return box;
}

function stockText(i) {
  return i.stockS || i.stockK
    ? [i.stockS ? h('div', null, `${fmt(i.stockS)} ${i.stockS === 1 ? 'single' : 'singles'}`) : null, i.stockK ? h('div', null, `${fmt(i.stockK)} ${i.stockK === 1 ? 'stack' : 'stacks'}`) : null]
    : h('span', { class: 'muted' }, 'None');
}

export function overview(root) {
  const ov = state.overview;
  const now = Date.now() / 1000;
  const day = state.sales.filter((s) => s.t > now - 86400);
  const gil = (a) => a.reduce((n, s) => n + s.price, 0);
  const listed = state.items.filter((i) => i.stockS > 0 || i.stockK > 0);

  root.append(
    h('section', { class: 'hero' },
      h('h1', null, 'Search auction house sales'),
      h('p', { class: 'lede' }, 'Find what an item sold for, or see everything a character has bought and sold.'),
      omnibox({ placeholder: 'Search an item, a buyer or a seller', big: true, autofocus: true })),
    statStrip([
      { label: 'Sales in the last day', value: fmt(day.length), sub: `${compact(gil(day))} gil` },
      { label: 'Gil traded this week', value: compact(ov.week.gil), sub: `${fmt(ov.week.n)} sales` },
      { label: 'Items for sale now', value: fmt(listed.length), sub: `${fmt(listed.reduce((n, i) => n + i.stockS, 0))} singles, ${fmt(listed.reduce((n, i) => n + i.stockK, 0))} stacks` },
      { label: 'Characters trading this week', value: fmt(ov.week.people), sub: `${fmt(state.meta.players ?? state.players.size)} seen in ${state.meta.retainDays} days` },
    ]));

  if (watchCount()) root.append(watchlistSection());

  if (!ov.week.n && !state.sales.length) {
    root.append(empty('No sales recorded yet', 'The first collection run has not found any sales. Check back after the next scheduled update.'));
    return;
  }

  // Gil traded per local day for the last 14 days, from the hourly totals.
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const start = d.getTime() / 1000;
    days.push({ start, end: start + 86400, value: 0, count: 0 });
  }
  ov.gil.forEach((g, i) => {
    const t = ov.hourStart + i * 3600;
    const d = days.find((x) => t >= x.start && t < x.end);
    if (d) { d.value += g; d.count += ov.n[i]; }
  });
  const dayRows = days.map((d) => ({
    label: dateShort(d.start), value: d.value, count: d.count,
    aria: `${dateShort(d.start)}: ${fmt(d.value)} gil from ${d.count} sales`,
    tip: () => [h('strong', null, `${fmt(d.value)} gil`), h('span', null, new Date(d.start * 1000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })), h('span', null, `${fmt(d.count)} sales`)],
  }));

  const biggest = ov.biggest.map(saleFromRow);
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
  const people = (rows, verb) => barList(rows.slice(0, 6).map(([name, g, n]) => ({ name: playerLink(name), sub: `${fmt(n)} ${verb}`, value: g, valueText: compact(g) })));
  root.append(h('div', { class: 'cols-3' },
    h('section', null, h('h2', null, 'Busiest items this week'),
      barList(hot.map((i) => ({ name: itemLink(i), sub: `${fmt(i.c7)} sold`, value: i.v7, valueText: compact(i.v7) })))),
    h('section', null, h('h2', null, 'Top buyers this week'), people(ov.buyers, 'bought')),
    h('section', null, h('h2', null, 'Top sellers this week'), people(ov.sellers, 'sold'))));

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
    terms.push({ f: f.toLowerCase(), v: norm(quoted || bare), exact: quoted != null });
    return ' ';
  });
  return { terms, rest: norm(rest) };
}

const matcher = (field, v, exact) => {
  const eq = (a) => (exact ? a === v : a.includes(v));
  switch (field) {
    case 'item': return (s) => eq(s.item.nname);
    case 'buyer': return (s) => eq(s.lbuyer);
    case 'seller': return (s) => eq(s.lseller);
    case 'player': return (s) => eq(s.lbuyer) || eq(s.lseller);
    default: return (s) => eq(s.item.nname) || eq(s.lbuyer) || eq(s.lseller);
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
      f.range !== '24h' ? loadingNote() : null,
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
  afterFull(results, () => update(false));
}

/* ----------------------------------- items ---------------------------------- */

export function itemsView(root, p) {
  const f = { q: p.q || '', cat: p.cat || '', stock: p.stock === '1', sold: p.sold === '1', watch: p.watch === '1', sort: p.sort || 'name', n: 100 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const sorts = {
    name: (a, b) => a.lname.localeCompare(b.lname),
    stock: (a, b) => (b.stockS + b.stockK) - (a.stockS + a.stockK) || a.lname.localeCompare(b.lname),
    price: (a, b) => (b.lastS || b.lastK) - (a.lastS || a.lastK) || a.lname.localeCompare(b.lname),
    week: (a, b) => b.v7 - a.v7 || a.lname.localeCompare(b.lname),
  };
  const update = (reset = true) => {
    if (reset) f.n = 100;
    writeParams('items', { q: f.q, cat: f.cat, stock: f.stock ? '1' : '', sold: f.sold ? '1' : '', watch: f.watch ? '1' : '', sort: f.sort === 'name' ? '' : f.sort });
    const qn = norm(f.q), cat = f.cat ? Number(f.cat) : 0;
    const watched = new Set(watchedItems());
    let rows = state.items.filter((i) => (!qn || i.nname.includes(qn)) && (!cat || i.cat === cat) &&
      (!f.stock || i.stockS > 0 || i.stockK > 0) && (!f.sold || i.lastS || i.lastK) && (!f.watch || watched.has(i.id)));
    rows = f.sort === 'name' && qn ? rank(rows, qn, (i) => i.nname, () => 0) : rows.sort(sorts[f.sort]);
    const money = (single, stack, i) => (single || stack)
      ? h('div', null, single ? h('div', null, fmt(single)) : null, stack ? h('div', { class: 'muted small' }, `Stack ×${stackQty(i)}: ${fmt(stack)} (${each(stack, i)} each)`) : null)
      : h('span', { class: 'muted' }, 'No sales');
    fill(results,
      h('p', { class: 'summary' }, h('strong', null, `${fmt(rows.length)} ${rows.length === 1 ? 'item' : 'items'}`)),
      rows.length ? h('table', { class: 'sales items' },
        h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'For sale'), h('th', { class: 'num' }, 'Last sold'), h('th', { class: 'num' }, 'Average of last 5'), h('th', { class: 'num' }, 'Sold in 7 days'))),
        h('tbody', null, rows.slice(0, f.n).map((i) => h('tr', null,
          h('td', { class: 'item' }, itemLink(i), h('div', { class: 'muted small' }, catName(i.cat))),
          h('td', { class: 'stock' }, stockText(i)),
          h('td', { class: 'num' }, money(i.lastS, i.lastK, i)),
          h('td', { class: 'num' }, money(i.avgS, i.avgK, i)),
          h('td', { class: 'num' }, i.c7 ? [h('div', null, fmt(i.c7)), h('div', { class: 'muted small' }, compact(i.v7) + ' gil')] : h('span', { class: 'muted' }, 'None')))))) : empty(f.watch && !watched.size ? 'Your watchlist is empty' : 'No items match', f.watch && !watched.size ? 'Open an item and press ☆ Watch to add it.' : 'Clear a filter or try a different name.'),
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
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.watch, onchange: (e) => { f.watch = e.target.checked; update(); } }), 'Watchlist only'),
        select('Sort', [['name', 'Name'], ['stock', 'Most for sale'], ['price', 'Highest price'], ['week', 'Most gil this week']], f.sort, (v) => { f.sort = v; update(); }))),
    results);
  update();
}

/* ---------------------------------- item page -------------------------------- */

// Rolling median over the k sales around each point, so one odd sale doesn't move the line much.
function rollingMedian(rows) {
  const k = Math.max(3, Math.min(25, Math.round(rows.length / 12)) | 1);
  const half = k >> 1;
  return rows.map((s, i) => ({ t: s.t, v: median(rows.slice(Math.max(0, i - half), i + half + 1).map((x) => x.price)) }));
}

// How many days of history the site holds, capped at `max` (the collector may be newer than that).
function daysCovered(max) {
  const oldest = state.sales.length ? state.sales[state.sales.length - 1].t : Date.now() / 1000;
  return Math.max(1, Math.min(max, (Date.now() / 1000 - oldest) / 86400));
}

export function itemView(root, id, p = {}) {
  const item = state.itemById.get(Number(id));
  if (!item) { root.append(pageHead('Item not found', null, h('a', { class: 'crumb', href: '#/items' }, 'All items')), empty('No data for that item', 'It has no sales or listings in the current data.')); return; }
  const mine = state.sales.filter((s) => s.id === item.id);
  const hasStack = mine.some((s) => s.stack) || item.lastK > 0, hasSingle = mine.some((s) => !s.stack) || item.lastS > 0;
  let kind = p.kind === 'stack' || p.kind === 'single' ? p.kind : hasSingle || !hasStack ? 'single' : 'stack';
  let range = ['7d', '30d', 'all'].includes(p.range) ? p.range : '30d';
  const statsHost = h('div');
  const chartHost = h('div', { class: 'chart-host' });

  const draw = () => {
    writeParams(`item/${item.id}`, { kind: kind === (hasSingle || !hasStack ? 'single' : 'stack') ? '' : kind, range: range === '30d' ? '' : range });
    const isStack = kind === 'stack';
    const ofKind = mine.filter((s) => s.stack === isStack);
    const since = cutoff(range);
    const rows = ofKind.filter((s) => s.t >= since).sort((a, b) => a.t - b.t);
    const prices = rows.map((s) => s.price);
    const unit = isStack ? stackQty(item) : 1;
    const per = (v) => (isStack ? `${fmt(v / unit)} each` : null);
    // Sales rate over the last week (or less, while only part of the history has loaded).
    const days = daysCovered(7);
    const soldWeek = ofKind.filter((s) => s.t >= Date.now() / 1000 - 7 * 86400).length;
    const rate = soldWeek / days;
    const listed = isStack ? item.stockK : item.stockS;
    const stockDays = rate > 0 && listed ? listed / rate : 0;
    const last = ofKind[0] || null; // newest first
    const rangeText = { '7d': '7 days', '30d': '30 days', all: `${state.meta.retainDays} days` }[range];

    fill(statsHost, statStrip([
      { label: 'For sale now', value: listed ? `${fmt(listed)} ${isStack ? (listed === 1 ? 'stack' : 'stacks') : (listed === 1 ? 'single' : 'singles')}` : 'None',
        sub: isStack ? (item.stockS ? `${fmt(item.stockS)} singles too` : null) : (item.stockK ? `${fmt(item.stockK)} stacks too` : null) },
      { label: 'Last sold', value: last ? fmt(last.price) : 'No sales', sub: last ? [per(last.price), ago(last.t)].filter(Boolean).join(', ') : null },
      { label: `Median, last ${rangeText}`, value: prices.length ? fmt(median(prices)) : 'No sales',
        sub: prices.length ? (isStack ? `${per(median(prices))}, ` : '') + `range ${compact(prices.reduce((a, b) => Math.min(a, b)))}–${compact(prices.reduce((a, b) => Math.max(a, b)))}` : null },
      { label: 'Sells about', value: rate >= 1 ? `${fmt(rate)} a day` : rate * 7 >= 0.5 ? `${fmt(rate * 7)} a week` : 'Rarely',
        sub: stockDays ? (stockDays < 1 ? 'Less than a day of stock listed' : `${fmt(stockDays)} ${Math.round(stockDays) === 1 ? 'day' : 'days'} of stock listed`)
          : `${fmt(soldWeek)} sold in the last ${Math.round(days) === 1 ? 'day' : `${Math.round(days)} days`}` },
    ]));

    const controls = [
      hasSingle && hasStack ? segmented('Quantity', [['single', 'Single'], ['stack', `Stack ×${unit > 1 ? unit : stackQty(item)}`]], kind, (v) => { kind = v; draw(); }) : null,
      segmented('Time range', [['7d', '7 days'], ['30d', '30 days'], ['all', 'All']], range, (v) => { range = v; draw(); }),
    ];
    if (!rows.length) {
      fill(chartHost, h('section', { class: 'panel chart' },
        h('div', { class: 'chart-head' }, h('h2', null, 'Price history'), h('div', { class: 'chart-tools' }, controls)),
        empty('No sales in this range', state.complete ? 'Try a longer time range.' : 'Older sales are still loading.')));
      return;
    }
    const pts = rows.map((s) => ({
      t: s.t, v: s.price,
      tip: () => [h('strong', null, `${fmt(s.price)} gil`), isStack ? h('span', null, `${fmt(s.price / unit)} each`) : null, h('span', null, whenFull(s.t)), h('span', null, `${s.seller || 'Unknown'} sold to ${s.buyer || 'Unknown'}`)].filter(Boolean),
    }));
    const trend = rows.length >= 5 ? rollingMedian(rows) : null;
    fill(chartHost, chartCard({
      title: isStack ? `Price history, stacks of ${unit}` : 'Price history, single items',
      sub: `${fmt(rows.length)} ${rows.length === 1 ? 'sale' : 'sales'} in the last ${rangeText}`,
      legend: trend ? h('p', { class: 'legend' }, h('span', { class: 'key-dot', 'aria-hidden': 'true' }), 'Each sale ', h('span', { class: 'key-line', 'aria-hidden': 'true' }), 'Typical price (rolling median)') : null,
      controls,
      draw: (box) => lineChart(box, pts, { aria: `Sale prices over time for ${item.name}`, trend }),
      columns: ['When', 'Seller', 'Buyer', 'Price (gil)'],
      rows: [...rows].reverse().slice(0, 500).map((s) => [whenFull(s.t), s.seller, s.buyer, fmt(s.price)]),
    }));
  };

  fill(root,
    pageHead(item.name, catName(item.cat), h('a', { class: 'crumb', href: '#/items' }, 'All items'), starButton('item', item.id, 'this item')),
    loadingNote(),
    statsHost,
    chartHost,
    h('section', null, h('h2', null, 'Recent sales'), mine.length ? pagedSales(mine, { hide: ['item'] }) : empty(state.complete ? 'No sales recorded' : 'No sales in the last day', state.complete ? null : 'Older sales are still loading.')));
  draw();
  afterFull(statsHost, () => { root.replaceChildren(); itemView(root, id, { kind, range }); });
}

/* ---------------------------------- players ---------------------------------- */

export function playersView(root, p) {
  let range = p.range || '7d';
  const boards = h('div', { class: 'cols-2' });
  const note = h('div');
  const update = () => {
    writeParams('players', { range: range === '7d' ? '' : range });
    let buyers, sellers;
    if (range === '7d' && state.overview) {
      // Precomputed by the collector, so this works before older sales load.
      const conv = (r) => ({ name: r[0], gil: r[1], n: r[2] });
      buyers = state.overview.buyers.map(conv); sellers = state.overview.sellers.map(conv);
      fill(note);
    } else {
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
      buyers = agg('buyer'); sellers = agg('seller');
      fill(note, range === '24h' ? null : loadingNote());
    }
    boards.replaceChildren(
      h('section', null, h('h2', null, 'Biggest buyers'), barList(buyers.map((r) => ({ name: playerLink(r.name), sub: `${fmt(r.n)} bought`, value: r.gil, valueText: compact(r.gil) + ' gil' })))),
      h('section', null, h('h2', null, 'Biggest sellers'), barList(sellers.map((r) => ({ name: playerLink(r.name), sub: `${fmt(r.n)} sold`, value: r.gil, valueText: compact(r.gil) + ' gil' })))));
  };
  root.append(
    pageHead('Characters', 'Look up a buyer or seller, or see who moved the most gil.'),
    h('div', { class: 'filters' },
      h('div', { class: 'filters-main' }, omnibox({ placeholder: 'Character name', kinds: ['player'], button: 'Find' })),
      h('div', { class: 'filters-more' }, segmented('Time range', [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']], range, (v) => { range = v; update(); }))),
    note,
    boards);
  update();
  afterFull(boards, update);
}

export function playerView(root, name) {
  const pl = state.players.get(name.toLowerCase());
  const back = h('a', { class: 'crumb', href: '#/players' }, 'All characters');
  const rerender = () => { root.replaceChildren(); playerView(root, name); };
  if (!pl) {
    const head = pageHead(name, null, back, state.complete ? null : starButton('player', name, 'this character'));
    root.append(head, state.complete
      ? empty('No trades found for this name', 'They have not bought or sold anything in the last ' + state.meta.retainDays + ' days, or the name is spelled differently.')
      : loadingNote());
    afterFull(head, rerender);
    return;
  }
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
    rows.length ? pagedSales(rows, { hide }, 15) : empty('Nothing yet'));

  const head = pageHead(pl.name, `Seen trading from ${dateLong(first)} to ${dateLong(last)}.`, back, starButton('player', pl.name, 'this character'));
  fill(root,
    head,
    loadingNote(),
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
  afterFull(head, rerender);
}
