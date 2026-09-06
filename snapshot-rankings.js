// snapshot-rankings.js — append today's real rankings to public/data/rank-history.json
// Reuses the live grading engine from public/index.html (same extraction as build-ask-context.js)
// and the same power formula as the Table tab: 50% points + 30% team grade + 20% last-5 form.
// The front end shows week-over-week arrows only when a snapshot >= 5 days old exists.
// One entry per calendar day (ET); re-running on the same day replaces that day's entry.
const fs = require("fs");
const IDX = "public/index.html", CACHE = "public/data/mls-cache.json", OUT = "public/data/rank-history.json";
if (!fs.existsSync(IDX) || !fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }

function extract(src, fn) {
  const i = src.indexOf("function " + fn);
  if (i < 0) throw new Error(fn + " not found in index.html");
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } }
}
const src = fs.readFileSync(IDX, "utf8");
const engine = eval(extract(src, "pct") + "\n" + extract(src, "normPos") + "\n" + extract(src, "computeGrades") + "\n;({pct,normPos,computeGrades})");
const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

// same per-player shaping as build-ask-context.js
const ps = cache.players.filter(r => r && r.n && (r.m || 0) > 0).map((r, i) => {
  const m = r.m || 600, p90 = m / 90, games = Math.max(1, Math.round(m / 90));
  const pos = engine.normPos(r.p);
  return { id: "p" + i, n: r.n, t: r.t, m, departed: !!r.departed, pos, isGK: (pos === "GK" || pos === "Goalkeeper"),
    tk90: (r.tk || 0) / p90, tkwPct: (r.tk >= 8 ? (r.tkw || 0) / r.tk : 0), blk90: (r.blk || 0) / p90,
    xg90: (r.xg || 0) / p90, xa90: (r.xa || 0) / p90, pc: r.pp || 75, pga: r.gp || 0,
    tga: (r.gs || 0) + (r.gp || 0) + (r.gdr || 0) + (r.gdf || 0) + (r.gi || 0), dga: (r.gdf || 0) + (r.gi || 0),
    kp90: (r.kp || 0) / p90, sca90: (r.sca || 0) / p90, prgp90: (r.prgp || 0) / p90, ftp90: (r.ftp || 0) / p90,
    prs90: (r.prs || 0) / p90, intc90: (r.intc || 0) / p90, arl90: (r.arl || 0) / p90, drb90: (r.drb || 0) / p90, prgc90: (r.prgc || 0) / p90,
    oxg90: (r.oxg || 0) / p90, chc90: (r.chc || 0) / p90, clr90: (r.clr || 0) / p90, flSuf90: (r.flSuf || 0) / p90,
    arlPctV: (r.arlPct || 0), n90s: m / 90, gdrV: (r.gdr || 0), escV: (r.esc || 0), presRV: (r.presR || 0), passPerfV: (r.passPerf || 0),
    sv90: (r.sv || 0) / p90, csRate: games > 0 ? (r.cs || 0) / games : 0, gaCon90: games > 0 ? (r.ga_conceded || 0) / p90 : 0,
    gkEff90: games > 0 ? (r.gkEfficiency || 0) / games : 0, svMls90: (r.gkSavesMLS || 0) / p90, mlsPrs90: (r.mlsPressures || 0) / p90,
    dpas90: (r.mlsDifficultPasses || 0) / p90, passPerf90: games > 0 ? (r.mlsPassingPerformance || 0) / games : 0,
    dpasPct: (r.mlsDifficultPassesPct || 0), passesPctMls: (r.mlsPassesPct || r.pp || 0),
    claim90: ((r.mlsIntCorner || 0) + (r.mlsIntHeld || 0)) / p90, sweep90: ((r.mlsIntCross || 0) + (r.mlsIntFisted || 0)) / p90,
    aerWonRate: (r.mlsAerialsTotal > 0 ? (r.mlsAerialsWon || 0) / r.mlsAerialsTotal : 0) };
});
const grades = engine.computeGrades(ps);

// minutes-weighted team grade, departed players excluded (mirrors enrichedTeams)
const teamGrade = {};
for (const s of cache.standings) {
  let ws = 0, wt = 0;
  for (const p of ps) { if (p.t !== s.team || p.departed) continue; const g = grades[p.id]; if (!g || !Number.isFinite(g.overall)) continue; ws += g.overall * p.m; wt += p.m; }
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
