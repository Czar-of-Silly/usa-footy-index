// dump-grading.js — print lines 137 to 260 of index.dev.html verbatim
const fs = require("fs");
const lines = fs.readFileSync("public/index.dev.html","utf8").split(/\r?\n/);
for (let i = 136; i < 260 && i < lines.length; i++) {
  console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
}
