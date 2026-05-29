// fetch-dp-list.js
// Scrapes the official MLS Designated Player list (the authoritative source
// for who's a DP) and writes a structured JSON cache.
//
// SOURCE: https://www.mlssoccer.com/news/every-designated-player-in-mls-full-list-dps
//   Public page maintained by MLS. Updated periodically (last seen update:
//   May 11, 2026). Structure:
//     <h3>Team Name</h3>
//     <ul>
//       <li><a href="/players/...">Player Name</a> (Position)</li>
//       ...
//     </ul>
//   A trailing "^" in some list items means the player occupies a DP slot
//   but is not on the current roster (loaned out, etc.).
//
// OUTPUT: public/data/dp-list-cache.json
//   {
//     generated: ISO timestamp,
//     source: "MLSsoccer.com - Every Designated Player",
//     sourceUrl: "...",
//     asOfDate: "May 11, 2026",   (parsed from page if present)
//     dpCount: N,
//     teams: { "Atlanta United": [ { name, position, onCurrentRoster }, ... ] }
//   }
//
// USAGE: node fetch-dp-list.js
// No new dependencies. Node 18+ built-in fetch.

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://www.mlssoccer.com/news/every-designated-player-in-mls-full-list-dps';
const OUTPUT_PATH = path.join('public', 'data', 'dp-list-cache.json');

// Strip HTML tags + decode common entities
function cleanText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull "May 11, 2026" out of "Updated as of: May 11, 2026"
function extractAsOfDate(html) {
  const m = html.match(/Updated as of[^<>]*?:\s*<[^>]*>?\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})/i)
       || html.match(/Updated as of[^<>]*?:\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})/i);
  return m ? m[1] : null;
}

async function main() {
  console.log(`  Fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (USFI fetcher)',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const html = await res.text();
  console.log(`  Got ${(html.length / 1024).toFixed(0)} KB of HTML`);

  const asOfDate = extractAsOfDate(html);
  if (asOfDate) console.log(`  As-of date: ${asOfDate}`);
  else console.log(`  As-of date: not detected (continuing anyway)`);

  // Strategy: walk the HTML and pair each <h3>Team</h3> with the next <ul>...</ul>.
  // We collect every h3 with its index, every ul with its index, then for each
  // h3 the nearest following ul is its DP list.
  const headerRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const listRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;

  const headers = [];   // [{ index, text }]
  const lists = [];     // [{ index, body }]
  let m;
  while ((m = headerRegex.exec(html)) !== null) {
    headers.push({ index: m.index, text: cleanText(m[1]) });
  }
  while ((m = listRegex.exec(html)) !== null) {
    lists.push({ index: m.index, body: m[1] });
  }
  console.log(`  Parsed ${headers.length} <h3> headers, ${lists.length} <ul> lists`);

  // Known MLS team names — we only keep h3 sections that match these.
  // Names follow the exact form used on the page.
  const MLS_TEAMS = new Set([
    'Atlanta United', 'Austin FC', 'Charlotte FC', 'Chicago Fire FC',
    'FC Cincinnati', 'Colorado Rapids', 'Columbus Crew', 'FC Dallas',
    'D.C. United', 'Houston Dynamo FC', 'Sporting Kansas City',
    'LA Galaxy', 'LAFC', 'Inter Miami CF', 'Minnesota United FC',
    'CF Montréal', 'CF Montreal', 'Nashville SC', 'New England Revolution',
    'New York City FC', 'Red Bull New York', 'New York Red Bulls',
    'Orlando City', 'Orlando City SC', 'Philadelphia Union',
    'Portland Timbers', 'Real Salt Lake', 'San Diego FC',
    'San Jose Earthquakes', 'Seattle Sounders FC', 'St. Louis CITY SC',
    'St. Louis City SC', 'Toronto FC', 'Vancouver Whitecaps FC'
  ]);

  // For each team header, find the first <ul> that comes after it.
  const teams = {};
  let dpCount = 0;

  for (const h of headers) {
    if (!MLS_TEAMS.has(h.text)) continue;
    const followingList = lists.find(l => l.index > h.index);
    if (!followingList) continue;

    // Parse each <li> in the list body
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    const players = [];
    let li;
    while ((li = liRegex.exec(followingList.body)) !== null) {
      // Player name lives in the anchor: <a href="/players/...">Name</a>
      const aMatch = li[1].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) continue;
      const name = cleanText(aMatch[1]);

      // After the anchor, the remaining text contains "(Position)" and maybe "^"
      const tail = cleanText(li[1].replace(/<a[^>]*>[\s\S]*?<\/a>/i, ''));
      // Examples: "(M)" "(F) ^" "(GK)" "(M)^"
      const posMatch = tail.match(/\(([A-Z]{1,3})\)/);
      const position = posMatch ? posMatch[1] : '';
      const onCurrentRoster = !tail.includes('^');

      if (name) {
        players.push({ name, position, onCurrentRoster });
        dpCount++;
      }
    }

    if (players.length) teams[h.text] = players;
  }

  console.log(`  Found DPs for ${Object.keys(teams).length} teams, ${dpCount} DPs total`);

  if (dpCount < 40 || dpCount > 100) {
    console.error(`✗ DP count ${dpCount} looks wrong (expected ~60-80). Page format may have changed.`);
    console.error(`  Dumping the first 10 headers we found, for diagnostics:`);
    headers.slice(0, 10).forEach(h => console.error(`    "${h.text}"`));
    process.exit(1);
  }

  const out = {
    generated: new Date().toISOString(),
    source: 'MLSsoccer.com - Every Designated Player',
    sourceUrl: SOURCE_URL,
    asOfDate: asOfDate || 'unknown',
    dpCount,
    teams
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log(`\n✓ ${OUTPUT_PATH} (${sizeKB} KB)`);

  // Spot-check: print every team's DPs
  console.log('\n  DPs by team:');
  for (const team of Object.keys(teams).sort()) {
    const ps = teams[team].map(p => {
      const tag = p.onCurrentRoster ? '' : ' [off-roster]';
      return `${p.name} (${p.position})${tag}`;
    }).join(', ');
    console.log(`    ${team}: ${ps}`);
  }

  // Sanity stats
  const teamCounts = Object.entries(teams).map(([t, ps]) => [t, ps.length]);
  const max = Math.max(...teamCounts.map(([, n]) => n));
  const min = Math.min(...teamCounts.map(([, n]) => n));
  console.log(`\n  DPs/team: min ${min}, max ${max}, avg ${(dpCount/Object.keys(teams).length).toFixed(1)}`);
  console.log(`  Teams with 4 DPs (one off-roster): ${teamCounts.filter(([,n])=>n===4).map(([t])=>t).join(', ') || 'none'}`);
  console.log(`  Teams with only 1 DP: ${teamCounts.filter(([,n])=>n===1).map(([t])=>t).join(', ') || 'none'}`);
}

main().catch(err => {
  console.error('✗ Failed:', err);
  process.exit(1);
});
