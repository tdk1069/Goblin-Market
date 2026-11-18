// Writes made-up market data into web/data so you can preview the site locally.
//   node tools/make-demo.mjs && python3 -m http.server -d web 8080
import fs from 'node:fs';
import path from 'node:path';
import { catsForSite } from '../scraper/cats.mjs';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// [id, name, category, base price, stack size]
const ITEMS = [
  [4096, 'Fire Crystal', 35, 380, 12], [4097, 'Ice Crystal', 35, 400, 12], [4101, 'Light Crystal', 35, 520, 12],
  [4112, 'Potion', 33, 150, 12], [4120, 'Hi-Potion', 33, 900, 12], [4128, 'Ether', 33, 1800, 12],
  [4150, 'Scroll of Cure IV', 28, 28000, 1], [4166, 'Scroll of Raise II', 28, 21000, 1], [4180, 'Scroll of Firaga', 29, 36000, 1],
  [641, 'Rabbit Hide', 41, 140, 12], [694, 'Wyvern Skin', 41, 6200, 12], [838, 'Silk Cloth', 40, 3400, 12],
  [640, 'Copper Ore', 38, 90, 12], [650, 'Mythril Ore', 38, 2100, 12], [655, 'Darksteel Ore', 38, 5200, 12],
  [12298, "Kraken Club", 11, 74000, 1], [12420, 'Mythril Sword', 3, 11500, 1], [12440, 'Darksteel Dagger', 2, 8800, 1],
  [13200, 'Gold Ring', 25, 3400, 1], [13300, 'Mythril Shield', 16, 14000, 1], [13400, 'Leather Gloves', 19, 700, 1],
  [4376, 'Meat Mithkabob', 55, 600, 12], [4412, 'Roast Mushroom', 54, 800, 12], [4538, 'Black Bread', 56, 350, 12],
  [5432, 'Shuriken', 49, 260, 99], [5413, 'Uchitake', 49, 1100, 99], [4444, 'Zinc Ore', 38, 1500, 12],
  [17313, 'Bronze Arrow', 15, 40, 99], [17314, 'Iron Arrow', 15, 80, 99], [15180, 'Wool Hat', 17, 260, 1],
  [14450, 'Warrior Boots', 21, 24000, 1], [13560, 'Silver Earring', 24, 1700, 1], [12970, "Hunter's Bow", 13, 17500, 1],
  [4488, 'Grape Juice', 58, 700, 12], [4380, 'Salmon Sushi', 51, 1300, 12], [5000, 'Ancient Lumber', 43, 9200, 12],
];
const SELLERS = ['Tavaria', 'Ostrel', 'Quillon', 'Zeraphine', 'Hobb', 'Ilsa', 'Dunmore', 'Pheo', 'Raina', 'Valkor', 'Nyxie', 'Brannock', 'Mirelle', 'Tobbo'];
const BUYERS = ['Aldrick', 'Soria', 'Kitsu', 'Bexley', 'Marnie', 'Obsidian', 'Lemmy', 'Ferrin', 'Gwenna', 'Hadrian', 'Ostrel', 'Tavaria', 'Pheo', 'Lonnie', 'Quillon'];

const now = Math.floor(Date.now() / 1000);
const sales = [];
for (const [id, , , base, stackSize] of ITEMS) {
  const popularity = Math.max(1, Math.round(60 / Math.pow(base / 150, 0.45) * (0.4 + rnd())));
  for (let i = 0; i < popularity; i++) {
    const t = now - Math.floor(Math.pow(rnd(), 1.4) * 60 * 86400);
    const stack = stackSize > 1 && rnd() < 0.3 ? 1 : 0;
    const drift = 1 + 0.15 * Math.sin(t / 400000 + id);
    const price = Math.max(1, Math.round(base * drift * (0.7 + rnd() * 0.7) * (stack ? stackSize * 0.9 : 1)));
    let seller = pick(SELLERS), buyer = pick(BUYERS);
    if (seller === buyer) buyer = 'Aldrick';
    sales.push([t, id, stack, price, seller, buyer]);
  }
}
sales.sort((a, b) => b[0] - a[0]);

const agg = new Map();
const week = now - 7 * 86400;
for (const r of sales) {
  const k = `${r[1]}:${r[2]}`;
  const a = agg.get(k) || { last: r[3], lastT: r[0], sum: 0, n: 0, c7: 0, v7: 0 };
  if (a.n < 5) { a.sum += r[3]; a.n++; }
  if (r[0] >= week) { a.c7++; a.v7 += r[3]; }
  agg.set(k, a);
}
const rows = ITEMS.map(([id, name, cat, , stackSize]) => {
  const a0 = agg.get(`${id}:0`), a1 = agg.get(`${id}:1`);
  const inStock = rnd() < 0.7;
  return [id, name, cat, stackSize, inStock ? Math.floor(rnd() * 9) : 0, inStock && stackSize > 1 ? Math.floor(rnd() * 5) : 0,
    a0?.last || 0, a0?.lastT || 0, a0 ? Math.round(a0.sum / a0.n) : 0, a1?.last || 0, a1?.lastT || 0, a1 ? Math.round(a1.sum / a1.n) : 0,
    (a0?.c7 || 0) + (a1?.c7 || 0), (a0?.v7 || 0) + (a1?.v7 || 0)];
}).sort((a, b) => a[1].localeCompare(b[1]));

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'web', 'data');
fs.mkdirSync(dir, { recursive: true });
const w = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
w('sales.json', { cols: ['t', 'id', 'stack', 'price', 'seller', 'buyer'], rows: sales });
w('items.json', { cols: ['id', 'name', 'cat', 'stackSize', 'stockSingle', 'stockStack', 'lastSingle', 'lastSingleT', 'avgSingle', 'lastStack', 'lastStackT', 'avgStack', 'sales7d', 'vol7d'], rows });
w('cats.json', catsForSite());
w('meta.json', { updated: new Date(Date.now() - 14 * 60000).toISOString(), host: 'play.example.com', items: rows.length, itemsKnown: rows.length, stockedItems: rows.filter((r) => r[4] || r[5]).length, sales: sales.length, salesArchived: sales.length, retainDays: 90, coverage24h: 412, lookupsTracked: 900, lastRun: { requests: 640, errors: 2, newSales: 31, seconds: 410 }, lastError: null });
console.log(`demo data written to ${dir}: ${sales.length} sales, ${rows.length} items`);
