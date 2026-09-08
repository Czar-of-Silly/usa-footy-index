// Phase 6B.1 — Archive semantics. Behaviour tests for "unknown is not zero" everywhere a value
// derived from assists is produced: club totals, percentiles, Similar Players, Season Rating,
// Impact/90 and the award races. These call the real functions the app calls; the handful of source
// assertions at the end only prove the app is wired to them.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { load, req } = require("./_engine");
const E = load();
const A = req("src/analytics/archive.mjs");
const F = req("src/util/format.mjs");
const ROOT = path.join(__dirname, "..");

const CACHES = { 2024: "public/data/mls-cache-2024.json", 2025: "public/data/mls-cache-2025.json", 2026: "public/data/mls-cache.json" };
const SEASON_ASSISTS_OK = { 2026: true, 2025: false, 2024: false };
function rawFor(yr) { const p = path.join(ROOT, CACHES[yr]); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")).players : null; }

// The app's selected-season mapping, reduced to the fields these tests care about.
function appPlayers(yr) {
  const raw = rawFor(yr); if (!raw) return null;
  const validated = raw.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
  const inter = validated.map(E.preparePlayerForGrading);
  const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
  return inter.map(p => {
    const r = p.raw, g = grades[p.id] || { overall: 55, attack: 55, passing: 55, defense: 55, creativity: 55, carrying: 55 };
    return {
      id: p.id, name: r.n, team: r.t, position: r.p, mins: r.m, overall: g.overall,
      attack: g.attack, passing: g.passing, defense: g.defense, creativity: g.creativity, carrying: g.carrying,
      goals: r.g || 0,
      assists: SEASON_ASSISTS_OK[yr] === false ? null : (r.as || 0), // the exact expression in src/app.jsx
      tackles: r.tk ?? null, keyPasses: r.kp ?? null, interceptions: r.intc ?? null,
      shots: r.sh ?? null, shotsOnTarget: r.so ?? null,
      totalGA: p.tga.toFixed(2), marketValue: r.mv || 0,
    };
  });
}

// ── 5. a genuine zero stays a number ─────────────────────────────────────────
test("a genuine zero shots-on-target stays numeric 0 and is not rendered as unavailable", () => {
  const cur = appPlayers(2026);
  assert.ok(cur, "2026 cache present");
  const zeroSot = cur.filter(p => p.shotsOnTarget === 0);
  assert.ok(zeroSot.length > 20, `players with a real 0 SOT exist (${zeroSot.length})`);
  for (const p of zeroSot.slice(0, 50)) {
    assert.equal(p.shotsOnTarget, 0, p.name + " keeps numeric zero");
    assert.notEqual(p.shotsOnTarget, null, p.name + " is not null");
    assert.equal(F.sv(p.shotsOnTarget), 0, p.name + " renders as 0, not an em dash");
  }
  // and the unavailable case still renders the em dash, so the two are distinguishable
  assert.equal(F.sv(null), "—");
});

// ── 6. archive assists are unavailable, current-season assists are real ──────
test("archive assists are null (unknown); current-season assists are the real number", () => {
  for (const yr of [2024, 2025]) {
    const ps = appPlayers(yr); if (!ps) continue;
    assert.equal(ps.filter(p => p.assists !== null).length, 0, `${yr}: every assist value is unavailable`);
  }
  const cur = appPlayers(2026);
  if (cur) assert.ok(cur.some(p => typeof p.assists === "number" && p.assists > 0), "2026 assists are real numbers");
});

// ── 7. club totals do not invent a zero ──────────────────────────────────────
test("an archive club's Total Assists is unavailable, not a fabricated numeric zero", () => {
  const ps = appPlayers(2024);
  assert.ok(ps, "2024 cache present");
  const abbr = ps[0].team;
  const squad = ps.filter(p => p.team === abbr);
  assert.ok(squad.length > 5, "a real squad");
  assert.equal(A.sumStrict(squad, "assists"), null, "strict sum reports unavailable");
  // the shape of the bug this replaces: the generic helper turns the same squad into a hard 0
  assert.equal(A.sumLenient(squad, "assists"), 0, "the lenient helper would have published 0");
  // goals, which the archive genuinely carries, still total normally
  assert.equal(typeof A.sumStrict(squad, "goals"), "number");
  assert.equal(A.sumStrict(squad, "goals"), squad.reduce((s, p) => s + p.goals, 0));
});
test("a current-season club still gets a real assist total", () => {
  const ps = appPlayers(2026);
  assert.ok(ps, "2026 cache present");
  const abbr = ps[0].team;
  const squad = ps.filter(p => p.team === abbr);
  const total = A.sumStrict(squad, "assists");
  assert.equal(typeof total, "number");
  assert.equal(total, squad.reduce((s, p) => s + p.assists, 0));
});
test("an unavailable total never wins a sort in either direction", () => {
  const rows = [{ v: null }, { v: 5 }, { v: 12 }, { v: null }];
  const desc = [...rows].sort((a, b) => A.compareUnknownLast(a.v, b.v, -1)).map(r => r.v);
  const asc = [...rows].sort((a, b) => A.compareUnknownLast(a.v, b.v, 1)).map(r => r.v);
  assert.deepEqual(desc, [12, 5, null, null], "descending: known values first");
  assert.deepEqual(asc, [5, 12, null, null], "ascending: unknowns still last, never leading");
});

// ── 8. percentiles ───────────────────────────────────────────────────────────
test("an unavailable metric gets no percentile, and does not pollute anyone else's pool", () => {
  const players = [
    { id: "a", assists: 10, goals: 1 },
    { id: "b", assists: 5, goals: 2 },
    { id: "c", assists: null, goals: 3 },
  ];
  const pct = A.buildPercentiles(players, ["assists", "goals"]);
  assert.equal(pct.c.assists, null, "unavailable assists produce no percentile");
  assert.equal(pct.b.assists, 0, "pool is the two known values, so the lower of them is 0th");
  assert.equal(pct.a.assists, 100, "and the higher is 100th");
  assert.equal(pct.c.goals, 100, "a metric the player does have is unaffected");
});
test("every archive player's assist percentile is unavailable, not a zero percentile", () => {
  const ps = appPlayers(2024);
  assert.ok(ps, "2024 cache present");
  const pct = A.buildPercentiles(ps, ["overall", "assists", "goals"]);
  const sample = ps.slice(0, 200);
  for (const p of sample) {
    assert.equal(pct[p.id].assists, null, `${p.name}: assist percentile unavailable`);
    assert.equal(typeof pct[p.id].overall, "number", `${p.name}: real metrics still ranked`);
  }
});

// ── 9. Similar Players ───────────────────────────────────────────────────────
test("Similar Players drops a dimension neither player has instead of scoring it 0", () => {
  const keys = ["overall", "assists"];
  const src = { overall: 50, assists: null };
  const near = { overall: 50, assists: null };
  const far = { overall: 10, assists: null };
  const a = A.profileSimilarity(src, near, keys);
  const b = A.profileSimilarity(src, far, keys);
  assert.equal(a.used, 1, "only the available dimension was used");
  assert.deepEqual(a.missing, ["assists"], "and the excluded one is reported");
  assert.equal(a.similarity, 100, "identical on every available dimension");
  assert.ok(b.similarity < a.similarity, "the genuinely different player is still less similar");
});
test("Similar Players normalises across the dimensions actually used", () => {
  const keys = ["a", "b"];
  const bothDims = A.profileSimilarity({ a: 0, b: 0 }, { a: 40, b: 40 }, keys);
  const oneDim = A.profileSimilarity({ a: 0, b: null }, { a: 40, b: null }, keys);
  assert.equal(oneDim.used, 1);
  assert.equal(bothDims.used, 2);
  // rescaling to full dimensionality means a 40-point gap on the one shared axis is treated as the
  // same magnitude of difference, not as "half as different" because a metric was missing.
  assert.equal(oneDim.similarity, bothDims.similarity, "missing data does not manufacture similarity");
});
test("a pair with no shared metric produces no similarity score at all", () => {
  assert.equal(A.profileSimilarity({ a: null }, { a: null }, ["a"]), null);
});

// ── 10. Season Rating invents nothing ────────────────────────────────────────
test("Season Rating omits the assist term when assists are unknown — no proxy, no compensating multiplier", () => {
  const known = A.goalContribution(4, 2);
  const unknown = A.goalContribution(4, null);
  assert.equal(known.value, (4 + 2) * 0.25, "known case unchanged");
  assert.equal(known.reduced, false);
  assert.equal(unknown.value, 4 * 0.25, "unknown case is goals alone");
  assert.equal(unknown.reduced, true, "and is flagged as reduced so it can be disclosed");
  // the specific regression: the 6B patch used goals * 0.25 * 1.5 to hold the old ceiling
  assert.notEqual(unknown.value, 4 * 0.25 * 1.5, "no 1.5x assist proxy");
  // a zero-assist player and an unknown-assist player with the same goals must not be equal by
  // accident of the formula — they are equal in VALUE here, but only one is flagged reduced.
  assert.equal(A.goalContribution(4, 0).reduced, false, "a real zero is not a reduced input");
});
test("the Season Rating contribution is still capped, and scales with real assists", () => {
  assert.equal(A.goalContribution(100, 100).value, 4, "cap preserved");
  assert.ok(A.goalContribution(4, 4).value > A.goalContribution(4, 0).value, "real assists still count");
});
test("no archive Season Rating input is built from a synthesized assist", () => {
  const ps = appPlayers(2024);
  assert.ok(ps, "2024 cache present");
  for (const p of ps.slice(0, 300)) {
    const gc = A.goalContribution(p.goals, p.assists);
    assert.equal(gc.reduced, true, p.name + ": archive contribution flagged reduced");
    assert.equal(gc.value, Math.min(4, p.goals * 0.25), p.name + ": goals only, unscaled");
  }
});

// ── 11. Impact/90 ────────────────────────────────────────────────────────────
test("archive Impact/90 is a reduced-input figure that names what it left out", () => {
  const archive = { goals: 4, assists: null, tackles: 20, keyPasses: 10, interceptions: 5 };
  const full = { goals: 4, assists: 3, tackles: 20, keyPasses: 10, interceptions: 5 };
  const a = A.impactPerGame(archive, 10);
  const f = A.impactPerGame(full, 10);
  assert.equal(a.reduced, true, "flagged as reduced");
  assert.deepEqual(a.missing, ["assists"], "and says which term is missing");
  assert.equal(f.reduced, false, "a complete season is not flagged");
  assert.equal(a.value, (4 + 20 + 10 + 5) / 10, "the assist term is absent, not zero-filled");
  assert.equal(f.value, (4 + 3 + 20 + 10 + 5) / 10, "the complete definition is unchanged");
  assert.deepEqual(f.included, ["goals", "assists", "tackles", "key passes", "interceptions"]);
});
test("Impact/90 is unavailable rather than 0 for a player with no games", () => {
  const r = A.impactPerGame({ goals: 1, assists: 1, tackles: 1, keyPasses: 1, interceptions: 1 }, 0);
  assert.equal(r.value, null);
  assert.equal(F.sv(r.value), "—");
});
test("every archive Impact/90 is flagged reduced on the real cache", () => {
  const ps = appPlayers(2025);
  assert.ok(ps, "2025 cache present");
  for (const p of ps.slice(0, 200)) {
    const r = A.impactPerGame(p, Math.round((p.mins || 0) / 90));
    if (r.value == null) continue;
    assert.equal(r.reduced, true, p.name + ": reduced");
    assert.ok(r.missing.includes("assists"), p.name + ": assists named as the missing term");
  }
});

// ── 12. MVP ──────────────────────────────────────────────────────────────────
test("archive MVP removes the assist term from the basis rather than scoring unknown assists as zero", () => {
  const pool = [{ name: "A", overall: 80, goals: 10, assists: null, mins: 1800, totalGA: "1.0" }];
  assert.equal(A.assistsCoverageComplete(pool), false, "an unknown row makes coverage incomplete");
  const scored = A.mvpScore(pool[0], { useAssists: false });
  assert.equal(typeof scored, "number");
  assert.ok(Number.isFinite(scored), "a finite score with no assist term");
});
test("a mixed pool falls back to the reduced basis for everyone, so no player is punished for a missing source", () => {
  const withAssists = { name: "known", overall: 80, goals: 10, assists: 8, mins: 1800, totalGA: "1.0" };
  const withoutAssists = { name: "unknown", overall: 80, goals: 10, assists: null, mins: 1800, totalGA: "1.0" };
  assert.equal(A.assistsCoverageComplete([withAssists, withoutAssists]), false);
  const a = A.mvpScore(withAssists, { useAssists: false });
  const b = A.mvpScore(withoutAssists, { useAssists: false });
  assert.equal(a, b, "identical apart from an unavailable field, so identically scored");
  // whereas scoring the unknown row as zero would have separated them
  assert.ok(A.mvpScore(withAssists, { useAssists: true }) > b, "the known-coverage basis is the one that differs");
});
test("a complete pool still uses assists", () => {
  const pool = [{ name: "A", overall: 80, goals: 10, assists: 8, mins: 1800, totalGA: "1.0" },
                { name: "B", overall: 80, goals: 10, assists: 0, mins: 1800, totalGA: "1.0" }];
  assert.equal(A.assistsCoverageComplete(pool), true);
  assert.ok(A.mvpScore(pool[0], { useAssists: true }) > A.mvpScore(pool[1], { useAssists: true }));
});
test("the whole archive field reports incomplete assist coverage", () => {
  const ps = appPlayers(2024);
  assert.ok(ps, "2024 cache present");
  assert.equal(A.assistsCoverageComplete(ps.filter(p => (p.mins || 0) >= 200)), false);
  const cur = appPlayers(2026);
  if (cur) assert.equal(A.assistsCoverageComplete(cur.filter(p => (p.mins || 0) >= 200)), true, "2026 coverage is complete");
});

// ── 13. Golden Boot ──────────────────────────────────────────────────────────
test("Golden Boot does not use unknown assists as a tiebreak, and does not invent a sentinel", () => {
  const list = [
    { name: "Zeta", goals: 9, assists: null },
    { name: "Alpha", goals: 9, assists: null },
    { name: "Mid", goals: 12, assists: null },
  ];
  const order = A.goldenBootOrder(list, { useAssists: false }).map(p => p.name);
  assert.deepEqual(order, ["Mid", "Alpha", "Zeta"], "goals decide; equal goals fall back to a deterministic non-performance key");
  // determinism: the same input in a different order produces the same output
  const shuffled = A.goldenBootOrder([list[2], list[0], list[1]], { useAssists: false }).map(p => p.name);
  assert.deepEqual(shuffled, order, "ordering does not depend on input order");
});
test("Golden Boot still uses assists as a tiebreak where assist coverage exists", () => {
  const list = [{ name: "Zeta", goals: 9, assists: 1 }, { name: "Alpha", goals: 9, assists: 7 }];
  assert.equal(A.assistsCoverageComplete(list), true);
  assert.deepEqual(A.goldenBootOrder(list, { useAssists: true }).map(p => p.name), ["Alpha", "Zeta"]);
});
test("the archive Golden Boot never orders two equal-goal players by an assist value", () => {
  const ps = appPlayers(2025);
  assert.ok(ps, "2025 cache present");
  const pool = ps.filter(p => (p.goals || 0) >= 1);
  const useAssists = A.assistsCoverageComplete(pool);
  assert.equal(useAssists, false, "coverage is unavailable, so assists are not a tiebreak");
  const order = A.goldenBootOrder(pool, { useAssists });
  for (let i = 1; i < order.length; i++) {
    assert.ok((order[i - 1].goals || 0) >= (order[i].goals || 0), "goals are non-increasing");
    if ((order[i - 1].goals || 0) === (order[i].goals || 0)) {
      assert.ok(String(order[i - 1].name).localeCompare(String(order[i].name)) <= 0, "ties use the name key");
    }
  }
});

// ── wiring: the app actually calls these ─────────────────────────────────────
test("src/app.jsx is wired to the archive semantics module rather than keeping its own copies", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /from "\.\/analytics\/archive\.mjs"/, "app imports the module");
  assert.match(app, /totalAssists:sumStrict\(tp,"assists"\)/, "club assist totals use the strict sum");
  assert.match(app, /buildPercentiles\(players,PCT_KEYS\)/, "percentiles come from the module");
  assert.match(app, /profileSimilarity\(src,pr,keys\)/, "Similar Players uses the missing-metric-safe distance");
  assert.match(app, /goalContribution\(p\.goals,p\.assists\)/, "Season Rating uses the honest contribution");
  assert.match(app, /impactPerGame\(p,gamesPlayed\)/, "Impact/90 uses the reduced-input-aware helper");
  assert.match(app, /assistsCoverageComplete\(mvpPool\)/, "MVP consults season-wide assist coverage");
  assert.match(app, /goldenBootOrder\(bootPool,\{useAssists:bootUsesAssists\}\)/, "Golden Boot tiebreak is coverage-gated");
  assert.doesNotMatch(app, /\(p\.goals\|\|0\)\*0\.25\*1\.5/, "the invented 1.5x assist proxy is gone");
  assert.doesNotMatch(app, /b\.assists!=null\?b\.assists:-1/, "the -1 assist sentinel is gone");
});
