// merge-mls.js  (v3)
// Joins MLS Sportec data onto the main cache without polluting grading pools.
//
// CRITICAL ARCHITECTURE — different from previous attempts:
//   • Matched players: MLS fields added as overlay onto existing cache.players[].
//                      Existing fields untouched. Grading engine reads same fields.
//   • Unmatched MLS players with ≥200 mins: written to cache.mlsOnly[] — a
//                      SEPARATE array the grading engine ignores. UI can read
//                      it for things like Save Quality leaderboard that don't
//                      need ESPN data.
//   • Result: pool stays clean (no synthetic zeros polluting percentile math),
//                      but data is preserved (MLS-only players still queryable).
//
// Usage:
//   node merge-mls.js              # dry run, writes mls-cache.merged.json
//   node merge-mls.js --apply      # writes to mls-cache.json with backup

const fs = require('fs');
const path = require('path');

const MAIN_CACHE   = path.join('public', 'data', 'mls-cache.json');
const MLS_CACHE    = path.join('public', 'data', 'mls-stats-cache.json');
const MERGED_OUT   = path.join('public', 'data', 'mls-cache.merged.json');
const BACKUP_PATH  = path.join('public', 'data', 'mls-cache.backup.json');
const REPORT_PATH  = path.join('public', 'data', 'merge-report.json');

const APPLY = process.argv.includes('--apply');
const MLS_ONLY_MIN_MINUTES = 200;

// ─── Name normalization ─────────────────────────────────────────────────────
function norm(name) {
  if (!name) return '';
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokens(name) {
  if (!name) return [];
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/\s+/).filter(Boolean).map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean);
}

function tokenSetMatch(a, b) {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0 || ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

function lastNameKey(name) { const t = tokens(name); return t[t.length - 1] || ''; }
function firstNameKey(name) { return tokens(name)[0] || ''; }

function scoreMatch(mainPlayer, mlsPlayer) {
  if (mainPlayer.t !== mlsPlayer.team) return { score: 0 };
  const mainName = norm(mainPlayer.n), mlsName = norm(mlsPlayer.name);
  if (mainName === mlsName) return { score: 100, reason: 'exact' };
  if (tokenSetMatch(mainPlayer.n, mlsPlayer.name)) return { score: 95, reason: 'token-set' };
  const mainLast = lastNameKey(mainPlayer.n), mlsLast = lastNameKey(mlsPlayer.name);
  const mainFirst = firstNameKey(mainPlayer.n), mlsFirst = firstNameKey(mlsPlayer.name);
  if (mainLast && mlsLast && mainLast === mlsLast) {
    if (mainFirst && mlsFirst && mainFirst === mlsFirst) return { score: 92, reason: 'first+last' };
    return { score: 88, reason: 'lastname' };
  }
  if (mainName.length >= 6 && mlsName.length >= 6 && (mlsName.includes(mainName) || mainName.includes(mlsName))) {
    return { score: 82, reason: 'substring' };
  }
  return { score: 0 };
}

// ─── Build the MLS field overlay ────────────────────────────────────────────
function buildOverlay(mlsPlayer) {
  const o = {
    mlsId: mlsPlayer.id,
    mlsDistance: mlsPlayer.distance || 0,
    mlsMaxSpeed: mlsPlayer.maxSpeed || 0,
    mlsXG: mlsPlayer.xG || 0,
    mlsXGEfficiency: mlsPlayer.xGEfficiency || 0,
    mlsChances: mlsPlayer.chances || 0,
    mlsXgRank: mlsPlayer.xgRank || null,
    mlsXPass: mlsPlayer.xPass || 0,
    mlsPassingPerformance: mlsPlayer.passingPerformance || 0,
    mlsPassingPerformanceRank: mlsPlayer.passingPerformanceRank || null,
    mlsDifficultPasses: mlsPlayer.difficultPasses || 0,
    mlsDifficultPassesPct: mlsPlayer.difficultPassesPct || 0,
    mlsDifficultPassesShare: mlsPlayer.difficultPassesShare || 0,
    mlsPassesShort: mlsPlayer.passesShort || 0,
    mlsPassesShortPct: mlsPlayer.passesShortPct || 0,
    mlsPassesMedium: mlsPlayer.passesMedium || 0,
    mlsPassesMediumPct: mlsPlayer.passesMediumPct || 0,
    mlsPassesLong: mlsPlayer.passesLong || 0,
    mlsPassesLongPct: mlsPlayer.passesLongPct || 0,
    mlsMatches: mlsPlayer.matches || 0,
    mlsMins: mlsPlayer.mins || 0
  };

  if (!mlsPlayer.isGK) {
    o.mlsPressures = mlsPlayer.pressures || 0;
    o.mlsPressuresRank = mlsPlayer.pressuresRank || null;
    o.mlsAvgPressure = mlsPlayer.avgPressure || 0;
    o.mlsEscapeRate = mlsPlayer.escapeRate || 0;
    o.mlsEscapeRateRank = mlsPlayer.escapeRateRank || null;
    o.mlsPressureResistance = mlsPlayer.pressureResistance || 0;
    o.mlsPressureResistanceEff = mlsPlayer.pressureResistanceEff || 0;
    o.mlsPassUnderPressurePct = mlsPlayer.passUnderPressurePct || 0;
  }

  if (mlsPlayer.isGK) {
    o.gkSavesMLS = mlsPlayer.saves || 0;
    o.gkXSaves = mlsPlayer.xSaves || 0;
    o.gkEfficiency = mlsPlayer.keeperEfficiency || 0;
    o.gkGoalsConceded = mlsPlayer.goalsConceded || 0;
    o.gkShotsFaced = mlsPlayer.shotsFaced || 0;
    o.gkCleanSheets = mlsPlayer.cleanSheets || 0;
    o.gkPenaltiesSaved = mlsPlayer.penaltiesSaved || 0;
    o.gkOpeningsThrow = mlsPlayer.gameOpeningsThrowout || 0;
    o.gkOpeningsHand = mlsPlayer.gameOpeningsHand || 0;
  }

  return o;
}

// ─── Build a standalone MLS-only player entry (separate from main pool) ─────
// Shape: minimal fields needed for UI rendering. NO sofa-proxy zero-defaults,
// because this player never enters the grading percentile pools.
function buildMlsOnly(mlsPlayer) {
  return {
    n: mlsPlayer.name,
    t: mlsPlayer.team,
    p: mlsPlayer.isGK ? 'GK' : 'MF',
    mins: mlsPlayer.mins || 0,
    matches: mlsPlayer.matches || 0,
    g: mlsPlayer.goals || 0,
    as: mlsPlayer.assists || 0,
    sh: mlsPlayer.shotsTotal || 0,
    sot: mlsPlayer.shotsOnTarget || 0,
    pp: mlsPlayer.passesPct ? Math.round(mlsPlayer.passesPct * 100) : 0,
    isMlsOnly: true,
    ...buildOverlay(mlsPlayer)
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('  MLS Merge v3 — separated-pool architecture');
  console.log('  ═════════════════════════════════════════════');

  if (!fs.existsSync(MAIN_CACHE)) { console.error(`  ❌ Missing ${MAIN_CACHE}`); process.exit(1); }
  if (!fs.existsSync(MLS_CACHE))  { console.error(`  ❌ Missing ${MLS_CACHE}`); process.exit(1); }

  console.log('  Loading caches...');
  const mainCache = JSON.parse(fs.readFileSync(MAIN_CACHE, 'utf8'));
  const mlsCache  = JSON.parse(fs.readFileSync(MLS_CACHE, 'utf8'));

  const mainPlayers = mainCache.players || [];
  const mlsPlayers  = Object.values(mlsCache.players || {});

  console.log(`  Main cache: ${mainPlayers.length} players`);
  console.log(`  MLS cache:  ${mlsPlayers.length} players`);

  // Strip stale MLS overlay fields from main cache (clean re-run)
  const MLS_FIELDS = new Set([
    'mlsId','mlsDistance','mlsMaxSpeed','mlsXG','mlsXGEfficiency','mlsChances','mlsXgRank',
    'mlsXPass','mlsPassingPerformance','mlsPassingPerformanceRank',
    'mlsDifficultPasses','mlsDifficultPassesPct','mlsDifficultPassesShare',
    'mlsPassesShort','mlsPassesShortPct','mlsPassesMedium','mlsPassesMediumPct','mlsPassesLong','mlsPassesLongPct',
    'mlsMatches','mlsMins',
    'mlsPressures','mlsPressuresRank','mlsAvgPressure','mlsEscapeRate','mlsEscapeRateRank',
    'mlsPressureResistance','mlsPressureResistanceEff','mlsPassUnderPressurePct',
    'gkSavesMLS','gkXSaves','gkEfficiency','gkGoalsConceded','gkShotsFaced','gkCleanSheets',
    'gkPenaltiesSaved','gkOpeningsThrow','gkOpeningsHand'
  ]);
  for (const p of mainPlayers) for (const k of MLS_FIELDS) delete p[k];

  // Also drop any previously-injected _mlsOnly entries (from older versions)
  const cleanedMain = mainPlayers.filter(p => !p._mlsOnly);

  // Drop top-level mlsOnly array from cache (will be rewritten)
  delete mainCache.mlsOnly;

  // Index MLS by team
  const mlsByTeam = new Map();
  for (const ml of mlsPlayers) {
    if (!ml.team) continue;
    if (!mlsByTeam.has(ml.team)) mlsByTeam.set(ml.team, []);
    mlsByTeam.get(ml.team).push(ml);
  }

  const report = {
    matched: 0, matchedExact: 0, matchedTokenSet: 0, matchedFirstLast: 0, matchedLastName: 0, matchedSubstring: 0,
    unmatchedMain: [], mlsOnly: [], unmatchedMls: [], matches: []
  };
  const consumedMlsIds = new Set();

  // Match main players against MLS data
  for (const mp of cleanedMain) {
    if (!mp.n || !mp.t) continue;
    const candidates = mlsByTeam.get(mp.t) || [];
    let best = null;
    for (const ml of candidates) {
      if (consumedMlsIds.has(ml.id)) continue;
      const r = scoreMatch(mp, ml);
      if (r.score >= 80 && (!best || r.score > best.score)) best = { mls: ml, score: r.score, reason: r.reason };
    }
    if (best) {
      Object.assign(mp, buildOverlay(best.mls));
      consumedMlsIds.add(best.mls.id);
      report.matched++;
      if (best.score === 100) report.matchedExact++;
      else if (best.score === 95) report.matchedTokenSet++;
      else if (best.score === 92) report.matchedFirstLast++;
      else if (best.score === 88) report.matchedLastName++;
      else report.matchedSubstring++;
      report.matches.push({ mainName: mp.n, mlsName: best.mls.name, team: mp.t, score: best.score, reason: best.reason });
    } else {
      report.unmatchedMain.push({ name: mp.n, team: mp.t });
    }
  }

  // Build separate mlsOnly array for unmatched MLS players with significant minutes
  const mlsOnlyArr = [];
  for (const ml of mlsPlayers) {
    if (consumedMlsIds.has(ml.id)) continue;
    const mins = ml.mins || 0;
    if (mins >= MLS_ONLY_MIN_MINUTES) {
      mlsOnlyArr.push(buildMlsOnly(ml));
      report.mlsOnly.push({ name: ml.name, team: ml.team, mins, isGK: ml.isGK });
    } else {
      report.unmatchedMls.push({ name: ml.name, team: ml.team, mins });
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log(`\n  Matched: ${report.matched}/${cleanedMain.length} main players`);
  console.log(`     Exact:       ${report.matchedExact}`);
  console.log(`     Token-set:   ${report.matchedTokenSet}`);
  console.log(`     First+Last:  ${report.matchedFirstLast}`);
  console.log(`     Lastname:    ${report.matchedLastName}`);
  console.log(`     Substring:   ${report.matchedSubstring}`);
  console.log(`\n  Unmatched main cache: ${report.unmatchedMain.length}`);
  console.log(`  MLS-only players:     ${mlsOnlyArr.length} (in cache.mlsOnly[] — not in main pool)`);
  console.log(`  Skipped (low mins):   ${report.unmatchedMls.length}`);

  if (mlsOnlyArr.length > 0) {
    console.log('\n  MLS-only players (visible in UI, EXCLUDED from grading pools):');
    report.mlsOnly.sort((a,b)=>b.mins-a.mins).forEach(u => {
      console.log(`     ${u.name} (${u.team})${u.isGK?' [GK]':''} — ${u.mins} mins`);
    });
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n  Report: ${REPORT_PATH}`);

  const merged = {
    ...mainCache,
    players: cleanedMain,        // grading pool — unchanged size
    mlsOnly: mlsOnlyArr,          // separate UI-only array
    mls_merge_at: new Date().toISOString(),
    mls_merge_stats: { matched: report.matched, mlsOnly: mlsOnlyArr.length, mainPool: cleanedMain.length }
  };

  if (APPLY) {
    fs.copyFileSync(MAIN_CACHE, BACKUP_PATH);
    console.log(`  Backup: ${BACKUP_PATH}`);
    fs.writeFileSync(MAIN_CACHE, JSON.stringify(merged));
    console.log(`  ✅ Live cache updated: ${MAIN_CACHE}`);
    console.log(`     Main pool: ${cleanedMain.length} (unchanged for grading)`);
    console.log(`     mlsOnly:   ${mlsOnlyArr.length} (separate, UI-only)`);
  } else {
    fs.writeFileSync(MERGED_OUT, JSON.stringify(merged));
    console.log(`  Dry-run output: ${MERGED_OUT}`);
    console.log(`\n  To apply: node merge-mls.js --apply`);
  }
}

main().catch(e => {
  console.error('\n  ❌ Fatal:', e.message);
  console.error('\n  Stack:\n' + (e.stack || '(no stack)'));
  process.exit(1);
});
