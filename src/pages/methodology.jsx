// pages/methodology.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { archiveAuxiliary } from "../analytics/archive.mjs";
import { T } from "../theme.mjs";
import { fmtET, fmtETTime, nextRefreshUTC } from "../util/format.mjs";

export function GradeFlow({isMobile}){
  const steps=[["Per-90 rate","Every count becomes a rate per 90 minutes"],["Sample shrinkage","Pulled toward the league mean by 8 nineties"],["League percentile","Ranked against every outfielder (keepers against keepers)"],["Position weights","Sub-grades blended with weights that fit the role, then measured against a position reference"],["Index Grade (0\u201399)","Blend \u00f7 position reference, ^0.9, \u00d7 99; capped at 99"]];
  return <div style={{margin:"14px 0 6px",border:`1px solid ${T.border}`,borderTop:`3px solid ${T.ink}`,background:T.surface,padding:isMobile?"12px 12px":"14px 16px"}}>
    <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent,marginBottom:10}}>How a grade is made</div>
    <ol style={{listStyle:"none",padding:0,margin:0,display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(5,1fr)",gap:isMobile?0:0}}>
      {steps.map(([t,d],i)=><li key={t} style={{position:"relative",padding:isMobile?"10px 0 10px 40px":"6px 18px 6px 0",borderBottom:isMobile&&i<4?`1px dotted ${T.borderLt}`:"none",borderRight:!isMobile&&i<4?`1px dotted ${T.border}`:"none",marginRight:!isMobile&&i<4?14:0}}>
        <span aria-hidden="true" style={{position:"absolute",left:isMobile?0:"auto",top:isMobile?10:"auto",fontFamily:T.display,fontWeight:900,fontSize:isMobile?26:30,color:T.accent,lineHeight:1,...(isMobile?{}:{position:"static",display:"block",marginBottom:4})}}>{i+1}</span>
        <div style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink,lineHeight:1.2}}>{t}</div>
        <div style={{fontFamily:T.sans,fontSize:12.5,color:T.textDim,marginTop:3,lineHeight:1.4}}>{d}</div>
        {!isMobile&&i<4&&<span aria-hidden="true" style={{position:"absolute",right:-11,top:"46%",fontFamily:T.mono,fontSize:14,color:T.textMute,background:T.surface,lineHeight:1}}>{"\u2192"}</span>}
      </li>)}
    </ol>
  </div>;
}

export function MethodologyView({season,currentSeason,cacheMeta,pipeStatus,rankHistory,players,teams,isMobile,onTab,onGrading}){
  // 6B preflight: pipeline health and ranking snapshots describe the CURRENT cache. Under an archive
  // season they are not merely stale — they are about a different season entirely.
  const _aux=archiveAuxiliary(season,currentSeason,{pipeStatus,rankHistory});/*6B-METHARCHIVE*/
  const isArchive=_aux.isArchive;
  pipeStatus=_aux.pipeStatus;rankHistory=_aux.rankHistory;
  const gen=cacheMeta&&cacheMeta.generated?Date.parse(cacheMeta.generated):null;
  const ageH=gen?Math.round((Date.now()-gen)/36e5):null;
  const graded=players.filter(p=>p.rated!==false&&p.overall!=null).length;
  const departed=players.filter(p=>p.departed).length;
  const withMV=players.filter(p=>+p.marketValue>0).length;
  const withLog=players.filter(p=>p.matchLog&&p.matchLog.length>=5).length;
  const snaps=Array.isArray(rankHistory)?rankHistory:[];
  const nxt=nextRefreshUTC();
  const steps=pipeStatus&&pipeStatus.steps?pipeStatus.steps:null;
  const stale=ageH!=null&&ageH>96;
  const H=(t,id)=><h3 id={id} style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?22:26,color:T.ink,margin:"34px 0 10px",lineHeight:1.15,scrollMarginTop:80}}>{t}</h3>;
  const P=(c)=><p style={{fontFamily:T.serif,fontSize:15,lineHeight:1.65,color:T.text,margin:"0 0 12px"}}>{c}</p>;
  const K=(c)=><code style={{fontFamily:T.mono,fontSize:12.5,background:T.card,padding:"1px 5px",border:`1px solid ${T.borderLt}`}}>{c}</code>;
  const Row=(l,v,ok)=><div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"7px 0",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:12}}><span style={{color:T.textDim}}>{l}</span><span style={{color:ok===false?T.red:ok===true?T.green:T.ink,fontWeight:700,textAlign:"right"}}>{v}</span></div>;
  const W=(rows)=><div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontFamily:T.mono,fontSize:12,margin:"6px 0 12px"}}><thead><tr>{["Position","Attack","Creativity","Goals Added","Carrying","Passing","Defense"].map(h=><th key={h} style={{textAlign:h==="Position"?"left":"right",padding:"6px 8px",borderBottom:`2px solid ${T.ink}`,fontWeight:700,fontSize:11.5,letterSpacing:1,color:T.textDim}}>{h.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r[0]}>{r.map((c,i)=><td key={i} style={{textAlign:i?"right":"left",padding:"6px 8px",borderBottom:`1px dotted ${T.borderLt}`,fontWeight:i?400:700,color:T.ink}}>{i?(c*100).toFixed(0)+"%":c}</td>)}</tr>)}</tbody></table></div>;
  const toc=[["status","Data status"],["grade","How a grade is built"],["weights","Position weights"],["gk","Goalkeepers"],["team","Team grade, table, power rank"],["form","Match ratings & form"],["articles","Articles"],["sources","Sources"],["schedule","Update schedule"],["limits","Limitations"]];
  return <div style={{maxWidth:820,margin:"0 auto"}}>
    <div style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>Methodology {"·"} Data status</div>
    <h2 style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?30:40,color:T.ink,margin:"6px 0 8px",lineHeight:1.05,letterSpacing:-.5}}>How the Index works</h2>
    <p style={{fontFamily:T.serif,fontStyle:"italic",fontSize:16,color:T.textDim,margin:"0 0 18px"}}>What the numbers mean, where they come from, when they update, and where they fall short.</p>
    <nav aria-label="On this page" style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>{toc.map(([id,l])=><a key={id} href={"#"+id} onClick={e=>{e.preventDefault();const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}} style={{fontFamily:T.mono,fontSize:11.5,letterSpacing:.5,color:T.ink,border:`1px solid ${T.border}`,padding:"4px 9px",textDecoration:"none",background:T.card}}>{l}</a>)}</nav>

    {H("Data status","status")}
    <div style={{border:`1px solid ${stale?T.red:T.border}`,background:T.surface,padding:isMobile?"12px 14px":"14px 18px"}}>
      {Row("Last successful update",gen?fmtETTime(gen)+(ageH!=null?` (${ageH<1?"under an hour":ageH+" h"} ago)`:""):"—",gen?!stale:false)}
      {Row("Players in the record",cacheMeta?String(cacheMeta.players):"—")}
      {Row("Players graded (minutes > 0)",String(graded))}
      {Row("Players with 5+ match logs",String(withLog))}
      {Row("Players with a market value",String(withMV))}
      {Row("Flagged departed",String(departed))}
      {Row("Clubs graded",String(teams.filter(t=>t.overall!=null).length)+" / 30")}
      {Row("Sources on last run",cacheMeta&&cacheMeta.sources&&cacheMeta.sources.length?cacheMeta.sources.join(" · "):"—",cacheMeta?cacheMeta.sources.length>=3:null)}
      {steps&&Object.entries(steps).map(([k,v])=>Row("Pipeline · "+k,v+(k==="articles"&&pipeStatus.articleReasonLabel?" — "+pipeStatus.articleReasonLabel:""),v==="ok"))}
      {Row("Ranking snapshots on file",snaps.length?`${snaps.length} (since ${fmtET(snaps[0].date)})`:"none yet")}
      {Row("Next scheduled refresh",nxt?fmtETTime(nxt):"—")}
    </div>
    {P(<>The masthead shows the same update time. If the record is more than four days old, or a source fails, a warning strip appears at the top of every page rather than presenting stale numbers as current.</>)}

    {H("How a grade is built","grade")}
    <GradeFlow isMobile={isMobile}/>
    {P(<><b>1. Rates, not totals.</b> Every counting stat is converted to a per-90 rate so a 1,200-minute player and a 2,400-minute player are judged on the same footing.</>)}
    {P(<><b>2. Shrinkage toward the league.</b> Small samples are pulled toward the league mean: {K("rate′ = (rate × n90 + mean × 8) / (n90 + 8)")}. A player with two games is mostly league-average until he proves otherwise; after twenty games the shrinkage barely registers. Anyone with zero minutes is treated as having 90.</>)}
    {P(<><b>3. Percentile ranks.</b> Each shrunk rate is ranked against every outfield player in the record (goalkeepers against goalkeepers), giving a percentile from 0 to 1. Sub-grades — Attack, Passing, Defense, Creativity, Carrying, and a Goals Added component — are weighted blends of those percentiles. Goals Added (from American Soccer Analysis) is converted to a per-90 rate before this step, expressed per 90 minutes, exactly like every other rate in the engine — not compared as a season-cumulative total.</>)}
    {P(<><b>4. A position-weighted composite.</b> The sub-grades are combined with weights that depend on position (table below). The composite is then measured against a <i>position reference point</i> rather than re-ranked: each position's reference is set so a complete performer at that position lands near the ceiling, which is what lets a centre-back and a striker both reach the high 90s. Position reference points are {K("FW 0.85 · MF 0.82 · DF 0.72 · GK 0.72")}.</>)}
    {P(<><b>5. The 0–99 scale.</b> Sub-grades map with {K("grade = (blend ÷ 0.85)^0.9 × 99")} and Overall with {K("grade = (composite ÷ reference)^0.9 × 99")}, both capped at 99. The exponent below 1 lifts the middle of the scale slightly, so the league median lands in the low 70s rather than at 50. In practice this season's Overall grades run from the high 30s to 99 with a median of 72; only a handful of players who have played fall below 40. Grades are recomputed from scratch on every update, so they can move even when a player doesn't play — the pool moved.</>)}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={onGrading} style={{background:"none",border:`1px solid ${T.border}`,padding:"6px 12px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.accent,borderRadius:0}}>Open the sub-grade definitions</button><button onClick={()=>onTab("players")} style={{background:"none",border:`1px solid ${T.border}`,padding:"6px 12px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,color:T.textDim,borderRadius:0}}>See the grades {"→"}</button></div>

    {H("Position weights","weights")}
    {W([["Forward",.30,.20,.25,.10,.10,.05],["Midfielder",.15,.20,.20,.10,.20,.15],["Defender",.05,.10,.25,.10,.20,.30]])}
    {P(<>Forwards are judged first on attacking output and creation; defenders on defensive actions and their Goals Added; midfielders on a balanced mix with passing and creativity carrying the most weight. Goals Added (from American Soccer Analysis) is the one component every position shares because it values actions by how much they change scoring probability, whoever performs them.</>)}

    {H("Goalkeepers","gk")}
    {P(<>Keepers live in their own pool. Shot-stopping uses Opta's goals-prevented efficiency and saves per 90 with clean-sheet rate; distribution uses passing performance, completion and difficult-pass share. The composite is measured against a reference point for the position (not ranked) and mapped onto the same 0–99 scale with a slightly different curve so the best keeper can still reach 99. Roughly 60% of keepers with a qualifying sample get the full MLS-advanced treatment above; keepers without a qualifying MLS-advanced row fall back to a simpler save percentage and clean-sheet-rate basis. Both land on the same scale, but they are not measured identically.</>)}

    {H("Team grade, points table, power rank","team")}
    {P(<>These are three different questions and the site keeps them apart on purpose.</>)}
    {P(<><b>Team grade</b> is the minutes-weighted average of the roster's Overall grades (departed players excluded). It measures the <i>quality of the players who actually play</i> — it knows nothing about results.</>)}
    {P(<><b>The table</b> is the official standings: points, goal difference, goals for. It measures results, whoever produced them.</>)}
    {/* 6C.1: the Power Rankings card already changes its basis when a season carries no fixture list.
        This page described the current-season formula unconditionally and called the result "right
        now", which is false under an archive season — nothing there is happening now, and the
        recent-form term is not part of the number at all. */}
    {isArchive
      ? P(<><b>Power rank</b> blends the two: {K("62.5% points share + 37.5% team grade")}. The {season} archive carries no fixture-level data, so the recent-form term is omitted rather than filled with a neutral estimate, and the remaining weights are renormalised. It is the Index's season-level blend of results and roster grade for that archive {"\u2014"} not a reading of form.</>)
      : P(<><b>Power rank</b> blends the two with recent form: {K("50% points share + 30% team grade + 20% last-five form")}. It is the site's ranking of who is strongest <i>right now</i>.</>)}
    {P(<>They disagree often, and that is information: a club with the best grade and a mid-table record is underperforming its talent, or its best players are missing. The front page labels its lead as a <b>Team Grade Leader</b> for exactly this reason; the Power Rankings live on the Table tab. {isArchive?<>Movement arrows on the Table compare the power rank to that season{"\u2019"}s own points table; week-over-week movement is a current-season measure and is not claimed for an archive.</>:<>Movement arrows on the Table only show week-over-week change once a genuine prior snapshot exists ({snaps.length} on file); until then they compare against the points table and say so.</>}</>)}

    {H("Match ratings & form","form")}
    {P(<>Player pages show a rating for each match. This is a <b>box-score production proxy</b>, not the Index grade: goals, assists, shots, discipline and minutes; defenders and keepers are also credited for clean sheets and debited for goals conceded while on the pitch. It exists to show direction — form panels, Risers &amp; Fallers, Team of the Week — and the same function feeds every one of those, so a player's form means the same thing everywhere. Match previews add a clearly labelled <i>projection</i> built from the grade gap, points per game and a fixed home-advantage term; it is boxed and marked as an estimate, and it is the only number on the site that is not a measurement.</>)}

    {H("Articles","articles")}
    {P(<>Front-page briefs are generated from a fact packet built out of the record — results, races, standings, verified roster moves — by a language model that is instructed to use only those facts and to search the web before naming any transfer destination. Every brief then passes a validator that checks each player name against the record and rejects speculation. Only approved briefs are shown; anything the validator holds back stays out of sight. A brief also expires: nothing older than seven days, or more than seven days behind the data it sits next to, is displayed. If generation fails, the pipeline status above says why.</>)}

    {H("Sources","sources")}
    {P(<><b>ESPN</b> — rosters, standings, schedule, box scores (goals, assists, shots, fouls, cards, saves), headshots and club logos. <b>American Soccer Analysis</b> — expected goals and assists, Goals Added, expected passing, salaries. <b>MLS Official (Opta)</b> — chances created, key passes, aerials, clearances, pressures, goalkeeper save quality and distribution. <b>MLS Players Association</b> — the salary guide. <b>Transfermarkt</b> — market values, refreshed weekly and carried forward from a cached file when the live source is unreachable.</>)}
    {P(<>The Index is independent and not affiliated with Major League Soccer, its clubs, or any data provider.</>)}

    {H("Update schedule","schedule")}
    {P(<>The record refreshes the morning after each MLS match day: <b>Sunday, Wednesday, Thursday and Saturday at 7:00 AM ET</b>. Each run re-fetches every source, validates the cache (bad dates, duplicates, missing fields, impossible tables and fixtures wrongly marked upcoming all block the publish), snapshots the rankings, regenerates player and match pages, rebuilds the sitemap and then attempts the briefs. A separate Tuesday job drafts the newsletter. Next refresh: <b>{nxt?fmtETTime(nxt):"—"}</b>.</>)}

    {H("Limitations","limits")}
    <ul style={{fontFamily:T.serif,fontSize:15,lineHeight:1.65,color:T.text,paddingLeft:22,margin:"0 0 12px"}}>
      <li>Grades are relative and the scale is 0–99. A 75 is a 75 against this season's pool, not an absolute standard, and the pool moves every update.</li>
      <li>Low-minute players are shrunk hard toward the mean; their grades are placeholders until they play.</li>
      <li>Players under 450 minutes are marked <b>PROV</b> (provisional) wherever grades are shown. This is a display label only — they remain in the same comparison pool and percentile calculations as everyone else, so a provisional grade is directly comparable to a non-provisional one; the tag just flags that the sample behind it is still small.</li>
      <li>Match ratings are a proxy from box-score events. Off-ball work, positioning and errors that don't produce an event are invisible to them.</li>
      <li>Not every player has every source. For some inputs, unavailable data can still be difficult to distinguish from a recorded zero; this remains a disclosed limitation of the current model, and the player page shows a dash instead of a number where a source has no row at all.</li>
      <li>Market values cover most regular starters but not every squad player; ages come from roster feeds and may be approximate.</li>
      <li>Postponed and suspended fixtures stay on the schedule with their original date and are labelled as such.</li>
      <li>The projection on match previews does not use injuries, lineups, travel or odds.</li>
    </ul>
    <div style={{marginTop:24,padding:"12px 14px",border:`1px dashed ${T.border}`,fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim}}>Found a number that looks wrong? The fastest fix is a note with the player or club and the page it appears on — every figure here can be traced to a source row.</div>
  </div>;
}

