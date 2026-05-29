// fetch-mls-rosters.js (v2)
// LAYER 1 data fetcher: MLS official rosters via MLS Digital API.
//
// CHANGES FROM v1:
//   • Whitelist filter: only the 30 real MLS teams (the /clubs endpoint
//     returns 98 entries including national teams, US Open Cup opponents,
//     and NEXT Pro clubs — those get skipped, saving ~68 wasted API calls)
//   • Complete sportecId ↔ abbreviation map for all 30 MLS teams
//   • Cleaner output: only real MLS teams in the final JSON
//
// SOURCE: dapi.mlssoccer.com (public, no auth)
// OUTPUT: public/data/rosters-cache.json
// USAGE:  node fetch-mls-rosters.js [--verbose]

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://dapi.mlssoccer.com/v2/content/en-us';
const OUTPUT_PATH = path.join('public', 'data', 'rosters-cache.json');
const VERBOSE = process.argv.includes('--verbose');

// ─── Whitelist: club display name → USFI 3-letter abbreviation ────────────
// Names match exactly what the API returns in club.title.
const MLS_TEAMS = {
  'Atlanta United':              'ATL',
  'Austin FC':                   'ATX',
  'Charlotte FC':                'CLT',
  'Chicago Fire FC':             'CHI',
  'FC Cincinnati':               'CIN',
  'Colorado Rapids':             'COL',
  'Columbus Crew':               'CLB',
  'FC Dallas':                   'DAL',
  'D.C. United':                 'DC',
  'Houston Dynamo FC':           'HOU',
  'Sporting Kansas City':        'SKC',
  'LA Galaxy':                   'LA',
  'Los Angeles Football Club':   'LAFC',
  'Inter Miami CF':              'MIA',
  'Minnesota United FC':         'MIN',
  'CF Montréal':                 'MTL',
  'Nashville SC':                'NSH',
  'New England Revolution':      'NE',
  'New York City Football Club': 'NYC',
  'Red Bull New York':           'RBNY',
  'Orlando City':                'ORL',
  'Philadelphia Union':          'PHI',
  'Portland Timbers':            'POR',
  'Real Salt Lake':              'RSL',
  'San Diego FC':                'SD',
  'San Jose Earthquakes':        'SJ',
  'Seattle Sounders FC':         'SEA',
  'St. Louis CITY SC':           'STL',
  'Toronto FC':                  'TOR',
  'Vancouver Whitecaps FC':      'VAN'
};

async function fetchJson(url) {
  if (VERBOSE) console.log(`    GET ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (USFI fetcher)',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Step 1: get the clubs list, filter to whitelisted MLS teams
async function discoverClubs() {
  const url = `${API_BASE}/clubs?$skip=0&$limit=100`;
  const data = await fetchJson(url);
  const items = data.items || [];

  const allMlsClubs = items.filter(it => {
    const sid = it.fields?.sportecId || it.sportecId || '';
    return sid.startsWith('MLS-CLU-') && MLS_TEAMS[it.title];
  }).map(it => {
    const f = it.fields || {};
    return {
      sportecId: f.sportecId || it.sportecId,
      optaId:    f.optaId    || it.optaId,
      name:      it.title,
      abbr:      MLS_TEAMS[it.title],
      slug:      it.slug
    };
  });

  const missing = Object.keys(MLS_TEAMS).filter(n =>
    !allMlsClubs.some(c => c.name === n)
  );
  if (missing.length) {
    console.warn(`  ⚠  Expected MLS team(s) not found in /clubs response:`);
    missing.forEach(n => console.warn(`        "${n}"`));
    console.warn(`     Likely a name mismatch — check API's club.title vs MLS_TEAMS keys.`);
  }
  return allMlsClubs;
}

async function fetchClubPlayers(clubSportecId) {
  const all = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    const url = `${API_BASE}/players?fields.clubSportecId=${clubSportecId}&fields.isActiveMLSPlayer=true&$skip=${skip}&$limit=${limit}`;
    const data = await fetchJson(url);
    const items = data.items || [];
    all.push(...items);
    if (items.length < limit) break;
    skip += limit;
    if (skip > 500) break;
  }
  return all;
}

function normalizePlayer(raw, clubAbbr) {
  const f = raw.fields || {};
  const dob = f.dateOfBirth ? new Date(f.dateOfBirth) : null;
  const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

  const cats = [f.playerCategory_1, f.playerCategory_2].filter(Boolean);

  return {
    sportecId:        f.sportecId,
    optaId:           f.optaId,
    clubSportecId:    f.clubSportecId,
    clubOptaId:       f.clubOptaId,
    clubAbbr,
    firstName:        f.firstName,
    lastName:         f.lastName,
    knownName:        f.knownName || null,
    displayName:      raw.title,
    jerseyNumber:     f.jerseyNumber || null,
    position:         f.position,
    height:           f.height ? parseInt(f.height) : null,
    weight:           f.weight ? parseInt(f.weight) : null,
    footedness:       f.footedness || null,
    dateOfBirth:      f.dateOfBirth || null,
    age,
    cityOfBirth:      f.cityOfBirth || null,
    countryOfBirth:   f.countryOfBirth || null,
    rosterCategory:   f.rosterCategory || null,
    isSenior:         f.rosterCategory === 'Senior',
    isActiveMLSPlayer:!!f.isActiveMLSPlayer,
    isEligible:       !!f.isEligible,
    onLoan:           !!f.onLoan,
    isLoanedOut:      f.playerStatus_1 === 'Loaned Out',
    playerStatus_1:   f.playerStatus_1 || null,
    playerCategory_1: f.playerCategory_1 || null,
    playerCategory_2: f.playerCategory_2 || null,
    isDP:             cats.includes('Designated Player'),
    isU22:            cats.includes('U22 Initiative'),
    isHomegrown:      cats.includes('Homegrown'),
    isInternational:  cats.includes('International'),
    isGenAdidas:      cats.includes('Generation Adidas'),
    headshot:         raw.thumbnail?.thumbnailUrl || null,
    slug:             raw.slug || null,
    lastUpdated:      raw.lastUpdatedDate || null
  };
}

async function main() {
  console.log('  USFI — MLS Rosters Fetcher (v2)');
  console.log(`  ${API_BASE}`);
  console.log('  ───────────────────────────────────────');

  console.log('\n  [1] Discovering MLS clubs...');
  const clubs = await discoverClubs();
  console.log(`      ${clubs.length} MLS clubs to query (skipping non-MLS entries)`);

  console.log('\n  [2] Fetching rosters...');
  const teams = {};
  const allPlayers = [];
  let errorCount = 0;

  for (const club of clubs) {
    try {
      const rawPlayers = await fetchClubPlayers(club.sportecId);
      const normalized = rawPlayers.map(p => normalizePlayer(p, club.abbr));

      teams[club.sportecId] = {
        sportecId:   club.sportecId,
        optaId:      club.optaId || null,
        name:        club.name,
        abbr:        club.abbr,
        playerCount: normalized.length,
        players:     normalized
      };
      allPlayers.push(...normalized);

      const dps    = normalized.filter(p => p.isDP).length;
      const u22    = normalized.filter(p => p.isU22).length;
      const intl   = normalized.filter(p => p.isInternational).length;
      const loaned = normalized.filter(p => p.isLoanedOut).length;
      console.log(`      ${club.name.padEnd(30)} [${club.abbr.padEnd(4)}] ${String(normalized.length).padStart(3)} players (DPs:${dps} U22:${u22} Intl:${intl} Loaned:${loaned})`);
    } catch (e) {
      errorCount++;
      console.error(`      ✗ ${club.name}: ${e.message}`);
    }
  }

  if (Object.keys(teams).length < 25) {
    console.error('\n✗ Got fewer than 25 MLS teams. Something is wrong.');
    process.exit(1);
  }

  // Spot checks
  const targets = ['Puig', 'Lozano', 'Gauld', 'de la Vega'];
  console.log('\n  [3] Spot checks for previously missing players:');
  for (const t of targets) {
    const matches = allPlayers.filter(p => (p.displayName || '').toLowerCase().includes(t.toLowerCase()));
    if (matches.length) {
      for (const m of matches) {
        const tags = [
          m.isDP && 'DP',
          m.isU22 && 'U22',
          m.isHomegrown && 'HG',
          m.isInternational && 'Intl',
          m.isLoanedOut && 'Loaned'
        ].filter(Boolean);
        console.log(`      ✓ ${m.displayName} (${m.clubAbbr}, ${m.position}) [${tags.join(',') || '—'}]`);
      }
    } else {
      console.log(`      ✗ ${t}: still not found`);
    }
  }

  // Write output
  const out = {
    generated:   new Date().toISOString(),
    source:      'MLS Digital API',
    sourceUrl:   `${API_BASE}/players`,
    teamCount:   Object.keys(teams).length,
    playerCount: allPlayers.length,
    teams,
    players:     allPlayers
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(`\n✓ ${OUTPUT_PATH} (${sizeKB} KB)`);

  const totalDPs    = allPlayers.filter(p => p.isDP).length;
  const totalU22    = allPlayers.filter(p => p.isU22).length;
  const totalIntl   = allPlayers.filter(p => p.isInternational).length;
  const totalHG     = allPlayers.filter(p => p.isHomegrown).length;
  const totalLoaned = allPlayers.filter(p => p.isLoanedOut).length;
  console.log('\n  League-wide counts:');
  console.log(`    Teams:         ${Object.keys(teams).length}  (expected 30)`);
  console.log(`    Players:       ${allPlayers.length}`);
  console.log(`    DPs:           ${totalDPs}  (expected ~70-75)`);
  console.log(`    U22:           ${totalU22}`);
  console.log(`    International: ${totalIntl}`);
  console.log(`    Homegrown:     ${totalHG}`);
  console.log(`    Loaned out:    ${totalLoaned}`);
  if (errorCount > 0) console.log(`    ⚠  Failed teams: ${errorCount}`);
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err);
  process.exit(1);
});
