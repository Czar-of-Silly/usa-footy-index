// fetch-salary-data.js
// Fetches the MLS Players Association Salary Guide and converts the HTML
// table into a structured JSON cache.
//
// SOURCE: https://mlsplayers.org/resources/salary-guide
//   Public page. Single <table> element with columns:
//     First Name | Last Name | Club | Position(s) | Base Salary | Guaranteed Compensation
//   Updated twice per season (typically May and October).
//
// OUTPUT: public/data/salary-cache.json
//   {
//     generated: ISO timestamp,
//     source: "MLSPA Salary Guide",
//     sourceUrl: "https://mlsplayers.org/resources/salary-guide",
//     asOfDate: "April 16, 2026",   (parsed from page header if available)
//     playerCount: N,
//     players: [
//       {
//         firstName, lastName, club, position,
//         baseSalary,            // number, USD
//         guaranteedComp         // number, USD
//       }, ...
//     ]
//   }
//
// USAGE: node fetch-salary-data.js
// No new dependencies. Uses Node 18+ built-in fetch.

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://mlsplayers.org/resources/salary-guide';
const OUTPUT_PATH = path.join('public', 'data', 'salary-cache.json');

// Parse currency strings like "$25,000,000.00" into numbers
function parseMoney(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/[$,\s]/g, '').replace(/&nbsp;/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Strip HTML tags + decode common entities from a cell
function cleanCell(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')      // remove tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract the <table> body from the salary guide page HTML
function extractRows(html) {
  // Find first <table> ... </table>
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const tableInner = tableMatch[1];

  // Split into <tr> rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let m;
  while ((m = rowRegex.exec(tableInner)) !== null) {
    rows.push(m[1]);
  }
  return rows;
}

// Pull <td> cells out of a single <tr> body
function extractCells(rowHtml) {
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(rowHtml)) !== null) {
    cells.push(cleanCell(m[1]));
  }
  return cells;
}

// Parse "April 16, 2026" out of the page if mentioned
function extractAsOfDate(html) {
  // The page says: "salary information for all MLS players under contract as of <strong>April 16, 2026</strong>"
  const m = html.match(/as of[\s\S]{0,40}?([A-Z][a-z]+ \d{1,2},\s*\d{4})/);
  return m ? m[1] : null;
}

async function main() {
  console.log(`  Fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: {
      // Some servers reject default Node UA. Pretend to be a browser.
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

  const rows = extractRows(html);
  console.log(`  Found ${rows.length} <tr> rows in table`);

  const players = [];
  let skippedHeader = 0;
  let skippedMalformed = 0;

  for (const row of rows) {
    const cells = extractCells(row);
    if (cells.length < 6) { skippedMalformed++; continue; }

    const [firstName, lastName, club, position, baseSalaryStr, guaranteedCompStr] = cells;

    // Skip the header row
    if (/first ?name/i.test(firstName) || /last ?name/i.test(lastName)) {
      skippedHeader++;
      continue;
    }

    // Sanity check: salary columns should look like money
    if (!/[\d$]/.test(baseSalaryStr) || !/[\d$]/.test(guaranteedCompStr)) {
      skippedMalformed++;
      continue;
    }

    players.push({
      firstName,
      lastName,
      club,
      position,
      baseSalary: parseMoney(baseSalaryStr),
      guaranteedComp: parseMoney(guaranteedCompStr)
    });
  }

  console.log(`  Parsed ${players.length} players (skipped ${skippedHeader} header, ${skippedMalformed} malformed)`);

  if (players.length < 500) {
    console.error('✗ Parsed too few players. Page format may have changed.');
    process.exit(1);
  }

  const out = {
    generated: new Date().toISOString(),
    source: 'MLSPA Salary Guide',
    sourceUrl: SOURCE_URL,
    asOfDate: asOfDate || 'unknown',
    playerCount: players.length,
    players
  };

  // Make sure output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(`\n✓ ${OUTPUT_PATH} (${sizeKB} KB)`);

  // Spot-check output by printing a few notable players
  const messi = players.find(p => p.lastName === 'Messi');
  const collodi = players.find(p => p.lastName === 'Collodi');
  const top10 = [...players].sort((a, b) => b.guaranteedComp - a.guaranteedComp).slice(0, 10);

  console.log('\n  Spot checks:');
  if (messi) console.log(`    Messi:    base=$${messi.baseSalary.toLocaleString()}  guar=$${messi.guaranteedComp.toLocaleString()}  (${messi.club})`);
  if (collodi) console.log(`    Collodi:  base=$${collodi.baseSalary.toLocaleString()}  guar=$${collodi.guaranteedComp.toLocaleString()}  (${collodi.club})`);

  console.log('\n  Top 10 by guaranteed compensation:');
  top10.forEach((p, i) => {
    const tag = p.guaranteedComp > 803125 ? '[DP]' : '    ';
    console.log(`    ${(i+1).toString().padStart(2)}. ${tag} ${p.firstName} ${p.lastName} (${p.club}) — $${p.guaranteedComp.toLocaleString()}`);
  });

  // Sanity stats
  const dpCount = players.filter(p => p.guaranteedComp > 803125).length;
  const minWage = players.filter(p => p.guaranteedComp <= 100000).length;
  console.log(`\n  Derived stats:`);
  console.log(`    Auto-DP (guar > $803,125): ${dpCount} players`);
  console.log(`    Near-minimum (guar ≤ $100k): ${minWage} players`);
  console.log(`    Distinct clubs: ${new Set(players.map(p => p.club)).size}`);
}

main().catch(err => {
  console.error('✗ Failed:', err);
  process.exit(1);
});
