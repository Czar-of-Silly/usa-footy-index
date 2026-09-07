// Loads the canonical modules from src/ for tests (Phase 5.3). Synchronous via require(esm) on Node ≥ 22.12,
// with a text fallback so tests still run on older Node.
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const ROOT = path.join(__dirname, "..");
function req(rel) {
  try { return createRequire(__filename)(path.join(ROOT, rel)); }
  catch (e) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^import [^\n]*\n/gm, "").replace(/^export\s+/gm, "");
    const names = [...src.matchAll(/^(?:function|const|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    return new Function(src + "\nreturn {" + names.join(",") + "};")();
  }
}
function load() {
  const engine = req("src/grading/engine.mjs"), prep = req("src/grading/prepare-player.mjs"), form = req("src/analytics/form.mjs"), matchup = req("src/analytics/matchup.mjs"), power = req("src/analytics/power-rank.mjs"), routes = req("src/routing/routes.mjs");
  return { ...engine, ...prep, ...form, ...matchup, ...power, ...routes };
}
function extract(src, fn) { const i = src.indexOf("function " + fn + "("); if (i < 0) throw new Error(fn + " not found"); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); } } }
module.exports = { load, extract, req };
