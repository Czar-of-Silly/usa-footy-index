// enrich-gk-fields.js
// One-off enrichment: pulls additional MLS fields out of the raw stats cache
// and overlays them onto matched players in mls-cache.json.
//
// Background: merge-mls.js v3 successfully matched 768 players but only flattened
// a subset of MLS fields onto each player. We need more fields for GK grading:
//   - pressures, aerialsWon, aerialsLost (Command)
//   - difficultPassesPct, passingPerformance, xPass, passesPct (Distribution)
//   - intCorner, intCross, intHeld, intFisted (Sweeping)
//   - pressureResistance, escapeRate (bonus signals)
//
// Strategy: re-match by team+lastName (sufficient since names within a team are unique).
// For each match, overlay the new fields with `mls` prefix.
//
// Idempotent: safe to re-run. Backs up cache before writing.

const fs = require("fs");
const path = require("path");

const CACHE_PATH = "public/data/mls-cache.json";
const STATS_PATH = "public/data/mls-stats-cache.json";

if (!fs.existsSync(CACHE_PATH)) { console.error(`✗ ${CACHE_PATH} not found`); process.exit(1); }
if (!fs.existsSync(STATS_PATH)) { console.error(`✗ ${STATS_PATH} not found`); process.exit(1); }

console.log("  Reading caches…");
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
const stats = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));

// Backup
const backupPath = CACHE_PATH + ".pre-enrich.json";
fs.writeFileSync(backupPath, fs.readFileSync(CACHE_PATH));
console.log(`  Backup written: ${backupPath}`);

// Index raw stats by team+lastName (lowercase) and team+name
const statsByKey = {};
const norm = s => String(s||"").toLowerCase().replace(/[^a-z]/g,"");
const playersArr = Array.isArray(stats.players) ? stats.players : Object.values(stats.players);
console.log(`  Raw stats: ${playersArr.length} players`);

for (const sp of playersArr) {
  const team = sp.team || sp.teamName || "";
  // Try multiple keys for robust matching
  if (sp.lastName) statsByKey[`${norm(team)}::${norm(sp.lastName)}`] = sp;
  if (sp.name)     statsByKey[`${norm(team)}::${norm(sp.name)}`] = sp;
  // Also key by name alone (last resort fallback)
  if (sp.lastName) statsByKey[`__name__::${norm(sp.lastName)}`] = sp;
}

// Fields to overlay (camelCase in raw → mlsXxx on player)
const FIELDS = {
  // Command inputs
  mlsPressures:           "pressures",
  mlsAvgPressure:         "avgPressure",
  mlsAerialsWon:          "aerialsWon",
  mlsAerialsLost:         "aerialsLost",
  mlsAerialsTotal:        "aerialsTotal",
  // Distribution inputs (rate-based, not volume)
  mlsDifficultPassesPct:  "difficultPassesPct",
  mlsPassingPerformance:  "passingPerformance",
  mlsXPass:               "xPass",
  mlsPassesPct:           "passesPct",
  mlsPassesLongPct:       "passesLongPct",
  mlsPassUnderPressurePct:"passUnderPressurePct",
  // Sweeping inputs (GK-specific interception types)
  mlsIntCorner:           "intCorner",
  mlsIntCross:            "intCross",
  mlsIntHeld:             "intHeld",
  mlsIntFisted:           "intFisted",
  // Bonus signals
  mlsPressureResistance:  "pressureResistance",
  mlsEscapeRate:          "escapeRate",
  mlsXgEfficiency:        "xGEfficiency",
  // Volume signals also useful
  mlsShotsFaced:          "shotsFaced",
  mlsDistance:            "distance",
  mlsMaxSpeed:            "maxSpeed",
};

let matched = 0;
let unmatched = 0;
let gkMatched = 0;
let gkUnmatched = 0;
const sampleUnmatched = [];

for (const p of cache.players) {
  // Skip players that didn't get any MLS data in the first place (no overlay was ever applied)
  if (p.mlsDifficultPasses === undefined && p.gkSavesMLS === undefined && p.mlsPressures === undefined) {
    continue;
  }
  const team = p.t || "";
  const name = p.n || "";
  const lastName = name.split(" ").slice(-1)[0];
  const firstWord = name.split(" ")[0];

  let sp = statsByKey[`${norm(team)}::${norm(lastName)}`]
        || statsByKey[`${norm(team)}::${norm(name)}`]
        || statsByKey[`__name__::${norm(lastName)}`];

  if (!sp) {
    unmatched++;
    if (p.p === "GK") { gkUnmatched++; if(sampleUnmatched.length<5) sampleUnmatched.push(`${name} (${team})`); }
    continue;
  }
  matched++;
  if (p.p === "GK") gkMatched++;

  for (const [target, source] of Object.entries(FIELDS)) {
    if (sp[source] !== undefined && sp[source] !== null) {
      p[target] = sp[source];
    }
  }
}

console.log(`\n  Matched:   ${matched} players (${gkMatched} GKs)`);
console.log(`  Unmatched: ${unmatched} players (${gkUnmatched} GKs)`);
if (sampleUnmatched.length) console.log(`  Sample GK misses: ${sampleUnmatched.join(", ")}`);

fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
const sizeKB = (fs.statSync(CACHE_PATH).size / 1024).toFixed(0);
console.log(`\n✓ ${CACHE_PATH} updated (${sizeKB} KB)`);
console.log("\n  Verify a GK has the new fields:");
console.log(`    node -e "const d=require('./${CACHE_PATH}');const c=d.players.find(p=>p.n==='Michael Collodi');console.log({mlsPressures:c.mlsPressures,mlsAerialsWon:c.mlsAerialsWon,mlsDifficultPassesPct:c.mlsDifficultPassesPct,mlsPassingPerformance:c.mlsPassingPerformance,mlsIntCorner:c.mlsIntCorner});"`);
