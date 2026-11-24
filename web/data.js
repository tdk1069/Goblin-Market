// Loads the JSON the scraper publishes and builds the lookups the pages need.
// The last day of sales loads first so the overview can show straight away;
// older sales follow in the background (see loadOlder).

import { norm } from './ui.js';

export const state = {
  meta: null,
  cats: [],
  catLabel: new Map(), // id -> { group, name }
  items: [],
  itemById: new Map(),
  overview: null,
  sales: [], // newest first
  players: new Map(), // lowercase name -> { name, nname, bought: [], sold: [], gilBought, gilSold }
  complete: false, // true once older sales have loaded
  olderError: null,
};

async function getJson(name) {
  const r = await fetch('data/' + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

const index = (cols) => Object.fromEntries(cols.map((c, i) => [c, i]));

function blankItem(id) {
  return { id, name: `Item #${id}`, lname: `item #${id}`, nname: `item ${id}`, cat: 0, stackSize: 1, stockS: 0, stockK: 0, lastS: 0, lastST: 0, avgS: 0, lastK: 0, lastKT: 0, avgK: 0, c7: 0, v7: 0 };
}

// Sales file v2: names by index, times as seconds before the previous row (see scraper/pack.mjs).
function unpack(f) {
  let t = f.base;
  return f.rows.map((r) => {
    t -= r[0];
    const id = r[1];
    let item = state.itemById.get(id);
    if (!item) { item = blankItem(id); state.itemById.set(id, item); }
    const seller = r[4] >= 0 ? f.names[r[4]] : '', buyer = r[5] >= 0 ? f.names[r[5]] : '';
    return { t, id, stack: !!r[2], price: r[3], seller, buyer, lseller: norm(seller), lbuyer: norm(buyer), item };
  });
}

function addPlayers(sales) {
  const rec = (name) => {
    const k = name.toLowerCase();
    let p = state.players.get(k);
    if (!p) { p = { name, nname: norm(name), bought: [], sold: [], gilBought: 0, gilSold: 0 }; state.players.set(k, p); }
    return p;
  };
  for (const s of sales) {
    if (s.seller) { const p = rec(s.seller); p.sold.push(s); p.gilSold += s.price; }
    if (s.buyer) { const p = rec(s.buyer); p.bought.push(s); p.gilBought += s.price; }
  }
}

export async function load() {
  const [meta, itemsJ, cats, overview, recent] = await Promise.all(
    ['meta.json', 'items.json', 'cats.json', 'overview.json', 'sales-recent.json'].map(getJson));
  state.meta = meta;
  state.cats = cats;
  state.overview = overview;
  for (const g of cats) for (const c of g.cats) state.catLabel.set(c.id, { group: g.group, name: c.name });

  const ii = index(itemsJ.cols);
  state.items = itemsJ.rows.map((r) => ({
    id: r[ii.id], name: r[ii.name], lname: String(r[ii.name]).toLowerCase(), nname: norm(r[ii.name]), cat: r[ii.cat], stackSize: r[ii.stackSize],
    stockS: r[ii.stockSingle], stockK: r[ii.stockStack],
    lastS: r[ii.lastSingle], lastST: r[ii.lastSingleT], avgS: r[ii.avgSingle],
    lastK: r[ii.lastStack], lastKT: r[ii.lastStackT], avgK: r[ii.avgStack],
    c7: r[ii.sales7d], v7: r[ii.vol7d],
  }));
  state.itemById = new Map(state.items.map((i) => [i.id, i]));

  state.sales = unpack(recent);
  addPlayers(state.sales);
}

// Fetches the older sales once. Resolves when state.sales holds the full history.
let olderPromise = null;
export function loadOlder() {
  if (!olderPromise) {
    olderPromise = getJson('sales-older.json').then((f) => {
      const older = unpack(f);
      state.sales = state.sales.concat(older); // both newest first, older strictly before recent
      addPlayers(older);
      state.complete = true;
    }).catch((e) => { state.olderError = e.message; state.complete = true; });
  }
  return olderPromise;
}

export const qty = (s) => (s.stack ? (s.item.stackSize > 1 ? s.item.stackSize : 12) : 1);
export const stackQty = (item) => (item.stackSize > 1 ? item.stackSize : 12);

export const RANGES = { '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, all: Infinity };
export const cutoff = (range) => Date.now() / 1000 - (RANGES[range] ?? Infinity);

export const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
