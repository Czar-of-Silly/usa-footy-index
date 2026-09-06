// validate-cache.js — fail-closed validation of public/data/mls-cache.json
// Exit 1 on any problem so CI never commits a broken cache.
//   node validate-cache.js            (validates public/data/mls-cache.json)
//   node validate-cache.js path.json  (validates another file)
const fs = require("fs");
const path = process.argv[2] || "public/data/mls-cache.json";
if (!fs.existsSync(path)) { console.log("❌ " + path + " not found"); process.exit(1); }
const c = JSON.parse(fs.readFileSync(path, "utf8"));
const problems = [];
const warn = [];
const now = Date.now();
const isDate = (s) => typeof s === "string" && Number.isFinite(Date.parse(s));
const badStr = (v) => v === "null" || v === "undefined" || v === "NaN";

// ── header
if (!isDate(c.generated)) problems.push("generated is not a valid ISO date: " + JSON.stringify(c.generated));
else if (now - Date.parse(c.generated) > 2 * 864e5) warn.push("generated is more than 2 days old (" + c.generated + ")");
else if (Date.parse(c.generated) - now > 3600e3) problems.push("generated is in the future: " + c.generated);
if (!Array.isArray(c.dataSources) || !c.dataSources.length) problems.push("dataSources missing or empty");
if (!Number.isInteger(c.season)) problems.push("season is not an integer");

// ── players
const ps = Array.isArray(c.players) ? c.players : [];
if (ps.length < 700) problems.push("only " + ps.length + " players (expected 700+)");
const seen = new Map();
let literalNull = 0, missingReq = 0;
ps.forEach((p, i) => {
  if (!p || typeof p !== "object") { problems.push("player[" + i + "] is not an object"); return; }
  if (!p.n || !p.t || !p.p) missingReq++;
  const k = (p.n || "") + "|" + (p.t || "");
  if (seen.has(k)) problems.push("duplicate player: " + k); else seen.set(k, i);
  for (const [f, v] of Object.entries(p)) {
    if (badStr(v)) { literalNull++; if (literalNull <= 5) problems.push("player " + p.n + " has literal '" + v + "' in " + f); }
    if (typeof v === "number" && !Number.isFinite(v)) problems.push("player " + p.n + " has non-finite " + f);
  }
  if (p.m != null && (p.m < 0 || p.m > 40 * 90 * 1.2)) problems.push("player " + p.n + " impossible minutes " + p.m);
});
if (missingReq) problems.push(missingReq + " players missing n/t/p");
if (literalNull > 5) problems.push("(" + (literalNull - 5) + " more literal null/undefined strings)");

// ── standings
const st = Array.isArray(c.standings) ? c.standings : [];
if (st.length !== 30) problems.push("standings has " + st.length + " rows (expected 30)");
const teams = new Set();
for (const s of st) {
  if (!s.team || !s.name) { problems.push("standings row missing team/name"); continue; }
  if (teams.has(s.team)) problems.push("duplicate standings team " + s.team); teams.add(s.team);
  if (!["Eastern", "Western"].includes(s.conf)) problems.push(s.team + " bad conf " + s.conf);
  for (const f of ["w", "d", "l", "pts", "gf", "ga"]) if (!Number.isInteger(s[f]) || s[f] < 0) problems.push(s.team + " bad " + f + "=" + s[f]);
  if (Number.isInteger(s.w) && Number.isInteger(s.d) && Number.isInteger(s.pts) && s.pts !== 3 * s.w + s.d) problems.push(s.team + " pts " + s.pts + " != 3W+D " + (3 * s.w + s.d));
  if (Number.isInteger(s.w) && s.w + s.d + s.l > 40) problems.push(s.team + " played " + (s.w + s.d + s.l) + " games");
}

// ── matches / fixtures
const ms = Array.isArray(c.matches) ? c.matches : [];
const mids = new Set();
for (const m of ms) {
  if (!isDate(m.date)) { problems.push("match " + m.id + " invalid date " + m.date); continue; }
  if (m.id) { if (mids.has(m.id)) problems.push("duplicate match id " + m.id); mids.add(m.id); }
  if (!m.home || !m.away) problems.push("match " + m.id + " missing teams");
  if (teams.size && (!teams.has(m.home) || !teams.has(m.away))) warn.push("match " + m.id + " team not in standings: " + m.home + "/" + m.away);
  const t = Date.parse(m.date);
  if (m.completed) {
    if (!Number.isFinite(+m.homeScore) || !Number.isFinite(+m.awayScore)) problems.push("completed match " + m.id + " has non-numeric score");
    if (t > now) problems.push("match " + m.id + " completed but kicks off in the future " + m.date);
  } else {
    // an "upcoming" fixture must not have kicked off more than 3 hours ago
    if (t < now - 3 * 3600e3) problems.push("fixture " + m.id + " " + m.home + "-" + m.away + " marked upcoming but dated " + m.date);
  }
}

// ── report
for (const w of warn) console.log("  ⚠️  " + w);
if (problems.length) {
  console.log("\n🚨 CACHE VALIDATION FAILED — " + problems.length + " problem(s):");
  problems.slice(0, 40).forEach(p => console.log("   • " + p));
  if (problems.length > 40) console.log("   … " + (problems.length - 40) + " more");
  process.exit(1);
}
console.log("✅ cache valid: " + ps.length + " players, " + st.length + " teams, " + ms.length + " matches, generated " + c.generated);
