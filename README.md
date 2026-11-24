# Goblin Market

A static website for searching auction house sales: items, stock, buyers, sellers, and a profile page for every character. It is hosted on GitHub Pages and needs no server of your own.

## How it works

Browsers cannot talk to the game's auction house search service, because it uses a raw TCP connection with its own encryption. So a scheduled GitHub Action does that part:

1. Every hour the Action connects to the search service (the same one the in-game AH menu uses, and the one `searchclient.lua` in LuvlyAH talks to).
2. It reads stock for every category, then the recent sales for each item, newest-checked-last.
3. It merges new sales into a running archive, writes JSON files, and publishes the site.
4. The website loads those JSON files and does all searching in your browser. It loads the overview figures and the last 24 hours of sales first (about 100 KB), then the rest of the history in the background (`scraper/pack.mjs` describes the file format).

The archive lives on a branch called `data`, which is rewritten as a single commit each run so the repository stays small. The website only shows the last 90 days.

## Setup (about 5 minutes)

1. Create a **public** repository on GitHub and push this folder to it. Free GitHub Pages needs a public repository, and Actions minutes are unlimited for public repositories.
2. Open **Settings, Pages** and set **Source** to **GitHub Actions**.
3. If the search server is not `play.pheonix-xi.com` on port 54002, open **Settings, Secrets and variables, Actions, Variables** and add `SEARCH_HOST` (and `SEARCH_PORT` if needed). Check the spelling of the host, because the LuvlyAH author flagged it as unverified.
4. Open the **Actions** tab, choose **Update market data**, and press **Run workflow**. The first run needs a few minutes.
5. Your site is at `https://YOUR-NAME.github.io/REPOSITORY-NAME/`.

If the first run fails with "could not reach", the server is not accepting connections from GitHub's runners (some servers only allow certain IP addresses). The Action cannot work in that case.

## Settings

Add any of these as repository **Variables** (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `SEARCH_HOST` | `play.pheonix-xi.com` | Search server address |
| `SEARCH_PORT` | `54002` | Search server port |
| `TIME_BUDGET_MIN` | `12` | Minutes each run may spend looking up sales |
| `REQUEST_DELAY_MS` | `350` | Pause between requests, to be kind to the server |
| `RETAIN_DAYS` | `90` | How many days of sales the website loads |

The schedule is in `.github/workflows/update.yml` (`cron`). GitHub does not run scheduled jobs more often than every 5 minutes and can delay them. It also switches scheduled workflows off after 60 days with no activity in a public repository; if that happens, press **Enable workflow** on the Actions tab.

Items with stock are checked first and re-checked at least every 25 minutes; everything else rotates through every 6 hours or so. A very busy item can have gaps between checks, because the server only reports its latest few sales.

## Item names

The search service only reports item ids. By default names are derived from the open-source LandSandBoat `item_basic.sql`, so they are title-cased (apostrophes are missing, custom items show as `Item #id`). For exact names, use the optional helper:

1. Copy `tools/luvlyah-names/luvlyah_names.lua` to `<Ashita>\addons\luvlyah_names\`.
2. In game run `/addon load luvlyah_names`, then `/lahnames`.
3. Copy `<Ashita>\config\addons\luvlyah_names\names.json` to `data/names.json` in this repository and commit it.

## Try it locally with fake data

```
node tools/make-demo.mjs
python3 -m http.server -d web 8080
```

Then open http://localhost:8080. (Opening `index.html` directly will not work, browsers block loading the data files that way.) Delete `web/data` afterwards; it is git-ignored anyway.

## Tests

```
node test/proto.test.mjs     # protocol checked against the vectors in searchclient.lua
node test/scrape.test.mjs    # scraper checked against a mock search server
```

Node 20 or newer, no packages to install.

## Notes

- The protocol code is a port of `searchclient.lua`. It reproduces that file's known-good test vectors byte for byte, but it has not been run against the live server.
- Searches ignore case, apostrophes and punctuation, so `kings ring` finds King's Ring.
- The watchlist (☆ Watch on item and character pages) is saved in each visitor's own browser.
- Search syntax on the Sales page: type a name, or use `buyer:Name`, `seller:Name`, `item:name`, `player:Name`. Put the name in quotes for an exact match, for example `buyer:"Tavaria"`.
- An unofficial fan tool. Please keep the request delay reasonable; the search service belongs to someone else.
