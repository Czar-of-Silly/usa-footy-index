// inspect-grading.js
// Look at the actual grading function in index.dev.html. Goal: find out
//   1) Where the Overall composite is computed for FW/MF/DF
//   2) Whether percentile pools are global or position-filtered
//   3) What the GK rank-rescale formula actually looks like

const fs = require("fs");
const src = fs.readFileSync("public/index.dev.html", "utf8");
const lines = src.split(/\r?\n/);

console.log("─── all 'const ... pool' or 'Pool' definitions in first 300 lines ───");
lines.forEach((l, i) => {
  if (i >= 300) return;
  if (/Pool/.test(l) || /^\s*const\s+\w+=.*\.map\(/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0, 180)}`);
  }
});

console.log("\n─── position branching / position checks ───");
lines.forEach((l, i) => {
  if (i >= 400) return;
  if (/p\.position/.test(l) || /isGK|isFw|isMf|isDf|isForward|isMidfielder|isDefender/.test(l) || /\bpos\s*===/.test(l) || /\bpos==\b/.test(l) || /position==/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0, 180)}`);
  }
});

console.log("\n─── final Overall composition (look for grade= or overall= assignments) ───");
lines.forEach((l, i) => {
  if (i >= 400) return;
  if (/^\s*(const|let|var)\s+(overall|grade|finalGrade|finalOverall|composite)\s*=/.test(l) ||
      /overall\s*:/.test(l) || /grade\s*:\s*(Math|Number|\w)/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0, 180)}`);
  }
});

console.log("\n─── rank-rescale / pow / rankPct usage ───");
lines.forEach((l, i) => {
  if (i >= 400) return;
  if (/rankPct|gkComposites|rescale|\.sort\(.*-/.test(l) || /pow\(/.test(l)) {
    console.log(`${(i+1).toString().padStart(4)}: ${l.trim().slice(0, 180)}`);
  }
});

console.log("\n─── lines 100-300 of computeGrades structure ───");
// Find function start
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (/computeGrades|function\s+grade|const\s+grade\s*=\s*\(/.test(lines[i])) { start = i; break; }
}
if (start >= 0) {
  console.log(`computeGrades starts at line ${start+1}`);
  console.log("--- first 40 lines of computeGrades ---");
  for (let i = start; i < Math.min(start+40, lines.length); i++) {
    console.log(`${(i+1).toString().padStart(4)}: ${lines[i].trim().slice(0,180)}`);
  }
}
