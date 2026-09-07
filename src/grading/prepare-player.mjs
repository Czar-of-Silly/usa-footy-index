// grading/prepare-player.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { normPos } from "./engine.mjs";

// ─── CANONICAL PLAYER PREPARATION (Phase 5.3) ─────────────────────────
// Lifted verbatim from the main loader. validatePlayer clamps/normalises a raw cache row; preparePlayerForGrading
// turns it into the engine's per-90 input. NOTE (Grading Integrity): build-ask-context.js, snapshot-rankings.js
// and build-routes.js still use their own un-clamped mapping, and the in-app history loader uses a reduced one.
export const safeNum=(v,min,max,def)=>{const n=Number(v);return isNaN(n)?def:Math.max(min,Math.min(max,n));};

export function validatePlayer(r){const safe=safeNum;return ({
        n:String(r.n).slice(0,40),t:String(r.t).slice(0,5),p:normPos(r.p),a:safe(r.a,15,45,25),ht:safe(r.ht,155,205,null),wt:safe(r.wt,55,110,null),
        m:safe(r.m,0,3000,600),g:safe(r.g,0,40,0),as:safe(r.as,0,30,0),xg:safe(r.xg,0,20,0),xa:safe(r.xa,0,15,0),
        pp:safe(r.pp,30,99,75),xpp:safe(r.xpp,30,99,75),gs:safe(r.gs,-3,5,0),gp:safe(r.gp,-3,5,0),gdr:safe(r.gdr,-3,5,0),gdf:safe(r.gdf,-3,5,0),gi:safe(r.gi,-3,5,0),
        mv:safe(r.mv,0,50e6,500000),tk:safe(r.tk,0,80,0),tkw:safe(r.tkw,0,80,0),departed:r.departed===true,blk:safe(r.blk,0,60,0),sh:safe(r.sh,0,120,0),so:safe(r.so,0,60,0),fl:safe(r.fl,0,50,0),yc:safe(r.yc,0,15,0),rc:safe(r.rc,0,3,0),
        kp:safe(r.kp,0,80,0),sca:safe(r.sca,0,120,0),prgp:safe(r.prgp,0,200,0),ftp:safe(r.ftp,0,100,0),prs:safe(r.prs,0,500,0),intc:safe(r.intc,0,60,0),arl:safe(r.arl,0,80,0),drb:safe(r.drb,0,80,0),prgc:safe(r.prgc,0,100,0),/*3B-FIELDS*/oxg:safe(r.oxg,0,30,0),chc:safe(r.chc,0,150,0),gop:safe(r.gop,0,150,0),arlPct:safe(r.arlPct,0,100,0),arlLost:safe(r.arlLost,0,120,0),clr:safe(r.clr,0,250,0),presR:safe(r.presR,-5,5,0),esc:safe(r.esc,0,5,0),dist:safe(r.dist,0,400,0),spd:safe(r.spd,0,45,0),nut:safe(r.nut,0,60,0),flSuf:safe(r.flSuf,0,200,0),xsv:safe(r.xsv,0,250,0),gkEff:safe(r.gkEff,-25,25,0),headshot:r.headshot||null,
        matchLog:Array.isArray(r.matchLog)?r.matchLog:[],
        sal:safe(r.guaranteedComp||r.baseSalary||r.salary,0,40e6,0),
        sv:safe(r.sv,0,200,0),cs:safe(r.cs,0,40,0),gaCon:safe(r.ga_conceded,0,100,0),
        /*GKMLS*/gkEfficiency:safe(r.gkEfficiency,-20,20,0),gkSavesMLS:safe(r.gkSavesMLS,0,200,0),mlsPressures:safe(r.mlsPressures,0,1500,0),mlsDifficultPasses:safe(r.mlsDifficultPasses,0,500,0),mlsPassingPerformance:safe(r.mlsPassingPerformance,-50,50,0),mlsDifficultPassesPct:safe(r.mlsDifficultPassesPct,0,1,0),mlsPassesPct:safe(r.mlsPassesPct,0,100,0),mlsIntCorner:safe(r.mlsIntCorner,0,50,0),mlsIntHeld:safe(r.mlsIntHeld,0,50,0),mlsIntCross:safe(r.mlsIntCross,0,50,0),mlsIntFisted:safe(r.mlsIntFisted,0,50,0),mlsAerialsWon:safe(r.mlsAerialsWon,0,80,0),mlsAerialsTotal:safe(r.mlsAerialsTotal,0,80,0),
        isDP:!!r.isDP,isU22:!!r.isU22,isIntl:!!r.isInternational,isHG:!!r.isHomegrown,isLoaned:!!r.isLoanedOut,rosterCat:r.rosterCategory||null,sportecId:r.sportecId||null,
        prevTeam:r.prevTeam||null,localHeadshot:r.localHeadshot||null,
      });}

export function preparePlayerForGrading(r,i){const id="p"+i,m=r.m||600,p90=m/90;const games=Math.max(1,Math.round(m/90));return{id,tk90:(r.tk||0)/p90,tkwPct:(r.tk>=8?(r.tkw||0)/r.tk:0),blk90:(r.blk||0)/p90,xg90:(r.xg||0)/p90,xa90:(r.xa||0)/p90,pc:r.pp||75,pga:r.gp||0,tga:(r.gs||0)+(r.gp||0)+(r.gdr||0)+(r.gdf||0)+(r.gi||0),dga:(r.gdf||0)+(r.gi||0),kp90:(r.kp||0)/p90,sca90:(r.sca||0)/p90,prgp90:(r.prgp||0)/p90,ftp90:(r.ftp||0)/p90,prs90:(r.prs||0)/p90,intc90:(r.intc||0)/p90,arl90:(r.arl||0)/p90,drb90:(r.drb||0)/p90,prgc90:(r.prgc||0)/p90,/*STEP4*/oxg90:(r.oxg||0)/p90,chc90:(r.chc||0)/p90,clr90:(r.clr||0)/p90,flSuf90:(r.flSuf||0)/p90,arlPctV:(r.arlPct||0),n90s:m/90,gdrV:(r.gdr||0),escV:(r.esc||0),presRV:(r.presR||0),passPerfV:(r.passPerf||0),
        // GK-specific
        isGK:(r.p==="GK"||r.p==="Goalkeeper"),pos:r.p,sv90:(r.sv||0)/p90,csRate:games>0?(r.cs||0)/games:0,gaCon90:games>0?(r.gaCon||0)/p90:0,gkEff90:games>0?(r.gkEfficiency||0)/games:0,svMls90:(r.gkSavesMLS||0)/p90,mlsPrs90:(r.mlsPressures||0)/p90,dpas90:(r.mlsDifficultPasses||0)/p90,passPerf90:games>0?(r.mlsPassingPerformance||0)/games:0,dpasPct:(r.mlsDifficultPassesPct||0),passesPctMls:(r.mlsPassesPct||r.pc||0),claim90:((r.mlsIntCorner||0)+(r.mlsIntHeld||0))/p90,sweep90:((r.mlsIntCross||0)+(r.mlsIntFisted||0))/p90,aerWonRate:(r.mlsAerialsTotal>0?(r.mlsAerialsWon||0)/r.mlsAerialsTotal:0),
        raw:r};}

