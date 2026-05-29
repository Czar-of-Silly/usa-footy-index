// fetch-mls.js
// Pulls full-season per-player stats from MLS Sportec public API.
//
// Strategy: ONE endpoint with cursor pagination.
//   GET /statistics/players/competitions/MLS-COM-000001/seasons/MLS-SEA-0001KA
//   Returns 20 players per page, with `next_page_token` for the next batch.
//   Walk until token is null. Expected ~500 players total.
//
// Each player gives us ~146 fields (119 base + 27 GK-specific) PLUS:
//   • advanced_stats sub-object (pressures, xPass, xSaves, escape rate, etc.)
//   • xg_rankings sub-object (xG rank within league)
//
// Output: public/data/mls-stats-cache.json with normalized schema.

const fs = require('fs');
const path = require('path');

const COMPETITION = 'MLS-COM-000001';
const SEASON = 'MLS-SEA-0001KA';
const API = 'https://stats-api.mlssoccer.com';
const URL = `${API}/statistics/players/competitions/${COMPETITION}/seasons/${SEASON}`;
const OUT_PATH = path.join('public', 'data', 'mls-stats-cache.json');

const PAGE_DELAY_MS = 150;
const TIMEOUT_MS = 20000;
const MAX_PAGES = 100;  // safety cap; expected ~25 pages

async function get(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'usfootyindex/1.0' }
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Normalize a raw API player record into our flat schema ─────────────────
function normalize(p) {
  const adv = p.advanced_stats || {};
  const rankings = p.xg_rankings?.season || {};
  const isGK = !!p.goal_keeper;

  return {
    // Identity
    id: p.player_id,
    firstName: p.player_first_name,
    lastName: p.player_last_name,
    name: `${p.player_first_name || ''} ${p.player_last_name || ''}`.trim(),
    team: p.team_three_letter_code,
    teamName: p.team_short_name,
    teamId: p.team_id,
    position: isGK ? 'GK' : 'OUT',  // outfield catch-all; ESPN will refine
    isGK,

    // Playing time
    matches: p.matches_played || 0,
    matchesTracked: p.matches_played_tracking || 0,
    mins: p.normalized_player_minutes || 0,

    // Discipline
    yellowCards: p.cards_yellow || 0,
    yellowReds: p.cards_yellow_red || 0,
    redCards: p.cards_red || 0,
    sendingsOff: p.sendings_off || 0,
    offsides: p.offsides || 0,
    foulsCommitted: p.fouls_sum || 0,
    foulsSuffered: p.fouls_suffered || 0,

    // Attack
    goals: p.goals || 0,
    assists: p.assists || 0,
    secondAssists: p.second_assists || 0,
    shotsTotal: p.shots_at_goal_sum || 0,
    shotsInside: p.shots_at_goal_inside_box || 0,
    shotsOutside: p.shots_at_goal_outside_box || 0,
    shotsOnTarget: p.shots_on_target || 0,
    xG: +(p.xG || 0).toFixed(2),
    xGEfficiency: +(p.xG_efficiency || 0).toFixed(2),
    chances: p.chances || 0,
    goalOpportunities: p.goal_opportunities || 0,

    // xG ranking within league
    xgRank: rankings.rank || null,
    xgSeasonAbs: rankings.absolute || null,
    xgSeasonX: rankings.x_goals || null,

    // Passing (total volumes)
    passes: p.passes_sum || 0,
    passesOk: p.passes_successful_sum || 0,
    passesPct: +(p.passes_conversion_rate || 0).toFixed(2),
    passesOpenPlay: p.passes_from_play_sum || 0,
    passesOpenPlayOk: p.passes_from_play_successful || 0,
    passesOpenPlayPct: +(p.passes_from_play_conversion_rate || 0).toFixed(2),

    // Pass length breakdowns (open play only)
    passesShort: p.passes_from_open_play_short || 0,
    passesShortPct: +(p.passes_from_open_play_short_successful_ratio || 0).toFixed(1),
    passesMedium: p.passes_from_open_play_medium || 0,
    passesMediumPct: +(p.passes_from_open_play_medium_successful_ratio || 0).toFixed(1),
    passesLong: p.passes_from_open_play_long || 0,
    passesLongPct: +(p.passes_from_open_play_long_successful_ratio || 0).toFixed(1),

    // Advanced passing (Sportec models)
    xPass: +(adv.x_pass || 0).toFixed(1),
    passingPerformance: +(adv.passing_performance || 0).toFixed(1),
    passingPerformanceRank: adv.passing_performance_rank || null,
    difficultPasses: adv.difficult_passes || 0,
    difficultPassesPct: +((adv.difficult_passes_successful_ratio || 0) * 100).toFixed(1),
    difficultPassesShare: +((adv.difficult_passes_share || 0) * 100).toFixed(1),

    // Crosses
    crosses: p.crosses_sum || 0,
    crossesOk: p.crosses_successful_sum || 0,

    // Defense
    interceptions: p.interceptions_sum || 0,
    intCross: p.interceptions_cross || 0,
    intCorner: p.interceptions_corner || 0,
    intHeld: p.interceptions_held || 0,
    intFisted: p.interceptions_fisted || 0,
    defensiveClearances: p.defensive_clearances || 0,
    aerialsWon: p.tackling_games_air_won || 0,
    aerialsLost: p.tackling_games_air_lost || 0,
    aerialsTotal: p.tackling_games_air_sum || 0,

    // Pressure (outfielders only; null for GKs)
    pressures: isGK ? null : (adv.player_pressure_count || 0),
    pressuresRank: isGK ? null : (adv.player_pressure_count_rank || null),
    avgPressure: isGK ? null : +(adv.average_pressure || 0).toFixed(2),
    escapeRate: isGK ? null : +(adv.escape_rate || 0).toFixed(2),
    escapeRateRank: isGK ? null : (adv.escape_rate_rank || null),
    pressureResistance: isGK ? null : +(adv.pressure_resistance_ratio || 0).toFixed(2),
    pressureResistanceEff: isGK ? null : +(adv.pressure_resistance_efficiency || 0).toFixed(2),
    passUnderPressurePct: isGK ? null : +((adv.passes_under_pressure_successful_ratio || 0) * 100).toFixed(1),

    // Athletic
    distance: +(p.distance_covered || 0).toFixed(0),   // meters
    maxSpeed: +(p.maximum_speed || 0).toFixed(2),       // km/h

    // GK-specific (null for outfielders)
    saves: isGK ? (p.goalkeeper_saves || 0) : null,
    xSaves: isGK ? +(adv.x_saves || 0).toFixed(2) : null,
    keeperEfficiency: isGK ? +(adv.keeper_efficiency || 0).toFixed(2) : null,
    goalsConceded: isGK ? (p.goals_conceded || 0) : null,
    shotsFaced: isGK ? (p.shots_faced || 0) : null,
    cleanSheets: isGK ? (p.clean_sheets || 0) : null,
    cleanSheetsComplete: isGK ? (p.clean_sheets_complete || 0) : null,
    penaltiesSaved: isGK ? (p.penalties_saved || 0) : null,
    penaltiesCaused: p.penalties_caused || 0,
    gameOpeningsThrowout: isGK ? (p.game_openings_throwout || 0) : null,
    gameOpeningsHand: isGK ? (p.game_openings_hand || 0) : null,

    // Set pieces
    cornerKicks: p.corner_kicks_sum || 0,
    freeKicks: p.free_kicks_sum || 0,
    throwIns: p.throw_ins || 0,

    // Activity
    ballActions: p.ball_actions || 0,
    ballControlPhases: p.ball_control_phases || 0,
    nutmegs: p.nutmegs || 0,
    spectacularPlays: p.spectacular_plays || 0
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('  MLS Sportec Stats Fetcher');
  console.log('  ═════════════════════════════');

  const allPlayers = [];
  let token = null;
  let page = 0;
  let info = null;

  while (page < MAX_PAGES) {
    const url = token ? `${URL}?page_token=${encodeURIComponent(token)}` : URL;
    let data;
    try {
      data = await get(url);
    } catch (e) {
      console.error(`  ❌ Page ${page + 1} failed: ${e.message}`);
      break;
    }

    if (!info && data.stats_info) info = data.stats_info;

    const rows = data.player_statistics || [];
    for (const p of rows) {
      const normalized = normalize(p);
      if (normalized.id) allPlayers.push(normalized);
    }

    page++;
    process.stdout.write(`          page ${page} · ${allPlayers.length} players collected\r`);

    token = data.next_page_token;
    if (!token) break;
    await sleep(PAGE_DELAY_MS);
  }

  console.log(`\n          ✅ ${allPlayers.length} players over ${page} pages`);
  if (info) console.log(`             ${info.competition} · Matchday ${info.match_day} · Season ${info.season}`);

  // Sanity stats
  const gkCount = allPlayers.filter(p => p.isGK).length;
  const teams = [...new Set(allPlayers.map(p => p.team))].filter(Boolean);
  console.log(`             ${gkCount} goalkeepers · ${teams.length} teams (${teams.sort().join(',')})`);

  // Build keyed lookup by player ID
  const players = {};
  for (const p of allPlayers) players[p.id] = p;

  if (!fs.existsSync(path.dirname(OUT_PATH))) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  }

  const out = {
    generated: new Date().toISOString(),
    competition: COMPETITION,
    season: SEASON,
    stats_info: info,
    playerCount: allPlayers.length,
    players
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));

  const mb = (fs.statSync(OUT_PATH).size / 1048576).toFixed(2);
  console.log(`\n  ✅ ${OUT_PATH} (${mb} MB)\n`);
}

main().catch(e => {
  console.error('\n  ❌ Fatal:', e.message);
  console.error('\n  Stack:\n' + (e.stack || '(no stack)'));
  process.exit(1);
});
