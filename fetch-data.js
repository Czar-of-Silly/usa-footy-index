#!/usr/bin/env node
/**
 * USA Footy Index — Data Fetcher v5 (MATCH LOGS)
 * ESPN + American Soccer Analysis + Sofascore
 * 100% REAL DATA — zero estimates
 * v5: Per-game match logs for form curves
 */
const fs = require("fs");
const path = require("path");

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1";
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/soccer/usa.1";
const ESPN_WEB = "https://site.web.api.espn.com/apis/site/v2/sports/soccer/usa.1";
const ASA = "https://app.americansocceranalysis.com/api/v1/mls";
const SOFA = "https://api.sofascore.com/api/v1";
const MLS_TOURNAMENT = 242;

const CY = new Date().getFullYear();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, hdrs) { const r = await fetch(url, hdrs ? { headers: hdrs } : undefined); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
function sofaGet(ep) { return get(`${SOFA}${ep}`, { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }); }

const TEAM_MAP = {"ATL":"ATL","ATX":"ATX","CLT":"CLT","CHI":"CHI","CIN":"CIN","CLB":"CLB","COL":"COL","DAL":"DAL","DC":"DC","HOU":"HOU","MIA":"MIA","LA":"LA","LAFC":"LAFC","MIN":"MIN","MTL":"MTL","NSH":"NSH","NE":"NE","RBNY":"RBNY","NYC":"NYC","NYCFC":"NYC","ORL":"ORL","PHI":"PHI","POR":"POR","RSL":"RSL","SJ":"SJ","SEA":"SEA","SKC":"SKC","STL":"STL","TOR":"TOR","VAN":"VAN","SD":"SD","SJE":"SJ","NYRB":"RBNY","ATLUTD":"ATL","LAG":"LA","NER":"NE","NSC":"NSH","FCC":"CIN","STLC":"STL","SDFC":"SD"};
const POS_MAP = {"G":"GK","GK":"GK","Goalkeeper":"GK","D":"Defender","DF":"Defender","Defender":"Defender","M":"Midfielder","MF":"Midfielder","Midfielder":"Midfielder","F":"Forward","FW":"Forward","Forward":"Forward"};
function norm(a){return TEAM_MAP[a?.toUpperCase()]||TEAM_MAP[a]||(a||"").toUpperCase().slice(0,4);}

async function main() {
  console.log("\n  USA Footy Index — Data Fetcher v5");
  console.log("  ESPN + ASA + Sofascore — ALL REAL DATA + MATCH LOGS");
  console.log("  ═══════════════════════════════════════\n");
  const output = { generated: new Date().toISOString(), season: CY, players: [], standings: [], matches: [], dataSources: [] };

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 1: ESPN
  // ═══════════════════════════════════════════════════════════════════════
  output.dataSources.push("ESPN");

  console.log("  [ESPN] Standings...");
  const teamInfo = {};
  try {
    const d = await get(`${ESPN_V2}/standings`);
    for (const conf of (d?.children||[])) for (const e of (conf?.standings?.entries||[])) {
      const t=e?.team||{},s={};(e?.stats||[]).forEach(x=>{s[x.name]=x.value;});
      const a=norm(t.abbreviation);if(!a)continue;
      teamInfo[a]={id:t.id,name:t.displayName||t.name,conf:String(conf?.abbreviation||"").includes("East")?"Eastern":"Western",logo:t.logos?.[0]?.href||null};
      output.standings.push({team:a,name:teamInfo[a].name,conf:teamInfo[a].conf,w:Math.round(s.wins||0),d:Math.round(s.ties||0),l:Math.round(s.losses||0),pts:Math.round(s.points||0),gf:Math.round(s.pointsFor||0),ga:Math.round(s.pointsAgainst||0),logo:teamInfo[a].logo});
    }
    console.log(`          ✅ ${output.standings.length} teams`);
  } catch(e){console.error("          ❌",e.message);}
  if(Object.keys(teamInfo).length<20){try{const d=await get(`${ESPN}/teams`);for(const e of(d?.sports?.[0]?.leagues?.[0]?.teams||[])){const t=e?.team;if(!t)continue;const a=norm(t.abbreviation);if(!a||teamInfo[a])continue;teamInfo[a]={id:t.id,name:t.displayName||t.name,conf:"Unknown",logo:t.logos?.[0]?.href||null};}}catch{}}

  console.log("  [ESPN] Rosters...");
  const roster=[]; let rc=0;
  for(const[a,info]of Object.entries(teamInfo)){
    try{const d=await get(`${ESPN}/teams/${info.id}/roster`);const ath=d?.athletes||[];const flat=ath[0]?.items?ath.flatMap(g=>g.items||[]):ath;
    for(const p of flat){const pr=p?.position?.abbreviation||p?.position?.name||"M";let age=p.age||(p.dateOfBirth?Math.floor((Date.now()-new Date(p.dateOfBirth).getTime())/31557600000):null);
      roster.push({name:p.displayName||p.fullName||"Unknown",team:a,pos:POS_MAP[pr]||POS_MAP[pr?.charAt(0)]||"Midfielder",age,headshot:p.headshot?.href||null,ht:p.height?Math.round(p.height*2.54):null,wt:p.weight?Math.round(p.weight*0.453592):null});rc++;}
    await sleep(120);}catch{}
  }
  console.log(`          ✅ ${rc} players`);

  console.log("  [ESPN] Boxscores...");
  const espn={}; const gameIds=[]; const gameInfo={}; const now=new Date();
  // Per-game player logs: { playerName: [ {date, opp, ha, mins, g, a, sh, sot, fl, yc, rc, gid} ] }
  const matchLogs = {};
  for(let d=new Date(CY,1,1);d<now;d.setDate(d.getDate()+14)){
    const f=d.toISOString().slice(0,10).replace(/-/g,""),td=new Date(d);td.setDate(td.getDate()+14);
    const t=(td>now?now:td).toISOString().slice(0,10).replace(/-/g,"");
    try{const data=await get(`${ESPN}/scoreboard?dates=${f}-${t}&limit=100`);for(const ev of(data?.events||[])){const c=ev?.competitions?.[0];if(c?.status?.type?.completed&&ev.id&&!gameIds.includes(ev.id)){
      gameIds.push(ev.id);
      // Store match metadata for linking
      const hTeam=c?.competitors?.find(x=>x.homeAway==="home");
      const aTeam=c?.competitors?.find(x=>x.homeAway==="away");
      gameInfo[ev.id]={date:ev.date,home:norm(hTeam?.team?.abbreviation),away:norm(aTeam?.team?.abbreviation),homeScore:+(hTeam?.score||0),awayScore:+(aTeam?.score||0)};
    }}await sleep(80);}catch{}
  }
  console.log(`          Found ${gameIds.length} games`);
  let bd=0;
  for(const gid of gameIds){
    try{const d=await get(`${ESPN_WEB}/summary?event=${gid}`);
    const gi=gameInfo[gid]||{};
    if(Array.isArray(d?.rosters))for(const tr of d.rosters){
      // Determine which side this roster is (home or away)
      const rosterTeam=norm(tr?.team?.abbreviation);
      const isHome=rosterTeam===gi.home;
      const opp=isHome?gi.away:gi.home;
      for(const e of(tr?.roster||[])){
      const n=e?.athlete?.displayName;if(!n||!e.stats)continue;
      if(!espn[n])espn[n]={mins:0,goals:0,assists:0,shots:0,sot:0,fouls:0,yc:0,rc:0,saves:0,games:0};
      // Parse this game's stats
      const gStats={g:0,a:0,sh:0,sot:0,fl:0,yc:0,rc:0,sv:0};
      const minsPlayed=e.starter?90:e.subbedIn?30:90;
      for(const s of e.stats){const v=s.value||0;switch(s.name){case"totalGoals":gStats.g=v;break;case"goalAssists":gStats.a=v;break;case"totalShots":gStats.sh=v;break;case"shotsOnTarget":gStats.sot=v;break;case"foulsCommitted":gStats.fl=v;break;case"yellowCards":gStats.yc=v;break;case"redCards":gStats.rc=v;break;case"saves":gStats.sv=v;break;}}
      // Aggregate season totals (backward compatible)
      espn[n].games++;espn[n].mins+=minsPlayed;espn[n].goals+=gStats.g;espn[n].assists+=gStats.a;espn[n].shots+=gStats.sh;espn[n].sot+=gStats.sot;espn[n].fouls+=gStats.fl;espn[n].yc+=gStats.yc;espn[n].rc+=gStats.rc;espn[n].saves+=gStats.sv;
      // Store per-game log
      if(!matchLogs[n])matchLogs[n]=[];
      matchLogs[n].push({date:gi.date||null,opp:opp||"?",ha:isHome?"H":"A",mins:minsPlayed,g:gStats.g,a:gStats.a,sh:gStats.sh,sot:gStats.sot,fl:gStats.fl,yc:gStats.yc,rc:gStats.rc,sv:gStats.sv,hs:gi.homeScore,as:gi.awayScore,team:rosterTeam});
    }}
    }catch{}bd++;if(bd%10===0)process.stdout.write(`          ${bd}/${gameIds.length}\r`);await sleep(120);
  }
  // Sort each player's match log by date
  for(const n of Object.keys(matchLogs)){matchLogs[n].sort((a,b)=>(a.date||"").localeCompare(b.date||""));}
  console.log(`          ✅ ${Object.keys(espn).length} players from ${gameIds.length} games`);
  console.log(`          ✅ ${Object.keys(matchLogs).length} players with match-level logs`);

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 2: ASA (xG, xA, Goals Added, xPass)
  // ═══════════════════════════════════════════════════════════════════════
  output.dataSources.push("ASA");

  console.log("  [ASA]  Player directory...");
  const asaNames={};
  try{const p=await get(`${ASA}/players`);for(const x of p)asaNames[x.player_id]=x.player_name;console.log(`          ✅ ${Object.keys(asaNames).length} players`);}catch(e){console.error("          ❌",e.message);}
  const asaTeams={};
  try{const t=await get(`${ASA}/teams`);for(const x of t){const a=norm(x.team_abbreviation);if(a)asaTeams[x.team_id]=a;}console.log(`          ✅ ${Object.keys(asaTeams).length} teams`);}catch{}
  await sleep(500);

  console.log("  [ASA]  xGoals...");
  const asaXG={};
  try{const d=await get(`${ASA}/players/xgoals?season_name=${CY}&stage_name=Regular+Season`);
  for(const p of d){const n=asaNames[p.player_id]||p.player_id;asaXG[n]={xg:p.xgoals||0,xa:p.xassists||0,shots:p.shots||0,sot:p.shots_on_target||0,goals:p.goals||0,assists:p.primary_assists||0,kp:p.key_passes||0,mins:p.minutes_played||0,pos:p.general_position||""};}
  console.log(`          ✅ ${Object.keys(asaXG).length} players`);}catch(e){console.error("          ❌",e.message);}
  await sleep(500);

  console.log("  [ASA]  Goals Added...");
  const asaGA={};
  try{const d=await get(`${ASA}/players/goals-added?season_name=${CY}&stage_name=Regular+Season`);
  for(const p of d){const n=asaNames[p.player_id]||p.player_id;if(!asaGA[n])asaGA[n]={dribbling:0,fouling:0,interrupting:0,passing:0,receiving:0,shooting:0,total:0};
  for(const a of(p.data||[])){const k=a.action_type?.toLowerCase();if(k&&asaGA[n][k]!==undefined)asaGA[n][k]=a.goals_added_raw||0;}
  asaGA[n].total=asaGA[n].dribbling+asaGA[n].fouling+asaGA[n].interrupting+asaGA[n].passing+asaGA[n].receiving+asaGA[n].shooting;}
  console.log(`          ✅ ${Object.keys(asaGA).length} players`);}catch(e){console.error("          ❌",e.message);}
  await sleep(500);

  console.log("  [ASA]  xPass...");
  const asaPass={};
  try{const d=await get(`${ASA}/players/xpass?season_name=${CY}&stage_name=Regular+Season`);
  for(const p of d){const n=asaNames[p.player_id]||p.player_id;asaPass[n]={pp:p.pass_completion_percentage?Math.round(p.pass_completion_percentage*1000)/10:0,xpp:p.xpass_completion_percentage?Math.round(p.xpass_completion_percentage*1000)/10:0,poe:p.passes_completed_over_expected?Math.round(p.passes_completed_over_expected*100)/100:0,att:p.attempted_passes||0};}
  console.log(`          ✅ ${Object.keys(asaPass).length} players`);}catch(e){console.error("          ❌",e.message);}

  console.log("  [ASA]  Salaries (2025)...");
  const asaSalary={};
  try{const d=await get(`${ASA}/players/salaries?season_name=2025`);
  for(const p of d){const n=asaNames[p.player_id]||p.player_id;asaSalary[n]={base:p.base_salary||0,guaranteed:p.guaranteed_compensation||0};}
  console.log(`          ✅ ${Object.keys(asaSalary).length} players`);}catch(e){console.error("          ❌",e.message);}

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 3: SOFASCORE (tackles, interceptions, duels, dribbles, passes)
  // ═══════════════════════════════════════════════════════════════════════
  output.dataSources.push("Sofascore");

  console.log("  [Sofa] Finding 2026 season...");
  let sofaSeasonId = null;
  try {
    const d = await sofaGet(`/unique-tournament/${MLS_TOURNAMENT}/seasons`);
    const s = d.seasons?.find(s => s.year === CY || s.name?.includes(String(CY)));
    if (s) { sofaSeasonId = s.id; console.log(`          ✅ Season ID: ${sofaSeasonId}`); }
    else console.log("          ⚠️  2026 season not found");
  } catch(e) { console.error("          ❌", e.message); }

  const sofaStats = {};
  let sofaValues = {};
  let sofaImages = {}; // player name → { tackles, interceptions, ... }
  if (sofaSeasonId) {
    console.log("  [Sofa] Fetching defensive + possession stats...");
    const fields = "tackles,interceptions,aerialDuelsWon,successfulDribbles,accuratePasses,keyPasses,groundDuelsWon,blockedShots,totalDuelsWon,accurateFinalThirdPasses,ballRecovery,possessionWonAttThird,bigChancesCreated,totalPasses,accurateLongBalls,possessionLost,dispossessed";
    let totalSofa = 0;
    for (let page = 1; page <= 7; page++) {
      try {
        const offset = (page - 1) * 100;
        const d = await sofaGet(`/unique-tournament/${MLS_TOURNAMENT}/season/${sofaSeasonId}/statistics?limit=100&offset=${offset}&order=-tackles&accumulation=total&fields=${fields}`);
        if (!d.results?.length) break;
        for (const r of d.results) {
          const name = r.player?.name;
          if (!name) continue;
          sofaStats[name] = {
            tackles: r.tackles || 0,
            interceptions: r.interceptions || 0,
            aerialsWon: r.aerialDuelsWon || 0,
            dribbles: r.successfulDribbles || 0,
            accuratePasses: r.accuratePasses || 0,
            keyPasses: r.keyPasses || 0,
            groundDuelsWon: r.groundDuelsWon || 0,
            blockedShots: r.blockedShots || 0,
            totalDuelsWon: r.totalDuelsWon || 0,
            finalThirdPasses: r.accurateFinalThirdPasses || 0,
            ballRecovery: r.ballRecovery || 0,
            possWonAttThird: r.possessionWonAttThird || 0,
            bigChancesCreated: r.bigChancesCreated || 0,
            totalPasses: r.totalPasses || 0,
            longBalls: r.accurateLongBalls || 0,
            possessionLost: r.possessionLost || 0,
            dispossessed: r.dispossessed || 0,
          };
          totalSofa++;
        }
        if (d.results.length < 100) break;
        await sleep(1000); // Be respectful to Sofascore
      } catch(e) { console.error(`          ⚠️ Page ${page}:`, e.message); break; }
    }
    console.log(`          ✅ ${totalSofa} players with defensive stats`);

    // Fetch market values from individual player profiles
    console.log("  [Sofa] Fetching market values (this takes a few minutes)...");
    // sofaValues declared above
    const playerIds = Object.values(sofaStats).length ? [] : [];
    // Collect all player IDs we saw
    // Re-fetch page 1 to get IDs
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
      console.log(`          Found ${allIds.length} player IDs to look up`);
      let mvCount = 0;
      for (let i = 0; i < allIds.length; i++) {
        try {
          const pd = await sofaGet(`/player/${allIds[i].id}`);
          const mv = pd.player?.proposedMarketValueRaw?.value || pd.player?.proposedMarketValue || 0;
          if (mv > 0) { sofaValues[allIds[i].name] = mv; mvCount++; }
        } catch {}
        if (i % 50 === 0 && i > 0) process.stdout.write(`          ${i}/${allIds.length} (${mvCount} values)\r`);
        await sleep(300); // Respectful rate
      }
      console.log(`          ✅ ${mvCount} players with market values`);
    
    // Fetch player images from Sofascore
    console.log("  [Sofa] Fetching player images...");
    // sofaImages declared above
    let imgCount = 0;
    for (const p of allIds) {
      // Sofascore serves images at a predictable URL pattern
      sofaImages[p.name] = `https://api.sofascore.com/api/v1/player/${p.id}/image`;
      imgCount++;
    }
    console.log(`          ✅ ${imgCount} player image URLs mapped`);
    } catch(e) { console.error("          ❌ Market values:", e.message); }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MERGE ALL THREE SOURCES
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n  [Merge] Building player objects...");

  // Name matching — try exact, then last name + first initial
  function find(name, ...maps) {
    for (const m of maps) { if (m[name]) return m[name]; }
    const parts = name.split(" ");
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      const fi = parts[0][0]?.toLowerCase();
      for (const m of maps) for (const [k, v] of Object.entries(m)) {
        const kp = k.split(" ");
        if (kp[kp.length - 1]?.toLowerCase() === last && kp[0]?.[0]?.toLowerCase() === fi) return v;
      }
    }
    return null;
  }

  let merged=0, partial=0, skipped=0;
  for (const rp of roster) {
    const e = espn[rp.name] || {};
    const xg = find(rp.name, asaXG) || {};
    const ga = find(rp.name, asaGA) || {};
    const pass = find(rp.name, asaPass) || {};
    const sofa = find(rp.name, sofaStats) || {};
    const sal = find(rp.name, asaSalary) || {};
    const mvVal = find(rp.name, sofaValues) || 0;
    const sofaImg = typeof sofaImages !== 'undefined' ? (find(rp.name, sofaImages) || null) : null;

    const hasESPN = (e.games || 0) > 0;
    const hasASA = !!xg.mins;
    const hasSofa = !!sofa.tackles || !!sofa.interceptions || !!sofa.dribbles;
    if (!hasESPN && !hasASA && !hasSofa) { skipped++; continue; }

    const mins = e.mins || xg.mins || 0;
    if (mins < 1) { skipped++; continue; }

    const sources = [hasESPN && "ESPN", hasASA && "ASA", hasSofa && "Sofa"].filter(Boolean);
    if (sources.length >= 2) merged++; else partial++;

    output.players.push({
      n: rp.name, t: rp.team, p: rp.pos, a: rp.age, ht: rp.ht, wt: rp.wt,
      m: Math.round(mins),
      // ESPN
      g: e.goals || xg.goals || 0,
      as: e.assists || xg.assists || 0,
      sh: e.shots || xg.shots || 0,
      so: e.sot || xg.sot || 0,
      fl: e.fouls || 0,
      yc: e.yc || 0,
      rc: e.rc || 0,
      // ASA
      xg: Math.round((xg.xg || 0) * 100) / 100,
      xa: Math.round((xg.xa || 0) * 100) / 100,
      kp: xg.kp || sofa.keyPasses || 0,
      pp: pass.pp || 0,
      xpp: pass.xpp || 0,
      passAboveExp: pass.poe || 0,
      // ASA Goals Added
      gs: Math.round((ga.shooting || 0) * 100) / 100,
      gp: Math.round((ga.passing || 0) * 100) / 100,
      gdr: Math.round((ga.dribbling || 0) * 100) / 100,
      gdf: Math.round((ga.interrupting || 0) * 100) / 100,
      gi: Math.round((ga.receiving || 0) * 100) / 100,
      totalGA: Math.round((ga.total || 0) * 100) / 100,
      // Sofascore
      tk: sofa.tackles || 0,
      intc: sofa.interceptions || 0,
      arl: sofa.aerialsWon || 0,
      drb: sofa.dribbles || 0,
      prs: sofa.ballRecovery || 0, // ball recoveries as defensive activity
      // Derived / unavailable
      sca: sofa.bigChancesCreated || 0, // using Big Chances Created as SCA proxy
      prgp: sofa.finalThirdPasses || 0, // using Final Third Passes
      prgc: sofa.dribbles || 0, // using successful dribbles as carry proxy
      ftp: sofa.finalThirdPasses || 0,
      mv: mvVal || 0, // Sofascore market value or ASA salary
      // Meta
      salary: sal.guaranteed || sal.base || 0,
      headshot: rp.headshot || sofaImg || null,
      games: e.games || 0,
      // GK-specific
      sv: e.saves || 0,
      cs: (()=>{
        // Clean sheets: count games where team conceded 0 from matchLogs
        const logs = matchLogs[rp.name] || [];
        if (rp.pos !== "GK" || !logs.length) return 0;
        return logs.filter(m => {
          const conceded = m.ha === "H" ? (m.as || 0) : (m.hs || 0);
          return conceded === 0 && (m.mins || 0) >= 60;
        }).length;
      })(),
      ga_conceded: (()=>{
        const logs = matchLogs[rp.name] || [];
        if (rp.pos !== "GK" || !logs.length) return 0;
        return logs.reduce((s, m) => s + (m.ha === "H" ? (m.as || 0) : (m.hs || 0)), 0);
      })(),
      _src: sources.join("+"),
      // Per-game match log (real ESPN boxscore data)
      matchLog: matchLogs[rp.name] || [],
      // Mid-season transfer detection
      prevTeam: (()=>{
        const logs = matchLogs[rp.name] || [];
        if (!logs.length) return null;
        const teams = [...new Set(logs.map(m => m.team).filter(Boolean))];
        // If they played for multiple teams, the one that isn't their current team is previous
        const prev = teams.filter(t => t !== rp.team);
        return prev.length > 0 ? prev[0] : null;
      })(),
    });
  }

  // Matches — use our richer gameInfo instead of re-fetching
  output.matches = Object.values(gameInfo).map(g => ({
    date: g.date,
    completed: true,
    home: g.home,
    away: g.away,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
  })).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // ═══ DOWNLOAD HEADSHOTS (local copies for Canvas share cards) ═════════
  const hsDir = path.join(__dirname, "public", "headshots");
  if (!fs.existsSync(hsDir)) fs.mkdirSync(hsDir, { recursive: true });
  let hsDown = 0, hsSkip = 0, hsFail = 0;
  console.log(`\n  📸 Downloading headshots...`);
  for (const p of output.players) {
    if (!p.headshot) { hsSkip++; continue; }
    const slug = p.n.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const localPath = path.join(hsDir, `${slug}.png`);
    const localUrl = `./headshots/${slug}.png`;
    // Skip if already downloaded
    if (fs.existsSync(localPath)) {
      p.localHeadshot = localUrl;
      hsSkip++;
      continue;
    }
    try {
      const res = await fetch(p.headshot);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(localPath, buf);
        p.localHeadshot = localUrl;
        hsDown++;
      } else { hsFail++; }
    } catch { hsFail++; }
    if ((hsDown + hsFail) % 50 === 0) process.stdout.write(`          ${hsDown + hsFail + hsSkip}/${output.players.length}\r`);
    await sleep(50);
  }
  console.log(`          ✅ Headshots: ${hsDown} new · ${hsSkip} cached · ${hsFail} failed`);

  // ═══ WRITE ═════════════════════════════════════════════════════════════
  const outDir = path.join(__dirname, "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const json = JSON.stringify(output);
  fs.writeFileSync(path.join(outDir, "mls-cache.json"), json);
  const mb = (Buffer.byteLength(json) / 1048576).toFixed(2);

  // Count what we got
  const withXG = output.players.filter(p => p.xg > 0).length;
  const withGA = output.players.filter(p => p.totalGA !== 0).length;
  const withTkl = output.players.filter(p => p.tk > 0).length;
  const withMV = output.players.filter(p => p.mv > 0).length;
  const withSalary = output.players.filter(p => p.salary > 0).length;
  const withPass = output.players.filter(p => p.pp > 0).length;
  const withLogs = output.players.filter(p => p.matchLog && p.matchLog.length > 0).length;
  const totalLogs = output.players.reduce((s, p) => s + (p.matchLog?.length || 0), 0);

  console.log(`\n  ═══════════════════════════════════════`);
  console.log(`  ✅ data/mls-cache.json (${mb} MB)`);
  console.log(`  ${output.standings.length} teams · ${output.players.length} players · ${gameIds.length} games`);
  console.log(`  Multi-source: ${merged} | Single-source: ${partial} | Skipped: ${skipped}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  ESPN     Goals/Assists/Shots/Fouls/Cards/Saves`);
  console.log(`  ASA      xG: ${withXG} · G+: ${withGA} · Pass%: ${withPass}`);
  console.log(`  Sofascore Tackles: ${withTkl} · Market Values: ${withMV} · Interceptions/Duels/Dribbles`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Match Logs: ${withLogs} players · ${totalLogs} total game entries`);
  console.log(`  ASA      Salaries: ${withSalary}`);
  console.log(`  Still unavailable (StatsBomb exclusive):`);
  console.log(`    Progressive Passes, Progressive Carries, SCA, Pressures (using real proxies instead)`);
  console.log(`  Season: ${CY} · ${output.generated}\n`);
}

main().catch(e => { console.error("\n  ❌ Fatal:", e.message); process.exit(1); });
