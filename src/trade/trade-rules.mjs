// trade/trade-rules.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// ─── COMPONENTS ──────────────────────────────────────────────────────────────
/*TRADE-MACHINE*/
// ── MLS Trade Machine rules engine (Path A: slot + budget-charge compliance) ──
// 2026 constants. [V]=verified Feb 2026, [C]=confirm. UPDATE EACH FEBRUARY.
export const TM_RULES={MAX_SALARY_BUDGET_CHARGE:803125,MIDSEASON_DP_CHARGE:401563,TAM_CEILING:1803125,SENIOR_SALARY_BUDGET:6425000/*PATHB*/,GAM_ALLOTMENT:3280000,DISCRETIONARY_TAM:2125000,MAX_DP:3,MAX_U22:4,MAX_INTERNATIONAL:8,SENIOR_ROSTER_MAX:20,TOTAL_ROSTER_MAX:30};

// Per-club available General Allocation Money (MLS published, as of Feb 20 2026, post Roster Compliance).
// GAM buys down Salary Budget Charges $1-for-$1. UPDATE from the latest MLS GAM
// release / Club Roster Profiles when republished (a few times per season).
export const TM_GAM={ATL:344356,ATX:412817,CLT:75994,CHI:1003353,CIN:361337,COL:5007225,CLB:952447,DAL:1576731,DC:2137599,HOU:2310805,SKC:6380121,LA:0,LAFC:249749,MIA:17361,MIN:4157930,MTL:3247472,NSH:1581229,NE:1162968,NYC:2637519,ORL:655360,PHI:4393417,POR:4788001,RSL:4435148,RBNY:189830,SD:4211327,SJ:4725751,SEA:243090,STL:2227157,TOR:3078603,VAN:20945};

export const tmNum=v=>(typeof v==="number"&&isFinite(v)?v:0);

export function tmCounts(p){if(p.isLoanedOut)return false;const c=p.rosterCategory||"";return c==="Senior"||c.indexOf("Supplemental")===0;}

export function tmSenior(p){return !p.isLoanedOut&&(p.rosterCategory||"")==="Senior";}

export function tmCharge(p,K){return p.isDP?K.MAX_SALARY_BUDGET_CHARGE:Math.min(tmNum(p.salary),K.MAX_SALARY_BUDGET_CHARGE);/*TAMNET*/}

export function tmSummarize(roster,K){K=K||TM_RULES;const cc=roster.filter(tmCounts),sr=roster.filter(tmSenior);const s={size:cc.length,seniorSize:sr.length,offRoster:roster.length-cc.length,dp:0,u22:0,intl:0,hg:0,budgetCharge:0,missingSalary:0,totalGrade:0,gradedCount:0};for(const p of cc){if(p.isDP)s.dp++;if(p.isU22)s.u22++;if(p.isInternational)s.intl++;if(p.isHomegrown)s.hg++;if(typeof p.overall==="number"){s.totalGrade+=p.overall;s.gradedCount++;}}for(const p of sr){const sal=tmNum(p.salary);if(!p.isDP&&sal===0)s.missingSalary++;s.budgetCharge+=tmCharge(p,K);}s.avgGrade=s.gradedCount?+(s.totalGrade/s.gradedCount).toFixed(1):0;return s;}

export function tmCheck(after,prev,K,gam,intlMax){K=K||TM_RULES;const violations=[],warnings=[];const iMax=(typeof intlMax==="number")?intlMax:K.MAX_INTERNATIONAL;if(after.dp>K.MAX_DP){if(prev.dp>K.MAX_DP&&after.dp>=prev.dp)warnings.push("Already shows "+prev.dp+" DPs in source data (MLS max "+K.MAX_DP+"; likely a roster-feed quirk). Trade doesn't reduce it.");else violations.push(after.dp+" Designated Players \u2014 exceeds max of "+K.MAX_DP+". Buy one down with GAM/TAM or include them in the trade.");}if(after.u22>K.MAX_U22)warnings.push(after.u22+" U22 Initiative players (typical max "+K.MAX_U22+") \u2014 verify against the club's declared model.");if(after.intl>iMax)warnings.push(after.intl+" international players \u2014 over "+iMax+" slots"+(iMax!==K.MAX_INTERNATIONAL?" (after traded slots)":"")+"; needs extra (tradeable) international spots.");if(after.size>K.TOTAL_ROSTER_MAX)violations.push(after.size+" players \u2014 exceeds roster limit of "+K.TOTAL_ROSTER_MAX+".");const over=after.budgetCharge-K.SENIOR_SALARY_BUDGET;if(after.missingSalary>0)warnings.push("Budget approximate: "+after.missingSalary+" senior player(s) missing salary data.");if(over>0){const haveGam=(typeof gam==="number");const pool=haveGam?gam:(K.GAM_ALLOTMENT+K.DISCRETIONARY_TAM);if(over>pool){const prevOver=prev.budgetCharge-K.SENIOR_SALARY_BUDGET;/*VERDICTFIX*/
if(prevOver>pool){warnings.push("Already $"+(prevOver/1e6).toFixed(2)+"M over budget before any trade \u2014 a charge-model artifact (real clubs must be compliant)"+(after.budgetCharge>prev.budgetCharge+1000?"; note this trade adds $"+((after.budgetCharge-prev.budgetCharge)/1e6).toFixed(2)+"M to it":"; trade doesn't worsen it")+".");}
else{violations.push("Charge $"+(after.budgetCharge/1e6).toFixed(2)+"M is $"+(over/1e6).toFixed(2)+"M over the $"+(K.SENIOR_SALARY_BUDGET/1e6).toFixed(2)+"M budget \u2014 more than the club's "+(haveGam?"$"+(pool/1e6).toFixed(2)+"M available GAM":"allocation money")+" can buy down"+(prevOver>0?" (and the club was already $"+(prevOver/1e6).toFixed(2)+"M over)":"")+".");}}else{warnings.push("$"+(over/1e6).toFixed(2)+"M over budget \u2014 covered by buying down with the club's "+(haveGam?"$"+(pool/1e6).toFixed(2)+"M available GAM (leaves $"+((pool-over)/1e6).toFixed(2)+"M)":"GAM/TAM")+".");}}return{violations,warnings,intlMax:iMax};}

export function tmEvaluate(o){const K=o.K||TM_RULES;const idOf=p=>p.id||p.sportecId||p.name;const oa=new Set(o.outA.map(idOf)),ob=new Set(o.outB.map(idOf));const afterA=o.rosterA.filter(p=>!oa.has(idOf(p))).concat(o.outB);const afterB=o.rosterB.filter(p=>!ob.has(idOf(p))).concat(o.outA);const bA=tmSummarize(o.rosterA,K),aA=tmSummarize(afterA,K),bB=tmSummarize(o.rosterB,K),aB=tmSummarize(afterB,K);const astA=o.assetA||{gam:0,intl:0,picks:0},astB=o.assetB||{gam:0,intl:0,picks:0};
const baseGamA=TM_GAM[o.nameA],baseGamB=TM_GAM[o.nameB];
const gamA=(typeof baseGamA==="number")?baseGamA-(astA.gam||0)+(astB.gam||0):undefined;
const gamB=(typeof baseGamB==="number")?baseGamB-(astB.gam||0)+(astA.gam||0):undefined;
const iMaxA=K.MAX_INTERNATIONAL-(astA.intl||0)+(astB.intl||0);
const iMaxB=K.MAX_INTERNATIONAL-(astB.intl||0)+(astA.intl||0);
const cA=tmCheck(aA,bA,K,gamA,iMaxA),cB=tmCheck(aB,bB,K,gamB,iMaxB);
if((astA.gam||0)>0&&typeof baseGamA==="number"&&astA.gam>baseGamA)cA.violations.push("Sending $"+(astA.gam/1e6).toFixed(2)+"M GAM but the club only has $"+(baseGamA/1e6).toFixed(2)+"M available.");
if((astB.gam||0)>0&&typeof baseGamB==="number"&&astB.gam>baseGamB)cB.violations.push("Sending $"+(astB.gam/1e6).toFixed(2)+"M GAM but the club only has $"+(baseGamB/1e6).toFixed(2)+"M available.");const sum=(arr,f)=>arr.reduce((t,p)=>t+f(p),0);const gO=sum(o.outA,p=>tmNum(p.overall)),gI=sum(o.outB,p=>tmNum(p.overall));const sO=sum(o.outA,p=>tmNum(p.salary)),sI=sum(o.outB,p=>tmNum(p.salary));const gamDelta=(astB.gam||0)-(astA.gam||0),picksDelta=(astB.picks||0)-(astA.picks||0);
const gv=(gI-gO)+(gamDelta+picksDelta*100000)/250000;
const fairness={gradeDelta:+(gI-gO).toFixed(1),salaryDelta:sI-sO,gamDelta,picksDelta,verdict:Math.abs(gv)<=8?"balanced":(gv>0?"favors "+(o.nameA||"Team A"):"favors "+(o.nameB||"Team B"))};return{legal:cA.violations.length===0&&cB.violations.length===0,teamA:{before:bA,after:aA,constants:K,violations:cA.violations,warnings:cA.warnings,intlMax:cA.intlMax},teamB:{before:bB,after:aB,constants:K,violations:cB.violations,warnings:cB.warnings,intlMax:cB.intlMax},fairness};}

export function tmPos(p){const z=String(p.position||'').toLowerCase();if(z.includes('keep')||z==='gk')return 'GK';if(z.includes('back')||z.includes('def'))return 'D';if(z.includes('mid'))return 'M';return 'F';}

export function tmScoreSet(gOut,sOut,outPos,set){/*MULTI*/
  const num=tmNum;
  const gC=set.reduce((t,p)=>t+num(p.overall),0), sC=set.reduce((t,p)=>t+num(p.salary),0);
  const gDiff=Math.abs(gOut-gC), sDiff=Math.abs(sOut-sC)/Math.max(sOut,sC,500000);
  const gScore=Math.max(0,1-gDiff/25), sScore=Math.max(0,1-sDiff);
  const posBonus=set.some(p=>outPos.has(tmPos(p)))?5:0;
  return Math.round((gScore*0.6+sScore*0.4)*95+posBonus);
}

export function tmSuggestReturns(o){/*TRADE-SUGGEST*/
  const K=o.K||TM_RULES, num=tmNum;
  const gOut=o.outA.reduce((t,p)=>t+num(p.overall),0);
  const sOut=o.outA.reduce((t,p)=>t+num(p.salary),0);
  const outPos=new Set(o.outA.map(tmPos));
  const exIds=new Set([...(o.exclude||[]),...o.outA].map(p=>p.id));
  const cands=o.rosterB.filter(p=>p.rated&&tmCounts(p)&&!exIds.has(p.id));
  const single=cands.map(p=>({set:[p],score:tmScoreSet(gOut,sOut,outPos,[p])})).sort((a,b)=>b.score-a.score).slice(0,5);
  let entries=single;
  // Fallback: best single is a weak match -> search 2-player packages from the top pool
  if(single.length && single[0].score<60){
    const top=cands.slice().sort((a,b)=>num(b.overall)-num(a.overall)).slice(0,15);
    let best=null;
    for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++){
      const sc=tmScoreSet(gOut,sOut,outPos,[top[i],top[j]]);
      if(!best||sc>best.score)best={set:[top[i],top[j]],score:sc};
    }
    if(best && best.score>single[0].score) entries=[best,...single.slice(0,4)];
  }
  return entries.map(e=>{
    const ev=tmEvaluate({rosterA:o.rosterA,rosterB:o.rosterB,outA:o.outA,outB:e.set,nameA:o.nameA,nameB:o.nameB});
    return {players:e.set,score:e.score,legal:ev.legal};
  });
}

