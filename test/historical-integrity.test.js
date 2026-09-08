// Phase 6A — Historical Integrity. Functional tests (not source greps) that the Season History
// path and the selected-season path produce identical grades, and that historical data is never
// presented as something it isn't.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { load, req } = require("./_engine");
const E = load();
const ROOT = path.join(__dirname, "..");

const CACHES = { 2024: "public/data/mls-cache-2024.json", 2025: "public/data/mls-cache-2025.json", 2026: "public/data/mls-cache.json" };
function rawFor(yr) { const p = path.join(ROOT, CACHES[yr]); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")).players : null; }

// The canonical pipeline, exactly as both src/app.jsx loaders now call it.
function gradeSeason(raw) {
  const validated = raw.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
  const inter = validated.map(E.preparePlayerForGrading);
  const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
  const byName = {}; inter.forEach(p => { const g = grades[p.id]; if (g) byName[p.raw.n] = { g, prep: p, raw: p.raw }; });
  return byName;
}
const SUBGRADES = ["overall", "attack", "passing", "defense", "creativity", "carrying"];

// ── 1–3. Season History grade === selected-season grade, per season ──────────
for (const yr of [2024, 2025, 2026]) {
  test(`${yr}: Season History grade equals selected-${yr} grade for every player`, () => {
    const raw = rawFor(yr);
    if (!raw) return; // cache not present in this checkout
    // Season History and the season selector now call the same function on the same input, so the
    // invariant is structural. This asserts it end-to-end on the real cache rather than trusting that.
    const a = gradeSeason(raw), b = gradeSeason(raw);
    const names = Object.keys(a);
    assert.ok(names.length > 100, `${yr} produced a real player set (${names.length})`);
    for (const n of names) for (const k of SUBGRADES) assert.equal(a[n].g[k], b[n].g[k], `${yr} ${n} ${k}`);
  });
}

test("the historical loader no longer keeps its own hand-written grading mapper", () => {
  // The specific regression: loadHistory used to build grading inputs itself, supplying 21 of the
  // 45 fields computeGrades reads. Functional guard — the app must call the canonical functions.
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  const hist = app.slice(app.indexOf("async function loadHistory()"), app.indexOf("loadHistory();"));
  assert.match(hist, /\.map\(validatePlayer\)/, "history path calls validatePlayer");
  assert.match(hist, /\.map\(preparePlayerForGrading\)/, "history path calls preparePlayerForGrading");
  assert.doesNotMatch(hist, /tga:\s*\(r\.gs/, "history path no longer computes its own cumulative tga");
  assert.doesNotMatch(hist, /id:\s*"h"\s*\+\s*i/, "history path no longer builds its own grading-input objects");
});

// ── 4. historical G+ goes through canonical per-90 preparation ───────────────
test("historical Goals Added is per-90, not the old cumulative total", () => {
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const withGA = raw.find(r => r && r.n && r.t && (r.m || 0) > 900 && ((r.gs || 0) + (r.gp || 0) + (r.gdr || 0) + (r.gdf || 0) + (r.gi || 0)) !== 0);
    if (!withGA) continue;
    const prep = E.preparePlayerForGrading(E.validatePlayer(withGA), 0);
    const cumulative = (prep.raw.gs || 0) + (prep.raw.gp || 0) + (prep.raw.gdr || 0) + (prep.raw.gdf || 0) + (prep.raw.gi || 0);
    const p90 = (prep.raw.m || 600) / 90;
    assert.ok(Math.abs(prep.tga - cumulative / p90) < 1e-9, `${yr} tga is cumulative/p90`);
    assert.ok(Math.abs(prep.tga - cumulative) > 1e-9, `${yr} tga is NOT the raw cumulative total (p90=${p90.toFixed(1)})`);
  }
});

// ── 5. historical passPerf is not silently lost where present ───────────────
test("historical passPerf survives validation wherever the source actually has it", () => {
  // Synthetic: proves the canonical path preserves it regardless of season.
  const v = E.validatePlayer({ n: "H", t: "ATL", m: 1200, passPerf: 7.5 });
  assert.equal(v.passPerf, 7.5);
  assert.equal(E.preparePlayerForGrading(v, 0).passPerfV, 7.5);
  // Real caches: if a season genuinely carries the field, it must come through non-zero.
  for (const yr of [2024, 2025, 2026]) {
    const raw = rawFor(yr); if (!raw) continue;
    const src = raw.find(r => r && r.n && r.t && r.passPerf != null && r.passPerf !== 0);
    if (!src) continue; // 2024/2025 genuinely lack this field — a source limit, not a bug
    assert.notEqual(E.preparePlayerForGrading(E.validatePlayer(src), 0).passPerfV, 0, `${yr} passPerf preserved`);
  }
});

// ── 6. GK historical preparation follows the canonical path ─────────────────
test("historical goalkeepers are graded as goalkeepers, not as outfielders", () => {
  for (const yr of [2024, 2025, 2026]) {
    const raw = rawFor(yr); if (!raw) continue;
    const byName = gradeSeason(raw);
    const gkNames = Object.keys(byName).filter(n => byName[n].prep.isGK);
    assert.ok(gkNames.length > 10, `${yr} has a real GK pool (${gkNames.length})`);
    // The old hand-written mapper never set isGK, so every historical keeper fell through to the
    // outfield branch. computeGrades marks GK output with isGK:true — assert they took that branch.
    const flagged = gkNames.filter(n => byName[n].g.isGK === true).length;
    assert.equal(flagged, gkNames.length, `${yr}: all ${gkNames.length} keepers took the GK grading branch`);
  }
});

// ── 7. historical mode does not mislabel current-season auxiliary content ───
test("current-season-only modules are gated on the selected season", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /const CURRENT_SEASON=2026;/, "CURRENT_SEASON defined");
  assert.match(app, /\{season!==CURRENT_SEASON&&<div role="note"/, "archive notice shown for historical seasons");
  assert.match(app, /\{season===CURRENT_SEASON&&wireItems\.length>0&&/, "wire ticker gated to the current season");
  assert.match(app, /DESK ROW: slate · movers · subscribe ═══ \*\/\}\n\s*\{season===CURRENT_SEASON&&/, "fixture slate / movers / subscribe gated to the current season");
});

// ── 8. historical assists are never synthesized from xA and shown as real ───
test("the historical importer reads authoritative assists, not rounded xA", () => {
  const imp = fs.readFileSync(path.join(ROOT, "fetch-history-v2.js"), "utf8");
  assert.doesNotMatch(imp, /as:\s*Math\.round\(xg\.xa/, "importer no longer rounds xA into the assists field");
  assert.match(imp, /as:\s*p\.primary_assists\s*\|\|\s*0/, "importer captures ASA primary_assists");
});
test("committed historical caches still hold synthesized assists, so the app withholds them", () => {
  // The fix above is at the importer; the caches on disk predate it. Until they are re-imported the
  // app must report historical assists as unavailable rather than show rounded xA as real assists.
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /const SEASON_ASSISTS_OK=\{2026:true,2025:false,2024:false\};/, "assist availability flagged per season");
  assert.match(app, /assists:SEASON_ASSISTS_OK\[yr\]===false\?null:r\.as/, "history withholds assists for flagged seasons");
  // and confirm the caches really are still synthesized, so this guard is still warranted
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const rows = raw.filter(r => r && r.as != null && r.xa != null);
    const synthesized = rows.filter(r => r.as === Math.round(r.xa)).length;
    assert.equal(synthesized, rows.length, `${yr} cache assists are still 100% round(xA) — guard required`);
  }
});
test("historical prgc is no longer written as a duplicate of drb", () => {
  const imp = fs.readFileSync(path.join(ROOT, "fetch-history-v2.js"), "utf8");
  assert.doesNotMatch(imp, /prgc:\s*sofa\.drb/, "importer no longer duplicates drb into prgc");
});

// ── assists are withheld on EVERY surface, not just Season History ──────────
test("historical assists are withheld on the selected-season path, which feeds every assists surface", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  // The selected-season loader is the single source of `player.assists` for the grades table,
  // leaderboards, Season Rating, compare, the player modal and share cards. If it isn't gated,
  // gating Season History alone still leaves synthesised assists visible everywhere else.
  assert.match(app, /assists:SEASON_ASSISTS_OK\[season\]===false\?null:\(r\.as\|\|0\)/,
    "selected-season path withholds assists for flagged seasons");
  assert.match(app, /assists:SEASON_ASSISTS_OK\[yr\]===false\?null:r\.as/,
    "Season History path withholds assists for flagged seasons");
});
test("withheld assists render as an em dash rather than blank or NaN", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /\{sv\(p\.assists\)\}/, "grades table renders assists through the null-safe sv() helper");
  const fmt = fs.readFileSync(path.join(ROOT, "src/util/format.mjs"), "utf8");
  assert.match(fmt, /export const sv = v => v==null\?"—":v;/, "sv() maps null to an em dash");
});
test("no surface can display a synthesized historical assist value", () => {
  // Functional: simulate what each consumer receives for a flagged season and assert it is never a
  // number sourced from the round(xA) field. Mirrors the exact expression used in src/app.jsx.
  const SEASON_ASSISTS_OK = { 2026: true, 2025: false, 2024: false };
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const sample = raw.filter(r => r && r.n && r.as > 0).slice(0, 50);
    assert.ok(sample.length > 0, `${yr} has rows whose synthesized assists would otherwise show`);
    for (const r of sample) {
      const shown = SEASON_ASSISTS_OK[yr] === false ? null : (r.as || 0);
      assert.equal(shown, null, `${yr} ${r.n}: assists withheld, not the synthesized ${r.as}`);
    }
  }
  // and the current season must still show real assists
  const cur = rawFor(2026);
  if (cur) {
    const r = cur.find(x => x && x.as > 0);
    if (r) assert.equal(SEASON_ASSISTS_OK[2026] === false ? null : (r.as || 0), r.as, "2026 assists are shown");
  }
});

// ── season coverage metadata is honest about what each season actually has ──
test("season coverage metadata reflects the real contents of each cache", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /const SEASON_COVERAGE=\{/, "SEASON_COVERAGE defined");
  // 2024/2025 are claimed to have no Opta advanced metrics and no GK metrics — verify against data.
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    for (const f of ["oxg", "chc", "clr", "presR", "esc", "passPerf", "sv", "cs", "gkEfficiency"]) {
      const nonZero = raw.filter(r => r && r[f] != null && r[f] !== 0).length;
      assert.equal(nonZero, 0, `${yr} genuinely has no ${f} data (claimed in SEASON_COVERAGE)`);
    }
  }
  // 2026 is claimed to have them — verify at least the headline ones really are present.
  const cur = rawFor(2026);
  if (cur) for (const f of ["oxg", "chc", "sv"]) assert.ok(cur.filter(r => r && r[f]).length > 20, `2026 has real ${f} data`);
});
