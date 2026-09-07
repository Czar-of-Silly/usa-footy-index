// util/format.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// Display value: never render null/undefined/"null" — show an em dash instead
export function dv(v){return (v==null||v===""||v==="null"||v==="undefined"||(typeof v==="number"&&!Number.isFinite(v)))?"\u2014":v;}

// All user-facing dates render in US Eastern regardless of viewer/build timezone
export const ET="America/New_York";

export function fmtET(d,opts){try{const x=d instanceof Date?d:new Date(d);if(isNaN(x))return "";return x.toLocaleDateString("en-US",{timeZone:ET,...(opts||{month:"short",day:"numeric"})});}catch(e){return "";}}

export function fmtETTime(d){try{const x=new Date(d);if(isNaN(x))return "";return x.toLocaleString("en-US",{timeZone:ET,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET";}catch(e){return "";}}

// Pick the newest ranking snapshot that is at least 5 days older than the current data
export function pickWeekAgo(hist,generated){if(!Array.isArray(hist)||!hist.length)return null;const ref=generated?Date.parse(generated):Date.now();const cutoff=ref-5*864e5;const c=hist.filter(h=>h&&h.date&&Date.parse(h.date)<=cutoff).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));return c[0]||null;}

export function fv(e){if(!e)return"—";if(e>=1e6)return`$${(e/1e6).toFixed(1)}M`;if(e>=1e3)return`$${(e/1e3).toFixed(0)}K`;return`$${e}`;}

export const sv = v => v==null?"—":v;

// Heatmap cell background: value normalized 0-1, returns rgba background
export const hm=(val,max,inv)=>"transparent";

// ─── METHODOLOGY & DATA STATUS (Phase 4e) ─────────────────────────────
// Next scheduled data refresh: cron '0 11 * * 0,3,4,6' (Sun/Wed/Thu/Sat 11:00 UTC)
export function nextRefreshUTC(from){const days=[0,3,4,6];const d=new Date(from||Date.now());for(let i=0;i<8;i++){const c=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+i,11,0,0));if(c>d&&days.includes(c.getUTCDay()))return c;}return null;}

