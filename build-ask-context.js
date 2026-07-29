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

const fs = require("fs");

const IDX = "public/index.html";
const CACHE = "public/data/mls-cache.json";
const OUT = "public/data/ask-context.json";
if (!fs.existsSync(IDX) || !fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }

function extract(src, fn) {
  const i = src.indexOf("function " + fn);
  if (i < 0) throw new Error(fn + " not found in index.html");
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); }
  }
}
const src = fs.readFileSync(IDX, "utf8");
const engine = eval(extract(src, "pct") + "\n" + extract(src, "normPos") + "\n" + extract(src, "computeGrades") + "\n;({pct,normPos,computeGrades})");

const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const ps = cache.players.filter(r => r && r.n && (r.m || 0) > 0).map((r, i) => {
  const m = r.m || 600, p90 = m / 90, games = Math.max(1, Math.round(m / 90));
  const pos = engine.normPos(r.p);
  return { id: "p" + i, n: r.n, t: r.t, m, g: r.g || 0, as: r.as || 0, tkRaw: r.tk || 0, pos,
    isGK: (pos === "GK" || pos === "Goalkeeper"),
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

const rated = ps.filter(p => grades[p.id] && Number.isFinite(grades[p.id].overall));
const row = p => [p.n, p.t, p.pos, Math.round(grades[p.id].overall), p.g, p.as, p.tkRaw, p.m];

const leadersByPos = {};
for (const pos of ["Forward", "Midfielder", "Defender", "GK"]) {
  leadersByPos[pos] = rated.filter(p => p.pos === pos && p.m >= 450)
    .sort((a, b) => grades[b.id].overall - grades[a.id].overall).slice(0, 10).map(row);
}
const topBy = (k, n = 5) => rated.filter(p => (p[k] || 0) > 0)
  .sort((a, b) => (b[k] || 0) - (a[k] || 0)).slice(0, n).map(row);

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
  topTacklers: topBy("tkRaw"),
  players: rated.map(row)
};
fs.writeFileSync(OUT, JSON.stringify(ctx));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log("✅ " + OUT + " written (" + kb + " KB, " + rated.length + " graded players)");
