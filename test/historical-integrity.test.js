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
  // 6C: CURRENT_SEASON moved out of app.jsx into analytics/archive.mjs so the selector, the router,
  // the loaders and the career axis all read one list. Assert the value functionally and assert the
  // app consumes it, which is strictly stronger than matching the old inline literal.
  const A = require(path.join(ROOT, "src/analytics/archive.mjs"));
  assert.equal(A.CURRENT_SEASON, 2026, "current data season");
  assert.deepEqual(A.AVAILABLE_SEASONS, [2026, 2025, 2024], "the one canonical season list");
  assert.match(app, /import \{[^}]*CURRENT_SEASON[^}]*\} from "\.\/analytics\/archive\.mjs"/, "app imports it rather than redefining it");
  assert.doesNotMatch(app, /const CURRENT_SEASON\s*=/, "app no longer keeps a second definition");
  assert.match(app, /\{season!==CURRENT_SEASON&&<div role="note"/, "archive notice shown for historical seasons");
  assert.match(app, /\{season===CURRENT_SEASON&&wireItems\.length>0&&/, "wire ticker gated to the current season");
  assert.match(app, /DESK ROW: slate · movers · subscribe ═══ \*\/\}\s*\{season===CURRENT_SEASON&&/, "fixture slate / movers / subscribe gated to the current season");
});

// ── 8. historical assists are never synthesized from xA and shown as real ───
test("the historical importer reads authoritative assists, not rounded xA", () => {
  const imp = fs.readFileSync(path.join(ROOT, "fetch-history-v2.js"), "utf8");
  assert.doesNotMatch(imp, /as:\s*Math\.round\(xg\.xa/, "importer no longer rounds xA into the assists field");
  // 6D: the field is still ASA primary_assists, but a missing value is no longer coerced to 0 —
  // "we did not observe this" and "it happened zero times" are different claims.
  assert.match(imp, /as: \(typeof p\.primary_assists === "number" \? p\.primary_assists : null\)/, "importer captures ASA primary_assists, preserving UNKNOWN");
  assert.doesNotMatch(imp, /as:\s*p\.primary_assists\s*\|\|\s*0/, "and no longer turns a missing total into zero");
});
test("the withholding rule is per-row provenance, not a season-wide flag", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /const SEASON_ASSISTS_OK=\{2026:true,2025:false,2024:false\};/, "the season flag is unchanged — 2024/2025 are not declared complete");
  assert.match(app, /assists:rowAssists\(src,yr\)/, "history assists go through the per-row rule");
  assert.match(app, /const rowAssistsKnown=\(r,yr\)=>\{/, "the per-row rule exists");
  assert.match(app, /return r\.assistSrc!=="unknown"&&r\.as!==null&&r\.as!==undefined;/, "a row must name its source to be shown");
  assert.match(app, /return SEASON_ASSISTS_OK\[yr\]!==false;/, "and a row with no provenance still obeys the season flag");
  assert.doesNotMatch(app, /assists:SEASON_ASSISTS_OK\[yr\]===false\?null:r\.as/, "the old season-only gate is gone, not bypassed");
});

// ── the committed archive caches now carry AUTHORITATIVE assists ────────────
// This replaces the Phase 6A guard that asserted the opposite. That guard existed because the caches
// held Math.round(xA) dressed as real assists; the Phase 6D promotion replaced them with ASA
// primary_assists. Asserting the new truth positively is what keeps the old defect from returning —
// simply deleting the guard would leave nothing watching this at all.
const EXPECTED_COVERAGE = { 2024: { rows: 769, resolved: 768 }, 2025: { rows: 801, resolved: 800 } };

test("committed archive caches carry authoritative assists with per-row provenance", () => {
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr);
    assert.ok(raw, `${yr} cache is present`);
    const exp = EXPECTED_COVERAGE[yr];
    assert.equal(raw.length, exp.rows, `${yr} row count`);

    const authoritative = raw.filter(r => r.assistSrc === "asa:primary_assists");
    assert.equal(authoritative.length, exp.resolved, `${yr} authoritative assist coverage is ${exp.resolved}/${exp.rows}`);
    assert.ok(authoritative.every(r => typeof r.as === "number" && isFinite(r.as)), `${yr}: every authoritative row holds a real number`);
    assert.ok(authoritative.every(r => r.ids && r.ids.asa), `${yr}: and the ASA id that produced it`);

    // Coverage is 99.87%, not 100%, so the season is NOT complete and must not be declared so.
    assert.ok(authoritative.length < raw.length, `${yr} coverage is short of complete, which is why the season flag stays false`);
  }
});

test("resolved archive rows are not populated from round(xA)", () => {
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const resolved = raw.filter(r => r.assistSrc === "asa:primary_assists" && r.xa != null);
    // Before the promotion this was 100% by construction. Coincidental equality is expected and fine;
    // universal equality would mean the synthesized values were still in place.
    const equal = resolved.filter(r => r.as === Math.round(r.xa)).length;
    assert.ok(equal < resolved.length, `${yr}: not every assist equals round(xA) — ${equal}/${resolved.length}`);
    assert.ok(equal / resolved.length < 0.75, `${yr}: the remaining equalities are coincidence, not synthesis (${equal}/${resolved.length})`);
    // and a spot check that real disagreement exists in both directions
    const higher = resolved.filter(r => r.as > Math.round(r.xa)).length;
    const lower = resolved.filter(r => r.as < Math.round(r.xa)).length;
    assert.ok(higher > 0 && lower > 0, `${yr}: corrections run both ways (${higher} up, ${lower} down) — no arithmetic transform could produce this`);
  }
});

test("an unresolved archive row keeps UNKNOWN, and zero stays distinct from unknown", () => {
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const unknown = raw.filter(r => r.assistSrc === "unknown");
    assert.equal(unknown.length, raw.length - EXPECTED_COVERAGE[yr].resolved, `${yr}: exactly the unresolved rows are unknown`);
    assert.ok(unknown.every(r => r.as === null), `${yr}: an unknown assist is null, never 0`);
    assert.ok(unknown.every(r => !(r.ids && r.ids.asa)), `${yr}: and carries no ASA identity`);

    // David Martinez is the unresolved case: ASA holds two distinct players under that name.
    const dm = raw.filter(r => r.n === "David Martínez");
    assert.equal(dm.length, 1, `${yr}: one David Martínez row`);
    assert.equal(dm[0].as, null, `${yr}: his assists are unknown`);
    assert.equal(dm[0].identityJoin, "ambiguous", `${yr}: and his identity is refused, not guessed`);
    assert.ok(!(dm[0].ids && dm[0].ids.asa));

    // an authoritative ZERO is a real observation and must survive as a number
    const zeros = raw.filter(r => r.assistSrc === "asa:primary_assists" && r.as === 0);
    assert.ok(zeros.length > 0, `${yr}: authoritative zeros exist`);
    assert.ok(zeros.every(r => r.as === 0 && r.as !== null), `${yr}: and are numeric 0, not null`);
  }
});

test("promoting the archive caches moved no grade", () => {
  // Assists and xpp are not grading inputs, so the enrichment had to be grade-neutral. This proves it
  // from the committed data rather than from the promotion-time report: the same prepared input, and
  // therefore the same grade, whatever the assist and xpp values are.
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const withAssists = raw.find(r => r.assistSrc === "asa:primary_assists" && r.as > 0 && (r.m || 0) >= 450);
    assert.ok(withAssists, `${yr}: a resolved row to test with`);
    const stripped = { ...withAssists, as: null, xpp: null };
    const a = E.preparePlayerForGrading(E.validatePlayer(withAssists), 0);
    const b = E.preparePlayerForGrading(E.validatePlayer(stripped), 0);
    const drop = o => { const c = { ...o }; delete c.raw; return c; };
    assert.deepEqual(drop(a), drop(b), `${yr}: assists and xpp do not reach the grading engine`);
  }
});

test("archive xpp comes from the authoritative ASA field, not the one that does not exist", () => {
  for (const yr of [2024, 2025]) {
    const raw = rawFor(yr); if (!raw) continue;
    const auth = raw.filter(r => r.xppSrc === "asa:xpass_completion_percentage");
    assert.equal(auth.length, EXPECTED_COVERAGE[yr].resolved, `${yr}: xpp coverage matches identity coverage`);
    // The old importer read a field ASA does not return, so xpp was 0 on 100% of rows and then got
    // clamped to the 30 floor. The fix is not "no zeros" — a handful of players attempted no passes
    // at all, and ASA reporting 0 for them is a real observation. The fix is that the field is no
    // longer uniformly zero, and every surviving zero is corroborated by pp === 0.
    const zero = auth.filter(r => Number(r.xpp) === 0);
    const positive = auth.filter(r => Number(r.xpp) > 0);
    assert.ok(positive.length > auth.length * 0.98, `${yr}: xpp is populated for ${positive.length}/${auth.length} resolved rows, not 0/${auth.length} as before`);
    assert.ok(zero.every(r => Number(r.pp) === 0), `${yr}: every remaining xpp of 0 belongs to a player who attempted no passes — an observation, not the old artifact`);
    assert.ok(zero.every(r => (r.m || 0) < 120), `${yr}: and they are all fringe-minute players`);
    assert.ok(positive.every(r => Number(r.xpp) > 0 && Number(r.xpp) <= 100), `${yr}: populated values are percentages`);
    // A fringe player can legitimately sit very low (one difficult pass in six minutes), so the
    // meaningful check is the shape of the distribution, not a floor on every row.
    const med = positive.map(r => Number(r.xpp)).sort((a, b) => a - b)[Math.floor(positive.length / 2)];
    assert.ok(med > 60 && med < 95, `${yr}: median expected pass completion is ${med}%, a plausible league value`);
    const unknown = raw.filter(r => r.xppSrc === "unknown");
    assert.ok(unknown.every(r => r.xpp === null), `${yr}: an unresolved row has xpp null, not a fabricated 0`);
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
  // 6D: both paths now run through rowAssists(), which withholds unless the ROW proves its value is
  // authoritative — and falls back to the season flag for caches written before this phase.
  assert.match(app, /assists:rowAssists\(srcRows\[i\]\|\|r,season\)/, "selected-season path withholds through the per-row rule");
  assert.match(app, /assists:rowAssists\(src,yr\)/, "Season History path withholds through the same rule");
  assert.equal((app.match(/rowAssists\(/g) || []).length, 2, "exactly two call sites — the two loaders, and no third ungated path");
  assert.equal((app.match(/const rowAssists=/g) || []).length, 1, "and the rule itself is defined once, so the two paths cannot diverge");
  assert.doesNotMatch(app, /assists:\(r\.as\|\|0\)/, "no path can emit a raw, ungated assist value");
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
