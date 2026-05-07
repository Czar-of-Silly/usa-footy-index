// fbref-fetch.js — Scrape MLS player stats from FBref.com
// Provides: tackles, interceptions, dribbles, SCA, GCA, progressive carries/passes, aerials, carries
// Run standalone: node fbref-fetch.js
// Or import: const { fetchFbref } = require("./fbref-fetch")

const cheerio = require("cheerio");

const HDR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// FBref MLS competition ID is 22. Format: /en/comps/22/{category}/Major-League-Soccer-Stats
const FBREF_PAGES = {
  stats: "https://fbref.com/en/comps/22/stats/Major-League-Soccer-Stats",
  defense: "https://fbref.com/en/comps/22/defense/Major-League-Soccer-Stats",
  possession: "https://fbref.com/en/comps/22/possession/Major-League-Soccer-Stats",
  passing: "https://fbref.com/en/comps/22/passing/Major-League-Soccer-Stats",
  gca: "https://fbref.com/en/comps/22/gca/Major-League-Soccer-Stats",
  misc: "https://fbref.com/en/comps/22/misc/Major-League-Soccer-Stats",
};

// FBref hides tables inside HTML comments to evade scrapers. Need to extract them.
function extractTable(html, tableId) {
  // First try direct (some tables aren't commented)
  const direct = html.match(new RegExp(`<table[^>]*id="${tableId}"[\\s\\S]*?</table>`, ""));
  if (direct) return direct[0];
  // Then try inside comments
  const comments = html.match(/<!--[\s\S]*?-->/g) || [];
  for (const c of comments) {
    const m = c.match(new RegExp(`<table[^>]*id="${tableId}"[\\s\\S]*?</table>`, ""));
    if (m) return m[0];
  }
  return null;
}

function parseTable(tableHtml) {
  if (!tableHtml) return [];
  const $ = cheerio.load(tableHtml);
  const rows = [];
  $("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return; // Skip header repeats
    const row = {};
    $tr.find("td, th").each((_, cell) => {
      const $c = $(cell);
      const stat = $c.attr("data-stat");
      if (stat) row[stat] = $c.text().trim();
    });
    if (row.player) rows.push(row);
  });
  return rows;
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: HDR });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const num = (v) => {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

async function fetchFbref() {
  console.log("  [FBref] Scraping MLS stats from FBref...");
  const stats = {}; // player name → stats

  // Helper to merge data into stats map by player name
  const merge = (rows, mapper) => {
    for (const r of rows) {
      const name = r.player;
      if (!name) continue;
      if (!stats[name]) stats[name] = {};
      Object.assign(stats[name], mapper(r));
    }
  };

  // 1. Defense — tackles, interceptions, blocks
  try {
    console.log("          Defense...");
    const html = await fetchPage(FBREF_PAGES.defense);
    const rows = parseTable(extractTable(html, "stats_defense"));
    merge(rows, r => ({
      tackles: num(r.tackles),
      tacklesWon: num(r.tackles_won),
      tklDef3rd: num(r.tackles_def_3rd),
      tklMid3rd: num(r.tackles_mid_3rd),
      tklAtt3rd: num(r.tackles_att_3rd),
      interceptions: num(r.interceptions),
      blocks: num(r.blocks),
      blockedShots: num(r.blocked_shots),
      clearances: num(r.clearances),
    }));
    console.log(`          ✅ ${rows.length} players (defense)`);
    await sleep(3000); // FBref rate limits aggressively
  } catch(e) { console.log(`          ⚠️  Defense failed: ${e.message}`); }

  // 2. Possession — carries, dribbles, touches
  try {
    console.log("          Possession...");
    const html = await fetchPage(FBREF_PAGES.possession);
    const rows = parseTable(extractTable(html, "stats_possession"));
    merge(rows, r => ({
      touches: num(r.touches),
      touchesAtt3rd: num(r.touches_att_3rd),
      touchesAttPen: num(r.touches_att_pen_area),
      dribblesAtt: num(r.take_ons),
      dribblesSucc: num(r.take_ons_won),
      carries: num(r.carries),
      carriesPrg: num(r.carries_progressive_distance),
      progressiveCarries: num(r.progressive_carries),
      carriesAtt3rd: num(r.carries_into_final_third),
      cpa: num(r.carries_into_penalty_area),
      miscontrols: num(r.miscontrols),
      dispossessed: num(r.dispossessed),
    }));
    console.log(`          ✅ ${rows.length} players (possession)`);
    await sleep(3000);
  } catch(e) { console.log(`          ⚠️  Possession failed: ${e.message}`); }

  // 3. Passing — progressive passes, key passes, final third
  try {
    console.log("          Passing...");
    const html = await fetchPage(FBREF_PAGES.passing);
    const rows = parseTable(extractTable(html, "stats_passing"));
    merge(rows, r => ({
      passesCompleted: num(r.passes_completed),
      passesAttempted: num(r.passes),
      passPct: num(r.passes_pct),
      progressivePasses: num(r.progressive_passes),
      keyPasses: num(r.assisted_shots),
      passesIntoFinalThird: num(r.passes_into_final_third),
      passesIntoPenArea: num(r.passes_into_penalty_area),
      crossesIntoPenArea: num(r.crosses_into_penalty_area),
      xa: num(r.xa),
    }));
    console.log(`          ✅ ${rows.length} players (passing)`);
    await sleep(3000);
  } catch(e) { console.log(`          ⚠️  Passing failed: ${e.message}`); }

  // 4. Goal/Shot creation
  try {
    console.log("          Goal/Shot creation...");
    const html = await fetchPage(FBREF_PAGES.gca);
    const rows = parseTable(extractTable(html, "stats_gca"));
    merge(rows, r => ({
      sca: num(r.sca),
      gca: num(r.gca),
    }));
    console.log(`          ✅ ${rows.length} players (gca)`);
    await sleep(3000);
  } catch(e) { console.log(`          ⚠️  GCA failed: ${e.message}`); }

  // 5. Misc — aerials, fouls
  try {
    console.log("          Misc...");
    const html = await fetchPage(FBREF_PAGES.misc);
    const rows = parseTable(extractTable(html, "stats_misc"));
    merge(rows, r => ({
      aerialsWon: num(r.aerials_won),
      aerialsLost: num(r.aerials_lost),
      foulsCommitted: num(r.fouls),
      foulsDrawn: num(r.fouled),
      offsides: num(r.offsides),
      ballRecoveries: num(r.ball_recoveries),
    }));
    console.log(`          ✅ ${rows.length} players (misc)`);
  } catch(e) { console.log(`          ⚠️  Misc failed: ${e.message}`); }

  console.log(`          ✅ Total: ${Object.keys(stats).length} unique players`);
  return stats;
}

module.exports = { fetchFbref };

// If run directly, output a sample
if (require.main === module) {
  (async () => {
    const stats = await fetchFbref();
    const fs = require("fs");
    fs.writeFileSync("data/fbref-test.json", JSON.stringify(stats, null, 2));
    console.log(`\nWrote ${Object.keys(stats).length} players to data/fbref-test.json`);
    console.log("\nSample player:");
    const sample = Object.values(stats)[0];
    console.log(JSON.stringify(sample, null, 2));
  })().catch(e => console.error("ERROR:", e));
}
