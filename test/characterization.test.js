// Grading characterization: locks down shipped grading behaviour against a FROZEN, versioned
// data snapshot (test/fixtures/frozen-cache.json) — not the live-updating public/data/mls-cache.json.
// Because the input is frozen, this test never drifts on its own; it only changes when someone runs
// `npm run make-fixture` after a reviewed, intentional grading change. Any other difference here is
// a real regression. (Originally written for the Phase 5.3 source split; reused as the permanent
// grading-integrity guard per the Grading Integrity audit.)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { load } = require("./_engine");
const E = load();
const ROOT = path.join(__dirname, "..");
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/characterization.json"), "utf8"));
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/frozen-cache.json"), "utf8"));
const sameData = cache.generated === FX.generatedFrom;

// Both test/fixtures/frozen-cache.json and test/fixtures/characterization.json are versioned,
// committed fixtures now (neither is live-updating data). If they've drifted apart, that is a real
// regression — one was regenerated without the other, or a stray `npm run make-fixture` ran against
// a different cache. This must fail loudly, not be silently skipped.
if (!sameData) {
  throw new Error("test/fixtures/frozen-cache.json (" + cache.generated + ") and test/fixtures/characterization.json (generatedFrom: " + FX.generatedFrom + ") are desynchronized. Both are versioned fixtures and must match exactly. If this is an intentional, reviewed grading change, regenerate the fixture with `npm run make-fixture` and commit both files together. If it isn't intentional, one of the two files was changed by mistake — do not edit either by hand.");
}

// exactly the app's pipeline: validate → prepare → grade the >=1-minute pool
const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
const inter = validated.map(E.preparePlayerForGrading);
const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
const byKey = {}; inter.forEach(p => { byKey[p.raw.n + "|" + p.raw.t] = p; });

test("grades: every characterized player reproduces exactly", () => {
  for (const [label, fx] of Object.entries(FX.players)) {
    const p = byKey[fx.key]; assert.ok(p, label + " present: " + fx.key);
    const g = grades[p.id]; assert.ok(g, label + " graded");
    for (const k of ["overall", "attack", "passing", "defense", "creativity", "carrying"]) assert.equal(g[k], fx.grades[k], label + " (" + fx.key + ") " + k);
  }
});
test("grades: whole-pool distribution reproduces exactly", () => {
  const all = Object.values(grades).map(x => x.overall).sort((a, b) => a - b);
  const d = FX.distribution; const med = all[Math.floor(all.length / 2)];
  assert.equal(all.length, d.n); assert.equal(all[0], d.min); assert.equal(med, d.median); assert.equal(all[all.length - 1], d.max);
  assert.equal(Math.round(all.reduce((s, v) => s + v, 0) * 10) / 10, d.sumOverall, "sum of all Overall grades");
});
test("computeForm reproduces exactly", () => {
  for (const [k, fx] of Object.entries(FX.form)) { const p = byKey[fx.key]; const f = E.computeForm(p.raw.matchLog, p.raw.p); assert.deepEqual(f.ratings, fx.ratings, k + " ratings"); assert.equal(f.last5Avg, fx.last5Avg); assert.equal(f.seasonAvg, fx.seasonAvg); assert.equal(f.delta, fx.delta); assert.equal(f.basis, fx.basis); assert.deepEqual(f.res, fx.res); }
});
test("indexLean reproduces exactly", () => {
  for (const [k, v] of Object.entries(FX.indexLean)) { const [gd, pg] = k.split("|").map(x => x === "null" ? null : Number(x)); assert.deepEqual(E.indexLean(gd, pg), v, k); }
});
test("powerRankFor reproduces exactly", () => {
  const teams = cache.standings.map(s => { let ws = 0, wt = 0; for (const p of inter) { if (p.raw.t !== s.team || p.raw.departed) continue; const x = grades[p.id]; if (!x) continue; ws += x.overall * (p.raw.m || 0); wt += (p.raw.m || 0); } return { abbr: s.team, overall: wt > 0 ? ws / wt : 55 }; });
  for (const s of cache.standings) assert.equal(E.powerRankFor(s.team, teams, cache.standings, cache.matches), FX.powerRank[s.team], s.team);
});
test("route resolution reproduces exactly", () => {
  const r = FX.routes; for (const k of ["/table", "/data-status", "/about-the-index", "/valuations", "/matchups"]) assert.equal(E.PATH_TABS[k], r[k], k);
  assert.deepEqual(["Lionel Messi", "Émil Forsberg", "Heung-min Son", "Dániel Gazdag"].map(E.slugify), r.slugs);
});
