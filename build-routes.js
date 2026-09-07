// build-routes.js — emits public/data/routes.json and public/sitemap.xml from the cache.
// Grades are computed with the live engine (same extraction as build-ask-context.js).
// slugify is identical to the one in public/index.html — keep them in sync.
// Phase 5.3: the engine lives in src/grading/engine.mjs (canonical). Loaded synchronously via createRequire
// (Node ≥ 22.12 supports require(esm)); falls back to extracting from a source file for older Node.
function loadEngine() {
  const { createRequire } = require("module");
  try { const e = createRequire(__filename)("./src/grading/engine.mjs"); if (e && e.computeGrades) return e; } catch (err) { /* older Node: fall through */ }
  const fs = require("fs");
  const src = fs.readFileSync("src/grading/engine.mjs", "utf8").replace(/^export\s+/gm, "");
  const extract = (fn) => { const i = src.indexOf("function " + fn + "("); if (i < 0) throw new Error(fn + " not found"); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } } };
  return eval(extract("pct") + "\n" + extract("normPos") + "\n" + extract("toG") + "\n" + extract("computeGrades") + "\n;({pct,normPos,computeGrades})");
}
// Grading Integrity item 1: the canonical validate+prepare pipeline lives in src/grading/prepare-player.mjs
// — the SAME transformation the web app uses, so this script's grades can never silently diverge
// from what visitors see. Loaded synchronously via createRequire, same pattern as loadEngine() above.
function loadPrep() {
  const { createRequire } = require("module");
  try { const p = createRequire(__filename)("./src/grading/prepare-player.mjs"); if (p && p.preparePlayerForGrading) return p; } catch (err) { /* older Node: fall through */ }
  const fs = require("fs");
  const engineSrc = fs.readFileSync("src/grading/engine.mjs", "utf8").replace(/^export\s+/gm, "");
  const prepSrc = fs.readFileSync("src/grading/prepare-player.mjs", "utf8").replace(/^import[^\n]*\n/gm, "").replace(/^export\s+/gm, "");
  const extractFrom = (src, fn) => { const i = src.indexOf("function " + fn + "("); if (i < 0) throw new Error(fn + " not found"); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } } };
  const extractConst = (src, name) => { const m = src.match(new RegExp("const " + name + "=[^\\n]*;")); if (!m) throw new Error(name + " not found"); return m[0]; };
  const code = extractFrom(engineSrc, "normPos") + "\n" + extractConst(prepSrc, "safeNum") + "\n" + extractFrom(prepSrc, "validatePlayer") + "\n" + extractFrom(prepSrc, "preparePlayerForGrading") + "\n;({safeNum,validatePlayer,preparePlayerForGrading})";
  return eval(code);
}

const fs = require("fs");
const IDX = "public/index.html", CACHE = "public/data/mls-cache.json";
if (!fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }
const SITE = "https://usfootyindex.com";
const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const engine = loadEngine();
const MLS_TEAMS = (() => { try { return require("module").createRequire(__filename)("./src/data/teams.mjs").MLS_TEAMS; } catch (e) { const t = require("fs").readFileSync("src/data/teams.mjs", "utf8"); const m = t.match(/const MLS_TEAMS = \[([\s\S]*?)\];/); return m ? eval("[" + m[1] + "]") : []; } })();
const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

const prep = loadPrep();
const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(prep.validatePlayer);
const ps = validated.map(prep.preparePlayerForGrading);
const rated = ps.filter(p => (p.raw.m || 0) > 0);
const grades = engine.computeGrades(rated);
const teamName = {}; for (const t of MLS_TEAMS) teamName[t.abbr] = t.name; for (const s of cache.standings || []) if (!teamName[s.team]) teamName[s.team] = s.name;

// slugs: names shared by >1 player all get a -team suffix (order-independent, matches the client)
const byName = {}; ps.forEach(p => { const k = slugify(p.raw.n); byName[k] = (byName[k] || 0) + 1; });
const players = {};
for (const p of ps) {
  const base = slugify(p.raw.n); const slug = byName[base] > 1 ? base + "-" + slugify(p.raw.t) : base;
  if (players[slug]) continue;
  const g = grades[p.id]; const r = p.raw;
  players[slug] = { n: r.n, t: r.t, tn: teamName[r.t] || r.t, pos: p.pos, g: g && Number.isFinite(g.overall) ? Math.round(g.overall) : null, gl: r.g || 0, as: r.as || 0, m: r.m, h: r.localHeadshot || null, prov: (r.m || 0) < 450 };
}

// team grades (minutes-weighted, departed excluded) + power rank (same 50/30/20 as the Table tab)
const teamGrade = {}, teams = {};
const standings = cache.standings || [];
for (const s of standings) { let ws = 0, wt = 0; for (const p of rated) { if (p.raw.t !== s.team || p.raw.departed) continue; const g = grades[p.id]; if (!g || !Number.isFinite(g.overall)) continue; ws += g.overall * p.raw.m; wt += p.raw.m; } teamGrade[s.team] = wt > 0 ? Math.round(ws / wt) : null; }
const maxPts = Math.max(...standings.map(s => s.pts || 0), 1);
const power = standings.map(s => { const tm = (cache.matches || []).filter(m => m.completed && (m.home === s.team || m.away === s.team)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5); let fp = 0; for (const m of tm) { const hs = +(m.homeScore || 0), as = +(m.awayScore || 0); const home = m.home === s.team; fp += (home ? hs > as : as > hs) ? 3 : hs === as ? 1 : 0; } const f = tm.length ? (fp / (tm.length * 3)) * 100 : 50; return { team: s.team, score: Math.round(((s.pts || 0) / maxPts) * 100 * .5 + (teamGrade[s.team] || 50) * .3 + f * .2) }; }).sort((a, b) => b.score - a.score);
const powerRank = {}; power.forEach((t, i) => { powerRank[t.team] = i + 1; });
for (const s of standings) { const name = teamName[s.team] || s.name; teams[slugify(name)] = { abbr: s.team, name, conf: s.conf, g: teamGrade[s.team], pts: s.pts, rank: powerRank[s.team], logo: s.logo || null }; }
for (const t of MLS_TEAMS) { const slug = slugify(t.name); if (!teams[slug]) teams[slug] = { abbr: t.abbr, name: t.name, conf: t.conf || null, g: null, pts: null, rank: null, logo: null }; }

const fixtures = (cache.matches || []).filter(m => !m.completed && m.home && m.away && m.date && Date.parse(m.date) > Date.now() - 3 * 3600e3).sort((a, b) => a.date.localeCompare(b.date)).map(m => ({ id: m.id, home: m.home, away: m.away, date: m.date, status: m.status || "" }));
fs.writeFileSync("public/data/routes.json", JSON.stringify({ generated: cache.generated, season: cache.season, players, teams, fixtures }));

// sitemap: sections + teams + rated players
const lastmod = (cache.generated || new Date().toISOString()).slice(0, 10);
const urls = [["/", "daily", "1.0"], ["/players", "daily", "0.9"], ["/teams", "daily", "0.9"], ["/power-rankings", "daily", "0.9"], ["/leaders", "daily", "0.8"], ["/values", "weekly", "0.7"], ["/positions", "weekly", "0.7"], ["/compare", "weekly", "0.6"], ["/trade-machine", "weekly", "0.6"], ["/ask", "weekly", "0.6"], ["/season-ratings", "weekly", "0.6"], ["/defense", "weekly", "0.6"], ["/passing", "weekly", "0.6"], ["/methodology", "weekly", "0.7"], ["/matchups", "daily", "0.8"]];
for (const slug of Object.keys(teams)) urls.push(["/teams/" + slug, "daily", "0.8"]);
for (const f of fixtures) urls.push(["/matchup/" + f.home.toLowerCase() + "-v-" + f.away.toLowerCase(), "daily", "0.7"]);
for (const [slug, p] of Object.entries(players)) if (p.m > 0) urls.push(["/players/" + slug, "weekly", "0.6"]);
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(([u, f, pr]) => "  <url><loc>" + SITE + u + "</loc><lastmod>" + lastmod + "</lastmod><changefreq>" + f + "</changefreq><priority>" + pr + "</priority></url>").join("\n") + "\n</urlset>\n";
fs.writeFileSync("public/sitemap.xml", xml);
console.log("✅ routes.json: " + Object.keys(players).length + " players, " + Object.keys(teams).length + " teams, " + fixtures.length + " fixtures \u00b7 sitemap.xml: " + urls.length + " URLs");
