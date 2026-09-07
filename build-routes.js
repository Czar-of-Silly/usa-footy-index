// build-routes.js — emits public/data/routes.json and public/sitemap.xml from the cache.
// Grades are computed with the live engine (same extraction as build-ask-context.js).
// slugify is identical to the one in public/index.html — keep them in sync.
const fs = require("fs");
const IDX = "public/index.html", CACHE = "public/data/mls-cache.json";
if (!fs.existsSync(IDX) || !fs.existsSync(CACHE)) { console.log("❌ Run from repo root after a fetch."); process.exit(1); }
const SITE = "https://usfootyindex.com";
const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function extract(src, fn) {
  const i = src.indexOf("function " + fn);
  if (i < 0) throw new Error(fn + " not found in index.html");
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } }
}
const src = fs.readFileSync(IDX, "utf8");
const engine = eval(extract(src, "pct") + "\n" + extract(src, "normPos") + "\n" + extract(src, "computeGrades") + "\n;({pct,normPos,computeGrades})");
const teamsSrc = src.match(/const MLS_TEAMS = \[([\s\S]*?)\];/);
const MLS_TEAMS = teamsSrc ? eval("[" + teamsSrc[1] + "]") : [];
const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

const ps = cache.players.filter(r => r && r.n).map((r, i) => {
  const m = r.m || 600, p90 = m / 90, games = Math.max(1, Math.round(m / 90));
  const pos = engine.normPos(r.p);
  return { id: "p" + i, r, n: r.n, t: r.t, m: r.m || 0, departed: !!r.departed, pos, isGK: (pos === "GK" || pos === "Goalkeeper"),
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
const rated = ps.filter(p => p.m > 0);
const grades = engine.computeGrades(rated);
const teamName = {}; for (const t of MLS_TEAMS) teamName[t.abbr] = t.name; for (const s of cache.standings || []) if (!teamName[s.team]) teamName[s.team] = s.name;

// slugs: names shared by >1 player all get a -team suffix (order-independent, matches the client)
const byName = {}; ps.forEach(p => { const k = slugify(p.n); byName[k] = (byName[k] || 0) + 1; });
const players = {};
for (const p of ps) {
  const base = slugify(p.n); const slug = byName[base] > 1 ? base + "-" + slugify(p.t) : base;
  if (players[slug]) continue;
  const g = grades[p.id]; const r = p.r;
  players[slug] = { n: p.n, t: p.t, tn: teamName[p.t] || p.t, pos: p.pos, g: g && Number.isFinite(g.overall) ? Math.round(g.overall) : null, gl: r.g || 0, as: r.as || 0, m: p.m, h: r.localHeadshot || null };
}

// team grades (minutes-weighted, departed excluded) + power rank (same 50/30/20 as the Table tab)
const teamGrade = {}, teams = {};
const standings = cache.standings || [];
for (const s of standings) { let ws = 0, wt = 0; for (const p of rated) { if (p.t !== s.team || p.departed) continue; const g = grades[p.id]; if (!g || !Number.isFinite(g.overall)) continue; ws += g.overall * p.m; wt += p.m; } teamGrade[s.team] = wt > 0 ? Math.round(ws / wt) : null; }
const maxPts = Math.max(...standings.map(s => s.pts || 0), 1);
const power = standings.map(s => { const tm = (cache.matches || []).filter(m => m.completed && (m.home === s.team || m.away === s.team)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5); let fp = 0; for (const m of tm) { const hs = +(m.homeScore || 0), as = +(m.awayScore || 0); const home = m.home === s.team; fp += (home ? hs > as : as > hs) ? 3 : hs === as ? 1 : 0; } const f = tm.length ? (fp / (tm.length * 3)) * 100 : 50; return { team: s.team, score: Math.round(((s.pts || 0) / maxPts) * 100 * .5 + (teamGrade[s.team] || 50) * .3 + f * .2) }; }).sort((a, b) => b.score - a.score);
const powerRank = {}; power.forEach((t, i) => { powerRank[t.team] = i + 1; });
for (const s of standings) { const name = teamName[s.team] || s.name; teams[slugify(name)] = { abbr: s.team, name, conf: s.conf, g: teamGrade[s.team], pts: s.pts, rank: powerRank[s.team], logo: s.logo || null }; }
for (const t of MLS_TEAMS) { const slug = slugify(t.name); if (!teams[slug]) teams[slug] = { abbr: t.abbr, name: t.name, conf: t.conf || null, g: null, pts: null, rank: null, logo: null }; }

const fixtures = (cache.matches || []).filter(m => !m.completed && m.home && m.away && m.date && Date.parse(m.date) > Date.now() - 3 * 3600e3).sort((a, b) => a.date.localeCompare(b.date)).map(m => ({ id: m.id, home: m.home, away: m.away, date: m.date, status: m.status || "" }));
fs.writeFileSync("public/data/routes.json", JSON.stringify({ generated: cache.generated, season: cache.season, players, teams, fixtures }));

// sitemap: sections + teams + rated players
const lastmod = (cache.generated || new Date().toISOString()).slice(0, 10);
const urls = [["/", "daily", "1.0"], ["/players", "daily", "0.9"], ["/teams", "daily", "0.9"], ["/power-rankings", "daily", "0.9"], ["/leaders", "daily", "0.8"], ["/values", "weekly", "0.7"], ["/positions", "weekly", "0.7"], ["/compare", "weekly", "0.6"], ["/trade-machine", "weekly", "0.6"], ["/ask", "weekly", "0.6"], ["/season-ratings", "weekly", "0.6"], ["/defense", "weekly", "0.6"], ["/passing", "weekly", "0.6"], ["/methodology", "weekly", "0.7"]];
for (const slug of Object.keys(teams)) urls.push(["/teams/" + slug, "daily", "0.8"]);
for (const f of fixtures) urls.push(["/matchup/" + f.home.toLowerCase() + "-v-" + f.away.toLowerCase(), "daily", "0.7"]);
for (const [slug, p] of Object.entries(players)) if (p.m > 0) urls.push(["/players/" + slug, "weekly", "0.6"]);
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(([u, f, pr]) => "  <url><loc>" + SITE + u + "</loc><lastmod>" + lastmod + "</lastmod><changefreq>" + f + "</changefreq><priority>" + pr + "</priority></url>").join("\n") + "\n</urlset>\n";
fs.writeFileSync("public/sitemap.xml", xml);
console.log("✅ routes.json: " + Object.keys(players).length + " players, " + Object.keys(teams).length + " teams, " + fixtures.length + " fixtures \u00b7 sitemap.xml: " + urls.length + " URLs");
