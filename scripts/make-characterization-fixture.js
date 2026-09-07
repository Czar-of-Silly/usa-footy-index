#!/usr/bin/env node
// scripts/make-characterization-fixture.js — Phase 5.3 Step 1.
// Snapshots the CURRENTLY SHIPPED grading behaviour so the source split can be proven not to change it.
// Uses the verbatim engine + the app's verbatim validate/prepare code (from the pre-rewritten source),
// runs the same pool rule the app uses, and records grades for a representative set of real players
// plus synthetic edge cases. Also snapshots computeForm, indexLean, powerRankFor and route resolution.
//
//   node scripts/make-characterization-fixture.js --src /tmp/prerewritten.js
//   (default: reads the pre-split app straight out of public/index.html via the splitter's pre-rewrites)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
let srcPath = args.includes("--src") ? args[args.indexOf("--src") + 1] : null;
if (!srcPath) { srcPath = path.join(require("os").tmpdir(), "usfi-prerewritten.js"); execFileSync(process.execPath, ["scripts/split-source.js", "--dry", "--emit-src", srcPath], { stdio: "pipe" }); }
const src = fs.readFileSync(srcPath, "utf8");

function extract(fn) { const i = src.indexOf("function " + fn + "("); if (i < 0) throw new Error(fn + " not found"); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } } }
function extractConst(name) { const m = src.match(new RegExp("const " + name + "=[^\\n]*;")); if (!m) throw new Error(name + " not found"); return m[0]; }
const code = [extract("pct"), extract("normPos"), extract("toG"), extract("computeGrades"), extractConst("safeNum"), extract("validatePlayer"), extract("preparePlayerForGrading"), extract("matchRating"), extract("computeForm"), extract("indexLean"), extract("powerRankFor"), extract("slugify"),
  src.match(/const ROUTE_PATHS=[^\n]*;/)[0], src.match(/const PATH_TABS=[^\n]*\n(?:PATH_TABS\[[^\n]*\n)*/)[0],
  "\n;({pct,normPos,toG,computeGrades,validatePlayer,preparePlayerForGrading,matchRating,computeForm,indexLean,powerRankFor,slugify,ROUTE_PATHS,PATH_TABS})"].join("\n");
const E = eval(code);

const cache = JSON.parse(fs.readFileSync("public/data/mls-cache.json", "utf8"));
// exactly the app's pipeline
const allRaw = cache.players;
const validated = allRaw.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
const inter = validated.map(E.preparePlayerForGrading);
const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
const byName = {}; inter.forEach(p => { byName[p.raw.n + "|" + p.raw.t] = p; });
const pick = (pred, sortKey, dir = -1) => inter.filter(p => grades[p.id] && pred(p)).sort((a, b) => dir * (grades[a.id][sortKey] - grades[b.id][sortKey]));
const isPos = (p, re) => re.test(p.raw.p || "");
const g = (p) => { const x = grades[p.id]; return { overall: x.overall, attack: x.attack, passing: x.passing, defense: x.defense, creativity: x.creativity, carrying: x.carrying }; };
const med = (arr) => arr[Math.floor(arr.length / 2)];
const fw = pick(p => isPos(p, /Forward/) && p.raw.m >= 900, "overall"), mf = pick(p => isPos(p, /Midfielder/) && p.raw.m >= 900, "overall"), df = pick(p => isPos(p, /Defender/) && p.raw.m >= 900, "overall"), gk = pick(p => p.isGK && p.raw.m >= 900, "overall");
const negGA = inter.find(p => grades[p.id] && p.tga < -0.5 && p.raw.m >= 600);
const lowMin = inter.find(p => grades[p.id] && p.raw.m > 0 && p.raw.m <= 120);
const partial = inter.find(p => grades[p.id] && p.raw.m >= 600 && (p.raw.xg == null || p.raw.xg === 0) && (p.raw.tk == null || p.raw.tk === 0));
const fixtures = {
  "elite forward": fw[0], "average forward": med(fw), "low-rated forward": fw[fw.length - 1],
  "elite midfielder": mf[0], "average midfielder": med(mf),
  "elite defender": df[0], "average defender": med(df),
  "goalkeeper": gk[0], "low-minute player": lowMin, "partial stats": partial, "negative goals added": negGA,
};
const players = {};
for (const [label, p] of Object.entries(fixtures)) { if (!p) { console.warn("no fixture for " + label); continue; } players[label] = { key: p.raw.n + "|" + p.raw.t, mins: p.raw.m, pos: p.raw.p, grades: g(p) }; }

// distribution — cheap whole-pool guard
const all = Object.values(grades).map(x => x.overall).sort((a, b) => a - b);
const dist = { n: all.length, min: all[0], p25: all[Math.floor(all.length * .25)], median: med(all), p75: all[Math.floor(all.length * .75)], max: all[all.length - 1], sumOverall: Math.round(all.reduce((s, v) => s + v, 0) * 10) / 10 };

// form
const formPlayer = inter.find(p => p.raw.matchLog && p.raw.matchLog.length >= 10 && /Forward/.test(p.raw.p));
const formDef = inter.find(p => p.raw.matchLog && p.raw.matchLog.length >= 10 && /Defender/.test(p.raw.p));
const form = {};
for (const [k, p] of [["forward", formPlayer], ["defender", formDef]]) if (p) { const f = E.computeForm(p.raw.matchLog, p.raw.p); form[k] = { key: p.raw.n + "|" + p.raw.t, ratings: f.ratings, last5Avg: f.last5Avg, seasonAvg: f.seasonAvg, delta: f.delta, basis: f.basis, res: f.res }; }

// matchup lean + power rank (needs team grades = app's enrichedTeams logic: minutes-weighted mean of overall, departed excluded)
const teams = cache.standings.map(s => { let ws = 0, wt = 0, count = 0; for (const p of inter) { if (p.raw.t !== s.team || p.raw.departed) continue; const x = grades[p.id]; if (!x) continue; ws += x.overall * (p.raw.m || 0); wt += (p.raw.m || 0); count++; } return { abbr: s.team, overall: wt > 0 ? ws / wt : 55, count }; });
const lean = {}; for (const [gd, pg] of [[3, 0.26], [-3, -0.26], [0, 0], [10, 1], [null, 0.5], [null, null]]) lean[String(gd) + "|" + String(pg)] = E.indexLean(gd, pg);
const power = {}; for (const s of cache.standings) power[s.team] = E.powerRankFor(s.team, teams, cache.standings, cache.matches);

// routes
const routes = { "/table": E.PATH_TABS["/table"], "/data-status": E.PATH_TABS["/data-status"], "/about-the-index": E.PATH_TABS["/about-the-index"], "/valuations": E.PATH_TABS["/valuations"], "/matchups": E.PATH_TABS["/matchups"], slugs: ["Lionel Messi", "Émil Forsberg", "Heung-min Son", "Dániel Gazdag"].map(E.slugify) };

const out = { generatedFrom: cache.generated, note: "Snapshot of shipped behaviour before the Phase 5.3 source split. Regenerate only when a behaviour change is intended and reviewed.", players, distribution: dist, form, indexLean: lean, powerRank: power, routes };
fs.mkdirSync("test/fixtures", { recursive: true });
fs.writeFileSync("test/fixtures/characterization.json", JSON.stringify(out, null, 1));
console.log("✅ test/fixtures/characterization.json:", Object.keys(players).length, "players,", Object.keys(form).length, "form,", Object.keys(power).length, "power ranks; pool", dist.n, "median", dist.median);
for (const [k, v] of Object.entries(players)) console.log("  " + k.padEnd(22), v.key.padEnd(30), JSON.stringify(v.grades));
