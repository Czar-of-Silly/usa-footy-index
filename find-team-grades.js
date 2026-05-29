// find-team-grades.js — locate team grade calculation in the source
const fs = require("fs");
const src = fs.readFileSync("public/index.dev.html", "utf8");
const lines = src.split(/\r?\n/);

console.log("─── lines mentioning 'team' grade/rating computation ───");
lines.forEach((l, i) => {
  if (/teamGrade|teamRating|teamScore|computeTeam|teamOverall/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0,180)}`);
  }
});

console.log("\n─── lines using grades within team aggregation ───");
lines.forEach((l, i) => {
  if (/\.team|byTeam/.test(l) && /(grade|overall|rating)/i.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0,180)}`);
  }
});

console.log("\n─── search for 'TEAMS' tab content ───");
// The site has a TEAMS tab. Find its code path.
let inTab = false;
lines.forEach((l, i) => {
  if (/tab===['"]?teams/i.test(l) || /case ['"]teams/i.test(l) || /TeamsTab|TeamsView|TeamsPage/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0,180)}`);
  }
});

console.log("\n─── any reduce/sum over players for team metrics ───");
lines.forEach((l, i) => {
  if (/teams\[.*\]\s*\+=|\.reduce.*team|byTeam\s*=/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0,180)}`);
  }
});
