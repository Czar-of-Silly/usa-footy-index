// pages/matchup.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { computeForm } from "../analytics/form.mjs";
import { indexLean, posGroupOf } from "../analytics/matchup.mjs";
import { CardButton, TeamBadge } from "../components/ui.jsx";
import { MLS_TEAMS } from "../data/teams.mjs";
import { T, gc } from "../theme.mjs";
import { fmtET, fmtETTime } from "../util/format.mjs";

export function MatchupView({home,away,teams,standings,matches,players,logos,onPlayer,onTeam,onCard,isMobile}){
  const tf=(ab)=>teams.find(t=>t.abbr===ab)||MLS_TEAMS.find(t=>t.abbr===ab)&&{...MLS_TEAMS.find(t=>t.abbr===ab),overall:null};
  const st={};standings.forEach(s=>{st[s.team]=s;});
  const pair=(m)=>(m.home===home&&m.away===away)||(m.home===away&&m.away===home);
  const fixture=matches.filter(m=>!m.completed&&pair(m)&&m.date).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
  // the fixture's own venue wins over the URL order
  const hAb=fixture?fixture.home:home,aAb=fixture?fixture.away:away;
  const H=tf(hAb),A=tf(aAb);
  if(!H||!A)return <div style={{padding:40,textAlign:"center",fontFamily:T.serif,fontStyle:"italic",color:T.textDim}}>That matchup isn't in the record.</div>;
  const ptsOrder=[...standings].sort((a,b)=>(b.pts||0)-(a.pts||0)||((b.gf||0)-(b.ga||0))-((a.gf||0)-(a.ga||0))||(b.gf||0)-(a.gf||0)).map(s=>s.team);
  const rank=(ab)=>{const i=ptsOrder.indexOf(ab);return i<0?null:i+1;};
  const played=(ab)=>{const s=st[ab]||{};return (s.w||0)+(s.d||0)+(s.l||0);};
  const ppg=(ab)=>{const g=played(ab);return g?((st[ab]||{}).pts||0)/g:null;};
  const lastN=(ab,n)=>matches.filter(m=>m.completed&&(m.home===ab||m.away===ab)&&m.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,n).reverse();
  const resOf=(m,ab)=>{const gf=m.home===ab?+(m.homeScore||0):+(m.awayScore||0),ga=m.home===ab?+(m.awayScore||0):+(m.homeScore||0);return gf>ga?"W":gf===ga?"D":"L";};
  const form=(ab)=>{const r=lastN(ab,5).map(m=>resOf(m,ab));return{res:r,pts:r.reduce((s,x)=>s+(x==="W"?3:x==="D"?1:0),0),n:r.length};};
  const fH=form(hAb),fA=form(aAb);
  const h2h=matches.filter(m=>m.completed&&pair(m)&&m.date).sort((a,b)=>b.date.localeCompare(a.date));
  const roster=(ab)=>players.filter(p=>p.team===ab&&!p.departed&&p.rated!==false&&p.overall!=null).sort((a,b)=>b.overall-a.overall);
  const rH=roster(hAb),rA=roster(aAb);
  const best=(r,g)=>r.find(p=>posGroupOf(p)===g)||null;
  const battles=[
    {label:"Home attack v away defense",a:best(rH,"FWD"),b:best(rA,"DEF")},
    {label:"Away attack v home defense",a:best(rA,"FWD"),b:best(rH,"DEF")},
    {label:"Midfield",a:best(rH,"MID"),b:best(rA,"MID")},
    {label:"Keepers",a:best(rH,"GK"),b:best(rA,"GK")},
  ].filter(x=>x.a&&x.b);
  // projection (labelled as such): grade gap + points-per-game gap + home advantage
  const gd=(H.overall!=null&&A.overall!=null)?H.overall-A.overall:null;
  const pg=(ppg(hAb)!=null&&ppg(aAb)!=null)?ppg(hAb)-ppg(aAb):null;
  const proj=indexLean(gd,pg);
  const stamp=(g)=>g==null?<span style={{fontFamily:T.serif,fontWeight:700,color:T.textMute}}>NR</span>:<span style={{display:"inline-flex",flexDirection:"column",alignItems:"center",border:`2px solid ${gc(g)}`,padding:"8px 14px 6px",transform:"rotate(-3deg)"}}><span style={{fontFamily:T.display,fontWeight:900,fontSize:36,lineHeight:1,color:gc(g)}}>{Math.round(g)}</span><span style={{fontFamily:T.mono,fontSize:10,letterSpacing:1.2,color:gc(g),marginTop:3}}>TEAM GRADE</span></span>;
  const pills=(res)=><div style={{display:"flex",gap:4}}>{res.length?res.map((r,i)=><span key={i} aria-label={r==="W"?"win":r==="D"?"draw":"loss"} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontFamily:T.mono,fontWeight:700,fontSize:12,color:T.bg,background:r==="W"?T.green:r==="D"?T.textDim:T.red}}>{r}</span>):<span style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textMute}}>No results on record</span>}</div>;
  const club=(t,ab,f,align)=>{const s=st[ab]||{};const rk=rank(ab);return <div style={{display:"flex",flexDirection:"column",alignItems:align==="right"&&!isMobile?"flex-end":"flex-start",gap:8,minWidth:0}}>
    <div onClick={()=>onTeam&&onTeam(ab)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",flexDirection:align==="right"&&!isMobile?"row-reverse":"row"}}><TeamBadge abbr={ab} size={64} logo={logos[ab]}/><div style={{minWidth:0,textAlign:align==="right"&&!isMobile?"right":"left"}}><div style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?20:26,color:T.ink,lineHeight:1.1}}>{t.name}</div><div style={{fontFamily:T.mono,fontSize:12,color:T.textDim,marginTop:4}}>{t.conf||s.conf||""}{rk?` \u00b7 #${rk} on points`:""}</div><div style={{fontFamily:T.mono,fontSize:12,color:T.textDim}}>{s.w!=null?`${s.w}-${s.d}-${s.l} \u00b7 ${s.pts} pts`:"\u2014"}</div></div></div>
    <div style={{display:"flex",alignItems:"center",gap:14,flexDirection:align==="right"&&!isMobile?"row-reverse":"row"}}>{stamp(t.overall)}<div><div style={{fontFamily:T.mono,fontSize:11,letterSpacing:1.2,color:T.textMute,marginBottom:4}}>{f.n?`LAST ${f.n}`:"FORM"}</div>{pills(f.res)}</div></div>
  </div>;};
  const bar=(label,vh,va,fmt,note)=>{const ok=vh!=null&&va!=null;const tot=ok?Math.max(0.0001,Math.abs(vh)+Math.abs(va)):1;const ph=ok?Math.abs(vh)/tot:0.5;const lead=ok?(vh>va?"H":va>vh?"A":"=" ):null;return <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"64px 1fr 64px",gap:isMobile?4:12,alignItems:"center",padding:"10px 0",borderBottom:`1px dotted ${T.borderLt}`}}>
    {!isMobile&&<div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:lead==="H"?T.ink:T.textDim,textAlign:"right"}}>{ok?fmt(vh):"\u2014"}</div>}
    <div><div style={{display:"flex",justifyContent:"space-between",fontFamily:T.mono,fontSize:11,letterSpacing:1.2,color:T.textMute,marginBottom:4}}><span>{isMobile&&ok?fmt(vh)+" \u00b7 ":""}{label}{isMobile&&ok?" \u00b7 "+fmt(va):""}</span>{note&&<span style={{letterSpacing:0,textTransform:"none"}}>{note}</span>}</div><div style={{display:"flex",height:8,background:T.borderLt}}><div style={{width:`${ph*100}%`,background:lead==="A"?T.textMute:T.ink}}/><div style={{flex:1,background:lead==="H"?T.textMute:T.accent}}/></div></div>
    {!isMobile&&<div style={{fontFamily:T.display,fontWeight:700,fontSize:18,color:lead==="A"?T.accent:T.textDim}}>{ok?fmt(va):"\u2014"}</div>}
  </div>;};
  const playerRow=(p,side)=><div onClick={()=>onPlayer&&onPlayer(p)} className="rh" style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flexDirection:side==="b"&&!isMobile?"row-reverse":"row",textAlign:side==="b"&&!isMobile?"right":"left",minWidth:0}}>
    <span style={{fontFamily:T.display,fontWeight:900,fontSize:22,color:gc(p.overall),width:34,textAlign:"center",flexShrink:0}}>{Math.round(p.overall)}</span>
    <div style={{minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div><div style={{fontFamily:T.mono,fontSize:11.5,color:T.textDim}}>{p.position} {p.matchLog&&p.matchLog.length>=2?(()=>{const f=computeForm(p.matchLog,p.position);return f&&f.last5Avg!=null?`\u00b7 form ${Math.round(f.last5Avg)}`:"";})():""}</div></div>
  </div>;
  const when=fixture?fmtETTime(fixture.date):null;
  const share=async()=>{const url=window.location.href;try{if(navigator.share){await navigator.share({title:document.title,url});return;}}catch(e){if(e&&e.name==="AbortError")return;}try{await navigator.clipboard.writeText(url);alert("Link copied");}catch(e){prompt("Copy this link",url);}};
  const sect=(t,extra)=><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:`2px solid ${T.ink}`,paddingBottom:6,marginBottom:10,marginTop:26}}><span style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.ink}}>{t}</span>{extra&&<span style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim}}>{extra}</span>}</div>;
  return <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:isMobile?"18px 14px":"26px 30px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
      <div><div style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>{fixture?"Match Preview":"Head-to-Head"}{when?` \u00b7 ${when}`:""}{fixture&&/postpon|suspend|cancel/i.test(fixture.status||"")?" \u00b7 "+fixture.status:""}</div>
        <h2 style={{fontFamily:T.display,fontWeight:700,fontSize:isMobile?24:34,color:T.ink,margin:"6px 0 0",lineHeight:1.1}}>{H.name} <span style={{color:T.textMute,fontWeight:400}}>v</span> {A.name}</h2></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><CardButton label="Preview card" onClick={()=>onCard&&onCard({home:hAb,away:aAb,date:fixture?fixture.date:null,status:fixture?fixture.status:""})}/><button onClick={share} style={{background:T.ink,border:"none",color:T.bg,padding:"7px 14px",cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:12,letterSpacing:.3,borderRadius:0}}>Share link</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr auto 1fr",gap:isMobile?18:24,alignItems:"center",marginTop:22}}>
      {club(H,hAb,fH,"left")}
      {!isMobile&&<div style={{fontFamily:T.display,fontWeight:900,fontSize:40,color:T.textMute}}>v</div>}
      {club(A,aAb,fA,"right")}
    </div>

    {sect("Measured","From the record \u2014 nothing here is a forecast")}
    {bar("Team grade",H.overall,A.overall,v=>String(Math.round(v)),"minutes-weighted composite")}
    {bar("Points per game",ppg(hAb),ppg(aAb),v=>v.toFixed(2),`${played(hAb)} and ${played(aAb)} played`)}
    {bar("Form points, last five",fH.n?fH.pts:null,fA.n?fA.pts:null,v=>String(v),"3 for a win, 1 for a draw")}
    {bar("Goal difference",(st[hAb]?(st[hAb].gf||0)-(st[hAb].ga||0):null),(st[aAb]?(st[aAb].gf||0)-(st[aAb].ga||0):null),v=>(v>0?"+":"")+v,null)}

    {battles.length>0&&sect("Key battles","Highest-graded at each position; click through for form")}
    {battles.map((b,i)=><div key={i} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 150px 1fr",gap:isMobile?6:16,alignItems:"center",padding:"10px 0",borderBottom:`1px dotted ${T.borderLt}`}}>
      {playerRow(b.a,"a")}
      <div style={{fontFamily:T.mono,fontSize:11,letterSpacing:1.2,textTransform:"uppercase",color:T.textMute,textAlign:"center",padding:isMobile?"2px 0":0}}>{b.label}</div>
      {playerRow(b.b,"b")}
    </div>)}

    {proj&&<div style={{marginTop:26,border:`1px dashed ${T.accent}`,padding:isMobile?"12px 14px":"14px 18px",background:"rgba(147,67,60,0.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:8}}><span style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",color:T.accent}}>The Index Lean</span><span style={{fontFamily:T.serif,fontStyle:"italic",fontSize:12,color:T.textDim}}>A projection, not observed data</span></div>
      <div style={{fontFamily:T.serif,fontSize:13,color:T.textDim,marginTop:6}}>Model-based matchup lean using current team grade, points-per-game and home advantage.</div>
      <div style={{display:"flex",height:26,marginTop:12,fontFamily:T.mono,fontSize:12,fontWeight:700,color:T.bg}}>
        <div style={{width:`${proj.home}%`,background:T.ink,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",whiteSpace:"nowrap"}}>{proj.home>=14?`${hAb} ${proj.home}%`:""}</div>
        <div style={{width:`${proj.draw}%`,background:T.textDim,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",whiteSpace:"nowrap"}}>{proj.draw>=12?`Draw ${proj.draw}%`:""}</div>
        <div style={{flex:1,background:T.accent,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",whiteSpace:"nowrap"}}>{proj.away>=14?`${aAb} ${proj.away}%`:""}</div>
      </div>
      <div style={{fontFamily:T.serif,fontSize:12,color:T.textDim,marginTop:8,lineHeight:1.5}}>Built from the team-grade gap{gd!=null?` (${gd>0?"+":""}${Math.round(gd)} to ${hAb})`:""}, the points-per-game gap{pg!=null?` (${pg>0?"+":""}${pg.toFixed(2)} to ${hAb})`:""}, and a fixed home-advantage term. It does not use injuries, lineups or odds.</div>
    </div>}

    {sect("This season, head to head",h2h.length?`${h2h.length} meeting${h2h.length>1?"s":""}`:"No meetings on record yet")}
    {h2h.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 2px",borderBottom:`1px dotted ${T.borderLt}`,fontFamily:T.mono,fontSize:12}}><span>{m.home} <b>{m.homeScore}\u2013{m.awayScore}</b> {m.away}</span><span style={{color:T.textMute}}>{fmtET(m.date)}</span></div>)}
  </div>;
}

