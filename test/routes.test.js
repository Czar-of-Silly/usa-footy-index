const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..");
const { load, extract } = require("./_engine");
const E = load();

test("slugify: diacritics, spaces, punctuation", () => {
  assert.equal(E.slugify("Lionel Messi"), "lionel-messi");
  assert.equal(E.slugify("Émil Forsberg"), "emil-forsberg");
  assert.equal(E.slugify("Heung-min Son"), "heung-min-son");
  assert.equal(E.slugify("  O'Neill "), "o-neill");
});
test("slugify parity between client and build-routes.js", () => {
  const br = fs.readFileSync(path.join(ROOT, "build-routes.js"), "utf8");
  const m = br.match(/const slugify = \(s\) => ([^\n]+);/);
  assert.ok(m, "build-routes slugify found");
  const server = eval("(s) => " + m[1]);
  for (const n of ["Léo Afonso", "Kévin Denkey", "Dániel Gazdag", "Przemysław Płacheta", "Junior Alonso"]) assert.equal(server(n), E.slugify(n), n);
});
test("client route tables: aliases resolve", () => {
  const { ROUTE_PATHS, PATH_TABS } = require("./_engine").req("src/routing/routes.mjs");
  assert.equal(PATH_TABS["/table"], "rankings"); assert.equal(PATH_TABS["/data-status"], "methodology"); assert.equal(PATH_TABS["/valuations"], "valuations");
  for (const [tab, p] of Object.entries(ROUTE_PATHS)) assert.equal(PATH_TABS[p], tab, p);
});

// edge metadata (pure)
test("edge metaFor: sections, aliases, players, teams, matchups, 404s", async () => {
  const mod = await import(path.join(ROOT, "functions/[[path]].js"));
  const routes = { season: 2026, players: { "leo-messi": { n: "Leo Messi", t: "MIA", tn: "Inter Miami CF", pos: "Forward", g: 99, gl: 18, as: 10, m: 1740, h: "headshots/leo-messi.png" } },
    teams: { "atlanta-united-fc": { abbr: "ATL", name: "Atlanta United FC", conf: "Eastern", g: 70, pts: 22, rank: 28, logo: null }, "orlando-city-sc": { abbr: "ORL", name: "Orlando City SC", conf: "Eastern", g: 73, pts: 28, rank: 20, logo: "https://x/orl.png" } },
    fixtures: [{ home: "ATL", away: "ORL", date: "2026-09-09T23:30Z" }] };
  assert.equal(mod.metaFor("/", routes).meta, null);
  assert.match(mod.metaFor("/players", null).meta.title, /Player Grades/);
  assert.equal(mod.metaFor("/table", null).meta.url, "https://usfootyindex.com/power-rankings");
  assert.equal(mod.metaFor("/data-status", null).meta.url, "https://usfootyindex.com/methodology");
  const pm = mod.metaFor("/players/leo-messi", routes); assert.equal(pm.status, 200); assert.match(pm.meta.title, /Leo Messi/); assert.equal(pm.meta.jsonld["@type"], "Person"); assert.match(pm.meta.image, /headshots\/leo-messi\.png$/);
  assert.equal(mod.metaFor("/players/nobody", routes).status, 404);
  const tm = mod.metaFor("/teams/orlando-city-sc", routes); assert.equal(tm.meta.jsonld["@type"], "SportsTeam"); assert.equal(tm.meta.image, "https://x/orl.png");
  const mu = mod.metaFor("/matchup/orl-v-atl", routes); assert.equal(mu.meta.url, "https://usfootyindex.com/matchup/atl-v-orl", "venue from fixture wins"); assert.equal(mu.meta.jsonld.startDate, "2026-09-09T23:30Z");
  assert.equal(mod.metaFor("/matchup/zzz-v-atl", routes).status, 404);
  assert.equal(mod.metaFor("/matchups", null).status, 200);
  assert.equal(mod.metaFor("/not-a-page", null).status, 404);
});

test("sitemap: absolute https URLs, includes sections and no duplicates", () => {
  const xml = fs.readFileSync(path.join(ROOT, "public/sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length > 100);
  assert.ok(locs.every(u => u.startsWith("https://usfootyindex.com/")));
  assert.equal(new Set(locs).size, locs.length, "no duplicate URLs");
  for (const p of ["/", "/players", "/teams", "/power-rankings", "/methodology", "/matchups"]) assert.ok(locs.includes("https://usfootyindex.com" + p), p);
});
