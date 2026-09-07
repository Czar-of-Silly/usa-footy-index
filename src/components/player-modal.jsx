// components/player-modal.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { computeForm, matchRating } from "../analytics/form.mjs";
import { cardPlayer } from "../cards/share-cards.jsx";
import { FormSparkline, FormTrend, RadarChart } from "./charts.jsx";
import { Badge, CardButton, PctBadge, SeasonSparkline, TeamBadge } from "./ui.jsx";
import { T, gc, gl, vc } from "../theme.mjs";
import { useEffect, useState } from "../ui/runtime.jsx";
import { dv, fv, sv } from "../util/format.mjs";

// ─── PLAYER MODAL ────────────────────────────────────────────────────────────
export function PlayerModal({player:p,onClose,onCompare,isInCompare,pctRanks,history,formCurve,seasonInfo,similarPlayers,onSelectPlayer,dark:isDarkMode}){
  const[shareMsg,setShareMsg]=useState("");
  const[hsError,setHsError]=useState(false);
  useEffect(()=>setHsError(false),[p?.id]);
  if(!p)return null;
  const ae=Number(p.passAboveExp);
  const pct=pctRanks||{};
  const bar=(label,val,max,highlight,pctKey)=>(
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
      <span style={{fontSize:12,color:T.textDim,width:72,fontWeight:500,flexShrink:0,fontFamily:T.sans}}>{label}</span>
      <div style={{flex:1,height:5,background:T.borderLt,borderRadius:0,overflow:"hidden"}}>
        <div style={{width:`${val==null?0:Math.min(100,Math.max(1,(val/max)*100))}%`,height:"100%",background:highlight?T.ink:"#A09A9060",borderRadius:0,transition:"width .5s ease"}}/>
      </div>
      <span style={{fontFamily:T.mono,fontWeight:600,fontSize:13,color:T.text,width:36,textAlign:"right"}}>{val==null?"—":val}</span>
      {pctKey&&pct[pctKey]!=null&&<PctBadge value={pct[pctKey]}/>}
    </div>
  );
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} className="resp-modal" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,width:"100%",maxWidth:860,maxHeight:"92vh",width:"calc(100% - 16px)",overflowY:"auto",animation:"modalIn .3s ease",boxShadow:"0 24px 60px rgba(0,0,0,.2)",position:"relative"}}>
      {/* Close */}
      <button aria-label="Share this player" title="Copy link" onClick={async()=>{const url=window.location.href;const title=document.title;try{if(navigator.share){await navigator.share({title,url});return;}}catch(e){if(e&&e.name==="AbortError")return;}try{await navigator.clipboard.writeText(url);setShareMsg("Link copied");}catch(e){setShareMsg(url);}setTimeout(()=>setShareMsg(""),1800);}} style={{position:"absolute",top:12,right:46,background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,color:T.ink,height:26,padding:"0 9px",cursor:"pointer",fontSize:11.5,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",fontFamily:T.sans,display:"flex",alignItems:"center",gap:5,zIndex:10}}><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>{shareMsg||"Share"}</button>
      <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,color:T.ink,width:26,height:26,cursor:"pointer",fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,lineHeight:1,fontFamily:T.sans}}>×</button>
      {/* Header */}
      <div style={{padding:"28px 48px 24px 32px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          {(p.localHeadshot||p.headshot)&&!hsError?<img src={p.localHeadshot||p.headshot} alt={p.name} style={{width:76,height:76,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.border}`,flexShrink:0}} onError={()=>setHsError(true)}/>:<TeamBadge abbr={p.team} size={52} logo={p.teamLogo}/>}
          <div style={{flex:1}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:34,color:T.ink,letterSpacing:-.5,lineHeight:1}}>{p.name}</div>
            <div style={{display:"flex",gap:12,marginTop:2,fontSize:13,color:T.textDim,fontFamily:T.sans,flexWrap:"wrap"}}>
              <span style={{fontWeight:600}}>{p.position}</span>{(p.mins||0)<450&&<span title="Provisional — under 450 minutes played" style={{fontSize:10,fontFamily:T.sans,fontWeight:700,color:T.textMute,background:`${T.textMute}15`,padding:"1px 5px",borderRadius:0,letterSpacing:.5,flexShrink:0,marginLeft:6}}>PROV</span>}
              <span style={{color:T.border}}>|</span><span>{p.teamName}{p.prevTeam&&<span style={{fontSize:11.5,color:T.accent,fontWeight:600}}> (prev: {p.prevTeam})</span>}</span>
              <span style={{color:T.border}}>|</span><span>{p.age?`${p.age} yrs`:"—"}</span>
              <span style={{color:T.border}}>|</span><span>{p.heightCm?`${Math.floor(p.heightCm/2.54/12)}'${Math.round(p.heightCm/2.54%12)}"`:"—"}</span>
              <span style={{color:T.border}}>|</span><span>{p.weightKg?`${Math.round(p.weightKg*2.205)} lbs`:"—"}</span>
              <span style={{color:T.border}}>|</span><span>{p.mins?.toLocaleString()} min</span>
            </div>
          </div>
          <Badge grade={p.overall} rated={p.rated} size="lg"/>
        </div>
      </div>

      {/* Grade strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",borderBottom:`1px solid ${T.border}`}}>
        {(p.position==="GK"||p.position==="Goalkeeper"?[{l:"OVERALL",g:p.overall},{l:"SHOT-STOP",g:p.attack},{l:"DISTRIBUTION",g:p.passing},{l:"COMMAND",g:p.defense},{l:"SWEEPING",g:p.creativity},{l:"HANDLING",g:p.carrying}]:[{l:"OVERALL",g:p.overall},{l:"ATTACK",g:p.attack},{l:"PASSING",g:p.passing},{l:"DEFENSE",g:p.defense},{l:"CREATIVITY",g:p.creativity},{l:"CARRYING",g:p.carrying}]).map(r=>(
          <div key={r.l} style={{padding:"18px 12px",textAlign:"center",borderRight:`1px solid ${T.borderLt}`}}>
            <div style={{fontFamily:T.display,fontWeight:700,fontSize:24,color:gc(r.g),lineHeight:1}}>{r.g}</div>
            <div style={{fontSize:11,color:gc(r.g),fontWeight:600,letterSpacing:1.5,marginTop:4,textTransform:"uppercase"}}>{gl(r.g)}</div>
            <div style={{fontSize:11,color:T.textMute,marginTop:2,fontFamily:T.sans,fontWeight:600}}>{r.l}</div>
          </div>
        ))}
      </div>

      {/* Season Rating strip */}
      {seasonInfo&&<div className="resp-season-strip" style={{display:"flex",alignItems:"center",gap:0,borderBottom:`1px solid ${T.border}`,background:T.card}}>
        <div style={{flex:1,padding:"12px 16px",textAlign:"center",borderRight:`1px solid ${T.borderLt}`}}>
          <div style={{fontFamily:T.display,fontWeight:700,fontSize:22,color:gc(seasonInfo.seasonGrade),lineHeight:1}}>{seasonInfo.seasonGrade}</div>
          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,marginTop:3,fontFamily:T.sans}}>SEASON GRADE</div>
        </div>
        <div style={{flex:1,padding:"12px 16px",textAlign:"center",borderRight:`1px solid ${T.borderLt}`}}>
          <div style={{fontFamily:T.mono,fontWeight:700,fontSize:16,color:seasonInfo.posRank<=3?T.gold:seasonInfo.posRank<=10?T.green:T.ink,lineHeight:1}}>#{seasonInfo.posRank} <span style={{fontSize:12,color:T.textMute,fontWeight:500}}>/ {seasonInfo.posTotal}</span></div>
          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,marginTop:3,fontFamily:T.sans}}>{seasonInfo.posGroup} RANK</div>
        </div>
        <div style={{flex:1,padding:"12px 16px",textAlign:"center",borderRight:`1px solid ${T.borderLt}`}}>
          <div style={{fontFamily:T.sans,fontWeight:700,fontSize:14,color:seasonInfo.profile==="Offensive"?T.accent:seasonInfo.profile==="Defensive"?T.blue:T.textDim,lineHeight:1}}>{seasonInfo.profile}</div>
          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,marginTop:3,fontFamily:T.sans}}>PROFILE</div>
        </div>
        <div style={{flex:1,padding:"12px 16px",textAlign:"center",borderRight:`1px solid ${T.borderLt}`}}>
          <div style={{fontFamily:T.mono,fontWeight:700,fontSize:16,color:seasonInfo.consistency>=80?T.green:seasonInfo.consistency>=60?T.blue:T.red,lineHeight:1}}>{seasonInfo.consistency}%</div>
          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,marginTop:3,fontFamily:T.sans}}>CONSISTENCY</div>
        </div>
        <div style={{flex:1,padding:"12px 16px",textAlign:"center"}}>
          <div style={{fontFamily:T.mono,fontWeight:700,fontSize:16,color:T.ink,lineHeight:1}}>{seasonInfo.impactPer90}</div>
          <div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1,marginTop:3,fontFamily:T.sans}}>IMPACT/90</div>
        </div>
      </div>}

      {/* Stats — 3x2 grid */}
      <div className="resp-col resp-pad" style={{padding:"24px 38px",display:"flex",gap:28,borderBottom:`1px solid ${T.borderLt}`,alignItems:"center"}}>
        <RadarChart grades={{overall:p.overall,attack:p.attack,passing:p.passing,defense:p.defense,creativity:p.creativity,carrying:p.carrying}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:10}}>Percentile Ranks vs All Players</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px 16px"}}>
            {[{l:"Overall",k:"overall"},{l:"Attack",k:"attack"},{l:"Passing",k:"passing"},{l:"Defense",k:"defense"},{l:"Creativity",k:"creativity"},{l:"Carrying",k:"carrying"},{l:"Goals",k:"goals"},{l:"Assists",k:"assists"},{l:"Clearances",k:"clearances"},{l:"Key Passes",k:"keyPasses"},{l:"Dribbles",k:"dribbles"},{l:"Pressures",k:"pressures"}].map(s=>{
              const v=pct[s.k];const c=v>=90?"#B68D40":v>=75?T.green:v>=50?T.blue:v>=25?T.textDim:T.red;
              return <div key={s.k} style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:T.textDim,width:60,fontFamily:T.sans}}>{s.l}</span>
                <div style={{flex:1,height:3,background:T.borderLt,borderRadius:0,overflow:"hidden"}}>
                  <div style={{width:`${v||0}%`,height:"100%",background:c||T.textMute,borderRadius:0,opacity:.6}}/>
                </div>
                <span style={{fontSize:11,fontFamily:T.mono,fontWeight:700,color:c||T.textMute,width:26,textAlign:"right"}}>{v!=null?v+"th":"—"}</span>
              </div>;
            })}
          </div>
        </div>
      </div>

      {/* ── FORM & HISTORY SPARKLINES ── */}
      {(formCurve||history)&&<div className="resp-col" style={{padding:"16px 32px",display:"flex",gap:20,borderBottom:`1px solid ${T.borderLt}`,alignItems:"stretch"}}>
        {formCurve&&formCurve.length>1&&<div style={{flex:2,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div>
              <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase"}}>
                {formCurve[0]?.opp?"Match-by-Match Form":"Season Form Curve"}
              </div>
              <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans,marginTop:2}}>
                {formCurve[0]?.opp?`${formCurve.length} appearances · Real ESPN boxscore data`:`Estimated across ${formCurve.length} match windows`}
              </div>
            </div>
            {formCurve[0]?.opp&&<div style={{fontSize:11,fontFamily:T.mono,fontWeight:700,color:gc(formCurve[formCurve.length-1]?.grade||55)}}>
              Latest: {formCurve[formCurve.length-1]?.grade}
            </div>}
          </div>
          <FormSparkline data={formCurve} height={56}/>
          {/* Match detail row when real data */}
          {formCurve[0]?.opp&&<div style={{display:"flex",gap:2,marginTop:6,overflowX:"auto",paddingBottom:4}}>
            {formCurve.map((m,i)=>(
              <div key={i} style={{minWidth:38,textAlign:"center",padding:"4px 3px",background:i===formCurve.length-1?`${gc(m.grade)}10`:T.card,borderRadius:0,border:i===formCurve.length-1?`1px solid ${gc(m.grade)}30`:`1px solid ${T.borderLt}`,flexShrink:0,cursor:"default"}} title={`${m.ha} vs ${m.opp} · ${m.mins}min · ${m.g}G ${m.a}A`}>
                <div style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,color:gc(m.grade),lineHeight:1}}>{m.grade}</div>
                <div style={{fontSize:10,color:T.textMute,marginTop:2,fontFamily:T.sans}}>{m.opp}</div>
                <div style={{fontSize:10,color:m.g>0?T.green:T.textMute,fontFamily:T.mono}}>{m.g>0?`${m.g}G`:m.a>0?`${m.a}A`:"·"}</div>
              </div>
            ))}
          </div>}
          {!formCurve[0]?.opp&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>Start</span>
            <span style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>Current</span>
          </div>}
        </div>}
        {history&&history.length>0&&<div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:8}}>Season History</div>
          <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans,marginBottom:6}}>{history.length} season{history.length>1?"s":""} tracked</div>
          <SeasonSparkline seasons={history} height={56}/>
        </div>}
        {history&&history.length>1&&<div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:8}}>Grade Breakdown by Season</div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${history.length},1fr)`,gap:8,marginTop:4}}>
            {history.map(s=>(
              <div key={s.year} style={{textAlign:"center"}}>
                <div style={{fontFamily:T.mono,fontSize:12,fontWeight:700,color:T.textMute,marginBottom:6}}>{s.year}</div>
                {[{l:"OVR",v:s.overall},{l:"ATT",v:s.attack},{l:"PAS",v:s.passing},{l:"DEF",v:s.defense},{l:"CRE",v:s.creativity},{l:"CAR",v:s.carrying}].map(g=>(
                  <div key={g.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 6px",marginBottom:2,borderRadius:0,background:g.l==="OVR"?`${gc(g.v)}08`:"transparent"}}>
                    <span style={{fontSize:10,color:T.textMute,fontFamily:T.sans,fontWeight:600}}>{g.l}</span>
                    <span style={{fontSize:11.5,fontFamily:T.mono,fontWeight:700,color:gc(g.v)}}>{g.v}</span>
                  </div>
                ))}
                <div style={{marginTop:4,borderTop:`1px solid ${T.borderLt}`,paddingTop:4}}>
                  <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>{s.goals}G {s.assists}A</div>
                  <div style={{fontSize:10,color:T.textMute,fontFamily:T.sans}}>{s.mins} min</div>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>}

      {/* Detailed Stats — 3x2 grid */}
      {(p.position==="GK"||p.position==="Goalkeeper")?
      <div className="resp-modal-stats" style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>SHOT-STOPPING</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.attack)}}>{p.attack} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.attack)}</span></span>
          </div>
          {bar("Saves",p.saves||0,40,true)}{bar("Clean Sheets",p.cleanSheets||0,10,true)}{bar("Goals Against",p.goalsConceded||0,20,false)}
          {p.saves>0&&p.goalsConceded>=0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5,marginTop:6}}><span style={{fontSize:12,color:T.textDim}}>Save %</span><span style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:T.green}}>{p.saves>0?Math.round((p.saves/(p.saves+p.goalsConceded))*100):0}%</span></div>}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>DISTRIBUTION</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.passing)}}>{p.passing} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.passing)}</span></span>
          </div>
          {bar("Comp %",p.passComp,100,true)}{bar("Prg Passes",p.prgPasses||0,30,true)}{bar("Final 3rd",p.ftPasses||0,15,false)}
          {p.passAboveExp!=null&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.textDim}}>vs Expected</span><span style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:ae>=0?T.green:T.red}}>{ae>=0?"+":""}{p.passAboveExp}%</span></div>}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>COMMAND</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.defense)}}>{p.defense} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.defense)}</span></span>
          </div>
          {bar("Ball Recovery",p.pressures||0,80,true)}{bar("Aerials Won",p.aerials||0,20,true)}{bar("Interceptions",p.interceptions||0,10,false)}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>OVERVIEW</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.overall)}}>{(+p.overall).toFixed(1)} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.overall)}</span></span>
          </div>
          {[["Saves",p.saves||0],["Clean Sheets",p.cleanSheets||0],["Goals Against",p.goalsConceded||0],["Games",Math.round((p.mins||0)/90)],["Minutes",p.mins?.toLocaleString()],["Value",<span style={{color:vc(p.marketValue),fontWeight:600}}>{fv(p.marketValue)}</span>],["Salary",<span style={{fontWeight:600}}>{p.salary?`$${(p.salary/1000).toFixed(0)}K`:"—"}</span>]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{fontSize:12,color:T.textDim,fontFamily:T.sans}}>{l}</span>
              <span style={{fontFamily:T.serif,fontWeight:600,fontSize:14,color:T.text}}>{dv(v)}</span>
            </div>
          ))}
        </div>
      </div>
      :
      <div className="resp-modal-stats" style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>ATTACKING</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.attack)}}>{p.attack} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.attack)}</span></span>
          </div>
          {bar("Goals",p.goals,20,true,"goals")}{bar("Assists",p.assists,15,true,"assists")}{bar("xG",p.xGoals,2.5,false)}{bar("xA",p.xAssists,2.5,false)}{bar("Shots",p.shots||0,60,false)}{bar("On Target",p.shotsOnTarget||0,30,false)}{bar("Official xG",p.officialXg,12,false)}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>CREATIVITY</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.creativity)}}>{p.creativity} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.creativity)}</span></span>
          </div>
          {bar("Key Passes",p.keyPasses||0,50,true,"keyPasses")}{bar("Chances",p.chances,60,true,"chances")}{bar("xA",p.xAssists,10,false)}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>PASSING</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.passing)}}>{p.passing} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.passing)}</span></span>
          </div>
          {bar("Comp %",p.passComp,100,true)}{bar("xComp %",p.xPassComp,100,false)}{bar("Prg Passes",p.prgPasses||0,120,true,"prgPasses")}{bar("Final 3rd",p.ftPasses||0,50,false)}
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.textDim}}>vs Expected</span><span style={{fontFamily:T.mono,fontWeight:700,fontSize:14,color:p.passAboveExp!=null?(ae>=0?T.green:T.red):T.textMute}}>{p.passAboveExp!=null?`${ae>=0?"+":""}${p.passAboveExp}%`:"—"}</span></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>DEFENSIVE</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.defense)}}>{p.defense} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.defense)}</span></span>
          </div>
          {bar("Clearances",p.clearances||0,80,true,"clearances")}{bar("Pressures",p.pressures||0,300,true,"pressures")}{bar("Aerial Win %",p.aerialPct,100,true,"aerialPct")}{bar("Aerials Won",p.aerials||0,50,false,"aerials")}{bar("Fouls",p.fouls||0,25,false)}
          <div style={{display:"flex",gap:12,marginTop:6}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:12,borderRadius:0,background:"#E8C94A"}}/><span style={{fontSize:13,color:T.textDim,fontFamily:T.mono,fontWeight:600}}>{sv(p.yellowCards)}</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:12,borderRadius:0,background:T.red}}/><span style={{fontSize:13,color:T.textDim,fontFamily:T.mono,fontWeight:600}}>{sv(p.redCards)}</span></div>
          </div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>CARRYING</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.carrying)}}>{p.carrying} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.carrying)}</span></span>
          </div>
          {bar("Dribbles",p.dribbles||0,50,true,"dribbles")}{bar("Prg Carries",p.prgCarries||0,60,true,"prgCarries")}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.borderLt}`,paddingBottom:6,marginBottom:12}}>
            <span style={{fontSize:11.5,color:T.ink,fontWeight:700,letterSpacing:2,fontFamily:T.sans}}>OVERVIEW</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:gc(p.overall)}}>{(+p.overall).toFixed(1)} <span style={{fontSize:11,fontWeight:600,letterSpacing:.5,opacity:.8}}>{gl(p.overall)}</span></span>
          </div>
          {[["Goals Added",<span style={{color:+p.totalGA>=0?T.green:T.red,fontWeight:700}}>{+p.totalGA>=0?"+":""}{p.totalGA}</span>],["xG/90",p.xg90],["xA/90",p.xa90],["Height",p.heightCm?`${Math.floor(p.heightCm/2.54/12)}'${Math.round(p.heightCm/2.54%12)}" (${p.heightCm}cm)`:"—"],["Weight",p.weightKg?`${Math.round(p.weightKg*2.205)} lbs (${p.weightKg}kg)`:"—"],["Value",<span style={{color:vc(p.marketValue),fontWeight:600}}>{fv(p.marketValue)}</span>],["Salary",<span style={{fontWeight:600}}>{p.salary?`$${(p.salary/1000).toFixed(0)}K`:"—"}</span>],["Minutes",p.mins?.toLocaleString()]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{fontSize:12,color:T.textDim,fontFamily:T.sans}}>{l}</span>
              <span style={{fontFamily:T.serif,fontWeight:600,fontSize:14,color:T.text}}>{dv(v)}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* ── FORM ── */}
      {p.matchLog&&p.matchLog.length>=2&&(()=>{
        const f=computeForm(p.matchLog,p.position);if(!f)return null;
        const dl=f.delta==null?null:Math.round(f.delta*10)/10;
        const tile=(label,val,sub,color)=><div style={{background:T.card,border:`1px solid ${T.borderLt}`,padding:"10px 12px",minWidth:0}}>
          <div style={{fontFamily:T.display,fontWeight:900,fontSize:24,lineHeight:1,color:color||T.ink,letterSpacing:-.5}}>{val}</div>
          <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",fontFamily:T.sans,marginTop:5}}>{label}</div>
          {sub&&<div style={{fontSize:11,color:T.textDim,fontFamily:T.sans,marginTop:2}}>{sub}</div>}
        </div>;
        const pill=(r,i)=><span key={i} aria-label={r==="W"?"win":r==="D"?"draw":"loss"} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontFamily:T.mono,fontWeight:700,fontSize:12,color:T.bg,background:r==="W"?T.green:r==="D"?T.textDim:T.red}}>{r}</span>;
        return <div style={{padding:"16px 28px",borderTop:`1px solid ${T.borderLt}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase"}}>Form {"\u00b7"} last {Math.min(5,f.count)} of {f.count}</div>
            <div style={{display:"flex",gap:4}}>{f.res.map(pill)}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(104px,1fr))",gap:8,marginBottom:12}}>
            {tile("Last 5 avg",f.last5Avg!=null?Math.round(f.last5Avg):"\u2014",null,f.last5Avg!=null?gc(f.last5Avg):null)}
            {tile("Season avg",f.seasonAvg!=null?Math.round(f.seasonAvg):"\u2014",f.count+" games")}
            {tile("Movement",dl==null?"\u2014":(dl>0?"+":"")+dl,f.basis==="prev"?"vs previous five":"vs season average",dl==null?null:dl>0?T.green:dl<0?T.red:T.textDim)}
            {tile("G / A",f.g+" / "+f.a,"last five")}
            {tile("Minutes",f.mins,"last five")}
            {tile("Record",f.w+"-"+f.d+"-"+f.l,"W-D-L, last five")}
          </div>
          <FormTrend matchLog={p.matchLog} pos={p.position}/>
          <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim,marginTop:6,lineHeight:1.5}}>Match ratings are a production proxy built from each game's box score (goals, assists, shots, discipline, minutes; clean sheets and goals conceded for defenders and keepers). They are not the full Index grade, which is percentile-based across the season.</div>
        </div>;
      })()}

      {/* ── MATCH LOG TABLE ── */}
      {p.matchLog&&p.matchLog.length>0&&<div style={{padding:"16px 28px",borderTop:`1px solid ${T.borderLt}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase"}}>Match Log</div>
          <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>Most recent first</div>
        </div>
        <div style={{maxHeight:200,overflowY:"auto",overflowX:"auto",borderRadius:0,border:`1px solid ${T.borderLt}`,WebkitOverflowScrolling:"touch"}}>
          <div style={{display:"grid",gridTemplateColumns:"64px 40px 36px 36px 30px 30px 36px 1fr",fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:.5,fontFamily:T.sans,textTransform:"uppercase",padding:"6px 10px",background:T.card,borderBottom:`1px solid ${T.border}`,position:"sticky",top:0}}>
            <div>Date</div><div>Opp</div><div style={{textAlign:"center"}}>H/A</div><div style={{textAlign:"center"}}>Min</div><div style={{textAlign:"center"}}>G</div><div style={{textAlign:"center"}}>A</div><div style={{textAlign:"center"}}>Rtg</div><div style={{textAlign:"center"}}>Result</div>
          </div>
          {[...p.matchLog].reverse().map((m,i)=>{
            const dt=m.date?new Date(m.date):null;
            const dateStr=dt?`${dt.getMonth()+1}/${dt.getDate()}`:"—";
            const rating=matchRating(m,p.position);
            const isWin=m.ha==="H"?(m.hs||0)>(m.as||0):(m.as||0)>(m.hs||0);
            const isDraw=(m.hs||0)===(m.as||0);
            const resultColor=isWin?T.green:isDraw?T.textDim:T.red;
            const resultText=m.ha==="H"?`${m.hs}-${m.as}`:`${m.as}-${m.hs}`;
            return <div key={i} style={{display:"grid",gridTemplateColumns:"64px 40px 36px 36px 30px 30px 36px 1fr",padding:"6px 10px",fontSize:12,borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.card}}>
              <div style={{fontFamily:T.mono,color:T.textDim,fontSize:11.5}}>{dateStr}</div>
              <div style={{fontFamily:T.sans,fontWeight:600,color:T.ink,fontSize:11.5}}>{m.opp}</div>
              <div style={{textAlign:"center",fontSize:11,color:T.textMute}}>{m.ha}</div>
              <div style={{textAlign:"center",fontFamily:T.mono,color:T.textDim}}>{m.mins}'</div>
              <div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,color:m.g>0?T.green:T.textMute}}>{m.g||0}</div>
              <div style={{textAlign:"center",fontFamily:T.serif,fontWeight:700,color:m.a>0?T.blue:T.textMute}}>{m.a||0}</div>
              <div style={{textAlign:"center",fontFamily:T.mono,fontWeight:700,color:gc(rating),fontSize:12}}>{rating}</div>
              <div style={{textAlign:"center",fontFamily:T.mono,fontWeight:600,fontSize:11.5,color:resultColor}}>{resultText} {isWin?"W":isDraw?"D":"L"}</div>
            </div>;
          })}
        </div>
      </div>}

      {/* ── SIMILAR PLAYERS ── */}
      {similarPlayers&&similarPlayers.length>0&&<div style={{padding:"16px 28px",borderTop:`1px solid ${T.borderLt}`}}>
        <div style={{fontSize:11.5,color:T.textMute,fontWeight:600,letterSpacing:1.5,fontFamily:T.sans,textTransform:"uppercase",marginBottom:4}}>Similar Players</div>
        <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans,marginBottom:10}}>Most statistically similar {p.position}s based on percentile profile distance</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
          {similarPlayers.map((sp,i)=>(
            <div key={sp.id} onClick={()=>onSelectPlayer&&onSelectPlayer(sp)} style={{minWidth:110,padding:"12px 10px",background:T.card,borderRadius:0,border:`1px solid ${T.borderLt}`,textAlign:"center",cursor:"pointer",flexShrink:0,transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.borderLt}>
              {(sp.localHeadshot||sp.headshot)?<img src={sp.localHeadshot||sp.headshot} alt={sp.name} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",border:`2px solid ${T.borderLt}`,margin:"0 auto 6px",display:"block"}} onError={e=>{e.target.style.display="none"}}/>:<TeamBadge abbr={sp.team} size={28} logo={sp.teamLogo}/>}
              <div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sp.name.split(" ").slice(-1)[0]}</div>
              <div style={{fontSize:10,color:T.textDim,fontFamily:T.sans,marginTop:2}}>{sp.team}</div>
              <Badge grade={sp.overall} rated={sp.rated} size="sm"/>
              <div style={{fontSize:10,color:T.green,fontFamily:T.mono,fontWeight:700,marginTop:4}}>{sp.similarity}% match</div>
            </div>
          ))}
        </div>
      </div>}

            <div style={{padding:"12px 28px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color:T.textMute,fontFamily:T.sans,fontStyle:"italic"}}>Stats via ESPN, ASA, MLS Official · USA Footy Index</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={async()=>{
            const isDark=isDarkMode;const W=720,H=1000;
            const loadImg=(src)=>new Promise(r=>{if(!src)return r(null);const img=new Image();img.crossOrigin="anonymous";img.onload=()=>r(img);img.onerror=()=>r(null);img.src=src;setTimeout(()=>r(null),5000);});
            const loadImgLocal=(src)=>new Promise(r=>{if(!src)return r(null);const img=new Image();img.onload=()=>r(img);img.onerror=()=>r(null);img.src=src;setTimeout(()=>r(null),3000);});
            const[headImg,logoImg,siteLogo]=await Promise.all([loadImg(p.localHeadshot||p.headshot),loadImg(p.teamLogo),loadImgLocal(isDark?"./logo-dark.png":"./logo.png")]);
            const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
            const BG=isDark?"#0f1724":"#E1CDAC";const INK=isDark?"#E8E4DA":"#2E2922";const DIM=isDark?"#8B8680":"#5C5240";
            const MUTE=isDark?"#5a5550":"#8B7B58";const BORDER=isDark?"#2a3040":"#A3814B";const CARD=isDark?"#1a2232":"#EBDFC4";
            const GOLD="#B68D40";const GREEN="#2D6A4F";const BLUE="#264653";const RED="#9B2226";
            const gcC=g=>g>=85?GOLD:g>=75?GREEN:g>=65?BLUE:g>=55?DIM:RED;
            const glC=g=>g>=85?"ELITE":g>=75?"GREAT":g>=65?"ABOVE AVG":g>=55?"AVG":"POOR";
            x.fillStyle=BG;x.fillRect(0,0,W,H);
            x.fillStyle=INK;x.fillRect(0,0,W,60);
            x.fillStyle=BG;x.font="bold 13px Inter,sans-serif";x.fillText("USA FOOTY INDEX",24,28);
            x.font="9px Inter,sans-serif";x.fillText("PLAYER CARD",24,44);
            x.fillStyle=GOLD;x.textAlign="right";x.fillText("usfootyindex.com",W-24,38);x.textAlign="left";
            const hsSize=80,hsX=30,hsY=80;
            if(headImg){x.save();x.beginPath();x.arc(hsX+hsSize/2,hsY+hsSize/2,hsSize/2,0,Math.PI*2);x.clip();
              const iw=headImg.naturalWidth,ih=headImg.naturalHeight;const scale=Math.max(hsSize/iw,hsSize/ih);const sw=iw*scale,sh=ih*scale;const sx=hsX+(hsSize-sw)/2,sy=hsY+(hsSize-sh)/2;
              x.drawImage(headImg,sx,sy,sw,sh);x.restore();x.beginPath();x.arc(hsX+hsSize/2,hsY+hsSize/2,hsSize/2,0,Math.PI*2);x.strokeStyle=gcC(p.overall);x.lineWidth=2.5;x.stroke();}
            else{x.beginPath();x.arc(hsX+hsSize/2,hsY+hsSize/2,hsSize/2,0,Math.PI*2);x.fillStyle=CARD;x.fill();x.strokeStyle=gcC(p.overall);x.lineWidth=2.5;x.stroke();x.fillStyle=gcC(p.overall);x.font="bold 28px Georgia,serif";x.textAlign="center";x.fillText(p.name.charAt(0),hsX+hsSize/2,hsY+hsSize/2+10);x.textAlign="left";}
            if(logoImg){x.drawImage(logoImg,hsX+hsSize-18,hsY+hsSize-18,24,24);}
            x.fillStyle=INK;x.font="bold 28px 'Source Serif 4',Georgia,serif";x.fillText(p.name,hsX+hsSize+20,hsY+32);
            x.fillStyle=DIM;x.font="13px Inter,sans-serif";x.fillText(`${p.position} · ${p.teamName||p.team} · Age ${p.age||"?"} · ${p.mins?.toLocaleString()||0} min`,hsX+hsSize+20,hsY+55);
            const ovX=W-130,ovY=78;
            x.fillStyle=`${gcC(p.overall)}18`;x.beginPath();x.roundRect(ovX,ovY,90,80,8);x.fill();
            x.strokeStyle=gcC(p.overall);x.lineWidth=2;x.beginPath();x.roundRect(ovX,ovY,90,80,8);x.stroke();
            x.fillStyle=gcC(p.overall);x.font="bold 38px 'Source Serif 4',Georgia,serif";x.textAlign="center";x.fillText(Math.round(p.overall),ovX+45,ovY+48);
            x.font="bold 9px Inter,sans-serif";x.fillText(glC(p.overall),ovX+45,ovY+66);x.textAlign="left";
            x.fillStyle=BORDER;x.fillRect(30,178,W-60,1);
            const cats=[{l:"ATT",v:p.attack},{l:"PAS",v:p.passing},{l:"DEF",v:p.defense},{l:"CRE",v:p.creativity},{l:"CAR",v:p.carrying}];
            const gapW=(W-60)/5;
            cats.forEach((cat,i)=>{const cx=30+i*gapW+gapW/2;x.fillStyle=gcC(cat.v);x.font="bold 24px 'Source Serif 4',Georgia,serif";x.textAlign="center";x.fillText(cat.v,cx,212);x.fillStyle=MUTE;x.font="bold 8px Inter,sans-serif";x.fillText(cat.l,cx,226);});x.textAlign="left";
            x.fillStyle=BORDER;x.fillRect(30,240,W-60,1);
            x.fillStyle=MUTE;x.font="bold 9px Inter,sans-serif";x.fillText("KEY STATS",30,268);
            const stats=[["Goals",p.goals],["Assists",p.assists],["xG",p.xGoals],["xA",p.xAssists],["Goals Added",p.totalGA],["Pass %",p.passComp+"%"],["Tackles",p.tackles||"—"],["Shots/On Target",p.shots!=null?p.shots+"/"+p.shotsOnTarget:"—"],["Market Value",p.marketValue>0?"$"+(p.marketValue/1e6).toFixed(1)+"M":"—"]];
            stats.forEach((s,i)=>{const sy=290+i*28;x.fillStyle=DIM;x.font="12px Inter,sans-serif";x.fillText(s[0],30,sy);x.fillStyle=INK;x.font="bold 14px 'Source Serif 4',Georgia,serif";x.textAlign="right";x.fillText(String(s[1]),310,sy);x.textAlign="left";x.fillStyle=BORDER;x.fillRect(30,sy+8,290,0.5);});
            const radarX=520,radarY=395,radarR=115;
            const rCats=[p.attack,p.passing,p.defense,p.creativity,p.carrying,p.overall];const rLabels=["ATT","PAS","DEF","CRE","CAR","OVR"];
            for(let ring=1;ring<=4;ring++){x.beginPath();const rr=radarR*(ring/4);for(let i=0;i<6;i++){const a=Math.PI*2*i/6-Math.PI/2;x.lineTo(radarX+rr*Math.cos(a),radarY+rr*Math.sin(a));}x.closePath();x.strokeStyle=BORDER;x.lineWidth=0.5;x.stroke();}
            x.beginPath();rCats.forEach((v,i)=>{const a=Math.PI*2*i/6-Math.PI/2;const r=radarR*((v-42)/57);const px2=radarX+r*Math.cos(a);const py2=radarY+r*Math.sin(a);i===0?x.moveTo(px2,py2):x.lineTo(px2,py2);});x.closePath();x.fillStyle=`${gcC(p.overall)}18`;x.fill();x.strokeStyle=gcC(p.overall);x.lineWidth=2.5;x.stroke();
            rCats.forEach((v,i)=>{const a=Math.PI*2*i/6-Math.PI/2;const r=radarR*((v-42)/57);x.beginPath();x.arc(radarX+r*Math.cos(a),radarY+r*Math.sin(a),4,0,Math.PI*2);x.fillStyle=gcC(v);x.fill();});
            rLabels.forEach((l,i)=>{const a=Math.PI*2*i/6-Math.PI/2;x.fillStyle=gcC(rCats[i]);x.font="bold 10px Inter,sans-serif";x.textAlign="center";x.fillText(`${l} ${rCats[i]}`,radarX+(radarR+22)*Math.cos(a),radarY+(radarR+22)*Math.sin(a)+4);});x.textAlign="left";
            x.fillStyle=BORDER;x.fillRect(30,545,W-60,1);
            const sorted2=[...cats].sort((a2,b2)=>b2.v-a2.v);
            x.fillStyle=GREEN;x.font="bold 9px Inter,sans-serif";x.fillText("STRENGTHS",30,572);
            sorted2.slice(0,2).forEach((s,i)=>{x.fillStyle=gcC(s.v);x.font="bold 14px Inter,sans-serif";x.fillText(`${s.l}: ${s.v}`,30,595+i*24);x.fillStyle=DIM;x.font="11px Inter,sans-serif";x.fillText(glC(s.v),100,595+i*24);});
            x.fillStyle=RED;x.font="bold 9px Inter,sans-serif";x.fillText("AREAS TO IMPROVE",W/2,572);
            sorted2.slice(-2).forEach((s,i)=>{x.fillStyle=gcC(s.v);x.font="bold 14px Inter,sans-serif";x.fillText(`${s.l}: ${s.v}`,W/2,595+i*24);x.fillStyle=DIM;x.font="11px Inter,sans-serif";x.fillText(glC(s.v),W/2+70,595+i*24);});
            x.fillStyle=BORDER;x.fillRect(30,650,W-60,1);
            if(p.matchLog&&p.matchLog.length>=2){
              x.fillStyle=MUTE;x.font="bold 9px Inter,sans-serif";x.fillText("MATCH FORM",30,678);
              const last10=p.matchLog.slice(-10);
              const rates=last10.map(m2=>matchRating(m2,p.position));
              const mn2=Math.min(...rates),mx2=Math.max(...rates),rng2=mx2-mn2||1;const sparkH=50,sparkY=695;
              const barW2=(W-60)/rates.length-4;
              rates.forEach((v,i)=>{const barH=((v-mn2)/rng2)*sparkH+6;const bx=30+i*(barW2+4);const by=sparkY+sparkH-barH;x.fillStyle=gcC(v);x.beginPath();x.roundRect(bx,by,barW2,barH,2);x.fill();x.fillStyle=INK;x.font="bold 9px Inter,sans-serif";x.textAlign="center";x.fillText(v,bx+barW2/2,by-4);if(last10[i].opp){x.fillStyle=MUTE;x.font="7px Inter,sans-serif";x.fillText(last10[i].opp,bx+barW2/2,sparkY+sparkH+12);}});x.textAlign="left";
            }
            const simY2=p.matchLog&&p.matchLog.length>=2?760:660;
            x.fillStyle=BORDER;x.fillRect(30,simY2,W-60,1);
            if(similarPlayers&&similarPlayers.length>0){
              x.fillStyle=MUTE;x.font="bold 9px Inter,sans-serif";x.fillText("SIMILAR PLAYERS",30,simY2+24);
              similarPlayers.slice(0,3).forEach((sp,i)=>{const sy=simY2+42+i*22;x.fillStyle=INK;x.font="bold 12px Inter,sans-serif";x.fillText(sp.name,30,sy);x.fillStyle=DIM;x.font="11px Inter,sans-serif";x.fillText(`${sp.position} · ${sp.team}`,200,sy);x.fillStyle=gcC(sp.overall);x.font="bold 12px 'Source Serif 4',Georgia,serif";x.textAlign="right";x.fillText(Math.round(sp.overall),W-30,sy);x.textAlign="left";});
            }
            // Banner
            const banY=H-130;
            x.fillStyle=`${BORDER}40`;x.fillRect(30,banY,W-60,1);
            if(siteLogo){
              const maxLogoW=260,maxLogoH=60;
              const lw=siteLogo.naturalWidth,lh=siteLogo.naturalHeight;
              const logoScale=Math.min(maxLogoW/lw,maxLogoH/lh);
              const drawW=lw*logoScale,drawH=lh*logoScale;
              x.drawImage(siteLogo,(W-drawW)/2,banY+10,drawW,drawH);
            } else {
              x.fillStyle=INK;x.font="bold 22px 'Source Serif 4',Georgia,serif";x.textAlign="center";
              x.fillText("US Footy Index",W/2,banY+36);x.textAlign="left";
            }
            x.fillStyle=MUTE;x.font="10px Inter,sans-serif";x.textAlign="center";
            x.fillText("MLS Player Analytics & Composite Grades",W/2,banY+82);
            x.textAlign="left";
            // Footer
            x.fillStyle=INK;x.fillRect(0,H-44,W,44);x.fillStyle=MUTE;x.font="9px Inter,sans-serif";x.textAlign="center";x.fillText("Data: ESPN · American Soccer Analysis · MLS Official (Opta)",W/2,H-20);x.textAlign="left";
            const link=document.createElement("a");link.download=`${p.name.replace(/\s+/g,"-").toLowerCase()}-ufi-card.png`;link.href=c.toDataURL("image/png");link.click();
          }} style={{background:"none",border:`1px solid ${T.border}`,color:T.textDim,padding:"7px 16px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,letterSpacing:.3,transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>↓ Player Card</button>
          <CardButton label="Wide card" onClick={()=>cardPlayer(p)}/>
          {onCompare&&<button onClick={()=>{onCompare(p);onClose();}} disabled={isInCompare} style={{background:isInCompare?"transparent":T.bg,border:`1px solid ${isInCompare?T.borderLt:T.accent}`,color:isInCompare?T.textMute:T.accent,padding:"7px 16px",borderRadius:0,cursor:isInCompare?"default":"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,opacity:isInCompare?.5:1}}>{isInCompare?"In Compare":"+ Compare"}</button>}
          <button onClick={onClose} style={{background:T.ink,border:"none",color:T.bg,padding:"7px 20px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,letterSpacing:.5}}>Close</button>
        </div>
      </div>
    </div>
  </div>;
}

