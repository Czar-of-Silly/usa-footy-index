// Test the tryMatch function on real edge cases.
// Doesn't read any files — just exercises the matching logic in isolation.

const path = require('path');
// Load merge-mls's matching by source — extract the function via require trick.
// Easier: copy/import the normalization functions.

function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(s) {
  return new Set(normName(s).split(' ').filter(t => t.length >= 2));
}

function tryMatch(mlsName, mlsTeam, exName, exTeam) {
  const mn = normName(mlsName);
  const en = normName(exName);
  if (!mn || !en) return null;
  if (mn === en && mlsTeam === exTeam) return { tier: 'A', conf: 1.0 };
  if (mlsTeam === exTeam) {
    const mts = nameTokens(mlsName);
    const ets = nameTokens(exName);
    if (mts.size && ets.size) {
      const [shorter, longer] = mts.size <= ets.size ? [mts, ets] : [ets, mts];
      let allContained = true;
      for (const t of shorter) if (!longer.has(t)) { allContained = false; break; }
      if (allContained && shorter.size >= 2) return { tier: 'B', conf: 0.9 };
      if (allContained && shorter.size === 1) {
        const onlyTok = [...shorter][0];
        if (onlyTok.length >= 4) return { tier: 'C', conf: 0.7 };
      }
      const mlsTokensArr = [...mts];
      const exTokensArr = [...ets];
      const mlsLast = mlsTokensArr[mlsTokensArr.length - 1];
      const exLast  = exTokensArr[exTokensArr.length - 1];
      if (mlsLast && exLast && mlsLast === exLast && mlsLast.length >= 4) {
        return { tier: 'C', conf: 0.7 };
      }
    }
  }
  if (mn === en && mlsTeam !== exTeam) return { tier: 'D', conf: 0.6 };
  return null;
}

const cases = [
  // [description, mlsName, mlsTeam, existingName, existingTeam, expectedTier]
  ['Exact same name + team',     'Lionel Messi',           'MIA', 'Lionel Messi',          'MIA', 'A'],
  ['Diacritic vs ASCII',         'João Peglow',            'POR', 'Joao Peglow',           'POR', 'A'],
  ['Reverse diacritic',          'Joao Peglow',            'POR', 'João Peglow',           'POR', 'A'],
  ['Compound surname → short',   'Evander Da Silva Ferreira', 'CIN', 'Evander',            'CIN', 'C'],  // single-token containment now C
  ['Compound surname → partial', 'Evander Da Silva Ferreira', 'CIN', 'Evander Ferreira',   'CIN', 'B'],  // two tokens → B
  ['Initial stripped → C',       'Saba Lobjanidze',        'ATL', 'S. Lobjanidze',         'ATL', 'C'],  // "S." → single token
  ['Apostrophe',                 "Cristian Espinoza",      'SJ',  "Cristian Espinoza",     'SJ',  'A'],
  ['Suffix stripped',            'Robert Smith Jr',        'NYC', 'Robert Smith',          'NYC', 'A'],
  ['Initial vs full → C',        'Brian White',            'VAN', 'B. White',              'VAN', 'C'],
  ['Different last DIFF team',   'Brian White',            'VAN', 'Bobby White',           'CIN', null],
  ['Transfer — same name diff team', 'Bouanga Denis',      'LAFC','Bouanga Denis',         'ATL', 'D'],
  ['Same surname, wrong first',  'John Garcia',            'LA',  'Maria Garcia',          'LA',  'C'],
  ['Anibal vs Aníbal',           'Aníbal Godoy',           'SD',  'Anibal Godoy',          'SD',  'A'],
  ['Different player + team',    'Carlos Vela',            'LAFC','Diego Rossi',           'LAFC', null],
  ['Same team & first only',     'Diego Sanchez',          'LA',  'Diego Martinez',        'LA',  null],
  ['One-name player',            'Hulk',                   'ATL', 'Hulk',                  'ATL', 'A'],
  ['Hyphenated surname (realistic)', 'Maren Haile-Selassie', 'CHI', 'Maren Haile-Selassie', 'CHI', 'A'],
  ['Hyphen → suffix differs',        'Brendan Hines-Ike',    'DC',  'Brendan Hines',         'DC',  'B'],  // both tokens contained → B
];

console.log('═'.repeat(80));
console.log('  NAME-MATCHING TESTS');
console.log('═'.repeat(80));
let pass = 0, fail = 0;
for (const [desc, mn, mt, en, et, expected] of cases) {
  const result = tryMatch(mn, mt, en, et);
  const got = result ? result.tier : null;
  const ok = got === expected;
  if (ok) pass++; else fail++;
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} [${(got || '_').padEnd(4)}] expected [${(expected || '_').padEnd(4)}]  ${desc}`);
  if (!ok) console.log(`       "${mn}" [${mt}]  vs  "${en}" [${et}]`);
}
console.log('═'.repeat(80));
console.log(`  Passed: ${pass}/${cases.length}  Failed: ${fail}`);
console.log('═'.repeat(80));
process.exit(fail > 0 ? 1 : 0);
