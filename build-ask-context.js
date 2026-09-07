#!/usr/bin/env node
/**
 * USA Footy Index — Ask USFI context builder
 *
 * Extracts the REAL grading engine (pct/normPos/computeGrades) straight out of
 * public/index.html, runs it against public/data/mls-cache.json, and distills
 * everything the chatbot needs into a compact public/data/ask-context.json:
 *
 *   - standings (both conferences)
 *   - leaders: top scorers, assists, tacklers; top 10 by Overall per position
 *   - full player index: [name, team, pos, overall, goals, assists, tackles, mins]
 *     for every player with minutes — so the bot can answer about ANYONE
 *
 * Because the engine is extracted from the shipped page, the bot's grades are
 * always identical to what visitors see — engine changes propagate on the
 * next run automatically. Run from repo root (in the Action, after fetch).
 */

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

const IDX = "public/index.html";
const CACHE = "public/data/mls-cache.json";
const OUT = "public/data/ask-context.json";
if (!fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }

const engine = loadEngine();

const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const prep = loadPrep();
const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string" && (r.m || 0) > 0).map(prep.validatePlayer);
const ps = validated.map(prep.preparePlayerForGrading);
const grades = engine.computeGrades(ps);

const rated = ps.filter(p => grades[p.id] && Number.isFinite(grades[p.id].overall));
const row = p => [p.raw.n, p.raw.t, p.pos, Math.round(grades[p.id].overall), p.raw.g, p.raw.as, p.raw.tk, p.raw.m];

const leadersByPos = {};
for (const pos of ["Forward", "Midfielder", "Defender", "GK"]) {
  leadersByPos[pos] = rated.filter(p => p.pos === pos && p.raw.m >= 450)
    .sort((a, b) => grades[b.id].overall - grades[a.id].overall).slice(0, 10).map(row);
}
const topBy = (k, n = 5) => rated.filter(p => (p.raw[k] || 0) > 0)
  .sort((a, b) => (b.raw[k] || 0) - (a.raw[k] || 0)).slice(0, n).map(row);

// last 21 days of finals, newest first: [YYYY-MM-DD, home, hs, as, away]
const cutoff = Date.now() - 21 * 864e5;
const recentResults = (cache.matches || [])
  .filter(m => m && m.completed && m.date && Date.parse(m.date) >= cutoff)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  .map(m => [String(m.date).slice(0, 10), m.home, +m.homeScore || 0, +m.awayScore || 0, m.away]);

// transfers: arrivals from the article engine's confirmed list, departures
// from the cache's departed-player lifecycle. newsroom: approved articles.
let transfers = { arrivals: [], departures: [] };
try {
  const st = JSON.parse(fs.readFileSync("public/data/articles-state.json", "utf8"));
  const pt = st.playerTeams || {};
  transfers.arrivals = (st.announced || []).map(n => [n, (pt[n] && pt[n].t) || null]).filter(a => a[1]);
} catch (e) {}
transfers.departures = (cache.players || []).filter(p => p && p.departed && p.n).map(p => [p.n, p.t]).slice(0, 40);

let newsroom = [];
try {
  const arts = JSON.parse(fs.readFileSync("public/data/articles.json", "utf8"));
  newsroom = (Array.isArray(arts) ? arts : [])
    .filter(a => a && a.status === "approved" && a.headline)
    .sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")))
    .slice(0, 10)
    .map(a => [String(a.created || "").slice(0, 10), a.kicker || "", a.headline, a.dek || ""]);
} catch (e) {}

const ctx = {
  generated: new Date().toISOString(),
  season: cache.season || 2026,
  note: "grades: 42-99 scale computed by the USA Footy Index engine; player rows are [name, team, position, overall, goals, assists, tackles, minutes]; recentResults rows are [date, homeTeam, homeGoals, awayGoals, awayTeam], newest first; transfers holds confirmed arrivals/departures as [name, team]; newsroom rows are [date, kicker, headline, dek] from the Index's own published articles",
  standings: (cache.standings || []).map(s => ({ team: s.team, name: s.name, conf: s.conf, pts: s.pts, w: s.w, d: s.d, l: s.l, gf: s.gf, ga: s.ga })),
  recentResults,
  transfers,
  newsroom,
  topRatedByPosition: leadersByPos,
  topScorers: topBy("g"),
  topAssists: topBy("as"),
  topTacklers: topBy("tk"),
  players: rated.map(row)
};
fs.writeFileSync(OUT, JSON.stringify(ctx));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log("✅ " + OUT + " written (" + kb + " KB, " + rated.length + " graded players)");
