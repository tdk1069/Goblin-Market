// End to end: mock search server -> scraper -> JSON. Run twice to check de-duplication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startMock } from './mock-server.mjs';

const T = Math.floor(Date.now() / 1000);
const world = {
  categories: {
    2: [{ id: 100, single: 3, stack: 0xffffffff }, { id: 101, single: 0xffffffff, stack: 0xffffffff }],
    35: [{ id: 4096, single: 2, stack: 5 }, { id: 4097, single: 0xffffffff, stack: 1 }, { id: 4098, single: 1, stack: 0xffffffff }, { id: 4099, single: 0xffffffff, stack: 0xffffffff }],
  },
  history: {
    '100:0': [
      { price: 5000, time: T - 7200, seller: 'Alice', buyer: 'Bob' },
      { price: 5500, time: T - 3600, seller: 'Alice', buyer: 'Cara' },
    ],
    '4096:0': [{ price: 1200, time: T - 600, seller: 'Dave', buyer: 'Bob' }],
    '4096:1': [{ price: 14000, time: T - 1800, seller: 'Eve', buyer: 'Alice' }],
  },
};
const names = { 100: 'Test Dagger', 4096: ['Fire Crystal', 12], 4097: ['Ice Crystal', 12], 4098: ['Wind Crystal', 12], 4099: ['Earth Crystal', 12], 101: ['Bronze Knife', 1] };

const { server, port, hits } = await startMock(world);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luvlyah-test-'));
fs.writeFileSync(path.join(dir, 'names.json'), JSON.stringify(names));

const run = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, ['scraper/scrape.mjs'], {
    env: {
      ...process.env,
      SEARCH_HOST: '127.0.0.1', SEARCH_PORT: String(port),
      STATE_DIR: path.join(dir, 'state'), OUT_DIR: path.join(dir, 'out'),
      NAMES_FILE: path.join(dir, 'names.json'), ITEM_SQL_URL: 'none',
      REQUEST_DELAY_MS: '5', TIME_BUDGET_MIN: '1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('scraper exit ' + c))));
});

const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'out', 'data', f), 'utf8'));

await run();
let sales = read('sales.json');
assert.equal(sales.rows.length, 4, 'four sales stored');
assert.equal(sales.rows[0][0], T - 600, 'newest first');
const buyers = new Set(sales.rows.map((r) => r[5]));
assert.deepEqual([...buyers].sort(), ['Alice', 'Bob', 'Cara']);

const items = read('items.json');
const col = (r, n) => r[items.cols.indexOf(n)];
const fire = items.rows.find((r) => col(r, 'id') === 4096);
assert.equal(col(fire, 'name'), 'Fire Crystal');
assert.equal(col(fire, 'stockSingle'), 2);
assert.equal(col(fire, 'stockStack'), 5);
assert.equal(col(fire, 'lastSingle'), 1200);
assert.equal(col(fire, 'lastStack'), 14000);
assert.equal(col(items.rows.find((r) => col(r, 'id') === 100), 'avgSingle'), 5250);
assert.ok(!items.rows.find((r) => col(r, 'id') === 4099), 'item with no stock and no sales is not listed');
assert.ok(items.rows.find((r) => col(r, 'id') === 4097), 'stack-only stock is listed');
assert.equal(col(items.rows.find((r) => col(r, 'id') === 4097), 'stockSingle'), 0, '0xFFFFFFFF means none');
// 101 is unstackable (1 lookup); 100 has no known stack size and the 4 crystals are stackable (2 each) = 11.
assert.equal(hits.history, 1 + 2 + 4 * 2, 'history lookups');
console.log('history requests first run:', hits.history);

const before = hits.history;
await run(); // everything was just checked: nothing due, nothing duplicated
sales = read('sales.json');
assert.equal(sales.rows.length, 4, 'no duplicates on second run');
assert.equal(hits.history, before, 'recent lookups are not repeated');
const meta = read('meta.json');
assert.equal(meta.sales, 4);
assert.equal(meta.lastError, null);

server.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log('all scraper checks passed');
