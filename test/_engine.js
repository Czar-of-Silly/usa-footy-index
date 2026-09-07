// Loads the browser engine (pure functions) out of public/index.html for tests.
// After the Phase 5 build step, these live in src/ — the extractor works on either.
const fs = require("fs");
const path = require("path");
function extract(src, fn) {
  const i = src.indexOf("function " + fn + "(");
  if (i < 0) throw new Error(fn + " not found");
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } }
}
function load() {
  const candidates = ["src/engine.js", "public/index.html"].map(p => path.join(__dirname, "..", p)).filter(fs.existsSync);
  const src = fs.readFileSync(candidates[0], "utf8");
  const names = ["pct", "normPos", "computeGrades", "slugify", "matchRating", "computeForm"];
  const code = names.map(n => extract(src, n)).join("\n") + "\n;({" + names.join(",") + "})";
  return eval(code);
}
module.exports = { load, extract };
