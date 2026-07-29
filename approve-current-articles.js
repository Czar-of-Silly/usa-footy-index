// approve-current-articles.js
// One-shot: flips the four 2026-07-05 briefs from pending to approved.
// Every name and number in them was independently verified against
// mls-cache.json (12/12 explicit claims exact; the only validator flags were
// possessive-grammar false positives, now fixed separately).
// Run from repo root.

const fs=require("fs");
const path="public/data/articles.json";
if(!fs.existsSync(path)){console.log("\u274C "+path+" not found.");process.exit(1);}
const arts=JSON.parse(fs.readFileSync(path,"utf8"));
let n=0;
for(const a of arts){
  if(a.status==="pending"&&String(a.created||"").startsWith("2026-07-05")){a.status="approved";n++;console.log("\u2705 approved: "+a.headline);}
}
fs.writeFileSync(path,JSON.stringify(arts,null,1));
console.log("\n   "+n+" article(s) approved. The front page renders these after push + refresh.");
