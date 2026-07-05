// test-apifootball.js
// Run locally:  node test-apifootball.js
// Reads APIFOOTBALL_KEY from your .env (no npm install needed).
// Confirms the key works, finds the MLS league id, and checks whether
// per-player tackles actually come back populated for the 2026 season.
// Paste the full output back to Claude.

const fs = require("fs");

// ── load .env (tiny parser, no dependency) ──────────────────────────────────
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const KEY = process.env.APIFOOTBALL_KEY;
if (!KEY) {
  console.log("❌ No APIFOOTBALL_KEY found. Paste your key into .env after APIFOOTBALL_KEY=");
  process.exit(1);
}

const BASE = "https://v3.football.api-sports.io";
async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": KEY } });
  const json = await res.json();
  return { http: res.status, json };
}
const SEASON = 2026;

(async () => {
  console.log("─".repeat(64));
  console.log("  API-FOOTBALL — MLS tackle availability test");
  console.log("─".repeat(64));

  // 1) key sanity + quota
  let r = await api("/status");
  if (r.http !== 200 || !r.json.response) {
    console.log("❌ status call failed:", r.http, JSON.stringify(r.json).slice(0, 200));
    process.exit(1);
  }
  const sub = r.json.response.subscription || {};
  const req = r.json.response.requests || {};
  console.log(`\n  [1] key OK ✅  plan=${sub.plan}  requests today=${req.current}/${req.limit_day}`);

  // 2) find the MLS league id (so we don't hardcode the wrong one)
  r = await api("/leagues?search=Major League Soccer");
  const leagues = (r.json.response || []).filter(L => /major league soccer/i.test(L.league?.name) && L.country?.name === "USA");
  if (!leagues.length) {
    console.log("\n  [2] ⚠ couldn't find MLS via search; trying country=USA list…");
    r = await api("/leagues?country=USA");
  }
  const mls = (r.json.response || []).find(L => /major league soccer/i.test(L.league?.name));
  if (!mls) {
    console.log("  ❌ MLS league not found. Raw names:", (r.json.response || []).map(L => L.league?.name).slice(0, 20));
    process.exit(1);
  }
  const LEAGUE = mls.league.id;
  const seasonsCovered = (mls.seasons || []).map(s => s.year);
  const has2026 = (mls.seasons || []).find(s => s.year === SEASON);
  console.log(`\n  [2] MLS league id = ${LEAGUE}  ("${mls.league.name}", ${mls.country.name})`);
  console.log(`      seasons covered: ${seasonsCovered.slice(-6).join(", ")}`);
  if (has2026 && has2026.coverage) {
    const cov = has2026.coverage;
    const ps = cov.players;
    const fs_ = cov.fixtures && cov.fixtures.statistics_players;
    console.log(`      2026 coverage → players:${ps}  fixture player-stats:${fs_}`);
  } else {
    console.log(`      ⚠ 2026 not listed in coverage; will still try the call.`);
  }

  // 3) pull page 1 of MLS players for 2026 and inspect the tackles object
  r = await api(`/players?league=${LEAGUE}&season=${SEASON}&page=1`);
  if (r.http !== 200) {
    console.log(`\n  [3] players call HTTP ${r.http}:`, JSON.stringify(r.json.errors || r.json).slice(0, 200));
    process.exit(1);
  }
  if (r.json.errors && Object.keys(r.json.errors).length) {
    console.log(`\n  [3] API returned errors:`, JSON.stringify(r.json.errors));
  }
  const rows = r.json.response || [];
  console.log(`\n  [3] players page 1: ${rows.length} players (paging total ${r.json.paging?.total})`);
  if (!rows.length) {
    console.log("      ⚠ Empty. 2026 player stats may not be published yet on the free plan.");
    process.exit(0);
  }

  // 4) the verdict: are tackles populated?
  let withTk = 0, withInt = 0, withDrb = 0, withDuel = 0;
  const sample = [];
  for (const p of rows) {
    const st = (p.statistics || [])[0] || {};
    const tk = st.tackles || {};
    const du = st.duels || {};
    const dr = st.dribbles || {};
    if (tk.total != null) withTk++;
    if (tk.interceptions != null) withInt++;
    if (dr.attempts != null) withDrb++;
    if (du.won != null) withDuel++;
    sample.push(`${(p.player?.name || "?").padEnd(24)} mins:${String(st.games?.minutes ?? "-").padStart(4)}  tk:${tk.total ?? "—"}  int:${tk.interceptions ?? "—"}  drb:${dr.attempts ?? "—"}  duelW:${du.won ?? "—"}`);
  }
  console.log(`\n  [4] populated on this page → tackles:${withTk}/${rows.length}  interceptions:${withInt}  dribbles:${withDrb}  duelsWon:${withDuel}`);
  console.log("\n  sample players:");
  sample.slice(0, 12).forEach(s => console.log("    " + s));

  console.log("\n─".repeat(64));
  if (withTk > 0) {
    console.log("  ✅ TACKLES ARE POPULATED. Paste this output to Claude — we build the fetcher.");
  } else {
    console.log("  ⚠ tackles came back empty for MLS 2026. Paste output to Claude — we weigh Sportmonks.");
  }
})().catch(e => console.log("ERR", e.message));
