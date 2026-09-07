// pages/matchups.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { CardButton, TeamBadge } from "../components/ui.jsx";
import { MLS_TEAMS } from "../data/teams.mjs";
import { T, gc } from "../theme.mjs";
import { fmtET, fmtETTime } from "../util/format.mjs";

// ─── MATCHUPS INDEX (Phase 5B) ────────────────────────────────────────
export function MatchupsView({matches,teams,logos,isMobile,onMatchup,onCard}){
  const now=Date.now();const tf=(ab)=>teams.find(t=>t.abbr===ab)||MLS_TEAMS.find(t=>t.abbr===ab)||{abbr:ab,name:ab};
  const upcoming=matches.filter(m=>!m.completed&&m.date&&Date.parse(m.date)>now-3*3600e3).sort((a,b)=>a.date.localeCompare(b.date));
  const recent=matches.filter(m=>m.completed&&m.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  const dayKey=(d)=>fmtET(d,{weekday:"long",month:"long",day:"numeric"});
  const groups=[];upcoming.forEach(m=>{const k=dayKey(m.date);const g=groups.find(x=>x.k===k);if(g)g.items.push(m);else groups.push({k,items:[m]});});
  const row=(m,isUp)=>{const H=tf(m.home),A=tf(m.away);const post=/postpon|suspend|cancel/i.test(m.status||"");return <div key={m.id} className="rh" onClick={()=>onMatchup(m.home,m.away)} style={{display:"grid",gridTemplateColumns:isMobile?"1fr auto":"1fr 150px 130px auto",gap:isMobile?8:14,alignItems:"center",padding:"10px 8px",borderBottom:`1px dotted ${T.borderLt}`,cursor:"pointer"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}><TeamBadge abbr={m.home} size={26} logo={logos[m.home]}/><span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isMobile?m.home:H.name}</span><span style={{fontFamily:T.mono,fontSize:12,color:T.textMute}}>{isUp?"v":`${m.homeScore}\u2013${m.awayScore}`}</span><span style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isMobile?m.away:A.name}</span><TeamBadge abbr={m.away} size={26} logo={logos[m.away]}/></div>
    {!isMobile&&<div style={{fontFamily:T.mono,fontSize:12,color:T.textDim}}>{isUp?fmtETTime(m.date).replace(/^[A-Za-z]+ \d+, /,""):fmtET(m.date)}{post?" \u00b7 "+m.status:""}</div>}
    {!isMobile&&<div style={{fontFamily:T.mono,fontSize:12,color:T.textDim}}>{H.overall!=null&&A.overall!=null?<span>grade <b style={{color:gc(H.overall)}}>{Math.round(H.overall)}</b> v <b style={{color:gc(A.overall)}}>{Math.round(A.overall)}</b></span>:""}</div>}
    <div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>{isUp&&<CardButton small label="Card" onClick={()=>onCard(m)}/>}<button onClick={()=>onMatchup(m.home,m.away)} style={{background:T.ink,border:"none",color:T.bg,padding:"6px 10px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,borderRadius:0,whiteSpace:"nowrap"}}>{isUp?"Preview":"Head-to-head"} {"\u2192"}</button></div>
  </div>;};
  const sect=(t,extra)=><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:`2px solid ${T.ink}`,paddingBottom:6,marginBottom:6,marginTop:22}}><span style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.ink}}>{t}</span>{extra&&<span style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim}}>{extra}</span>}</div>;
  return <div style={{maxWidth:980,margin:"0 auto"}}>
    <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>Matchups</div>
    <h2 style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?28:36,color:T.ink,margin:"6px 0 6px",lineHeight:1.05}}>The fixture list, previewed</h2>
    <p style={{fontFamily:T.serif,fontStyle:"italic",fontSize:15,color:T.textDim,margin:"0 0 6px"}}>Every upcoming match with team grade, points, form and key battles. Kickoffs in Eastern Time.</p>
    {groups.length?groups.map(g=><div key={g.k}>{sect(g.k,g.items.length+(g.items.length===1?" match":" matches"))}{g.items.map(m=>row(m,true))}</div>):<div style={{fontFamily:T.serif,fontStyle:"italic",color:T.textDim,padding:"20px 0"}}>No upcoming fixtures on the schedule.</div>}
    {recent.length>0&&<div>{sect("Recent results","click for the head-to-head")}{recent.map(m=>row(m,false))}</div>}
  </div>;
}

