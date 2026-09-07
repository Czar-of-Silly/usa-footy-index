// components/ui.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { matchRating } from "../analytics/form.mjs";
import { tcm } from "../data/teams.mjs";
import { T, gb, gc, gl } from "../theme.mjs";
import { Line, LineChart, ResponsiveContainer, XAxis, useEffect, useMemo, useRef, useState } from "../ui/runtime.jsx";
import { dv } from "../util/format.mjs";

export function PosGlyph({pos,h=28,line,dot}){const L=line||T.ink,D=dot||T.accent,W=Math.round(h*40/56),cy=({Forward:11,Midfielder:28,Defender:41,Goalkeeper:49}[pos]||28);return <svg width={W} height={h} viewBox="0 0 40 56" role="img" aria-label={pos+" position"} style={{display:"block",flexShrink:0}}><g fill="none" stroke={L} strokeWidth={1.6} opacity={0.6}><rect x="3" y="3" width="34" height="50" rx="2"/><line x1="3" y1="28" x2="37" y2="28"/><circle cx="20" cy="28" r="5"/><rect x="12" y="3" width="16" height="8"/><rect x="12" y="45" width="16" height="8"/></g><circle cx="20" cy={cy} r="4.5" fill={D}/></svg>;}

export function TeamBadge({abbr,size=20,logo}){
  if(logo)return <img src={logo} alt={abbr} style={{width:size,height:size,objectFit:"contain",flexShrink:0,mixBlendMode:"multiply",filter:"sepia(.3) saturate(.85) contrast(1.05)"}} onError={e=>{e.target.onerror=null;e.target.style.display="none"}}/>;
  const t=tcm[abbr];
  if(!t)return <div style={{width:size,height:size,borderRadius:0,background:"#ccc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.3,fontWeight:800,color:"#888",fontFamily:T.sans,flexShrink:0}}>{(abbr||"?").slice(0,3)}</div>;
  return <div style={{width:size,height:size,borderRadius:0,background:`linear-gradient(135deg,${t.c1},${t.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.28,fontWeight:700,color:"#fff",fontFamily:T.sans,letterSpacing:-.3,textShadow:"0 1px 2px rgba(0,0,0,.4)",flexShrink:0}}>{abbr.slice(0,3)}</div>;
}

export function Badge({grade,size="sm",rated=true}){/*NR*/
  const fs=size==="lg"?36:size==="md"?17:14;
  const pad=size==="lg"?"12px 20px":size==="md"?"4px 10px":"2px 7px";
  if(rated===false||grade==null){
    return <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:T.borderLt,border:`1.5px solid ${T.textMute}30`,borderRadius:size==="lg"?10:5,padding:pad,minWidth:size==="lg"?72:size==="md"?36:34}}>
      <span style={{color:T.textMute,fontWeight:700,fontSize:size==="lg"?20:fs,fontFamily:T.serif,letterSpacing:0,lineHeight:1}}>NR</span>
      {size==="lg"&&<span style={{color:T.textMute,fontSize:10,fontWeight:600,letterSpacing:1,opacity:.8,marginTop:2,fontFamily:T.sans,textTransform:"uppercase"}}>Not Rated</span>}
    </div>;
  }
  return <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:gb(grade),border:`1.5px solid ${gc(grade)}30`,borderRadius:size==="lg"?10:5,padding:pad,minWidth:size==="lg"?72:size==="md"?36:34}}>
    <span style={{color:gc(grade),fontWeight:700,fontSize:fs,fontFamily:T.serif,letterSpacing:-.5,lineHeight:1}}>{size==="lg"?(+grade).toFixed(1):Math.round(grade)}</span>
    {size==="lg"&&<span style={{color:gc(grade),fontSize:10,fontWeight:600,letterSpacing:1,opacity:.8,marginTop:2,fontFamily:T.sans,textTransform:"uppercase"}}>{gl(grade)}</span>}
  </div>;
}

export function StatChip({label,value,color=T.text}){
  return <div style={{textAlign:"center",minWidth:44}}>
    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:22,color,lineHeight:1}}>{value}</div>
    <div style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:.8,marginTop:4,fontFamily:T.sans,textTransform:"uppercase"}}>{label}</div>
  </div>;
}

export function Select({value,onChange,options,label,width=140}){
  return <div style={{display:"flex",alignItems:"center",gap:8}}>
    {label&&<span style={{fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:1,fontFamily:T.sans,whiteSpace:"nowrap",textTransform:"uppercase"}}>{label}</span>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{appearance:"none",WebkitAppearance:"none",background:T.surface,border:`1px solid ${T.border}`,color:T.text,padding:"7px 28px 7px 10px",borderRadius:0,fontFamily:T.sans,fontWeight:500,fontSize:12,cursor:"pointer",outline:"none",width,backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A09A90'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"}}>
      {options.map(o=>{const v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return <option key={v} value={v}>{l}</option>;})}
    </select>
  </div>;
}

export function Rule(){return <div style={{borderTop:`1px solid ${T.border}`,margin:"20px 0"}}/>;}

// ─── MOBILE UI (Phase 2) ──────────────────────────────────────────────
export function NavIcon({name,size=20}){
  const P={
    home:<path d="M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>,
    players:<g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.9-6 7.5-6s6.7 2 7.5 6"/></g>,
    teams:<path d="M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>,
    search:<g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="m15.2 15.2 4.8 4.8"/></g>,
    more:<g fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></g>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{P[name]||null}</svg>;
}

export function BottomSheet({open,onClose,title,children}){
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",h);
    const prev=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{document.removeEventListener("keydown",h);document.body.style.overflow=prev;};
  },[open]);
  if(!open)return null;
  return <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(0,0,0,.35)",backdropFilter:"blur(2px)"}}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()} className="usfi-sheet" style={{position:"absolute",left:0,right:0,bottom:0,background:T.bg,borderTop:`3px solid ${T.ink}`,maxHeight:"82vh",overflowY:"auto",padding:"14px 16px calc(18px + env(safe-area-inset-bottom))",boxShadow:"0 -12px 40px rgba(0,0,0,.18)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,borderBottom:`1px solid ${T.borderLt}`,paddingBottom:8}}>
        <div style={{fontFamily:T.display,fontWeight:700,fontSize:19,color:T.ink}}>{title}</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:`1px solid ${T.border}`,width:32,height:32,fontSize:20,lineHeight:1,cursor:"pointer",color:T.ink,fontFamily:T.serif,borderRadius:0}}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

export function MobileSortBar({options,sortKey,sortDir,onSort}){
  return <div role="group" aria-label="Sort players" style={{display:"flex",gap:6,padding:"8px 10px",overflowX:"auto",borderBottom:`2px solid ${T.ink}`,background:T.card,fontFamily:T.sans,alignItems:"center",WebkitOverflowScrolling:"touch"}}>
    <span style={{fontSize:12,color:T.textMute,flexShrink:0,letterSpacing:.6,textTransform:"uppercase",fontWeight:600}}>Sort</span>
    {options.map(([k,l])=>{const a=sortKey===k;return <button key={k} onClick={()=>onSort(k)} aria-pressed={a} style={{flexShrink:0,border:`1px solid ${a?T.ink:T.border}`,background:a?T.ink:"transparent",color:a?T.bg:T.textDim,fontSize:12,fontWeight:600,padding:"6px 10px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,minHeight:32}}>{l}{a?(sortDir==="asc"?" \u25b2":" \u25bc"):""}</button>;})}
  </div>;
}

// Generic phone card used by Season / Defense / Passing. stats: [label, value, color?]
export function MobileStatCard({p,i,grade,gradeLabel,sub,stats,rankColor,onOpen}){
  const nr=grade==null||!Number.isFinite(+grade);
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen();}}} className="rh" style={{display:"grid",gridTemplateColumns:"24px 1fr 56px",gap:10,alignItems:"center",padding:"11px 12px",borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,cursor:"pointer",minHeight:64}}>
    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:rankColor||(i<3?T.accent:T.textMute),textAlign:"center"}}>{i+1}</div>
    <div style={{minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <TeamBadge abbr={p.team} size={22} logo={p.teamLogo}/>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
          <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,marginTop:6,fontFamily:T.mono,fontSize:11.5,color:T.textDim,flexWrap:"wrap"}}>
        {stats.map(([l,v,c])=><span key={l}><b style={{color:c||T.text}}>{dv(v)}</b> {l}</span>)}
      </div>
    </div>
    <div style={{textAlign:"center"}}>{nr?<span style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:T.textMute}}>NR</span>:<span style={{display:"inline-flex",flexDirection:"column",alignItems:"center"}}><span style={{fontFamily:T.display,fontWeight:900,fontSize:24,color:T.ink,lineHeight:1,letterSpacing:-.5}}>{Math.round(+grade)}</span><span style={{width:24,height:3,background:gc(+grade),marginTop:4,display:"block"}}></span>{gradeLabel&&<span style={{fontSize:10,letterSpacing:.8,textTransform:"uppercase",color:T.textMute,marginTop:3,fontFamily:T.sans}}>{gradeLabel}</span>}</span>}</div>
  </div>;
}

export function MobilePlayerCard({p,i,onOpen}){
  const nr=p.rated===false||p.overall==null;
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen();}}} className="rh" style={{display:"grid",gridTemplateColumns:"24px 1fr 56px",gap:10,alignItems:"center",padding:"11px 12px",borderBottom:`1px solid ${T.borderLt}`,background:i%2===0?"transparent":T.surface,cursor:"pointer",minHeight:64}}>
    <div style={{fontFamily:T.serif,fontWeight:700,fontSize:13,color:i<3?T.accent:T.textMute,textAlign:"center"}}>{i+1}</div>
    <div style={{minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <TeamBadge abbr={p.team} size={22} logo={p.teamLogo}/>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:15,color:T.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
          <div style={{fontSize:12,color:T.textDim,fontFamily:T.sans}}>{p.position} {"\u00b7"} {p.team}{p.age?` \u00b7 Age ${Math.floor(+p.age)}`:""}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,marginTop:6,fontFamily:T.mono,fontSize:11.5,color:T.textDim,flexWrap:"wrap"}}>
        <span><b style={{color:T.text}}>{dv(p.goals)}</b> G</span>
        <span><b style={{color:T.text}}>{dv(p.assists)}</b> A</span>
        <span><b style={{color:+p.totalGA>=0?T.green:T.red}}>{+p.totalGA>=0?"+":""}{dv(p.totalGA)}</b> G+</span>
        <span><b style={{color:T.text}}>{dv(p.xg90)}</b> xG/90</span>
      </div>
    </div>
    <div style={{textAlign:"center"}}>{nr?<span style={{fontFamily:T.serif,fontWeight:700,fontSize:14,color:T.textMute}}>NR</span>:<span style={{display:"inline-flex",flexDirection:"column",alignItems:"center"}}><span style={{fontFamily:T.display,fontWeight:900,fontSize:24,color:T.ink,lineHeight:1,letterSpacing:-.5}}>{Math.round(p.overall)}</span><span style={{width:24,height:3,background:gc(p.overall),marginTop:4,display:"block"}}></span></span>}</div>
  </div>;
}

export function TableWrap({children}){
  return <div className="table-scroll" style={{borderRadius:0,border:`1px solid ${T.border}`,overflow:"hidden",background:T.surface}}>
    <div className="table-inner">{children}</div>
  </div>;
}

export function ColHead({label,sortKey:sk,currentSort,currentDir,onSort,center}){
  const active=currentSort===sk;
  return <div onClick={sk?()=>onSort(sk):undefined} style={{cursor:sk?"pointer":"default",userSelect:"none",display:"flex",alignItems:"center",gap:2,justifyContent:center?"center":"flex-start",color:active?T.ink:T.textMute,fontWeight:active?700:600,transition:"color .15s"}}>
    {label}{active&&<span style={{fontSize:10,marginLeft:1}}>{currentDir==="asc"?"▲":"▼"}</span>}
  </div>;
}

export function Logo({size=36,dark:isDark}){
  return (
    <div style={{textAlign:"center",cursor:"pointer"}}>
      <img src="/masthead.webp" alt="USA Footy Index crest" style={{width:"min(460px,88%)",height:"auto",display:"block",margin:"0 auto"}}/>
      <div style={{fontFamily:T.fell,fontSize:"clamp(34px,6vw,56px)",lineHeight:1,color:T.ink,marginTop:4}}>USA Footy <span style={{color:T.accent}}>Index</span></div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginTop:7}}>
        <span style={{height:1,width:64,background:T.textDim,opacity:.5}}></span>
        <span style={{fontStyle:"italic",fontFamily:T.serif,fontSize:14,color:T.textDim}}>Stories lead. Stats inform.</span>
        <span style={{height:1,width:64,background:T.textDim,opacity:.5}}></span>
      </div>
    </div>
  );
}

export function PctBadge({value}){
  const c=value>=90?"#B68D40":value>=75?T.green:value>=50?T.blue:value>=25?T.textDim:T.red;
  return <span style={{fontSize:11.5,fontFamily:T.mono,fontWeight:700,color:c,background:`${c}12`,padding:"2px 6px",borderRadius:0,marginLeft:4}}>{value}th</span>;
}

export function CardButton({onClick,label,small}){
  return <button onClick={onClick} title="Download a 1200\u00d7630 share card" style={{background:"none",border:`1px solid ${T.border}`,color:T.textDim,padding:small?"4px 9px":"7px 14px",borderRadius:0,cursor:"pointer",fontFamily:T.sans,fontWeight:600,fontSize:small?11.5:12,letterSpacing:.3,whiteSpace:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>{"\u2193 "+(label||"Share card")}</button>;
}

export function MiniSparkline({matchLog,pos,w=40,h=14}){
  if(!matchLog||matchLog.length<2)return null;
  const last5=matchLog.slice(-5);
  const rates=last5.map(m=>matchRating(m,pos));
  const mn=Math.min(...rates),mx=Math.max(...rates),rng=mx-mn||1;
  const pts=rates.map((v,i)=>[i*(w/(rates.length-1)),h-2-((v-mn)/rng)*(h-4)]);
  const d="M"+pts.map(p=>p.join(",")).join("L");
  const latest=rates[rates.length-1];
  const col=gc(latest);
  return <svg width={w} height={h} style={{display:"block",flexShrink:0}}><path d={d} fill="none" stroke={col} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/><circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={2} fill={col}/></svg>;
}

export function SeasonSparkline({seasons,width=180,height=60}){
  if(!seasons||seasons.length<1)return <span style={{fontSize:11,color:T.textMute,fontFamily:T.sans,fontStyle:"italic"}}>No history</span>;
  return <div>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={seasons} margin={{top:8,right:12,bottom:4,left:12}}>
        <XAxis dataKey="year" tick={{fontSize:11,fill:T.textMute,fontFamily:"Inter,sans-serif"}} axisLine={false} tickLine={false}/>
        <Line type="monotone" dataKey="overall" stroke={T.ink} strokeWidth={2.5} dot={{r:4,fill:T.ink,stroke:T.bg,strokeWidth:2}} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
    <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:2}}>
      {seasons.map(s=><span key={s.year} style={{fontFamily:T.mono,fontSize:11.5,fontWeight:700,color:gc(s.overall)}}>{s.overall}</span>)}
    </div>
  </div>;
}

// Tiny inline SVG sparkline for table rows (no Recharts overhead)
export function MiniSpark({data,width=60,height=20,color}){
  if(!data||data.length<2)return <span style={{fontFamily:T.mono,fontSize:11.5,color:T.textMute}}>—</span>;
  const vals=data.map(d=>d.grade);
  const innerW=width-6,innerH=height-6;
  const rawMn=Math.min(...vals),rawMx=Math.max(...vals);
  const mid=(rawMn+rawMx)/2,span=Math.max(rawMx-rawMn,14);
  const mn=mid-span/2-2,range=span+4;
  const X=i=>2+(i/(vals.length-1))*innerW;
  const Y=v=>3+innerH-((v-mn)/range)*innerH;
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const pts=vals.map((v,i)=>`${X(i)},${Y(v)}`).join(" ");
  return <svg width={width} height={height} style={{display:"block"}}>
    <line x1={2} y1={Y(avg)} x2={2+innerW} y2={Y(avg)} stroke={T.border} strokeWidth="1" strokeDasharray="2 3"/>
    <polyline points={pts} fill="none" stroke={T.ink} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={X(vals.length-1)} cy={Y(vals[vals.length-1])} r="2.5" fill={color||T.ink}/>
  </svg>;
}

// Top 3 podium
export function TopCards({players,metric,metricLabel,onSelect}){
  const top3=players.slice(0,3);if(!top3.length)return null;
  return <div className="resp-grid3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
    {top3.map((p,i)=>(
      <div key={p.id} onClick={()=>onSelect(p)} style={{
        background:T.surface,border:`1px solid ${i===0?T.ink+"20":T.border}`,borderRadius:0,padding:"16px",
        cursor:"pointer",transition:"box-shadow .2s",boxShadow:i===0?"0 2px 8px rgba(0,0,0,.08)":"none",
      }} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow=i===0?"0 2px 8px rgba(0,0,0,.08)":"none"}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontFamily:T.serif,fontWeight:700,fontSize:18,color:i===0?T.accent:T.textMute}}>{i+1}</span>
          <TeamBadge abbr={p.team} size={36} logo={p.teamLogo}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:T.serif,fontWeight:700,fontSize:17,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
            <div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.team}</div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div><div style={{fontFamily:T.display,fontWeight:700,fontSize:30,color:T.ink,lineHeight:1}}>{metric(p)}</div><div style={{fontSize:10,color:T.textMute,fontWeight:600,letterSpacing:1.5,marginTop:3,fontFamily:T.sans}}>{metricLabel}</div></div>
          <Badge grade={p.overall} rated={p.rated} size="md"/>
        </div>
      </div>
    ))}
  </div>;
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
export function PlayerSearch({players,onSelect,wide,autoFocus}){
  const[q,setQ]=useState("");const[open,setOpen]=useState(false);const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const res=useMemo(()=>q.length<2?[]:players.filter(p=>p.name?.toLowerCase().includes(q.toLowerCase())||p.team?.toLowerCase().includes(q.toLowerCase())||p.teamName?.toLowerCase().includes(q.toLowerCase())).slice(0,wide?12:8),[q,players]);
  return <div ref={ref} style={{position:"relative",width:"100%",maxWidth:wide?"none":240}}>
    <input value={q} aria-label="Search players and teams" autoFocus={!!autoFocus} onChange={e=>{setQ(e.target.value);setOpen(true);}} placeholder={wide?"Search players or teams\u2026":"Search players..."} onFocus={()=>setOpen(true)} style={{width:"100%",padding:wide?"12px 14px":"8px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:0,color:T.text,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
    {open&&res.length>0&&<div style={{position:wide?"static":"absolute",top:"100%",left:0,right:0,background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",borderBottomLeftRadius:6,borderBottomRightRadius:6,zIndex:500,maxHeight:320,overflowY:"auto",boxShadow:"0 12px 32px rgba(0,0,0,.12)"}}>
      {res.map((p,i)=><div key={p.id} onClick={()=>{onSelect(p);setQ("");setOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderTop:i?`1px solid ${T.borderLt}`:"none",cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.card} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <TeamBadge abbr={p.team} size={36} logo={p.teamLogo}/><div style={{flex:1,minWidth:0}}><div style={{fontFamily:T.serif,fontWeight:600,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:T.ink}}>{p.name}</div><div style={{fontSize:11,color:T.textDim,fontFamily:T.sans}}>{p.position} · {p.teamName}</div></div><Badge grade={p.overall} rated={p.rated} size="sm"/>
      </div>)}
    </div>}
  </div>;
}

