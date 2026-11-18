// Item names. The search service only knows item ids, the game client knows names.
//
// Order of preference:
//   1. data/names.json  - exact names exported from the game with tools/luvlyah-names (optional)
//   2. names derived from the LandSandBoat item_basic.sql (underscored names, title-cased) - the default
//   3. "Item #id"
import fs from 'node:fs';
import path from 'node:path';

const SMALL = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'on', 'to', 'for', 'with', 'from', 'de', 'du', 'la', 'le']);
const ROMAN = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix']);

export function prettyName(raw) {
  const words = String(raw).replace(/\\'/g, "'").split('_').filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w;
      if (ROMAN.has(w)) return w.toUpperCase();
      return w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    })
    .join(' ');
}

// item_basic columns: itemid, subid, name, sortname, name_jp, type, stackSize, flags, aH, BaseSell
// type/flags/aH are SQL variables (e.g. @FURNISHING_TYPE, @FLAG_EX | @FLAG_NODELIVERY), not plain numbers.
export function parseItemBasicSql(text) {
  const out = new Map();
  const re = /\(\s*(\d+)\s*,\s*-?\d+\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'(?:[^'\\]|\\.|'')*'\s*,\s*[^,]+,\s*(\d+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    const name = m[2];
    if (!name || name === '.' || name.startsWith('.')) continue;
    out.set(id, { name: prettyName(name), stack: Number(m[4]) || 1 });
  }
  return out;
}

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
};

export async function loadNames({ stateDir, namesFile, sqlUrl, log = console.log }) {
  const names = new Map();

  // 2. derived (cached in the state folder so we only download once)
  const cachePath = path.join(stateDir, 'item-derived.json');
  let derived = readJson(cachePath);
  if (!derived && sqlUrl && sqlUrl !== 'none') {
    try {
      log(`names: downloading ${sqlUrl}`);
      const res = await fetch(sqlUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = parseItemBasicSql(await res.text());
      if (parsed.size < 1000) throw new Error(`only parsed ${parsed.size} items, format not recognised`);
      derived = Object.fromEntries([...parsed].map(([id, v]) => [id, [v.name, v.stack]]));
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(derived));
      log(`names: derived ${parsed.size} names from item_basic.sql`);
    } catch (e) {
      log(`names: could not derive names (${e.message}); items will show as "Item #id" unless data/names.json exists`);
    }
  }
  for (const [id, v] of Object.entries(derived || {})) names.set(Number(id), { name: v[0], stack: v[1] });

  // 1. exact names win
  const exact = namesFile ? readJson(namesFile) : null;
  if (exact) {
    let n = 0;
    for (const [id, v] of Object.entries(exact)) {
      const name = Array.isArray(v) ? v[0] : v;
      const stack = Array.isArray(v) ? v[1] : names.get(Number(id))?.stack;
      if (name) { names.set(Number(id), { name, stack }); n++; }
    }
    log(`names: ${n} exact names from ${path.basename(namesFile)}`);
  }
  return names;
}
