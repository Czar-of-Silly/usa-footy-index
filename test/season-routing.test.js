// Phase 6C — Season-aware routing. The season is part of the URL, so an archive view survives a
// refresh, a share and Back/Forward. These exercise the real parse/serialise functions the router
// calls; the few source assertions only prove src/app.jsx is wired to them.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { req } = require("./_engine");
const A = req("src/analytics/archive.mjs");
const R = req("src/routing/routes.mjs");
const ROOT = path.join(__dirname, "..");
const app = () => fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");

// ── 1–2. a valid season in the URL is the season that loads ─────────────────
test("a valid ?season= selects that season", () => {
  assert.equal(A.parseSeasonParam("?season=2024"), 2024);
  assert.equal(A.parseSeasonParam("?season=2025"), 2025);
  assert.equal(A.parseSeasonParam("?season=2026"), 2026);
  // and it is found wherever it sits in the query string
  assert.equal(A.parseSeasonParam("?players=a,b&season=2024"), 2024);
  assert.equal(A.parseSeasonParam("?season=2024&players=a,b"), 2024);
  assert.equal(A.parseSeasonParam(new URLSearchParams("season=2025")), 2025);
});

// ── 3. no season in the URL means the current season ───────────────────────
test("a URL with no season loads the current season", () => {
  assert.equal(A.parseSeasonParam(""), A.CURRENT_SEASON);
  assert.equal(A.parseSeasonParam("?players=a,b"), A.CURRENT_SEASON);
  assert.equal(A.parseSeasonParam(undefined), A.CURRENT_SEASON);
  assert.equal(A.CURRENT_SEASON, 2026);
});

// ── 4. anything unsupported falls back safely ──────────────────────────────
test("an unsupported, future or malformed season falls back to the current season, never to a missing cache", () => {
  for (const bad of ["?season=2031", "?season=2023", "?season=1999", "?season=abc", "?season=", "?season=2024.5", "?season=-2024", "?season=null", "?season=%20"]) {
    assert.equal(A.parseSeasonParam(bad), A.CURRENT_SEASON, bad + " falls back");
  }
  // the fallback is a season we actually hold a cache for
  assert.ok(A.AVAILABLE_SEASONS.includes(A.parseSeasonParam("?season=2031")));
  assert.equal(A.isAvailableSeason(2031), false);
  assert.equal(A.isAvailableSeason(2024), true);
});

// ── 5. changing the season changes the URL ─────────────────────────────────
test("serialising a season produces a URL that names it — and the current season stays implicit", () => {
  assert.equal(A.withSeason("/players", 2024), "/players?season=2024");
  assert.equal(A.withSeason("/players", 2025), "/players?season=2025");
  assert.equal(A.withSeason("/players", 2026), "/players", "current season keeps today's clean URLs");
  assert.equal(A.withSeason("/", 2024), "/?season=2024");
  // switching season replaces the old value rather than stacking another one
  assert.equal(A.withSeason("/players?season=2024", 2025), "/players?season=2025");
  assert.equal(A.withSeason("/players?season=2024", 2026), "/players");
});
test("other query parameters survive, unencoded, so compare links stay readable", () => {
  assert.equal(A.withSeason("/compare?players=messi,bouanga", 2024), "/compare?players=messi,bouanga&season=2024");
  assert.equal(A.withSeason("/compare?players=messi,bouanga", 2026), "/compare?players=messi,bouanga");
});

// ── 6. changing tabs preserves the season ──────────────────────────────────
test("every route can carry the season, so a tab change does not drop out of the archive", () => {
  const paths = Object.values(R.ROUTE_PATHS);
  assert.ok(paths.length > 10, "the real route table");
  for (const p of paths) {
    const archived = A.withSeason(p, 2024);
    assert.ok(archived.indexOf("season=2024") > 0, p + " carries the season");
    assert.equal(A.parseSeasonParam(archived.slice(archived.indexOf("?"))), 2024, p + " parses back");
    // and the tab itself is unchanged by the round trip
    assert.equal(archived.split("?")[0], p, p + " path untouched");
  }
});

// ── 7. Back/Forward restores the season ────────────────────────────────────
test("a URL round-trips: what the router writes is what it reads back on popstate", () => {
  for (const season of A.AVAILABLE_SEASONS) {
    for (const base of ["/", "/players", "/teams", "/leaders", "/power-rankings", "/players/nkosi-tafari", "/compare?players=a,b"]) {
      const url = A.withSeason(base, season);
      const search = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";
      assert.equal(A.parseSeasonParam(search), season, url);
    }
  }
});
test("the router treats an initial route and a Back/Forward as a normalise-in-place, not a new entry", () => {
  const s = app();
  assert.match(s, /const navMode=useRef\("replace"\);/, "nav mode exists");
  assert.match(s, /onPop=\(\)=>\{if\(routeReady\.current\)\{navMode\.current="replace";/, "popstate normalises in place");
  assert.match(s, /navMode\.current==="replace"\?"replaceState":"pushState"/, "and that decides the history write");
});

// ── 8. the drill-through URL names the destination season ──────────────────
test("a career drill-through writes one URL, for the destination season", () => {
  assert.equal(A.withSeason("/players/nkosi-tafari", 2024), "/players/nkosi-tafari?season=2024");
  assert.equal(A.parseSeasonParam("?season=2024"), 2024);
  const s = app();
  assert.match(s, /const dest=withSeason\("\/players\/"\+slugify\(name\),yr,\{current:CURRENT_SEASON\}\);/, "destination URL built from the target season");
  assert.match(s, /window\.history\.pushState\(\{u:dest\},"",dest\)/, "pushed once, up front");
  assert.match(s, /if\(drillPending\.current\)return;/, "and the sync stands down while the load is in flight, so one click is one entry");
});

// ── 9. an archive URL survives a refresh ───────────────────────────────────
test("re-parsing an archive URL from scratch yields the archive season, not the current one", () => {
  const url = A.withSeason("/players/nkosi-tafari", 2024);
  // a refresh is exactly this: parse the query with no prior state at all
  assert.equal(A.parseSeasonParam(url.slice(url.indexOf("?"))), 2024);
  const s = app();
  assert.match(s, /useState\(\(\)=>parseSeasonParam\(typeof window!=="undefined"\?window\.location\.search:""/, "season state initialises from the URL");
});

// ── 10. no wall-clock year decides which data season to load ───────────────
test("the data season never comes from the calendar", () => {
  const s = app();
  const clockUses = s.match(/new Date\(\)\.getFullYear\(\)/g) || [];
  assert.equal(clockUses.length, 1, "exactly one wall-clock read remains");
  assert.match(s, /const COPYRIGHT_YEAR=new Date\(\)\.getFullYear\(\);/, "and it is the copyright line");
  assert.doesNotMatch(s, /useState\(CY\)/, "the old calendar-seeded season state is gone");
  assert.doesNotMatch(s, /const CY\s*=/, "and CY itself is gone");
  // one canonical list, no parallel hard-coded ones
  assert.match(s, /const ALL_SEASONS=SEASONS_OLDEST_FIRST;/, "the career axis derives from the canonical list");
  assert.match(s, /AVAILABLE_SEASONS\.map\(y=><option key=\{y\} value=\{y\}>\{y\}<\/option>\)/, "so does the selector");
  assert.match(s, /const years=SEASONS_OLDEST_FIRST;/, "so does the history loader");
  assert.doesNotMatch(s, /\[2024,2025,2026\]/, "no hard-coded season list survives in the app");
});
test("the canonical list and the caches on disk agree", () => {
  for (const y of A.AVAILABLE_SEASONS) {
    const f = y === A.CURRENT_SEASON ? "public/data/mls-cache.json" : `public/data/mls-cache-${y}.json`;
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${y} has a committed cache (${f})`);
  }
  assert.equal(A.CURRENT_SEASON, A.AVAILABLE_SEASONS[0], "current season is the newest available");
  assert.deepEqual(A.SEASONS_OLDEST_FIRST, [...A.AVAILABLE_SEASONS].sort((a, b) => a - b));
});

// ── navigation consistency across the app ──────────────────────────────────
test("the season is applied through one wrapper, so no route can forget it", () => {
  const s = app();
  assert.match(s, /return withSeason\(base,season,\{current:CURRENT_SEASON\}\);/, "currentUrl wraps every route");
  assert.match(s, /const wantSeason=parseSeasonParam\(loc\.search\|\|""/, "applyRoute reads the season back");
  assert.match(s, /\},\[tab,sel,expandTeam,comparePlayers,slugIndex,matchup,season\]\);/, "and a season change re-syncs the URL");
});
test("a cross-season URL defers player selection until that season's cache is loaded", () => {
  // The player index belongs to the loaded cache. Resolving a 2024 slug against the 2026 index
  // would open whoever happens to sit at that slug — the same class of false join Phase 6B.1 fixed.
  const s = app();
  assert.match(s, /const crossSeason=wantSeason!==season;/, "cross-season navigation is detected");
  assert.match(s, /if\(crossSeason\)\{drillPending\.current=\{year:wantSeason,slug\};setSel\(null\);\}/, "selection is deferred, not guessed");
  assert.match(s, /if\(raw&&!crossSeason\)/, "and compare slugs are not resolved against the wrong season either");
});
