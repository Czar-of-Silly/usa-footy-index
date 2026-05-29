// fetch-mls-stats.js
// Layer 2b: Official MLS (Opta) player statistics from the public stats-api.
// This REPLACES Sofascore. It works from datacenter IPs (incl. GitHub Actions),
// is the official league feed, and is keyed by player_id == sportecId — the same
// ID already on every player in rosters-cache.json — so stats join by ID, not
// fuzzy name matching.
//
// Output: public/data/stats-cache.json
//   { meta: {...}, players: { "MLS-OBJ-xxxxx": { ...flattened stats } } }
//
// Each player record = all base fields + advanced_stats (flattened, adv_*
// prefix to avoid collisions) + GK fields. Downstream (fetch-data.js) joins
// these onto the player cache by sportecId.
//
// NOTE: SEASON_ID changes once per year. Update SEASON_ID each February for the
// new MLS season (the stats page URL shows it: .../#season=MLS-SEA-XXXXXX).

const fs = require("fs");
const path = require("path");
const https = require("https");

// ─── Config ──────────────────────────────────────────────────────────────
const HOST = "stats-api.mlssoccer.com";
const COMPETITION = "MLS-COM-000001";          // MLS Regular Season
const SEASON_ID = "MLS-SEA-0001KA";            // 2026 — UPDATE EACH FEBRUARY
const PER_PAGE = 500;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUT = path.join(__dirname, "public", "data", "stats-cache.json");

// ─── HTTP (browser-like UA; no proxy needed — datacenter IPs are fine here) ──
function getJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST, port: 443, path: urlPath, method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.mlssoccer.com",
        "Referer": "https://www.mlssoccer.com/",
      },
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${urlPath} :: ${body.slice(0,120)}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`JSON parse fail: ${e.message}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(new Error("timeout")); });
    req.end();
  });
}

// Flatten one player_statistics object: base fields + advanced_stats (adv_ prefix).
function flatten(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "advanced_stats") {
      if (v && typeof v === "object") {
        for (const [ak, av] of Object.entries(v)) {
          if (ak === "goalkeeper") continue; // dup of base goal_keeper
          out["adv_" + ak] = av;
        }
      }
    } else if (k === "xg_rankings") {
      // keep season xG + rank if present (handy, compact)
      if (v && v.season) {
        out.xg_rank_season = v.season.rank ?? null;
        out.x_goals_model = v.season.x_goals ?? null;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  console.log("  USFI — MLS Official Stats Fetcher (Opta via stats-api)");
  console.log("  https://stats-api.mlssoccer.com — no proxy, official feed");
  console.log("  ───────────────────────────────────────────────────────");
  console.log(`  Season: ${SEASON_ID} · Competition: ${COMPETITION}`);

  const base = `/statistics/players/competitions/${COMPETITION}/seasons/${SEASON_ID}`;
  const players = {};
  let token = null, page = 0, totalRaw = 0;
  const seen = new Set();

  while (true) {
    page++;
    let urlPath = `${base}?per_page=${PER_PAGE}`;
    if (token) urlPath += `&page_token=${encodeURIComponent(token)}`;
    let data;
    try {
      data = await getJSON(urlPath);
    } catch (e) {
      console.log(`  ✗ page ${page} failed: ${e.message}`);
      throw e;
    }
    const arr = data.player_statistics || [];
    let newCount = 0;
    for (const p of arr) {
      totalRaw++;
      const id = p.player_id;
      if (!id || seen.has(id)) continue;  // de-dupe across pages
      seen.add(id);
      players[id] = flatten(p);
      newCount++;
    }
    const meta = data.stats_info || {};
    console.log(`  page ${page}: +${newCount} new (page had ${arr.length}) · total ${Object.keys(players).length}`);
    token = data.next_page_token || null;
    // Stop when no token, or a page adds nothing new (cursor exhausted/looping)
    if (!token || newCount === 0) break;
    if (page > 30) { console.log("  ⚠️  stopping at 30 pages (safety cap)"); break; }
  }

  const ids = Object.keys(players);
  const gks = ids.filter(id => players[id].goal_keeper).length;
  const out = {
    meta: {
      source: "stats-api.mlssoccer.com (official Opta)",
      competition_id: COMPETITION,
      season_id: SEASON_ID,
      fetched_at: new Date().toISOString(),
      player_count: ids.length,
      goalkeepers: gks,
    },
    players,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("  ───────────────────────────────────────────────────────");
  console.log(`  ✅ ${OUT}`);
  console.log(`     ${ids.length} players (${gks} GK) · ${(JSON.stringify(out).length/1024).toFixed(0)} KB`);

  // Spot checks
  const byName = (fn, ln) => ids.map(i => players[i]).find(p => (p.player_first_name||"").includes(fn) && (p.player_last_name||"").includes(ln));
  const show = (p, label) => {
    if (!p) { console.log(`     ${label}: NOT FOUND`); return; }
    if (p.goal_keeper) {
      console.log(`     ${label}: saves=${p.goalkeeper_saves} CS=${p.clean_sheets} GA=${p.goals_conceded} xSaves=${p.adv_x_saves} mins=${p.normalized_player_minutes}`);
    } else {
      console.log(`     ${label}: xG=${(p.xG||0).toFixed(2)} chances=${p.chances} KP=${p.assists_shot_at_goal} aerialW=${p.tackling_games_air_won} clr=${p.defensive_clearances} pressures=${p.adv_player_pressure_count} mins=${p.normalized_player_minutes}`);
    }
  };
  console.log("  Spot checks:");
  show(byName("Lionel","Messi") || byName("Leo","Messi"), "Messi (MIA)");
  show(byName("Denis","Bouanga"), "Bouanga (LAFC)");
  show(byName("Brad","Stuver") || byName("B","Stuver"), "Stuver GK (ATX)");
}

main().catch(e => { console.error("  ✗ FATAL:", e.message); process.exit(1); });
