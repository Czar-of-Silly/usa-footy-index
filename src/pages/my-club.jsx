// pages/my-club.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { computeForm } from "../analytics/form.mjs";
import { posGroupOf } from "../analytics/matchup.mjs";
import { powerRankFor } from "../analytics/power-rank.mjs";
import { CardButton, TeamBadge } from "../components/ui.jsx";
import { MLS_TEAMS } from "../data/teams.mjs";
import { T, gc } from "../theme.mjs";
import { useState } from "../ui/runtime.jsx";
import { fmtETTime } from "../util/format.mjs";

// ─── MY CLUB (Phase 4d) ───────────────────────────────────────────────
export const MYCLUB_KEY="usfi:myClub";

export function readMyClub(){try{const v=localStorage.getItem(MYCLUB_KEY);return v&&MLS_TEAMS.some(t=>t.abbr===v)?v:null;}catch(e){return null;}}

export function writeMyClub(v){try{if(v)localStorage.setItem(MYCLUB_KEY,v);else localStorage.removeItem(MYCLUB_KEY);}catch(e){}}

export function MyClubPicker({value,onChange,compact}){
  const teams=[...MLS_TEAMS].sort((a,b)=>a.name.localeCompare(b.name));
  return <select aria-label="My club" value={value||""} onChange={e=>onChange(e.target.value||null)} style={{padding:compact?"4px 10px":"6px 12px",background:value?T.ink:T.card,color:value?T.bg:T.ink,border:`1px solid ${T.border}`,borderRadius:0,fontSize:compact?12:12,fontFamily:T.sans,fontWeight:600,cursor:"pointer",maxWidth:200}}>
    <option value="">My club{"\u2026"}</option>
    {teams.map(t=><option key={t.abbr} value={t.abbr}>{t.name}</option>)}
    {value&&<option value="">Clear my club</option>}
  </select>;
}

export function FollowClubCTA({onPick,isMobile}){
  const[open,setOpen]=useState(false);
  return <div style={{margin:"26px 0 4px",padding:isMobile?"14px 14px":"16px 20px",border:`1px solid ${T.border}`,borderTop:`3px solid ${T.ink}`,background:T.surface,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
    <div style={{minWidth:0,flex:"1 1 320px"}}>
      <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>My club</div>
      <div style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?20:24,color:T.ink,lineHeight:1.1,marginTop:4}}>Follow your club</div>
      <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:14,color:T.textDim,marginTop:4}}>Its next match, form, best players and movers, right here on the front page. Remembered on this device only.</div>
    </div>
    {open?<MyClubPicker value={null} onChange={v=>{if(v)onPick(v);}}/>:<button onClick={()=>setOpen(true)} style={{background:T.ink,border:"none",color:T.bg,padding:"10px 18px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:13,letterSpacing:.3,borderRadius:0,whiteSpace:"nowrap"}}>Follow your club {"\u2192"}</button>}
  </div>;
}

export function MyClubDesk({abbr,teams,standings,matches,players,logos,isMobile,onChange,onPlayer,onTeam,onMatchup,onCard}){
  const t=teams.find(x=>x.abbr===abbr)||MLS_TEAMS.find(x=>x.abbr===abbr);
  if(!t)return null;
  const s=standings.find(x=>x.team===abbr)||{};
  const ptsOrder=[...standings].sort((a,b)=>(b.pts||0)-(a.pts||0)||((b.gf||0)-(b.ga||0))-((a.gf||0)-(a.ga||0))||(b.gf||0)-(a.gf||0)).map(x=>x.team);
  const tableRank=ptsOrder.indexOf(abbr)+1||null;
  const gradeRank=(()=>{const o=[...teams].filter(x=>x.overall!=null).sort((a,b)=>b.overall-a.overall).map(x=>x.abbr);const i=o.indexOf(abbr);return i<0?null:i+1;})();
  const powerRank=powerRankFor(abbr,teams,standings,matches);
  const now=Date.now();
  const next=matches.filter(m=>!m.completed&&m.date&&(m.home===abbr||m.away===abbr)&&Date.parse(m.date)>now-3*3600e3&&!/postpon|cancel/i.test(m.status||"")).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
  const recent=matches.filter(m=>m.completed&&m.date&&(m.home===abbr||m.away===abbr)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).reverse();
  const res=recent.map(m=>{const gf=m.home===abbr?+(m.homeScore||0):+(m.awayScore||0),ga=m.home===abbr?+(m.awayScore||0):+(m.homeScore||0);return gf>ga?"W":gf===ga?"D":"L";});
  const squad=players.filter(p=>p.team===abbr&&!p.departed);
  const best=squad.filter(p=>p.rated!==false&&p.overall!=null).sort((a,b)=>b.overall-a.overall).slice(0,5);
  const withForm=squad.filter(p=>p.matchLog&&p.matchLog.length>=5).map(p=>{const f=computeForm(p.matchLog,p.position);return{p,d:f&&f.delta!=null?Math.round(f.delta*10)/10:null,last:f?Math.round(f.last5Avg):null};}).filter(x=>x.d!=null);
  const risers=[...withForm].filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,3),fallers=[...withForm].filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,3);
  const gone=players.filter(p=>p.team===abbr&&p.departed).sort((a,b)=>(b.mins||0)-(a.mins||0)).slice(0,6);
  const opp=next?(next.home===abbr?next.away:next.home):null;const oppT=opp?(teams.find(x=>x.abbr===opp)||MLS_TEAMS.find(x=>x.abbr===opp)):null;
  const head=(txt)=><div style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.bg,background:T.ink,padding:"6px 10px 5px",marginBottom:10}}>{txt}</div>;
  const row=(k,left,right,onClick)=><div key={k} onClick={onClick} className={onClick?"rh":undefined} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"6px 2px",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:11.5,cursor:onClick?"pointer":"default"}}>{left}{right}</div>;
  const stat=(v,l)=><div style={{textAlign:"center",minWidth:64}}><div style={{fontFamily:T.display,fontWeight:900,fontSize:22,lineHeight:1,color:T.ink}}>{v==null?"\u2014":v}</div><div style={{fontFamily:T.mono,fontSize:10,letterSpacing:1.2,color:T.textMute,marginTop:4,textTransform:"uppercase"}}>{l}</div></div>;
  return <section aria-label={"My club: "+t.name} style={{margin:"26px 0 4px",border:`1px solid ${T.border}`,background:T.surface}}>
    <div style={{display:"flex",alignItems:"center",gap:14,padding:isMobile?"12px 12px":"14px 18px",borderBottom:`2px solid ${T.ink}`,flexWrap:"wrap"}}>
      <div onClick={()=>onTeam(abbr)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",minWidth:0,flex:"1 1 260px"}}>
        <TeamBadge abbr={abbr} size={isMobile?40:52} logo={logos[abbr]}/>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:T.mono,fontSize:11,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>My club</div>
          <div style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?20:24,color:T.ink,lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
          <div style={{fontFamily:T.mono,fontSize:12,color:T.textDim,marginTop:2}}>{s.w!=null?`${s.w}-${s.d}-${s.l} \u00b7 ${s.pts} pts`:""}{t.conf?` \u00b7 ${t.conf}`:""}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:isMobile?10:18,alignItems:"center",flexWrap:"wrap"}}>
        {t.overall!=null&&<div style={{textAlign:"center"}}><div style={{fontFamily:T.display,fontWeight:900,fontSize:26,lineHeight:1,color:gc(t.overall)}}>{Math.round(t.overall)}</div><div style={{fontFamily:T.mono,fontSize:10,letterSpacing:1.2,color:T.textMute,marginTop:4}}>TEAM GRADE</div></div>}
        {stat(tableRank?"#"+tableRank:null,"on points")}
        {stat(gradeRank?"#"+gradeRank:null,"team grade")}
        {stat(powerRank?"#"+powerRank:null,"power rank")}
      </div>
      <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}><MyClubPicker value={abbr} onChange={onChange} compact/></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.1fr 1fr 1fr",gap:isMobile?18:24,padding:isMobile?"14px 12px":"16px 18px"}}>
      <div>
        {head(next?"Next match":"Fixtures")}
        {next?<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><TeamBadge abbr={opp} size={34} logo={logos[opp]}/><div><div style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink}}>{next.home===abbr?"vs ":"at "}{oppT?oppT.name:opp}</div><div style={{fontFamily:T.mono,fontSize:12,color:T.textDim}}>{fmtETTime(next.date)}{oppT&&oppT.overall!=null?` \u00b7 grade ${Math.round(oppT.overall)}`:""}</div></div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>onMatchup(next.home,next.away)} style={{background:T.ink,border:"none",color:T.bg,padding:"6px 12px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,borderRadius:0}}>Match preview {"\u2192"}</button><CardButton small label="Preview card" onClick={()=>onCard(next)}/></div>
        </div>:<div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:13,color:T.textDim}}>No upcoming fixture on the schedule.</div>}
        <div style={{marginTop:14}}><div style={{fontFamily:T.mono,fontSize:11,letterSpacing:1.2,color:T.textMute,marginBottom:6}}>{res.length?`LAST ${res.length}`:"RECENT FORM"}</div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>{res.length?res.map((r,i)=><span key={i} title={recent[i].home+" "+recent[i].homeScore+"\u2013"+recent[i].awayScore+" "+recent[i].away} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontFamily:T.mono,fontWeight:700,fontSize:12,color:T.bg,background:r==="W"?T.green:r==="D"?T.textDim:T.red}}>{r}</span>):<span style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textMute}}>No results on record</span>}</div></div>
      </div>
      <div>
        {head("Best players")}
        {best.map(p=>row(p.id,<span style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><span style={{fontFamily:T.display,fontWeight:900,fontSize:16,color:gc(p.overall),width:26}}>{Math.round(p.overall)}</span><span style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span></span>,<span style={{color:T.textMute,fontSize:11.5,flexShrink:0}}>{posGroupOf(p)}</span>,()=>onPlayer(p)))}
        {!best.length&&<div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textMute}}>No graded players yet.</div>}
      </div>
      <div>
        {head("Risers & fallers")}
        {risers.map(x=>row("r"+x.p.id,<span style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{"\u25b2"} {x.p.name}</span>,<span style={{color:T.green,fontWeight:700,flexShrink:0}}>+{x.d}</span>,()=>onPlayer(x.p)))}
        {fallers.map(x=>row("f"+x.p.id,<span style={{fontFamily:T.serif,fontWeight:600,fontSize:13,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{"\u25bc"} {x.p.name}</span>,<span style={{color:T.red,fontWeight:700,flexShrink:0}}>{x.d}</span>,()=>onPlayer(x.p)))}
        {!risers.length&&!fallers.length&&<div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textMute}}>Form movement appears after five games.</div>}
        {gone.length>0&&<div style={{marginTop:12}}><div style={{fontFamily:T.mono,fontSize:11,letterSpacing:1.2,color:T.textMute,marginBottom:4}}>OFF THE BOOKS</div><div style={{fontFamily:T.serif,fontSize:12,color:T.textDim,lineHeight:1.5}}>{gone.map(p=>p.name).join(" \u00b7 ")}</div></div>}
      </div>
    </div>
  </section>;
}

