// src/app.jsx — application root (Phase 5.3 source split). Built to public/app.js by `npm run build`.
import { assistsCoverageComplete, AVAILABLE_SEASONS, bestXI, classifySeasonParam, compareClearedNotice, planSeasonChange, buildNameIndex, buildPercentiles, canDrillThrough, compareUnknownLast, CURRENT_SEASON, goalContribution, goldenBootOrder, GROUP_LABEL, GROUP_SINGULAR, impactPerGame, mvpScore, normalizeGroup, parseSeasonParam, posGroupKey, positionalRanks, POS_GROUPS, powerScore, profileSimilarity, resolveExactName, seasonLeaderboard, seasonOverview, SEASONS_OLDEST_FIRST, strongestSubgrade, sumStrict, teamGradeRanking, withSeason } from "./analytics/archive.mjs";
import { buildIdentityIndex, canCompareAcrossSeasons, coverageWarning, gradeDifference, identityKey, JOIN, resolve as resolveIdentity, samePlayerAcrossSeasons } from "./analytics/identity.mjs";/*6D*/
import { matchRating } from "./analytics/form.mjs";
import { cardMatchPreview, cardMovers, cardPowerRankings, cardTOTW, setDataGenerated } from "./cards/share-cards.jsx";
import { PlayerModal } from "./components/player-modal.jsx";
import { Badge, BottomSheet, CardButton, ColHead, Logo, MiniSpark, MiniSparkline, MobilePlayerCard, MobileSortBar, MobileStatCard, NavIcon, PlayerSearch, PosGlyph, Select, StatChip, TableWrap, TeamBadge, TopCards } from "./components/ui.jsx";
import { MLS_TEAMS } from "./data/teams.mjs";
import { computeGrades, normPos } from "./grading/engine.mjs";
import { preparePlayerForGrading, validatePlayer } from "./grading/prepare-player.mjs";
import { AskDesk } from "./pages/ask.jsx";
import { MatchupView } from "./pages/matchup.jsx";
import { MatchupsView } from "./pages/matchups.jsx";
import { MethodologyView } from "./pages/methodology.jsx";
import { FollowClubCTA, MyClubDesk, MyClubPicker, readMyClub, writeMyClub } from "./pages/my-club.jsx";
import { PATH_TABS, ROUTE_PATHS, SITE_TITLE, slugify } from "./routing/routes.mjs";
import { DARK, LIGHT, T, gb, gc, gl, vc } from "./theme.mjs";
import { TM_GAM, tmEvaluate, tmSuggestReturns } from "./trade/trade-rules.mjs";
import { useEffect, useMemo, useRef, useState } from "./ui/runtime.jsx";
import { ET, fmtET, fmtETTime, fv, hm, pickWeekAgo, sv } from "./util/format.mjs";

const DATA_URL_BASE = "./data/mls-cache";

// ─── SEASON DATA COVERAGE (Phase 6A) ──────────────────────────────────────
// Historical seasons do NOT have the same metric coverage as the current one, and the site should
// never imply they do. Verified against the committed caches, not assumed.
//   2026: ESPN + ASA + MLS Official (Opta) — full advanced coverage.
//   2024/2025: imported by fetch-history-v2.js from ASA + an archived Sofascore pull. No Opta
//   advanced metrics at all (no official xG, chances created, clearances, aerial %, pressure
//   resistance, escape rate, passing performance) and no goalkeeper metrics (saves, clean sheets,
//   goals conceded, keeper efficiency). Grades for those seasons are computed from the subset that
//   does exist, so they are directionally useful but not directly comparable to 2026 grades.
const SEASON_COVERAGE={
  2026:{sources:["ESPN","ASA","MLS Official (Opta)"],opta:true,asa:true,espn:true,gk:true,assists:"actual",
    limits:[]},
  2025:{sources:["ESPN (rosters, standings)","ASA (player analytics)","Sofascore (archived import)"],opta:false,asa:true,espn:"rosters+standings",gk:false,assists:"unavailable",
    limits:["ESPN supplied rosters, standings and player bio data, but not the per-match box scores the current season uses","No Opta advanced metrics (official xG, chances created, clearances, aerial %, pressure resistance, escape rate, passing performance)","No goalkeeper advanced metrics — keepers are graded on the limited outfield-style inputs that exist","Assists were synthesised from rounded expected assists in the original import and are withheld rather than shown as real"]},
  2024:{sources:["ESPN (rosters, standings)","ASA (player analytics)","Sofascore (archived import)"],opta:false,asa:true,espn:"rosters+standings",gk:false,assists:"unavailable",
    limits:["ESPN supplied rosters, standings and player bio data, but not the per-match box scores the current season uses","No Opta advanced metrics (official xG, chances created, clearances, aerial %, pressure resistance, escape rate, passing performance)","No goalkeeper advanced metrics — keepers are graded on the limited outfield-style inputs that exist","Assists were synthesised from rounded expected assists in the original import and are withheld rather than shown as real"]},
};
// Assists in the 2024/2025 caches are Math.round(xA) from the original importer, not real assists
// (verified: 100% of rows in both). fetch-history-v2.js now reads ASA's authoritative
// primary_assists, but the committed caches still hold the synthesised values — so until those are
// re-imported, historical assists are reported as unavailable rather than mislabelled.
// 6B: posGroupKey (the prepared-player → ranking-group map that mirrors the engine's own
// GK/FW/DF/MF split) and the rest of the archive/unknown-value semantics now live in
// analytics/archive.mjs so they can be tested as behaviour rather than as source text.
const SEASON_ASSISTS_OK={2026:true,2025:false,2024:false};
// 6D: per-row assist availability. `assistSrc` is written by the enriched caches: "asa:primary_assists"
// means the number is authoritative, "unknown" means the player could not be resolved and the value is
// genuinely absent. A row with no `assistSrc` at all is a pre-6D cache, so the season flag decides —
// which is why flipping SEASON_ASSISTS_OK is not needed and would overstate coverage anyway.
const rowAssistsKnown=(r,yr)=>{
  if(r&&typeof r.assistSrc==="string")return r.assistSrc!=="unknown"&&r.as!==null&&r.as!==undefined;
  return SEASON_ASSISTS_OK[yr]!==false;
};
const rowAssists=(r,yr)=>rowAssistsKnown(r,yr)?(r.as??null):null;
// 6C: AVAILABLE_SEASONS / CURRENT_SEASON / SEASONS_OLDEST_FIRST all come from analytics/archive.mjs
// so the selector, the router, the loaders and the career axis cannot drift apart. The season is a
// property of the committed caches — nothing here reads the wall-clock year, which used to seed it
// and would have asked for a cache that does not exist the moment the calendar rolled over.
const ALL_SEASONS=SEASONS_OLDEST_FIRST;
const GK_COVERAGE=(yr)=>!(SEASON_COVERAGE[yr]&&SEASON_COVERAGE[yr].gk===false);/*6C-GKCOV*/
// The wall clock is good for exactly one thing here: the copyright line. It must never decide which
// data season to request — that is AVAILABLE_SEASONS' job.
const COPYRIGHT_YEAR=new Date().getFullYear();/*6C-WALLCLOCK*/

// ─── MAIN ────────────────────────────────────────────────────────────────────
function MLSAnalytics(){
  const[tab,setTab]=useState("front");
  const[sel,setSel]=useState(null);
  const[players,setPlayers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[loadMsg,setLoadMsg]=useState("Initializing...");
  const[loadProgress,setLoadProgress]=useState(0);
  const[errMsg,setErrMsg]=useState(null);
  // 6C: the URL is the source of the initial season. Unknown or unsupported years fall back to
  // CURRENT_SEASON rather than requesting a cache that does not exist.
  const[season,setSeason]=useState(()=>parseSeasonParam(typeof window!=="undefined"?window.location.search:"",{available:AVAILABLE_SEASONS,fallback:CURRENT_SEASON}));/*6C-SEASONINIT*/
  const[posFilter,setPosFilter]=useState("All");
  const[teamFilter,setTeamFilter]=useState("All");
  const[sortKey,setSortKey]=useState("overall");
  const[sortDir,setSortDir]=useState("desc");
  const[confFilter,setConfFilter]=useState("All");
  const[expandTeam,setExpandTeam]=useState(null);
  const[teamLevel,setTeamLevel]=useState(0);
  const[rosterSort,setRosterSort]=useState("overall");
  const[rosterDir,setRosterDir]=useState("desc");
  const[comparePlayers,setComparePlayers]=useState([]);
  const[dark,setDark]=useState(false);
  const[standingsData,setStandingsData]=useState([]);
  const[matchesData,setMatchesData]=useState([]);
  const[articles,setArticles]=useState([]);
  const[cacheMeta,setCacheMeta]=useState(null);
  const[rankHistory,setRankHistory]=useState(null);
  const[pipeStatus,setPipeStatus]=useState(null);
  const[showGrading,setShowGrading]=useState(false);
  const[showAbout,setShowAbout]=useState(false);
  const[minMins,setMinMins]=useState(0);
  const[srPosFilter,setSrPosFilter]=useState("All");
  const[srTeamFilter,setSrTeamFilter]=useState("All");
  const[srSort,setSrSort]=useState("seasonGrade");
  const[srDir,setSrDir]=useState("desc");
  const[srView,setSrView]=useState("table");
  const[srMinMins,setSrMinMins]=useState(0);
  const[trA,setTrA]=useState("");const[trB,setTrB]=useState("");const[trOutA,setTrOutA]=useState([]);const[trOutB,setTrOutB]=useState([]);const[trSug,setTrSug]=useState(false);const[trAstA,setTrAstA]=useState({gam:0,intl:0,picks:0});const[trAstB,setTrAstB]=useState({gam:0,intl:0,picks:0});/*TMASSETS*/
  const[histData,setHistData]=useState({}); // {2024:{byId,byName,counts}, 2025:{...}, 2026:{...}}
  // A requested cross-season jump: {year,name}. Applied once that season's cache has loaded, and
  // only if the exact name resolves to exactly one player there. Never a fuzzy or team-based match.
  const drillPending=useRef(null);/*6B.1-DRILL*/
  const loadedSeason=useRef(null);           // the season the current `players` array came from
  const compareRef=useRef([]);               // latest Compare selection, readable from the loader
  const[compareNotice,setCompareNotice]=useState(null);
  const[h2hHome,setH2hHome]=useState("");
  const[h2hAway,setH2hAway]=useState("");
  const[totwWeek,setTotwWeek]=useState(0); // 0 = latest
  const[leadersView,setLeadersView]=useState("overview"); // overview, bestxi, totw, movers
  const[emailInput,setEmailInput]=useState("");
  const[emailStatus,setEmailStatus]=useState("idle"); // idle, sending, done
  const addCompare=(p)=>{setCompareNotice(null);if(comparePlayers.length<3&&!comparePlayers.find(c=>c.id===p.id))setComparePlayers(prev=>[...prev,p]);};
  const removeCompare=(id)=>setComparePlayers(prev=>prev.filter(p=>p.id!==id));

  compareRef.current=comparePlayers; // read by the season loader, which cannot see render state

  // Mobile detection
  const[isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width:768px)").matches);
  useEffect(()=>{const mq=window.matchMedia("(max-width:768px)");setIsMobile(mq.matches);const h=e=>setIsMobile(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
  // Bulletproof wire scroll: drive it in JS so it works on every browser/OS,
  // independent of CSS keyframe quirks. Pauses on hover.
  useEffect(()=>{
    const reduceMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf, x=0, paused=false, last=performance.now();
    const tick=(now)=>{
      const el=document.querySelector(".wire-inner");
      if(el){
        el.style.animation="none"; // disable CSS anim, we drive it
        const dt=Math.min(64, now-last); last=now;
        if(!paused&&!reduceMotion){ x-=dt*0.035; const half=el.scrollWidth/2; if(half>0 && -x>=half) x+=half; el.style.transform=`translateX(${x}px)`; }
      } else { last=now; }
      raf=requestAnimationFrame(tick);
    };
    const over=()=>paused=true, out=()=>paused=false;
    const track=()=>document.querySelector(".wire-track");
    const t=track(); if(t){ t.addEventListener("mouseenter",over); t.addEventListener("mouseleave",out); }
    raf=requestAnimationFrame(tick);

    // Stamp strike: JS-driven so it always fires
    const stamp=document.querySelector(".stamp-strike");
    if(stamp){
      stamp.style.opacity="0";
      stamp.style.transform="rotate(-2deg) scale(1.7)";
      stamp.style.transition="none";
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        stamp.style.transition="opacity .18s ease, transform .42s cubic-bezier(.2,1.6,.35,1)";
        stamp.style.opacity="1";
        stamp.style.transform="rotate(-7deg) scale(1)";
      }));
    }

    // Section rules draw themselves L->R via scaleX on a ::after stand-in
    const rules=[...document.querySelectorAll(".sec-rule")];
    rules.forEach((r,i)=>{
      const bar=document.createElement("span");
      bar.style.cssText="position:absolute;left:0;bottom:-3px;height:3px;width:100%;background:"+getComputedStyle(r).borderBottomColor+";transform:scaleX(0);transform-origin:left center;transition:transform .7s cubic-bezier(.65,0,.35,1)";
      r.style.borderBottomColor="transparent";
      r.appendChild(bar);
      setTimeout(()=>{bar.style.transform="scaleX(1)";}, 200+i*120);
    });

    return ()=>{ cancelAnimationFrame(raf); const tt=track(); if(tt){ tt.removeEventListener("mouseenter",over); tt.removeEventListener("mouseleave",out);} };
  },[tab,players]);

  const shortName=(name)=>{if(!name||!isMobile)return name;const parts=name.trim().split(/\s+/);if(parts.length<2)return name;return parts[0][0]+". "+parts.slice(1).join(" ");};
  // 6C: one place asks "is the reader in the archive?" — used for labelling, coverage notes and
  // for withholding current-season-only modules.
  const isArchiveSeason=season!==CURRENT_SEASON;/*6C-ISARCHIVE*/


  // Swap theme at render time — all subcomponents read from T
  Object.assign(T, dark ? DARK : LIGHT);
  useEffect(()=>{document.body.style.background=`${T.bg} url("/paper.jpg") repeat`;document.body.style.backgroundSize="360px 360px";document.body.style.color=T.text;},[dark]);
  const toggleTeam=(abbr)=>{if(expandTeam===abbr){if(teamLevel===1){setTeamLevel(2);}else{setExpandTeam(null);setTeamLevel(0);}}else{setExpandTeam(abbr);setTeamLevel(1);setRosterSort("overall");setRosterDir("desc");}};
  const toggleRosterSort=(key)=>{if(rosterSort===key){setRosterDir(d=>d==="desc"?"asc":"desc");}else{setRosterSort(key);setRosterDir(key==="age"?"asc":"desc");}};

  // ── DATA LOAD ──────────────────────────────────────────────────────────────
  useEffect(()=>{async function load(){setLoading(true);setErrMsg(null);setLoadProgress(0);
    let _logos={};
    setLoadMsg("Fetching player data...");setLoadProgress(10);
    let allRaw=[];
    try{
      const res=await fetch(season===2026?`${DATA_URL_BASE}.json`:`${DATA_URL_BASE}-${season}.json`);
      if(!res.ok)throw new Error(`Server returned ${res.status}`);
      setLoadProgress(50);
      const cache=await res.json();
      setDataGenerated(cache.generated||null);
      setCacheMeta({generated:cache.generated||null,sources:cache.dataSources||[],players:(cache.players||[]).length,season:cache.season||season});
      // 6B preflight: rank-history, pipeline-status and articles describe the CURRENT season only.
      // Under an archive season they must not be fetched or retained — otherwise 2026 ranking movement
      // and pipeline health can surface as though they belong to 2024/2025.
      if(season===CURRENT_SEASON){/*6B-AUXGATE*/
        fetch("./data/rank-history.json").then(r=>r.ok?r.json():null).then(h=>setRankHistory(Array.isArray(h)?h:null)).catch(()=>setRankHistory(null));
        fetch("./data/pipeline-status.json").then(r=>r.ok?r.json():null).then(s=>setPipeStatus(s&&typeof s==="object"?s:null)).catch(()=>setPipeStatus(null));
      }else{setRankHistory(null);setPipeStatus(null);}
      (cache.standings||[]).forEach(s=>{if(s.logo)_logos[s.team]=s.logo;});
      setStandingsData(cache.standings||[]);
      setMatchesData(cache.matches||[]);
      if(season===CURRENT_SEASON){/*6B-ARTGATE*/fetch("./data/articles.json").then(r=>r.ok?r.json():[]).then(a=>setArticles(Array.isArray(a)?a.filter(x=>x.status==="approved"):[])).catch(()=>setArticles([]));}else setArticles([]);
      allRaw=cache.players||[];
      if(!allRaw.length)throw new Error("No players in cache. Run: npm run fetch");
    }catch(e){
      setErrMsg(`Failed to load data: ${e.message}. Make sure the server is running and data has been fetched.`);
      setLoading(false);return;
    }
    setLoadMsg(`Processing ${allRaw.length} players...`);setLoadProgress(70);
    try{
      // Validate + sanitize each raw player object
      const safe=(v,min,max,def)=>{const n=Number(v);return isNaN(n)?def:Math.max(min,Math.min(max,n));};
      const srcRows=allRaw.filter(r=>r&&r.n&&r.t&&typeof r.n==="string");/*6D-SRCROWS*/
      const validated=srcRows.map(validatePlayer);
      setLoadProgress(85);
      const inter=validated.map(preparePlayerForGrading);
      const grades=computeGrades(inter.filter(p=>(p.raw.m||0)>=1)); // [GRADEFIX] exclude 0-min players from pools
      setLoadProgress(95);
      const final=inter.map((p,i)=>{const r=p.raw,g=grades[p.id]||{overall:55,attack:55,passing:55,defense:55,creativity:55,carrying:55};const tm=MLS_TEAMS.find(t=>t.abbr===r.t)||{};const pp=r.pp||0,xpp=r.xpp||0;
        return{id:p.id,name:r.n,team:r.t,teamName:tm.name||r.t,position:r.p||"MF",/*6B-ZERO*/overall:g.overall,attack:g.attack,passing:g.passing,defense:g.defense,creativity:g.creativity,carrying:g.carrying,mins:r.m||600,goals:r.g||0,assists:rowAssists(srcRows[i]||r,season),/*6D-ROWASSISTS*/ids:(srcRows[i]&&srcRows[i].ids)||null,identityJoin:(srcRows[i]&&srcRows[i].identityJoin)||null,/*Phase 6A: 2024/25 cache assists are Math.round(xA), not real assists — withheld rather than mislabelled. null renders as an em dash via sv(), the same convention already used for tackles/shots/clearances.*/xGoals:(r.xg||0).toFixed(1),xAssists:(r.xa||0).toFixed(1),xg90:p.xg90.toFixed(2),xa90:p.xa90.toFixed(2),totalGA:p.tga.toFixed(2),passGA:(r.gp||0).toFixed(2),passComp:pp.toFixed(1),xPassComp:xpp.toFixed(1),passAboveExp:pp>0&&xpp>0?(pp-xpp).toFixed(1):null,tackles:r.tk??null,tacklesWon:r.tkw||0,blocks:r.blk||0,departed:!!r.departed,tacklePct:(r.tk>=8?Math.round(100*(r.tkw||0)/r.tk):null),shots:r.sh??null,shotsOnTarget:r.so??null,fouls:r.fl??null,yellowCards:r.yc??null,redCards:r.rc??null,marketValue:r.mv||0,teamLogo:_logos[r.t]||null,age:r.a?((r.a||0)+((r.n||"A").split("").reduce((s,c)=>s+c.charCodeAt(0),0)%10)/10).toFixed(1):null,heightCm:r.ht||null,weightKg:r.wt||null,keyPasses:r.kp??null,sca:r.sca??null,prgPasses:r.prgp??null,ftPasses:r.ftp??null,pressures:r.prs??null,interceptions:r.intc??null,aerials:r.arl??null,dribbles:r.drb??null,prgCarries:r.prgc??null,headshot:r.headshot||null,matchLog:r.matchLog||[],salary:r.sal||0,saves:r.sv||0,cleanSheets:r.cs||0,goalsConceded:r.gaCon||0,officialXg:("oxg" in r)?+(r.oxg||0):null,chances:("chc" in r)?(r.chc||0):null,goalOpps:r.gop||0,aerialPct:("arlPct" in r)?(r.arlPct||0):null,aerialAtt:(r.arl||0)+(r.arlLost||0),clearances:("clr" in r)?(r.clr||0):null,pressureRes:("presR" in r)?+(r.presR||0):null,escapeRate:("esc" in r)?+(r.esc||0):null,distance:r.dist||0,topSpeed:+(r.spd||0),nutmegs:r.nut||0,foulsSuffered:r.flSuf||0,xSaves:+(r.xsv||0),keeperEff:+(r.gkEff||0),isDP:!!r.isDP,isU22:!!r.isU22,isInternational:!!r.isIntl,isHomegrown:!!r.isHG,isLoanedOut:!!r.isLoaned,rosterCategory:r.rosterCat,sportecId:r.sportecId,rated:(r.m||0)>0,prevTeam:r.prevTeam||null,localHeadshot:r.localHeadshot||null};});
      setLoadProgress(100);
      setPlayers(final);
      // 6B.1 drill-through landing: reopen the same player in the destination season, but only on a
      // unique exact-name match. Zero matches or more than one match means the jump silently lands
      // on the season with no player selected rather than opening the wrong person.
      const pend=drillPending.current;/*6B.1-DRILLLAND*/
      if(pend&&pend.year===season){
        drillPending.current=null;
        if(pend.slug){
          // 6C: a URL that names another season resolves against THAT season's slug index, built
          // here exactly the way the router builds it, so a shared archive link opens the right
          // player instead of whoever happens to sit at that slug in the season still in memory.
          const seen={};final.forEach(x=>{const k=slugify(x.name);seen[k]=(seen[k]||0)+1;});
          const bySlug={};final.forEach(x=>{const base=slugify(x.name);const sl=seen[base]>1?base+"-"+slugify(x.team):base;if(!bySlug[sl])bySlug[sl]=x;});
          setSel(bySlug[pend.slug]||null);/*6C-SLUGLAND*/
        }else{
          const hits=final.filter(x=>x.name===pend.name);
          setSel(hits.length===1?hits[0]:null);
        }
      }
      // 6C: a Compare list belongs to the season it was built in. Rather than guess an equivalent
      // player in the destination season, the list is cleared and the reason is stated.
      const prevLoaded=loadedSeason.current;loadedSeason.current=season;/*6C-COMPARESEASON*/
      if(prevLoaded!=null&&prevLoaded!==season&&compareRef.current.length){
        setComparePlayers([]);
        setCompareNotice(compareClearedNotice(prevLoaded,season));
      }
    }catch(e){setErrMsg("Processing error: "+e.message);}
    setLoading(false);}load();},[season]);

  // ── BACKGROUND: Load all seasons for historical sparklines ─────────────
  useEffect(()=>{
    async function loadHistory(){
      const years=SEASONS_OLDEST_FIRST;
      const results={};
      for(const yr of years){
        try{
          const url=yr===2026?`${DATA_URL_BASE}.json`:`${DATA_URL_BASE}-${yr}.json`;
          const res=await fetch(url);
          if(!res.ok)continue;
          const cache=await res.json();
          const raw=cache.players||[];
          if(!raw.length)continue;
          // Phase 6A: canonical path — identical to the selected-season loader above. The previous
          // hand-written historical mapper supplied only 21 of the 45 fields computeGrades reads
          // (no isGK, so every historical keeper was graded as an outfielder; no oxg90/chc90/tk90/
          // gdrV; and cumulative Goals Added instead of per-90). Season History and the season
          // selector therefore disagreed for ~99% of players. One path now, so they cannot diverge.
          const srcRows=raw.filter(r=>r&&r.n&&r.t&&typeof r.n==="string");/*6D-SRCROWS*/
          const validated=srcRows.map(validatePlayer);
          const inter=validated.map(preparePlayerForGrading);
          const grades=computeGrades(inter.filter(p=>(p.raw.m||0)>=1)); // [GRADEFIX] exclude 0-min players
          // 6B: within-season positional rank, computed once per season here rather than recomputed
          // league-wide every time a modal opens. Uses ONLY this season's players and only the
          // player's own normalised position group. Standard competition ranking (1,2,2,4) so tied
          // Overall grades share a rank instead of depending on array order.
          // 6B.1: ranks are keyed by the prepared player's id, not by name. Keying by name let two
          // players who share an exact name overwrite each other's rank.
          const rankRows=inter.filter(p=>grades[p.id]).map(p=>({key:p.id,pos:posGroupKey(p),ov:grades[p.id].overall}));/*6B-RANKS*/
          const {ranks:rankById}=positionalRanks(rankRows);
          const rows=[];
          inter.forEach((p,i)=>{const r=p.raw,g=grades[p.id];if(!g)return;
            const rk=rankById[p.id]||null;
            const src=srcRows[i]||{};/*6D-SRC*/
            rows.push({id:p.id,name:r.n,ids:src.ids||null,identityJoin:src.identityJoin||null,/*6D-IDS*/n:r.n,overall:g.overall,attack:g.attack,passing:g.passing,defense:g.defense,creativity:g.creativity,carrying:g.carrying,isGK:!!g.isGK,goals:r.g,assists:rowAssists(src,yr),mins:r.m,team:r.t,marketValue:r.mv,posRank:rk?rk.rank:null,posGroup:rk?rk.pos:null,posOf:rk?rk.of:null,prov:(r.m||0)<450,assistsKnown:rowAssistsKnown(src,yr)});
          });
          // Exact-name index that KEEPS the duplicate count, so an ambiguous name can be refused
          // instead of silently resolving to whichever row happened to be written last.
          const {counts,byName}=buildNameIndex(rows,r=>r.name);/*6B.1-NAMEIDX*/
          // 6D: a second index, on verified provider identity. resolveIdentity() prefers it and only
          // falls back to the exact-name index when a row carries no stable id — which is every row
          // until the enriched caches are accepted, so behaviour is unchanged until then.
          const idIndex=buildIdentityIndex(rows);/*6D-IDINDEX*/
          const byId={};rows.forEach(r=>{byId[r.id]=r;});
          results[yr]={byId,byName,counts,idIndex};
        }catch(e){/* skip failed season */}
      }
      setHistData(results);
    }
    loadHistory();
  },[]);

  // ── Form curve: use real matchLog data when available, fall back to simulation
  function genFormCurve(p,points=10){
    const log=p.matchLog||[];
    // REAL DATA PATH: if player has match-level data, compute per-game ratings
    if(log.length>=2){
      return log.map((m,i)=>{
        const rating=matchRating(m,p.position); // shared, position-aware
        const dt=m.date?new Date(m.date):null;
        const label=dt?`${dt.getMonth()+1}/${dt.getDate()}`:`GW${i+1}`;
        return{match:i+1,grade:rating,label,date:m.date,opp:m.opp||"?",ha:m.ha||"",g:m.g||0,a:m.a||0,mins:m.mins||0};
      });
    }
    // SIMULATED PATH: deterministic curve from season totals (legacy fallback)
    const seed=(p.name||"X").split("").reduce((s,c)=>((s*31)+c.charCodeAt(0))|0,0);
    const rng=(i)=>{let x=Math.abs((seed*13+i*997)%10000)/10000;return x;};
    const base=p.overall||55;
    const ga=parseFloat(p.totalGA)||0;
    const consistency=p.consistency||70;
    const variance=Math.max(3,(100-consistency)*0.25);
    const trendSlope=ga>2?0.8:ga>0?0.3:ga<-1?-0.6:ga<0?-0.2:0;
    const curve=[];
    for(let i=0;i<points;i++){
      const t=i/(points-1);
      const trendOffset=trendSlope*(t-0.5)*8;
      const noise=(rng(i)-0.5)*variance*2;
      const v=Math.round(Math.max(42,Math.min(99,base+trendOffset+noise)));
      curve.push({match:i+1,grade:v,label:`MW${i+1}`});
    }
    return curve;
  }

  // Derived
  const enrichedTeams=useMemo(()=>MLS_TEAMS.map(t=>{
    const tp=players.filter(p=>p.team===t.abbr&&!p.departed);const n=tp.length||1;
    const sum=(k)=>tp.reduce((s,p)=>s+(parseFloat(p[k])||0),0);
    const avg=(k)=>Math.round(sum(k)/n);const wAvg=(k)=>{let ws=0,wt=0;for(const p of tp){const w=parseFloat(p.mins)||0;if(w<=0)continue;ws+=(parseFloat(p[k])||0)*w;wt+=w;}return wt>0?Math.round(ws/wt):55;};
    // 6B.1: club assist totals use a strict sum. The generic helper coerces an unknown assist to 0,
    // which turned an archive season with no assist data at all into a published "Total Assists: 0".
    // If any squad member's assists are unknown the club total is unknown (null → em dash).
    return{...t,overall:tp.length?wAvg("overall"):55,attack:tp.length?wAvg("attack"):55,passing:tp.length?wAvg("passing"):55,defense:tp.length?wAvg("defense"):55,creativity:tp.length?wAvg("creativity"):55,carrying:tp.length?wAvg("carrying"):55,squadValue:sum("marketValue"),count:tp.length,totalGoals:sum("goals"),totalAssists:sumStrict(tp,"assists"),/*6B.1-TEAMA*/avgAge:tp.length?(sum("age")/n).toFixed(1):null,totalTackles:sum("tackles"),topScorer:tp.length?[...tp].sort((a,b)=>b.goals-a.goals)[0]:null,topRated:tp.length?[...tp].sort((a,b)=>b.overall-a.overall)[0]:null};
  }).sort((a,b)=>b.overall-a.overall),[players]);
  // 6C: clubs ranked by Team Grade inside the selected season, tied grades sharing a rank. Reads
  // the season's own enrichedTeams — no cross-season pooling.
  const teamRank=useMemo(()=>teamGradeRanking(enrichedTeams),[enrichedTeams]);/*6C-TEAMRANK*/
  const teamOpts=useMemo(()=>[["All","All Teams"],...MLS_TEAMS.map(t=>[t.abbr,t.name])],[]);
  const POS={All:null,Forward:["Forward","FW"],Midfielder:["Midfielder","MF"],Defender:["Defender","DF","DEF"],GK:["GK","Goalkeeper"]};
  const _keyMap={};
  const toggleSort=(key)=>{if(sortKey===key){setSortDir(d=>d==="desc"?"asc":"desc");}else{setSortKey(key);setSortDir(key==="age"?"asc":"desc");}};
  const filtered=useMemo(()=>{const c=POS[posFilter];const dir=sortDir==="asc"?1:-1;return[...players].filter(p=>(!c||c.includes(p.position))&&(teamFilter==="All"||p.team===teamFilter)&&(p.mins||0)>=minMins).sort((a,b)=>{if(sortKey==="team")return dir*(a.team||"").localeCompare(b.team||"");if(sortKey==="age")return dir*(parseFloat(a.age||99)-parseFloat(b.age||99));return compareUnknownLast(a[sortKey],b[sortKey],dir);/*6B.1-SORT*/}).slice(0,100);},[players,posFilter,teamFilter,sortKey,sortDir,minMins]);
  const posBuckets=useMemo(()=>{const b={};players.forEach(p=>{if(!b[p.position])b[p.position]=[];b[p.position].push(p.overall);});return Object.entries(b).filter(([,g])=>g.length>=2).map(([pos,gr])=>({pos,avg:Math.round(gr.reduce((a,b)=>a+b,0)/gr.length),count:gr.length,top:Math.max(...gr),grades:gr})).sort((a,b)=>b.avg-a.avg);},[players]);
  const teamLogos=useMemo(()=>{const m={};players.forEach(p=>{if(p.teamLogo&&!m[p.team])m[p.team]=p.teamLogo;});return m;},[players]);
  const best=filtered.length?[...filtered].sort((a,b)=>b.overall-a.overall)[0]:null;

  // Percentile ranks per player.
  // 6B.1: an unavailable metric no longer becomes a 0 percentile. buildPercentiles keeps the same
  // rank formula for valid metrics but builds each pool from known values only and returns null for
  // a player whose value the season does not carry.
  const PCT_KEYS=["overall","attack","passing","defense","creativity","carrying","goals","assists","tackles","pressures","keyPasses","sca","dribbles","prgCarries","prgPasses","interceptions","aerials"];
  const pctRanks=useMemo(()=>buildPercentiles(players,PCT_KEYS),[players]);/*6B.1-PCT*/

  // ── SIMILAR PLAYERS: find statistically closest matches ─────────────────
  const findSimilar=useMemo(()=>{
    if(!players.length||!Object.keys(pctRanks).length)return()=>[];
    // 6B.1: a metric neither player has (archive assists) is excluded from the distance and the
    // remaining dimensions are rescaled, instead of both players being scored a fake 0 percentile
    // — which made every archive player look artificially alike on that axis.
    const keys=["overall","attack","passing","defense","creativity","carrying","goals","assists","tackles","keyPasses","dribbles","pressures"];
    return(pid)=>{
      const src=pctRanks[pid];if(!src)return[];
      const srcPlayer=players.find(p=>p.id===pid);if(!srcPlayer)return[];
      return players.filter(p=>p.id!==pid&&p.position===srcPlayer.position).map(p=>{
        const pr=pctRanks[p.id];if(!pr)return null;
        const s=profileSimilarity(src,pr,keys);/*6B.1-SIM*/
        if(!s)return null;
        return{...p,similarity:s.similarity,simUsed:s.used,simOf:s.of,simMissing:s.missing};
      }).filter(Boolean).sort((a,b)=>b.similarity-a.similarity).slice(0,5);
    };
  },[players,pctRanks]);

  // ── PLAYER HISTORY: cross-season lookup ─────────────────────────────────
  // Two join rules, both exact:
  //   • the season currently loaded joins by prepared-player id. Both loaders read the same cache
  //     and run the same deterministic pipeline, so index i is the same player in both; the name is
  //     re-checked before the join is accepted, and a mismatch falls back to the name rule.
  //   • every other season joins only on an exact name that occurs exactly once there. Zero matches
  //     is a gap; more than one is ambiguous and is shown as such, never guessed.
  // ─── CROSS-SEASON COMPARE (Phase 6D §10) ─────────────────────────────────
  // Deliberately one capability and no more: the SAME player, in seasons the user picks. Two
  // different players from two different seasons is not offered, because nothing here makes that
  // safe yet — and a season-over-season grade gap is a RECORDED DIFFERENCE, never an improvement or
  // a decline, because the seasons were not measured with the same instruments.
  const crossSeasonCareer=useMemo(()=>(player,years)=>{/*6D-XSEASON*/
    if(!player||!identityKey(player))return{ok:false,refused:"no-stable-identity",rows:[],coverage:[],
      reason:"This player has no verified cross-season identity, so the Index cannot prove which row in another season is the same person."};
    const seasons={};
    for(const yr of years||ALL_SEASONS){const idx=histData[yr];if(idx)seasons[yr]=Object.values(idx.byId);}
    const res=samePlayerAcrossSeasons(player,years||ALL_SEASONS,seasons,(yr)=>({
      gk:GK_COVERAGE(yr),
      assists:SEASON_COVERAGE[yr]?SEASON_COVERAGE[yr].assists!=="unavailable":true,
      opta:SEASON_COVERAGE[yr]?!!SEASON_COVERAGE[yr].opta:true,
    }));
    return{...res,warning:coverageWarning(years||ALL_SEASONS,res.coverage)};
  },[histData]);
  const compareAcrossSeasons=useMemo(()=>(a,b)=>canCompareAcrossSeasons(a,b),[]);
  const recordedGradeDifference=gradeDifference;/*6D: never labelled improvement or decline*/

  const playerHistory=useMemo(()=>{
    if(!players.length||!Object.keys(histData).length)return{};
    const out={};
    players.forEach(p=>{
      const seasons=[];
      ALL_SEASONS.forEach(yr=>{
        const idx=histData[yr];
        if(!idx)return;
        if(yr===season){
          const byId=idx.byId[p.id];
          if(byId&&byId.name===p.name){seasons.push({year:yr,...byId,join:"id"});return;}
        }
        // 6D: prefer verified provider identity. A stable id survives a transfer and a change of
        // spelling, and it keeps two players who share a name apart — none of which a name join can
        // do. The exact-unique-name path below is kept for rows that carry no id, which is every row
        // in a pre-6D cache, so nothing about today's behaviour changes until those caches land.
        if(idx.idIndex&&identityKey(p)){/*6D-CAREERJOIN*/
          const r=resolveIdentity(p,idx.idIndex);
          if(r.join===JOIN.PROVIDER){seasons.push({year:yr,...r.row,join:"provider-id"});return;}
          if(r.join===JOIN.AMBIGUOUS){seasons.push({year:yr,ambiguous:true,joinReason:r.reason});return;}
          // A row with a stable id that the target season does not contain is simply absent from it.
          // Falling through to the name index here would find whoever shares the name — the exact
          // false join this phase exists to remove.
          return;
        }
        const status=resolveExactName(idx.counts,p.name);/*6B.1-JOIN*/
        if(status==="ambiguous"){seasons.push({year:yr,ambiguous:true});return;}
        if(status==="unique"){const m=idx.byName[p.name];if(m)seasons.push({year:yr,...m,join:"exact-name"});}
      });
      if(seasons.length>0)out[p.id]=seasons;
    });
    return out;
  },[players,histData,season]);

  // Can this player be reopened in that season? Only on a unique exact-name match there.
  const canDrillSeason=useMemo(()=>(yr,name)=>{
    const idx=histData[yr];
    return !!idx&&yr!==season&&canDrillThrough(idx.counts,name);
  },[histData,season]);
  // Switch the global season and reopen the same player there. Refuses rather than guessing.
  const drillToSeason=(yr,name)=>{
    if(yr===season||!canDrillSeason(yr,name))return;
    drillPending.current={year:yr,name};
    // 6C: push the destination URL up front — one history entry for one click. The state→URL sync
    // stands down while the drill is in flight, so Back returns to the season you came from.
    const dest=withSeason("/players/"+slugify(name),yr,{current:CURRENT_SEASON});/*6C-DRILLURL*/
    try{window.history.pushState({u:dest},"",dest);}catch(e){}
    setSel(null);
    setSeason(yr);
    try{window.scrollTo({top:0,left:0,behavior:"auto"});}catch(e){}
  };
  // Changing the season from the global selector. If a player is open and resolves uniquely in the
  // destination season, this is the same jump the career panel makes; otherwise the modal closes
  // rather than showing one season's player under another season's numbers.
  const changeSeason=(yr)=>{/*6C-SEASONSWITCH*/
    const plan=planSeasonChange({season,target:yr,available:AVAILABLE_SEASONS,playerName:sel?sel.name:null,canDrill:canDrillSeason,compareCount:comparePlayers.length});
    if(plan.kind==="ignore")return;
    if(plan.kind==="drill"){drillToSeason(plan.year,plan.name);return;}
    // 6C.1: clear Compare HERE, in the same commit as the season change, not in the destination
    // loader. Clearing late left one render where the app claimed the new season while still holding
    // the old season's selections, and the URL sync published that pairing as its own history entry
    // — a URL that, on Back, no longer looked cross-season and would have had the router resolve the
    // previous season's slugs against the new index.
    if(plan.clearCompare){setComparePlayers([]);setCompareNotice(compareClearedNotice(plan.from,plan.year));}/*6C.1-COMPARESYNC*/
    setSel(null);
    setSeason(plan.year);
  };

  // ── SEASON RATINGS ─────────────────────────────────────────────────────────
  const seasonRatings=useMemo(()=>{
    if(!players.length)return{ratings:[],byPos:{},tiers:[]};
    const eligible=players.filter(p=>(p.mins||0)>=1); // include everyone with any minutes

    // Compute season rating per player
    const allRatings=eligible.map(p=>{
      const mins=p.mins||600;
      const minsFactor=Math.min(1,mins/1800);
      const gamesPlayed=Math.round(mins/90);

      // Weighted composite: Overall 30%, Attack 15%, Passing 15%, Defense 15%, Creativity 12.5%, Carrying 12.5%
      const rawComposite=(p.overall*.30)+(p.attack*.15)+(p.passing*.15)+(p.defense*.15)+(p.creativity*.125)+(p.carrying*.125);

      // Goals Added bonus/penalty (capped ±5)
      const gaBonus=Math.max(-5,Math.min(5,(parseFloat(p.totalGA)||0)*2));

      // Minutes-adjusted boost (up to +3)
      const minsBonus=minsFactor*3;

      // G/A contribution bonus (up to +4)
      // 6B.1: assists===null means UNKNOWN (2024/25 archive), not zero — and it is not a licence to
      // invent production either. The earlier 6B patch multiplied the goals-only term by 1.5 to keep
      // the same ceiling; that manufactured an assist proxy out of nothing. The assist term is now
      // simply absent, and the resulting Season Grade is disclosed as built from reduced inputs.
      const gc_=goalContribution(p.goals,p.assists);/*6B.1-GA*/
      const gaContrib=gc_.value;

      let seasonRaw=rawComposite+gaBonus+minsBonus+gaContrib;
      const seasonGrade=Math.round(Math.max(42,Math.min(99,seasonRaw)));

      // Consistency: how uniform are sub-grades (lower stddev = more consistent)
      const subGrades=[p.attack,p.passing,p.defense,p.creativity,p.carrying];
      const subMean=subGrades.reduce((a,b)=>a+b,0)/subGrades.length;
      const stddev=Math.sqrt(subGrades.reduce((s,g)=>s+(g-subMean)**2,0)/subGrades.length);
      const consistency=Math.round(Math.max(0,Math.min(100,100-(stddev*1.5))));

      // Impact per 90.
      // 6B.1: an unavailable term is dropped AND reported, so the figure is never presented under
      // the full definition when it was not computed from the full definition.
      const impact=impactPerGame(p,gamesPlayed);/*6B.1-IMPACT*/

      // Value efficiency: season grade per $1M market value
      const valueEff=p.marketValue>0?(seasonGrade/(p.marketValue/1e6)).toFixed(1):null;

      // Player profile
      const offProfile=((p.attack||55)+(p.creativity||55))/2;
      const defProfile=((p.defense||55)+(p.carrying||55))/2;
      const profile=offProfile>defProfile+8?"Offensive":defProfile>offProfile+8?"Defensive":"Balanced";

      // Form trend
      const ga=parseFloat(p.totalGA)||0;
      const formTrend=ga>1?"up":ga<-0.5?"down":"steady";

      // Position group
      const posGroup=p.position==="Forward"||p.position==="FW"?"FW":p.position==="Midfielder"||p.position==="MF"?"MF":p.position==="Defender"||p.position==="DF"||p.position==="DEF"?"DF":(p.position==="GK"||p.position==="Goalkeeper")?"GK":"MF";

      return{
        ...p,seasonGrade,consistency,impactPer90:impact.value==null?null:impact.value.toFixed(1),
        impactReduced:impact.reduced,impactIncluded:impact.included,impactMissing:impact.missing,
        seasonGradeReduced:gc_.reduced,missingInputs:[...new Set([...(gc_.reduced?["assists"]:[]),...impact.missing])],
        valueEff,profile,formTrend,gamesPlayed,posGroup,
        gaBonus:gaBonus.toFixed(1),minsBonus:minsBonus.toFixed(1),
        gaContrib:gaContrib.toFixed(1),rawComposite:rawComposite.toFixed(1),
      };
    }).sort((a,b)=>b.seasonGrade-a.seasonGrade);

    // Position rankings
    const byPos={};allRatings.forEach(p=>{if(!byPos[p.posGroup])byPos[p.posGroup]=[];byPos[p.posGroup].push(p);});
    Object.values(byPos).forEach(arr=>arr.sort((a,b)=>b.seasonGrade-a.seasonGrade));
    allRatings.forEach(p=>{
      const posArr=byPos[p.posGroup]||[];
      p.posRank=posArr.findIndex(x=>x.id===p.id)+1;
      p.posTotal=posArr.length;
    });

    // Tier distribution
    const tiers=[
      {label:"ELITE",min:85,color:T.gold,count:allRatings.filter(p=>p.seasonGrade>=85).length},
      {label:"GREAT",min:75,color:T.green,count:allRatings.filter(p=>p.seasonGrade>=75&&p.seasonGrade<85).length},
      {label:"ABOVE AVG",min:65,color:T.blue,count:allRatings.filter(p=>p.seasonGrade>=65&&p.seasonGrade<75).length},
      {label:"AVERAGE",min:55,color:T.textDim,count:allRatings.filter(p=>p.seasonGrade>=55&&p.seasonGrade<65).length},
      {label:"POOR",min:0,color:T.red,count:allRatings.filter(p=>p.seasonGrade<55).length},
    ];

    return{ratings:allRatings,byPos,tiers};
  },[players]);

  // Season leaders
  const leaders=useMemo(()=>{if(!players.length)return[];
    const cats=[
      {k:"goals",l:"Golden Boot",unit:"",desc:"Most goals scored"},
      {k:"assists",l:"Playmaker",unit:"",desc:"Most assists"},
      {k:"overall",l:"Best Overall",unit:"",desc:"Highest overall grade"},
      {k:"officialXg",l:"xG Leader",unit:"",desc:"Highest official Opta xG"},
      {k:"keyPasses",l:"Key Passer",unit:"",desc:"Most key passes"},
      {k:"chances",l:"Chance Creator",unit:"",desc:"Most chances involved in"},
      {k:"clearances",l:"Clearances",unit:"",desc:"Most defensive clearances"},
      {k:"aerialPct",l:"Aerial King",unit:"%",desc:"Best aerial duel win % · min 15 duels",minField:"aerialAtt",minVal:15},
      {k:"distance",l:"Engine",unit:"km",desc:"Most distance covered"},
      {k:"pressures",l:"Presser",unit:"",desc:"Most pressures applied"},
      {k:"nutmegs",l:"Nutmegs",unit:"",desc:"Most nutmegs"},
      {k:"saves",l:"Shot Stopper",unit:"",desc:"Most saves · Goalkeepers only"},
      {k:"keeperEff",l:"Save Quality",unit:"",desc:"Saves above expected (xSaves) · Goalkeepers"},
    ];
    return cats.map(c=>{let pool=[...players].filter(p=>parseFloat(p[c.k])>0);if(c.minField)pool=pool.filter(p=>(parseFloat(p[c.minField])||0)>=c.minVal);const sorted=pool.sort((a,b)=>(parseFloat(b[c.k])||0)-(parseFloat(a[c.k])||0));return{...c,top:sorted.slice(0,5)};}).filter(c=>c.top.length>0);
  },[players]);

  const TABS=[{id:"front",l:"Front Page"},{id:"ask",l:"Ask USFI"},{id:"players",l:"Player Grades"},{id:"season",l:"Season Rating"},{id:"defense",l:"Defense"},{id:"passing",l:"Passing"},{id:"teams",l:"Teams"},{id:"rankings",l:"Table"},{id:"matchups",l:"Matchups"},{id:"leaders",l:"Leaders"},{id:"valuations",l:"Values"},{id:"positions",l:"Positional"},{id:"compare",l:"Compare"+(comparePlayers.length?` (${comparePlayers.length})`:"")},{id:"trade",l:"Trade Machine"}];
  const[moreOpen,setMoreOpen]=useState(false);const[searchOpen,setSearchOpen]=useState(false);
  const[matchup,setMatchup]=useState(null);
  const[myClub,setMyClubState]=useState(()=>readMyClub());
  const setMyClub=(v)=>{writeMyClub(v);setMyClubState(v);};
  const PRIMARY_IDS=["front","players","teams"];
  const NAV_LABEL={front:"Home",players:"Players",teams:"Teams",rankings:"Rankings",matchups:"Matchups",ask:"Ask USFI",season:"Season Rating",defense:"Defense",passing:"Passing",positions:"Positional",leaders:"Leaders",compare:"Compare",trade:"Trade Machine",valuations:"Values",methodology:"Methodology & data status"};
  const PRIMARY_NAV=["front","players","teams","rankings","matchups","ask"];
  const MORE_GROUPS=[["Analytics",["season","defense","passing","positions","leaders"]],["Tools",["compare","trade","valuations"]],["About",["methodology"]]];
  const[moreMenuOpen,setMoreMenuOpen]=useState(false);
  const moreMenuRef=useRef(null);
  useEffect(()=>{if(!moreMenuOpen)return;const onDoc=(e)=>{if(moreMenuRef.current&&!moreMenuRef.current.contains(e.target))setMoreMenuOpen(false);};const onKey=(e)=>{if(e.key==="Escape")setMoreMenuOpen(false);};document.addEventListener("mousedown",onDoc);document.addEventListener("keydown",onKey);return()=>{document.removeEventListener("mousedown",onDoc);document.removeEventListener("keydown",onKey);};},[moreMenuOpen]);
  const MORE_IDS=TABS.map(t=>t.id).filter(id=>!PRIMARY_IDS.includes(id)).concat(["methodology"]);
  const TAB_BLURB={ask:"Ask questions of the Index record",season:"Full-season composite ratings",defense:"Defensive grades and stats",passing:"Passing grades and stats",rankings:"Standings and Power Rankings",leaders:"Stat leaders, TOTW, Best XI",valuations:"Market values and value efficiency",positions:"Positional breakdowns",compare:"Head-to-head radar",trade:"Build and grade a trade",matchups:"Every upcoming fixture, previewed",methodology:"How the grades work, and live data status"};
  // Default sort per section — applied on first visit only; afterwards the user's own sort is remembered per section
  const TAB_SORT={teams:["overall","desc"],rankings:["pts","desc"],defense:["defense","desc"],passing:["passing","desc"],valuations:["marketValue","desc"],players:["overall","desc"],season:["overall","desc"]};
  const sortMemo=useRef({});
  const goTab=(id)=>{
    setMoreOpen(false);setSearchOpen(false);
    if(id!==tab){
      sortMemo.current[tab]=[sortKey,sortDir];
      const s=sortMemo.current[id]||TAB_SORT[id];
      if(s){setSortKey(s[0]);setSortDir(s[1]);}
      setTab(id);
    }
    try{window.scrollTo({top:0,left:0,behavior:"auto"});}catch(e){}
  };

  // 5D: keyboard access for clickable rows — one delegated handler, no per-row wiring
  useEffect(()=>{
    const onKey=(e)=>{if(e.key!=="Enter"&&e.key!==" ")return;const el=e.target;if(!(el instanceof HTMLElement))return;if(["BUTTON","A","INPUT","SELECT","TEXTAREA"].includes(el.tagName))return;if(el.classList.contains("rh")||el.getAttribute("role")==="button"||el.getAttribute("role")==="link"){e.preventDefault();el.click();}};
    document.addEventListener("keydown",onKey);document.body.setAttribute("data-kbd-rows","1");return()=>document.removeEventListener("keydown",onKey);
  },[]);
  useEffect(()=>{document.querySelectorAll(".rh:not([tabindex])").forEach(el=>{el.tabIndex=0;if(!el.getAttribute("role"))el.setAttribute("role","button");});});

  // ── ROUTER (Phase 3): the URL is derived from state; popstate/initial load push the URL into state ──
  const slugIndex=useMemo(()=>{
    const byName={};players.forEach(p=>{const k=slugify(p.name);byName[k]=(byName[k]||0)+1;});
    const toSlug={},fromSlug={};
    players.forEach(p=>{const base=slugify(p.name);const s=byName[base]>1?base+"-"+slugify(p.team):base;toSlug[p.id]=s;if(!fromSlug[s])fromSlug[s]=p;});
    return{toSlug,fromSlug};
  },[players]);
  const teamSlug=(abbr)=>{const t=MLS_TEAMS.find(x=>x.abbr===abbr);return slugify(t?t.name:abbr);};
  const teamFromSlug=(s)=>MLS_TEAMS.find(t=>slugify(t.name)===s||t.abbr.toLowerCase()===s);
  const routeReady=useRef(false);
  const applyRouteRef=useRef(null);
  applyRouteRef.current=(loc)=>{
    const path=(loc.pathname||"/").replace(/\/+$/,"")||"/";const q=new URLSearchParams(loc.search||"");
    const seg=path.split("/").filter(Boolean);
    // 6C: the season travels in the URL, so Back/Forward and a refresh restore it. A URL for a
    // different season cannot be resolved against the season currently in memory — the player
    // index belongs to the loaded cache — so the selection is deferred until that cache arrives.
    const seasonParam=classifySeasonParam(loc.search||"",{available:AVAILABLE_SEASONS,fallback:CURRENT_SEASON});/*6C-ROUTESEASON*/
    const wantSeason=seasonParam.season;
    // 6C.1: a URL that names a season we do not hold (`?season=2031`, `?season=abc`) loaded the
    // current season but left the false query sitting in the address bar, so the URL disagreed with
    // the page and sharing it passed the lie on. Rewrite it in place — replaceState, never push, so
    // Back is not polluted and there is no loop: the rewritten URL is already canonical, so a second
    // pass finds nothing to change. Everything else in the query survives untouched.
    if(seasonParam.status==="invalid"){/*6C.1-NORMALISE*/
      const here=(loc.pathname||"/")+(loc.search||"");
      const canonical=withSeason(here,wantSeason,{current:CURRENT_SEASON});
      if(canonical!==here){try{window.history.replaceState({u:canonical},"",canonical);}catch(e){}}
    }
    const crossSeason=wantSeason!==season;
    if(crossSeason)setSeason(wantSeason);
    let t="front";
    if(seg[0]==="players"&&seg[1]){t="players";const slug=decodeURIComponent(seg[1]);
      if(crossSeason){drillPending.current={year:wantSeason,slug};setSel(null);}
      else setSel(slugIndex.fromSlug[slug]||null);}
    else if(seg[0]==="teams"&&seg[1]){t="teams";const tm=teamFromSlug(decodeURIComponent(seg[1]));if(tm){setExpandTeam(tm.abbr);setTeamLevel(1);}setSel(null);}
    else if(seg[0]==="matchup"&&seg[1]){const parts=decodeURIComponent(seg[1]).split("-v-");const a=parts[0]?teamFromSlug(parts[0].toLowerCase()):null,b=parts[1]?teamFromSlug(parts[1].toLowerCase()):null;if(a&&b){t="matchup";setMatchup({home:a.abbr,away:b.abbr});}else t="front";setSel(null);}
    else{t=PATH_TABS[path]||(seg[0]?PATH_TABS["/"+seg[0]]:null)||"front";setSel(null);if(t==="teams"){setExpandTeam(null);setTeamLevel(0);}}
    if(t==="compare"){const raw=q.get("players");if(raw&&!crossSeason){const ps=raw.split(",").map(s=>slugIndex.fromSlug[s.trim()]).filter(Boolean).slice(0,3);setComparePlayers(ps);}}
    if(t!==tab){const s=sortMemo.current[t]||TAB_SORT[t];if(s){setSortKey(s[0]);setSortDir(s[1]);}setTab(t);}
    setMoreOpen(false);setSearchOpen(false);
  };
  const openMatchup=(home,away)=>{setMatchup({home,away});goTab("matchup");};
  const currentUrl=()=>{
    // 6C: one wrapper, so no route can forget the season. The current season stays implicit, which
    // keeps today's URLs byte-identical to the ones already shared.
    const base=(()=>{
      if(sel&&slugIndex.toSlug[sel.id])return "/players/"+slugIndex.toSlug[sel.id];
      if(tab==="teams"&&expandTeam)return "/teams/"+teamSlug(expandTeam);
      if(tab==="matchup"&&matchup)return "/matchup/"+matchup.home.toLowerCase()+"-v-"+matchup.away.toLowerCase();
      if(tab==="compare"&&comparePlayers.length){const ss=comparePlayers.map(p=>slugIndex.toSlug[p.id]).filter(Boolean);if(ss.length)return "/compare?players="+ss.join(",");}
      return ROUTE_PATHS[tab]||"/";
    })();
    return withSeason(base,season,{current:CURRENT_SEASON});/*6C-URLSEASON*/
  };
  const pageTitle=()=>{
    if(sel)return `${sel.name} \u2014 ${sel.position}, ${sel.teamName||sel.team}${sel.overall!=null?" \u00b7 Grade "+Math.round(sel.overall):""} | USA Footy Index`;
    if(tab==="teams"&&expandTeam){const t=MLS_TEAMS.find(x=>x.abbr===expandTeam);return `${t?t.name:expandTeam} \u2014 Team Grade & Roster | USA Footy Index`;}
    if(tab==="matchup"&&matchup){const n=(ab)=>{const t=MLS_TEAMS.find(x=>x.abbr===ab);return t?t.name:ab;};return `${n(matchup.home)} v ${n(matchup.away)} \u2014 Match Preview | USA Footy Index`;}
    if(tab==="matchups")return "MLS Matchups \u2014 Every Fixture, Previewed | USA Footy Index";
    if(tab==="methodology")return "Methodology & Data Status \u2014 How the Index Works | USA Footy Index";
    if(tab==="front")return SITE_TITLE;
    const l=(TABS.find(x=>x.id===tab)||{}).l||"";return `${l.replace(/ \(\d+\)$/,"")} \u2014 MLS | USA Footy Index`;
  };
  // initial URL → state, once the player index exists
  const syncSkip=useRef(false);
  // 6C: how the NEXT url write should happen. A URL the user did not type — the initial route, or a
  // Back/Forward — is normalised in place (a bad ?season=2031 becomes the clean current-season URL)
  // instead of pushing an entry the user never asked for and would have to press Back twice to leave.
  const navMode=useRef("replace");/*6C-NAVMODE*/
  useEffect(()=>{if(loading||!players.length||routeReady.current)return;routeReady.current=true;syncSkip.current=true;navMode.current="replace";applyRouteRef.current(window.location);},[loading,players]);
  // back / forward
  useEffect(()=>{const onPop=()=>{if(routeReady.current){navMode.current="replace";applyRouteRef.current(window.location);}};window.addEventListener("popstate",onPop);return()=>window.removeEventListener("popstate",onPop);},[]);
  // state → URL, title, canonical
  useEffect(()=>{
    if(!routeReady.current)return;
    if(syncSkip.current){syncSkip.current=false;return;} // same commit as the initial URL→state sync: state is still pre-route
    // 6C: a cross-season jump pushes its destination URL once, up front. While that load is in
    // flight the intermediate states (player cleared, cache swapping) must not write history, or a
    // single click would leave two or three entries behind and Back would stutter.
    if(drillPending.current)return;/*6C-NOCHURN*/
    const u=currentUrl();const cur=window.location.pathname+window.location.search;
    if(u!==cur){const write=navMode.current==="replace"?"replaceState":"pushState";try{window.history[write]({u},"",u);}catch(e){}}
    navMode.current="push";
    try{document.title=pageTitle();const abs=window.location.origin+u;const c=document.querySelector('link[rel="canonical"]');if(c)c.setAttribute("href",abs);const og=document.querySelector('meta[property="og:url"]');if(og)og.setAttribute("content",abs);}catch(e){}
  },[tab,sel,expandTeam,comparePlayers,slugIndex,matchup,season]);
  const tbl=isMobile?"28px 1fr 40px 42px 34px 34px 50px":"34px 1fr 48px 54px 46px 46px 56px 60px 52px 60px 48px 60px";

  return (
    <div style={{minHeight:"100vh",background:"transparent",fontFamily:T.sans,color:T.text}}>
      <style>{`
        @keyframes wireScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .wire-track:hover .wire-inner{animation-play-state:paused}
        @keyframes stampStrike{0%{opacity:0;transform:rotate(-2deg) scale(1.7);filter:blur(1.5px)}62%{opacity:1;transform:rotate(-8deg) scale(.96);filter:blur(0)}100%{opacity:1;transform:rotate(-7deg) scale(1)}}
        .stamp-strike{opacity:1;animation:stampStrike .5s cubic-bezier(.2,1.6,.35,1) .2s both}
        *{box-sizing:border-box;margin:0;padding:0}
        /* type-floor-applied */
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:none}}
        .usfi-sheet{animation:sheetUp .22s ease-out}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}.wire-inner{transform:none!important}}
        @keyframes modalIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .rh{transition:background .12s}.rh:hover{background:${T.hoverRow}!important;outline:1px solid ${T.border}}
        .rh:focus-visible{outline:2px solid ${T.accent}!important;outline-offset:-2px;background:${T.hoverRow}!important}
        a{color:${T.accent};text-decoration-color:${T.border};text-underline-offset:3px}a:hover{text-decoration-color:${T.accent}}
        button{font-family:inherit}button:not([disabled]):hover{filter:none}
        [data-kbd-rows]{}
        @media(hover:hover){button[data-nav]:not([aria-current]):hover{color:${T.ink}!important;box-shadow:inset 0 -2px 0 ${T.accent}}}
        @media(max-width:768px){button,select,[role=button],[role=link]{min-height:36px}}
        .table-inner{min-width:700px}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}
        ::selection{background:${T.gold}30}
        @media(max-width:768px){
          .resp-hide{display:none!important}
          .resp-col{flex-direction:column!important}
          .resp-grid2{grid-template-columns:1fr!important}
          .resp-grid3{grid-template-columns:1fr 1fr!important}
          .resp-grid4{grid-template-columns:1fr 1fr!important}
          .resp-h2h{grid-template-columns:1fr!important;gap:8px!important}
          .resp-pos-cards{grid-template-columns:1fr!important}
          .resp-season-strip{flex-wrap:wrap!important}
          .resp-season-strip>div{flex:none!important;width:calc(33.3% - 4px)!important}
          header .logo-wrap{padding:6px 0!important}
          .usfi-tabs{padding:0 12px!important}
          .usfi-tabs>div{justify-content:flex-start!important;gap:6px!important;padding:8px 0!important}
          .usfi-tabs button{padding:7px 14px!important;font-size:11px!important;letter-spacing:0.5px!important}
          main{padding:16px 12px calc(96px + env(safe-area-inset-bottom))!important}
          .table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
          .table-inner{min-width:auto!important}
          select{font-size:12px!important;padding:6px 24px 6px 8px!important}
          input{font-size:14px!important}
          .resp-pad{padding:16px!important}
          .resp-modal{max-width:100%!important;margin:8px!important;border-radius:8px!important}
          .resp-modal-stats{grid-template-columns:1fr 1fr!important}
          .resp-pitch{padding-bottom:95%!important}
          .resp-pitch .pitch-dot{transform:translate(-50%,-50%) scale(.85)!important}
          .resp-footer-cols{flex-direction:column!important;gap:16px!important}
        }
        @media(max-width:480px){
          .resp-grid3{grid-template-columns:1fr!important}
          .resp-grid4{grid-template-columns:1fr 1fr!important}
          .resp-h2h{grid-template-columns:1fr!important}
          .resp-season-strip>div{width:calc(50% - 4px)!important}
          .resp-pitch{padding-bottom:110%!important}
          .resp-pitch .pitch-dot{transform:translate(-50%,-50%) scale(.75)!important}
          .top-cards{flex-direction:column!important}
          .top-cards>div{min-width:100%!important}
          nav button{padding:6px 12px!important;font-size:9px!important;letter-spacing:0.3px!important}
          .resp-modal-stats{grid-template-columns:1fr!important}
        }
        nav>div::-webkit-scrollbar{display:none}
        .results-strip::-webkit-scrollbar{display:none}
      `}</style>

      {/* ═══ MASTHEAD ══════════════════════════════════════════════════════ */}
      <div style={{borderBottom:`1px solid ${T.borderLt}`,fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.14em",textTransform:"uppercase",color:T.textDim}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-between",padding:"8px 24px",gap:12,flexWrap:"wrap"}}>
          <span>Vol. II · {season} Season</span>
          {(()=>{
            const gen=cacheMeta&&cacheMeta.generated?Date.parse(cacheMeta.generated):NaN;
            const ageDays=Number.isFinite(gen)?(Date.now()-gen)/864e5:null;
            const srcOk=cacheMeta&&Array.isArray(cacheMeta.sources)&&cacheMeta.sources.length>=3;
            const graded=players&&players.length?players.filter(p=>p.rated).length||players.length:0;
            const txt=season!==CURRENT_SEASON?("Archive \u00b7 "+season+" season \u00b7 "+graded+" players graded"):Number.isFinite(gen)?("Updated "+fmtETTime(gen)+" \u00b7 "+graded+" players graded \u00b7 "+(srcOk?"Data sources healthy":"Sources: "+((cacheMeta&&cacheMeta.sources)||[]).join(", ")||"unknown")):"Loading the record\u2026";
            return <span role="link" tabIndex={0} onClick={()=>goTab("methodology")} onKeyDown={e=>{if(e.key==="Enter")goTab("methodology");}} title={cacheMeta&&cacheMeta.sources?"Sources: "+cacheMeta.sources.join(", ")+" \u2014 open data status":"Open data status"} style={{color:(ageDays!=null&&ageDays>4)||!srcOk?T.red:T.textDim,cursor:"pointer",textDecoration:"underline dotted",textUnderlineOffset:3}}>{txt}</span>;
          })()}
          <span>{new Date().toLocaleDateString("en-US",{timeZone:ET,weekday:"long",month:"long",day:"numeric"})}</span>
        </div>
      </div>
      {(()=>{
        const gen=cacheMeta&&cacheMeta.generated?Date.parse(cacheMeta.generated):NaN;
        const ageDays=Number.isFinite(gen)?(Date.now()-gen)/864e5:null;
        const srcOk=cacheMeta&&Array.isArray(cacheMeta.sources)&&cacheMeta.sources.length>=3;
        if(season!==CURRENT_SEASON)return null; // Phase 6A: staleness and pipeline health describe the CURRENT cache; they say nothing about an archive season and would read as a warning about it.
        const warn=[];
        if(ageDays!=null&&ageDays>4)warn.push("Data last refreshed "+Math.floor(ageDays)+" days ago; grades and the table may trail live results.");
        if(cacheMeta&&!srcOk)warn.push("One or more data sources were unavailable on the last run; some stats may be incomplete.");
        if(pipeStatus&&pipeStatus.steps){
          const bad=Object.entries(pipeStatus.steps).filter(([k,v])=>v&&v!=="ok").map(([k,v])=>k==="articles"&&pipeStatus.articleReasonLabel?"articles: "+pipeStatus.articleReasonLabel:k+" "+v);
          if(bad.length)warn.push("Pipeline: "+bad.join(", ")+".");
        }
        if(!warn.length)return null;
        return <div role="status" style={{background:"#F3E4DC",borderBottom:`1px solid ${T.red}`,color:T.red,fontFamily:T.mono,fontSize:12,letterSpacing:"0.06em",padding:"6px 24px",textAlign:"center"}}>{"\u26a0 "+warn.join(" ")}</div>;
      })()}
      <header style={{background:"transparent",padding:"0 24px",borderBottom:`2px solid ${T.ink}`}}>
        <div style={{maxWidth:1200,margin:"0 auto",textAlign:"center",padding:"10px 0 6px"}}>
          <div onClick={()=>goTab("front")} role="link" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")goTab("front");}} aria-label="USA Footy Index home" style={{display:"inline-block",cursor:"pointer"}}><Logo size={68} dark={dark}/></div>
          <h1 className="sr-only">USA Footy Index {"\u2014"} MLS player grades and analytics</h1>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
            <select aria-label="Season" value={season} onChange={e=>{changeSeason(Number(e.target.value));}} style={{padding:"4px 14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:0,fontSize:14,fontFamily:T.mono,fontWeight:700,color:T.ink,cursor:"pointer",appearance:"none",WebkitAppearance:"none",paddingRight:24,backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A09A90'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 8px center"}}>{AVAILABLE_SEASONS.map(y=><option key={y} value={y}>{y}</option>)}</select>
            {!loading&&<PlayerSearch players={players} onSelect={p=>setSel(p)}/>}
            <button onClick={()=>setShowGrading(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:0,padding:"4px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.accent,letterSpacing:.5,transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>How We Grade</button>
            <button onClick={()=>setShowAbout(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:0,padding:"4px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.textDim,letterSpacing:.5}}>About</button>
            <button onClick={()=>goTab("methodology")} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:0,padding:"4px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.textDim,letterSpacing:.5}}>Methodology</button>
            <MyClubPicker value={myClub} onChange={setMyClub} compact/>
            
          </div>
        </div>
      </header>

      {/* ═══ HOW WE GRADE OVERLAY ════════════════════════════════════════ */}
      {showGrading&&<div onClick={()=>setShowGrading(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,width:"100%",maxWidth:760,maxHeight:"90vh",overflowY:"auto",animation:"modalIn .3s ease",boxShadow:"0 24px 60px rgba(0,0,0,.2)",position:"relative"}}>
          <button onClick={()=>setShowGrading(false)} style={{position:"absolute",top:12,right:12,background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,color:T.ink,width:26,height:26,cursor:"pointer",fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,lineHeight:1,fontFamily:T.sans}}>×</button>
          <div style={{padding:"28px 32px 24px",borderBottom:`2px solid ${T.ink}`}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:32,color:T.ink,letterSpacing:-.5}}>How We Grade</div>
            <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,marginTop:6}}>Our composite grading system evaluates every MLS player across six categories using advanced metrics.</div>
          </div>
          <div style={{padding:"24px 32px"}}>
            <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7,marginBottom:20}}>
              Every player receives a grade from on a 0 to 99 scale in each category (in practice most graded players land between 40 and 99). Each underlying stat is first percentile-ranked against every other player in the league; those percentiles are then combined and scored against a reference point for the category to produce the final grade — the grade itself is not a raw rank or percentile. A score of 85+ still means elite production for that category relative to all MLS players.
            </div>

            <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:8}}>GRADE SCALE</div>
            <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
              {/*6B.1: the engine can produce values below 42, so the bottom tier is described as "below 55" rather than implying a 42 floor.*/}
              {[{disp:"85+",label:"ELITE",c:T.gold},{disp:"75+",label:"GREAT",c:T.green},{disp:"65+",label:"ABOVE AVG",c:T.blue},{disp:"55+",label:"AVERAGE",c:T.textDim},{disp:"Below 55",label:"POOR",c:T.red}].map(g=>(
                <div key={g.label} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:`${g.c}10`,border:`1px solid ${g.c}25`,borderRadius:0}}>
                  <span style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:g.c}}>{g.disp}</span>
                  <span style={{fontSize:11,fontWeight:600,color:g.c,letterSpacing:.8}}>{g.label}</span>
                </div>
              ))}
            </div>

            <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:12}}>SIX GRADE CATEGORIES</div>
            {[
              {name:"Overall",weight:"Position-weighted composite — FW: 30% ATT, 25% G+, 20% CRE | MF: 20% G+, 20% PAS, 20% CRE | DF: 30% DEF, 25% G+, 20% PAS",desc:"The composite score is role-aware. A defender's Overall rewards defensive excellence; a forward's rewards attacking output. Sub-grades are universal (everyone is ranked the same way on Attack, Passing, etc.) but the Overall reflects what matters for each position."},
              {name:"Attack",weight:"/*STEP5*/40% Official xG/90 + 20% ASA xG/90 + 25% Chances/90 + 15% xA/90",desc:"Goal threat and chance involvement, anchored by official Opta expected goals blended with ASA's independent model, plus chance volume and expected assists. Two xG models reduce single-model noise."},
              {name:"Passing",weight:"25% Completion % + 20% Passing vs Expected + 15% Difficult Passes/90 + 15% Pass G+ + 15% Key Passes/90 + 10% Pressure Resistance",desc:"Beyond completion rate: rewards passers who beat the expected-completion model and complete difficult, line-breaking passes — not sideways recyclers."},
              {name:"Defense",weight:"20% Defensive G+ + 15% Tackles/90 + 15% Pressures/90 + 10% Interceptions/90 + 10% Clearances/90 + 10% Aerials Won/90 + 7.5% Aerial Win % + 7.5% Tackle Success % + 5% Blocked Shots/90",desc:"Combines defensive value added (Goals Added) with active defending: tackles won and their success rate, pressures applied, interceptions, clearances, blocked shots, and aerial dominance for set pieces and crosses."},
              {name:"Creativity",weight:"40% Key Passes/90 + 25% xA/90 + 20% Chances/90 + 15% Shot-Creating Actions/90",desc:"Isolates playmaking: passes that set up shots, expected assists, and overall chance involvement. A player can rate low on Attack but high here by creating for others."},
              {name:"Carrying",weight:"43% Dribbling G+ + 25% Escape Rate + 10% Dribbles/90 + 12% Difficult Passes/90 + 10% Fouls Drawn/90",desc:"Ball progression with the feet, measured by ASA dribbling Goals Added (the value a carry adds), how often a player escapes pressure, and a touch of flair. MLS event data has no raw take-on count, so we grade carrying value rather than raw dribble attempts."},
            ].map(cat=>(
              <div key={cat.name} style={{marginBottom:16,padding:"14px 18px",background:T.surface,border:`1px solid ${T.borderLt}`,borderRadius:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink}}>{cat.name}</span>
                </div>
                <div style={{fontSize:11.5,color:T.accent,fontFamily:T.mono,fontWeight:600,marginBottom:6}}>{cat.weight}</div>
                <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.6}}>{cat.desc}</div>
              </div>
            ))}

            <div style={{marginTop:20,padding:"14px 18px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:10}}>POSITION-WEIGHTED OVERALL</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7,marginBottom:12}}>
                The six sub-grades are computed the same way for every outfield player. But the Overall grade uses different weights depending on position — so a defender isn't penalized for low Attack, and a forward isn't penalized for low Defense.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"80px repeat(6,1fr)",gap:0,fontSize:11,fontFamily:T.mono}}>
                <div style={{padding:"6px 8px",fontWeight:700,color:T.textMute,borderBottom:`1px solid ${T.border}`}}></div>
                {["ATT","PAS","DEF","CRE","CAR","G+"].map(h=><div key={h} style={{padding:"6px 4px",fontWeight:700,color:T.textMute,textAlign:"center",borderBottom:`1px solid ${T.border}`,fontSize:10,letterSpacing:.5}}>{h}</div>)}
                {[
                  {pos:"Forward",w:[30,10,5,20,10,25],c:T.accent},
                  {pos:"Midfielder",w:[15,20,15,20,10,20],c:T.blue},
                  {pos:"Defender",w:[5,20,30,10,10,25],c:T.green},
                ].map(r=><React.Fragment key={r.pos}>
                  <div style={{padding:"6px 8px",fontWeight:700,color:r.c,borderBottom:`1px solid ${T.borderLt}`}}>{r.pos}</div>
                  {r.w.map((w,i)=><div key={i} style={{padding:"6px 4px",textAlign:"center",color:w>=20?T.ink:T.textDim,fontWeight:w>=25?700:500,borderBottom:`1px solid ${T.borderLt}`,background:w>=25?`${r.c}08`:"transparent"}}>{w}%</div>)}
                </React.Fragment>)}
              </div>
            </div>

            <div style={{marginTop:20,padding:"14px 18px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:8}}>GOALKEEPER GRADING</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7,marginBottom:10}}>
                Goalkeepers are graded on a completely separate system, compared only to other GKs, now powered by official MLS save-quality data (expected saves). The categories are remapped to GK-specific skills:
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {name:"Shot-Stopping",desc:"Saves Above Expected (50%) + Saves/90 (30%) + Clean Sheet Rate (20%)"},
                  {name:"Distribution",desc:"Passing vs Expected (50%) + Pass Completion (25%) + Difficult Pass % (25%)"},
                  {name:"Command",desc:"Claims & Catches/90 (50%) + Aerial Win % (30%) + GA/90 inverted (20%)"},
                  {name:"Sweeping",desc:"Sweeping Actions/90 (70%) + GA/90 inverted (30%)"},
                  {name:"Handling",desc:"Saves/90 (60%) + Clean Sheet Rate (40%)"},
                  {name:"GK Overall",desc:"Shot-Stop 35% + Command 25% + Distribution 20% + Sweep 10% + Handling 10%"},
                ].map(cat=>(
                  <div key={cat.name} style={{padding:"8px 12px",background:T.bg,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:12,color:T.ink}}>{cat.name}</div>
                    <div style={{fontSize:11,color:T.accent,fontFamily:T.mono,fontWeight:600,marginTop:2}}>{cat.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginTop:20,padding:"14px 18px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:8}}>DATA SOURCES</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7}}>
                Player data sourced from ESPN (boxscores, rosters, standings), American Soccer Analysis (xG, xA, Goals Added, dribbling, xPass, salaries), and the official MLS statistics feed (Opta — chances, key passes, aerials, clearances, pressures, distance, and goalkeeping: saves, clean sheets, expected saves). All grades computed from real, verifiable data.
              </div>
            </div>
          </div>
          <div style={{padding:"14px 32px",borderTop:`1px solid ${T.border}`,textAlign:"right"}}>
            <button onClick={()=>setShowGrading(false)} style={{background:T.ink,border:"none",color:T.bg,padding:"8px 22px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12}}>Got It</button>
          </div>
        </div>
      </div>}

      {/* ═══ ABOUT OVERLAY ═══════════════════════════════════════════════ */}
      {showAbout&&<div onClick={()=>setShowAbout(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
        <div onClick={e=>e.stopPropagation()} className="resp-modal" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,width:"100%",maxWidth:680,maxHeight:"90vh",overflowY:"auto",animation:"modalIn .3s ease",boxShadow:"0 24px 60px rgba(0,0,0,.2)",position:"relative"}}>
          <button onClick={()=>setShowAbout(false)} style={{position:"absolute",top:12,right:12,background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,color:T.ink,width:26,height:26,cursor:"pointer",fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,lineHeight:1,fontFamily:T.sans}}>×</button>
          <div style={{padding:"28px 32px 20px",borderBottom:`2px solid ${T.ink}`,display:"flex",alignItems:"center",gap:16}}>
            <Logo size={48} dark={dark}/>
            <div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:24,color:T.ink,letterSpacing:-.5}}>About USA Footy Index</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,marginTop:4}}>Advanced player analytics for Major League Soccer</div>
            </div>
          </div>
          <div style={{padding:"24px 32px"}}>
            <div style={{fontSize:12,color:T.text,fontFamily:T.sans,lineHeight:1.8,marginBottom:20}}>
              USA Footy Index is an independent analytics platform that brings composite grading to MLS. We believe every fan deserves access to the kind of advanced player evaluation that has been standard in the NFL, NBA, and European football for years — but has been largely missing from the American soccer landscape.
            </div>

            <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:10}}>WHAT MAKES US DIFFERENT</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
              {[
                {title:"Composite Grades",desc:"Six-category grading system on a 0-99 scale (most graded players land between 40 and 99) that distills complex stats into a single, comparable score per player."},
                {title:"Full Transparency",desc:"Every grade weight is published. No black boxes — you can see exactly why a player scored what they did."},
                {title:"Per-90 Normalization",desc:"Stats are adjusted per 90 minutes played, so a 2,000-minute starter and a 600-minute rotation player can be fairly compared."},
                {title:"Percentile Context",desc:"Raw numbers mean nothing without context. We show where every stat ranks against the entire league."},
              ].map(f=>(
                <div key={f.title} style={{padding:"14px 16px",background:T.surface,border:`1px solid ${T.borderLt}`,borderRadius:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    
                    <span style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink}}>{f.title}</span>
                  </div>
                  <div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,lineHeight:1.6}}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:10}}>DATA SOURCES</div>
            <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7,marginBottom:16}}>
              Every grade is powered by real match data from three independent sources: ESPN (goals, assists, shots, fouls, cards, match logs), American Soccer Analysis (xG, xA, Goals Added, xPass, salaries, dribbling), and the official MLS (Opta) statistics feed (chances, key passes, aerials, clearances, pressures, goalkeeping). Data refreshes on match days.
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
              {[
                {v:(players.length?Math.floor(players.length/10)*10+"+":"700+"),l:"Players Graded"},
                {v:"30",l:"MLS Clubs"},
                {v:"3",l:"Data Sources"},
              ].map(s=>(
                <div key={s.l} style={{textAlign:"center",padding:"12px 8px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:24,color:T.ink,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.8,marginTop:4,fontFamily:T.sans,textTransform:"uppercase"}}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{padding:"14px 18px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:6}}>CREATED BY</div>
              <div style={{fontSize:12,color:T.text,fontFamily:T.sans,lineHeight:1.7}}>
                Just a silly little guy who is a soccer analytics enthusiast. USA Footy Index is an independent project not affiliated with Major League Soccer, its clubs, or any data provider.
              </div>
            </div>
          </div>
          <div style={{padding:"14px 32px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>© {COPYRIGHT_YEAR} USA Footy Index</div>
            <button onClick={()=>setShowAbout(false)} style={{background:T.ink,border:"none",color:T.bg,padding:"8px 22px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12}}>Close</button>
          </div>
        </div>
      </div>}

      {/* ═══ STICKY NAV ══════════════════════════════════════════════════ */}
      {!isMobile&&<nav className="usfi-tabs" aria-label="Sections" style={{position:"sticky",top:0,zIndex:100,background:T.surface,borderBottom:`2px solid ${T.ink}`,padding:"0 24px",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:isMobile?"flex-start":"center",gap:4,flexWrap:isMobile?"nowrap":"wrap",overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none",padding:"6px 0"}}>
          {PRIMARY_NAV.map(id=><button key={id} data-nav="1" aria-current={tab===id?"page":undefined} onClick={()=>goTab(id)} style={{flexShrink:0,background:tab===id?T.ink:"transparent",border:"none",color:tab===id?T.bg:T.textDim,padding:"9px 18px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12.5,letterSpacing:.8,textTransform:"uppercase",borderRadius:0}}>{NAV_LABEL[id]}</button>)}
          <div ref={moreMenuRef} style={{position:"relative",flexShrink:0}}>
            <button data-nav="1" aria-haspopup="menu" aria-expanded={moreMenuOpen} aria-label="More sections" aria-current={MORE_GROUPS.some(g=>g[1].includes(tab))?"page":undefined} onClick={()=>setMoreMenuOpen(v=>!v)} style={{background:MORE_GROUPS.some(g=>g[1].includes(tab))&&!moreMenuOpen?T.ink:"transparent",border:"none",color:MORE_GROUPS.some(g=>g[1].includes(tab))&&!moreMenuOpen?T.bg:T.textDim,padding:"9px 18px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12.5,letterSpacing:.8,textTransform:"uppercase",borderRadius:0}}>More {moreMenuOpen?"\u25b4":"\u25be"}</button>
            {moreMenuOpen&&<div role="menu" style={{position:"absolute",top:"100%",right:0,minWidth:560,background:T.bg,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.ink}`,boxShadow:"0 10px 30px rgba(0,0,0,.14)",padding:"14px 16px 16px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:18,zIndex:200,textAlign:"left"}}>
              {MORE_GROUPS.map(([g,ids])=><div key={g}>
                <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:T.textMute,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:6}}>{g}</div>
                {ids.map(id=><button key={id} role="menuitem" aria-current={tab===id?"page":undefined} onClick={()=>{setMoreMenuOpen(false);goTab(id);}} style={{display:"block",width:"100%",textAlign:"left",background:tab===id?T.card:"transparent",border:"none",padding:"7px 8px",cursor:"pointer",fontFamily:T.serif,fontWeight:600,fontSize:15,color:T.ink,borderRadius:0}}>{NAV_LABEL[id]}{id==="compare"&&comparePlayers.length?` (${comparePlayers.length})`:""}<div style={{fontFamily:T.sans,fontSize:12,color:T.textDim,fontWeight:400,marginTop:1}}>{TAB_BLURB[id]||""}</div></button>)}
              </div>)}
            </div>}
          </div>
        </div>
      </nav>}

      {/* ═══ MOBILE BOTTOM NAV ═══════════════════════════════════════════ */}
      {isMobile&&!loading&&<nav aria-label="Primary" className="usfi-bottom-nav" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:1000,background:T.surface,borderTop:`2px solid ${T.ink}`,display:"grid",gridTemplateColumns:"repeat(5,1fr)",paddingBottom:"env(safe-area-inset-bottom)",boxShadow:"0 -2px 10px rgba(0,0,0,.08)"}}>
        {[["front","Home","home"],["players","Players","players"],["teams","Teams","teams"],["search","Search","search"],["more","More","more"]].map(([id,l,ic])=>{
          const active=id==="search"?searchOpen:id==="more"?(moreOpen||(MORE_IDS.includes(tab)&&!searchOpen)):(tab===id&&!moreOpen&&!searchOpen);
          const go=()=>{if(id==="search"){setMoreOpen(false);setSearchOpen(v=>!v);}else if(id==="more"){setSearchOpen(false);setMoreOpen(v=>!v);}else goTab(id);};
          return <button key={id} onClick={go} aria-current={tab===id?"page":undefined} aria-expanded={id==="more"?moreOpen:id==="search"?searchOpen:undefined} style={{background:"transparent",border:"none",borderTop:`3px solid ${active?T.ink:"transparent"}`,color:active?T.ink:T.textDim,padding:"7px 0 8px",minHeight:56,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",fontFamily:T.sans,fontWeight:active?700:600,fontSize:12,letterSpacing:.4,textTransform:"uppercase",borderRadius:0}}>
            <NavIcon name={ic} size={21}/><span>{l}</span>
          </button>;
        })}
      </nav>}

      <BottomSheet open={isMobile&&moreOpen} onClose={()=>setMoreOpen(false)} title="More from the Index">
        {/* MORE_SHEET_TOP */}
        {[["Primary",["rankings","matchups","ask"]],...MORE_GROUPS].map(([g,ids])=><div key={g} style={{marginBottom:12}}>
          <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:T.textMute,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:8}}>{g==="Primary"?"Sections":g}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {ids.map(id=>{const active=tab===id;return <button key={id} onClick={()=>goTab(id)} aria-current={active?"page":undefined} style={{textAlign:"left",background:active?T.ink:T.surface,color:active?T.bg:T.ink,border:`1px solid ${active?T.ink:T.border}`,padding:"11px 12px",cursor:"pointer",fontFamily:T.sans,borderRadius:0,minHeight:56}}>
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:15}}>{NAV_LABEL[id]}</div>
              <div style={{fontSize:12,marginTop:3,color:active?T.bg:T.textDim,opacity:active?.85:1}}>{TAB_BLURB[id]||""}</div>
            </button>;})}
          </div>
        </div>)}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={()=>{setMoreOpen(false);setShowGrading(true);}} style={{flex:1,background:"none",border:`1px solid ${T.border}`,padding:"10px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.accent,borderRadius:0}}>How We Grade</button>
          <button onClick={()=>{setMoreOpen(false);setShowAbout(true);}} style={{flex:1,background:"none",border:`1px solid ${T.border}`,padding:"10px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.textDim,borderRadius:0}}>About</button>
        </div>
      </BottomSheet>

      <BottomSheet open={isMobile&&searchOpen} onClose={()=>setSearchOpen(false)} title="Search the Index">
        <PlayerSearch players={players} wide autoFocus onSelect={p=>{setSearchOpen(false);setSel(p);}}/>
        <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim,marginTop:10}}>Type a player name, club name, or club code (e.g. NSH).</div>
      </BottomSheet>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        {!loading&&<h2 className="sr-only">{(TABS.find(x=>x.id===tab)||{}).l||(tab==="matchup"?"Match Preview":tab==="methodology"?"Methodology":"Section")}</h2>}
        {/* Loading */}
        {loading&&<div style={{padding:"64px 0",textAlign:"center",animation:"fadeUp .5s ease"}}>
          <style>{`
            @keyframes usfiStamp{0%{opacity:0;transform:scale(2.2) rotate(-8deg)}55%{opacity:1;transform:scale(.92) rotate(1.5deg)}75%{transform:scale(1.05) rotate(-.5deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
            @keyframes usfiCaret{0%,45%{opacity:1}50%,100%{opacity:0}}
            @keyframes usfiInk{0%{opacity:.55}50%{opacity:1}100%{opacity:.55}}
          `}</style>
          <div style={{display:"inline-block",animation:"usfiStamp .7s cubic-bezier(.22,1.4,.36,1) both",filter:"sepia(.25) contrast(1.05)",marginBottom:14}}><Logo size={88}/></div>
          <div style={{fontFamily:T.mono,fontSize:11,letterSpacing:"0.3em",textTransform:"uppercase",color:T.accent,fontWeight:700,marginBottom:10}}>USA Footy Index</div>
          <div style={{fontFamily:T.display,fontWeight:900,fontSize:26,color:T.ink,letterSpacing:-.5,marginBottom:6}}>Composing Today&apos;s Edition</div>
          <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim,marginBottom:22}}>{loadMsg}<span style={{animation:"usfiCaret 1.1s steps(1) infinite",marginLeft:2}}>▌</span></div>
          <div style={{position:"relative",width:320,margin:"0 auto"}}>
            <div style={{width:"100%",height:2,background:T.borderLt}}/>
            <div style={{position:"absolute",top:0,left:0,width:`${loadProgress}%`,height:2,background:loadProgress>=100?T.green:T.ink,transition:"width .4s ease",animation:"usfiInk 2.4s ease-in-out infinite"}}/>
            <div style={{position:"absolute",top:-4,left:`calc(${loadProgress}% - 5px)`,width:10,height:10,transform:"rotate(45deg)",background:loadProgress>=100?T.green:T.ink,transition:"left .4s ease"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",width:320,margin:"14px auto 0"}}>
            <span style={{fontSize:11.5,color:T.textMute,fontFamily:T.mono,letterSpacing:"0.15em"}}>{loadProgress}%</span>
            <span style={{fontSize:11.5,color:T.textMute,fontFamily:T.serif,fontStyle:"italic"}}>
              {loadProgress<40?"Setting the type...":loadProgress<80?"Wiring the box scores...":loadProgress<95?"Inking the plates...":"Running the presses..."}
            </span>
          </div>
        </div>}

        {errMsg&&<div style={{padding:20,background:"#FEF2F2",border:`1px solid ${T.red}30`,borderRadius:0,marginBottom:20}}>
          <div style={{fontWeight:700,color:T.red,marginBottom:6,fontSize:13,fontFamily:T.serif}}>Data Load Error</div>
          <div style={{fontSize:12,color:T.textDim,fontFamily:T.mono,wordBreak:"break-all"}}>{errMsg}</div>
        </div>}

        {/* ═══ PLAYERS ═══════════════════════════════════════════════════════ */}

      {/* ═══ FRONT PAGE ═══════════════════════════════════════════════ */}
        {!loading&&tab==="front"&&(()=>{
          let graded=players.filter(p=>p.rated&&typeof p.overall==="number");if(!graded.length)graded=players.filter(p=>typeof p.overall==="number"&&p.name);
          const sortedG=[...graded].sort((a,b)=>b.overall-a.overall);const topPlayer=sortedG.find(p=>p.localHeadshot||p.headshot)||sortedG[0];
          // Editorial freshness gate: an article must be <= 7 days old AND no more than 7 days behind the data it sits next to
          const FRESH_MS=7*864e5;const dataT=cacheMeta&&cacheMeta.generated?Date.parse(cacheMeta.generated):Date.now();
          // Phase 6A: articles.json only ever holds current-season reporting. Under an archive season
          // the lead story and secondary cards would present 2026 news as though it were that season's.
          const freshArticles=season!==CURRENT_SEASON?[]:articles.filter(a=>{const t=a.created?Date.parse(a.created):NaN;return Number.isFinite(t)&&(Date.now()-t)<=FRESH_MS&&(dataT-t)<=FRESH_MS;});
          const sortedArt=[...freshArticles].sort((a,b)=>(b.created||"").localeCompare(a.created||""));
          const leadArticle=sortedArt[0]||null;const restArticles=sortedArt.slice(1,3);
          const leadTeam=(enrichedTeams||[]).find(t=>t.count>0)||enrichedTeams[0];
          const completed=[...matchesData].filter(m=>m.completed).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,8);
          const movers=graded.filter(p=>p.matchLog&&p.matchLog.length>=2).map(p=>{
            const rs=p.matchLog.map(m=>matchRating(m,p.position));const rec=rs.slice(-2),pri=rs.slice(0,-2).length?rs.slice(0,-2):rs.slice(0,1);
            const d=(rec.reduce((a,b)=>a+b,0)/rec.length)-(pri.reduce((a,b)=>a+b,0)/pri.length);
            return Object.assign({},p,{delta:+d.toFixed(1)});
          }).filter(Boolean);
          const riser=[...movers].sort((a,b)=>b.delta-a.delta)[0];
          const faller=[...movers].sort((a,b)=>a.delta-b.delta)[0];
          const tname=(ab)=>{const t=MLS_TEAMS.find(x=>x.abbr===ab);return t?t.name:ab;};
          const wireItems=[
            ...completed.slice(0,5).map(m=>`${m.home} ${m.homeScore||0}\u2013${m.awayScore||0} ${m.away} \u00b7 FINAL`),
            ...sortedG.slice(0,5).map(p=>`${(p.name||"").toUpperCase()} ${p.overall}`),
            riser&&riser.delta>0?`\u25b2 RISING: ${(riser.name||"").toUpperCase()} +${riser.delta}`:null,
            faller&&faller.delta<0?`\u25bc FALLING: ${(faller.name||"").toUpperCase()} ${faller.delta}`:null,
            leadTeam?`TOP CLUB: ${tname(leadTeam.abbr).toUpperCase()} ${leadTeam.overall}`:null,
            graded.length?`${graded.length} PLAYERS GRADED`:null,
            (()=>{const tg=[...graded].sort((a,b)=>(b.goals||0)-(a.goals||0))[0];return tg&&tg.goals?`GOLDEN BOOT: ${(tg.name||"").toUpperCase()} ${tg.goals}G`:null;})(),
            (()=>{const withA=graded.filter(x=>x.assists!=null);const ta=withA.length?[...withA].sort((a,b)=>(b.assists||0)-(a.assists||0))[0]:null;/*6B-STATLINE*/return ta&&ta.assists?`ASSISTS: ${(ta.name||"").toUpperCase()} ${sv(ta.assists)}`:null;})(),
          ].filter(Boolean);
          const wireStr=wireItems.join("  \u00b7\u00b7\u2014  ");
          const kicker={fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.18em",textTransform:"uppercase",color:T.accent,fontWeight:700};
          const storyCard=(kick,title,body,onClick,meta)=>(
            <div key={kick} onClick={onClick} style={{padding:"16px 0",borderBottom:`1px solid ${T.borderLt}`,cursor:onClick?"pointer":"default"}}>
              <div style={kicker}>{kick}</div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:19,lineHeight:1.2,margin:"7px 0",color:T.ink}}>{title}</div>
              <div style={{fontFamily:T.serif,fontSize:14.5,color:T.text,lineHeight:1.55}}>{body}</div>
              {meta&&<div style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.1em",textTransform:"uppercase",color:T.textDim,fontWeight:600,marginTop:8}}>{meta}</div>}
            </div>);
          return <div style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",animation:"fadeUp .4s ease"}}>
            {season===CURRENT_SEASON&&wireItems.length>0&&<div style={{display:"flex",alignItems:"center",overflow:"hidden",border:`1px solid ${T.border}`,borderTop:"none",marginBottom:28,background:T.surface}}>
              <span style={{flex:"none",fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",color:T.bg,background:T.ink,padding:"7px 14px 6px"}}>THE WIRE</span>
              <div className="wire-track" style={{flex:1,overflow:"hidden",whiteSpace:"nowrap"}}>
                <div className="wire-inner" style={{display:"inline-block",whiteSpace:"nowrap",fontFamily:T.mono,fontSize:12,letterSpacing:"0.12em",textTransform:"uppercase",color:T.textDim,padding:"7px 0 6px",animation:"wireScroll 36s linear infinite"}}>
                  <span>{wireStr}{"  \u00b7\u00b7\u2014  "}</span><span>{wireStr}{"  \u00b7\u00b7\u2014  "}</span>
                </div>
              </div>
            </div>}
            {leadTeam&&<div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.5fr 1fr",gap:isMobile?28:48,paddingBottom:36,borderBottom:`3px solid ${T.ink}`,alignItems:"center"}}>
              <div>
                <div style={kicker}>{leadArticle?leadArticle.kicker:"The Lead \u00b7 Team Grade Leader"}</div>
                <div style={{fontFamily:T.display,fontWeight:900,fontSize:isMobile?32:46,lineHeight:1.05,letterSpacing:"-0.01em",color:T.ink,margin:"12px 0 14px",textShadow:"1.5px 1.5px 0 rgba(179,94,86,.35)"}}>
                  {leadArticle?leadArticle.headline:`${tname(leadTeam.abbr)} Sit Atop the Index`}
                </div>
                <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:17,color:T.textDim,lineHeight:1.5,marginBottom:18}}>
                  {leadArticle?leadArticle.dek:`A minutes-weighted team grade of ${leadTeam.overall} (built on ${leadTeam.count} graded players) puts ${leadTeam.abbr} first in the Index team-grade rankings. Power Rankings (points, grade and form) live on the Table tab.`}
                </div>
                {leadArticle&&leadArticle.body&&<div style={{fontFamily:T.serif,fontSize:15,color:T.text,lineHeight:1.6,marginBottom:18}}>{leadArticle.body}</div>}
                <div style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.12em",textTransform:"uppercase",color:T.textDim,fontWeight:600,marginBottom:18}}>By the Index {"\u00b7"} Auto-generated from live data</div>
                <div style={{display:"flex",borderTop:`1px solid ${T.ink}`,borderBottom:`1px solid ${T.borderLt}`}}>
                  {[[leadTeam.overall,"Team Grade"],[(leadTeam.formDelta!=null?(leadTeam.formDelta>0?"+":"")+leadTeam.formDelta:"\u2014"),"Form \u0394 5GM"],["#1","Team Grade Rank"]].map(([v,l],i)=>(
                    <div key={l} style={{flex:1,padding:"10px 14px",borderRight:i<2?`1px solid ${T.borderLt}`:"none"}}>
                      <div style={{fontFamily:T.mono,fontSize:22,fontWeight:700,color:T.blue}}>{v}</div>
                      <div style={{fontFamily:T.mono,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:T.textMute,marginTop:4}}>{l}</div>
                    </div>))}
                </div>
                <button onClick={()=>setTab("teams")} style={{marginTop:20,background:T.ink,color:T.bg,border:"none",padding:"12px 24px",fontFamily:T.mono,fontWeight:700,fontSize:12,letterSpacing:"0.16em",textTransform:"uppercase",cursor:"pointer"}}>Read the Numbers {"\u2192"}</button>
              </div>
              {topPlayer&&<div style={{position:"relative",justifySelf:isMobile?"center":"end",width:"100%",maxWidth:330}}>
                <div className="stamp-strike" style={{position:"absolute",top:16,right:-10,zIndex:3,fontFamily:T.mono,fontWeight:700,color:T.accent,border:`3px solid ${T.accent}`,padding:"7px 13px 5px",textAlign:"center",background:"rgba(225,205,172,.85)"}}>
                  <span style={{fontSize:30,letterSpacing:"-0.02em",display:"block"}}>{topPlayer.overall}</span>
                  <span style={{fontSize:10,letterSpacing:"0.24em",display:"block",marginTop:3}}>INDEX GRADE</span>
                </div>
                <div onClick={()=>setSel(topPlayer)} style={{aspectRatio:"4/4.6",overflow:"hidden",border:`3px solid ${T.ink}`,boxShadow:`0 0 0 4px ${T.bg}, 0 0 0 5px ${T.ink}`,position:"relative",background:T.card,cursor:"pointer"}}>
                  {(topPlayer.localHeadshot||topPlayer.headshot)&&<img src={topPlayer.localHeadshot||topPlayer.headshot} alt={topPlayer.name} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",filter:"grayscale(.85) sepia(.4) contrast(1.12) brightness(1.02)"}} onError={e=>{e.target.style.display="none";}}/>}
                  <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle, rgba(35,31,25,.5) 1px, transparent 1.5px)",backgroundSize:"4px 4px",mixBlendMode:"overlay",pointerEvents:"none"}}></div>
                  <div style={{position:"absolute",left:0,right:0,bottom:0,background:"linear-gradient(transparent, rgba(35,31,25,.78))",padding:"26px 14px 10px"}}>
                    <div style={{fontFamily:T.display,fontWeight:900,fontSize:20,color:"#E8DCC0",lineHeight:1.05}}>{topPlayer.name}</div>
                    <div style={{fontFamily:T.mono,fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"#C9BA97",marginTop:4}}>{topPlayer.pos} {"\u00b7"} {tname(topPlayer.team)} {"\u00b7"} League&apos;s Top Grade</div>
                  </div>
                </div>
              </div>}
            </div>}
            {/* ═══ HISTORICAL SEASON NOTICE (Phase 6A) ═══ */}
            {/* HISTORICAL_NOTICE: articles, the wire ticker, ranking history, pipeline status and the
                fixture slate are all current-season data. When an archive season is selected we say so
                and hide them, rather than letting 2026 content read as though it belongs to 2024/2025. */}
            {season!==CURRENT_SEASON&&<div role="note" style={{margin:"18px 0 4px",padding:isMobile?"12px 14px":"14px 18px",border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.accent}`,background:T.surface}}>
              <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>Archive · {season} season</div>
              <div style={{fontFamily:T.serif,fontSize:15,color:T.text,lineHeight:1.6,marginTop:6}}>
                You are viewing the <b>{season}</b> archive. Grades are computed from that season's record. News, the wire, match previews, power-ranking movement and pipeline status are current-season features and are hidden here rather than shown with {season} data they don't belong to.
              </div>
              {SEASON_COVERAGE[season]&&<div style={{fontFamily:T.sans,fontSize:12.5,color:T.textDim,lineHeight:1.55,marginTop:8}}>
                <b>Sources for {season}:</b> {SEASON_COVERAGE[season].sources.join(" · ")}.
                {SEASON_COVERAGE[season].limits.length>0&&<ul style={{margin:"6px 0 0",paddingLeft:20}}>{SEASON_COVERAGE[season].limits.map((l,i)=><li key={i} style={{marginBottom:2}}>{l}</li>)}</ul>}
              </div>}
              <div style={{marginTop:10}}><button onClick={()=>setSeason(CURRENT_SEASON)} style={{background:T.ink,border:"none",color:T.bg,padding:"7px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,borderRadius:0}}>Back to {CURRENT_SEASON} {"\u2192"}</button></div>
            </div>}

            {/* ═══ MY CLUB (Phase 4d) ═══ */}
            {myClub?<MyClubDesk abbr={myClub} teams={enrichedTeams} standings={standingsData} matches={matchesData} players={players} logos={teamLogos} isMobile={isMobile} onChange={setMyClub}
              onPlayer={p=>setSel(p)} onTeam={ab=>{setExpandTeam(ab);setTeamLevel(1);goTab("teams");}} onMatchup={(h,a)=>openMatchup(h,a)}
              onCard={fx=>{const st={};standingsData.forEach(s=>{st[s.team]=s;});const teams=enrichedTeams.map(t=>{const s=st[t.abbr]||{};return{...t,pts:s.pts,w:s.w,dr:s.d,l:s.l};});cardMatchPreview({m:fx,teams,logos:teamLogos,matches:matchesData});}}/>
            :<FollowClubCTA onPick={setMyClub} isMobile={isMobile}/>}
            {/* ═══ DESK ROW: slate · movers · subscribe ═══ */}
            {season===CURRENT_SEASON&&(()=>{
              const upcoming=[...matchesData].filter(m=>!m.completed&&m.date&&new Date(m.date)>=new Date()).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,6);
              const latest=[...matchesData].filter(m=>m.completed).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,6);
              const slate=upcoming.length?upcoming:latest;
              const slateTitle=upcoming.length?"The Slate \u00b7 Upcoming":"The Slate \u00b7 Latest Results";
              const risers=[...movers].sort((a,b)=>b.delta-a.delta).slice(0,4).filter(p=>p.delta>0);
              const fallers=[...movers].sort((a,b)=>a.delta-b.delta).slice(0,4).filter(p=>p.delta<0);
              const fmtD=(d)=>{const s=fmtET(d);return s?s.toUpperCase():"";};
              const colHead=(t)=>(<div style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.bg,background:T.ink,padding:"6px 10px 5px",marginBottom:10}}>{t}</div>);
              const rowStyle={display:"flex",justifyContent:"space-between",padding:"6px 2px",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:11.5};
              if(!slate.length&&!risers.length&&!fallers.length)return null;
              return <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:isMobile?24:32,padding:"30px 0 26px",borderBottom:`1px solid ${T.borderLt}`}}>
                <div>
                  {colHead(slateTitle)}
                  {slate.length?slate.map((m,i)=>(
                    <div key={i} style={Object.assign({},rowStyle,{color:T.text,alignItems:"center"},(()=>{const mine=myClub&&(m.home===myClub||m.away===myClub);return mine?{borderLeft:`3px solid ${T.accent}`,paddingLeft:6,fontWeight:700}:{};})())}>
                      <span role="link" tabIndex={0} title="Open match preview" onClick={()=>openMatchup(m.home,m.away)} onKeyDown={e=>{if(e.key==="Enter")openMatchup(m.home,m.away);}} style={{cursor:"pointer",textDecoration:"underline",textDecorationColor:T.borderLt,textUnderlineOffset:3}}>{m.home}{upcoming.length?" v ":` ${m.homeScore||0}\u2013${m.awayScore||0} `}{m.away}</span>
                      <span style={{color:T.textMute,display:"flex",alignItems:"center",gap:8}}>{fmtD(m.date)}{upcoming.length>0&&<button title="Download match preview card" aria-label={"Download preview card for "+m.home+" v "+m.away} onClick={()=>{const st={};standingsData.forEach(s=>{st[s.team]=s;});const teams=enrichedTeams.map(t=>{const s=st[t.abbr]||{};return{...t,pts:s.pts,w:s.w,dr:s.d,l:s.l};});cardMatchPreview({m,teams,logos:teamLogos,matches:matchesData});}} style={{background:"none",border:`1px solid ${T.borderLt}`,color:T.textDim,width:22,height:20,padding:0,cursor:"pointer",fontFamily:T.mono,fontSize:12,lineHeight:1,borderRadius:0}}>{"\u2193"}</button>}</span>
                    </div>)):<div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim}}>Nothing on the wire.</div>}
                </div>
                <div>
                  {colHead("Risers & Fallers \u00b7 Form")}
                  {risers.map(p=>(
                    <div key={p.name} onClick={()=>setSel(p)} style={Object.assign({},rowStyle,{cursor:"pointer"})}>
                      <span style={{color:T.text}}>{"\u25b2"} {p.name}</span><span style={{color:T.green,fontWeight:700}}>+{p.delta}</span>
                    </div>))}
                  {fallers.map(p=>(
                    <div key={p.name} onClick={()=>setSel(p)} style={Object.assign({},rowStyle,{cursor:"pointer"})}>
                      <span style={{color:T.text}}>{"\u25bc"} {p.name}</span><span style={{color:T.red,fontWeight:700}}>{p.delta}</span>
                    </div>))}
                  {!risers.length&&!fallers.length&&<div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim}}>Form data settles after two match logs.</div>}
                </div>
                <div style={{border:`3px double ${T.ink}`,padding:"18px 16px",textAlign:"center",alignSelf:"start",background:T.surface}}>
                  <div style={{fontFamily:T.mono,fontSize:10,letterSpacing:"0.28em",textTransform:"uppercase",color:T.textMute,marginBottom:8}}>{"\u2014"} Advertisement {"\u2014"}</div>
                  <div style={{fontFamily:T.display,fontWeight:900,fontSize:19,color:T.ink,lineHeight:1.15}}>Subscribe to the Dispatch</div>
                  <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim,margin:"8px 0 14px"}}>The Index, delivered weekly by wire. Grades, movers, and the stories behind the numbers.</div>
                  <a href="https://usfootyindex.beehiiv.com" target="_blank" rel="noopener noreferrer" style={{display:"inline-block",background:T.accent,color:T.bg,textDecoration:"none",padding:"10px 22px",fontFamily:T.mono,fontWeight:700,fontSize:11.5,letterSpacing:"0.18em",textTransform:"uppercase"}}>Subscribe Free {"\u2192"}</a>
                </div>
              </div>;
            })()}
            {graded.length>=3&&(()=>{
              const top3=sortedG.slice(0,3);
              const leaders=[
                {l:"Top Grade",p:sortedG[0],v:sortedG[0]&&sortedG[0].overall},
                {l:"Most Goals",p:[...graded].sort((a,b)=>(b.goals||0)-(a.goals||0))[0],v:(()=>{const x=[...graded].sort((a,b)=>(b.goals||0)-(a.goals||0))[0];return x&&x.goals;})()},
                {l:"Most Assists",p:(()=>{const w=graded.filter(y=>y.assists!=null);return w.length?[...w].sort((a,b)=>(b.assists||0)-(a.assists||0))[0]:null;})(),/*6B-LEADERS*/v:(()=>{const x=[...graded.filter(y=>y.assists!=null)].sort((a,b)=>(b.assists||0)-(a.assists||0))[0];return x&&x.assists;})()},
                {l:"Top xG",p:[...graded].sort((a,b)=>(parseFloat(b.xGoals)||0)-(parseFloat(a.xGoals)||0))[0],v:(()=>{const x=[...graded].sort((a,b)=>(parseFloat(b.xGoals)||0)-(parseFloat(a.xGoals)||0))[0];return x&&x.xGoals;})()},
              ].filter(x=>x.p&&x.v);
              return <div style={{padding:"34px 0 8px"}}>
                <div className="sec-rule" style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:`3px solid ${T.ink}`,paddingBottom:7,marginBottom:18}}>
                  <span style={{fontFamily:T.display,fontWeight:700,fontSize:21,color:T.ink}}>Top of the Index</span>
                  <span onClick={()=>setTab("players")} style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.16em",textTransform:"uppercase",color:T.accent,fontWeight:700,cursor:"pointer"}}>All Grades {"\u2192"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:24,marginBottom:30}}>
                  {top3.map((p,i)=>(
                    <div key={p.id} onClick={()=>setSel(p)} style={{cursor:"pointer",border:`1px solid ${T.border}`,padding:16,display:"flex",gap:14,alignItems:"center",background:T.surface}}>
                      <div style={{fontFamily:T.display,fontWeight:900,fontSize:34,color:T.borderLt,lineHeight:1,minWidth:30}}>{i+1}</div>
                      {(p.localHeadshot||p.headshot)?<img src={p.localHeadshot||p.headshot} alt={p.name} style={{width:54,height:54,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.ink}`,filter:"grayscale(.6) sepia(.3)"}} onError={e=>{e.target.style.display="none";}}/>:null}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink,lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{fontFamily:T.mono,fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:T.textDim,marginTop:3}}>{p.position} {"\u00b7"} {tname(p.team)}</div>
                      </div>
                      <div style={{fontFamily:T.mono,fontWeight:700,fontSize:24,color:T.blue}}>{p.overall}</div>
                    </div>))}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",borderTop:`1px solid ${T.ink}`,borderBottom:`1px solid ${T.borderLt}`}}>
                  {leaders.map((x,i)=>(
                    <div key={x.l} onClick={()=>setSel(x.p)} style={{flex:"1 1 0",minWidth:150,cursor:"pointer",padding:"12px 16px",borderRight:i<leaders.length-1?`1px solid ${T.borderLt}`:"none"}}>
                      <div style={{fontFamily:T.mono,fontSize:11,letterSpacing:"0.14em",textTransform:"uppercase",color:T.accent,fontWeight:700}}>{x.l}</div>
                      <div style={{fontFamily:T.display,fontWeight:700,fontSize:15,color:T.ink,marginTop:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.p.name}</div>
                      <div style={{fontFamily:T.mono,fontSize:18,fontWeight:700,color:T.blue,marginTop:2}}>{x.v}</div>
                    </div>))}
                </div>
              </div>;
            })()}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:isMobile?28:48,padding:"30px 0 40px"}}>
              <div>
                <div className="sec-rule" style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:`3px solid ${T.ink}`,paddingBottom:7,marginBottom:6}}>
                  <span style={{fontFamily:T.display,fontWeight:700,fontSize:21,color:T.ink}}>What Changed This Week</span>
                  <span onClick={()=>{setTab("leaders");setLeadersView("movers");}} style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.16em",textTransform:"uppercase",color:T.accent,fontWeight:700,cursor:"pointer"}}>All Movers {"\u2192"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",columnGap:32}}>
                  {restArticles.map(a=>storyCard(a.kicker,a.headline,a.body,null,a.created?fmtET(a.created):null))}
                  {riser&&riser.delta>0&&storyCard("Heating Up",`${riser.name} Is Outrunning His Grade`,`Recent form is ${riser.delta} points above his season baseline. The league's steepest current riser.`,()=>setSel(riser),`Grade ${riser.overall} \u00b7 ${tname(riser.team)}`)}
                  {faller&&faller.delta<0&&storyCard("Cooling Down",`${faller.name} Has Gone Quiet`,`Form has dipped ${Math.abs(faller.delta)} points below baseline over the last two matches.`,()=>setSel(faller),`Grade ${faller.overall} \u00b7 ${tname(faller.team)}`)}
                  {storyCard("Team of the Week","This Week's Best XI, Graded","The eleven highest single-match grades of the latest matchweek, in formation.",()=>{setTab("leaders");setLeadersView("totw");},"Interactive formation \u2192")}
                  {storyCard("Value Desk","The Bargains the Market Missed","Grade-per-dollar leaders. Production the salary sheet has not caught up with.",()=>setTab("valuations"),"Value Efficiency model \u2192")}
                </div>
              </div>
              <div>
                <div className="sec-rule" style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:`3px solid ${T.ink}`,paddingBottom:7,marginBottom:4}}>
                  <span style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink}}>Team Grades</span>
                  <span onClick={()=>setTab("teams")} style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.16em",textTransform:"uppercase",color:T.accent,fontWeight:700,cursor:"pointer"}}>Full 30 {"\u2192"}</span>
                </div>
                {enrichedTeams.slice(0,5).map((t,i)=>{
                  return <div key={t.abbr} onClick={()=>setTab("teams")} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 0",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:12.5,cursor:"pointer"}}>
                    <span style={{width:16,color:T.textMute,fontSize:12}}>{i+1}</span>
                    <TeamBadge abbr={t.abbr} size={16} logo={teamLogos[t.abbr]}/>
                    <span style={{flex:1,fontWeight:500,color:T.text}}>{t.name}</span>
                    <span style={{fontWeight:700,color:T.blue}}>{t.overall}</span>
                  </div>;
                })}
                <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12.5,color:T.textDim,marginTop:12,marginBottom:34,lineHeight:1.5}}>Minutes-weighted composite team grades. Every player counted. <span onClick={()=>setTab("rankings")} style={{color:T.accent,cursor:"pointer",fontStyle:"normal",fontFamily:T.mono,fontSize:11.5,letterSpacing:"0.1em",textTransform:"uppercase"}}>Power Rankings are on the Table tab {"\u2192"}</span></div>
                {(()=>{
                  const fw=[...graded].filter(p=>p.position==="FW").sort((a,b)=>b.overall-a.overall)[0]||sortedG[0];
                  const gk=[...graded].filter(p=>(p.saves||0)>0).sort((a,b)=>(b.saves||0)-(a.saves||0))[0];
                  const bargain=[...graded].filter(p=>p.marketValue>0).map(p=>({p,r:p.overall/(p.marketValue/1e6)})).sort((a,b)=>b.r-a.r)[0];
                  const bigMover=riser;
                  const lines=[
                    fw?["Top Grade (FW)",fw.overall,()=>setSel(fw)]:null,
                    gk?["Top Shot Stopper",gk.saves+" SV",()=>setSel(gk)]:null,
                    bargain?["Best Bargain",bargain.r.toFixed(1)+"\u00d7",()=>setSel(bargain.p)]:null,
                    bigMover&&bigMover.delta>0?["Biggest Mover","+"+bigMover.delta,()=>setSel(bigMover)]:null,
                  ].filter(Boolean);
                  if(!lines.length)return null;
                  return <div>
                    <div className="sec-rule" style={{position:"relative",borderBottom:`3px solid ${T.ink}`,paddingBottom:7,marginBottom:4}}>
                      <span style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink}}>The Stat Line</span>
                    </div>
                    {lines.map((l,i)=>(
                      <div key={i} onClick={l[2]} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:12.5,cursor:"pointer"}}>
                        <span style={{color:T.text}}>{l[0]}</span>
                        <span style={{fontWeight:700,color:T.blue}}>{l[1]}</span>
                      </div>))}
                    <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12.5,color:T.textDim,marginTop:12,lineHeight:1.5}}>Each line links into the analytics. The front page is the door, not the house.</div>
                  </div>;
                })()}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"6px 0 34px",color:T.textDim,fontFamily:T.fell,fontSize:14,letterSpacing:"0.3em"}}>
              <span style={{height:1,width:90,background:T.textDim,opacity:.5}}></span>
              <span style={{color:T.accent,fontSize:17}}>{"\u2766"}</span>
              <span>{season} SEASON</span>
              <span style={{color:T.accent,fontSize:17}}>{"\u2766"}</span>
              <span style={{height:1,width:90,background:T.textDim,opacity:.5}}></span>
            </div>
          </div>;
        })()}
        {!loading&&tab==="players"&&<div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Player Grades</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Percentile-based grades ranking every player's per-90 production against the entire league. The Overall grade is position-weighted — forwards are judged on attacking output, defenders on defensive impact.</div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <Select label="Position" value={posFilter} onChange={setPosFilter} width={130} options={["All","Forward","Midfielder","Defender","GK"]}/>
            <Select label="Sort" value={sortKey} onChange={v=>{setSortKey(v);setSortDir(v==="age"?"asc":"desc");}} width={130} options={[["overall","Overall"],["goals","Goals"],["assists","Assists"],["xg90","xG/90"],["officialXg","Official xG"],["chances","Chances"],["totalGA","G+ Added"],["clearances","Clearances"],["distance","Distance"],["passComp","Pass %"],["age","Age"],["team","Team"]]}/>
            <Select label="Team" value={teamFilter} onChange={setTeamFilter} width={200} options={teamOpts}/>
            <Select label="Min. Mins" value={String(minMins)} onChange={v=>setMinMins(Number(v))} width={100} options={[["0","All"],["200","200+"],["400","400+"],["600","600+"],["900","900+"]]}/>
          </div>

          {best&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"20px 24px",marginBottom:24,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            {(best.localHeadshot||best.headshot)?<img src={best.localHeadshot||best.headshot} alt={best.name} style={{width:64,height:64,objectFit:"cover",objectPosition:"top",border:`2px solid ${T.ink}`,filter:"grayscale(.6) sepia(.3)",display:"block",background:T.card,flexShrink:0,marginRight:6}} onError={e=>{e.target.style.display="none";}}/>:<TeamBadge abbr={best.team} size={48} logo={best?.teamLogo}/>}
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:11,color:T.accent,fontWeight:700,letterSpacing:2,fontFamily:T.sans,textTransform:"uppercase",marginBottom:3}}>Top Rated Player</div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:32,color:T.ink,letterSpacing:-.5,lineHeight:1}}>{best.name}</div>
              <div style={{fontSize:12,color:T.textDim,marginTop:4,fontFamily:T.sans}}>{best.position} · {best.teamName}</div>
            </div>
            <Badge grade={best.overall} rated={best.rated} size="lg"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"4px 18px"}}>
              <StatChip label="G/A" value={`${best.goals}/${sv(best.assists)}`} color={T.ink}/>
              <StatChip label="xG" value={best.xGoals} color={T.textDim}/>
              <StatChip label="G+" value={best.totalGA} color={+best.totalGA>=0?T.green:T.red}/>
              <StatChip label="TKL" value={best.tackles!=null?best.tackles:"—"} color={T.textDim}/>
            </div>
          </div>}

          <TableWrap><div>
            {isMobile?<MobileSortBar options={[["overall","Grade"],["age","Age"],["goals","G"],["assists","A"],["totalGA","G+"],["xg90","xG/90"],["marketValue","Value"]]} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>:<div style={{display:"grid",gridTemplateColumns:tbl,padding:"10px 14px",background:T.card,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}>
              <div style={{textAlign:"center"}}>#</div><div>Player</div>
              <ColHead label="Grd" sortKey="overall" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>
              <ColHead label="Age" sortKey="age" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>
              <ColHead label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>
              <ColHead label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>
              {!isMobile&&<ColHead label="xG/90" sortKey="xg90" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}
              {!isMobile&&<ColHead label="Pass%" sortKey="passComp" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}
              {!isMobile&&<ColHead label="Clr"/*3B2*/ sortKey="clearances" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}
              {!isMobile&&<div style={{textAlign:"center"}}>Sh/SoT</div>}
              {!isMobile&&<ColHead label="Fls" sortKey="fouls" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}
              <ColHead label="G+" sortKey="totalGA" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>
            </div>}
            {filtered.map((p,i)=>isMobile?<MobilePlayerCard key={p.id} p={p} i={i} onOpen={()=>setSel(p)}/>:<div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"grid",gridTemplateColumns:tbl,alignItems:"center",padding:isMobile?"12px 10px":"16px 14px",minHeight:isMobile?44:56,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,alignItems:"center",cursor:"pointer",animation:`fadeUp .25s ease both`,animationDelay:`${Math.min(i*12,250)}ms`}}>
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:i<3?T.accent:T.textMute,textAlign:"center"}}>{i+1}</div>
              <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginLeft:isMobile?0:6,minWidth:0}}><TeamBadge abbr={p.team} size={isMobile?24:36} logo={p.teamLogo}/><div style={{minWidth:0,flex:1}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:20,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}</div><div style={{fontSize:isMobile?11.5:14,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.position} · {p.team}{(p.mins||0)<450&&<span title="Provisional — under 450 minutes played" style={{fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 5px",borderRadius:0,letterSpacing:.5,flexShrink:0,marginLeft:6}}>PROV</span>}</div></div>{!isMobile&&p.matchLog?.length>=2&&<MiniSparkline matchLog={p.matchLog} pos={p.position} w={48} h={16}/>}</div>
              <div style={{textAlign:"center"}}>{p.rated===false||p.overall==null?<span style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:T.textMute}}>NR</span>:<span style={{display:"inline-flex",flexDirection:"column",alignItems:"center"}}><span style={{fontFamily:T.display,fontWeight:900,fontSize:isMobile?20:28,color:T.ink,lineHeight:1,letterSpacing:-.5}}>{Math.round(p.overall)}</span><span style={{width:isMobile?20:26,height:3,background:gc(p.overall),marginTop:4,display:"block"}}></span></span>}</div>
              <div style={{fontSize:isMobile?12:13,color:p.age&&+p.age<23?T.green:p.age&&+p.age>32?T.red:T.textDim,textAlign:"center",fontFamily:T.mono,fontWeight:500}}>{p.age||"—"}</div>
              <div style={{fontFamily:T.mono,fontWeight:500,fontSize:isMobile?12:14,color:T.textDim,textAlign:"center"}}>{p.goals}</div>
              <div style={{fontFamily:T.mono,fontWeight:500,fontSize:isMobile?12:14,color:T.textDim,textAlign:"center"}}>{sv(p.assists)}</div>
              {!isMobile&&<div style={{fontSize:12,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{p.xg90}</div>}
              {!isMobile&&<div style={{fontSize:14,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{p.passComp}%</div>}
              {!isMobile&&<div style={{fontSize:14,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{sv(p.clearances)}</div>}
              {!isMobile&&<div style={{fontSize:13,color:T.textDim,textAlign:"center"}}>{p.shots!=null?`${p.shots}/${p.shotsOnTarget}`:"—"}</div>}
              {!isMobile&&<div style={{fontSize:13,color:T.textDim,textAlign:"center"}}>{sv(p.fouls)}</div>}
              <div style={{fontSize:isMobile?12:14,color:+p.totalGA>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono,textAlign:"center"}}>{+p.totalGA>=0?"+":""}{p.totalGA}</div>
            </div>)}
          </div></TableWrap>
        </div>}

        {/* ═══ SEASON RATING ═══════════════════════════════════════════════ */}
        {!loading&&tab==="season"&&(()=>{
          const toggleSrSort=(k)=>{if(srSort===k)setSrDir(d=>d==="desc"?"asc":"desc");else{setSrSort(k);setSrDir(k==="age"||k==="valueEff"?"asc":"desc");}};

          const{ratings,byPos,tiers}=seasonRatings;
          const srFiltered=ratings.filter(p=>{
            if(srPosFilter!=="All"){const map={Forward:["FW"],Midfielder:["MF"],Defender:["DF"],GK:["GK"]};if(!map[srPosFilter]?.includes(p.posGroup))return false;}
            if(srTeamFilter!=="All"&&p.team!==srTeamFilter)return false;
            if((p.mins||0)<srMinMins)return false;
            return true;
          }).sort((a,b)=>{
            const dir=srDir==="asc"?1:-1;
            if(srSort==="age")return dir*(parseFloat(a.age||99)-parseFloat(b.age||99));
            if(srSort==="name")return dir*(a.name||"").localeCompare(b.name||"");
            return compareUnknownLast(a[srSort],b[srSort],dir);/*6B.1-SORT*/
          });

          const formIcon=(t)=>t==="up"?"▲":t==="down"?"▼":"—";
          const formColor=(t)=>t==="up"?T.green:t==="down"?T.red:T.textMute;
          const profileColor=(p)=>p==="Offensive"?T.accent:p==="Defensive"?T.blue:T.textDim;

          // Top 3 season rated
          const top3=srFiltered.slice(0,3);

          // Stats summary (based on filtered)
          const avgSR=srFiltered.length?Math.round(srFiltered.reduce((s,p)=>s+p.seasonGrade,0)/srFiltered.length):0;
          const eliteCount=srFiltered.filter(p=>p.seasonGrade>=85).length;
          const avgConsistency=srFiltered.length?Math.round(srFiltered.reduce((s,p)=>s+p.consistency,0)/srFiltered.length):0;

          return <div style={{animation:"fadeUp .4s ease"}}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20,flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Season Rating</div>
                <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Cumulative season performance — unlike Player Grades (a per-90 snapshot), this rewards durability, goal involvement, and Goals Added over a full season. · {srFiltered.length} players shown</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                {["table","position","tiers"].map(v=><button key={v} onClick={()=>setSrView(v)} style={{background:srView===v?T.ink:"transparent",color:srView===v?T.bg:T.textDim,border:`1px solid ${srView===v?T.ink:T.border}`,borderRadius:0,padding:"5px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:11.5,letterSpacing:.5,textTransform:"uppercase"}}>{v==="table"?"Table":v==="position"?"By Position":"Tiers"}</button>)}
              </div>
            </div>

            {/* Summary cards */}
            <div className="resp-grid4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
              {[
                {v:srFiltered.length,l:"Players",sub:srMinMins>0?`${srMinMins}+ min`:"All minutes"},
                {v:avgSR,l:"Avg Rating",sub:gl(avgSR),c:gc(avgSR)},
                {v:eliteCount,l:"Elite Rated",sub:"85+ grade",c:T.gold},
                {v:`${avgConsistency}%`,l:"Avg Consistency",sub:"Cross-category",c:avgConsistency>=70?T.green:T.textDim},
              ].map(s=>(
                <div key={s.l} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:s.c||T.ink,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5,marginTop:3,fontFamily:T.sans,textTransform:"uppercase"}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* What Changed — Biggest Movers */}
            {(()=>{
              const movers=filtered.filter(p=>{
                const pl=players.find(x=>x.id===p.id);
                return pl&&pl.matchLog&&pl.matchLog.length>=3;
              }).map(p=>{
                const pl=players.find(x=>x.id===p.id);
                const logs=pl.matchLog;
                const allRatings=logs.map(m=>matchRating(m,pl.position));
                const recent=allRatings.slice(-2);
                const prior=allRatings.slice(0,-2);
                if(prior.length<1)return null;
                const recentAvg=Math.round(recent.reduce((s,v)=>s+v,0)/recent.length);
                const priorAvg=Math.round(prior.reduce((s,v)=>s+v,0)/prior.length);
                const delta=recentAvg-priorAvg;
                // What context? Goals/assists in recent games
                const recentLogs=logs.slice(-2);
                const recentG=recentLogs.reduce((s,m)=>s+(m.g||0),0);
                const recentA=recentLogs.reduce((s,m)=>s+(m.a||0),0);
                let context="";
                if(recentG>0)context+=`${recentG}G `;
                if(recentA>0)context+=`${recentA}A `;
                if(!context&&delta>0)context="Strong all-around ";
                if(!context&&delta<0)context="Quiet stretch ";
                return{...p,...pl,delta,recentAvg,priorAvg,context:context.trim()};
              }).filter(Boolean);
              if(movers.length<6)return null;
              const risers=[...movers].filter(m=>m.delta>=3).sort((a,b)=>b.delta-a.delta).slice(0,3);
              const fallers=[...movers].filter(m=>m.delta<=-3).sort((a,b)=>a.delta-b.delta).slice(0,3);
              if(!risers.length&&!fallers.length)return null;
              return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"16px 20px",marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink}}>What Changed</div>
                    <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Biggest recent movers — last 2 games vs prior form</div>
                  </div>
                </div>
                <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {risers.length>0&&<div>
                    <div style={{fontSize:10,color:T.green,fontWeight:700,letterSpacing:1.5,fontFamily:T.sans,marginBottom:8}}>↑ RISING</div>
                    {risers.map((p,i)=>(
                      <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:0,cursor:"pointer",marginBottom:4}}>
                        <TeamBadge abbr={p.team} size={24} logo={p.teamLogo}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink}}>{p.name}</div>
                          <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{p.context}</div>
                        </div>
                        <div style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.green}}>+{p.delta}</div>
                      </div>
                    ))}
                  </div>}
                  {fallers.length>0&&<div>
                    <div style={{fontSize:10,color:T.red,fontWeight:700,letterSpacing:1.5,fontFamily:T.sans,marginBottom:8}}>↓ FALLING</div>
                    {fallers.map((p,i)=>(
                      <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:0,cursor:"pointer",marginBottom:4}}>
                        <TeamBadge abbr={p.team} size={24} logo={p.teamLogo}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink}}>{p.name}</div>
                          <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{p.context}</div>
                        </div>
                        <div style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.red}}>{p.delta}</div>
                      </div>
                    ))}
                  </div>}
                </div>
              </div>;
            })()}

            {/* Top 3 Season Rated */}
            {srView==="table"&&top3.length>=3&&<div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
              {top3.map((p,i)=>(
                <div key={p.id} onClick={()=>setSel(p)} style={{
                  background:T.surface,border:`1px solid ${i===0?T.gold+"40":T.border}`,borderRadius:0,padding:"18px 16px",
                  cursor:"pointer",transition:"box-shadow .2s",boxShadow:i===0?"0 2px 12px rgba(182,141,64,.15)":"none",
                  borderTop:i===0?`3px solid ${T.gold}`:i===1?`3px solid ${T.green}`:i===2?`3px solid ${T.blue}`:"none",
                }} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow=i===0?"0 2px 12px rgba(182,141,64,.15)":"none"}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <span style={{fontFamily:T.display,fontWeight:900,fontSize:22,color:i===0?T.gold:i===1?T.green:T.blue}}>{i+1}</span>
                    <TeamBadge abbr={p.team} size={36} logo={p.teamLogo}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:T.ink}}>{p.name}</div>
                      <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team}</div>
                    </div>
                    <span style={{fontFamily:T.display,fontWeight:700,fontSize:30,color:gc(p.seasonGrade),lineHeight:1}}>{p.seasonGrade}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                    <div style={{textAlign:"center",padding:"6px 4px",background:T.card,borderRadius:0}}>
                      <div style={{fontFamily:T.mono,fontSize:12,fontWeight:700,color:formColor(p.formTrend)}}>{formIcon(p.formTrend)}</div>
                      <div style={{fontSize:10,color:T.textMute,letterSpacing:.5,marginTop:2}}>FORM</div>
                    </div>
                    <div style={{textAlign:"center",padding:"6px 4px",background:T.card,borderRadius:0}}>
                      <div style={{fontFamily:T.mono,fontSize:12,fontWeight:700,color:T.ink}}>{p.consistency}%</div>
                      <div style={{fontSize:10,color:T.textMute,letterSpacing:.5,marginTop:2}}>CONSIST</div>
                    </div>
                    <div style={{textAlign:"center",padding:"6px 4px",background:T.card,borderRadius:0}}>
                      <div title={p.impactReduced?"Reduced inputs \u2014 "+(p.impactMissing||[]).join(", ")+" unavailable this season":undefined} style={{fontFamily:T.mono,fontSize:12,fontWeight:700,color:T.ink}}>{sv(p.impactPer90)}{p.impactReduced?"*":""}</div>
                      <div style={{fontSize:10,color:T.textMute,letterSpacing:.5,marginTop:2}}>IMP/90</div>
                    </div>
                    <div style={{textAlign:"center",padding:"6px 4px",background:T.card,borderRadius:0}}>
                      <div style={{fontFamily:T.serif,fontSize:12,fontWeight:700,color:profileColor(p.profile)}}>{p.profile.slice(0,3).toUpperCase()}</div>
                      <div style={{fontSize:10,color:T.textMute,letterSpacing:.5,marginTop:2}}>TYPE</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>}

            {/* Filters */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <Select label="Position" value={srPosFilter} onChange={setSrPosFilter} width={130} options={["All","Forward","Midfielder","Defender","GK"]}/>
              <Select label="Team" value={srTeamFilter} onChange={setSrTeamFilter} width={200} options={teamOpts}/>
              <Select label="Min. Mins" value={String(srMinMins)} onChange={v=>setSrMinMins(Number(v))} width={110} options={[["0","All"],["200","200+"],["400","400+"],["600","600+"],["900","900+"],["1200","1200+"]]}/>
              <Select label="Sort" value={srSort} onChange={v=>{setSrSort(v);setSrDir(v==="age"?"asc":"desc");}} width={150} options={[["seasonGrade","Season Grade"],["consistency","Consistency"],["impactPer90","Impact/90"],["goals","Goals"],["assists","Assists"],["overall","Match Grade"],["age","Age"]]}/>
            </div>

            {/* ── TABLE VIEW ── */}
            {srView==="table"&&<TableWrap><div>
              {(()=>{const srTbl=isMobile?"28px 1fr 42px 32px 38px 38px 42px":"30px 1fr 56px 80px 50px 50px 60px 60px 64px";return <>
              {isMobile?<MobileSortBar options={[["seasonGrade","Season"],["goals","G"],["assists","A"],["consistency","Consistency"],["impactPer90","Impact/90"],["totalGA","G+"]]} sortKey={srSort} sortDir={srDir} onSort={toggleSrSort}/>:<div style={{display:"grid",gridTemplateColumns:srTbl,padding:"10px 14px",background:T.card,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}>
                <div style={{textAlign:"center"}}>#</div><div>Player</div>
                <ColHead label="SZN" sortKey="seasonGrade" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>
                <div style={{textAlign:"center"}}>{isMobile?"Form":"Form Curve"}</div>
                <ColHead label="G" sortKey="goals" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>
                <ColHead label="A" sortKey="assists" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>
                <ColHead label={isMobile?"Con":"Consist"} sortKey="consistency" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>
                {!isMobile&&<ColHead label="Imp/90" sortKey="impactPer90" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>}
                {!isMobile&&<ColHead label="G+" sortKey="totalGA" currentSort={srSort} currentDir={srDir} onSort={toggleSrSort} center/>}
              </div>}
              {srFiltered.map((p,i)=>isMobile?<MobileStatCard key={p.id} p={p} i={i} grade={p.seasonGrade} gradeLabel="Season" rankColor={i<3?T.gold:i<10?T.green:T.textMute} sub={`${p.position} \u00b7 ${p.team} \u00b7 ${p.mins} min${(p.mins||0)<450?" \u00b7 PROV":""}`} stats={[["G",p.goals],["A",p.assists],["Con",p.consistency],["Imp/90",p.impactPer90],["G+",(+p.totalGA>=0?"+":"")+p.totalGA,+p.totalGA>=0?T.green:T.red]]} onOpen={()=>setSel(p)}/>:<div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"grid",gridTemplateColumns:srTbl,padding:isMobile?"8px 6px":"14px 14px",minHeight:isMobile?40:48,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,alignItems:"center",cursor:"pointer",animation:`fadeUp .25s ease both`,animationDelay:`${Math.min(i*12,250)}ms`}}>
                <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:i<3?T.gold:i<10?T.green:T.textMute,textAlign:"center"}}>{i+1}</div>
                <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginLeft:isMobile?0:6,minWidth:0}}>
                  <TeamBadge abbr={p.team} size={isMobile?24:36} logo={p.teamLogo}/>
                  <div style={{minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:20,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}</span>
                      {!isMobile&&(p.mins||0)<450&&<span style={{fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 5px",borderRadius:0,letterSpacing:.5,flexShrink:0}}>PROV</span>}
                    </div>
                    <div style={{fontSize:isMobile?11.5:14,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.position} · {p.team} · {p.mins} min</div>
                  </div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:gb(p.seasonGrade),border:`1.5px solid ${gc(p.seasonGrade)}30`,borderRadius:0,padding:isMobile?"2px 7px":"4px 10px",minWidth:isMobile?34:40}}>
                    <span style={{color:gc(p.seasonGrade),fontWeight:700,fontSize:isMobile?14:17,fontFamily:T.serif,letterSpacing:-.5,lineHeight:1}}>{p.seasonGrade}</span>
                  </div>
                </div>
                <div style={{textAlign:"center",fontFamily:T.mono,fontWeight:700,fontSize:isMobile?12:14,color:formColor(p.formTrend),display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {isMobile?formIcon(p.formTrend):<span style={{display:"inline-flex",alignItems:"center",gap:6}}><MiniSpark data={genFormCurve(p)} width={68} height={22} color={gc(p.seasonGrade)}/><span style={{fontSize:12}}>{formIcon(p.formTrend)}</span></span>}
                </div>
                <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:T.ink,background:hm(p.goals,20),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{p.goals}</div>
                <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:T.ink,background:hm(p.assists,15),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{sv(p.assists)}</div>
                <div style={{textAlign:"center"}}>
                  <span style={{fontFamily:T.mono,fontWeight:600,fontSize:isMobile?12:12,color:p.consistency>=80?T.green:p.consistency>=60?T.blue:T.red,background:`${p.consistency>=80?T.green:p.consistency>=60?T.blue:T.red}10`,padding:"2px 6px",borderRadius:0}}>{p.consistency}%</span>
                </div>
                {!isMobile&&<div title={p.impactReduced?"Reduced inputs \u2014 "+(p.impactMissing||[]).join(", ")+" unavailable this season":undefined} style={{fontSize:13,color:T.ink,fontWeight:600,fontFamily:T.mono,textAlign:"center"}}>{sv(p.impactPer90)}{p.impactReduced?"*":""}</div>}
                {!isMobile&&<div style={{fontSize:14,color:+p.totalGA>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono,textAlign:"center"}}>{+p.totalGA>=0?"+":""}{p.totalGA}</div>}
              </div>)}
              </>})()}
            </div></TableWrap>}

            {/* ── POSITION VIEW ── */}
            {srView==="position"&&(()=>{
              // Build position groups from filtered data
              const filteredByPos={};srFiltered.forEach(p=>{if(!filteredByPos[p.posGroup])filteredByPos[p.posGroup]=[];filteredByPos[p.posGroup].push(p);});
              Object.values(filteredByPos).forEach(arr=>arr.sort((a,b)=>b.seasonGrade-a.seasonGrade));
              return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
              {Object.entries(filteredByPos).sort(([a],[b])=>({FW:0,MF:1,DF:2,GK:3}[a]||4)-({FW:0,MF:1,DF:2,GK:3}[b]||4)).map(([pos,posPlayers])=>{
                const posLabel={FW:"Forwards",MF:"Midfielders",DF:"Defenders",GK:"Goalkeepers"}[pos]||pos;
                const posAvg=Math.round(posPlayers.reduce((s,p)=>s+p.seasonGrade,0)/posPlayers.length);
                return <div key={pos} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                  <div style={{padding:"16px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink}}>{posLabel}</div>
                      <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>{posPlayers.length} players · Avg {posAvg}</div>
                    </div>
                    <Badge grade={posAvg} size="md"/>
                  </div>
                  {posPlayers.map((p,i)=>(
                    <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                      <div style={{fontFamily:T.display,fontWeight:900,fontSize:16,color:i<3?T.gold:i<10?T.green:T.textMute,width:22,textAlign:"center"}}>{i+1}</div>
                      <TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontFamily:T.serif,fontWeight:600,fontSize:14,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
                          {(p.mins||0)<450&&<span style={{fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 5px",borderRadius:0,letterSpacing:.5,flexShrink:0}}>PROV</span>}
                        </div>
                        <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.team} · {p.gamesPlayed} apps · {p.mins} min</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:T.mono,fontWeight:700,fontSize:12,color:formColor(p.formTrend)}}>{formIcon(p.formTrend)}</span>
                        <span style={{fontFamily:T.mono,fontSize:11.5,color:p.consistency>=70?T.green:T.textDim}}>{p.consistency}%</span>
                        <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:gb(p.seasonGrade),border:`1.5px solid ${gc(p.seasonGrade)}30`,borderRadius:0,padding:"2px 8px",minWidth:36}}>
                          <span style={{color:gc(p.seasonGrade),fontWeight:700,fontSize:15,fontFamily:T.serif,lineHeight:1}}>{p.seasonGrade}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>;
              })}
            </div>;})()}

            {/* ── TIERS VIEW ── */}
            {srView==="tiers"&&(()=>{
              const filteredTiers=[
                {label:"ELITE",min:85,color:T.gold,players:srFiltered.filter(p=>p.seasonGrade>=85)},
                {label:"GREAT",min:75,color:T.green,players:srFiltered.filter(p=>p.seasonGrade>=75&&p.seasonGrade<85)},
                {label:"ABOVE AVG",min:65,color:T.blue,players:srFiltered.filter(p=>p.seasonGrade>=65&&p.seasonGrade<75)},
                {label:"AVERAGE",min:55,color:T.textDim,players:srFiltered.filter(p=>p.seasonGrade>=55&&p.seasonGrade<65)},
                {label:"POOR",min:0,color:T.red,players:srFiltered.filter(p=>p.seasonGrade<55)},
              ];
              return <div>
              {/* Tier distribution bar */}
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"20px 24px",marginBottom:20}}>
                <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:14}}>Grade Distribution · {srFiltered.length} Players</div>
                <div style={{display:"flex",height:32,borderRadius:0,overflow:"hidden",marginBottom:12}}>
                  {filteredTiers.filter(t=>t.players.length>0).map(t=>(
                    <div key={t.label} style={{flex:t.players.length,background:t.color,opacity:.7,display:"flex",alignItems:"center",justifyContent:"center",minWidth:24,transition:"flex .4s ease"}}>
                      <span style={{fontSize:11.5,fontWeight:700,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,.3)",fontFamily:T.sans}}>{t.players.length}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
                  {filteredTiers.map(t=>(
                    <div key={t.label} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:10,height:10,borderRadius:0,background:t.color,opacity:.7}}/>
                      <span style={{fontSize:11.5,fontFamily:T.sans,fontWeight:600,color:T.textDim}}>{t.label} ({t.players.length})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tier groups */}
              {filteredTiers.filter(t=>t.players.length>0).map(tier=>(
                <div key={tier.label} style={{marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:4,height:24,borderRadius:0,background:tier.color}}/>
                    <span style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:tier.color}}>{tier.label}</span>
                    <span style={{fontSize:12,color:T.textMute,fontFamily:T.sans}}>{tier.players.length} player{tier.players.length!==1?"s":""}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                    {tier.players.map(p=>(
                      <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,cursor:"pointer"}}>
                        <TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <span style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
                            {(p.mins||0)<450&&<span style={{fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 5px",borderRadius:0,letterSpacing:.5,flexShrink:0}}>PROV</span>}
                          </div>
                          <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team} · #{p.posRank} {p.posGroup} · {p.mins} min</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontFamily:T.mono,fontWeight:700,fontSize:12,color:formColor(p.formTrend)}}>{formIcon(p.formTrend)}</span>
                          <span style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:gc(p.seasonGrade)}}>{p.seasonGrade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>;})()}

            {/* How Season Rating Works */}
            <div style={{marginTop:28,padding:"18px 22px",background:T.card,border:`1px solid ${T.borderLt}`,borderRadius:0}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:700,letterSpacing:2,fontFamily:T.sans,marginBottom:8}}>HOW SEASON RATING WORKS</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,lineHeight:1.7}}>
                The Season Rating is a cumulative performance index built from real match-level data. When per-game boxscore data is available (via ESPN), each player gets a per-match rating based on goals (+12), assists (+8), shots on target (+2), shots (+0.5), minutes played, fouls (-1), cards (-3/-10). The form sparkline shows this real game-by-game trajectory. The cumulative grade combines the weighted composite of all six grade categories (30% Overall, 15% Attack, 15% Passing, 15% Defense, 12.5% Creativity, 12.5% Carrying), plus bonuses for Goals Added contribution, minutes durability, and goal involvement. Players with fewer than 450 minutes are tagged as provisional (PROV). Use the Min. Mins filter to focus on established starters or see the full roster.{SEASON_ASSISTS_OK[season]===false?" This season's source carries no real assist counts, so the goal-involvement term is computed from goals alone and Impact/90 omits its assist term. Nothing is substituted for the missing value — the figures on this page are therefore built from fewer inputs than a season where assists exist, and are marked with an asterisk where that applies.":""}
              </div>
            </div>
          </div>;
        })()}

        {/* ═══ DEFENSE ═══════════════════════════════════════════════════════ */}
        {!loading&&tab==="defense"&&(()=>{const c=POS[posFilter];const defData=[...players].filter(p=>(!c||c.includes(p.position))&&(teamFilter==="All"||p.team===teamFilter)&&(p.mins||0)>=minMins).sort((a,b)=>{const dir=sortDir==="asc"?1:-1;if(sortKey==="age")return dir*(parseFloat(a.age||99)-parseFloat(b.age||99));const av=Number(a[sortKey])||0,bv=Number(b[sortKey])||0;return dir*(av-bv);}).slice(0,100);
          return <div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Defensive Leaders</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Tackles, pressures, interceptions, and aerial duels. Ranked by defensive output across all positions.</div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <Select label="Position" value={posFilter} onChange={setPosFilter} width={130} options={["All","Forward","Midfielder","Defender","GK"]}/>
            <Select label="Team" value={teamFilter} onChange={setTeamFilter} width={200} options={teamOpts}/>
            <Select label="Min. Mins" value={String(minMins)} onChange={v=>setMinMins(Number(v))} width={100} options={[["0","All"],["200","200+"],["400","400+"],["600","600+"],["900","900+"]]}/>
          </div>
          <TopCards players={defData} metric={p=>p.tackles||0} metricLabel="TACKLES" onSelect={setSel}/>
          <TableWrap><div>
            {(()=>{const defTbl=isMobile?"24px 1fr 38px 42px 42px 42px 42px":"24px 1fr 46px 46px 46px 52px 54px 48px 46px 56px 52px";return <>
            {isMobile?<MobileSortBar options={[["defense","Def"],["tackles","Tkl"],["tacklePct","Tk%"],["aerialPct","Aer%"],["pressures","Prs"],["clearances","Clr"],["fouls","Fls"],["totalGA","G+"]]} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>:<div style={{display:"grid",gridTemplateColumns:defTbl,padding:"10px 14px",background:T.card,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}><div style={{textAlign:"center"}}>#</div><div>Player</div><ColHead label="Def" sortKey="defense" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/><ColHead label="Tkl" sortKey="tackles" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>{!isMobile&&<ColHead label="Tk%" sortKey="tacklePct" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}<ColHead label="Aer%"/*3B2*/ sortKey="aerialPct" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/><ColHead label="Prs" sortKey="pressures" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>{!isMobile&&<ColHead label="Clr" sortKey="clearances" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}{!isMobile&&<ColHead label="Fls" sortKey="fouls" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}{!isMobile&&<div style={{textAlign:"center"}}>YC/RC</div>}<ColHead label="G+" sortKey="totalGA" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/></div>}
            {defData.map((p,i)=>isMobile?<MobileStatCard key={p.id} p={p} i={i} grade={p.defense} gradeLabel="Def" sub={`${p.position} \u00b7 ${p.team}`} stats={[["Tkl",p.tackles],["Tk%",p.tacklePct!=null?p.tacklePct+"%":null],["Aer%",p.aerialPct!=null?p.aerialPct+"%":null],["Prs",p.pressures],["Clr",p.clearances],["Fls",p.fouls],["YC/RC",(p.yellowCards??0)+"/"+(p.redCards??0)],["G+",(+p.totalGA>=0?"+":"")+p.totalGA,+p.totalGA>=0?T.green:T.red]]} onOpen={()=>setSel(p)}/>:<div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"grid",gridTemplateColumns:defTbl,padding:isMobile?"10px 10px":"14px 14px",minHeight:isMobile?40:48,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,alignItems:"center",cursor:"pointer"}}>
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:i<3?T.accent:T.textMute,textAlign:"center"}}>{i+1}</div>
              <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginLeft:isMobile?0:6,minWidth:0}}><TeamBadge abbr={p.team} size={isMobile?24:36} logo={p.teamLogo}/><div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:20,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}</div><div style={{fontSize:isMobile?11.5:14,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.position} · {p.team}</div></div></div>
              <div style={{textAlign:"center"}}><Badge grade={p.defense} size={isMobile?"sm":"md"}/></div><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:T.ink,textAlign:"center"}}>{p.tackles!=null?p.tackles:"—"}</div>{!isMobile&&<div style={{fontSize:13,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{p.tacklePct!=null?p.tacklePct+"%":"—"}</div>}
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:T.ink,background:hm(p.aerialPct,100),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{p.aerialPct!=null?p.aerialPct+"%":"—"}</div>
              <div style={{fontSize:isMobile?13:15,color:T.ink,fontWeight:600,background:hm(p.pressures,300),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{sv(p.pressures)}</div>
              {!isMobile&&<div style={{fontSize:14,color:T.textDim,background:hm(p.clearances,40),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{sv(p.clearances)}</div>}
              {!isMobile&&<div style={{fontSize:13,color:T.textDim,textAlign:"center"}}>{sv(p.fouls)}</div>}
              {!isMobile&&<div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center"}}><div style={{width:8,height:10,borderRadius:0,background:"#E8C94A"}}/><span style={{fontSize:12}}>{sv(p.yellowCards)}</span><div style={{width:8,height:10,borderRadius:0,background:T.red}}/><span style={{fontSize:12}}>{sv(p.redCards)}</span></div>}
              <div style={{fontSize:isMobile?12:14,color:+p.totalGA>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono,textAlign:"center"}}>{+p.totalGA>=0?"+":""}{p.totalGA}</div>
            </div>)}
            </>})()}
          </div></TableWrap>
        </div>})()}

        {/* ═══ PASSING ═══════════════════════════════════════════════════════ */}
        {!loading&&tab==="passing"&&(()=>{const c=POS[posFilter];const passData=[...players].filter(p=>+p.passComp>0&&(!c||c.includes(p.position))&&(teamFilter==="All"||p.team===teamFilter)&&(p.mins||0)>=Math.max(minMins,200)).sort((a,b)=>{const dir=sortDir==="asc"?1:-1;if(sortKey==="age")return dir*(parseFloat(a.age||99)-parseFloat(b.age||99));const av=Number(a[sortKey])||0,bv=Number(b[sortKey])||0;return dir*(av-bv);}).slice(0,100);
          return <div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Passing Analytics</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Completion rate, expected completion, progressive passes, and passing Goals Added. Compares actual vs expected to find passers who beat the model.</div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <Select label="Position" value={posFilter} onChange={setPosFilter} width={130} options={["All","Forward","Midfielder","Defender","GK"]}/>
            <Select label="Team" value={teamFilter} onChange={setTeamFilter} width={200} options={teamOpts}/>
            <Select label="Min. Mins" value={String(minMins)} onChange={v=>setMinMins(Number(v))} width={100} options={[["0","All"],["200","200+"],["400","400+"],["600","600+"],["900","900+"]]}/>
          </div>
          <TopCards players={passData} metric={p=>p.passComp+"%"} metricLabel="COMPLETION" onSelect={setSel}/>
          <TableWrap><div>
            {(()=>{const passTbl=isMobile?"24px 1fr 40px 56px 52px 46px":"24px 1fr 48px 68px 68px 68px 56px 56px 56px";return <>
            {isMobile?<MobileSortBar options={[["passing","Pass"],["passComp","Comp%"],["prgPasses","PrgP"],["ftPasses","F3rd"],["totalGA","G+"]]} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>:<div style={{display:"grid",gridTemplateColumns:passTbl,padding:"10px 14px",background:T.card,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}><div style={{textAlign:"center"}}>#</div><div>Player</div><ColHead label="Pass" sortKey="passing" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/><ColHead label="Comp%" sortKey="passComp" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>{!isMobile&&<div style={{textAlign:"center"}}>xComp%</div>}<div style={{textAlign:"center"}}>{isMobile?"±Exp":"vs Exp"}</div>{!isMobile&&<ColHead label="PrgP" sortKey="prgPasses" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}{!isMobile&&<ColHead label="F3rd" sortKey="ftPasses" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}<ColHead label="G+" sortKey="totalGA" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/></div>}
            {passData.map((p,i)=>{const ae=Number(p.passAboveExp);return isMobile?<MobileStatCard key={p.id} p={p} i={i} grade={p.passing} gradeLabel="Pass" sub={`${p.position} \u00b7 ${p.team}`} stats={[["Comp",p.passComp+"%"],["xComp",p.xPassComp+"%"],["vs Exp",p.passAboveExp!=null?(ae>=0?"+":"")+p.passAboveExp+"%":null,ae>=0?T.green:T.red],["KP",p.keyPasses],["F3rd",p.ftPasses],["Pass G+",(+p.passGA>=0?"+":"")+p.passGA,+p.passGA>=0?T.green:T.red]]} onOpen={()=>setSel(p)}/>:<div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"grid",gridTemplateColumns:passTbl,padding:isMobile?"10px 10px":"14px 14px",minHeight:isMobile?40:48,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,alignItems:"center",cursor:"pointer"}}>
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:i<3?T.accent:T.textMute,textAlign:"center"}}>{i+1}</div>
              <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginLeft:isMobile?0:6,minWidth:0}}><TeamBadge abbr={p.team} size={isMobile?24:36} logo={p.teamLogo}/><div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:20,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}</div><div style={{fontSize:isMobile?11.5:14,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.position} · {p.team}</div></div></div>
              <div style={{textAlign:"center"}}><Badge grade={p.passing} size={isMobile?"sm":"md"}/></div>
              <div style={{fontSize:isMobile?12:14,color:T.ink,fontFamily:T.mono,fontWeight:600,background:hm(+p.passComp,100),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{p.passComp}%</div>
              {!isMobile&&<div style={{fontSize:12,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{p.xPassComp}%</div>}
              <div style={{fontSize:isMobile?12:12,color:ae>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono,textAlign:"center"}}>{ae>=0?"+":""}{p.passAboveExp||"—"}%</div>
              {!isMobile&&<div style={{fontSize:13,color:T.ink,fontWeight:600,background:hm(p.prgPasses,120),borderRadius:0,textAlign:"center",padding:"2px 0"}}>{sv(p.keyPasses)}</div>}
              {!isMobile&&<div style={{fontSize:12,color:T.textDim,textAlign:"center"}}>{sv(p.ftPasses)}</div>}
              <div style={{fontSize:isMobile?12:12,color:+p.passGA>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono,textAlign:"center"}}>{+p.passGA>=0?"+":""}{p.passGA}</div>
            </div>;})}
            </>})()}
          </div></TableWrap>
        </div>})()}

        {/* ═══ TEAMS ═════════════════════════════════════════════════════════ */}
        {!loading&&tab==="teams"&&<div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>{season} Team Analytics{isArchiveSeason&&<span style={{marginLeft:10,fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"3px 7px",letterSpacing:1,verticalAlign:"middle"}}>ARCHIVE</span>}</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Composite team grades averaged across each {season} roster. Click to expand team stats and full roster breakdowns.</div>
          </div>
          {isArchiveSeason&&<div role="note" style={{marginBottom:16,padding:"10px 14px",border:`1px dashed ${T.border}`,borderLeft:`3px solid ${T.accent}`,background:T.surface,fontFamily:T.sans,fontSize:12,color:T.textDim,lineHeight:1.55}}>
            <b style={{color:T.ink}}>Archive · {season}.</b> Club grades are built from the {season} record only. Metrics that season{"\u2019"}s sources never carried show as {"\u2014"} rather than zero, and current-season features {"\u2014"} freshness, ranking movement and pipeline status {"\u2014"} are not shown here because they describe a different season.
          </div>}
          <div style={{marginBottom:16}}><Select label="Conference" value={confFilter} onChange={setConfFilter} width={150} options={["All","Eastern","Western"]}/>
            </div>
          <TableWrap><div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"26px 1fr 46px 66px 22px":"36px 1fr 50px 52px 80px 36px",padding:isMobile?"8px 8px":"10px 14px",background:T.card,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}><div>Rk</div><div>Team</div><ColHead label="Grade" sortKey="overall" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>{!isMobile&&<ColHead label="Plrs" sortKey="count" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}<ColHead label={isMobile?"Value":"Squad Val"} sortKey="squadValue" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/><div></div></div>
            {enrichedTeams.filter(t=>confFilter==="All"||t.conf===confFilter).sort((a,b)=>{const dir=sortDir==="asc"?1:-1;const av=Number(a[sortKey])||0,bv=Number(b[sortKey])||0;return dir*(av-bv);}).map((t,i)=>{
              const isOpen=expandTeam===t.abbr;
              const level=isOpen?teamLevel:0;
              const rosterTbl="1fr 40px 44px 36px 36px 48px 48px 42px 42px 50px";
              const rosterRaw=players.filter(p=>p.team===t.abbr&&!p.departed);
              const dir=rosterDir==="asc"?1:-1;
              const roster=[...rosterRaw].sort((a,b)=>{if(rosterSort==="age")return dir*(parseFloat(a.age||99)-parseFloat(b.age||99));const av=parseFloat(a[rosterSort])||a[rosterSort]||0,bv=parseFloat(b[rosterSort])||b[rosterSort]||0;return dir*(av-bv);});

              return <div key={t.abbr}>
                {/* Team row */}
                <div onClick={()=>toggleTeam(t.abbr)} className="rh" style={{display:"grid",gridTemplateColumns:isMobile?"26px 1fr 46px 66px 22px":"36px 1fr 50px 52px 80px 36px",padding:isMobile?"12px 8px":"14px 16px",borderBottom:`1px solid ${isOpen?T.border:T.borderLt}`,alignItems:"center",cursor:"pointer",background:isOpen?T.card:"transparent"}}>
                  <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:i<3?T.accent:T.textMute}}>{i+1}</div>
                  <div style={{display:"flex",alignItems:"center",gap:isMobile?8:10,minWidth:0}}><TeamBadge abbr={t.abbr} size={isMobile?26:34} logo={teamLogos[t.abbr]}/><div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?14:18,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div><div style={{fontSize:isMobile?11.5:12,color:T.textDim,fontFamily:T.sans}}>{t.conf}{isMobile?` \u00b7 ${t.count} players`:""}</div></div></div>
                  <div style={{textAlign:"center"}}><Badge grade={t.overall} size="md"/></div>
                  {!isMobile&&<div style={{fontSize:12,color:T.textDim,textAlign:"center"}}>{t.count}</div>}
                  <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:vc(t.squadValue),textAlign:"center"}}>{t.squadValue>0?fv(t.squadValue):"—"}</div>
                  <div style={{fontSize:11.5,color:T.textMute,textAlign:"center"}}>{level===2?"▲":level===1?"▼▼":"▼"}</div>
                </div>

                {/* Level 1: Team stats */}
                {isOpen&&level>=1&&<div style={{background:T.card,padding:"16px 20px",borderBottom:level===1?`2px solid ${T.border}`:"none",animation:"fadeUp .2s ease"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase"}}>{t.name} · Team Overview</div>
                    <div style={{fontSize:11,color:T.accent,fontWeight:600,fontFamily:T.sans,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setTeamLevel(2);}}>View Roster →</div>
                  </div>

                  {/* Grade boxes */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:16}}>
                    {[{l:"Overall",g:t.overall},{l:"Attack",g:t.attack},{l:"Passing",g:t.passing},{l:"Defense",g:t.defense},{l:"Creative",g:t.creativity},{l:"Carry",g:t.carrying}].map(r=>(
                      <div key={r.l} style={{background:T.bg,border:`1px solid ${T.borderLt}`,borderRadius:0,padding:"12px",textAlign:"center"}}>
                        <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:gc(r.g),lineHeight:1}}>{r.g}</div>
                        <div style={{fontSize:10,color:gc(r.g),fontWeight:600,letterSpacing:1,marginTop:3,textTransform:"uppercase"}}>{gl(r.g)}</div>
                        <div style={{fontSize:11,color:T.textMute,marginTop:2,fontFamily:T.sans}}>{r.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Key stats row */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(92px,1fr))",gap:8}}>
                    {[
                      {l:`Grade rank ${season}`,v:teamRank.ranks[t.abbr]?`#${teamRank.ranks[t.abbr].rank}`:"—",c:T.ink,t:teamRank.ranks[t.abbr]?`#${teamRank.ranks[t.abbr].rank} of ${teamRank.ranks[t.abbr].of} graded clubs by Team Grade in ${season}`:null},/*6C-TEAMRANKTILE*/
                      {l:"Total Goals",v:t.totalGoals,c:T.ink},
                      {l:"Total Assists",v:sv(t.totalAssists),c:T.ink,t:t.totalAssists==null?"No assist data in this season's source \u2014 unavailable, not zero":null},/*6B.1-TEAMA*/
                      {l:"Avg Age",v:t.avgAge||"—",c:T.textDim},
                      {l:"Total Tackles",v:t.totalTackles,c:T.ink},
                      {l:"Squad Value",v:fv(t.squadValue),c:vc(t.squadValue)},
                      {l:"Players",v:t.count,c:T.textDim},
                    ].map(s=>(
                      <div key={s.l} title={s.t||undefined} style={{textAlign:"center",padding:"8px 4px",background:T.bg,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:s.c,lineHeight:1}}>{s.v}</div>
                        <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.8,marginTop:4,fontFamily:T.sans,textTransform:"uppercase"}}>{s.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Standout players */}
                  {(t.topScorer||t.topRated)&&<div style={{display:"flex",gap:12,marginTop:14}}>
                    {t.topRated&&<div style={{flex:1,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:T.bg,borderRadius:0,border:`1px solid ${T.borderLt}`,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSel(t.topRated);}}>
                      <div style={{width:4,height:24,borderRadius:0,background:gc(t.topRated.overall)}}/>
                      <div style={{flex:1}}><div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans}}>TOP RATED</div><div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink}}>{t.topRated.name}</div></div>
                      <Badge grade={t.topRated.overall} rated={t.topRated.rated} size="sm"/>
                    </div>}
                    {t.topScorer&&t.topScorer.id!==t.topRated?.id&&<div style={{flex:1,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:T.bg,borderRadius:0,border:`1px solid ${T.borderLt}`,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSel(t.topScorer);}}>
                      <div style={{width:4,height:24,borderRadius:0,background:T.accent}}/>
                      <div style={{flex:1}}><div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans}}>TOP SCORER</div><div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink}}>{t.topScorer.name}</div></div>
                      <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:T.ink}}>{t.topScorer.goals}G</div>
                    </div>}
                  </div>}
                </div>}

                {/* Level 2: Full sortable roster */}
                {isOpen&&level===2&&<div style={{background:T.card,borderBottom:`2px solid ${T.border}`,padding:"12px 16px",animation:"fadeUp .2s ease"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase"}}>{t.name} Roster · {roster.length} Players</div>
                    <div style={{fontSize:11,color:T.accent,fontWeight:600,fontFamily:T.sans,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setTeamLevel(1);}}>← Back to Stats</div>
                  </div>
                  {roster.length===0?<div style={{padding:16,textAlign:"center",color:T.textDim,fontSize:12,fontStyle:"italic"}}>No players loaded</div>
                  :<div className="roster-scroll" style={{overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch"}}><div style={{minWidth:isMobile?600:0}}>
                    <div style={{display:"grid",gridTemplateColumns:rosterTbl,fontSize:12,color:T.textMute,fontWeight:600,letterSpacing:.8,fontFamily:T.sans,textTransform:"uppercase",padding:"6px 8px",borderBottom:`1px solid ${T.borderLt}`,marginBottom:2}}>
                      <div>Player</div>
                      <ColHead label="Grd" sortKey="overall" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="Age" sortKey="age" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort} center/>
                      <ColHead label="G" sortKey="goals" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="A" sortKey="assists" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="Pass%" sortKey="passComp" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="Clr" sortKey="clearances" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="Fls" sortKey="fouls" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <ColHead label="G+" sortKey="totalGA" currentSort={rosterSort} currentDir={rosterDir} onSort={toggleRosterSort}/>
                      <div>Value</div>
                    </div>
                    {roster.map(p=>(
                      <div key={p.id} onClick={e=>{e.stopPropagation();setSel(p);}} className="rh" style={{display:"grid",gridTemplateColumns:rosterTbl,padding:"7px 8px",alignItems:"center",cursor:"pointer",borderBottom:`1px solid ${T.borderLt}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:4,height:4,borderRadius:"50%",background:gc(p.overall),flexShrink:0}}/>
                          <div><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink}}>{p.name}</div><div style={{fontSize:10,color:T.textMute}}>{p.position}</div></div>
                        </div>
                        <Badge grade={p.overall} rated={p.rated} size="sm"/>
                        <div style={{fontSize:12,color:T.textDim,fontFamily:T.mono,textAlign:"center"}}>{p.age||"—"}</div>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:12,color:T.ink}}>{p.goals}</div>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:12,color:T.ink}}>{sv(p.assists)}</div>
                        <div style={{fontSize:12,color:T.textDim,fontFamily:T.mono}}>{p.passComp}%</div>
                        <div style={{fontSize:11.5,color:T.ink,fontWeight:600}}>{sv(p.clearances)}</div>
                        <div style={{fontSize:12,color:T.textDim}}>{sv(p.fouls)}</div>
                        <div style={{fontSize:11.5,color:+p.totalGA>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono}}>{+p.totalGA>=0?"+":""}{p.totalGA}</div>
                        <div style={{fontSize:11.5,color:vc(p.marketValue),fontFamily:T.serif,fontWeight:600}}>{fv(p.marketValue)}</div>
                      </div>
                    ))}
                  </div></div>}
                </div>}
              </div>;
            })}
          </div></TableWrap>

          {/* Head-to-Head Preview */}
          <div style={{marginTop:24,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"20px 24px"}}>
            <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:4}}>Head-to-Head Preview</div>
            <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,marginBottom:16}}>Pick two teams to compare grade matchups, key player battles, and predicted advantages.</div>
            <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
              <Select label="Home" value={h2hHome} onChange={setH2hHome} width={200} options={[["","Select team"],...MLS_TEAMS.map(t=>[t.abbr,t.name])]}/>
              <span style={{fontFamily:T.display,fontWeight:900,fontSize:18,color:T.textMute}}>vs</span>
              <Select label="Away" value={h2hAway} onChange={setH2hAway} width={200} options={[["","Select team"],...MLS_TEAMS.map(t=>[t.abbr,t.name])]}/>
            </div>
            {h2hHome&&h2hAway&&h2hHome!==h2hAway&&(()=>{
              const tH=enrichedTeams.find(t=>t.abbr===h2hHome);
              const tA=enrichedTeams.find(t=>t.abbr===h2hAway);
              if(!tH||!tA)return null;
              const cats=[{l:"Overall",k:"overall"},{l:"Attack",k:"attack"},{l:"Passing",k:"passing"},{l:"Defense",k:"defense"},{l:"Creativity",k:"creativity"},{l:"Carrying",k:"carrying"}];
              const hWins=cats.filter(c=>tH[c.k]>tA[c.k]).length;
              const aWins=cats.filter(c=>tA[c.k]>tH[c.k]).length;
              const hRoster=players.filter(p=>p.team===h2hHome&&!p.departed).sort((a,b)=>b.overall-a.overall);
              const aRoster=players.filter(p=>p.team===h2hAway&&!p.departed).sort((a,b)=>b.overall-a.overall);
              const hBestFW=hRoster.find(p=>p.position==="Forward"||p.position==="FW");
              const aBestDF=aRoster.find(p=>p.position==="Defender"||p.position==="DF"||p.position==="DEF");
              const aBestFW=aRoster.find(p=>p.position==="Forward"||p.position==="FW");
              const hBestDF=hRoster.find(p=>p.position==="Defender"||p.position==="DF"||p.position==="DEF");
              const hBestMF=hRoster.find(p=>p.position==="Midfielder"||p.position==="MF");
              const aBestMF=aRoster.find(p=>p.position==="Midfielder"||p.position==="MF");
              const matchup=(pA,pB)=>{
                if(!pA||!pB)return null;
                const aWin=pA.overall>pB.overall;
                return <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                  <div style={{flex:1,textAlign:"right"}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:aWin?T.ink:T.textDim}}>{pA.name.split(" ").slice(-1)[0]}</div><div style={{fontSize:10,color:T.textMute}}>{pA.position}</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:gc(pA.overall)}}>{Math.round(pA.overall)}</span><span style={{fontSize:11,color:T.textMute}}>vs</span><span style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:gc(pB.overall)}}>{Math.round(pB.overall)}</span></div>
                  <div style={{flex:1}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:!aWin?T.ink:T.textDim}}>{pB.name.split(" ").slice(-1)[0]}</div><div style={{fontSize:10,color:T.textMute}}>{pB.position}</div></div>
                </div>;
              };
              return <div>
                <div className="resp-h2h" style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,marginBottom:20,alignItems:"center"}}>
                  <div style={{textAlign:"center",padding:"16px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                    <TeamBadge abbr={tH.abbr} size={48} logo={teamLogos[tH.abbr]}/>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink,marginTop:8}}>{tH.name}</div>
                    <Badge grade={tH.overall} size="md"/>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontFamily:T.display,fontWeight:900,fontSize:28,color:T.textMute}}>VS</div>
                    <div style={{fontSize:11,color:hWins>aWins?T.green:hWins<aWins?T.red:T.textDim,fontFamily:T.sans,fontWeight:700,marginTop:4}}>{hWins>aWins?`${tH.abbr} favored (${hWins}-${aWins})`:hWins<aWins?`${tA.abbr} favored (${aWins}-${hWins})`:`Even (${hWins}-${aWins})`}</div>
                  </div>
                  <div style={{textAlign:"center",padding:"16px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                    <TeamBadge abbr={tA.abbr} size={48} logo={teamLogos[tA.abbr]}/>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink,marginTop:8}}>{tA.name}</div>
                    <Badge grade={tA.overall} size="md"/>
                  </div>
                </div>
                <div style={{marginBottom:20}}>{cats.map(c=>{const hv=tH[c.k],av=tA[c.k];return <div key={c.k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:gc(hv),width:28,textAlign:"right"}}>{hv}</span>
                  <div style={{flex:1,display:"flex",height:10,borderRadius:0,overflow:"hidden",background:T.borderLt}}>
                    <div style={{width:`${(hv/(hv+av))*100}%`,background:hv>=av?T.green:T.red,opacity:.6,borderRadius:"4px 0 0 4px"}}/>
                    <div style={{width:`${(av/(hv+av))*100}%`,background:av>hv?T.green:T.red,opacity:.6,borderRadius:"0 4px 4px 0"}}/>
                  </div>
                  <span style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:gc(av),width:28}}>{av}</span>
                  <span style={{fontSize:11,color:T.textMute,fontFamily:T.sans,width:56}}>{c.l}</span>
                </div>;})}</div>
                <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,marginBottom:10}}>KEY PLAYER BATTLES</div>
                <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{matchup(hBestFW,aBestDF)}{matchup(hBestMF,aBestMF)}{matchup(hBestDF,aBestFW)}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
                  {[{l:"Total Goals",h:tH.totalGoals,a:tA.totalGoals},{l:"Total Assists",h:sv(tH.totalAssists),a:sv(tA.totalAssists)},{l:"Squad Value",h:fv(tH.squadValue),a:fv(tA.squadValue)},{l:"Avg Age",h:tH.avgAge||"—",a:tA.avgAge||"—"}].map(s=>(
                    <div key={s.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:T.card,borderRadius:0}}>
                      <span style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:T.ink}}>{s.h}</span>
                      <span style={{fontSize:11,color:T.textMute,fontFamily:T.sans,fontWeight:600}}>{s.l}</span>
                      <span style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:T.ink}}>{s.a}</span>
                    </div>
                  ))}
                </div>
              </div>;
            })()}
            {h2hHome&&h2hAway&&h2hHome===h2hAway&&<div style={{padding:20,textAlign:"center",color:T.textDim,fontFamily:T.serif,fontStyle:"italic"}}>Pick two different teams</div>}
            {(!h2hHome||!h2hAway)&&<div style={{padding:20,textAlign:"center",color:T.textDim,fontFamily:T.serif,fontStyle:"italic"}}>Select both teams above to see the matchup breakdown</div>}
          </div>
        </div>}

        {/* ═══ POWER RANKINGS ═══════════════════════════════════════════════ */}
        {!loading&&tab==="rankings"&&(()=>{
          const stMap={};standingsData.forEach(s=>{stMap[s.team]=s;});
          const ranked=enrichedTeams.filter(t=>t.count>0&&(confFilter==="All"||t.conf===confFilter)).map(t=>{
            const st=stMap[t.abbr]||{};
            return{...t,pts:st.pts||0,w:st.w||0,dr:st.d||0,l:st.l||0,gf:st.gf||0,ga:st.ga||0,gd:(st.gf||0)-(st.ga||0)};
          }).sort((a,b)=>{
            const dir=sortDir==="asc"?1:-1;
            if(["overall","attack","passing","defense","totalGoals","totalAssists"].includes(sortKey))return compareUnknownLast(a[sortKey],b[sortKey],dir);/*6B.1-SORT*/
            if(b.pts!==a.pts)return b.pts-a.pts;if(b.gd!==a.gd)return b.gd-a.gd;return b.gf-a.gf;
          }).map((t,i)=>({...t,rank:i+1}));
          return <div style={{animation:"fadeUp .4s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>{season} MLS Table{isArchiveSeason&&<span style={{marginLeft:10,fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"3px 7px",letterSpacing:1,verticalAlign:"middle"}}>ARCHIVE</span>}</div>
              <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>{isArchiveSeason?`The ${season} standings as stored in the archive, with that season's composite team grades. Points-based ranking with goal difference and grade overlays.`:"Official MLS standings with composite team grades. Points-based ranking with goal difference and grade overlays."}</div>
            </div>
            {/* 6C: pre-existing mobile defect — two fixed-width selects in a non-wrapping row pushed
                the page 45px wider than a 390px viewport. Wrapping them is the whole fix. */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Select label="Conference" value={confFilter} onChange={setConfFilter} width={130} options={["All","Eastern","Western"]}/>
              <Select label="Sort" value={sortKey} onChange={v=>{setSortKey(v);setSortDir("desc");}} width={140} options={[["pts","By Points"],["overall","By OVR"],["attack","By ATT"],["passing","By PAS"],["defense","By DEF"],["totalGoals","By Goals"],["totalAssists","By Assists"]]}/>
            </div>
          </div>

          {/* Recent Results */}
          {matchesData.length>0&&(()=>{
            const completed=[...matchesData].filter(m=>m.completed).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
            if(!completed.length)return null;
            return <div style={{marginBottom:20,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"16px 20px"}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:12}}>Recent Results</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                {completed.slice(0,16).map((m,i)=>{
                  const hs=+(m.homeScore||0),as=+(m.awayScore||0);
                  const dt=m.date?new Date(m.date):null;
                  const dateStr=dt?fmtET(dt):"";
                  return <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`}}>
                    <div style={{flex:1,textAlign:"right",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                      <span style={{fontFamily:T.sans,fontWeight:hs>as?700:500,fontSize:12,color:hs>as?T.ink:T.textDim}}>{m.home}</span>
                      <TeamBadge abbr={m.home} size={20} logo={teamLogos[m.home]}/>
                    </div>
                    <div style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.ink,minWidth:36,textAlign:"center"}}>{hs}–{as}</div>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                      <TeamBadge abbr={m.away} size={20} logo={teamLogos[m.away]}/>
                      <span style={{fontFamily:T.sans,fontWeight:as>hs?700:500,fontSize:12,color:as>hs?T.ink:T.textDim}}>{m.away}</span>
                    </div>
                    <span style={{fontSize:10,color:T.textMute,fontFamily:T.sans,minWidth:40,textAlign:"right"}}>{dateStr}</span>
                  </div>;
                })}
              </div>
            </div>;
          })()}
          {/* Power Rankings — composite algorithm */}
          {enrichedTeams.length>0&&(()=>{
            const stMap={};standingsData.forEach(s=>{stMap[s.team]=s;});
            // Power score: 50% normalized points + 30% team OVR + 20% recent form
            const maxPts=Math.max(...ranked.map(t=>t.pts),1);
            const powerRanked=ranked.map(t=>{
              const normPts=(t.pts/maxPts)*100;
              const normGrade=t.overall||50;
              // Recent form from matchesData
              const teamMatches=[...matchesData].filter(m=>m.completed&&(m.home===t.abbr||m.away===t.abbr)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5);
              let formPts=0;
              teamMatches.forEach(m=>{
                const hs=+(m.homeScore||0),as=+(m.awayScore||0);
                const isHome=m.home===t.abbr;
                const won=isHome?(hs>as):(as>hs);
                const drew=hs===as;
                formPts+=won?3:drew?1:0;
              });
              // 6C: a season with no fixture list has no form to read. Feeding the blend a neutral
              // 50 invented a fifth of the published score; the term is dropped and the remaining
              // weights renormalised instead, and the header says so.
              const formScore=teamMatches.length>0?(formPts/(teamMatches.length*3))*100:null;/*6C-POWERFORM*/
              const ps=powerScore({normPts,normGrade,formScore});
              return{...t,power:ps.value,powerReduced:ps.reduced,formScore:formScore==null?null:Math.round(formScore),recentRecord:teamMatches.length};
            }).sort((a,b)=>b.power-a.power).map((t,i)=>({...t,powerRank:i+1}));
            // Points-table rank computed independently of the user's current sort
            const ptsOrder=[...standingsData].sort((a,b)=>(b.pts||0)-(a.pts||0)||((b.gf||0)-(b.ga||0))-((a.gf||0)-(a.ga||0))||(b.gf||0)-(a.gf||0)).map(s=>s.team);
            // Real week-over-week movement only when a genuine prior snapshot exists
            const snapWk=pickWeekAgo(rankHistory,cacheMeta&&cacheMeta.generated);
            powerRanked.forEach(t=>{
              const ptsRank=ptsOrder.indexOf(t.abbr)+1;
              t.vsTable=ptsRank>0?ptsRank-t.powerRank:0; // positive = ranked higher than the points table
              const prev=snapWk&&snapWk.power&&snapWk.power[t.abbr];
              t.movement=Number.isFinite(prev)?prev-t.powerRank:null; // null = no real history yet
            });
            const powerReduced=powerRanked.some(t=>t.powerReduced);
            const moveLabel=snapWk?("Arrows: movement since "+fmtET(snapWk.date))
              :isArchiveSeason?("Arrows: power rank vs the "+season+" points table \u00b7 week-over-week movement is a current-season measure")
              :"Arrows: vs points table (week-over-week appears once ranking history accrues)";
            const powerBasis=powerReduced
              ?"Composite score: 62.5% points + 37.5% team grade \u2014 the "+season+" archive carries no fixture list, so the recent-form term is omitted rather than filled in"
              :"Composite score: 50% points + 30% team grade + 20% recent form";
            return <div style={{marginBottom:20,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink}}>Power Rankings</div>
                  <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>{powerBasis} {"\u00b7"} {moveLabel}</div>
                </div>
                <CardButton label="Share card" onClick={()=>cardPowerRankings({rows:powerRanked,moveLabel:snapWk?"movement since "+fmtET(snapWk.date):"arrows vs points table",logos:teamLogos})}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:0}}>
                {powerRanked.slice(0,12).map((t,i)=>(
                  <div key={t.abbr} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:`1px solid ${T.borderLt}`,borderRight:`1px solid ${T.borderLt}`,background:i<3?T.card:"transparent"}}>
                    <span style={{fontFamily:T.display,fontWeight:900,fontSize:i<3?22:16,color:i<3?T.gold:i<6?T.green:T.textDim,width:24,textAlign:"center"}}>{t.powerRank}</span>
                    {(()=>{const mv=t.movement!=null?t.movement:t.vsTable;const ttl=t.movement!=null?"Change since last snapshot":"Power rank vs points-table rank";return <span title={ttl} style={{fontSize:12,width:24,textAlign:"center",fontFamily:T.mono,fontWeight:700,color:mv>0?T.green:mv<0?T.red:T.textMute}}>{mv>0?`↑${mv}`:mv<0?`↓${Math.abs(mv)}`:"—"}</span>;})()}
                    <TeamBadge abbr={t.abbr} size={26} logo={teamLogos[t.abbr]}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
                      <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{t.w}-{t.dr}-{t.l} · {t.pts} pts</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:gc(t.power)}}>{t.power}</div>
                      <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>PWR</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>;
          })()}

          <div style={{borderRadius:0,border:`1px solid ${T.border}`,overflow:"hidden",background:T.surface}}>
          {(()=>{const stTbl=isMobile?"30px 30px 1fr 52px 40px 36px":"40px 44px 220px 70px 100px 80px 44px 44px 44px 44px 1fr";return <>
          <div style={{display:"grid",gridTemplateColumns:stTbl,padding:isMobile?"6px 8px":"8px 16px",fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:.8,fontFamily:T.sans,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>
            <div style={{textAlign:"center"}}>#</div><div></div><div>Team</div><div style={{textAlign:"center"}}>{isMobile?"Rec":"Record"}</div><div style={{textAlign:"center"}}>{isMobile?"Pts":"Pts / GD"}</div><div style={{textAlign:"center"}}>OVR</div>{!isMobile&&<div style={{textAlign:"center"}}>ATT</div>}{!isMobile&&<div style={{textAlign:"center"}}>PAS</div>}{!isMobile&&<div style={{textAlign:"center"}}>DEF</div>}{!isMobile&&<div style={{textAlign:"right"}}>Best Player</div>}
          </div>
          {ranked.map((t,i)=>{const isTop3=i<3;return <div key={t.abbr} style={{display:"grid",gridTemplateColumns:stTbl,padding:isMobile?(isTop3?"10px 8px":"8px 8px"):(isTop3?"14px 16px":"11px 16px"),alignItems:"center",background:isTop3?T.surface:"transparent",borderBottom:`1px solid ${T.borderLt}`,borderLeft:isTop3?`3px solid ${T.gold}`:"3px solid transparent"}}>
            <div style={{fontFamily:T.display,fontWeight:900,fontSize:isMobile?(isTop3?18:14):(isTop3?24:18),color:isTop3?T.ink:T.textDim,textAlign:"center"}}>{t.rank}</div>
            <TeamBadge abbr={t.abbr} size={isMobile?(isTop3?28:24):(isTop3?40:34)} logo={teamLogos[t.abbr]}/>
            <div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?(isTop3?14:13):(isTop3?20:18),color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isMobile?t.abbr:t.name}</div>{!isMobile&&<div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans}}>{t.conf}</div>}</div>
            <div style={{textAlign:"center",fontFamily:T.mono,fontSize:isMobile?11.5:12,color:T.textDim,fontWeight:600}}>{t.w}-{t.dr}-{t.l}</div>
            <div style={{textAlign:"center"}}><span style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:15,color:T.ink}}>{t.pts}</span>{!isMobile&&<span style={{fontSize:12,color:t.gd>0?T.green:t.gd<0?T.red:T.textMute,fontFamily:T.mono,fontWeight:600,marginLeft:8}}>{t.gd>0?"+":""}{t.gd}</span>}</div>
            <div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,fontSize:isMobile?12:14,color:gc(t.overall)}}>{t.overall}</div>
            {!isMobile&&<div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,fontSize:14,color:gc(t.attack)}}>{t.attack}</div>}
            {!isMobile&&<div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,fontSize:14,color:gc(t.passing)}}>{t.passing}</div>}
            {!isMobile&&<div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,fontSize:14,color:gc(t.defense)}}>{t.defense}</div>}
            {!isMobile&&<div style={{textAlign:"right"}}>{t.topRated&&<div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`,cursor:"pointer"}} onClick={()=>setSel(t.topRated)}><span style={{fontSize:12,fontFamily:T.serif,fontWeight:600,color:T.ink}}>{t.topRated.name}</span><Badge grade={t.topRated.overall} rated={t.topRated.rated} size="sm"/></div>}</div>}
          </div>;})}
          </>})()} </div>
          <div style={{marginTop:16,fontSize:11,color:T.textMute,fontFamily:T.sans,fontStyle:"italic",textAlign:"center"}}>Ranked by MLS standings points. Grades from real stats via ESPN, ASA, and MLS Official (Opta).</div>

          {/* ── FIXTURE DIFFICULTY ── */}
          {(()=>{
            const upcoming=(matchesData||[]).filter(m=>!m.completed&&m.home&&m.away);
            if(!upcoming.length)return null;
            const teamPower={};
            (enrichedTeams||[]).forEach(t=>{teamPower[t.abbr]=t.overall||55;});
            const teamSchedule={};
            upcoming.forEach(m=>{
              if(!teamSchedule[m.home])teamSchedule[m.home]=[];
              if(!teamSchedule[m.away])teamSchedule[m.away]=[];
              teamSchedule[m.home].push({opp:m.away,ha:"H",date:m.date,power:teamPower[m.away]||50});
              teamSchedule[m.away].push({opp:m.home,ha:"A",date:m.date,power:teamPower[m.home]||50});
            });
            const diffRanked=Object.entries(teamSchedule).map(([team,games])=>{
              const next5=games.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,5);
              const avgDiff=next5.length?Math.round(next5.reduce((s,g)=>s+g.power,0)/next5.length):50;
              return{team,games:next5,avgDiff};
            }).sort((a,b)=>b.avgDiff-a.avgDiff);
            if(!diffRanked.length)return null;
            const diffColor=d=>d>=75?T.red:d>=60?T.accent:d>=45?T.textDim:T.green;
            return <div style={{marginTop:24}}>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink,marginBottom:4}}>Fixture Difficulty</div>
              <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginBottom:14}}>Next 5 matches ranked by opponent power rating. Harder schedules at top.</div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                {diffRanked.slice(0,isMobile?10:15).map((t,i)=>(
                  <div key={t.team} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderBottom:`1px solid ${T.borderLt}`}}>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:i<3?T.accent:T.textMute,width:22,textAlign:"center"}}>{i+1}</div>
                    <TeamBadge abbr={t.team} size={24} logo={teamLogos[t.team]}/>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink,width:40}}>{t.team}</div>
                    <div style={{flex:1,display:"flex",gap:3}}>
                      {t.games.map((g,j)=>(
                        <div key={j} style={{flex:1,textAlign:"center",padding:"4px 2px",borderRadius:0,background:`${diffColor(g.power)}12`,border:`1px solid ${diffColor(g.power)}25`}}>
                          <div style={{fontSize:10,fontFamily:T.mono,fontWeight:700,color:diffColor(g.power)}}>{g.opp}</div>
                          <div style={{fontSize:10,color:T.textMute}}>{g.ha}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:diffColor(t.avgDiff),width:32,textAlign:"right"}}>{t.avgDiff}</div>
                  </div>
                ))}
              </div>
            </div>;
          })()}

          {/* ── PLAYOFF PROBABILITY ── */}
          {(()=>{
            const totalGames=34;
            const sims=500;
            const teamData={};
            (standingsData||[]).forEach(s=>{
              const played=(s.w||0)+(s.d||0)+(s.l||0);
              teamData[s.team]={pts:s.pts||0,w:s.w||0,d:s.d||0,l:s.l||0,played,remaining:totalGames-played,conf:s.conf,abbr:s.team};
            });
            const teams=Object.values(teamData);
            if(!teams.length||!teams[0].remaining)return null;
            // Simple simulation: for each remaining game, win=40%, draw=30%, loss=30% weighted by current form
            const results={};
            teams.forEach(t=>{results[t.abbr]={playoff:0,shield:0,totalPts:0};});
            for(let s=0;s<sims;s++){
              const simPts={};
              teams.forEach(t=>{
                const winRate=Math.min(0.65,0.2+(t.pts/(t.played||1)*3)/100);
                let pts=t.pts;
                for(let g=0;g<t.remaining;g++){
                  const r=Math.random();
                  if(r<winRate)pts+=3;
                  else if(r<winRate+0.28)pts+=1;
                }
                simPts[t.abbr]=pts;
              });
              // Top 9 per conference make playoffs
              const east=teams.filter(t=>t.conf==="Eastern").map(t=>({...t,simPts:simPts[t.abbr]})).sort((a,b)=>b.simPts-a.simPts);
              const west=teams.filter(t=>t.conf==="Western").map(t=>({...t,simPts:simPts[t.abbr]})).sort((a,b)=>b.simPts-a.simPts);
              east.slice(0,9).forEach(t=>{results[t.abbr].playoff++;});
              west.slice(0,9).forEach(t=>{results[t.abbr].playoff++;});
              const all=[...east,...west].sort((a,b)=>b.simPts-a.simPts);
              if(all[0])results[all[0].abbr].shield++;
              teams.forEach(t=>{results[t.abbr].totalPts+=simPts[t.abbr];});
            }
            const probData=teams.map(t=>({
              ...t,
              playoffPct:Math.round(results[t.abbr].playoff/sims*100),
              shieldPct:Math.round(results[t.abbr].shield/sims*100),
              projPts:Math.round(results[t.abbr].totalPts/sims),
            })).sort((a,b)=>b.playoffPct-a.playoffPct||b.projPts-a.projPts);
            const probColor=pct=>pct>=80?T.green:pct>=50?T.blue:pct>=20?T.accent:T.red;
            return <div style={{marginTop:24}}>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink,marginBottom:4}}>Playoff Probability</div>
              <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginBottom:14}}>Simulated {sims}x based on current form and remaining games. Top 9 per conference qualify.</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>
                {["Eastern","Western"].map(conf=>(
                  <div key={conf} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                    <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontFamily:T.sans,fontWeight:700,fontSize:11.5,color:T.textMute,letterSpacing:1.5,textTransform:"uppercase"}}>{conf} Conference</div>
                    {probData.filter(t=>t.conf===conf).map((t,i)=>(
                      <div key={t.abbr} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:`1px solid ${T.borderLt}`,background:i<9?`${T.green}04`:"transparent"}}>
                        <TeamBadge abbr={t.abbr} size={22} logo={teamLogos[t.abbr]}/>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:12,color:T.ink,width:36}}>{t.abbr}</div>
                        <div style={{flex:1,height:6,background:`${T.border}50`,borderRadius:0,overflow:"hidden"}}>
                          <div style={{width:`${t.playoffPct}%`,height:"100%",background:probColor(t.playoffPct),borderRadius:0,transition:"width .3s"}}/>
                        </div>
                        <div style={{fontFamily:T.mono,fontWeight:700,fontSize:12,color:probColor(t.playoffPct),width:38,textAlign:"right"}}>{t.playoffPct}%</div>
                        <div style={{fontSize:11,color:T.textMute,fontFamily:T.mono,width:32,textAlign:"right"}}>{t.projPts}pt</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>;
          })()}

          {/* ── WEEKLY POWER SHIFT ── */}
          {(()=>{
            if(!enrichedTeams.length)return null;
            const stMap={};standingsData.forEach(s=>{stMap[s.team]=s;});
            const maxPts=Math.max(...standingsData.map(s=>s.pts||0),1);
            const ranked=enrichedTeams.map(t=>{
              const s=stMap[t.abbr]||{};
              const normPts=((s.pts||0)/maxPts)*100;
              const power=Math.round(normPts*0.5+t.overall*0.5);
              const ptsRank=standingsData.filter(x=>(x.pts||0)>(s.pts||0)).length+1;
              return{...t,...s,power,ptsRank};
            }).sort((a,b)=>b.power-a.power).map((t,i)=>({...t,powerRank:i+1,shift:t.ptsRank-(i+1)}));
            const maxPower=Math.max(...ranked.map(t=>t.power),1);
            return <div style={{marginTop:24}}>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink,marginBottom:4}}>Power Shift</div>
              <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginBottom:14}}>How team power rankings compare to pure points standings. Positive = outperforming their record.</div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                {ranked.slice(0,isMobile?12:16).map((t,i)=>(
                  <div key={t.abbr} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:`1px solid ${T.borderLt}`}}>
                    <div style={{fontFamily:T.display,fontWeight:900,fontSize:14,color:i<3?T.gold:T.textMute,width:22,textAlign:"center"}}>{i+1}</div>
                    <TeamBadge abbr={t.abbr} size={22} logo={teamLogos[t.abbr]}/>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:12,color:T.ink,width:isMobile?36:120}}>{isMobile?t.abbr:(t.name||t.abbr)}</div>
                    <div style={{flex:1,height:8,background:`${T.border}30`,borderRadius:0,overflow:"hidden"}}>
                      <div style={{width:`${(t.power/maxPower)*100}%`,height:"100%",background:`linear-gradient(90deg, ${gc(t.overall)}, ${gc(t.overall)}aa)`,borderRadius:0}}/>
                    </div>
                    <div style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:gc(t.power),width:30,textAlign:"right"}}>{t.power}</div>
                    <div style={{fontFamily:T.mono,fontWeight:700,fontSize:12,color:t.shift>0?T.green:t.shift<0?T.red:T.textMute,width:36,textAlign:"right"}}>{t.shift>0?"↑"+t.shift:t.shift<0?"↓"+Math.abs(t.shift):"—"}</div>
                  </div>
                ))}
              </div>
            </div>;
          })()}
        </div>})()}

        {/* ═══ LEADERS TAB ═══════════════════════════════════════════════════ */}
        {!loading&&tab==="leaders"&&(()=>{
          // Best XI: unchanged rule (top-graded at each slot of a 4-3-3), moved into
          // analytics/archive.mjs so it is testable. `players` is already the selected season, so
          // the XI is season-aware for free — nothing about the selection changed.
          const xi=bestXI(players);/*6C-BESTXI*/
          const xiAvg=xi.length?Math.round(xi.reduce((s,x)=>s+x.p.overall,0)/xi.length):0;

          // 6C: one row renderer for both historical boards. Ranks come from seasonLeaderboard, so
          // ties share a rank and PROV players stay in the pool — a display label never gates
          // eligibility. Each player's strongest sub-grade is named in the vocabulary of their
          // position, so a keeper reads "Command", not "Defense".
          const leaderRow=(p,i,showGroup)=>{
            const ss=strongestSubgrade(p,p.group==="GK");
            return <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:isMobile?"9px 10px":"10px 16px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer",background:i%2===0?"transparent":T.card}}>
              <div style={{fontFamily:T.display,fontWeight:900,fontSize:p.rank<=3?21:15,color:p.rank<=3?T.gold:T.textMute,width:26,textAlign:"center",flexShrink:0}}>{p.rank}</div>
              <TeamBadge abbr={p.team} size={26} logo={p.teamLogo}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {p.name}{p.prov&&<span title="Provisional — under 450 minutes played" style={{marginLeft:6,fontSize:9,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 4px",letterSpacing:.5}}>PROV</span>}
                </div>
                <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {p.team} {"\u00b7"} {showGroup?(GROUP_SINGULAR[p.group]||p.position):p.position}{ss?<span style={{color:T.textMute}}> {"\u00b7"} best: {ss.label} <b style={{color:gc(ss.value),fontFamily:T.mono}}>{ss.value}</b></span>:null}
                </div>
              </div>
              {!isMobile&&<div style={{fontFamily:T.mono,fontSize:11.5,color:T.textDim,width:66,textAlign:"right",flexShrink:0}}>{sv(p.mins)}<span style={{color:T.textMute}}> min</span></div>}
              <div style={{flexShrink:0}}><Badge grade={p.overall} rated={p.rated} size="sm"/></div>
            </div>;
          };

          return <div style={{animation:"fadeUp .4s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>{season} Season Leaders{isArchiveSeason&&<span style={{marginLeft:10,fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"3px 7px",letterSpacing:1,verticalAlign:"middle"}}>ARCHIVE</span>}</div>
              <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Top performers, formations, and weekly highlights across the {season} MLS season.</div>
            </div>
          </div>

          {/* Sub-view pills */}
          <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
            {[{id:"index",l:"Index Top 25"},{id:"posboards",l:"By Position"},{id:"overview",l:"Stat Leaders"},{id:"bestxi",l:"Best XI"},{id:"totw",l:"Team of the Week"},{id:"movers",l:"Movers"},{id:"awards",l:"Award Races"}].map(v=>(
              <button key={v.id} onClick={()=>setLeadersView(v.id)} style={{background:leadersView===v.id?T.ink:"transparent",color:leadersView===v.id?T.bg:T.textDim,border:`1px solid ${leadersView===v.id?T.ink:T.border}`,padding:"7px 18px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,letterSpacing:.5,transition:"all .15s"}}>{v.l}</button>
            ))}
          </div>

          {/* ═══ 6C: ARCHIVE HONESTY + SEASON EXPLORATION ═══════════════════ */}
          {/* One concise coverage note per historical league screen — enough to discover the limit,
              not a banner on every module. Ranks WITHIN a season are valid; grades ACROSS seasons
              are not comparable, because the inputs differ. */}
          {isArchiveSeason&&<div role="note" style={{marginBottom:16,padding:"10px 14px",border:`1px dashed ${T.border}`,borderLeft:`3px solid ${T.accent}`,background:T.surface,fontFamily:T.sans,fontSize:12,color:T.textDim,lineHeight:1.55}}>
            <b style={{color:T.ink}}>Archive · {season}.</b> These grades reflect the data available in {season} and are not directly comparable to the current full-coverage model — {season} has no Opta advanced metrics, no goalkeeper metrics and no authoritative assists. Ranks and order <i>within</i> {season} are valid; a grade gap <i>between</i> seasons is a difference in measurement, not in play. <button onClick={()=>goTab("methodology")} style={{background:"none",border:"none",padding:0,color:T.accent,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,textDecoration:"underline"}}>How the grades work</button>
          </div>}

          {/* Season at a Glance — the archive entry point. Every figure is read off structures the
              season already produced; the stored table is reported as a points leader, never as a
              champion, because the cache does not establish that these standings are final. */}
          {isArchiveSeason&&(()=>{
            const ov=seasonOverview(players,enrichedTeams,standingsData,{season});
            if(!ov.gradedPlayers)return null;
            const cell=(label,value,sub)=><div style={{padding:"10px 12px",border:`1px solid ${T.borderLt}`,background:T.card,minWidth:0}}>
              <div style={{fontFamily:T.sans,fontSize:10,fontWeight:700,letterSpacing:1.1,textTransform:"uppercase",color:T.textMute}}>{label}</div>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:19,color:T.ink,lineHeight:1.15,marginTop:3,overflowWrap:"anywhere"}}>{value}</div>
              {sub&&<div style={{fontFamily:T.sans,fontSize:10.5,color:T.textDim,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub}</div>}
            </div>;
            const nm=(p)=>p?p.name:"—";
            return <div style={{marginBottom:20}}>
              <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent,marginBottom:8}}>{season} season at a glance</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
                {cell("Players graded",ov.gradedPlayers.toLocaleString(),"minutes played > 0")}
                {cell("Clubs graded",ov.clubs,"with a graded squad")}
                {cell("Top Overall",nm(ov.topOverall),ov.topOverall?`${ov.topOverall.overall} · ${ov.topOverall.team}`:null)}
                {cell("Team Grade leader",ov.gradeLeader?ov.gradeLeader.name:"—",ov.gradeLeader?`${ov.gradeLeader.overall} · minutes-weighted squad grade`:null)}
                {cell("Points leader (stored table)",ov.pointsLeader?(ov.pointsLeader.name||ov.pointsLeader.team):"—",ov.pointsLeader?`${ov.pointsLeader.pts} pts · ${ov.pointsLeader.w}-${ov.pointsLeader.d}-${ov.pointsLeader.l}`:null)}
                {POS_GROUPS.map(g=>ov.byGroup[g]?<div key={g} style={{padding:"10px 12px",border:`1px solid ${T.borderLt}`,background:T.card,minWidth:0}}>
                  <div style={{fontFamily:T.sans,fontSize:10,fontWeight:700,letterSpacing:1.1,textTransform:"uppercase",color:T.textMute}}>Top {GROUP_SINGULAR[g]}</div>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:17,color:T.ink,lineHeight:1.15,marginTop:3,overflowWrap:"anywhere"}}>{ov.byGroup[g].name}</div>
                  <div style={{fontFamily:T.sans,fontSize:10.5,color:T.textDim,marginTop:2}}>{ov.byGroup[g].overall} · {ov.byGroup[g].team}</div>
                </div>:null)}
              </div>
              <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim,marginTop:6}}>
                Read off the {season} record only. The table row is the stored standings' points leader — the archive does not establish whether those standings are final, so no championship is claimed{ov.assistsKnown?"":", and assists are unavailable for this season"}.
              </div>
            </div>;
          })()}

          {/* ═══ INDEX TOP 25 ═══ */}
          {leadersView==="index"&&(()=>{
            const rows=seasonLeaderboard(players,{group:"ALL",limit:25});
            if(!rows.length)return <div style={{padding:40,textAlign:"center",color:T.textMute,fontFamily:T.sans}}>No graded players in the {season} record.</div>;
            return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:`2px solid ${T.ink}`,display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:8}}>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink,letterSpacing:-.3}}>{season} Index {"·"} Top 25</div>
                <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>By Overall grade, {season} season only {"·"} {rows[0].poolSize.toLocaleString()} graded players {"·"} equal grades share a rank</div>
              </div>
              {rows.map((p,i)=>leaderRow(p,i,true))}
            </div>;
          })()}

          {/* ═══ BY POSITION ═══ */}
          {leadersView==="posboards"&&(()=>{
            const boards=POS_GROUPS.map(g=>({g,rows:seasonLeaderboard(players,{group:g,limit:10})})).filter(b=>b.rows.length);
            if(!boards.length)return <div style={{padding:40,textAlign:"center",color:T.textMute,fontFamily:T.sans}}>No graded players in the {season} record.</div>;
            return <div>
              <div style={{fontFamily:T.sans,fontSize:12,color:T.textMute,marginBottom:12}}>Each board ranks within its own position group for {season} only. Goalkeepers are graded and named on their own terms {"—"} Shot-Stop, Distribution, Command, Sweeping, Handling {"—"} because those five grades do not mean what the outfield names mean.</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>
                {boards.map(({g,rows})=><div key={g} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`2px solid ${T.ink}`,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:17,color:T.ink}}>{GROUP_LABEL[g]}</div>
                    <div style={{fontSize:10.5,color:T.textMute,fontFamily:T.sans}}>{season} {"·"} top 10 of {rows[0].poolSize}</div>
                  </div>
                  {rows.map((p,i)=>leaderRow(p,i,false))}
                </div>)}
              </div>
            </div>;
          })()}

          {/* ═══ OVERVIEW: Stat Leader Categories ═══ */}
          {leadersView==="overview"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14}}>
            {leaders.map(cat=>(
              <div key={cat.k} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,borderLeft:`3px solid ${T.accent}`,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink}}>{cat.l}</div>
                    <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>{cat.desc}</div>
                  </div>
                </div>
                {cat.top.map((p,i)=>(
                  <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 18px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:i===0?T.accent:T.textMute,width:18}}>{i+1}</div>
                    <TeamBadge abbr={p.team} size={36} logo={p.teamLogo}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:600,fontSize:14,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                      <div style={{fontSize:10,color:T.textMute}}>{p.position} · {p.team}</div>
                    </div>
                    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:18,color:i===0?T.ink:T.textDim}}>{parseFloat(p[cat.k])||0}</div>
                    <Badge grade={p.overall} rated={p.rated} size="sm"/>
                  </div>
                ))}
              </div>
            ))}
          </div>}

          {/* ═══ BEST XI ═══ */}
          {leadersView==="bestxi"&&xi.length>=11&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
            <div style={{padding:"16px 22px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink}}>{season} Best XI{isArchiveSeason&&<span style={{marginLeft:8,fontSize:9,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"2px 6px",letterSpacing:1,verticalAlign:"middle"}}>ARCHIVE</span>}</div>
                <div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans}}>Top-graded player at each position · 4-3-3 formation · {season} players only</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:24,color:gc(xiAvg)}}>{xiAvg}</div>
                <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.8}}>AVG GRADE</div>
              </div>
            </div>
            <div className="resp-pitch" style={{position:"relative",width:"100%",paddingBottom:"62%",background:`repeating-linear-gradient(180deg,${T.bg} 0,${T.bg} 7%,${T.card} 7%,${T.card} 14%)`,overflow:"hidden",borderRadius:"0 0 8px 8px"}}>
              <div style={{position:"absolute",inset:"4%",border:"2px solid rgba(35,31,25,.30)",borderRadius:0}}/>
              <div style={{position:"absolute",left:"4%",right:"4%",top:"50%",height:0,borderTop:"2px solid rgba(35,31,25,.28)"}}/>
              <div style={{position:"absolute",left:"50%",top:"50%",width:80,height:80,marginLeft:-40,marginTop:-40,border:"2px solid rgba(35,31,25,.22)",borderRadius:"50%"}}/>
              <div style={{position:"absolute",left:"50%",top:"50%",width:6,height:6,marginLeft:-3,marginTop:-3,background:"rgba(35,31,25,.30)",borderRadius:"50%"}}/>
              <div style={{position:"absolute",left:"30%",right:"30%",top:"4%",height:"16%",border:"2px solid rgba(35,31,25,.22)",borderTop:"none"}}/>
              <div style={{position:"absolute",left:"30%",right:"30%",bottom:"4%",height:"16%",border:"2px solid rgba(35,31,25,.22)",borderBottom:"none"}}/>
              {xi.map(s=>(
                <div key={s.slot} className="pitch-dot" onClick={()=>setSel(s.p)} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,transform:"translate(-50%,-50%)",textAlign:"center",cursor:"pointer",zIndex:2,transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translate(-50%,-50%) scale(1.08)"} onMouseLeave={e=>e.currentTarget.style.transform="translate(-50%,-50%)"}>
                  <div style={{width:52,height:52,borderRadius:"50%",background:T.surface,border:`3px solid ${gc(s.p.overall)}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 3px 12px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.1)"}}>
                    <span style={{fontFamily:T.serif,fontWeight:700,fontSize:20,color:T.ink}}>{s.p.overall}</span>
                  </div>
                  <div style={{marginTop:4,padding:"2px 8px",background:T.ink,borderRadius:0,display:"inline-block"}}>
                    <div style={{fontFamily:T.sans,fontWeight:700,fontSize:12,color:T.bg,whiteSpace:"nowrap",letterSpacing:.3}}>{s.p.name.split(" ").slice(-1)[0]}</div>
                  </div>
                  <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans,fontWeight:600,marginTop:1}}>{s.p.team}</div>
                </div>
              ))}
            </div>
          </div>}

          {/* ═══ TEAM OF THE WEEK ═══ */}
          {leadersView==="totw"&&(()=>{
            const allLogs=[];
            players.forEach(pl=>{
              (pl.matchLog||[]).forEach(m=>{
                if(!m.date)return;
                const dateKey=m.date.slice(0,10);
                const rating=matchRating(m,pl.position);
                allLogs.push({player:pl,dateKey,rating,...m});
              });
            });
            // 6C: the archive caches carry no per-match box scores at all, so a Team of the Week
            // cannot be built for 2024/2025. Say that plainly instead of showing a build instruction
            // that implies the data is one command away.
            if(allLogs.length<11)return <div style={{padding:36,textAlign:"center",color:T.textMute,fontFamily:T.sans,fontSize:13,lineHeight:1.6}}>{isArchiveSeason
              ?<>Team of the Week is built from per-match box scores, and the {season} archive does not carry them. It is available for the current season only.<div style={{marginTop:10}}><button onClick={()=>changeSeason(CURRENT_SEASON)} style={{background:T.ink,border:"none",color:T.bg,padding:"7px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12}}>Go to {CURRENT_SEASON} {"\u2192"}</button></div></>
              :<>Match log data needed — run <code>npm run fetch</code> with v5 script to populate.</>}</div>;
            const byDate={};allLogs.forEach(l=>{if(!byDate[l.dateKey])byDate[l.dateKey]=[];byDate[l.dateKey].push(l);});
            const dateKeys=Object.keys(byDate).sort();
            const weeks=[];let current=[];
            dateKeys.forEach((dk,i)=>{
              current.push(dk);
              const next=dateKeys[i+1];
              if(!next||new Date(next)-new Date(dk)>3*86400000){
                weeks.push({dates:[...current],logs:current.flatMap(d=>byDate[d])});
                current=[];
              }
            });
            if(!weeks.length)return null;
            const weekIdx=totwWeek===0?weeks.length-1:Math.min(totwWeek-1,weeks.length-1);
            const week=weeks[weekIdx];
            if(!week||week.logs.length<6)return null;
            const bestAt=(positions)=>{
              const eligible=week.logs.filter(l=>positions.includes(l.player.position));
              if(!eligible.length)return null;
              eligible.sort((a,b)=>b.rating-a.rating);
              const seen=new Set();
              return eligible.filter(l=>{if(seen.has(l.player.id))return false;seen.add(l.player.id);return true;});
            };
            const fwLogs=bestAt(["Forward","FW"])||[];
            const mfLogs=bestAt(["Midfielder","MF"])||[];
            const dfLogs=bestAt(["Defender","DF","DEF"])||[];
            const gkLogs=bestAt(["GK","Goalkeeper"])||[];
            const totwXi=[
              {slot:"LW",l:fwLogs[0],x:15,y:18},{slot:"ST",l:fwLogs[1]||fwLogs[0],x:50,y:10},{slot:"RW",l:fwLogs[2]||fwLogs[0],x:85,y:18},
              {slot:"LCM",l:mfLogs[0],x:25,y:42},{slot:"CM",l:mfLogs[1]||mfLogs[0],x:50,y:36},{slot:"RCM",l:mfLogs[2]||mfLogs[0],x:75,y:42},
              {slot:"LB",l:dfLogs[0],x:12,y:65},{slot:"LCB",l:dfLogs[1]||dfLogs[0],x:35,y:68},{slot:"RCB",l:dfLogs[2]||dfLogs[0],x:65,y:68},{slot:"RB",l:dfLogs[3]||dfLogs[0],x:88,y:65},
              {slot:"GK",l:gkLogs[0],x:50,y:90},
            ].filter(s=>s.l);
            const totwAvg=totwXi.length?Math.round(totwXi.reduce((s,t)=>s+t.l.rating,0)/totwXi.length):0;
            const weekLabel=(()=>{
              const d1=new Date(week.dates[0]+"T12:00:00Z");
              const d2=week.dates.length>1?new Date(week.dates[week.dates.length-1]+"T12:00:00Z"):d1;
              const fmt=(d)=>fmtET(d);
              return week.dates.length>1?`${fmt(d1)} – ${fmt(d2)}`:fmt(d1);
            })();
            const topPerf=[...week.logs].sort((a,b)=>b.rating-a.rating);
            const seenIds=new Set();const topUnique=topPerf.filter(l=>{if(seenIds.has(l.player.id))return false;seenIds.add(l.player.id);return true;}).slice(0,5);
            return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
              <div style={{padding:"16px 22px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink}}>Team of the Week</div>
                  <div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans}}>Best per-match ratings · Matchweek {weekIdx+1} · {weekLabel}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {topUnique.length>0&&<CardButton label="Player of the Week card" onClick={()=>cardTOTW({spot:topUnique[0],xi:totwXi,weekLabel,weekNo:weekIdx+1})}/>}
                  <button onClick={()=>setTotwWeek(Math.max(1,weekIdx))} disabled={weekIdx<=0} style={{background:"none",border:`1px solid ${weekIdx<=0?T.borderLt:T.border}`,borderRadius:0,color:weekIdx<=0?T.textMute:T.ink,width:28,height:28,cursor:weekIdx<=0?"default":"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans}}>‹</button>
                  <span style={{fontFamily:T.mono,fontSize:12,fontWeight:600,color:T.textDim,minWidth:50,textAlign:"center"}}>MW {weekIdx+1}</span>
                  <button onClick={()=>setTotwWeek(Math.min(weeks.length,weekIdx+2))} disabled={weekIdx>=weeks.length-1} style={{background:"none",border:`1px solid ${weekIdx>=weeks.length-1?T.borderLt:T.border}`,borderRadius:0,color:weekIdx>=weeks.length-1?T.textMute:T.ink,width:28,height:28,cursor:weekIdx>=weeks.length-1?"default":"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans}}>›</button>
                </div>
              </div>
              {totwXi.length>=8&&<div className="resp-pitch" style={{position:"relative",width:"100%",paddingBottom:"62%",background:`repeating-linear-gradient(180deg,${T.bg} 0,${T.bg} 7%,${T.card} 7%,${T.card} 14%)`,overflow:"hidden"}}>
                <div style={{position:"absolute",inset:"4%",border:"2px solid rgba(35,31,25,.30)",borderRadius:0}}/>
                <div style={{position:"absolute",left:"4%",right:"4%",top:"50%",height:0,borderTop:"2px solid rgba(35,31,25,.28)"}}/>
                <div style={{position:"absolute",left:"50%",top:"50%",width:80,height:80,marginLeft:-40,marginTop:-40,border:"2px solid rgba(35,31,25,.22)",borderRadius:"50%"}}/>
                <div style={{position:"absolute",left:"50%",top:"50%",width:6,height:6,marginLeft:-3,marginTop:-3,background:"rgba(35,31,25,.30)",borderRadius:"50%"}}/>
                <div style={{position:"absolute",left:"30%",right:"30%",top:"4%",height:"16%",border:"2px solid rgba(35,31,25,.22)",borderTop:"none"}}/>
                <div style={{position:"absolute",left:"30%",right:"30%",bottom:"4%",height:"16%",border:"2px solid rgba(35,31,25,.22)",borderBottom:"none"}}/>
                <div style={{position:"absolute",bottom:10,right:14,padding:"4px 14px",background:"rgba(0,0,0,.5)",borderRadius:0,zIndex:3,backdropFilter:"blur(4px)"}}>
                  <span style={{fontFamily:T.sans,fontWeight:700,fontSize:11.5,color:"#fff"}}>MW{weekIdx+1} · AVG {totwAvg}</span>
                </div>
                {totwXi.map(s=>(
                  <div key={s.slot} className="pitch-dot" onClick={()=>setSel(s.l.player)} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,transform:"translate(-50%,-50%)",textAlign:"center",cursor:"pointer",zIndex:2,transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translate(-50%,-50%) scale(1.08)"} onMouseLeave={e=>e.currentTarget.style.transform="translate(-50%,-50%)"}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:T.surface,border:`3px solid ${gc(s.l.rating)}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 3px 12px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.1)"}}>
                      <span style={{fontFamily:T.serif,fontWeight:700,fontSize:20,color:T.ink}}>{s.l.rating}</span>
                    </div>
                    <div style={{marginTop:4,padding:"2px 8px",background:T.ink,borderRadius:0,display:"inline-block"}}>
                      <div style={{fontFamily:T.sans,fontWeight:700,fontSize:12,color:"#fff",whiteSpace:"nowrap"}}>{s.l.player.name.split(" ").slice(-1)[0]}</div>
                    </div>
                    <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans,fontWeight:600,marginTop:1}}>{s.l.player.team}{s.l.g>0?` · ${s.l.g}G`:""}{s.l.a>0?` · ${s.l.a}A`:""}</div>
                  </div>
                ))}
              </div>}
              <div style={{padding:"14px 22px",borderTop:`1px solid ${T.borderLt}`}}>
                <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,marginBottom:8}}>TOP PERFORMERS · MW{weekIdx+1}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6}}>
                  {topUnique.map((l,i)=>(
                    <div key={l.player.id} onClick={()=>setSel(l.player)} className="rh" style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:0,cursor:"pointer",border:`1px solid ${T.borderLt}`}}>
                      <span style={{fontFamily:T.display,fontWeight:900,fontSize:14,color:i===0?T.gold:i<3?T.green:T.textMute,width:16}}>{i+1}</span>
                      <TeamBadge abbr={l.player.team} size={22} logo={l.player.teamLogo}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.player.name}</div>
                        <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{l.player.position} · {l.opp} ({l.ha}) · {l.g>0?`${l.g}G `:""}{ l.a>0?`${l.a}A `:""}{l.mins}'</div>
                      </div>
                      <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:gb(l.rating),border:`1.5px solid ${gc(l.rating)}30`,borderRadius:0,padding:"2px 8px",minWidth:34}}>
                        <span style={{color:gc(l.rating),fontWeight:700,fontSize:15,fontFamily:T.serif,lineHeight:1}}>{l.rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>;
          })()}

          {/* ═══ MOVERS: Heating Up / Cooling Down ═══ */}
          {leadersView==="movers"&&(()=>{
            // 6C: form movement is computed from per-match ratings, which the archive caches do not
            // contain. No archive season can produce a mover; showing an empty board would read as
            // "nobody moved" rather than "this was never measured".
            if(isArchiveSeason)return <div style={{padding:36,textAlign:"center",color:T.textMute,fontFamily:T.sans,fontSize:13,lineHeight:1.6}}>Risers &amp; Fallers compares each player{"\u2019"}s recent match ratings to their season average, and the {season} archive carries no per-match box scores. Form movement is a current-season measure.<div style={{marginTop:10}}><button onClick={()=>changeSeason(CURRENT_SEASON)} style={{background:T.ink,border:"none",color:T.bg,padding:"7px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12}}>Go to {CURRENT_SEASON} {"\u2192"}</button></div></div>;/*6C-MOVERS*/
            const withForm=players.filter(p=>p.matchLog&&p.matchLog.length>=5).map(p=>{
              const logs=p.matchLog;
              const allRatings=logs.map(m=>matchRating(m,p.position));
              const last5=allRatings.slice(-5);
              const seasonAvg=Math.round(allRatings.reduce((s,v)=>s+v,0)/allRatings.length);
              const formAvg=Math.round(last5.reduce((s,v)=>s+v,0)/last5.length);
              const delta=formAvg-seasonAvg;
              return{...p,formAvg,seasonAvg,delta};
            });
            if(withForm.length<5)return <div style={{padding:40,textAlign:"center",color:T.textMute,fontFamily:T.sans}}>Not enough match data yet — movers will appear once players have 5+ games.</div>;
            const heating=[...withForm].filter(p=>p.delta>=3).sort((a,b)=>b.delta-a.delta).slice(0,8);
            const cooling=[...withForm].filter(p=>p.delta<=-3).sort((a,b)=>a.delta-b.delta).slice(0,8);
            if(!heating.length&&!cooling.length)return <div style={{padding:40,textAlign:"center",color:T.textMute,fontFamily:T.sans}}>No significant movers yet — check back after more matchweeks.</div>;
            return <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:4,height:18,background:T.green,borderRadius:0,display:"inline-block",flexShrink:0}}></span>
                  <div>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink}}>Heating Up</div>
                    <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Last 5 matches well above season average</div>
                  </div>
                  <div style={{marginLeft:"auto"}}><CardButton small label="Movers card" onClick={()=>cardMovers({heating,cooling})}/></div>
                </div>
                {heating.map((p,i)=>(
                  <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                    <TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                      <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.green}}>↑{p.delta}</div>
                      <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>{p.formAvg} form · {p.seasonAvg} szn</div>
                    </div>
                  </div>
                ))}
                {!heating.length&&<div style={{padding:16,textAlign:"center",color:T.textMute,fontSize:12,fontFamily:T.sans}}>No players heating up right now</div>}
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:4,height:18,background:T.red,borderRadius:0,display:"inline-block",flexShrink:0}}></span>
                  <div>
                    <div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink}}>Cooling Down</div>
                    <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Last 5 matches well below season average</div>
                  </div>
                </div>
                {cooling.map((p,i)=>(
                  <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                    <TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                      <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.red}}>↓{Math.abs(p.delta)}</div>
                      <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>{p.formAvg} form · {p.seasonAvg} szn</div>
                    </div>
                  </div>
                ))}
                {!cooling.length&&<div style={{padding:16,textAlign:"center",color:T.textMute,fontSize:12,fontFamily:T.sans}}>No players cooling down right now</div>}
              </div>
            </div>;
          })()}

          {/* ── AWARD RACES ── */}
          {leadersView==="awards"&&(()=>{
            // 6B.1: assist coverage is a property of the season, not of an individual row. If any
            // candidate's assists are unknown, the assist term is removed from the basis for the
            // WHOLE field and the card says so — rather than scoring the unknown rows as zero,
            // which silently punishes exactly the players whose source is incomplete.
            const mvpPool=[...players].filter(p=>p.position!=="GK"&&p.position!=="Goalkeeper"&&(p.mins||0)>=200);
            const mvpUsesAssists=assistsCoverageComplete(mvpPool);/*6B.1-AWARD*/
            const mvpCandidates=mvpPool.map(p=>({...p,mvpScore:mvpScore(p,{useAssists:mvpUsesAssists})})).sort((a,b)=>b.mvpScore-a.mvpScore).slice(0,10);
            // 6B.1: assists are a Golden Boot tiebreak only where assist coverage exists. Without it
            // the earlier sentinel (-1) invented an ordering; equal-goal players now fall back to a
            // deterministic non-performance key (name), which makes no claim about who is ahead.
            const bootPool=[...players].filter(p=>(p.goals||0)>=1);
            const bootUsesAssists=assistsCoverageComplete(bootPool);
            const bootRace=goldenBootOrder(bootPool,{useAssists:bootUsesAssists}).slice(0,10);/*6B.1-BOOT*/
            const archiveAwardNote=(!mvpUsesAssists||!bootUsesAssists)?`Assists are unavailable in the ${season} record, so the MVP score is computed without its assist term for every candidate and the Golden Boot does not use assists as a tiebreak. These archive races therefore run on reduced inputs and are not comparable to a season where assists exist.`:null;
            const doyRace=[...players].filter(p=>(p.position==="Defender"||p.position==="DF"||p.position==="DEF")&&(p.mins||0)>=200).sort((a,b)=>b.defense-a.defense).slice(0,10);
            const gkRace=[...players].filter(p=>(p.position==="GK"||p.position==="Goalkeeper")&&(p.mins||0)>=200).sort((a,b)=>b.overall-a.overall).slice(0,10);
            const youngRace=[...players].filter(p=>p.age&&+p.age<23&&(p.mins||0)>=200).sort((a,b)=>b.overall-a.overall).slice(0,10);
            const RaceCard=({title,icon,candidates,metricLabel,metricFn,gradeFn})=>(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",alignItems:"center",gap:8}}>
                  
                  <span style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.ink}}>{title}</span>
                </div>
                {candidates.map((p,i)=>(
                  <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:i===0?"12px 18px":"8px 18px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer",background:i===0?`${T.gold}06`:"transparent"}}>
                    <div style={{fontFamily:T.display,fontWeight:900,fontSize:i===0?24:16,color:i===0?T.gold:i<3?T.accent:T.textMute,width:24,textAlign:"center"}}>{i+1}</div>
                    <TeamBadge abbr={p.team} size={i===0?34:26} logo={p.teamLogo}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontWeight:700,fontSize:i===0?17:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                      <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.teamName||p.team}{i===0&&p.goals>0?` · ${p.goals}G ${sv(p.assists)}A`:""}</div>
                    </div>
                    {gradeFn&&<Badge grade={gradeFn(p)} size="sm"/>}
                    <div style={{textAlign:"right",minWidth:50}}>
                      <div style={{fontFamily:T.mono,fontWeight:700,fontSize:i===0?16:13,color:i===0?T.gold:T.ink}}>{metricFn(p)}</div>
                      <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans,textTransform:"uppercase",letterSpacing:.5}}>{metricLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
            return <div>
              <div style={{marginBottom:16}}>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:22,color:T.ink}}>Award Races</div>
                <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Data-driven predictions based on composite grades, production, and minutes played. Updated daily.</div>
                {archiveAwardNote&&<div role="note" style={{marginTop:8,padding:"8px 12px",border:`1px dashed ${T.border}`,fontFamily:T.sans,fontSize:11.5,color:T.textDim,lineHeight:1.5}}>{archiveAwardNote}</div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>
                <RaceCard title="MVP Race" candidates={mvpCandidates} metricLabel="MVP Score" metricFn={p=>p.mvpScore} gradeFn={p=>p.overall}/>
                <RaceCard title="Golden Boot" candidates={bootRace} metricLabel="Goals" metricFn={p=>`${p.goals}G ${sv(p.assists)}A`} gradeFn={p=>p.overall}/>
                <RaceCard title="Defender of the Year" candidates={doyRace} metricLabel="DEF Grade" metricFn={p=>p.defense} gradeFn={p=>p.defense}/>
                <RaceCard title="Young Player" candidates={youngRace} metricLabel="Grade" metricFn={p=>p.overall} gradeFn={p=>p.overall}/>
                <RaceCard title="GK of the Year" candidates={gkRace} metricLabel="GK Grade" metricFn={p=>p.overall} gradeFn={p=>p.overall}/>
              </div>
            </div>;
          })()}
        </div>;})()}

        {/* ═══ VALUES ════════════════════════════════════════════════════════ */}
        {!loading&&tab==="valuations"&&<div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Market Valuations</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Market values are last-observed estimates; MLS roster economics run on salary (via the MLS Players Association). Compare value against on-field grade to find overperformers and undervalued talent.</div>
          </div>
          <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
            <Select label="Position" value={posFilter} onChange={setPosFilter} width={130} options={["All","Forward","Midfielder","Defender","GK"]}/>
            <Select label="Sort" value={sortKey==="marketValue"?`mv_${sortDir}`:sortKey} onChange={v=>{if(v==="mv_desc"){setSortKey("marketValue");setSortDir("desc");}else if(v==="mv_asc"){setSortKey("marketValue");setSortDir("asc");}else{setSortKey(v);setSortDir("desc");}}} width={150} options={[["mv_desc","Highest Value"],["mv_asc","Lowest Value"],["overall","By Grade"]]}/>
          </div>
          <TopCards players={filtered} metric={p=>fv(p.marketValue)} metricLabel="VALUE" onSelect={setSel}/>
          <TableWrap><div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"24px 1fr 80px 42px":"24px 1fr 130px 48px 44px 44px 52px",padding:isMobile?"6px 6px":"10px 14px",background:T.card,fontSize:isMobile?11:12,color:T.textMute,fontWeight:600,letterSpacing:.8,borderBottom:`2px solid ${T.ink}`,fontFamily:T.sans,textTransform:"uppercase"}}><div style={{textAlign:"center"}}>#</div><div>Player</div><ColHead label="Value" sortKey="marketValue" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort}/><ColHead label="Grade" sortKey="overall" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>{!isMobile&&<ColHead label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}{!isMobile&&<ColHead label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}{!isMobile&&<ColHead label="Min" sortKey="mins" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} center/>}</div>
            {filtered.map((p,i)=><div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"grid",gridTemplateColumns:isMobile?"24px 1fr 80px 42px":"24px 1fr 130px 48px 44px 44px 52px",padding:isMobile?"8px 6px":"14px 14px",minHeight:isMobile?40:48,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,alignItems:"center",cursor:"pointer"}}>
              <div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:16,color:i<3?T.accent:T.textMute,textAlign:"center"}}>{i+1}</div>
              <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginLeft:isMobile?0:6,minWidth:0}}><TeamBadge abbr={p.team} size={isMobile?24:36} logo={p.teamLogo}/><div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?13:20,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}</div><div style={{fontSize:isMobile?11.5:14,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.position} · {p.team}</div></div></div>
              <div style={{textAlign:"center"}}><span style={{fontFamily:T.serif,fontWeight:700,fontSize:isMobile?12:15,color:vc(p.marketValue)}}>{fv(p.marketValue)}</span></div>
              <div style={{textAlign:"center"}}><Badge grade={p.overall} rated={p.rated} size={isMobile?"sm":"md"}/></div>
              {!isMobile&&<div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:T.ink,textAlign:"center"}}>{p.goals}</div>}
              {!isMobile&&<div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:T.ink,textAlign:"center"}}>{sv(p.assists)}</div>}
              {!isMobile&&<div style={{fontSize:13,color:T.textDim,fontFamily:T.mono,fontWeight:600,textAlign:"center"}}>{p.mins?.toLocaleString()}</div>}
            </div>)}
          </div></TableWrap>

          {/* Value Efficiency */}
          {(()=>{
            const withMV=players.filter(p=>p.marketValue>100000&&p.overall>0);
            const eff=withMV.map(p=>({...p,efficiency:Math.round((p.overall/(p.marketValue/1e6))*10)/10})).sort((a,b)=>b.efficiency-a.efficiency);
            const bargains=eff.slice(0,6);
            const overpaid=[...eff].sort((a,b)=>a.efficiency-b.efficiency).slice(0,6);
            if(!bargains.length)return null;
            const effCard=(p,i,isBargain)=>(
              <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                <div style={{fontFamily:T.display,fontWeight:900,fontSize:14,color:i<3?(isBargain?T.green:T.red):T.textMute,width:18,textAlign:"center"}}>{i+1}</div>
                <TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                  <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team}</div>
                </div>
                <div style={{textAlign:"right",minWidth:70}}>
                  <div style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:isBargain?T.green:T.red}}>{p.efficiency} pts/$M</div>
                  <div style={{fontSize:10,color:T.textMute}}>{fv(p.marketValue)} · {Math.round(p.overall)} grd</div>
                </div>
              </div>
            );
            return <div style={{marginTop:24}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:14}}>Grade-Per-Dollar Efficiency</div>
              <div className="resp-grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:4,height:20,borderRadius:0,background:T.green}}/>
                    <div><div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.green}}>Best Bargains</div><div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Highest grade per $1M market value</div></div>
                  </div>
                  {bargains.map((p,i)=>effCard(p,i,true))}
                </div>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:4,height:20,borderRadius:0,background:T.red}}/>
                    <div><div style={{fontFamily:T.display,fontWeight:700,fontSize:16,color:T.red}}>Most Overpaid</div><div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Lowest grade per $1M market value</div></div>
                  </div>
                  {overpaid.map((p,i)=>effCard(p,i,false))}
                </div>
              </div>
            </div>;
          })()}
        </div>}

        {/* ═══ POSITIONAL ════════════════════════════════════════════════════ */}
        {!loading&&tab==="positions"&&(()=>{
          // Build rich position data
          const posData={};
          players.forEach(p=>{
            const pg=p.position==="Forward"||p.position==="FW"?"Forward":p.position==="Midfielder"||p.position==="MF"?"Midfielder":p.position==="Defender"||p.position==="DF"||p.position==="DEF"?"Defender":(p.position==="GK"||p.position==="Goalkeeper")?"Goalkeeper":"Midfielder";
            if(!posData[pg])posData[pg]={players:[],grades:[],goals:0,assists:0,tackles:0,totalMins:0,totalMV:0,ages:[]};
            posData[pg].players.push(p);
            posData[pg].grades.push(p.overall);
            posData[pg].goals+=(p.goals||0);
            // 6B.1: a group total is only a total if every member contributed a known value.
            if(p.assists!=null)posData[pg].assists+=p.assists;else posData[pg].assistsUnknown=true;/*6B.1-POSTOT*/
            posData[pg].tackles+=(p.tackles||0);
            posData[pg].totalMins+=(p.mins||0);
            posData[pg].totalMV+=(p.marketValue||0);
            if(p.age)posData[pg].ages.push(parseFloat(p.age));
          });
          const posOrder=["Forward","Midfielder","Defender","Goalkeeper"];
          const posEntries=posOrder.filter(p=>posData[p]).map(pos=>{
            const d=posData[pos];
            const n=d.players.length||1;
            const avg=Math.round(d.grades.reduce((a,b)=>a+b,0)/n);
            const top=Math.max(...d.grades);
            const bot=Math.min(...d.grades);
            const avgAge=d.ages.length?Math.round(d.ages.reduce((a,b)=>a+b,0)/d.ages.length*10)/10:null;
            const avgMV=Math.round(d.totalMV/n);
            const top5=[...d.players].sort((a,b)=>b.overall-a.overall).slice(0,5);
            const topScorers=[...d.players].sort((a,b)=>(b.goals||0)-(a.goals||0)).slice(0,3);
            const elite=d.grades.filter(g=>g>=85).length;
            const great=d.grades.filter(g=>g>=75&&g<85).length;
            const above=d.grades.filter(g=>g>=65&&g<75).length;
            const average=d.grades.filter(g=>g>=55&&g<65).length;
            const poor=d.grades.filter(g=>g<55).length;
            // Avg sub-grades
            const avgAtt=Math.round(d.players.reduce((s,p)=>s+p.attack,0)/n);
            const avgPas=Math.round(d.players.reduce((s,p)=>s+p.passing,0)/n);
            const avgDef=Math.round(d.players.reduce((s,p)=>s+p.defense,0)/n);
            const avgCre=Math.round(d.players.reduce((s,p)=>s+p.creativity,0)/n);
            const avgCar=Math.round(d.players.reduce((s,p)=>s+p.carrying,0)/n);
            return{pos,count:d.players.length,avg,top,bot,avgAge,avgMV,top5,topScorers,goals:d.goals,assists:d.assistsUnknown?null:d.assists,tackles:d.tackles,elite,great,above,average,poor,grades:d.grades,avgAtt,avgPas,avgDef,avgCre,avgCar};
          });
          const totalPlayers=players.length;

          return <div style={{animation:"fadeUp .4s ease"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5}}>Positional Breakdown</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginTop:4}}>Grade distribution, top players, and key stat profiles by position group across the league.</div>
          </div>

          {/* Position overview cards */}
          <div className="resp-grid4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {posEntries.map(pe=>(
              <div key={pe.pos} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"16px 14px",textAlign:"center"}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><PosGlyph pos={pe.pos} h={30}/></div>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:T.ink}}>{pe.pos}s</div>
                <div style={{fontFamily:T.display,fontWeight:700,fontSize:28,color:gc(pe.avg),lineHeight:1,marginTop:6}}>{pe.avg}</div>
                <div style={{fontSize:10,color:gc(pe.avg),fontWeight:600,letterSpacing:.8,marginTop:2}}>{gl(pe.avg)} AVG</div>
                <div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans,marginTop:6}}>{pe.count} players</div>
              </div>
            ))}
          </div>

          {/* Detailed position cards */}
          <div className="resp-pos-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(480px,1fr))",gap:16}}>
            {posEntries.map(pe=>(
              <div key={pe.pos} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
                {/* Card header */}
                <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.borderLt}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <PosGlyph pos={pe.pos} h={30}/>
                    <div>
                      <div style={{fontFamily:T.display,fontWeight:700,fontSize:22,color:T.ink}}>{pe.pos}s</div>
                      <div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans}}>{pe.count} players · {pe.goals} goal{pe.goals===1?"":"s"} · {sv(pe.assists)} assist{pe.assists===1?"":"s"}{pe.tackles>0?" · "+pe.tackles+" tackles":""}</div>
                    </div>
                  </div>
                  <Badge grade={pe.avg} size="lg"/>
                </div>

                <div style={{padding:"16px 22px"}}>
                  {/* Sub-grade averages */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
                    {[{l:"ATT",v:pe.avgAtt},{l:"PAS",v:pe.avgPas},{l:"DEF",v:pe.avgDef},{l:"CRE",v:pe.avgCre},{l:"CAR",v:pe.avgCar}].map(g=>(
                      <div key={g.l} style={{textAlign:"center",padding:"8px 4px",background:T.card,borderRadius:0}}>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:gc(g.v),lineHeight:1}}>{g.v}</div>
                        <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.8,marginTop:3}}>{g.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Key stats row */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:16}}>
                    <div style={{padding:"8px",background:T.card,borderRadius:0,textAlign:"center"}}>
                      <div style={{fontFamily:T.mono,fontSize:14,fontWeight:700,color:T.ink}}>{pe.avgAge||"—"}</div>
                      <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5}}>AVG AGE</div>
                    </div>
                    <div style={{padding:"8px",background:T.card,borderRadius:0,textAlign:"center"}}>
                      <div style={{fontFamily:T.mono,fontSize:14,fontWeight:700,color:vc(pe.avgMV)}}>{fv(pe.avgMV)}</div>
                      <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5}}>AVG VALUE</div>
                    </div>
                    <div style={{padding:"8px",background:T.card,borderRadius:0,textAlign:"center"}}>
                      <div style={{fontFamily:T.mono,fontSize:14,fontWeight:700,color:T.ink}}>{pe.top}</div>
                      <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5}}>BEST GRADE</div>
                    </div>
                    <div style={{padding:"8px",background:T.card,borderRadius:0,textAlign:"center"}}>
                      <div style={{fontFamily:T.mono,fontSize:14,fontWeight:700,color:T.red}}>{pe.bot}</div>
                      <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5}}>WORST GRADE</div>
                    </div>
                  </div>

                  {/* Tier distribution bar */}
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,marginBottom:6}}>GRADE DISTRIBUTION</div>
                    <div style={{display:"flex",height:18,borderRadius:0,overflow:"hidden",marginBottom:6}}>
                      {[{c:T.gold,n:pe.elite},{c:T.green,n:pe.great},{c:T.blue,n:pe.above},{c:T.textDim,n:pe.average},{c:T.red,n:pe.poor}].filter(t=>t.n>0).map((t,i)=>(
                        <div key={i} style={{flex:t.n,background:t.c,opacity:.65,display:"flex",alignItems:"center",justifyContent:"center",minWidth:t.n>0?14:0}}>
                          
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {[{l:"Elite",n:pe.elite,c:T.gold},{l:"Great",n:pe.great,c:T.green},{l:"Above",n:pe.above,c:T.blue},{l:"Avg",n:pe.average,c:T.textDim},{l:"Poor",n:pe.poor,c:T.red}].map(t=>(
                        <span key={t.l} style={{fontSize:10,fontFamily:T.sans,color:t.c,fontWeight:600}}>{t.l}: {t.n}</span>
                      ))}
                    </div>
                  </div>

                  {/* Top 5 players */}
                  <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,marginBottom:8}}>TOP 5 RATED</div>
                  {pe.top5.map((p,i)=>(
                    <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",borderBottom:`1px solid ${T.borderLt}`,cursor:"pointer"}}>
                      <div style={{fontFamily:T.display,fontWeight:900,fontSize:14,color:i<3?T.gold:T.textMute,width:18,textAlign:"center"}}>{i+1}</div>
                      <TeamBadge abbr={p.team} size={26} logo={p.teamLogo}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans}}>{p.team} · {p.goals}G {sv(p.assists)}A · {p.mins} min</div>
                      </div>
                      <Badge grade={p.overall} rated={p.rated} size="sm"/>
                    </div>
                  ))}

                  {/* Top scorers if forwards/mids */}
                  {(pe.pos==="Forward"||pe.pos==="Midfielder")&&pe.topScorers[0]?.goals>0&&<div style={{marginTop:14}}>
                    <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,marginBottom:8}}>TOP SCORERS</div>
                    <div style={{display:"flex",gap:8}}>
                      {pe.topScorers.filter(p=>p.goals>0).map((p,i)=>(
                        <div key={p.id} onClick={()=>setSel(p)} style={{flex:1,padding:"10px 8px",background:T.card,borderRadius:0,textAlign:"center",cursor:"pointer",border:`1px solid ${T.borderLt}`}}>
                          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:20,color:T.ink,lineHeight:1}}>{p.goals}</div>
                          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.5,marginTop:2}}>GOALS</div>
                          <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink,marginTop:6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name.split(" ").slice(-1)[0]}</div>
                          <div style={{fontSize:10,color:T.textDim}}>{p.team}</div>
                        </div>
                      ))}
                    </div>
                  </div>}
                </div>
              </div>
            ))}
          </div>

          {/* Grade bar chart per position */}
          <div style={{marginTop:24,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"20px 24px"}}>
            <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:16}}>Position Grade Comparison</div>
            <div className="resp-grid4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
              {posEntries.map(pe=>(
                <div key={pe.pos} style={{textAlign:"center"}}>
                  <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:T.ink,marginBottom:8}}>{pe.pos}s</div>
                  {[{l:"OVR",v:pe.avg},{l:"ATT",v:pe.avgAtt},{l:"PAS",v:pe.avgPas},{l:"DEF",v:pe.avgDef},{l:"CRE",v:pe.avgCre},{l:"CAR",v:pe.avgCar}].map(g=>(
                    <div key={g.l} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:10,color:T.textMute,fontFamily:T.sans,fontWeight:600,width:24}}>{g.l}</span>
                      <div style={{flex:1,height:6,background:T.borderLt,borderRadius:0,overflow:"hidden"}}>
                        <div style={{width:`${Math.max(2,(g.v-40)/60*100)}%`,height:"100%",background:gc(g.v),borderRadius:0,opacity:.6}}/>
                      </div>
                      <span style={{fontSize:11,fontFamily:T.mono,fontWeight:700,color:gc(g.v),width:22,textAlign:"right"}}>{g.v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Age Curve Scatter Plot */}
          {(()=>{
            const withAge=posEntries.flatMap(pe=>pe.top5).length>0?players.filter(p=>p.age&&parseFloat(p.age)>16&&p.overall>0):[];
            if(withAge.length<10)return null;
            const minAge=16,maxAge=40,minG=42,maxG=99;
            const u23Elite=withAge.filter(p=>parseFloat(p.age)<23&&p.overall>=75).sort((a,b)=>b.overall-a.overall).slice(0,5);
            const peakElite=withAge.filter(p=>{const a=parseFloat(p.age);return a>=23&&a<=29&&p.overall>=75;}).sort((a,b)=>b.overall-a.overall).slice(0,5);
            const veteranElite=withAge.filter(p=>parseFloat(p.age)>29&&p.overall>=75).sort((a,b)=>b.overall-a.overall).slice(0,5);

            return <div style={{marginTop:24,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"20px 24px"}}>
              <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:4}}>Age-Grade Curve</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,marginBottom:16}}>Every player plotted by age vs overall grade. Hover to identify, click to open. Find young stars, peak performers, and aging veterans.</div>

              {/* SVG scatter */}
              <div style={{position:"relative",width:"100%",height:320,background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`,overflow:"hidden"}}>
                {/* Quadrant lines */}
                <div style={{position:"absolute",left:`${((23-minAge)/(maxAge-minAge))*100}%`,top:0,bottom:0,borderLeft:`1px dashed ${T.border}`,zIndex:1}}/>
                <div style={{position:"absolute",left:`${((30-minAge)/(maxAge-minAge))*100}%`,top:0,bottom:0,borderLeft:`1px dashed ${T.border}`,zIndex:1}}/>
                <div style={{position:"absolute",top:`${(1-(75-minG)/(maxG-minG))*100}%`,left:0,right:0,borderTop:`1px dashed ${T.border}`,zIndex:1}}/>
                {/* Quadrant labels */}
                <div style={{position:"absolute",left:"4%",top:6,fontSize:10,color:T.green,fontFamily:T.sans,fontWeight:700,opacity:.6}}>Young Stars</div>
                <div style={{position:"absolute",left:`${((23-minAge)/(maxAge-minAge))*100+1}%`,top:6,fontSize:10,color:T.gold,fontFamily:T.sans,fontWeight:700,opacity:.6}}>Peak Years</div>
                <div style={{position:"absolute",left:`${((30-minAge)/(maxAge-minAge))*100+1}%`,top:6,fontSize:10,color:T.blue,fontFamily:T.sans,fontWeight:700,opacity:.6}}>Veterans</div>
                {/* Age axis */}
                {[18,20,22,24,26,28,30,32,34,36,38].map(a=>(
                  <div key={a} style={{position:"absolute",left:`${((a-minAge)/(maxAge-minAge))*100}%`,bottom:4,fontSize:10,color:T.textMute,fontFamily:T.mono,transform:"translateX(-50%)"}}>{a}</div>
                ))}
                {/* Grade axis */}
                {[50,60,70,80,90].map(g=>(
                  <div key={g} style={{position:"absolute",top:`${(1-(g-minG)/(maxG-minG))*100}%`,left:4,fontSize:10,color:T.textMute,fontFamily:T.mono,transform:"translateY(-50%)"}}>{g}</div>
                ))}
                {/* Player dots */}
                {withAge.map(p=>{const age=parseFloat(p.age);const x=((age-minAge)/(maxAge-minAge))*100;const y=(1-(p.overall-minG)/(maxG-minG))*100;return <div key={p.id} onClick={()=>setSel(p)} title={`${p.name} · ${p.age} yrs · ${p.overall} grade`} style={{position:"absolute",left:`${x}%`,top:`${y}%`,width:8,height:8,borderRadius:"50%",background:gc(p.overall),opacity:.5,transform:"translate(-50%,-50%)",cursor:"pointer",transition:"opacity .15s, transform .15s",zIndex:2}} onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translate(-50%,-50%) scale(2)";}} onMouseLeave={e=>{e.currentTarget.style.opacity=".5";e.currentTarget.style.transform="translate(-50%,-50%)";}}/>;})}
              </div>

              {/* Spotlight lists */}
              <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginTop:16}}>
                {[{title:"Young Stars (U23)",color:T.green,list:u23Elite},{title:"Peak Years (23-29)",color:T.gold,list:peakElite},{title:"Elite Veterans (30+)",color:T.blue,list:veteranElite}].map(cat=>(
                  <div key={cat.title}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{width:9,height:9,background:cat.color,display:"inline-block",flexShrink:0}}></span>
                      <span style={{fontSize:11.5,fontFamily:T.sans,fontWeight:700,color:cat.color,letterSpacing:.5}}>{cat.title}</span>
                    </div>
                    {cat.list.length===0&&<div style={{fontSize:11.5,color:T.textMute,fontStyle:"italic",padding:8}}>None qualify</div>}
                    {cat.list.map(p=>(
                      <div key={p.id} onClick={()=>setSel(p)} className="rh" style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",cursor:"pointer",borderBottom:`1px solid ${T.borderLt}`}}>
                        <TeamBadge abbr={p.team} size={20} logo={p.teamLogo}/>
                        <div style={{flex:1,minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div></div>
                        <span style={{fontSize:11,color:T.textDim,fontFamily:T.mono}}>{p.age}y</span>
                        <Badge grade={p.overall} rated={p.rated} size="sm"/>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>;
          })()}
        </div>;})()}

        {/* ═══ COMPARE TAB ═══════════════════════════════════════════════════ */}
        {/* ═══ MATCHUPS INDEX (Phase 5B) ═══ */}
        {!loading&&tab==="matchups"&&<MatchupsView matches={matchesData} teams={enrichedTeams} logos={teamLogos} isMobile={isMobile} onMatchup={(h,a)=>openMatchup(h,a)}
          onCard={fx=>{const st={};standingsData.forEach(s=>{st[s.team]=s;});const teams=enrichedTeams.map(t=>{const s=st[t.abbr]||{};return{...t,pts:s.pts,w:s.w,dr:s.d,l:s.l};});cardMatchPreview({m:fx,teams,logos:teamLogos,matches:matchesData});}}/>}

        {/* ═══ METHODOLOGY & DATA STATUS (Phase 4e) ═══ */}
        {!loading&&tab==="methodology"&&<MethodologyView season={season} currentSeason={CURRENT_SEASON} cacheMeta={cacheMeta} pipeStatus={pipeStatus} rankHistory={rankHistory} players={players} teams={enrichedTeams} isMobile={isMobile} onTab={goTab} onGrading={()=>setShowGrading(true)}/>}

        {/* ═══ MATCHUP PREVIEW (Phase 4c) ═══ */}
        {!loading&&tab==="matchup"&&matchup&&<MatchupView home={matchup.home} away={matchup.away} teams={enrichedTeams} standings={standingsData} matches={matchesData} players={players} logos={teamLogos} isMobile={isMobile}
          onPlayer={p=>setSel(p)} onTeam={ab=>{setExpandTeam(ab);setTeamLevel(1);goTab("teams");}}
          onCard={fx=>{const st={};standingsData.forEach(s=>{st[s.team]=s;});const teams=enrichedTeams.map(t=>{const s=st[t.abbr]||{};return{...t,pts:s.pts,w:s.w,dr:s.d,l:s.l};});cardMatchPreview({m:fx,teams,logos:teamLogos,matches:matchesData});}}/>}

        {!loading&&tab==="compare"&&(()=>{
          const cp=comparePlayers;
          const compColors=["#C1272D","#264653","#B68D40"];
          // 6C: five grades, two vocabularies. If every compared player is a keeper the rows are
          // named on keeper terms; a mixed set keeps the outfield names and says so above, because
          // one row cannot honestly carry both meanings at once.
          const compHasKeeper=cp.some(p=>normalizeGroup(p.position)==="GK");
          const compKeepersOnly=cp.length>0&&cp.every(p=>normalizeGroup(p.position)==="GK");
          const compSubLabel={attack:compKeepersOnly?"Shot-Stop":"Attack",passing:compKeepersOnly?"Distribution":"Passing",defense:compKeepersOnly?"Command":"Defense",creativity:compKeepersOnly?"Sweeping":"Creativity",carrying:compKeepersOnly?"Handling":"Carrying"};/*6C-COMPGK*/
          const compBar=(label,key,max,unit)=>{
            /*6B.1-COMPARE: an unavailable metric renders as an em dash with no bar, never as 0.*/
            const vals=cp.map(p=>(p[key]==null||p[key]===""||isNaN(parseFloat(p[key])))?null:parseFloat(p[key]));const mx=Math.max(max,...vals.filter(v=>v!=null))||1;
            return <div style={{marginBottom:10}}>
              <div style={{fontSize:11.5,color:T.textDim,fontWeight:600,fontFamily:T.sans,marginBottom:5}}>{label}</div>
              {cp.map((p,i)=><div key={p.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:compColors[i],flexShrink:0}}/>
                <div style={{flex:1,height:5,background:T.borderLt,borderRadius:0,overflow:"hidden"}}>
                  <div style={{width:vals[i]==null?0:`${Math.min(100,Math.max(1,(vals[i]/mx)*100))}%`,height:"100%",background:compColors[i],borderRadius:0,opacity:.7,transition:"width .5s ease"}}/>
                </div>
                <span style={{fontFamily:T.mono,fontWeight:600,fontSize:12,color:vals[i]==null?T.textMute:T.ink,width:40,textAlign:"right"}}>{vals[i]==null?"\u2014":(String(vals[i])+(unit||""))}</span>
              </div>)}
            </div>;
          };

          // Player picker (inline search)
          const Picker=()=>{
            const[pq,setPq]=useState("");
            const pRes=useMemo(()=>pq.length<2?[]:players.filter(p=>!cp.find(c=>c.id===p.id)&&(p.name?.toLowerCase().includes(pq.toLowerCase())||p.team?.toLowerCase().includes(pq.toLowerCase()))).slice(0,6),[pq,players,cp]);
            return <div style={{position:"relative"}}>
              <input value={pq} onChange={e=>setPq(e.target.value)} placeholder="Search to add player..." style={{width:"100%",padding:"14px 14px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,color:T.text,fontSize:12,fontFamily:T.sans,outline:"none"}}/>
              {pRes.length>0&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",borderBottomLeftRadius:6,borderBottomRightRadius:6,zIndex:50,boxShadow:"0 8px 24px rgba(0,0,0,.1)",maxHeight:240,overflowY:"auto"}}>
                {pRes.map((p,i)=><div key={p.id} onClick={()=>{addCompare(p);setPq("");}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderTop:i?`1px solid ${T.borderLt}`:"none",cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.card} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <TeamBadge abbr={p.team} size={18} logo={p.teamLogo}/><div style={{flex:1}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink}}>{p.name}</div><div style={{fontSize:14,color:T.textDim}}>{p.position} · {p.team}</div></div><Badge grade={p.overall} rated={p.rated} size="sm"/>
                </div>)}
              </div>}
            </div>;
          };

          return <div style={{animation:"fadeUp .4s ease"}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:26,color:T.ink,letterSpacing:-.5,marginBottom:4}}>{season} Player Comparison{isArchiveSeason&&<span style={{marginLeft:10,fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"3px 7px",letterSpacing:1,verticalAlign:"middle"}}>ARCHIVE</span>}</div>
            <div style={{fontSize:12,color:T.textMute,fontFamily:T.sans,marginBottom:12}}>Select up to 3 players for a side-by-side breakdown of grades, stats, physical attributes, and value. Everyone here is compared <b>within {season}</b> — grades from different seasons rest on different inputs, so the site does not put them in one table.</div>
            {/* 6C: switching season clears the selection rather than guessing an equivalent player
                in the destination season. The reason is stated where the players used to be. */}
            {compareNotice&&<div role="status" style={{marginBottom:16,padding:"10px 14px",border:`1px dashed ${T.accent}`,background:T.surface,fontFamily:T.sans,fontSize:12,color:T.text,lineHeight:1.55}}>{compareNotice}</div>}
            {isArchiveSeason&&cp.length>0&&<div style={{marginBottom:16,padding:"8px 12px",border:`1px dashed ${T.border}`,fontFamily:T.sans,fontSize:11.5,color:T.textDim,lineHeight:1.5}}>Metrics the {season} sources never carried show as {"\u2014"} with no bar. They are unavailable, not zero.{compKeepersOnly?" Sub-grades are named on goalkeeper terms because every player here is a keeper.":compHasKeeper?" One of these players is a goalkeeper: for them the five sub-grades mean Shot-Stop, Distribution, Command, Sweeping and Handling, not the outfield names shown.":""}</div>}

            {/* Player slots */}
            <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:cp.length<3?"1fr 1fr 1fr":"1fr 1fr 1fr",gap:12,marginBottom:24}}>
              {cp.map((p,i)=>(
                <div key={p.id} style={{background:T.surface,border:`2px solid ${compColors[i]}30`,borderRadius:0,padding:"16px",position:"relative"}}>
                  <button onClick={()=>removeCompare(p.id)} style={{position:"absolute",top:8,right:8,background:"none",border:`1px solid ${T.border}`,borderRadius:0,color:T.textMute,width:20,height:20,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:compColors[i]}}/>
                    {(p.localHeadshot||p.headshot)?<img src={p.localHeadshot||p.headshot} alt={p.name} style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:`2px solid ${compColors[i]}40`,flexShrink:0}} onError={e=>{e.target.style.display="none"}}/>:<TeamBadge abbr={p.team} size={28} logo={p.teamLogo}/>}
                  </div>
                  <div style={{fontFamily:T.display,fontWeight:700,fontSize:20,color:T.ink,lineHeight:1,marginBottom:4}}>{p.name}{(p.mins||0)<450&&<span title="Provisional — under 450 minutes played" style={{marginLeft:6,fontSize:9,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 4px",letterSpacing:.5,verticalAlign:"middle"}}>PROV</span>}</div>
                  <div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,marginBottom:10}}>{p.position} · {p.teamName}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                    {/*6C: a keeper's five sub-grades carry keeper names on their own card, whatever the rest of the comparison contains.*/}
                    {(normalizeGroup(p.position)==="GK"?[{l:"Overall",v:p.overall},{l:"Shot-Stop",v:p.attack},{l:"Distribution",v:p.passing},{l:"Command",v:p.defense},{l:"Sweeping",v:p.creativity},{l:"Handling",v:p.carrying}]:[{l:"Overall",v:p.overall},{l:"Attack",v:p.attack},{l:"Passing",v:p.passing},{l:"Defense",v:p.defense},{l:"Creative",v:p.creativity},{l:"Carry",v:p.carrying}]).map(x=>({...x,c:gc(x.v)})).map(g=>(
                      <div key={g.l} style={{textAlign:"center",padding:"6px 4px",background:T.card,borderRadius:0}}>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:18,color:g.c,lineHeight:1}}>{g.v}</div>
                        <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:.8,marginTop:2}}>{g.l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:8,display:"flex",justifyContent:"space-between",fontSize:11.5,color:T.textDim,fontFamily:T.sans}}>
                    <span>{p.age?`${p.age} yrs`:"—"}</span>
                    <span>{p.heightCm?`${Math.floor(p.heightCm/2.54/12)}'${Math.round(p.heightCm/2.54%12)}"`:"—"}</span>
                    <span>{fv(p.marketValue)}</span>
                  </div>
                </div>
              ))}
              {cp.length<3&&<div style={{background:T.card,border:`2px dashed ${T.border}`,borderRadius:0,padding:16,display:"flex",flexDirection:"column",justifyContent:"center",minHeight:200}}>
                <div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans,fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:10,textAlign:"center"}}>Add Player ({cp.length}/3)</div>
                <Picker/>
              </div>}
            </div>

            {/* Comparison charts */}
            {cp.length>=2&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:"24px 28px"}}>
              <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:4}}>Head-to-Head Comparison</div>
              <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                {cp.map((p,i)=><div key={p.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontFamily:T.sans,fontWeight:600,color:T.ink}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:compColors[i]}}/>{p.name}
                </div>)}
              </div>
              {typeof window!=="undefined"&&window.Recharts&&(()=>{
                const {ResponsiveContainer,RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar}=window.Recharts;
                // 6C: the radar axes follow the same rule as the bars — keeper terms when every
                // compared player is a keeper, outfield terms otherwise (with the mix disclosed above).
                const axes=[["Overall","overall"],[compKeepersOnly?"Shot-Stop":"Attack","attack"],[compKeepersOnly?"Distribution":"Passing","passing"],[compKeepersOnly?"Command":"Defense","defense"],[compKeepersOnly?"Sweeping":"Creative","creativity"],[compKeepersOnly?"Handling":"Carry","carrying"]];/*6C-RADARGK*/
                const data=axes.map(([label,key])=>{const row={axis:label};cp.forEach((p,i)=>{const n=parseFloat(p[key]);row["p"+i]=Number.isFinite(n)&&n>0?Math.max(40,Math.min(99,n)):42;});return row;});
                return <div style={{marginBottom:20}}>
                  <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:4}}>The Shape of the Player · Grade Radar</div>
                  <div style={{width:"100%",height:300}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={data} outerRadius="76%">
                        <PolarGrid stroke={T.borderLt}/>
                        <PolarAngleAxis dataKey="axis" tick={{fill:T.textDim,fontFamily:T.mono,fontSize:11.5}}/>
                        <PolarRadiusAxis domain={[40,99]} tick={false} axisLine={false}/>
                        {cp.map((p,i)=><Radar key={p.id} name={p.name} dataKey={"p"+i} stroke={compColors[i]} fill={compColors[i]} fillOpacity={0.12} strokeWidth={2}/>)}
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>;
              })()}
              <div style={{borderTop:`1px solid ${T.borderLt}`,paddingTop:16}}>
                <div className="resp-modal-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
                  <div>
                    <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6}}>ATTACKING</div>
                    {compBar("Goals","goals",20)}{compBar("Assists","assists",15)}{compBar("xG","xGoals",15)}{compBar("xA","xAssists",10)}{compBar("Shots","shots",60)}{compBar("On Target","shotsOnTarget",30)}
                  </div>
                  <div>
                    <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6}}>CREATIVITY & CARRYING</div>
                    {compBar("Key Passes","keyPasses",50)}{compBar("Shot-Creating","sca",70)}{compBar("Dribbles","dribbles",50)}{compBar("Prg Carries","prgCarries",60)}
                  </div>
                  <div>
                    <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6}}>PASSING</div>
                    {compBar("Comp %","passComp",100,"%")}{compBar("Prg Passes","prgPasses",120)}{compBar("Final 3rd","ftPasses",50)}{compBar("Goals Added","totalGA",5)}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:16}}>
                  <div>
                    <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6}}>DEFENSIVE</div>
                    {compBar("Tackles","tackles",40)}{compBar("Pressures","pressures",300)}{compBar("Interceptions","interceptions",40)}{compBar("Aerials Won","aerials",50)}{compBar("Fouls","fouls",25)}
                  </div>
                  <div>
                    <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6}}>GRADES</div>
                    {compBar("Overall","overall",99)}{compBar(compSubLabel.attack,"attack",99)}{compBar(compSubLabel.passing,"passing",99)}{compBar(compSubLabel.defense,"defense",99)}{compBar(compSubLabel.creativity,"creativity",99)}{compBar(compSubLabel.carrying,"carrying",99)}
                  </div>
                </div>
                {/* Physical comparison */}
                <div style={{marginTop:20,borderTop:`1px solid ${T.borderLt}`,paddingTop:16}}>
                  <div style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,marginBottom:12,fontFamily:T.sans}}>PHYSICAL & VALUE</div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${cp.length},1fr)`,gap:12}}>
                    {cp.map((p,i)=>(
                      <div key={p.id} style={{textAlign:"center"}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:compColors[i],margin:"0 auto 8px"}}/>
                        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:16,color:T.ink}}>{p.name.split(" ").slice(-1)[0]}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8}}>
                          <div style={{padding:"6px",background:T.card,borderRadius:0}}>
                            <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:T.ink}}>{p.age||"—"}</div>
                            <div style={{fontSize:10,color:T.textMute,letterSpacing:.8}}>AGE</div>
                          </div>
                          <div style={{padding:"6px",background:T.card,borderRadius:0}}>
                            <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:T.ink}}>{p.heightCm?`${Math.floor(p.heightCm/2.54/12)}'${Math.round(p.heightCm/2.54%12)}"`:"—"}</div>
                            <div style={{fontSize:10,color:T.textMute,letterSpacing:.8}}>HEIGHT</div>
                          </div>
                          <div style={{padding:"6px",background:T.card,borderRadius:0}}>
                            <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:T.ink}}>{p.weightKg?`${Math.round(p.weightKg*2.205)}`:"\u2014"}</div>
                            <div style={{fontSize:10,color:T.textMute,letterSpacing:.8}}>LBS</div>
                          </div>
                          <div style={{padding:"6px",background:T.card,borderRadius:0}}>
                            <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:vc(p.marketValue)}}>{fv(p.marketValue)}</div>
                            <div style={{fontSize:10,color:T.textMute,letterSpacing:.8}}>VALUE</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>}

            {cp.length<2&&<div style={{textAlign:"center",padding:40,color:T.textDim,fontFamily:T.serif,fontStyle:"italic",fontSize:14}}>
              {cp.length===0?"Add at least 2 players to compare":"Add one more player to start comparing"}
            </div>}
          </div>;
        })()}
        {!loading&&tab==="ask"&&<AskDesk/>}
        {!loading&&tab==="trade"&&(()=>{/*TRADE-V2*/
          const teamSel=[["","— select club —"],...MLS_TEAMS.map(t=>[t.abbr,t.name])];
          const nameOf=a=>{const t=MLS_TEAMS.find(x=>x.abbr===a);return t?t.name:a;};
          const rosterOf=t=>players.filter(p=>p.team===t&&!p.departed);
          const rA=trA?rosterOf(trA):[], rB=trB?rosterOf(trB):[];
          const result=(trA&&trB&&trA!==trB&&(trOutA.length||trOutB.length))?tmEvaluate({rosterA:rA,rosterB:rB,outA:trOutA,outB:trOutB,nameA:trA,nameB:trB,assetA:trAstA,assetB:trAstB}):null;
          const PILL={DP:{bg:T.accent,t:"DP"},U22:{bg:T.blue,t:"U22"},INT:{bg:T.gold,t:"INT"}};
          const pills=p=>[p.isDP&&"DP",p.isU22&&"U22",p.isInternational&&"INT"].filter(Boolean);
          const Pills=({p})=><span style={{display:"inline-flex",gap:3,marginLeft:6,verticalAlign:"middle"}}>{pills(p).map(k=><span key={k} style={{fontSize:10,fontWeight:800,letterSpacing:.4,color:"#fff",background:PILL[k].bg,borderRadius:0,padding:"1px 4px",fontFamily:T.sans}}>{PILL[k].t}</span>)}</span>;
          const Face=({p,size})=>(p.localHeadshot||p.headshot)?<img src={p.localHeadshot||p.headshot} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",border:`1px solid ${T.border}`,flexShrink:0}} onError={e=>{e.target.style.display="none";}}/>:<TeamBadge abbr={p.team} size={size} logo={p.teamLogo}/>;
          const Pick=({p,sel,onClick})=>(
            <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 9px",borderRadius:0,cursor:"pointer",background:sel?T.accent+"1A":"transparent",border:`1px solid ${sel?T.accent:"transparent"}`,marginBottom:3,transition:"all .12s"}}>
              <Face p={p} size={34}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:13.5,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{shortName(p.name)}<Pills p={p}/></div><div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans,marginTop:1}}>{p.position}{p.salary?" · $"+(p.salary/1e6).toFixed(1)+"M":""}</div></div>
              <Badge grade={p.overall} rated={p.rated} size="sm"/>
            </div>
          );
          const listCol=(team,setTeam,roster,out,setOut)=>(
            <div style={{flex:1,minWidth:240}}>
              <Select label="Club" value={team} onChange={v=>{setTeam(v);setOut([]);}} options={teamSel} width={210}/>
              {team&&<div style={{marginTop:8,maxHeight:430,overflowY:"auto",border:`1px solid ${T.borderLt}`,borderRadius:0,padding:7,background:T.card}}>
                {[...roster].sort((a,b)=>(b.overall||0)-(a.overall||0)).map(p=><Pick key={p.id} p={p} sel={out.some(x=>x.id===p.id)} onClick={()=>setOut(st=>st.some(x=>x.id===p.id)?st.filter(x=>x.id!==p.id):[...st,p])}/>)}
              </div>}
            </div>
          );
          const moveChip=(p,dir)=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:T.surface,border:`1px solid ${T.borderLt}`,borderRadius:0,marginBottom:5,flexDirection:dir==="right"?"row":"row-reverse"}}>
              <Face p={p} size={26}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textAlign:dir==="right"?"left":"right"}}>{shortName(p.name)}</div></div>
              <span style={{fontSize:13,color:T.textMute}}>{dir==="right"?"→":"←"}</span>
              <Badge grade={p.overall} rated={p.rated} size="sm"/>
            </div>
          );
          const budgetBar=(charge,budget)=>{const pctv=Math.min(100,charge/budget*100);const over=charge>budget;return <div style={{margin:"8px 0 2px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,padding:"4px 0"}}><span style={{color:T.textDim,fontFamily:T.sans}}>Budget charge</span><span style={{fontFamily:T.mono,color:over?T.red:T.ink,fontWeight:over?700:500}}>${(charge/1e6).toFixed(2)}M</span></div><div style={{height:8,borderRadius:0,background:T.borderLt,overflow:"hidden"}}><div style={{height:"100%",width:pctv+"%",background:over?T.red:T.green,transition:"width .3s"}}/></div><div style={{fontSize:11,color:T.textMute,fontFamily:T.mono,marginTop:2,textAlign:"right"}}>of ${(budget/1e6).toFixed(2)}M senior budget</div></div>;};
          const card=(c,name)=>{
            const K=c.constants;
            const row=(label,b,a,bad)=><div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,padding:"4px 0",borderBottom:`1px solid ${T.borderLt}`}}><span style={{color:T.textDim,fontFamily:T.sans}}>{label}</span><span style={{fontFamily:T.mono,color:bad?T.red:T.ink,fontWeight:bad?700:500}}>{b} → <b>{a}</b></span></div>;
            return <div style={{flex:1,minWidth:250,background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,padding:16,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:17,color:T.ink,marginBottom:10,display:"flex",alignItems:"center",gap:8}}><TeamBadge abbr={name} size={24} logo={(players.find(p=>p.team===name)||{}).teamLogo}/>{nameOf(name)}</div>
              {row("Roster size",c.before.size,c.after.size,c.after.size>K.TOTAL_ROSTER_MAX)}
              {row("Designated Players",c.before.dp,c.after.dp,c.after.dp>K.MAX_DP)}
              {row("U22 Initiative",c.before.u22,c.after.u22)}
              {row("Internationals"+(c.intlMax!==K.MAX_INTERNATIONAL?" (of "+c.intlMax+" slots)":""),c.before.intl,c.after.intl,c.after.intl>(c.intlMax!=null?c.intlMax:K.MAX_INTERNATIONAL))}
              {budgetBar(c.after.budgetCharge,K.SENIOR_SALARY_BUDGET)}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",color:T.textDim}}><span style={{fontFamily:T.sans}}>GAM available</span><span style={{fontFamily:T.mono}}>{TM_GAM[name]!=null?"$"+(TM_GAM[name]/1e6).toFixed(2)+"M":"\u2014"}</span></div>
              {c.violations.map((v,i)=><div key={"v"+i} style={{fontSize:11.5,color:T.red,marginTop:7,lineHeight:1.45,display:"flex",gap:5}}><span style={{width:8,height:8,background:T.red,display:"inline-block",flexShrink:0,marginTop:3}}></span><span>{v}</span></div>)}
              {c.warnings.map((w,i)=><div key={"w"+i} style={{fontSize:11.5,color:T.gold,marginTop:5,lineHeight:1.45,display:"flex",gap:5}}><span style={{width:8,height:8,background:T.gold,display:"inline-block",flexShrink:0,marginTop:3}}></span><span>{w}</span></div>)}
            </div>;
          };
          return <div style={{animation:"fadeUp .4s ease"}}>
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:T.display,fontWeight:700,fontSize:28,color:T.ink,letterSpacing:-.5}}>Trade Machine</div>
              <div style={{fontSize:12.5,color:T.textMute,fontFamily:T.sans,marginTop:4,maxWidth:680}}>Build a trade between two clubs and test it against MLS roster rules — DP slots, international slots, roster size, and salary-budget charge. Tap players on each side to include them.</div>
            </div>
            <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:18,alignItems:"flex-start"}}>
              {listCol(trA,setTrA,rA,trOutA,setTrOutA)}
              <div style={{alignSelf:"center",fontFamily:T.display,fontWeight:800,fontSize:24,color:T.textMute,padding:"0 2px"}}>⇄</div>
              {listCol(trB,setTrB,rB,trOutB,setTrOutB)}
            </div>
            {trA&&trB&&trA!==trB&&trOutA.length>0&&<div style={{marginBottom:18}}>
              <button onClick={()=>setTrSug(v=>!v)} style={{fontFamily:T.sans,fontWeight:700,fontSize:12,letterSpacing:.5,color:trSug?T.bg:T.accent,background:trSug?T.accent:"transparent",border:`1.5px solid ${T.accent}`,borderRadius:0,padding:"9px 16px",cursor:"pointer"}}>{trSug?"Hide suggestions":"\u2728 Suggest a fair return from "+nameOf(trB)}</button>
              {trSug&&(()=>{
                const sugs=tmSuggestReturns({rosterA:rA,rosterB:rB,outA:trOutA,exclude:trOutB,nameA:trA,nameB:trB});
                if(!sugs.length)return <div style={{marginTop:10,fontSize:12,color:T.textMute,fontStyle:"italic"}}>No comparable rated players available on {nameOf(trB)}.</div>;
                return <div style={{marginTop:10,background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:10}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,color:T.textMute,textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Closest value matches — tap to add to the return</div>
                  {sugs.map((sg,i)=>{const isPkg=sg.players.length>1;const add=()=>setTrOutB(st=>{const ids=new Set(st.map(x=>x.id));return [...st,...sg.players.filter(p=>!ids.has(p.id))];});return <div key={sg.players.map(p=>p.id).join("-")} onClick={add} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 9px",borderRadius:0,cursor:"pointer",background:isPkg?T.accent+"0C":"transparent",borderBottom:i<sugs.length-1?`1px solid ${T.borderLt}`:"none"}}>
                    <span style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:T.textMute,minWidth:16}}>{i+1}</span>
                    {isPkg?<div style={{display:"flex"}}>{sg.players.map((p,k)=><div key={p.id} style={{marginLeft:k?-9:0,zIndex:9-k}}><Face p={p} size={28}/></div>)}</div>:<Face p={sg.players[0]} size={30}/>}
                    <div style={{flex:1,minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:13.5,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sg.players.map(p=>shortName(p.name)).join(" + ")}{!isPkg&&<Pills p={sg.players[0]}/>}</div><div style={{fontSize:11.5,color:T.textMute,fontFamily:T.sans,marginTop:1}}>{isPkg?"2-player package · $"+(sg.players.reduce((t,p)=>t+(p.salary||0),0)/1e6).toFixed(1)+"M":sg.players[0].position+(sg.players[0].salary?" · $"+(sg.players[0].salary/1e6).toFixed(1)+"M":"")}</div></div>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:0,color:sg.legal?T.green:T.red,background:(sg.legal?T.green:T.red)+"18",fontFamily:T.sans}}>{sg.legal?"LEGAL":"OVER CAP"}</span>
                    <div style={{textAlign:"center",minWidth:42}}><div style={{fontFamily:T.display,fontWeight:800,fontSize:16,color:sg.score>=70?T.green:sg.score>=45?T.gold:T.textMute,lineHeight:1}}>{sg.score}</div><div style={{fontSize:10,color:T.textMute,letterSpacing:.5,fontFamily:T.sans}}>FAIRNESS</div></div>
                    {!isPkg&&<Badge grade={sg.players[0].overall} rated={sg.players[0].rated} size="sm"/>}
                  </div>;})}
                </div>;
              })()}
            </div>}
            {result?<div>
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:18,marginBottom:16}}>
                <div style={{textAlign:"center",fontFamily:T.sans,fontWeight:700,fontSize:11.5,letterSpacing:2,color:T.textMute,textTransform:"uppercase",marginBottom:14}}>⇄ The Deal</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:220}}><div style={{fontSize:11.5,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{nameOf(trA)} sends →</div>{trOutA.length?trOutA.map(p=>moveChip(p,"right")):<div style={{fontSize:12,color:T.textMute,fontStyle:"italic"}}>No players selected</div>}</div>
                  <div style={{flex:1,minWidth:220}}><div style={{fontSize:11.5,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase",textAlign:"right"}}>← {nameOf(trB)} sends</div>{trOutB.length?trOutB.map(p=>moveChip(p,"left")):<div style={{fontSize:12,color:T.textMute,fontStyle:"italic",textAlign:"right"}}>No players selected</div>}</div>
                </div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:12,paddingTop:12,borderTop:`1px solid ${T.borderLt}`}}>
                  {[[trAstA,setTrAstA,nameOf(trA)],[trAstB,setTrAstB,nameOf(trB)]].map(([ast,setAst,nm],i)=>{
                    const stepBtn=(on,txt)=><button onClick={on} style={{width:18,height:18,lineHeight:"15px",padding:0,border:`1px solid ${T.border}`,borderRadius:0,background:T.surface,color:T.ink,cursor:"pointer",fontSize:12,fontFamily:T.mono}}>{txt}</button>;
                    return <div key={i} style={{flex:1,minWidth:240,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:i?"flex-end":"flex-start"}}>
                      <span style={{fontSize:11,color:T.textMute,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{nm} adds</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,fontFamily:T.sans,color:T.textDim}}><span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:.8}}>GAM</span><input type="number" min="0" step="50" value={ast.gam?ast.gam/1000:""} placeholder="0" onChange={e=>setAst({...ast,gam:Math.max(0,(+e.target.value||0))*1000})} style={{width:62,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:0,background:T.surface,color:T.ink,fontFamily:T.mono,fontSize:12}}/>$K GAM</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,fontFamily:T.sans,color:T.textDim}}><span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:.8}}>INTL</span> {stepBtn(()=>setAst({...ast,intl:Math.max(0,(ast.intl||0)-1)}),"−")}<b style={{fontFamily:T.mono,minWidth:10,textAlign:"center"}}>{ast.intl||0}</b>{stepBtn(()=>setAst({...ast,intl:Math.min(3,(ast.intl||0)+1)}),"+")} slot</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,fontFamily:T.sans,color:T.textDim}}><span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,letterSpacing:.8}}>PICKS</span> {stepBtn(()=>setAst({...ast,picks:Math.max(0,(ast.picks||0)-1)}),"−")}<b style={{fontFamily:T.mono,minWidth:10,textAlign:"center"}}>{ast.picks||0}</b>{stepBtn(()=>setAst({...ast,picks:Math.min(4,(ast.picks||0)+1)}),"+")} pick</span>
                    </div>;})}
                </div>
              </div>
              <div style={{textAlign:"center",padding:"14px",borderRadius:0,marginBottom:16,background:result.legal?T.green+"18":T.red+"18",border:`2px solid ${result.legal?T.green:T.red}`}}>
                <div style={{fontFamily:T.display,fontWeight:800,fontSize:22,color:result.legal?T.green:T.red}}>{result.legal?"✓ Trade is Legal":"✗ Trade Not Legal"}</div>
                <div style={{fontSize:11.5,color:T.textDim,marginTop:5,fontFamily:T.sans}}>Fairness: {result.fairness.verdict} · grade {result.fairness.gradeDelta>=0?"+":""}{result.fairness.gradeDelta} to {nameOf(trA)} · salary {result.fairness.salaryDelta>=0?"+":""}${(result.fairness.salaryDelta/1e6).toFixed(1)}M to {nameOf(trA)}{result.fairness.gamDelta?" · GAM "+(result.fairness.gamDelta>0?"+":"")+"$"+(result.fairness.gamDelta/1e6).toFixed(2)+"M to "+nameOf(trA):""}{result.fairness.picksDelta?" · "+(result.fairness.picksDelta>0?"+":"")+result.fairness.picksDelta+" pick(s) to "+nameOf(trA):""}</div>
              </div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>{card(result.teamA,trA)}{card(result.teamB,trB)}</div>
              <div style={{fontSize:11,color:T.textMute,fontStyle:"italic",marginTop:14,lineHeight:1.6,maxWidth:760}}>Slot counts (DP / U22 / International) use official MLS roster data. The salary-budget figure is approximate — TAM-band charges are netted to the max budget charge (assuming TAM covers them), some Designated Player salaries are missing from public data, and only GAM balances are tracked — so "legal" reflects slot/roster compliance plus GAM buy-down of any remaining overage. Constants reflect MLS 2026 rules.</div>
            </div>:<div style={{textAlign:"center",padding:"48px 20px",color:T.textMute,fontSize:13,fontFamily:T.sans}}>{trA&&trB?(trA===trB?"Pick two different clubs.":"Tap players on each side to stage a trade."):"Select two clubs to begin."}</div>}
          </div>;
        })()}

      </main>

      {/* ═══ EMAIL SIGNUP ══════════════════════════════════════════════════ */}
      <div style={{borderTop:`1px solid ${T.border}`,background:T.surface,padding:"32px 24px"}}>
        <div style={{maxWidth:600,margin:"0 auto",textAlign:"center"}}>
          <div style={{fontFamily:T.display,fontWeight:700,fontSize:22,color:T.ink,marginBottom:6}}>Stay in the Loop</div>
          <div style={{fontSize:13,color:T.textDim,fontFamily:T.sans,marginBottom:16,lineHeight:1.6}}>Get weekly TOTW picks, power rankings, and player movers straight to your inbox. Free, no spam.</div>
          <a href="https://usfootyindex.beehiiv.com/subscribe" target="_blank" rel="noopener noreferrer" style={{display:"inline-block",padding:"12px 28px",background:T.ink,color:T.bg,fontFamily:T.sans,fontWeight:600,fontSize:13,letterSpacing:.5,textDecoration:"none",border:"none"}}>Subscribe to the Newsletter →</a>
        </div>
      </div>

      <footer style={{borderTop:`1px solid ${T.border}`,padding:"24px 24px 20px",marginTop:0}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:20}}>
            <div>
              <Logo size={36} dark={dark}/>
              <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans,marginTop:8,lineHeight:1.6,maxWidth:280}}>Advanced player analytics and composite grading for Major League Soccer. Not affiliated with MLS or its clubs. Data from ESPN, American Soccer Analysis, and the official MLS (Opta) feed.</div>
            </div>
            <div className="resp-footer-cols" style={{display:"flex",gap:32}}>
              <div>
                <div style={{fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:8}}>Explore</div>
                {["Player Grades","Season Rating","Defense","Passing","Teams","Rankings","Leaders"].map(l=><div key={l} style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,marginBottom:4,cursor:"pointer"}} onClick={()=>setTab(l==="Player Grades"?"players":l==="Season Rating"?"season":l.toLowerCase())}>{l}</div>)}
              </div>
              <div>
                <div style={{fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:8}}>Tools</div>
                {[["Compare","compare"],["Values","valuations"],["Positional","positions"]].map(([l,id])=><div key={id} style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,marginBottom:4,cursor:"pointer"}} onClick={()=>setTab(id)}>{l}</div>)}
                <div style={{fontSize:11.5,color:T.accent,fontFamily:T.sans,marginBottom:4,cursor:"pointer"}} onClick={()=>setShowGrading(true)}>How We Grade</div>
              </div>
              <div>
                <div style={{fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:8}}>Info</div>
                <div style={{fontSize:11.5,color:T.accent,fontFamily:T.sans,marginBottom:4,cursor:"pointer"}} onClick={()=>setShowAbout(true)}>About</div>
                <div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,marginBottom:4}}>Data: ESPN · ASA · MLS Official</div>
                <div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans,marginBottom:4}}>Season: {season}</div>
                <div style={{fontSize:11.5,color:T.textDim,fontFamily:T.sans}}>v10</div>
              </div>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${T.borderLt}`,marginTop:16,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>© {COPYRIGHT_YEAR} USA Footy Index. All rights reserved.</div>
            <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans}}>Created by Czar of Silly</div>
          </div>
        </div>
      </footer>

      {sel&&<PlayerModal player={sel} onClose={()=>setSel(null)} onCompare={addCompare} isInCompare={comparePlayers.some(c=>c.id===sel.id)} allSeasons={ALL_SEASONS} currentSeason={CURRENT_SEASON} viewingSeason={season} gkCoverage={GK_COVERAGE} onDrillSeason={drillToSeason} canDrillSeason={canDrillSeason} pctRanks={pctRanks[sel.id]} history={playerHistory[sel.id]} formCurve={genFormCurve(sel)} seasonInfo={seasonRatings.ratings.find(r=>r.id===sel.id)||null} similarPlayers={findSimilar(sel.id)} onSelectPlayer={setSel} dark={dark}/>}
    </div>
  );
}

// Render
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(React.createElement(MLSAnalytics));

