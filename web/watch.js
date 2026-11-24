// The viewer's watchlist: items and characters they starred, kept in this browser only.

const KEY = 'gm-watch';
let data = { items: [], players: [] };
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw && Array.isArray(raw.items) && Array.isArray(raw.players)) data = raw;
} catch { /* storage blocked or bad JSON: start empty */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage blocked: keep for this visit only */ }
}

const listFor = (kind) => data[kind === 'item' ? 'items' : 'players'];
const keyFor = (kind, v) => (kind === 'item' ? Number(v) : String(v).toLowerCase());

export function isWatched(kind, v) {
  return listFor(kind).includes(keyFor(kind, v));
}

export function toggle(kind, v) {
  const list = listFor(kind), k = keyFor(kind, v);
  const i = list.indexOf(k);
  if (i >= 0) list.splice(i, 1); else list.push(k);
  save();
  return i < 0;
}

export const watchedItems = () => [...data.items];
export const watchedPlayers = () => [...data.players];
export const watchCount = () => data.items.length + data.players.length;
