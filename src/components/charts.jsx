// components/charts.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { computeForm } from "../analytics/form.mjs";
import { T, gc } from "../theme.mjs";
import { Area, AreaChart, ResponsiveContainer } from "../ui/runtime.jsx";

export function RadarChart({grades,size=170}){
  const cats=[{k:"attack",l:"ATT"},{k:"creativity",l:"CRE"},{k:"passing",l:"PAS"},{k:"defense",l:"DEF"},{k:"carrying",l:"CAR"},{k:"overall",l:"OVR"}];
  const cx=size/2,cy=size/2,r=size*.36;
  const pt=(i,pct)=>{const ang=((Math.PI*2)/cats.length)*i-Math.PI/2;return[cx+r*pct*Math.cos(ang),cy+r*pct*Math.sin(ang)];};
  const rings=[.25,.5,.75,1];
  const vals=cats.map(c=>Math.min(1,(grades[c.k]||50)/99));
  const poly=vals.map((v,i)=>pt(i,v).join(",")).join(" ");
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    {rings.map(rv=><polygon key={rv} points={cats.map((_,i)=>pt(i,rv).join(",")).join(" ")} fill="none" stroke={T.borderLt} strokeWidth={rv===1?1.5:.5}/>)}
    {cats.map((_,i)=>{const[x,y]=pt(i,1);return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={T.borderLt} strokeWidth=".5"/>;})}
    <polygon points={poly} fill="#1A1A1A12" stroke={T.ink} strokeWidth="1.8" strokeLinejoin="round"/>
    {vals.map((v,i)=>{const[x,y]=pt(i,v);return <circle key={i} cx={x} cy={y} r="3" fill={gc(grades[cats[i].k]||50)} stroke="#fff" strokeWidth="1"/>;})}
    {cats.map((c,i)=>{const[x,y]=pt(i,1.22);const g=grades[c.k]||50;return <text key={c.k} x={x} y={y+1} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fontFamily="Inter,sans-serif" fontWeight="700" fill={gc(g)}>{c.l} {g}</text>;})}
  </svg>;
}

// Form sparkline — within-season form curve
export function FormSparkline({data,width=200,height=50}){
  if(!data||data.length<2)return null;
  const grades=data.map(d=>d.grade);
  const latest=grades[grades.length-1];
  return <div style={{position:"relative"}}>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{top:4,right:4,bottom:0,left:4}}>
        <defs>
          <linearGradient id="formGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gc(latest)} stopOpacity={0.25}/>
            <stop offset="100%" stopColor={gc(latest)} stopOpacity={0.02}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="grade" stroke={gc(latest)} strokeWidth={2} fill="url(#formGrad)" dot={false} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

// Trend of the last 10 match ratings; the last five are shaded as the "form window".
export function FormTrend({matchLog,pos,height=150}){
  const f=computeForm(matchLog,pos);
  if(!f||f.ratings.length<2)return null;
  const narrow=typeof window!=="undefined"&&window.innerWidth<600;
  const W=narrow?360:640,H=height,padL=30,padR=14,padT=24,padB=28,show=narrow?6:10;
  const pts0=matchLog.slice(-show),rs=f.ratings.slice(-show);
  const n=rs.length,x=i=>padL+(n===1?0:i*((W-padL-padR)/(n-1))),y=v=>padT+(1-(v-42)/57)*(H-padT-padB);
  const pts=rs.map((v,i)=>[x(i),y(v)]);
  const d="M"+pts.map(p=>p.map(v=>v.toFixed(1)).join(",")).join("L");
  const winStart=Math.max(0,n-5);
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" role="img" aria-label={"Match rating trend, last "+n+" games"} style={{display:"block",fontFamily:T.sans}}>
    {n>5&&<rect x={x(winStart)-8} y={padT-6} width={x(n-1)-x(winStart)+16} height={H-padT-padB+12} fill={T.ink} opacity=".05"/>}
    {[50,60,70,80,90].map(v=><g key={v}><line x1={padL} x2={W-padR} y1={y(v)} y2={y(v)} stroke={T.borderLt} strokeWidth="1"/><text x={padL-6} y={y(v)+3} fontSize="10.5" fill={T.textMute} textAnchor="end" fontFamily="JetBrains Mono,monospace">{v}</text></g>)}
    {f.seasonAvg!=null&&<line x1={padL} x2={W-padR} y1={y(f.seasonAvg)} y2={y(f.seasonAvg)} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 4"/>}
    <path d={d} fill="none" stroke={T.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    {pts.map(([px,py],i)=><g key={i}><circle cx={px} cy={py} r={i===n-1?5:3.5} fill={gc(rs[i])} stroke={T.bg} strokeWidth="1.5"/><text x={px} y={py-9} fontSize="10.5" fontWeight="700" fill={T.ink} textAnchor="middle" fontFamily="JetBrains Mono,monospace">{rs[i]}</text><text x={px} y={H-padB+13} fontSize="10" fill={T.textDim} textAnchor="middle">{(pts0[i].ha==="A"?"@":"")+(pts0[i].opp||"")}</text></g>)}
    {n>5&&<text x={x(winStart)-4} y={H-4} fontSize="9.5" fill={T.textMute} letterSpacing="1">LAST 5</text>}
    {f.seasonAvg!=null&&<text x={padL+2} y={y(f.seasonAvg)+10} fontSize="9.5" fill={T.textDim} textAnchor="start" letterSpacing=".5">SEASON AVG {Math.round(f.seasonAvg)}</text>}
  </svg>;
}

