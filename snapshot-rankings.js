// snapshot-rankings.js — append today's real rankings to public/data/rank-history.json
// Reuses the live grading engine from public/index.html (same extraction as build-ask-context.js)
// and the same power formula as the Table tab: 50% points + 30% team grade + 20% last-5 form.
// The front end shows week-over-week arrows only when a snapshot >= 5 days old exists.
// One entry per calendar day (ET); re-running on the same day replaces that day's entry.
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
const IDX = "public/index.html", CACHE = "public/data/mls-cache.json", OUT = "public/data/rank-history.json";
if (!fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }

const engine = loadEngine();
const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

// Grading Integrity item 1: same canonical pipeline as the web app and every other build script.
const prep = loadPrep();
const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string" && (r.m || 0) > 0).map(prep.validatePlayer);
const ps = validated.map(prep.preparePlayerForGrading);
const grades = engine.computeGrades(ps);

// minutes-weighted team grade, departed players excluded (mirrors enrichedTeams)
const teamGrade = {};
for (const s of cache.standings) {
  let ws = 0, wt = 0;
  for (const p of ps) { if (p.raw.t !== s.team || p.raw.departed) continue; const g = grades[p.id]; if (!g || !Number.isFinite(g.overall)) continue; ws += g.overall * p.raw.m; wt += p.raw.m; }
  teamGrade[s.team] = wt > 0 ? Math.round(ws / wt) : 55;
}

// points table (pts, gd, gf)
const table = [...cache.standings].sort((a, b) => (b.pts || 0) - (a.pts || 0) || ((b.gf || 0) - (b.ga || 0)) - ((a.gf || 0) - (a.ga || 0)) || (b.gf || 0) - (a.gf || 0));
const tableRank = {}; table.forEach((s, i) => { tableRank[s.team] = i + 1; });

// power = 50% normalized pts + 30% grade + 20% last-5 form (identical to the Table tab)
const maxPts = Math.max(...cache.standings.map(s => s.pts || 0), 1);
const power = cache.standings.map(s => {
  const tm = cache.matches.filter(m => m.completed && (m.home === s.team || m.away === s.team)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  let fp = 0; for (const m of tm) { const hs = +(m.homeScore || 0), as = +(m.awayScore || 0); const home = m.home === s.team; fp += (home ? hs > as : as > hs) ? 3 : hs === as ? 1 : 0; }
  const formScore = tm.length ? (fp / (tm.length * 3)) * 100 : 50;
  return { team: s.team, score: Math.round(((s.pts || 0) / maxPts) * 100 * .5 + (teamGrade[s.team] || 50) * .3 + formScore * .2) };
}).sort((a, b) => b.score - a.score);
const powerRank = {}; power.forEach((t, i) => { powerRank[t.team] = i + 1; });

const day = new Date(cache.generated || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD in ET
let hist = [];
try { hist = JSON.parse(fs.readFileSync(OUT, "utf8")); if (!Array.isArray(hist)) hist = []; } catch { hist = []; }
hist = hist.filter(h => h && h.day !== day);
hist.push({ day, date: cache.generated || new Date().toISOString(), table: tableRank, grade: teamGrade, power: powerRank });
hist.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
hist = hist.slice(-120);
fs.writeFileSync(OUT, JSON.stringify(hist));
console.log("✅ rank-history: " + hist.length + " snapshot(s), latest " + day + " — power #1 " + power[0].team + ", grade #1 " + Object.entries(teamGrade).sort((a, b) => b[1] - a[1])[0][0] + ", table #1 " + table[0].team);
