import { load, loadOlder, state } from './data.js';
import { h, ago } from './ui.js';
import * as V from './views.js';

const main = document.getElementById('main');

/* theme: auto -> light -> dark */
const themeBtn = document.getElementById('theme');
const themes = ['auto', 'light', 'dark'];
let theme = 'auto';
try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* storage blocked */ }
function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'auto' ? 'Theme: auto' : theme === 'light' ? 'Theme: light' : 'Theme: dark';
}
themeBtn.addEventListener('click', () => {
  theme = themes[(themes.indexOf(theme) + 1) % themes.length];
  try { localStorage.setItem('theme', theme === 'auto' ? '' : theme); } catch { /* ignore */ }
  applyTheme();
});
applyTheme();

/* routing */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: Object.fromEntries(new URLSearchParams(query)) };
}

const TITLE = 'Goblin Market';
function route() {
  const { parts, params } = parseHash();
  const [view = 'overview', arg] = parts;
  let title = TITLE, nav = view;
  main.replaceChildren();
  if (view === 'sales') { V.salesView(main, params); title = 'Sales'; }
  else if (view === 'items') { V.itemsView(main, params); title = 'Items'; }
  else if (view === 'item' && arg) { V.itemView(main, arg, params); nav = 'items'; title = state.itemById.get(Number(arg))?.name || 'Item'; }
  else if (view === 'players') { V.playersView(main, params); title = 'Characters'; }
  else if (view === 'player' && arg) { V.playerView(main, arg); nav = 'players'; title = arg; }
  else { V.overview(main); nav = 'overview'; }
  document.title = title === TITLE ? TITLE : `${title} - ${TITLE}`;
  for (const a of document.querySelectorAll('nav a')) {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

function showFreshness() {
  const el = document.getElementById('fresh');
  const m = state.meta;
  const t = Date.parse(m.updated) / 1000;
  const age = Date.now() / 1000 - t;
  el.textContent = `Updated ${ago(t)}`;
  if (age > 3 * 3600) { el.classList.add('stale'); el.title = 'The scheduled update has not run for a while, so this data may be out of date.'; }
  if (m.lastError) { el.classList.add('stale'); el.textContent = 'Last update could not reach the server'; el.title = m.lastError; }

  const about = document.getElementById('about');
  about.replaceChildren(
    h('p', null, `Sales come from the auction house search service on ${m.host}. It only reports the most recent sales for each item, and the collector checks items in rotation, so a very busy item can have gaps between checks.`),
    h('p', null, `${m.sales.toLocaleString('en-GB')} sales from the last ${m.retainDays} days, ${m.items.toLocaleString('en-GB')} items, ${m.coverage24h.toLocaleString('en-GB')} price lookups in the last day.`));
}

async function boot() {
  try {
    await load();
  } catch (e) {
    main.replaceChildren(h('section', { class: 'empty big' },
      h('h1', null, 'No market data yet'),
      h('p', null, 'The collector has not published any data. In the repository, open the Actions tab, choose “Update market data” and press Run workflow. The site fills in once it finishes.'),
      h('p', { class: 'muted small' }, `Technical detail: ${e.message}`)));
    return;
  }
  showFreshness();
  window.addEventListener('hashchange', route);
  route();
  loadOlder(); // the rest of the history, in the background; views that need it wait for it

}
boot();
