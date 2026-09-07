// grading/engine.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// Grade engine
export function pct(a,v){const s=[...a].sort((x,y)=>x-y);return s.filter(x=>x<v).length/Math.max(s.length,1);}

export function normPos(x){const t=String(x||"").toLowerCase().trim();/*POSNORM*/
  if(t==="gk"||t==="g"||t.includes("goal")||t.includes("keep"))return"Goalkeeper";
  if(t==="df"||t==="d"||t==="def"||t.includes("defen")||t.includes("back"))return"Defender";
  if(t==="fw"||t==="f"||t==="st"||t.includes("off")||t.includes("forw")||t.includes("atta")||t.includes("strik")||t.includes("wing"))return"Forward";
  if(t==="mf"||t==="m"||t.includes("mid"))return"Midfielder";
  return"Midfielder";}

export function toG(p){return Math.round(42+Math.max(0,Math.min(1,p))*57);}

export function computeGrades(ps){
  if(!ps.length)return{};
  const v=(k)=>ps.map(p=>p[k]||0);
  const xg=v("xg90"),xa=v("xa90"),ga=v("tga"),df=v("dga"),pc=v("pc"),pg=v("pga");
  const kp=v("kp90"),sca=v("sca90"),ftp=v("ftp90");
  const prs=v("prs90"),intc=v("intc90"),arl=v("arl90");
  const drb=v("drb90"),prgc=v("prgc90");

  // GK-specific pools (only GKs compared to GKs)
  const gks=ps.filter(p=>p.isGK);
  const gkSv=gks.map(p=>p.sv90||0);
  const gkCs=gks.map(p=>p.csRate||0);
  const gkGa=gks.map(p=>p.gaCon90||0);
  const gkPc=gks.map(p=>p.pc||0);
  const gkPrs=gks.map(p=>p.prs90||0);
  const gkArl=gks.map(p=>p.arl90||0);
  const gkPrgp=gks.map(p=>p.prgp90||0);
  // MLS-based GK pools — only includes GKs with real MLS data so percentiles aren't polluted
  const gksWithMls=gks.filter(p=>(p.gkEff90||0)!==0);
  const gkEffPool=gksWithMls.map(p=>p.gkEff90||0);
  const gkSvMlsPool=gksWithMls.map(p=>p.svMls90||0);
  const gkMlsPrsPool=gksWithMls.map(p=>p.mlsPrs90||0);
  const gkDpasPool=gksWithMls.map(p=>p.dpas90||0);
  const gkPassPerfPool=gksWithMls.map(p=>p.passPerf90||0);
  const gkDpasPctPool=gksWithMls.map(p=>p.dpasPct||0);
  const gkPassesPctPool=gksWithMls.map(p=>p.passesPctMls||0);
  const gkClaimPool=gksWithMls.map(p=>p.claim90||0);
  const gkSweepMlsPool=gksWithMls.map(p=>p.sweep90||0);
  const gkAerRatePool=gksWithMls.map(p=>p.aerWonRate||0);

  // ── [OPT1] League-wide OUTFIELD pools (universal sub-grades; GKs excluded) ──
  // Sub-grades rank against ALL outfielders, so "90 Defense" = elite defender
  // league-wide. Overall stays position-weighted + position-rescaled (pass 2).
  const ofs=ps.filter(p=>!p.isGK);
  const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number"&&x!==0);/*GRADEFULL*/
  const ofXg=mk(ofs,"xg90"),ofXa=mk(ofs,"xa90"),ofGa=mk(ofs,"tga"),ofDf=mk(ofs,"dga"),ofPc=mk(ofs,"pc"),ofPg=mk(ofs,"pga"),ofKp=mk(ofs,"kp90"),ofSca=mk(ofs,"sca90"),ofFtp=mk(ofs,"ftp90"),ofPrs=mk(ofs,"prs90"),ofIntc=mk(ofs,"intc90"),ofArl=mk(ofs,"arl90"),ofDrb=mk(ofs,"drb90"),ofPrgc=mk(ofs,"prgc90"),ofOxg=mk(ofs,"oxg90"),ofChc=mk(ofs,"chc90"),ofGdr=mk(ofs,"gdrV"),ofEsc=mk(ofs,"escV"),ofPresR=mk(ofs,"presRV"),ofPassPerf=mk(ofs,"passPerfV"),ofClr=mk(ofs,"clr90"),ofFls=mk(ofs,"flSuf90"),ofArlPct=mk(ofs,"arlPctV"),ofTk=mk(ofs,"tk90"),ofTkPct=mk(ofs,"tkwPct"),ofBlk=mk(ofs,"blk90");

  // Single outfield composite collector (sub-grades ranked league-wide pass 2;
  // overall ranked within position pass 2)
  const __mn=new Map();const mn=(a)=>{if(!__mn.has(a))__mn.set(a,a.length?a.reduce((t,x)=>t+x,0)/a.length:0);return __mn.get(a);};const K90S=8;
  const ofComposites=[];

  // GK composites collected first (pass 1), then rank-rescaled (pass 2)
  const gkComposites=[];

  const o={};
  ps.forEach(p=>{
    if(p.isGK&&gks.length>=3){
      // ── GK GRADING ──
      // Shot-Stopping (mapped to "attack"): saves/90 60%, clean sheet rate 40%
      const hasGkEff=(p.gkEff90||0)!==0&&gksWithMls.length>=3;
      const n90sG=p.n90s||6.7;const Sg=(pool,val)=>pct(pool,((val||0)*n90sG+mn(pool)*K90S)/(n90sG+K90S));/*GKREGRESS*/
      // Shot-Stopping: Save Quality is the gold-standard GK metric (PFF/FotMob use it)
      const shotStop=hasGkEff
        ?Sg(gkEffPool,p.gkEff90)*.50+Sg(gkSvMlsPool,p.svMls90)*.30+Sg(gkCs,p.csRate)*.20
        :Sg(gkSv,p.sv90)*.60+Sg(gkCs,p.csRate)*.40;
      // Distribution (mapped to "passing"): pass completion 50%, progressive passes/90 50%
      const dist=hasGkEff
        ?Sg(gkPassPerfPool,p.passPerf90)*.50+Sg(gkPassesPctPool,p.passesPctMls)*.25+Sg(gkDpasPctPool,p.dpasPct)*.25
        :Sg(gkPc,p.pc)*.50+Sg(gkPrgp,p.prgp90)*.50;
      // Command (mapped to "defense"): ball recovery/90 40%, aerials/90 40%, goals conceded/90 inverted 20%
      const gcInv=gkGa.length>1?1-Sg(gkGa,p.gaCon90):0.5; // lower GA = better (minutes-regressed)
      const command=hasGkEff
        ?Sg(gkClaimPool,p.claim90)*.50+Sg(gkAerRatePool,p.aerWonRate)*.30+gcInv*.20
        :Sg(gkPrs,p.prs90)*.40+Sg(gkArl,p.arl90)*.40+gcInv*.20;
      // Sweeping (mapped to "creativity"): aerials/90 50%, interceptions/90 50%
      const sweep=hasGkEff
        ?Sg(gkSweepMlsPool,p.sweep90)*.70+gcInv*.30
        :Sg(gkArl,p.arl90)*.50+Sg(v("intc90"),p.intc90)*.50;
      // Handling (mapped to "carrying"): clean sheet rate 50%, saves/90 50%
      const handling=hasGkEff
        ?Sg(gkCs,p.csRate)*.40+Sg(gkSvMlsPool,p.svMls90)*.60
        :Sg(gkCs,p.csRate)*.50+Sg(gkSv,p.sv90)*.50;
      // GK Overall: shot-stopping 35%, command 25%, distribution 20%, sweeping 10%, handling 10%
      const gkOv=shotStop*.35+command*.25+dist*.20+sweep*.10+handling*.10;
      gkComposites.push({id:p.id,ov:gkOv,shotStop,dist,command,sweep,handling});
    } else {
      // ── OUTFIELD GRADING ──
      // [OPT1] Sub-grades use LEAGUE-WIDE outfield pools (universal). Position
      // only drives the Overall weighting + the Overall rank pool (pass 2).
      const pos=p.pos||"Midfielder";
      const isFW=pos==="Forward"||pos==="FW";
      const isDF=pos==="Defender"||pos==="DF"||pos==="DEF";
      const n90s=p.n90s||6.7;const S=(pool,val)=>pct(pool,((val||0)*n90s+mn(pool)*K90S)/(n90s+K90S));

      // Sub-grades: universal (ranked against all outfielders)
      const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0);const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};
      const att=wsum([[ofOxg,p.oxg90,.40],[ofXg,p.xg90,.20],[ofChc,p.chc90,.25],[ofXa,p.xa90,.15]]);
      const pas=wsum([[ofPc,p.pc,.25],[ofPassPerf,p.passPerfV,.20],[ofPg,p.pga,.15],[ofFtp,p.ftp90,.15],[ofKp,p.kp90,.15],[ofPresR,p.presRV,.10]]);
      const def=wsum([[ofDf,p.dga,.20],[ofTk,p.tk90,.15],[ofPrs,p.prs90,.15],[ofIntc,p.intc90,.10],[ofClr,p.clr90,.10],[ofArl,p.arl90,.10],[ofArlPct,p.arlPctV,.075],[ofTkPct,p.tkwPct,.075],[ofBlk,p.blk90,.05]]);/*GRADEENGINE*/
      const cre=wsum([[ofKp,p.kp90,.40],[ofXa,p.xa90,.25],[ofChc,p.chc90,.20],[ofSca,p.sca90,.15]]);
      const car=wsum([[ofGdr,p.gdrV,.4308],[ofEsc,p.escV,.2462],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.1231],[ofFls,p.flSuf90,.10]]);/*prgc dropped: identical field to drb (both = nutmegs/p90, see fetch-data.js); weight folded into gdr/esc/ftp proportionally — Grading Integrity item 3*/
      const gaP=S(ofGa,p.tga);

      // Position-weighted Overall (weights unchanged)
      let ov;
      if(isFW){
        ov=att*.30+cre*.20+gaP*.25+car*.10+pas*.10+def*.05;
      }else if(isDF){
        ov=def*.30+gaP*.25+pas*.20+car*.10+cre*.10+att*.05;
      }else{
        ov=gaP*.20+pas*.20+cre*.20+att*.15+def*.15+car*.10;
      }
      // Collect once: sub-grades ranked league-wide, Overall ranked within position (pass 2).
      ofComposites.push({id:p.id,pos:isFW?"FW":isDF?"DF":"MF",ov,att,pas,def,cre,car});
    }
  });
  

  // ── GK PASS 2: rank-rescale ──
  // Convert each GK's composite + sub-grades to rank within GK pool, then
  // map rank percentile to grade scale targeting top=95, median=75, bottom=40.
  // Math: 40 + pow(rankPct, 1.5) * 59 — ceiling 99
  const OV_REF=0.85,GRADE_EXP=0.9;/*OVANCHOR*/
  const POS_REF={FW:0.85,MF:0.82,DF:0.72,GK:0.72};/*POSREF*/
  const grOf=(v,ceil)=>{const cc=ceil||99;return Math.max(0,Math.min(cc,Math.round(Math.pow(Math.max(0,Math.min(1,(v||0)/OV_REF)),GRADE_EXP)*cc)));};
  const grOfP=(v,pos,ceil=99)=>{const ref=POS_REF[pos]||OV_REF;return Math.max(0,Math.min(ceil,Math.round(Math.pow(Math.max(0,Math.min(1,(v||0)/ref)),GRADE_EXP)*990)/10));};/*DEC*/
  if(gkComposites.length>=3){
    const rankToGrade=(rankPct)=>Math.round(42+Math.pow(Math.max(0,Math.min(1,rankPct)),1.5)*57);
    const buildRanks=(key)=>{
      const sorted=[...gkComposites].sort((a,b)=>a[key]-b[key]);
      const ranks={};
      sorted.forEach((g,idx)=>{ranks[g.id]=sorted.length>1?idx/(sorted.length-1):1;});
      return ranks;
    };
    const ovRanks=buildRanks('ov');
    const ssRanks=buildRanks('shotStop');
    const distRanks=buildRanks('dist');
    const cmdRanks=buildRanks('command');
    const swpRanks=buildRanks('sweep');
    const hndRanks=buildRanks('handling');
    for(const g of gkComposites){
      o[g.id]={
        overall:grOfP(g.ov,"GK",99),
        attack:grOf(g.shotStop,99),
        passing:grOf(g.dist,99),
        defense:grOf(g.command,99),
        creativity:grOf(g.sweep,99),
        carrying:grOf(g.handling,99),
        isGK:true
      };
    }
  }

  // ── OUTFIELD PASS 2 [OPT1] ──
  // Sub-grades ranked LEAGUE-WIDE (all outfielders); Overall ranked WITHIN
  // position (so each position can top out near 99).
  const OV_CEIL={FW:99,MF:99,DF:99};
  const ovGradeOf2=(rp,ceil)=>Math.round(42+Math.pow(Math.max(0,Math.min(1,rp)),1.5)*(((ceil||97))-42));
  const rankToGradeOf=(rp)=>Math.round(42+Math.pow(Math.max(0,Math.min(1,rp)),1.5)*57);
  if(ofComposites.length>=3){
    const buildRanks=(arr,key)=>{
      const sorted=[...arr].sort((a,b)=>a[key]-b[key]);
      const ranks={};
      sorted.forEach((c,idx)=>{ranks[c.id]=sorted.length>1?idx/(sorted.length-1):1;});
      return ranks;
    };
    // Sub-grades: league-wide ranks across every outfielder
    const attR=buildRanks(ofComposites,'att'),pasR=buildRanks(ofComposites,'pas'),defR=buildRanks(ofComposites,'def'),creR=buildRanks(ofComposites,'cre'),carR=buildRanks(ofComposites,'car');
    // Overall: ranked within each position group
    const ovR={};
    for(const grp of ["FW","MF","DF"]){
      const sub=ofComposites.filter(c=>c.pos===grp);
      if(sub.length>=3){const r=buildRanks(sub,'ov');for(const id in r)ovR[id]=r[id];}
      else for(const c of sub)ovR[c.id]=0.5;
    }
    for(const c of ofComposites){
      o[c.id]={
        overall:grOfP(c.ov,c.pos,OV_CEIL[c.pos]||97),
        attack:grOf(c.att,99),
        passing:grOf(c.pas,99),
        defense:grOf(c.def,99),
        creativity:grOf(c.cre,99),
        carrying:grOf(c.car,99)
      };
    }
  }

  return o;
}

