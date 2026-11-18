// Loads the JSON the scraper publishes and builds the lookups the pages need.

export const state = {
  meta: null,
  cats: [],
  catLabel: new Map(), // id -> { group, name }
  items: [],
  itemById: new Map(),
  sales: [], // newest first
  players: new Map(), // lowercase name -> { name, bought: [], sold: [], gilBought, gilSold }
};

async function getJson(name) {
  const r = await fetch('data/' + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

const index = (cols) => Object.fromEntries(cols.map((c, i) => [c, i]));

export async function load() {
  const [meta, itemsJ, salesJ, cats] = await Promise.all(['meta.json', 'items.json', 'sales.json', 'cats.json'].map(getJson));
  state.meta = meta;
  state.cats = cats;
  for (const g of cats) for (const c of g.cats) state.catLabel.set(c.id, { group: g.group, name: c.name });

  const ii = index(itemsJ.cols);
  state.items = itemsJ.rows.map((r) => ({
    id: r[ii.id], name: r[ii.name], lname: String(r[ii.name]).toLowerCase(), cat: r[ii.cat], stackSize: r[ii.stackSize],
    stockS: r[ii.stockSingle], stockK: r[ii.stockStack],
    lastS: r[ii.lastSingle], lastST: r[ii.lastSingleT], avgS: r[ii.avgSingle],
    lastK: r[ii.lastStack], lastKT: r[ii.lastStackT], avgK: r[ii.avgStack],
    c7: r[ii.sales7d], v7: r[ii.vol7d],
  }));
  state.itemById = new Map(state.items.map((i) => [i.id, i]));

  const si = index(salesJ.cols);
  state.sales = salesJ.rows.map((r) => {
    const id = r[si.id];
    let item = state.itemById.get(id);
    if (!item) {
      item = { id, name: `Item #${id}`, lname: `item #${id}`, cat: 0, stackSize: 1, stockS: 0, stockK: 0, lastS: 0, lastST: 0, avgS: 0, lastK: 0, lastKT: 0, avgK: 0, c7: 0, v7: 0 };
      state.itemById.set(id, item);
    }
    const seller = r[si.seller] || '', buyer = r[si.buyer] || '';
    return { t: r[si.t], id, stack: !!r[si.stack], price: r[si.price], seller, buyer, lseller: seller.toLowerCase(), lbuyer: buyer.toLowerCase(), item };
  });

  state.players = new Map();
  const rec = (name) => {
    const k = name.toLowerCase();
    let p = state.players.get(k);
    if (!p) { p = { name, bought: [], sold: [], gilBought: 0, gilSold: 0 }; state.players.set(k, p); }
    return p;
  };
  for (const s of state.sales) {
    if (s.seller) { const p = rec(s.seller); p.sold.push(s); p.gilSold += s.price; }
    if (s.buyer) { const p = rec(s.buyer); p.bought.push(s); p.gilBought += s.price; }
  }
}

export const qty = (s) => (s.stack ? (s.item.stackSize > 1 ? s.item.stackSize : 12) : 1);

export const RANGES = { '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, all: Infinity };
export const cutoff = (range) => Date.now() / 1000 - (RANGES[range] ?? Infinity);

export const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
