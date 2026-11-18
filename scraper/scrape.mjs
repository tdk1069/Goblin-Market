// Pulls AH stock and sales history from the game's search service and writes
// static JSON for the website. Meant to run on a schedule (see .github/workflows/update.yml).
import fs from 'node:fs';
import path from 'node:path';
import { fetchList, fetchHistory, count } from './proto.mjs';
import { CAT_IDS, catsForSite } from './cats.mjs';
import { loadNames } from './names.mjs';

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const HOST = env('SEARCH_HOST', 'play.phoenix-xi.com');
const PORT = Number(env('SEARCH_PORT', 54002));
const STATE_DIR = env('STATE_DIR', 'state');
const OUT_DIR = env('OUT_DIR', '_site');
const NAMES_FILE = env('NAMES_FILE', 'data/names.json');
const SQL_URL = env('ITEM_SQL_URL', 'https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_basic.sql');
const BUDGET_MS = Number(env('TIME_BUDGET_MIN', 12)) * 60_000;
const DELAY_MS = Number(env('REQUEST_DELAY_MS', 350));
const RETAIN_DAYS = Number(env('RETAIN_DAYS', 90)); // how much history the website loads
const ARCHIVE_DAYS = Number(env('ARCHIVE_DAYS', 365)); // how much is kept in the state branch
const RECHECK_STOCKED_MIN = Number(env('RECHECK_STOCKED_MIN', 25));
const RECHECK_OTHER_MIN = Number(env('RECHECK_OTHER_MIN', 360));
const MAX_CONSECUTIVE_ERRORS = 8;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

const started = Date.now();
const elapsed = () => Date.now() - started;

/* ------------------------------ load state ------------------------------- */

const salesFile = path.join(STATE_DIR, 'sales.json');
const trackFile = path.join(STATE_DIR, 'track.json');
const itemsFile = path.join(STATE_DIR, 'items-state.json');
const firstRun = !fs.existsSync(salesFile) && !fs.existsSync(itemsFile);

// sale row: [time, itemId, stack(0|1), price, seller, buyer]
let sales = readJson(salesFile, { rows: [] }).rows;
const keyOf = (r) => `${r[1]}|${r[2]}|${r[0]}|${r[3]}|${r[4]}|${r[5]}`;
const seen = new Set(sales.map(keyOf));
const track = readJson(trackFile, {}); // "id:0|1" -> unix time of last successful history fetch
const itemState = readJson(itemsFile, {}); // id -> { c: category, s: single stock, k: stack stock }

const names = await loadNames({ stateDir: STATE_DIR, namesFile: NAMES_FILE, sqlUrl: SQL_URL, log });

const stats = { requests: 0, errors: 0, newSales: 0, listsOk: 0, listsFailed: 0, historyOk: 0, lastError: null };

async function withRetry(fn, tries = 2) {
  let err;
  for (let i = 0; i < tries; i++) {
    stats.requests++;
    try { return await fn(); } catch (e) { err = e; stats.errors++; stats.lastError = e.message; await sleep(1000); }
  }
  throw err;
}

/* ---------------------- 1. stock per category (cheap) -------------------- */

log(`search server ${HOST}:${PORT}, ${CAT_IDS.length} categories`);
for (const cat of CAT_IDS) {
  try {
    const res = await withRetry(() => fetchList(HOST, PORT, cat, []));
    for (const it of res.items || []) {
      itemState[it.id] = { c: cat, s: count(it.single), k: count(it.stack) };
    }
    stats.listsOk++;
  } catch (e) {
    stats.listsFailed++;
    log(`category ${cat} failed: ${e.message}`);
    if (stats.listsFailed >= 5 && stats.listsOk === 0) break; // server is not answering
  }
  await sleep(DELAY_MS);
}

if (stats.listsOk === 0) {
  log('no category lists could be fetched from the search server');
  if (firstRun) {
    console.error(`First run could not reach ${HOST}:${PORT}. Check SEARCH_HOST/SEARCH_PORT and that the server accepts connections from GitHub's runners.`);
    process.exit(1);
  }
}

/* ---------------------- 2. sales history (rate limited) ------------------ */

if (stats.listsOk > 0) {
  const targets = [];
  for (const [idStr, it] of Object.entries(itemState)) {
    const id = Number(idStr);
    const stackSize = names.get(id)?.stack;
    const kinds = [[0, it.s > 0]];
    if (stackSize === undefined || stackSize > 1) kinds.push([1, it.k > 0]);
    for (const [stack, stocked] of kinds) {
      const last = track[`${id}:${stack}`] || 0;
      const minAge = (stocked ? RECHECK_STOCKED_MIN : RECHECK_OTHER_MIN) * 60;
      if (now() - last < minAge) continue;
      targets.push({ id, stack, stocked, last });
    }
  }
  // Stocked items first, then whatever was checked longest ago.
  targets.sort((a, b) => (b.stocked - a.stocked) || (a.last - b.last) || (a.id - b.id));
  log(`${targets.length} history lookups due (${targets.filter((t) => t.stocked).length} for items in stock)`);

  let consecutive = 0;
  let done = 0;
  for (const t of targets) {
    if (elapsed() > BUDGET_MS) { log('time budget reached'); break; }
    try {
      const res = await withRetry(() => fetchHistory(HOST, PORT, t.id, !!t.stack), 2);
      consecutive = 0;
      stats.historyOk++;
      track[`${t.id}:${t.stack}`] = now();
      for (const e of res.entries || []) {
        if (!e.time || !e.price) continue;
        const row = [e.time, t.id, t.stack, e.price, e.seller, e.buyer];
        const k = keyOf(row);
        if (seen.has(k)) continue;
        seen.add(k);
        sales.push(row);
        stats.newSales++;
      }
    } catch (e) {
      consecutive++;
      if (consecutive >= MAX_CONSECUTIVE_ERRORS) { log('too many consecutive errors, stopping early'); break; }
    }
    done++;
    if (done % 200 === 0) log(`${done}/${targets.length} lookups, ${stats.newSales} new sales`);
    await sleep(DELAY_MS);
  }
  log(`history: ${stats.historyOk} lookups ok, ${stats.newSales} new sales`);
}

/* ------------------------------- save state ------------------------------ */

const cutoffArchive = now() - ARCHIVE_DAYS * 86400;
sales = sales.filter((r) => r[0] >= cutoffArchive);
sales.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
writeJson(salesFile, { v: 1, rows: sales });
writeJson(trackFile, track);
writeJson(itemsFile, itemState);

/* ------------------------------ publish data ----------------------------- */

const cutoffSite = now() - RETAIN_DAYS * 86400;
const published = sales.filter((r) => r[0] >= cutoffSite).sort((a, b) => b[0] - a[0] || b[1] - a[1]);

// Per item aggregates, like the addon's /lah price: last sale + average of the last five.
const agg = new Map(); // "id:stack" -> { last, lastT, sum, n, c7, v7 }
const weekAgo = now() - 7 * 86400;
for (const r of published) { // newest first
  const k = `${r[1]}:${r[2]}`;
  let a = agg.get(k);
  if (!a) { a = { last: r[3], lastT: r[0], sum: 0, n: 0, c7: 0, v7: 0 }; agg.set(k, a); }
  if (a.n < 5) { a.sum += r[3]; a.n++; }
  if (r[0] >= weekAgo) { a.c7++; a.v7 += r[3]; }
}

const itemRows = [];
const seenIds = new Set([...Object.keys(itemState).map(Number), ...published.map((r) => r[1])]);
for (const id of seenIds) {
  const st = itemState[id] || { c: 0, s: 0, k: 0 };
  const a0 = agg.get(`${id}:0`), a1 = agg.get(`${id}:1`);
  if (!(st.s > 0 || st.k > 0 || a0 || a1)) continue; // nothing to show for this item
  const nm = names.get(id);
  itemRows.push([
    id,
    nm?.name || `Item #${id}`,
    st.c,
    nm?.stack || 1,
    st.s, st.k,
    a0 ? a0.last : 0, a0 ? a0.lastT : 0, a0 ? Math.round(a0.sum / a0.n) : 0,
    a1 ? a1.last : 0, a1 ? a1.lastT : 0, a1 ? Math.round(a1.sum / a1.n) : 0,
    (a0?.c7 || 0) + (a1?.c7 || 0),
    (a0?.v7 || 0) + (a1?.v7 || 0),
  ]);
}
itemRows.sort((a, b) => a[1].localeCompare(b[1]));

const dataDir = path.join(OUT_DIR, 'data');
writeJson(path.join(dataDir, 'items.json'), {
  cols: ['id', 'name', 'cat', 'stackSize', 'stockSingle', 'stockStack',
    'lastSingle', 'lastSingleT', 'avgSingle', 'lastStack', 'lastStackT', 'avgStack', 'sales7d', 'vol7d'],
  rows: itemRows,
});
writeJson(path.join(dataDir, 'sales.json'), { cols: ['t', 'id', 'stack', 'price', 'seller', 'buyer'], rows: published });
writeJson(path.join(dataDir, 'cats.json'), catsForSite());

const lookups24h = Object.values(track).filter((t) => t > now() - 86400).length;
const meta = {
  updated: new Date().toISOString(),
  host: HOST,
  items: itemRows.length,
  itemsKnown: Object.keys(itemState).length,
  stockedItems: itemRows.filter((r) => r[4] > 0 || r[5] > 0).length,
  sales: published.length,
  salesArchived: sales.length,
  retainDays: RETAIN_DAYS,
  coverage24h: lookups24h,
  lookupsTracked: Object.keys(track).length,
  lastRun: { requests: stats.requests, errors: stats.errors, newSales: stats.newSales, seconds: Math.round(elapsed() / 1000) },
  lastError: stats.listsOk === 0 ? (stats.lastError || 'search server unreachable') : null,
};
writeJson(path.join(dataDir, 'meta.json'), meta);

log(`published ${itemRows.length} items, ${published.length} sales (${sales.length} archived)`);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Market data update\n\n| | |\n|---|---|\n| Requests | ${stats.requests} (${stats.errors} errors) |\n` +
    `| New sales | ${stats.newSales} |\n| Sales published | ${published.length} |\n| Items shown | ${itemRows.length} |\n` +
    `| History lookups in last 24h | ${lookups24h} |\n| Runtime | ${meta.lastRun.seconds}s |\n`);
}
