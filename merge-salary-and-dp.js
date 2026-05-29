// merge-salary-and-dp.js
// Merges the MLSPA salary guide and the MLS official DP list into the
// existing player cache (mls-cache.json).
//
// Goal: every player in mls-cache.json gets enriched with:
//   - baseSalary       (number, USD, from MLSPA)
//   - guaranteedComp   (number, USD, from MLSPA)
//   - isDP             (boolean, from MLS official list)
//   - dpOnCurrentRoster (boolean, false if marked with ^ on the DP page)
//
// MATCHING STRATEGY (multi-pass with fallbacks):
//   Pass 1: exact team + exact last name (high confidence)
//   Pass 2: team + last-name TOKEN match (handles "Puig" matching "Puig Martí")
//   Pass 3: team + position narrowing when multiple candidates have a fuzzy name match
//   Pass 4: known-alias table for famous edge cases (Chucky/Hirving Lozano, etc.)
//   Pass 5: report unmatched with full context for manual review
//
// CACHED PLAYER FORMAT (existing):
//   { n: "Lionel Messi", t: "MIA", p: "Forward", a: 38, ... }
//
// MLSPA SALARY FORMAT (just-fetched):
//   { firstName, lastName, club: "Inter Miami", position: "Right Wing", baseSalary, guaranteedComp }
//
// DP LIST FORMAT (just-fetched):
//   teams: { "Inter Miami CF": [ { name: "Lionel Messi", position: "F", onCurrentRoster: true } ] }
//
// USAGE: node merge-salary-and-dp.js
// Reads from public/data/{mls-cache.json, salary-cache.json, dp-list-cache.json}
// Writes back to public/data/mls-cache.json (with a .pre-merge backup)

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join('public', 'data', 'mls-cache.json');
const SALARY_PATH = path.join('public', 'data', 'salary-cache.json');
const DP_PATH = path.join('public', 'data', 'dp-list-cache.json');

for (const p of [CACHE_PATH, SALARY_PATH, DP_PATH]) {
  if (!fs.existsSync(p)) { console.error(`✗ Missing: ${p}`); process.exit(1); }
}

// ─── Team name normalization ───────────────────────────────────────────────
// Cached players use 3-letter abbreviations. Salary + DP sources use full names.
// Map both formats to a canonical abbreviation key.
const TEAM_ABBR = {
  // Salary guide names → 3-letter abbr
  'Atlanta United': 'ATL',
  'Austin FC': 'ATX',
  'Charlotte FC': 'CLT',
  'Chicago Fire': 'CHI',
  'Chicago Fire FC': 'CHI',
  'FC Cincinnati': 'CIN',
  'Colorado Rapids': 'COL',
  'Columbus Crew': 'CLB',
  'FC Dallas': 'DAL',
  'DC United': 'DC',
  'D.C. United': 'DC',
  'Houston Dynamo': 'HOU',
  'Houston Dynamo FC': 'HOU',
  'Sporting Kansas City': 'SKC',
  'LA Galaxy': 'LA',
  'LAFC': 'LAFC',
  'Inter Miami': 'MIA',
  'Inter Miami CF': 'MIA',
  'Minnesota United': 'MIN',
  'Minnesota United FC': 'MIN',
  'CF Montreal': 'MTL',
  'CF Montréal': 'MTL',
  'Nashville SC': 'NSH',
  'New England Revolution': 'NE',
  'New York City FC': 'NYC',
  'New York Red Bulls': 'RBNY',
  'Red Bull New York': 'RBNY',
  'Orlando City SC': 'ORL',
  'Orlando City': 'ORL',
  'Philadelphia Union': 'PHI',
  'Portland Timbers': 'POR',
  'Real Salt Lake': 'RSL',
  'San Diego FC': 'SD',
  'San Jose Earthquakes': 'SJ',
  'Seattle Sounders FC': 'SEA',
  'St. Louis City SC': 'STL',
  'St. Louis CITY SC': 'STL',
  'Toronto FC': 'TOR',
  'Vancouver Whitecaps': 'VAN',
  'Vancouver Whitecaps FC': 'VAN',
  'MLS Pool': '__POOL__' // not a real team
};

// ─── Name normalization ────────────────────────────────────────────────────
// Strip accents, lowercase, collapse spaces. Helps fuzzy matching.
const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
  .toLowerCase()
  .replace(/[^a-z\s'-]/g, '')                          // keep letters, spaces, hyphens, apostrophes
  .replace(/\s+/g, ' ')
  .trim();

const lastToken = name => {
  const parts = norm(name).split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
};

const tokens = name => norm(name).split(' ').filter(Boolean);

// ─── Position normalization ────────────────────────────────────────────────
// Cache uses "Forward"/"Midfielder"/"Defender"/"GK"/"Goalkeeper"
// DP list uses "F"/"M"/"D"/"GK"
// Salary uses fine-grained: "Center Forward"/"Attacking Midfield"/"Right-back"/"Goalkeeper"
const posBucket = p => {
  const s = String(p || '').toLowerCase();
  if (s === 'gk' || s.includes('keeper')) return 'GK';
  if (s === 'd' || s.includes('back') || s.includes('defender')) return 'D';
  if (s === 'm' || s.includes('midfield')) return 'M';
  if (s === 'f' || s.includes('forward') || s.includes('wing') || s.includes('striker')) return 'F';
  return '?';
};

// ─── Known aliases for famous edge cases ──────────────────────────────────
// (DP-list name → salary/cache name) — only used for Pass 4 fallback
const KNOWN_ALIASES = [
  // [salary/cache last token, dp list display name]  -- bidirectional matching
  ['Lozano', 'Hirving Lozano'],   // DP list says "Chucky Lozano"
  ['Puig', 'Riqui Puig'],         // DP list says "Riqui Puig", salary "Ricard Puig Martí"
  ['Son', 'Son Heung-Min'],       // word order varies
  ['Miranchuk', 'Alexey Miranchuk'], // DP "Alexey", salary "Aleksey"
];

// ─── Load all three sources ────────────────────────────────────────────────
console.log('  Loading caches...');
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
const salary = JSON.parse(fs.readFileSync(SALARY_PATH, 'utf8'));
const dp = JSON.parse(fs.readFileSync(DP_PATH, 'utf8'));

console.log(`    Cache: ${cache.players.length} players`);
console.log(`    Salary: ${salary.players.length} players`);
console.log(`    DP list: ${dp.dpCount} DPs across ${Object.keys(dp.teams).length} teams`);

// Backup
const backupPath = CACHE_PATH + '.pre-merge.json';
fs.writeFileSync(backupPath, fs.readFileSync(CACHE_PATH));
console.log(`    Backup: ${backupPath}`);

// ─── Index salary data by team abbr ────────────────────────────────────────
// Each team-abbr maps to an array of salary records.
const salaryByTeam = {};
let salaryNoTeam = 0;
for (const p of salary.players) {
  const abbr = TEAM_ABBR[p.club];
  if (!abbr) { salaryNoTeam++; continue; }
  if (abbr === '__POOL__') continue;  // skip MLS Pool players
  if (!salaryByTeam[abbr]) salaryByTeam[abbr] = [];
  salaryByTeam[abbr].push(p);
}
if (salaryNoTeam > 0) console.warn(`  ⚠  ${salaryNoTeam} salary records had unrecognized team names`);

// ─── Index DP list by team abbr ────────────────────────────────────────────
const dpByTeam = {};
let dpNoTeam = 0;
for (const [teamName, dps] of Object.entries(dp.teams)) {
  const abbr = TEAM_ABBR[teamName];
  if (!abbr) { dpNoTeam += dps.length; console.warn(`  ⚠  Unknown DP team: "${teamName}"`); continue; }
  dpByTeam[abbr] = dps;
}
if (dpNoTeam > 0) console.warn(`  ⚠  ${dpNoTeam} DPs in unrecognized teams`);

// ─── Matching ──────────────────────────────────────────────────────────────
// For each player in cache, find their salary record + DP status.
//
// We track matched salary records to detect duplicates (one salary record
// should only match one cache player). DP matching is simpler since the DP
// list is per-team and small (~2-3 per team).

const usedSalaryIds = new Set();
const stats = {
  total: 0,
  salaryMatched: 0,
  salaryByPass: { 1: 0, 2: 0, 3: 0, 4: 0 },
  salaryUnmatched: [],
  dpMatched: 0,
  dpByPass: { 1: 0, 2: 0, 3: 0, 4: 0 },
  dpUnmatched: []
};

function findSalaryMatch(cachePlayer) {
  const teamAbbr = cachePlayer.t;
  const pool = salaryByTeam[teamAbbr] || [];
  if (!pool.length) return null;

  const cnTokens = tokens(cachePlayer.n);
  const cLast = lastToken(cachePlayer.n);
  const cPosBucket = posBucket(cachePlayer.p);

  const free = pool.filter((_, i) => !usedSalaryIds.has(`${teamAbbr}-${i}`));

  // Pass 1: exact full-name match (first+last)
  const fullNorm = norm(cachePlayer.n);
  let candidates = free.filter(s => norm(`${s.firstName} ${s.lastName}`) === fullNorm);
  if (candidates.length === 1) return { match: candidates[0], pass: 1 };

  // Pass 2: exact last-name match
  candidates = free.filter(s => norm(s.lastName) === cLast);
  if (candidates.length === 1) return { match: candidates[0], pass: 2 };

  // Pass 2b: last-token of salary lastName matches cache lastToken
  // (handles "Puig Martí" → matches cache "Puig")
  if (candidates.length === 0) {
    candidates = free.filter(s => {
      const sLastTokens = norm(s.lastName).split(' ');
      return sLastTokens.includes(cLast);
    });
    if (candidates.length === 1) return { match: candidates[0], pass: 2 };
  }

  // Pass 3: multiple last-name candidates? Disambiguate by position.
  if (candidates.length > 1) {
    const byPos = candidates.filter(s => posBucket(s.position) === cPosBucket);
    if (byPos.length === 1) return { match: byPos[0], pass: 3 };
    if (byPos.length === 0) {
      // Position mismatch on all — fall through
    } else {
      // Multiple same-position matches, try first-name fuzzy
      const cFirst = cnTokens[0] || '';
      const byFirst = byPos.filter(s => norm(s.firstName).startsWith(cFirst.slice(0, 3)) || cFirst.startsWith(norm(s.firstName).slice(0, 3)));
      if (byFirst.length === 1) return { match: byFirst[0], pass: 3 };
    }
  }

  // Pass 4: first-name + last-name token overlap (catches reversed names like Son Heung-Min)
  candidates = free.filter(s => {
    const sTokens = norm(`${s.firstName} ${s.lastName}`).split(' ').filter(Boolean);
    const overlap = cnTokens.filter(t => sTokens.includes(t)).length;
    return overlap >= 2;  // require at least 2 shared tokens
  });
  if (candidates.length === 1) return { match: candidates[0], pass: 4 };
  if (candidates.length > 1) {
    const byPos = candidates.filter(s => posBucket(s.position) === cPosBucket);
    if (byPos.length === 1) return { match: byPos[0], pass: 4 };
  }

  return null;
}

function findDpMatch(cachePlayer) {
  const teamAbbr = cachePlayer.t;
  const teamDps = dpByTeam[teamAbbr] || [];
  if (!teamDps.length) return null;

  const cnTokens = tokens(cachePlayer.n);
  const cLast = lastToken(cachePlayer.n);
  const cPosBucket = posBucket(cachePlayer.p);

  // Pass 1: exact full match
  const fullNorm = norm(cachePlayer.n);
  let candidates = teamDps.filter(d => norm(d.name) === fullNorm);
  if (candidates.length === 1) return { match: candidates[0], pass: 1 };

  // Pass 2: last-name match (with token fallback for "Puig" matching "Puig Martí")
  candidates = teamDps.filter(d => {
    const dTokens = tokens(d.name);
    const dLast = dTokens[dTokens.length - 1] || '';
    return dLast === cLast || dTokens.includes(cLast) || cnTokens.includes(dLast);
  });
  if (candidates.length === 1) return { match: candidates[0], pass: 2 };

  // Pass 3: token overlap + position narrowing
  if (candidates.length > 1) {
    const byPos = candidates.filter(d => posBucket(d.position) === cPosBucket);
    if (byPos.length === 1) return { match: byPos[0], pass: 3 };
  }

  // Pass 4: any token overlap (catches reordered names like Son Heung-Min)
  candidates = teamDps.filter(d => {
    const dTokens = tokens(d.name);
    return cnTokens.some(t => dTokens.includes(t) && t.length >= 3);
  });
  if (candidates.length === 1) return { match: candidates[0], pass: 4 };
  if (candidates.length > 1) {
    const byPos = candidates.filter(d => posBucket(d.position) === cPosBucket);
    if (byPos.length === 1) return { match: byPos[0], pass: 4 };
  }

  return null;
}

// ─── Run matching ──────────────────────────────────────────────────────────
console.log('\n  Matching...');
for (const p of cache.players) {
  if (p.isGK !== undefined && p.t === undefined) continue;  // sanity
  stats.total++;

  // Salary match
  const salaryMatch = findSalaryMatch(p);
  if (salaryMatch) {
    p.baseSalary = salaryMatch.match.baseSalary;
    p.guaranteedComp = salaryMatch.match.guaranteedComp;
    stats.salaryMatched++;
    stats.salaryByPass[salaryMatch.pass]++;
    // Mark the salary record as used (to prevent re-matching)
    const pool = salaryByTeam[p.t];
    const idx = pool.indexOf(salaryMatch.match);
    if (idx >= 0) usedSalaryIds.add(`${p.t}-${idx}`);
  } else {
    stats.salaryUnmatched.push(p);
  }

  // [NO-DP] isDP is set authoritatively by fetch-data.js from the MLS Digital
  // API (playerCategory). We intentionally do NOT overwrite it here — the old
  // press-release fuzzy matcher produced false positives and clobbered correct
  // API values. Salary merge below is unaffected.
}

// ─── Report ────────────────────────────────────────────────────────────────
console.log(`\n  Salary matches: ${stats.salaryMatched}/${stats.total} (${(stats.salaryMatched/stats.total*100).toFixed(1)}%)`);
console.log(`    Pass 1 (exact full): ${stats.salaryByPass[1]}`);
console.log(`    Pass 2 (exact last): ${stats.salaryByPass[2]}`);
console.log(`    Pass 3 (pos narrow): ${stats.salaryByPass[3]}`);
console.log(`    Pass 4 (token overlap): ${stats.salaryByPass[4]}`);

console.log(`\n  DP matches: ${stats.dpMatched} (expected ~73 from official list)`);
console.log(`    Pass 1 (exact full): ${stats.dpByPass[1]}`);
console.log(`    Pass 2 (exact last): ${stats.dpByPass[2]}`);
console.log(`    Pass 3 (pos narrow): ${stats.dpByPass[3]}`);
console.log(`    Pass 4 (token overlap): ${stats.dpByPass[4]}`);

// Unmatched DPs: which DPs in the official list didn't find a cache player?
const unmatchedDps = [];
for (const [teamAbbr, dps] of Object.entries(dpByTeam)) {
  for (const d of dps) {
    const found = cache.players.some(p =>
      p.t === teamAbbr && p.isDP &&
      tokens(p.n).some(t => tokens(d.name).includes(t) && t.length >= 3)
    );
    if (!found) unmatchedDps.push(`${d.name} (${teamAbbr}, ${d.position})`);
  }
}
if (unmatchedDps.length) {
  console.log(`\n  ⚠  DPs from official list NOT matched in cache (${unmatchedDps.length}):`);
  unmatchedDps.forEach(d => console.log(`    - ${d}`));
}

// Sample salary unmatched (limit 10)
if (stats.salaryUnmatched.length) {
  console.log(`\n  ⚠  Salary unmatched (${stats.salaryUnmatched.length} of ${stats.total}):`);
  const sample = stats.salaryUnmatched.slice(0, 15);
  for (const p of sample) console.log(`    - ${p.n} (${p.t}, ${p.p})`);
  if (stats.salaryUnmatched.length > 15) console.log(`    ... and ${stats.salaryUnmatched.length - 15} more`);
}

// Write back
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
const sizeKB = (fs.statSync(CACHE_PATH).size / 1024).toFixed(0);
console.log(`\n✓ ${CACHE_PATH} updated (${sizeKB} KB)`);

console.log('\n  Spot checks:');
for (const target of ['Messi', 'Collodi', 'Puig', 'Lozano', 'Son']) {
  const found = cache.players.find(p => (p.n || '').toLowerCase().includes(target.toLowerCase()));
  if (found) {
    const dpTag = found.isDP ? ` [DP${found.dpOnCurrentRoster ? '' : '-off-roster'}]` : '';
    console.log(`    ${found.n} (${found.t}): base=$${(found.baseSalary||0).toLocaleString()}, guar=$${(found.guaranteedComp||0).toLocaleString()}${dpTag}`);
  }
}

// Verify: total DPs in cache after merge
const cacheDpCount = cache.players.filter(p => p.isDP).length;
console.log(`\n  Cache now has ${cacheDpCount} DPs (vs ${dp.dpCount} on official list)`);
