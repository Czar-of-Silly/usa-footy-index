// cards/share-cards.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { computeForm } from "../analytics/form.mjs";
import { slugify } from "../routing/routes.mjs";
import { T, gc } from "../theme.mjs";
import { dv, fmtETTime } from "../util/format.mjs";

// ─── SHARE CARDS (Phase 4b) ───────────────────────────────────────────
// 1200×630 landscape cards for link previews and social. Same tokens as the page.
export let DATA_GENERATED=null;
export function setDataGenerated(v){DATA_GENERATED=v;}

// ISO string of the cache's generated time; set on load
export const CARD_W=1200,CARD_H=630;

export const F_DISPLAY="'Playfair Display','Source Serif 4',Georgia,serif",F_SERIF="'Source Serif 4','Libre Baskerville',Georgia,serif",F_MONO="'JetBrains Mono','Courier New',monospace",F_FELL="'IM Fell English SC','Playfair Display',serif";

export const cardLoadImg=(src)=>new Promise(r=>{if(!src)return r(null);const img=new Image();img.crossOrigin="anonymous";img.onload=()=>r(img);img.onerror=()=>r(null);img.src=src;setTimeout(()=>r(null),3500);});

export async function cardFonts(){try{await Promise.all(["700 44px "+F_DISPLAY,"900 60px "+F_DISPLAY,"400 18px "+F_SERIF,"italic 18px "+F_SERIF,"700 12px "+F_MONO,"400 34px "+F_FELL].map(f=>document.fonts.load(f)));await document.fonts.ready;}catch(e){}}

export function cardSpaced(x,text,px,py,sp,align){const w=[...text].reduce((s,ch)=>s+x.measureText(ch).width+sp,0)-sp;let cx=align==="right"?px-w:align==="center"?px-w/2:px;const prev=x.textAlign;x.textAlign="left";for(const ch of text){x.fillText(ch,cx,py);cx+=x.measureText(ch).width+sp;}x.textAlign=prev;return w;}

export function cardTrunc(x,text,maxW){let t=String(text||"");if(x.measureText(t).width<=maxW)return t;while(t.length>1&&x.measureText(t+"\u2026").width>maxW)t=t.slice(0,-1);return t+"\u2026";}

export function cardBadge(x,img,abbr,cx,cy,size){if(img){try{x.drawImage(img,cx-size/2,cy-size/2,size,size);return;}catch(e){}}x.fillStyle=T.card;x.fillRect(cx-size/2,cy-size/2,size,size);x.strokeStyle=T.border;x.lineWidth=1;x.strokeRect(cx-size/2,cy-size/2,size,size);x.fillStyle=T.ink;x.textAlign="center";x.font=`700 ${Math.round(size*0.28)}px ${F_MONO}`;x.fillText(abbr||"",cx,cy+size*0.1);x.textAlign="left";}

export function cardStamp(x,cx,cy,grade,label,size){const col=gc(grade);x.save();x.translate(cx,cy);x.rotate(-0.05);x.strokeStyle=col;x.lineWidth=3;x.strokeRect(-size/2,-size/2,size,size);x.lineWidth=1;x.strokeRect(-size/2+7,-size/2+7,size-14,size-14);x.fillStyle=col;x.textAlign="center";x.font=`900 ${Math.round(size*0.5)}px ${F_DISPLAY}`;x.fillText(String(Math.round(grade)),0,size*0.16);x.font=`700 ${Math.max(9,Math.round(size*0.09))}px ${F_MONO}`;cardSpaced(x,label||"INDEX GRADE",0,size*0.34,1.5,"center");x.restore();x.textAlign="left";}

export function cardPill(x,px,py,txt,bg,fg,padX,h,font){x.font=font||("700 11px "+F_MONO);const w=x.measureText(txt).width+padX*2;x.fillStyle=bg;x.fillRect(px,py,w,h);x.fillStyle=fg;x.textAlign="left";x.fillText(txt,px+padX,py+h*0.7);return w;}

export function cardFrame(x,{kicker,title,sub}){
  x.fillStyle=T.bg;x.fillRect(0,0,CARD_W,CARD_H);
  // faint newsprint grain
  x.fillStyle="rgba(35,31,25,0.035)";for(let i=0;i<220;i++){x.fillRect((i*7919)%CARD_W,(i*104729)%CARD_H,1.5,1.5);}
  x.strokeStyle=T.border;x.lineWidth=2;x.strokeRect(18,18,CARD_W-36,CARD_H-36);
  x.strokeStyle=T.borderLt;x.lineWidth=1;x.strokeRect(26,26,CARD_W-52,CARD_H-52);
  // nameplate
  x.fillStyle=T.ink;x.font="400 34px "+F_FELL;x.textAlign="left";x.fillText("USA Footy ",48,74);const w1=x.measureText("USA Footy ").width;x.fillStyle=T.accent;x.fillText("Index",48+w1,74);
  x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,"STORIES LEAD. STATS INFORM.",CARD_W-48,58,1.6,"right");
  const upd=DATA_GENERATED?("UPDATED "+fmtETTime(DATA_GENERATED)).toUpperCase():"";if(upd)cardSpaced(x,upd,CARD_W-48,76,1.2,"right");
  x.fillStyle=T.ink;x.fillRect(48,92,CARD_W-96,2);x.fillRect(48,97,CARD_W-96,1);
  let y=132;
  if(kicker){x.fillStyle=T.accent;x.font="700 12px "+F_MONO;cardSpaced(x,kicker.toUpperCase(),48,y,2.2);y+=40;}
  if(title){x.fillStyle=T.ink;x.font="700 42px "+F_DISPLAY;x.fillText(cardTrunc(x,title,CARD_W-96),48,y);y+=14;}
  if(sub){x.fillStyle=T.textDim;x.font="italic 17px "+F_SERIF;x.fillText(cardTrunc(x,sub,CARD_W-96),48,y+22);y+=28;}
  // footer
  x.fillStyle=T.ink;x.fillRect(0,CARD_H-44,CARD_W,44);
  x.fillStyle=T.bg;x.font="700 12px "+F_MONO;cardSpaced(x,"USFOOTYINDEX.COM",48,CARD_H-17,2);
  x.fillStyle=T.borderLt;x.font="400 10px "+F_MONO;cardSpaced(x,"DATA: ESPN \u00b7 AMERICAN SOCCER ANALYSIS \u00b7 MLS OFFICIAL (OPTA)",CARD_W-48,CARD_H-17,1,"right");
  return{x:48,y:y+18,w:CARD_W-96,bottom:CARD_H-60};
}

export function cardDownload(c,name){let url;try{url=c.toDataURL("image/png");}catch(e){alert("Couldn't export the card: an external image blocked it. Try once more.");return;}const a=document.createElement("a");a.download=name;a.href=url;a.click();}

export async function makeCard(name,draw){await cardFonts();const c=document.createElement("canvas");c.width=CARD_W;c.height=CARD_H;const x=c.getContext("2d");x.textBaseline="alphabetic";await draw(x);cardDownload(c,name);}

export const cardFile=(s)=>slugify(s)+"-usa-footy-index.png";

export const cardResult=(m,abbr)=>{const home=m.home===abbr;const gf=home?+(m.homeScore||0):+(m.awayScore||0),ga=home?+(m.awayScore||0):+(m.homeScore||0);return gf>ga?"W":gf===ga?"D":"L";};

export function drawFormPills(x,px,py,res,size){res.forEach((r,i)=>{x.fillStyle=r==="W"?T.green:r==="D"?T.textDim:T.red;x.fillRect(px+i*(size+4),py,size,size);x.fillStyle=T.bg;x.font=`700 ${Math.round(size*0.55)}px ${F_MONO}`;x.textAlign="center";x.fillText(r,px+i*(size+4)+size/2,py+size*0.7);});x.textAlign="left";}

// 1) PLAYER — wide
export async function cardPlayer(p){
  const[head,logo]=await Promise.all([cardLoadImg(p.localHeadshot||p.headshot),cardLoadImg(p.teamLogo)]);
  await makeCard(cardFile(p.name+"-card"),(x)=>{
    const b=cardFrame(x,{kicker:"Player Grade \u00b7 "+(p.position||""),title:p.name,sub:(p.teamName||p.team)+(p.age?" \u00b7 Age "+Math.floor(+p.age):"")+" \u00b7 "+(p.mins||0)+" minutes"});
    // headshot
    const hx=48,hy=b.y,hs=196;x.fillStyle=T.card;x.fillRect(hx,hy,hs,hs);x.strokeStyle=T.border;x.lineWidth=1;x.strokeRect(hx,hy,hs,hs);
    if(head){try{x.save();x.beginPath();x.rect(hx+1,hy+1,hs-2,hs-2);x.clip();const s=Math.max((hs-2)/head.width,(hs-2)/head.height);x.drawImage(head,hx+1+((hs-2)-head.width*s)/2,hy+1+((hs-2)-head.height*s)/2,head.width*s,head.height*s);x.restore();}catch(e){}}
    cardBadge(x,logo,p.team,hx+hs-6,hy+hs-6,54);
    // grade stamp
    if(p.overall!=null&&p.rated!==false)cardStamp(x,hx+hs+130,hy+hs/2+6,p.overall,"INDEX GRADE",150);
    else{x.fillStyle=T.textMute;x.font="700 34px "+F_DISPLAY;x.fillText("NR",hx+hs+110,hy+hs/2+14);}
    // sub-grades
    const subs=[["ATTACK",p.attack],["PASSING",p.passing],["DEFENSE",p.defense],["CREATIVITY",p.creativity],["CARRYING",p.carrying]].filter(s=>s[1]!=null);
    let sx=hx+hs+240,sy=hy+8;
    x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,"SUB-GRADES",sx,sy,1.6);sy+=16;
    subs.forEach((s,i)=>{const yy=sy+i*34;x.fillStyle=T.textDim;x.font="700 10px "+F_MONO;cardSpaced(x,s[0],sx,yy+16,1.2);x.fillStyle=T.borderLt;x.fillRect(sx+112,yy+7,220,10);x.fillStyle=gc(s[1]);x.fillRect(sx+112,yy+7,220*Math.max(0,Math.min(1,(s[1]-42)/57)),10);x.fillStyle=T.ink;x.font="700 16px "+F_DISPLAY;x.fillText(String(Math.round(s[1])),sx+342,yy+18);});
    // season line
    const ly=hy+hs+38;x.fillStyle=T.ink;x.fillRect(48,ly-22,CARD_W-96,1);
    const stats=[["G",p.goals],["A",p.assists],["xG/90",p.xg90],["xA/90",p.xa90],["G+",(+p.totalGA>=0?"+":"")+p.totalGA]];
    let cx=48;stats.forEach(([l,v])=>{x.fillStyle=T.ink;x.font="900 30px "+F_DISPLAY;x.fillText(String(dv(v)),cx,ly+18);const w=x.measureText(String(dv(v))).width;x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,l,cx+w+8,ly+18,1.2);cx+=w+8+x.measureText(l).width*1.3+44;});
    // form
    if(p.matchLog&&p.matchLog.length>=2){const f=computeForm(p.matchLog,p.position);const rs=f.ratings.slice(-8);const fx=760,fy=ly-8,bw=34,bh=56;x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,"MATCH FORM \u00b7 LAST "+rs.length,fx,fy-20,1.4);x.fillStyle=T.textDim;x.font="400 10px "+F_MONO;x.textAlign="right";x.fillText("last 5 avg "+Math.round(f.last5Avg)+" \u00b7 season "+Math.round(f.seasonAvg),CARD_W-48,fy-20);x.textAlign="left";rs.forEach((v,i)=>{const h=Math.max(6,((v-42)/57)*bh);const bx=fx+i*(bw+8);x.fillStyle=gc(v);x.fillRect(bx,fy+bh-h,bw,h);x.fillStyle=T.ink;x.font="700 11px "+F_MONO;x.textAlign="center";x.fillText(v,bx+bw/2,fy+bh-h-5);x.fillStyle=T.textMute;x.font="400 9px "+F_MONO;x.fillText((p.matchLog.slice(-8)[i].opp||""),bx+bw/2,fy+bh+13);});x.textAlign="left";}
  });
}

// 2) PLAYER OF THE WEEK — spotlight + the XI
export async function cardTOTW({spot,xi,weekLabel,weekNo}){
  const[head,logo]=await Promise.all([cardLoadImg(spot.player.localHeadshot||spot.player.headshot),cardLoadImg(spot.player.teamLogo)]);
  await makeCard(cardFile("team-of-the-week-"+(weekLabel||"")),(x)=>{
    const b=cardFrame(x,{kicker:"Team of the Week \u00b7 Matchweek "+weekNo+(weekLabel?" \u00b7 "+weekLabel:""),title:"Player of the Week: "+spot.player.name,sub:(spot.player.position||"")+" \u00b7 "+(spot.player.teamName||spot.player.team)+" \u00b7 "+(spot.ha==="A"?"at ":"vs ")+(spot.opp||"")+" \u00b7 "+(spot.mins||0)+"'"+(spot.g?" \u00b7 "+spot.g+" G":"")+(spot.a?" \u00b7 "+spot.a+" A":"")});
    const hx=48,hy=b.y,hs=170;x.fillStyle=T.card;x.fillRect(hx,hy,hs,hs);x.strokeStyle=T.border;x.strokeRect(hx,hy,hs,hs);
    if(head){try{x.save();x.beginPath();x.rect(hx+1,hy+1,hs-2,hs-2);x.clip();const s=Math.max((hs-2)/head.width,(hs-2)/head.height);x.drawImage(head,hx+1+((hs-2)-head.width*s)/2,hy+1+((hs-2)-head.height*s)/2,head.width*s,head.height*s);x.restore();}catch(e){}}
    cardBadge(x,logo,spot.player.team,hx+hs-4,hy+hs-4,48);
    cardStamp(x,hx+hs+100,hy+hs/2,spot.rating,"MATCH RATING",136);
    // XI list, two columns
    const lx=hx+hs+200,top=b.y-4,rowH=30;x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,"THE XI \u00b7 BEST MATCH RATINGS",lx,top,1.6);
    xi.slice(0,11).forEach((s,i)=>{const col=i<6?0:1;const row=i<6?i:i-6;const px=lx+col*330,py=top+16+row*rowH;x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;x.fillText(s.slot,px,py+14);x.fillStyle=T.ink;x.font="600 15px "+F_SERIF;x.fillText(cardTrunc(x,s.l.player.name,190),px+40,py+15);x.fillStyle=T.textDim;x.font="400 10px "+F_MONO;x.fillText(s.l.player.team,px+236,py+14);x.fillStyle=gc(s.l.rating);x.font="700 15px "+F_DISPLAY;x.textAlign="right";x.fillText(String(s.l.rating),px+310,py+15);x.textAlign="left";});
    x.fillStyle=T.textDim;x.font="italic 12px "+F_SERIF;x.fillText("Match ratings are a box-score production proxy for one game, not the season Index grade.",48,CARD_H-60);
  });
}

// 3) POWER RANKINGS — top 10
export async function cardPowerRankings({rows,moveLabel,logos}){
  const imgs=await Promise.all(rows.slice(0,10).map(t=>cardLoadImg(logos[t.abbr])));
  await makeCard(cardFile("power-rankings"),(x)=>{
    const b=cardFrame(x,{kicker:"Power Rankings \u00b7 Top 10",title:"MLS Power Rankings",sub:"50% points \u00b7 30% team grade \u00b7 20% last-five form \u00b7 "+moveLabel});
    const rowH=44,top=b.y-6;
    rows.slice(0,10).forEach((t,i)=>{const col=i<5?0:1,row=i<5?i:i-5;const px=48+col*560,py=top+row*rowH;
      x.fillStyle=T.card;x.fillRect(px,py,540,rowH-6);x.strokeStyle=T.borderLt;x.strokeRect(px,py,540,rowH-6);
      x.fillStyle=i<3?T.accent:T.textMute;x.font="700 20px "+F_DISPLAY;x.fillText(String(t.powerRank||i+1),px+12,py+27);
      cardBadge(x,imgs[i],t.abbr,px+62,py+(rowH-6)/2,30);
      x.fillStyle=T.ink;x.font="600 16px "+F_SERIF;x.fillText(cardTrunc(x,t.name,220),px+86,py+25);
      const mv=t.movement!=null?t.movement:t.vsTable;const mtxt=mv>0?"\u25b2"+mv:mv<0?"\u25bc"+Math.abs(mv):"\u2014";x.fillStyle=mv>0?T.green:mv<0?T.red:T.textMute;x.font="700 13px "+F_MONO;x.fillText(mtxt,px+320,py+25);
      x.fillStyle=T.textDim;x.font="400 11px "+F_MONO;x.fillText((t.pts||0)+" pts",px+372,py+25);
      x.fillStyle=gc(t.overall);x.font="700 16px "+F_DISPLAY;x.textAlign="right";x.fillText(String(Math.round(t.overall)),px+500,py+26);x.fillStyle=T.textMute;x.font="400 9px "+F_MONO;x.fillText("GRD",px+526,py+25);x.textAlign="left";
    });
  });
}

// 4) MOVERS — heating / cooling
export async function cardMovers({heating,cooling}){
  await makeCard(cardFile("biggest-movers"),(x)=>{
    const b=cardFrame(x,{kicker:"Form \u00b7 Last five vs season",title:"Biggest Movers",sub:"Match-rating average over the last five games against the full-season average"});
    const draw=(list,px,label,col)=>{x.fillStyle=col;x.fillRect(px,b.y-10,4,18);x.fillStyle=T.ink;x.font="700 18px "+F_DISPLAY;x.fillText(label,px+14,b.y+5);
      list.slice(0,6).forEach((p,i)=>{const py=b.y+22+i*40;x.fillStyle=T.card;x.fillRect(px,py,520,34);x.strokeStyle=T.borderLt;x.strokeRect(px,py,520,34);
        x.fillStyle=T.textMute;x.font="700 12px "+F_MONO;x.fillText(String(i+1),px+12,py+22);
        x.fillStyle=T.ink;x.font="600 15px "+F_SERIF;x.fillText(cardTrunc(x,p.name,220),px+36,py+22);
        x.fillStyle=T.textDim;x.font="400 10px "+F_MONO;x.fillText((p.position||"").slice(0,3).toUpperCase()+" \u00b7 "+p.team,px+266,py+21);
        x.fillStyle=T.textDim;x.font="400 11px "+F_MONO;x.fillText(p.seasonAvg+" \u2192 "+p.formAvg,px+360,py+22);
        x.fillStyle=p.delta>0?T.green:T.red;x.font="700 15px "+F_DISPLAY;x.textAnchor="end";x.textAlign="right";x.fillText((p.delta>0?"+":"")+p.delta,px+506,py+23);x.textAlign="left";});};
    draw(heating,48,"Heating Up",T.green);draw(cooling,48+552,"Cooling Down",T.red);
  });
}

// 5) MATCH PREVIEW — measured only (grade, points, form); no projection
export async function cardMatchPreview({m,teams,logos,matches}){
  const H=teams.find(t=>t.abbr===m.home)||{abbr:m.home,name:m.home},A=teams.find(t=>t.abbr===m.away)||{abbr:m.away,name:m.away};
  const[hl,al]=await Promise.all([cardLoadImg(logos[m.home]),cardLoadImg(logos[m.away])]);
  const last5=(abbr)=>matches.filter(g=>g.completed&&(g.home===abbr||g.away===abbr)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5).reverse().map(g=>cardResult(g,abbr));
  await makeCard(cardFile(H.abbr+"-v-"+A.abbr+"-preview"),(x)=>{
    const when=fmtETTime(m.date);
    const b=cardFrame(x,{kicker:"Match Preview \u00b7 "+when,title:H.name+" v "+A.name,sub:"Team grade, points and last-five form from the Index record \u00b7 no projections"});
    const side=(t,logo,px,align)=>{const cx=align==="left"?px+70:px+CARD_W/2-118;cardBadge(x,logo,t.abbr,cx,b.y+60,120);
      const tx=align==="left"?px+150:px+40;x.fillStyle=T.ink;x.font="700 26px "+F_DISPLAY;x.fillText(cardTrunc(x,t.name,330),tx,b.y+38);
      x.fillStyle=T.textDim;x.font="400 12px "+F_MONO;x.fillText((t.conf||"")+(t.pts!=null?" \u00b7 "+t.pts+" pts":"")+(t.w!=null?" \u00b7 "+t.w+"-"+t.dr+"-"+t.l:""),tx,b.y+62);
      const res=last5(t.abbr);x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,res.length?"LAST "+res.length+(res.length===1?" RESULT":" RESULTS"):"NO RECENT RESULTS ON RECORD",tx,b.y+96,1.4);drawFormPills(x,tx,b.y+104,res,22);
      if(t.overall!=null)cardStamp(x,tx+300,b.y+80,t.overall,"TEAM GRADE",92);};
    side(H,hl,48,"left");side(A,al,48+CARD_W/2-48,"left");
    x.fillStyle=T.ink;x.font="900 40px "+F_DISPLAY;x.textAlign="center";x.fillText("v",CARD_W/2,b.y+80);x.textAlign="left";
    // edge line (measured)
    const dg=(H.overall!=null&&A.overall!=null)?Math.round(H.overall-A.overall):null;
    const ey=b.y+200;x.fillStyle=T.ink;x.fillRect(48,ey-22,CARD_W-96,1);
    x.fillStyle=T.textMute;x.font="700 10px "+F_MONO;cardSpaced(x,"MEASURED EDGE",48,ey,1.6);
    x.fillStyle=T.ink;x.font="600 16px "+F_SERIF;const edge=dg==null?"Team grades unavailable":dg===0?"Even on team grade":(dg>0?H.name:A.name)+" by "+Math.abs(dg)+" on team grade";x.fillText(edge+(H.pts!=null&&A.pts!=null?" \u00b7 "+(H.pts===A.pts?"level":( (H.pts>A.pts?H.abbr:A.abbr)+" +"+Math.abs(H.pts-A.pts)))+" on points":""),48,ey+26);
  });
}

