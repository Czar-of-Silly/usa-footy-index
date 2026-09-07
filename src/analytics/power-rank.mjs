// analytics/power-rank.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
export function powerRankFor(abbr,teams,standings,matches){
  if(!standings.length)return null;
  const grade={};teams.forEach(t=>{grade[t.abbr]=t.overall;});
  const maxPts=Math.max(...standings.map(s=>s.pts||0),1);
  const rows=standings.map(s=>{const tm=matches.filter(m=>m.completed&&(m.home===s.team||m.away===s.team)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5);let fp=0;for(const m of tm){const hs=+(m.homeScore||0),as=+(m.awayScore||0);const home=m.home===s.team;fp+=(home?hs>as:as>hs)?3:hs===as?1:0;}const f=tm.length?(fp/(tm.length*3))*100:50;return{team:s.team,score:Math.round(((s.pts||0)/maxPts)*100*.5+(grade[s.team]||50)*.3+f*.2)};}).sort((a,b)=>b.score-a.score);
  const i=rows.findIndex(r=>r.team===abbr);return i<0?null:i+1;
}

