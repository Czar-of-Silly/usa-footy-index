// detect-name-mismatches.js
// V2: Auto-detector with multi-variant matching, ESPN profile lookup, and
// clickable URL generation for stubborn cases.
//
// Usage:
//   node detect-name-mismatches.js           # generate suggestions
//   node detect-name-mismatches.js --open    # auto-open browser tabs for low-confidence
//
// Outputs:
//   - Console report with confidence-scored suggestions + clickable URLs
//   - name-aliases-suggested.json

const fs = require("fs");
const path = require("path");
const https = require("https");
const { exec } = require("child_process");

const OPEN_FLAG = process.argv.includes("--open");
const CACHE = path.join(__dirname, "public", "data", "mls-cache.json");
const ALIASES_PATH = path.join(__dirname, "name-aliases.json");
const OUT_PATH = path.join(__dirname, "name-aliases-suggested.json");

if (!fs.existsSync(CACHE)) { console.error("❌ Cache not found"); process.exit(1); }

// ─── HTTP helper ─────────────────────────────────────────────────────────
function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ─── Fetch ASA directory (paginated) ─────────────────────────────────────
async function fetchASADirectory() {
  console.log("  [ASA] Fetching player directory...");
  const all = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    try {
      const page = await getJSON(`https://app.americansocceranalysis.com/api/v1/mls/players?offset=${offset}`);
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < 1000) break;
    } catch (e) { break; }
  }
  return all;
}

// ─── Fetch ESPN player full profile (for full name) ─────────────────────
async function fetchESPNProfile(playerId) {
  if (!playerId) return null;
  try {
    const data = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/athletes/${playerId}`);
    return data?.athlete || data;
  } catch (e) { return null; }
}

// Extract ESPN ID from headshot URL
function extractEspnId(headshotUrl) {
  if (!headshotUrl) return null;
  const m = headshotUrl.match(/players\/full\/(\d+)\.png/);
  return m ? m[1] : null;
}

// ─── Name normalization ──────────────────────────────────────────────────
function normalize(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function leven(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length; if (!b.length) return a.length;
  const m = []; for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++)
    m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}

// ─── Score a single name variant against ASA candidates ─────────────────
function scoreMatch(variant, espnTeam, asaCandidates) {
  const variantNorm = normalize(variant);
  const variantTokens = variantNorm.split(" ").filter(t => t.length > 1);
  if (variantTokens.length === 0) return [];

  const scored = [];
  for (const c of asaCandidates) {
    const asaNorm = normalize(c.name);
    if (!asaNorm) continue;
    const asaTokens = asaNorm.split(" ").filter(t => t.length > 1);
    if (asaTokens.length === 0) continue;

    const overlap = variantTokens.filter(t => asaTokens.includes(t)).length;
    const substr = variantNorm.includes(asaNorm) || asaNorm.includes(variantNorm);
    if (overlap === 0 && !substr) continue;

    const total = new Set([...variantTokens, ...asaTokens]).size;
    let score = overlap / Math.max(total, 1);
    if (substr) score += 0.20;
    if (espnTeam && c.team && espnTeam === c.team) score += 0.30;
    if (variantTokens[0] === asaTokens[0]) score += 0.10;
    if (variantNorm.length < 20 && asaNorm.length < 20 && leven(variantNorm, asaNorm) <= 2) score += 0.10;

    scored.push({ name: c.name, team: c.team, score: Math.min(score, 1.0) });
  }
  return scored.sort((a, b) => b.score - a.score);
}

// ─── Generate name variants from ESPN profile ──────────────────────────
function generateVariants(espnName, profile) {
  const variants = new Set([espnName]);
  if (profile) {
    if (profile.fullName) variants.add(profile.fullName);
    if (profile.displayName) variants.add(profile.displayName);
    if (profile.firstName && profile.lastName) {
      variants.add(`${profile.firstName} ${profile.lastName}`);
      variants.add(profile.lastName);  // Brazilian-style single name
      variants.add(profile.firstName);
    }
    if (profile.shortName) variants.add(profile.shortName);
  }
  return Array.from(variants).filter(v => v && v.length > 0);
}

// ─── URL generators ─────────────────────────────────────────────────────
function asaSearchUrl(name) {
  return `https://app.americansocceranalysis.com/#!/players?name=${encodeURIComponent(name)}`;
}
function espnProfileUrl(id) {
  return id ? `https://www.espn.com/soccer/player/_/id/${id}` : null;
}
function googleAsaUrl(name) {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:americansocceranalysis.com "${name}"`)}`;
}

// Open URL in default browser (cross-platform)
function openUrl(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
            : process.platform === "darwin" ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔍 USA Footy Index — Name Mismatch Detector v2\n");

  const data = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const players = data.players;

  let existingAliases = { espnToCanonical: {} };
  if (fs.existsSync(ALIASES_PATH)) {
    try { existingAliases = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8")); } catch {}
  }
  const alreadyMapped = new Set(Object.keys(existingAliases.espnToCanonical || {}));

  const asaPlayers = await fetchASADirectory();
  const asaCandidates = asaPlayers.map(p => ({
    name: p.player_name || "",
    team: (p.team_short_names?.[0]) || (p.team_abbreviations?.[0]) || "",
  })).filter(p => p.name);
  console.log(`  [ASA] Loaded ${asaCandidates.length} player records\n`);

  const orphans = players.filter(p => {
    if (alreadyMapped.has(p.n)) return false;
    return (p.m || 0) >= 90 && ((p.g || 0) >= 1 || (p.as || 0) >= 1) &&
           (p.xg || 0) === 0 && (p.totalGA || 0) === 0 && (p.pp || 0) === 0;
  });

  console.log(`  Cache players: ${players.length}`);
  console.log(`  Already mapped: ${alreadyMapped.size}`);
  console.log(`  Orphans to investigate: ${orphans.length}\n`);

  orphans.sort((a, b) => ((b.g || 0) + (b.as || 0)) - ((a.g || 0) + (a.as || 0)));

  const suggestions = {};
  const stubborn = [];

  console.log("─".repeat(72));
  console.log("Searching with multiple name variants from ESPN profiles...\n");

  for (const p of orphans) {
    const stats = `${p.g||0}G ${p.as||0}A ${p.m||0}min`;
    const espnId = extractEspnId(p.headshot);

    // Fetch ESPN profile to get all possible name variants
    let profile = null;
    if (espnId) {
      process.stdout.write(`  Looking up ${p.n}... `);
      profile = await fetchESPNProfile(espnId);
      process.stdout.write(profile ? "✓\n" : "no profile\n");
    }

    const variants = generateVariants(p.n, profile);

    // Try matching with each variant, keep best
    let allMatches = [];
    for (const v of variants) {
      const matches = scoreMatch(v, p.t, asaCandidates);
      allMatches.push(...matches.slice(0, 3).map(m => ({ ...m, viaVariant: v })));
    }

    // Dedupe by name, keep highest score
    const seen = new Map();
    for (const m of allMatches) {
      if (!seen.has(m.name) || seen.get(m.name).score < m.score) seen.set(m.name, m);
    }
    const top = Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 3);

    if (top.length === 0) {
      console.log(`\n  ❌ ${p.n.padEnd(30)} (${p.t})  ${stats}  → NO MATCHES`);
      stubborn.push({ ...p, espnId, profile, variants, matches: [] });
      continue;
    }

    const best = top[0];
    const icon = best.score >= 0.75 ? "✅" : best.score >= 0.55 ? "⚠️ " : "❓";

    console.log(`\n  ${icon} ${p.n.padEnd(30)} (${p.t})  ${stats}`);
    if (variants.length > 1) {
      console.log(`       Tried variants: ${variants.slice(0, 4).join(", ")}${variants.length > 4 ? "..." : ""}`);
    }
    top.forEach((m, i) => {
      const arrow = i === 0 ? "    →" : "     ";
      console.log(`${arrow} ${m.name} (${m.team || "?"})  [${(m.score * 100).toFixed(0)}%]${m.viaVariant !== p.n ? `  via "${m.viaVariant}"` : ""}`);
    });

    if (best.score >= 0.75 && best.name !== p.n) {
      suggestions[p.n] = best.name;
    } else {
      stubborn.push({ ...p, espnId, profile, variants, matches: top });
    }
  }

  // ─── Output stubborn cases with clickable URLs ──────────────────────
  if (stubborn.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log("🔗 Stubborn cases — open these URLs to verify manually:\n");

    for (const p of stubborn) {
      console.log(`  ${p.n} (${p.t})  [${p.g||0}G ${p.as||0}A]`);
      if (p.profile) {
        const fullName = p.profile.fullName || p.profile.displayName || p.n;
        console.log(`    ESPN full name: ${fullName}`);
      }
      const asaUrl = asaSearchUrl(p.n);
      const espnUrl = espnProfileUrl(p.espnId);
      const googUrl = googleAsaUrl(p.n);
      console.log(`    🔍 ASA search:    ${asaUrl}`);
      if (espnUrl) console.log(`    📋 ESPN profile:  ${espnUrl}`);
      console.log(`    🌐 Google ASA:    ${googUrl}`);
      console.log("");

      if (OPEN_FLAG) {
        openUrl(asaUrl);
        if (espnUrl) openUrl(espnUrl);
        await new Promise(r => setTimeout(r, 500)); // stagger so browser doesn't choke
      }
    }
  }

  // Write suggestions file
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    _note: "Auto-generated. Review then merge into name-aliases.json.",
    _generated: new Date().toISOString(),
    espnToCanonical: { ...existingAliases.espnToCanonical, ...suggestions }
  }, null, 2));

  console.log("─".repeat(72));
  console.log(`\n📊 Summary:`);
  console.log(`   ${orphans.length} orphans investigated`);
  console.log(`   ${Object.keys(suggestions).length} auto-mapped at 75%+ confidence`);
  console.log(`   ${stubborn.length} stubborn cases (see URLs above)`);
  console.log(`\n💾 Suggestions saved to: ${OUT_PATH}`);
  if (OPEN_FLAG && stubborn.length > 0) {
    console.log(`\n🌐 Opened ${stubborn.length * 2} browser tabs for verification`);
  } else if (stubborn.length > 0) {
    console.log(`\n💡 Tip: re-run with --open to auto-launch verification URLs:`);
    console.log(`     node detect-name-mismatches.js --open\n`);
  }
}

main().catch(e => { console.error("\n❌ Error:", e.message); process.exit(1); });
