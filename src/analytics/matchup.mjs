// analytics/matchup.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// ─── MATCHUP PREVIEW (Phase 4c) ───────────────────────────────────────
export const posGroupOf=(p)=>{const P=String(p&&p.position||"").toLowerCase();return /gk|goal|keep/.test(P)?"GK":/def|back/.test(P)?"DEF":/mid/.test(P)?"MID":"FWD";};

// The Index Lean — lifted verbatim from MatchupView (Phase 5.3). A projection, not a measurement.
export function indexLean(gd,pg){let proj=null;if(gd!=null||pg!=null){const z=0.05*(gd||0)+0.8*(pg||0)+0.30;const pHomeWin=1/(1+Math.exp(-z));const draw=0.26;proj={home:Math.round(pHomeWin*(1-draw)*100),draw:Math.round(draw*100),away:0};proj.away=100-proj.home-proj.draw;}return proj;}

