// Run with: node fetch-historical.js
// Fetches MLS data for 2024, 2025, and 2026 seasons
// Uses the same sources: ESPN + ASA + Sofascore

const fs = require("fs");
const path = require("path");

const SOFASCORE_SEASONS = {
  2026: 86668,
  2025: 70158,
  2024: 57317,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function sofaGet(path) {
  const r = await fetch(`https://api.sofascore.com/api/v1${path}`, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function fetchSeason(year) {
  console.log(`\n  ═══ Fetching ${year} Season ═══════════════════════════`);
  
  const ESPN = "https://site.api.espn.com/apis";
  const ASA = "https://app.americansocceranalysis.com/api/v1/mls";
  const MLS_TOURNAMENT = 242;
  const sofaSeasonId = SOFASCORE_SEASONS[year];
  
  const norm = s => (s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || null;
  const output = { standings: [], players: [], games: 0, season: year };
  const teamInfo = {};

  // ═══ ESPN Standings ═══
  console.log("  [ESPN] Standings...");
  try {
    const d = await get(`${ESPN}/v2/sports/soccer/usa.1/standings?season=${year}`);
    for (const conf of (d.children || [])) {
      for (const e of (conf.standings?.entries || [])) {
        const t = e.team;
        const a = norm(t.abbreviation);
        if (!a) continue;
        const s = {};
        (e.stats || []).forEach(st => { s[st.name] = st.value; });
        teamInfo[a] = {
          id: t.id,
          name: t.displayName || t.name,
          conf: String(conf.abbreviation || "").includes("East") ? "Eastern" : "Western",
          logo: t.logos?.[0]?.href || null
        };
        output.standings.push({
          team: a, name: teamInfo[a].name, conf: teamInfo[a].conf, logo: teamInfo[a].logo,
          w: Math.round(s.wins || 0), d: Math.round(s.ties || 0), l: Math.round(s.losses || 0),
          pts: Math.round(s.points || 0), gf: Math.round(s.pointsFor || 0), ga: Math.round(s.pointsAgainst || 0)
        });
      }
    }
    console.log(`          ✅ ${output.standings.length} teams`);
  } catch (e) { console.error("          ❌", e.message); }

  // Fallback teams
  if (Object.keys(teamInfo).length < 20) {
    try {
      const d = await get(`${ESPN}/site/v2/sports/soccer/usa.1/teams`);
      for (const e of (d?.sports?.[0]?.leagues?.[0]?.teams || [])) {
        const t = e?.team;
        if (!t) continue;
        const a = norm(t.abbreviation);
        if (!a || teamInfo[a]) continue;
        teamInfo[a] = { id: t.id, name: t.displayName || t.name, conf: "Unknown", logo: t.logos?.[0]?.href || null };
      }
    } catch {}
  }

  // ═══ ESPN Rosters ═══
  console.log("  [ESPN] Rosters...");
  const rosterPlayers = {};
  try {
    const ids = Object.values(teamInfo).map(t => t.id).filter(Boolean);
    for (const id of ids) {
      try {
        const d = await get(`${ESPN}/site/v2/sports/soccer/usa.1/teams/${id}/roster`);
        const abbr = norm(d.team?.abbreviation);
        if (!abbr) continue;
        for (const cat of (d.athletes || [])) {
          for (const a of (cat.items || [])) {
            const name = a.displayName || a.fullName;
            if (!name) continue;
            rosterPlayers[name] = {
              name, team: abbr,
              position: cat.position || a.position?.abbreviation || "MF",
              age: a.age || null,
              height: a.height ? Math.round(a.height * 2.54) : null,
              weight: a.weight ? Math.round(a.weight / 2.205) : null,
              headshot: a.headshot?.href || null,
            };
          }
        }
      } catch {}
      await sleep(100);
    }
    console.log(`          ✅ ${Object.keys(rosterPlayers).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ ASA Player Directory ═══
  console.log("  [ASA]  Player directory...");
  const asaNames = {};
  try {
    const d = await get(`${ASA}/players`);
    for (const p of d) { asaNames[p.player_id] = p.player_name; }
    console.log(`          ✅ ${Object.keys(asaNames).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ ASA Teams ═══
  console.log("  [ASA]  Teams...");
  const asaTeams = {};
  try {
    const d = await get(`${ASA}/teams`);
    for (const t of d) { asaTeams[t.team_id] = t.team_abbreviation; }
    console.log(`          ✅ ${Object.keys(asaTeams).length} teams`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ ASA xGoals ═══
  console.log("  [ASA]  xGoals...");
  const asaXG = {};
  try {
    const d = await get(`${ASA}/players/xgoals?season_name=${year}&stage_name=Regular+Season`);
    for (const p of d) {
      const n = asaNames[p.player_id] || p.player_id;
      asaXG[n] = { xg: p.xgoals || 0, xa: p.xassists || 0, g: p.goals || 0, shots: p.shots || 0, sot: p.shots_on_target || 0, kp: p.key_passes || 0, minutes: p.minutes_played || 0, team: asaTeams[p.team_id] || 'UNK', position: p.general_position || 'MF' };
    }
    console.log(`          ✅ ${Object.keys(asaXG).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ ASA Goals Added ═══
  console.log("  [ASA]  Goals Added...");
  const asaGA = {};
  try {
    const d = await get(`${ASA}/players/goals-added?season_name=${year}&stage_name=Regular+Season`);
    const grouped = {};
    for (const row of d) {
      const n = asaNames[row.player_id] || row.player_id;
      if (!grouped[n]) grouped[n] = {};
      grouped[n][row.action_type] = row.goals_added_above_avg || 0;
    }
    for (const [n, actions] of Object.entries(grouped)) {
      asaGA[n] = {
        gs: actions.Shooting || 0,
        gp: actions.Passing || 0,
        gdr: actions.Dribbling || 0,
        gdf: actions.Defending || 0,
        gi: actions.Interrupting || 0,
        gr: actions.Receiving || 0,
      };
    }
    console.log(`          ✅ ${Object.keys(asaGA).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ ASA xPass ═══
  console.log("  [ASA]  xPass...");
  const asaPass = {};
  try {
    const d = await get(`${ASA}/players/xpass?season_name=${year}&stage_name=Regular+Season`);
    for (const p of d) {
      const n = asaNames[p.player_id] || p.player_id;
      asaPass[n] = { pp: (p.pass_completion_percentage || 0) * 100, xpp: (p.pass_completion_percentage_expected || 0) * 100 };
    }
    console.log(`          ✅ ${Object.keys(asaPass).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ═══ Sofascore Defensive + Possession Stats ═══
  console.log("  [Sofa] Defensive stats...");
  const sofaStats = {};
  let sofaValues = {};
  
  if (sofaSeasonId) {
    const fields = "tackles,interceptions,aerialDuelsWon,successfulDribbles,accuratePasses,keyPasses,groundDuelsWon,blockedShots,totalDuelsWon,accurateFinalThirdPasses,ballRecovery,possessionWonAttThird,bigChancesCreated,totalPasses,accurateLongBalls,possessionLost,dispossessed";
    try {
      let totalSofa = 0;
      for (let pg = 1; pg <= 7; pg++) {
        const offset = (pg - 1) * 100;
        const dd = await sofaGet(`/unique-tournament/${MLS_TOURNAMENT}/season/${sofaSeasonId}/statistics?limit=100&offset=${offset}&order=-tackles&accumulation=total&fields=${fields}`);
        if (!dd.results?.length) break;
        for (const r of dd.results) {
          const name = r.player?.name;
          if (!name) continue;
          sofaStats[name] = {
            tackles: r.tackles || 0, interceptions: r.interceptions || 0,
            aerialsWon: r.aerialDuelsWon || 0, dribbles: r.successfulDribbles || 0,
            keyPasses: r.keyPasses || 0, ballRecovery: r.ballRecovery || 0,
            bigChancesCreated: r.bigChancesCreated || 0,
            finalThirdPasses: r.accurateFinalThirdPasses || 0,
          };
          totalSofa++;
        }
        if (dd.results.length < 100) break;
        await sleep(500);
      }
      console.log(`          ✅ ${totalSofa} players`);
    } catch (e) { console.error("          ❌", e.message); }

    // ═══ Sofascore Market Values ═══
    console.log("  [Sofa] Market values (takes a few minutes)...");
    try {
      const allIds = [];
      for (let pg = 1; pg <= 7; pg++) {
        const offset = (pg - 1) * 100;
        const dd = await sofaGet(`/unique-tournament/${MLS_TOURNAMENT}/season/${sofaSeasonId}/statistics?limit=100&offset=${offset}&order=-tackles&accumulation=total&fields=tackles`);
        if (!dd.results?.length) break;
        for (const r of dd.results) { if (r.player?.id) allIds.push({ id: r.player.id, name: r.player.name }); }
        if (dd.results.length < 100) break;
        await sleep(500);
      }
      console.log(`          Found ${allIds.length} player IDs`);
      let mvCount = 0;
      for (let i = 0; i < allIds.length; i++) {
        try {
          const pd = await sofaGet(`/player/${allIds[i].id}`);
          const mv = pd.player?.proposedMarketValueRaw?.value || pd.player?.proposedMarketValue || 0;
          if (mv > 0) { sofaValues[allIds[i].name] = mv; mvCount++; }
        } catch {}
        if (i % 50 === 0 && i > 0) process.stdout.write(`          ${i}/${allIds.length} (${mvCount} values)\r`);
        await sleep(300);
      }
      console.log(`          ✅ ${mvCount} market values`);
    } catch (e) { console.error("          ❌", e.message); }
  } else {
    console.log("          ⚠️ No Sofascore season ID for " + year);
  }


  // Normalize ASA team abbreviations to ESPN style
  const normTeam = (a) => {
    const map = {SJE:'SJ',NER:'NE',DCU:'DC',NYRB:'RBNY',SKC:'KC',POR:'POR',LAFC:'LAFC',LAG:'LA',
      HOU:'HOU',ATL:'ATL',CIN:'CIN',NYC:'NYC',CLT:'CLT',NSH:'NSH',ORL:'ORL',MIA:'MIA',CLB:'CLB',
      PHI:'PHI',MTL:'MTL',TOR:'TOR',VAN:'VAN',MIN:'MIN',COL:'COL',RSL:'RSL',DAL:'DAL',SEA:'SEA',
      CHI:'CHI',AUS:'ATX',STL:'STL',SD:'SD',SLC:'SLC'};
    return map[a] || a;
  };
  // ═══ Merge ═══
  console.log("  [Merge] Building player objects...");
  
  const find = (name, map) => {
    if (map[name]) return map[name];
    const last = name.split(" ").pop();
    const firstInit = name.charAt(0);
    for (const [k, v] of Object.entries(map)) {
      if (k.split(" ").pop() === last && k.charAt(0) === firstInit) return v;
    }
    return null;
  };

  const allNames = new Set([...Object.keys(rosterPlayers), ...Object.keys(asaXG)]);
  for (const name of allNames) {
    const rp = rosterPlayers[name] || { name, team: normTeam(xg.team || 'UNK'), position: (xg.position || "MF") };
    const xg = find(name, asaXG) || {};
    const ga = find(name, asaGA) || {};
    const pass = find(name, asaPass) || {};
    const sofa = find(name, sofaStats) || {};
    const mvVal = find(name, sofaValues) || 0;

    const mins = xg.minutes || 600;
    const sources = [xg.xg != null, ga.gs != null, sofa.tackles].filter(Boolean).length;
    if (sources === 0 && !rosterPlayers[name]) continue;

    output.players.push({
      n: rp.name, t: normTeam(rp.team), p: rp.position === 'FB' ? 'Defender' : rp.position === 'CB' ? 'Defender' : rp.position === 'DM' ? 'Midfielder' : rp.position === 'CM' ? 'Midfielder' : rp.position === 'AM' ? 'Midfielder' : rp.position === 'W' ? 'Forward' : rp.position === 'ST' ? 'Forward' : rp.position === 'GK' ? 'GK' : rp.position,
      a: rp.age || null, ht: rp.height || null, wt: rp.weight || null,
      m: mins, g: xg.g || 0, as: xg.xa ? Math.round(xg.xa) : 0,
      sh: xg.shots || 0, so: 0, fl: 0, yc: 0, rc: 0,
      xg: xg.xg || 0, xa: xg.xa || 0, kp: sofa.keyPasses || xg.kp || 0,
      pp: pass.pp || 0, xpp: pass.xpp || 0,
      gs: ga.gs || 0, gp: ga.gp || 0, gdr: ga.gdr || 0, gdf: ga.gdf || 0, gi: ga.gi || 0,
      totalGA: ((ga.gs||0)+(ga.gp||0)+(ga.gdr||0)+(ga.gdf||0)+(ga.gi||0)+(ga.gr||0)).toFixed(2),
      tk: sofa.tackles || 0, intc: sofa.interceptions || 0, arl: sofa.aerialsWon || 0,
      drb: sofa.dribbles || 0, prs: sofa.ballRecovery || 0,
      sca: sofa.bigChancesCreated || 0, prgp: sofa.finalThirdPasses || 0,
      prgc: sofa.dribbles || 0, ftp: sofa.finalThirdPasses || 0,
      mv: mvVal || 0,
      headshot: rp.headshot || null,
    });
  }

  // Save
  const outPath = `data/mls-cache-${year}.json`;
  if (!fs.existsSync("data")) fs.mkdirSync("data");
  fs.writeFileSync(outPath, JSON.stringify(output));
  const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  
  console.log(`  ═══════════════════════════════════════`);
  console.log(`  ✅ ${outPath} (${size} MB)`);
  console.log(`  ${output.standings.length} teams · ${output.players.length} players`);
  
  // Also copy to public for static hosting
  if (!fs.existsSync("public/data")) fs.mkdirSync("public/data", { recursive: true });
  fs.copyFileSync(outPath, `public/data/mls-cache-${year}.json`);
  console.log(`  ✅ Copied to public/data/`);
  
  return output;
}

// ═══ MAIN ═══
async function main() {
  console.log("  USA Footy Index — Historical Data Fetcher");
  console.log("  ESPN + ASA + Sofascore — ALL REAL DATA");
  console.log("  ═══════════════════════════════════════\n");
  
  const seasons = [2024, 2025];
  
  for (const year of seasons) {
    await fetchSeason(year);
    console.log("");
  }
  
  // Also refresh 2026
  console.log("  Skipping 2026 — use 'npm run fetch' for current season\n");
  
  // Copy current 2026 cache to public if it exists
  if (fs.existsSync("data/mls-cache.json")) {
    fs.copyFileSync("data/mls-cache.json", "public/data/mls-cache-2026.json");
    fs.copyFileSync("data/mls-cache.json", "public/data/mls-cache.json");
    console.log("  ✅ Copied 2026 cache to public/data/\n");
  }
  
  console.log("  ✅ All historical data fetched!");
  console.log("  Files in public/data/:");
  const files = fs.readdirSync("public/data").filter(f => f.endsWith(".json"));
  files.forEach(f => {
    const size = (fs.statSync(`public/data/${f}`).size / 1024).toFixed(0);
    console.log(`    ${f} (${size}KB)`);
  });
}

main().catch(e => console.error("Fatal:", e));
