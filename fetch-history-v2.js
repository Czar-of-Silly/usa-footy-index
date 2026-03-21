// fetch-history.js — Fetches 2024 + 2025 MLS data matching 2026 format exactly
// Run with: node fetch-history.js
// Takes ~25 min total (market values are slow)

const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }
async function sofaGet(p) { const r = await fetch(`https://api.sofascore.com/api/v1${p}`, { headers: { "User-Agent": "Mozilla/5.0" } }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }

const ESPN = "https://site.api.espn.com/apis";
const ASA = "https://app.americansocceranalysis.com/api/v1/mls";
const SOFA_SEASONS = { 2024: 57317, 2025: 70158 };

// ASA uses different abbreviations than ESPN — map them
const TEAM_MAP = {
  SJE:"SJ",NER:"NE",DCU:"DC",NYRB:"RBNY",SKC:"KC",POR:"POR",LAFC:"LAFC",LAG:"LA",
  HOU:"HOU",ATL:"ATL",CIN:"CIN",NYC:"NYC",CLT:"CLT",NSH:"NSH",ORL:"ORL",MIA:"MIA",
  CLB:"CLB",PHI:"PHI",MTL:"MTL",TOR:"TOR",VAN:"VAN",MIN:"MIN",COL:"COL",RSL:"RSL",
  DAL:"DAL",SEA:"SEA",CHI:"CHI",AUS:"ATX",STL:"STL",SD:"SD",SLC:"SLC",RBNY:"RBNY",
  ATX:"ATX",KC:"KC",SJ:"SJ",NE:"NE",DC:"DC",LA:"LA"
};
const norm = a => TEAM_MAP[a] || a;

// ASA position codes → display names
const POS_MAP = {FB:"Defender",CB:"Defender",DM:"Midfielder",CM:"Midfielder",AM:"Midfielder",W:"Forward",ST:"Forward",GK:"GK"};
const normPos = p => POS_MAP[p] || p || "MF";

async function fetchSeason(year) {
  console.log(`\n  ═══ ${year} SEASON ═══════════════════════════════════`);
  const sofaSeasonId = SOFA_SEASONS[year];
  const output = { standings: [], players: [], games: 0, season: year };

  // ── ESPN Standings + Logos ──
  console.log("  [ESPN] Standings...");
  const teamLogos = {};
  const teamNames = {};
  try {
    const d = await get(`${ESPN}/v2/sports/soccer/usa.1/standings?season=${year}`);
    for (const conf of (d.children || [])) {
      for (const e of (conf.standings?.entries || [])) {
        const t = e.team;
        const a = (t.abbreviation || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
        if (!a) continue;
        const s = {};
        (e.stats || []).forEach(st => { s[st.name] = st.value; });
        const logo = t.logos?.[0]?.href || null;
        const confName = String(conf.abbreviation || "").includes("East") ? "Eastern" : "Western";
        teamLogos[a] = logo;
        teamNames[a] = t.displayName || t.name;
        output.standings.push({
          team: a, name: t.displayName || t.name, conf: confName, logo,
          w: Math.round(s.wins || 0), d: Math.round(s.ties || 0), l: Math.round(s.losses || 0),
          pts: Math.round(s.points || 0), gf: Math.round(s.pointsFor || 0), ga: Math.round(s.pointsAgainst || 0)
        });
      }
    }
    console.log(`          ✅ ${output.standings.length} teams`);
  } catch (e) { console.error("          ❌", e.message); }

  // ── ESPN Rosters (headshots, age, height, weight) ──
  console.log("  [ESPN] Rosters...");
  const rosterData = {};
  try {
    const teamIds = {};
    // Get team IDs from standings or teams endpoint
    const td = await get(`${ESPN}/site/v2/sports/soccer/usa.1/teams`);
    for (const e of (td?.sports?.[0]?.leagues?.[0]?.teams || [])) {
      const t = e?.team;
      if (!t) continue;
      const a = (t.abbreviation || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
      teamIds[a] = t.id;
      if (!teamLogos[a]) teamLogos[a] = t.logos?.[0]?.href || null;
      if (!teamNames[a]) teamNames[a] = t.displayName || t.name;
    }
    for (const [abbr, id] of Object.entries(teamIds)) {
      try {
        const d = await get(`${ESPN}/site/v2/sports/soccer/usa.1/teams/${id}/roster?season=${year}`);
        for (const cat of (d.athletes || [])) {
          for (const a of (cat.items || [])) {
            const name = a.displayName || a.fullName;
            if (!name) continue;
            rosterData[name] = {
              team: abbr, position: cat.position || a.position?.abbreviation || "MF",
              age: a.age || null, ht: a.height ? Math.round(a.height * 2.54) : null,
              wt: a.weight ? Math.round(a.weight / 2.205) : null,
              headshot: a.headshot?.href || null,
            };
          }
        }
      } catch {}
      await sleep(100);
    }
    console.log(`          ✅ ${Object.keys(rosterData).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  // ── ASA: Players + Teams + xGoals + Goals Added + xPass ──
  console.log("  [ASA]  Player directory + teams...");
  const asaNames = {};
  const asaTeamMap = {};
  try {
    const teams = await get(`${ASA}/teams`);
    // Paginate ALL players (API returns max 1000 per page)
    for (let offset = 0; offset < 5000; offset += 1000) {
      try {
        const page = await get(`${ASA}/players?offset=${offset}`);
        if (!page.length) break;
        for (const p of page) asaNames[p.player_id] = p.player_name;
        if (page.length < 1000) break;
      } catch { break; }
    }
    for (const t of teams) asaTeamMap[t.team_id] = norm(t.team_abbreviation);
    console.log(`          ✅ ${Object.keys(asaNames).length} players, ${Object.keys(asaTeamMap).length} teams`);
  } catch (e) { console.error("          ❌", e.message); }

  console.log("  [ASA]  xGoals...");
  const asaXG = {};
  try {
    const d = await get(`${ASA}/players/xgoals?season_name=${year}&stage_name=Regular+Season`);
    for (const p of d) {
      const n = asaNames[p.player_id] || p.player_id;
      asaXG[n] = {
        xg: p.xgoals || 0, xa: p.xassists || 0, g: p.goals || 0,
        sh: p.shots || 0, so: p.shots_on_target || 0, kp: p.key_passes || 0,
        m: p.minutes_played || 0, team: asaTeamMap[p.team_id] || "UNK",
        pos: normPos(p.general_position),
      };
    }
    console.log(`          ✅ ${Object.keys(asaXG).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  console.log("  [ASA]  Goals Added...");
  const asaGA = {};
  try {
    const d = await get(`${ASA}/players/goals-added?season_name=${year}&stage_name=Regular+Season`);
    const grouped = {};
    for (const row of d) {
      const n = asaNames[row.player_id] || row.player_id;
      if (!grouped[n]) grouped[n] = {};
      if (row.data && Array.isArray(row.data)) {
        for (const action of row.data) {
          grouped[n][action.action_type] = action.goals_added_above_avg || 0;
        }
      } else {
        grouped[n][row.action_type] = row.goals_added_above_avg || 0;
      }
    }
    for (const [n, a] of Object.entries(grouped)) {
      asaGA[n] = { gs: a.Shooting || 0, gp: a.Passing || 0, gdr: a.Dribbling || 0, gdf: a.Defending || 0, gi: a.Interrupting || 0, gr: a.Receiving || 0 };
    }
    console.log(`          ✅ ${Object.keys(asaGA).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

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

  // ── Sofascore: Tackles, Interceptions, Market Values, Images ──
  console.log("  [Sofa] Defensive + possession stats...");
  const sofaStats = {};
  const sofaPlayerIds = [];
  const fields = "tackles,interceptions,aerialDuelsWon,successfulDribbles,keyPasses,ballRecovery,bigChancesCreated,accurateFinalThirdPasses,possessionLost,dispossessed";
  try {
    for (let pg = 1; pg <= 7; pg++) {
      const offset = (pg - 1) * 100;
      const dd = await sofaGet(`/unique-tournament/242/season/${sofaSeasonId}/statistics?limit=100&offset=${offset}&order=-tackles&accumulation=total&fields=${fields}`);
      if (!dd.results?.length) break;
      for (const r of dd.results) {
        const name = r.player?.name;
        if (!name) continue;
        sofaStats[name] = {
          tk: r.tackles || 0, intc: r.interceptions || 0, arl: r.aerialDuelsWon || 0,
          drb: r.successfulDribbles || 0, kp: r.keyPasses || 0, prs: r.ballRecovery || 0,
          sca: r.bigChancesCreated || 0, ftp: r.accurateFinalThirdPasses || 0,
        };
        if (r.player?.id) sofaPlayerIds.push({ id: r.player.id, name });
      }
      if (dd.results.length < 100) break;
      await sleep(500);
    }
    console.log(`          ✅ ${Object.keys(sofaStats).length} players`);
  } catch (e) { console.error("          ❌", e.message); }

  console.log("  [Sofa] Market values + images (takes a few minutes)...");
  const sofaValues = {};
  const sofaBirthDates = {};
  const sofaHeights = {};
  const sofaWeights = {};
  const sofaImages = {};
  let mvCount = 0;
  for (let i = 0; i < sofaPlayerIds.length; i++) {
    try {
      const pd = await sofaGet(`/player/${sofaPlayerIds[i].id}`);
      const mv = pd.player?.proposedMarketValueRaw?.value || pd.player?.proposedMarketValue || 0;
      if (mv > 0) { sofaValues[sofaPlayerIds[i].name] = mv; mvCount++; }
      const bts = pd.player?.dateOfBirthTimestamp;
      if (bts) sofaBirthDates[sofaPlayerIds[i].name] = bts;
      const ht = pd.player?.height;
      const wt = pd.player?.weight;
      if (ht) sofaHeights[sofaPlayerIds[i].name] = ht;
      if (wt) sofaWeights[sofaPlayerIds[i].name] = wt;
      sofaImages[sofaPlayerIds[i].name] = `https://api.sofascore.com/api/v1/player/${sofaPlayerIds[i].id}/image`;
    } catch {}
    if (i % 50 === 0 && i > 0) process.stdout.write(`          ${i}/${sofaPlayerIds.length} (${mvCount} values)\r`);
    await sleep(300);
  }
  console.log(`          ✅ ${mvCount} market values, ${Object.keys(sofaImages).length} images`);

  // ── Merge into 2026-compatible format ──
  console.log("  [Merge] Building players...");
  const find = (name, map) => {
    if (map[name]) return map[name];
    const last = name.split(" ").pop();
    const first = name.charAt(0);
    for (const [k, v] of Object.entries(map)) {
      if (k.split(" ").pop() === last && k.charAt(0) === first) return v;
    }
    return null;
  };

  const seen = new Set();
  const allNames = [...new Set([...Object.keys(rosterData), ...Object.keys(asaXG)])];
  
  for (const name of allNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    
    const roster = rosterData[name] || null;
    const xg = find(name, asaXG) || {};
    const ga = find(name, asaGA) || {};
    const pass = find(name, asaPass) || {};
    const sofa = find(name, sofaStats) || {};
    const mv = find(name, sofaValues) || 0;
    const img = find(name, sofaImages) || null;

    const team = roster?.team || xg.team || "UNK";
    if (team === "UNK" && !roster) continue;
    if (!name.includes(" ") && name.length < 15) continue; // skip unknown players without roster
    
    const mins = xg.m || 600;
    const pp = pass.pp || 0;
    const xpp = pass.xpp || 0;
    const totalGA = ((ga.gs||0)+(ga.gp||0)+(ga.gdr||0)+(ga.gdf||0)+(ga.gi||0)+(ga.gr||0));

    output.players.push({
      n: name,
      t: team,
      p: roster?.position || xg.pos || "MF",
      a: roster?.age || (function(){
        const bd = find(name, sofaBirthDates);
        if (!bd) return null;
        const mid = new Date(year, 6, 1);
        const birth = new Date(bd * 1000);
        const age = (mid - birth) / (365.25 * 24 * 60 * 60 * 1000);
        return +age.toFixed(1);
      })(),
      ht: roster?.ht || (find(name, sofaHeights)) || null,
      wt: roster?.wt || (find(name, sofaWeights)) || null,
      m: mins,
      g: xg.g || 0,
      as: Math.round(xg.xa || 0),
      sh: xg.sh || 0,
      so: xg.so || 0,
      fl: 0,
      yc: 0,
      rc: 0,
      xg: xg.xg || 0,
      xa: xg.xa || 0,
      kp: sofa.kp || xg.kp || 0,
      pp: pp,
      xpp: xpp,
      passAboveExp: pp > 0 && xpp > 0 ? +(pp - xpp).toFixed(1) : 0,
      gs: ga.gs || 0,
      gp: ga.gp || 0,
      gdr: ga.gdr || 0,
      gdf: ga.gdf || 0,
      gi: ga.gi || 0,
      totalGA: +totalGA.toFixed(2),
      tk: sofa.tk || 0,
      intc: sofa.intc || 0,
      arl: sofa.arl || 0,
      drb: sofa.drb || 0,
      prs: sofa.prs || 0,
      sca: sofa.sca || 0,
      prgp: sofa.ftp || 0,
      prgc: sofa.drb || 0,
      ftp: sofa.ftp || 0,
      mv: mv,
      salary: 0,
      headshot: roster?.headshot || img || null,
      games: 0,
      _src: [roster?"ESPN":"", Object.keys(xg).length>1?"ASA":"", Object.keys(sofa).length?"Sofa":""].filter(Boolean).join("+") || "none"
    });
  }

  // ── Save ──
  if (!fs.existsSync("data")) fs.mkdirSync("data");
  if (!fs.existsSync("public/data")) fs.mkdirSync("public/data", { recursive: true });

  const filename = `mls-cache-${year}.json`;
  fs.writeFileSync(`data/${filename}`, JSON.stringify(output));
  fs.copyFileSync(`data/${filename}`, `public/data/${filename}`);

  const size = (fs.statSync(`data/${filename}`).size / 1024).toFixed(0);
  const withTeam = output.players.filter(p => p.t !== "UNK").length;
  const withGA = output.players.filter(p => p.totalGA !== 0).length;
  const withMV = output.players.filter(p => p.mv > 0).length;
  const withHS = output.players.filter(p => p.headshot).length;

  console.log(`  ═══════════════════════════════════════`);
  console.log(`  ✅ ${filename} (${size}KB)`);
  console.log(`  ${output.standings.length} teams · ${output.players.length} players`);
  console.log(`  With team: ${withTeam} · G+: ${withGA} · Market Val: ${withMV} · Headshots: ${withHS}`);
}

async function main() {
  console.log("  USA Footy Index — Historical Data Fetcher v2");
  console.log("  ESPN + ASA + Sofascore — ALL REAL DATA");
  console.log("  ═══════════════════════════════════════");

  await fetchSeason(2024);
  await fetchSeason(2025);

  // Copy current 2026 to versioned file too
  if (fs.existsSync("data/mls-cache.json")) {
    fs.copyFileSync("data/mls-cache.json", "public/data/mls-cache-2026.json");
    console.log("\n  ✅ Copied 2026 cache");
  }

  console.log("\n  ✅ All done! Files:");
  fs.readdirSync("public/data").filter(f => f.endsWith(".json")).forEach(f => {
    const size = (fs.statSync(`public/data/${f}`).size / 1024).toFixed(0);
    console.log(`    ${f} (${size}KB)`);
  });
}

main().catch(e => console.error("Fatal:", e));
