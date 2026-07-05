// test-sofa-via-scraperapi.js
// Run locally:  node test-sofa-via-scraperapi.js
// Proves whether routing Sofascore through ScraperAPI's clean IP gets past the
// Cloudflare 403 that blocks the cron. Reads SCRAPER_KEY from .env (no npm install).
// Paste the full output back to Claude.

const fs = require("fs");
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const KEY = process.env.SCRAPER_KEY;
if (!KEY) { console.log("❌ No SCRAPER_KEY in .env. Add  SCRAPER_KEY=yourkey  and rerun."); process.exit(1); }

const SOFA = "https://api.sofascore.com/api/v1";
const SOFA_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://www.sofascore.com/",
  "Origin": "https://www.sofascore.com",
};

// route a Sofascore endpoint through ScraperAPI. premium=true uses residential IPs (costs more credits).
async function viaScraper(ep, premium) {
  const target = encodeURIComponent(`${SOFA}${ep}`);
  let url = `https://api.scraperapi.com/?api_key=${KEY}&render=false&keep_headers=true&url=${target}`;
  if (premium) url += "&premium=true";
  const res = await fetch(url, { headers: SOFA_HEADERS });
  const text = await res.text();
  return { http: res.status, text };
}

async function tryBoth(ep, label) {
  let r = await viaScraper(ep, false);
  let mode = "standard";
  if (r.http !== 200) {
    console.log(`    standard -> HTTP ${r.http}; retrying with premium (residential)…`);
    r = await viaScraper(ep, true);
    mode = "premium";
  }
  console.log(`    ${label}: HTTP ${r.http} via ${mode}`);
  return { ...r, mode };
}

(async () => {
  console.log("─".repeat(64));
  console.log("  SOFASCORE via ScraperAPI — does the clean-IP pipe bypass Cloudflare?");
  console.log("─".repeat(64));

  // 1) reachability through the pipe
  console.log("\n  [1] Sofascore /seasons through ScraperAPI:");
  let r = await tryBoth(`/unique-tournament/242/seasons`, "seasons");
  if (r.http !== 200) {
    console.log("\n  ❌ Still blocked even through ScraperAPI:", r.text.slice(0, 160));
    console.log("  >>> ScraperAPI free tier didn't get through. Paste this to Claude. <<<");
    process.exit(0);
  }
  let seasons;
  try { seasons = JSON.parse(r.text).seasons || []; }
  catch { console.log("  got 200 but body wasn't JSON:", r.text.slice(0, 160)); process.exit(0); }
  const cur = seasons.find(s => String(s.year).includes("2026")) || seasons[0];
  console.log(`    reachable ✅  current season: ${cur.year} (id ${cur.id}), via ${r.mode}`);

  // 2) the real prize: per-player tackles through the pipe
  console.log("\n  [2] Per-player tackles through ScraperAPI:");
  const ep = `/unique-tournament/242/season/${cur.id}/statistics?limit=10&offset=0&order=-tackles&accumulation=total&group=defensive`;
  r = await tryBoth(ep, "tackles");
  if (r.http === 200) {
    let rows = [];
    try { rows = JSON.parse(r.text).results || []; } catch {}
    console.log(`    rows: ${rows.length}  | fields: ${Object.keys(rows[0] || {}).filter(k => k !== "player" && k !== "team").join(", ") || "(none)"}`);
    rows.slice(0, 8).forEach(x =>
      console.log(`      ${(x.player?.name || "?").padEnd(22)} tackles:${x.tackles ?? "—"}  intc:${x.interceptions ?? "—"}`));
    console.log("\n─".repeat(64));
    console.log(`  ✅ SOFA WORKS THROUGH THE PIPE (via ${r.mode}). Paste this to Claude — I wire it into the cron.`);
  } else {
    console.log("    tackles call failed:", r.text.slice(0, 160));
    console.log("\n  >>> seasons worked but stats didn't. Paste to Claude. <<<");
  }
})().catch(e => console.log("ERR", e.message));
