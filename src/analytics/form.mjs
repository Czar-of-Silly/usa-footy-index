// analytics/form.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// Season-over-season sparkline — shows grade dots connected by a line

// Mini inline sparkline for table rows — pure SVG, no Recharts
// ─── MATCH FORM (Phase 4a) ────────────────────────────────────────────
// Production-based per-match rating from the match-log row. Attackers/midfielders:
// goals, assists, shots, discipline, minutes (unchanged from the original formula).
// Defenders and keepers additionally: clean sheet / goals conceded while on the pitch.
// It is a proxy built from box-score events, not the full grading engine — say so in the UI.
export function matchRating(m,pos){
  const P=String(pos||"").toLowerCase();
  const isGK=/gk|goal|keep/.test(P);
  const isDef=isGK||/def|back/.test(P);
  let r=55;
  r+=(m.g||0)*(isDef?14:12);r+=(m.a||0)*(isDef?10:8);
  r+=(m.sot||0)*2;r+=(m.sh||0)*.5;
  r-=(m.fl||0)*1;r-=(m.yc||0)*3;r-=(m.rc||0)*10;
  const mins=m.mins||0;r+=mins>=80?3:1;
  if(isDef&&mins>=60){const conceded=m.ha==="H"?(m.as||0):(m.hs||0);r+=conceded===0?8:conceded===1?2:conceded===2?-1:-3;if(isGK&&conceded===0)r+=2;}
  return Math.max(42,Math.min(99,Math.round(r)));
}

export function computeForm(matchLog,pos){
  const log=Array.isArray(matchLog)?matchLog:[];
  if(!log.length)return null;
  const ratings=log.map(m=>matchRating(m,pos));
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const last5=ratings.slice(-5),prev5=ratings.slice(-10,-5);
  const last5Avg=avg(last5),seasonAvg=avg(ratings);
  const basis=prev5.length>=3?"prev":"season";
  const delta=last5Avg==null?null:(basis==="prev"?last5Avg-avg(prev5):last5Avg-seasonAvg);
  const l5=log.slice(-5);
  const res=l5.map(m=>{const gf=m.ha==="H"?(m.hs||0):(m.as||0),ga=m.ha==="H"?(m.as||0):(m.hs||0);return gf>ga?"W":gf===ga?"D":"L";});
  return{ratings,last5Avg,seasonAvg,delta,basis,g:l5.reduce((s,m)=>s+(m.g||0),0),a:l5.reduce((s,m)=>s+(m.a||0),0),mins:l5.reduce((s,m)=>s+(m.mins||0),0),w:res.filter(x=>x==="W").length,d:res.filter(x=>x==="D").length,l:res.filter(x=>x==="L").length,res,count:log.length};
}

