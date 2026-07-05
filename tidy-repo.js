// tidy-repo.js
// Conservative repo cleanup: MOVES clutter into archive folders, deletes
// nothing. Also teaches .gitignore to ignore future one-off debris.
//
//   scripts/archive/   <- one-off patch/fix/test scripts (they already ran;
//                         keeping them findable but out of the root)
//   attic/             <- stray file copies, screenshots, scratch notes
//
// Deliberately NOT touched: weekly-newsletter.js + its workflow (your
// in-progress work), sofa-proxy/ (looks like a real sub-project -- say the
// word if it's dead and I'll archive it too), and everything the site needs.
//
// Run from repo root: node tidy-repo.js
// Then review with `git status`, and commit when it looks right.

const fs=require("fs"),path=require("path");
if(!fs.existsSync("public/index.html")){console.log("\u274C Run from repo root.");process.exit(1);}

const moves={
  "scripts/archive":[
    "apply-usfi-update.js","fix-headshots.js","test-apifootball.js",
    "test-sofa-via-scraperapi.js","sofa-proxy-worker.js",
    "check-blocks.js","check-data.js","check-sofa.js","detect-name-mismatches.js",
    "dump-grading.js"
  ],
  "attic":[
    "Untitled.txt","2026-06-22 22_54_59-Greenshot.png",
    "public/index_OLD.html","public/index_dev.html",
    "fetch-data.js.bak","public/index.html.bak",
    "et --hard 0e3ff88","et --hard last-good-hash"
  ]
};
let moved=0,skipped=0;
for(const[dir,files]of Object.entries(moves)){
  for(const f of files){
    if(!fs.existsSync(f)){skipped++;continue;}
    fs.mkdirSync(dir,{recursive:true});
    const dest=path.join(dir,path.basename(f));
    fs.renameSync(f,dest);
    console.log("\u{1F4E6} "+f+" -> "+dest);moved++;
  }
}

// .gitignore additions so future debris stays out of git
const IG=["","# one-off debris (added by tidy-repo)","attic/","*.bak","*.png","!public/**/*.png","Untitled*.txt"].join("\n");
let gi=fs.existsSync(".gitignore")?fs.readFileSync(".gitignore","utf8"):"";
if(!gi.includes("tidy-repo")){fs.appendFileSync(".gitignore",IG+"\n");console.log("\u2705 .gitignore updated");}
else console.log("\u2139\uFE0F  .gitignore already updated");

console.log("\n   "+moved+" item(s) moved, "+skipped+" not present (already clean).");
console.log("\n  Review, then commit:");
console.log("    git status");
console.log("    git add -A");
console.log('    git commit -m "Tidy repo: archive one-off scripts and scratch files"');
console.log("    git pull origin main --no-rebase");
console.log("    git push origin main");
console.log("\n  Note: the two weird 'et --hard ...' files are shrapnel from a git");
console.log("  command that got mangled once (`git reset --hard` missing letters).");
