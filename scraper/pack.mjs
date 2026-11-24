// Compact files the website loads, shared by the scraper, the demo data generator and the tests.
// Sale rows in: [time, itemId, stack(0|1), price, seller, buyer], newest first.
//
// Sales files: names are stored once and referenced by index (-1 = none). Rows stay newest
// first and each row's time is stored as seconds before the previous row (the first row is
// relative to `base`), which keeps the numbers small and compresses well.

export const RECENT_HOURS = 24;

export function packSales(rows) {
  const names = [], idx = new Map();
  const ref = (n) => {
    if (!n) return -1;
    let i = idx.get(n);
    if (i === undefined) { i = names.length; names.push(n); idx.set(n, i); }
    return i;
  };
  const base = rows.length ? rows[0][0] : 0;
  let prev = base;
  return {
    v: 2, cols: ['dt', 'id', 'stack', 'price', 'seller', 'buyer'], base, names,
    rows: rows.map((r) => { const dt = prev - r[0]; prev = r[0]; return [dt, r[1], r[2], r[3], ref(r[4]), ref(r[5])]; }),
  };
}

export function unpackSales(f) {
  const nm = (i) => (i >= 0 ? f.names[i] : '');
  let t = f.base;
  return f.rows.map((r) => { t -= r[0]; return [t, r[1], r[2], r[3], nm(r[4]), nm(r[5])]; });
}

// Everything the overview page shows that needs more than the last day of sales.
export function buildOverview(rows, nowSec) {
  const HOURS = 14 * 24;
  const hourStart = Math.floor(nowSec / 3600) * 3600 - (HOURS - 1) * 3600;
  const gil = new Array(HOURS).fill(0), n = new Array(HOURS).fill(0);
  const weekAgo = nowSec - 7 * 86400;
  const week = rows.filter((r) => r[0] >= weekAgo);
  for (const r of rows) {
    const h = Math.floor((r[0] - hourStart) / 3600);
    if (h >= 0 && h < HOURS) { gil[h] += r[3]; n[h]++; }
  }
  const people = new Set();
  const top = (col) => {
    const m = new Map();
    for (const r of week) {
      const name = r[col];
      if (!name) continue;
      const k = name.toLowerCase(), a = m.get(k) || [name, 0, 0];
      a[1] += r[3]; a[2]++; m.set(k, a);
    }
    return [...m.values()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  };
  for (const r of week) { if (r[4]) people.add(r[4].toLowerCase()); if (r[5]) people.add(r[5].toLowerCase()); }
  return {
    hourStart, gil, n,
    week: { gil: week.reduce((s, r) => s + r[3], 0), n: week.length, people: people.size },
    biggest: [...week].sort((a, b) => b[3] - a[3]).slice(0, 6),
    buyers: top(5), sellers: top(4),
  };
}

// Writes the site's sales files via `write(name, obj)`:
// sales-recent.json (last RECENT_HOURS), sales-older.json (the rest) and overview.json.
export function writeSalesFiles(rows, nowSec, write) {
  const cut = nowSec - RECENT_HOURS * 3600;
  write('sales-recent.json', packSales(rows.filter((r) => r[0] >= cut)));
  write('sales-older.json', packSales(rows.filter((r) => r[0] < cut)));
  write('overview.json', buildOverview(rows, nowSec));
}
