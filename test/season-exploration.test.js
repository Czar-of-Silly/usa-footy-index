// Phase 6C — Historical league exploration. Rankings, position boards, Best XI, Compare and Teams
// under an archive season, plus the two 6B.1 polish fixes. Everything runs the real functions over
// the real committed caches through the same canonical pipeline src/app.jsx uses.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { load, req } = require("./_engine");
const E = load();
const A = req("src/analytics/archive.mjs");
const ROOT = path.join(__dirname, "..");

const CACHES = { 2024: "public/data/mls-cache-2024.json", 2025: "public/data/mls-cache-2025.json", 2026: "public/data/mls-cache.json" };
const SEASON_ASSISTS_OK = { 2026: true, 2025: false, 2024: false };
const GK_COVERAGE = (yr) => yr === 2026; // SEASON_COVERAGE[2024/2025].gk === false
function cacheFor(yr) { const p = path.join(ROOT, CACHES[yr]); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; }

// src/app.jsx's selected-season mapping, reduced to the fields these tests read.
function appPlayers(yr) {
  const cache = cacheFor(yr); if (!cache) return null;
  const raw = cache.players || [];
  const validated = raw.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
  const inter = validated.map(E.preparePlayerForGrading);
  const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
  return inter.map(p => {
    const r = p.raw, g = grades[p.id] || { overall: 55, attack: 55, passing: 55, defense: 55, creativity: 55, carrying: 55 };
    return {
      id: p.id, name: r.n, team: r.t, position: r.p, mins: r.m, overall: g.overall,
      attack: g.attack, passing: g.passing, defense: g.defense, creativity: g.creativity, carrying: g.carrying,
      goals: r.g || 0, assists: SEASON_ASSISTS_OK[yr] === false ? null : (r.as || 0),
      marketValue: r.mv || 0, departed: !!r.departed, rated: (r.m || 0) > 0,
    };
  });
}
// src/app.jsx's enrichedTeams, reduced to what the team tests read.
function appTeams(yr) {
  const ps = appPlayers(yr); if (!ps) return null;
  const abbrs = [...new Set(ps.map(p => p.team))];
  return abbrs.map(abbr => {
    const tp = ps.filter(p => p.team === abbr && !p.departed);
    const wAvg = (k) => { let ws = 0, wt = 0; for (const p of tp) { const w = parseFloat(p.mins) || 0; if (w <= 0) continue; ws += (parseFloat(p[k]) || 0) * w; wt += w; } return wt > 0 ? Math.round(ws / wt) : 55; };
    return { abbr, name: abbr, count: tp.length, overall: tp.length ? wAvg("overall") : 55, totalGoals: A.sumLenient(tp, "goals"), totalAssists: A.sumStrict(tp, "assists") };
  });
}

// ── 11–12. historical Top 25 ────────────────────────────────────────────────
test("the Top 25 for a season contains only that season's players, in Overall order", () => {
  for (const yr of [2024, 2025, 2026]) {
    const ps = appPlayers(yr); if (!ps) continue;
    const rows = A.seasonLeaderboard(ps, { group: "ALL", limit: 25 });
    assert.equal(rows.length, 25, `${yr} returns 25`);
    const ids = new Set(ps.map(p => p.id + "|" + p.name));
    for (const r of rows) assert.ok(ids.has(r.id + "|" + r.name), `${yr}: ${r.name} came from the ${yr} pool`);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].overall >= rows[i].overall, `${yr}: Overall is non-increasing`);
    assert.equal(rows[0].overall, Math.max(...ps.filter(A.isRankEligible).map(p => p.overall)), `${yr}: #1 is the season's best graded player`);
  }
});
test("two seasons produce genuinely different Top 25s — the board is not the current season relabelled", () => {
  const a = A.seasonLeaderboard(appPlayers(2024), { limit: 25 }).map(p => p.name);
  const c = A.seasonLeaderboard(appPlayers(2026), { limit: 25 }).map(p => p.name);
  assert.notDeepEqual(a, c);
  assert.ok(a.some(n => !c.includes(n)), "2024 has players the 2026 board does not");
});

// ── 13. position boards ─────────────────────────────────────────────────────
test("a position board contains only that normalised position group", () => {
  for (const yr of [2024, 2026]) {
    const ps = appPlayers(yr); if (!ps) continue;
    for (const g of A.POS_GROUPS) {
      const rows = A.seasonLeaderboard(ps, { group: g, limit: 10 });
      assert.ok(rows.length > 0, `${yr} ${g} board is populated`);
      for (const r of rows) {
        assert.equal(A.normalizeGroup(r.position), g, `${yr}: ${r.name} belongs in ${g}`);
        assert.equal(r.group, g);
      }
      // the pool size quoted in the header is that group in that season, not the whole league
      assert.equal(rows[0].poolSize, ps.filter(p => A.isRankEligible(p) && A.normalizeGroup(p.position) === g).length);
      assert.ok(rows[0].poolSize < ps.length, `${yr} ${g} pool is a subset of the league`);
    }
  }
});
test("a keeper's strongest skill is named on keeper terms, an outfielder's is not", () => {
  const ps = appPlayers(2026);
  const gks = A.seasonLeaderboard(ps, { group: "GK", limit: 10 });
  const keeperWords = ["Shot-Stop", "Distribution", "Command", "Sweeping", "Handling"];
  const outfieldWords = ["Attack", "Passing", "Defense", "Creativity", "Carrying"];
  for (const g of gks) {
    const ss = A.strongestSubgrade(g, g.group === "GK");
    assert.ok(keeperWords.includes(ss.label), `${g.name}: "${ss.label}" is keeper terminology`);
    assert.ok(!outfieldWords.includes(ss.label), `${g.name}: not an outfield name`);
  }
  const fws = A.seasonLeaderboard(ps, { group: "FW", limit: 5 });
  for (const f of fws) assert.ok(outfieldWords.includes(A.strongestSubgrade(f, false).label), `${f.name}: outfield terminology`);
});

// ── 14. deterministic ties ──────────────────────────────────────────────────
test("equal Overall grades share a rank, and the board does not depend on input order", () => {
  const mk = (name, overall, position) => ({ id: name, name, overall, position, mins: 1800, rated: true, team: "T" });
  const rows = [mk("Zed", 90, "Forward"), mk("Amy", 88, "Forward"), mk("Bob", 88, "Forward"), mk("Cal", 70, "Forward")];
  const r1 = A.seasonLeaderboard(rows, { limit: 0 });
  assert.deepEqual(r1.map(r => [r.name, r.rank]), [["Zed", 1], ["Amy", 2], ["Bob", 2], ["Cal", 4]]);
  const r2 = A.seasonLeaderboard([rows[3], rows[2], rows[1], rows[0]], { limit: 0 });
  assert.deepEqual(r2.map(r => [r.name, r.rank]), r1.map(r => [r.name, r.rank]), "order-independent");
});
test("real seasons contain shared ranks, and every shared rank is a genuine grade tie", () => {
  for (const yr of [2024, 2026]) {
    const rows = A.seasonLeaderboard(appPlayers(yr), { limit: 0 });
    const byRank = {};
    let ties = 0;
    for (const r of rows) { if (byRank[r.rank] != null) { ties++; assert.equal(byRank[r.rank], r.overall, `${yr} ${r.name}: shares a rank only with an equal grade`); } byRank[r.rank] = r.overall; }
    assert.ok(ties > 0, `${yr} has real shared ranks (${ties})`);
  }
});

// ── 15–16. eligibility ──────────────────────────────────────────────────────
test("PROV players stay in the ranking pool and are flagged, not filtered", () => {
  for (const yr of [2024, 2026]) {
    const ps = appPlayers(yr); if (!ps) continue;
    const all = A.seasonLeaderboard(ps, { limit: 0 });
    const provs = all.filter(r => r.prov);
    assert.ok(provs.length > 5, `${yr} has ranked PROV players (${provs.length})`);
    for (const r of provs) { assert.ok(r.mins < 450); assert.ok(r.rank >= 1); }
    // a PROV player really can outrank an established one — the label changes nothing
    const establishedWorst = Math.min(...all.filter(r => !r.prov).map(r => r.overall));
    assert.ok(provs.some(r => r.overall > establishedWorst), `${yr}: PROV competes on the same board`);
  }
});
test("zero-minute players are excluded, exactly as the grading pool excludes them", () => {
  for (const yr of [2024, 2026]) {
    const ps = appPlayers(yr); if (!ps) continue;
    const zero = ps.filter(p => (p.mins || 0) === 0);
    const ranked = new Set(A.seasonLeaderboard(ps, { limit: 0 }).map(r => r.id));
    for (const z of zero) assert.ok(!ranked.has(z.id), `${yr}: ${z.name} has no minutes and is not ranked`);
    assert.equal(A.isRankEligible({ mins: 0, overall: 55, rated: false }), false);
    assert.equal(A.isRankEligible({ mins: 1, overall: 55, rated: true }), true, ">= 1 minute is still the only gate");
    assert.equal(A.isRankEligible({ mins: 200, overall: 55, rated: true }), true, "PROV is not a gate");
  }
});

// ── 17. archive rankings consume no current-season movement ─────────────────
test("archive rankings never consume the current season's rank history or pipeline status", () => {
  const aux = { pipeStatus: { steps: { fetch: "ok" } }, rankHistory: [{ date: "2026-08-01", power: { ATL: 3 } }] };
  assert.equal(A.archiveAuxiliary(2024, 2026, aux).rankHistory, null);
  assert.equal(A.archiveAuxiliary(2025, 2026, aux).pipeStatus, null);
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /\}else\{setRankHistory\(null\);setPipeStatus\(null\);\}/, "archive seasons never even fetch them");
});
test("a season with no fixtures drops the form term from Power Rankings instead of inventing a neutral one", () => {
  const withForm = A.powerScore({ normPts: 80, normGrade: 70, formScore: 60 });
  assert.equal(withForm.reduced, false);
  assert.equal(withForm.value, Math.round(80 * .5 + 70 * .3 + 60 * .2), "current-season blend unchanged");
  const noForm = A.powerScore({ normPts: 80, normGrade: 70, formScore: null });
  assert.equal(noForm.reduced, true, "flagged so the header can say so");
  assert.equal(noForm.weights.form, 0, "the unmeasured term carries no weight");
  assert.ok(Math.abs(noForm.weights.points + noForm.weights.grade - 1) < 1e-9, "remaining weights renormalise");
  // the specific regression: a neutral 50 used to stand in for form
  assert.notEqual(noForm.value, Math.round(80 * .5 + 70 * .3 + 50 * .2), "no synthetic neutral form");
  // and the archive caches really do carry no fixtures, so this path is the live one
  for (const yr of [2024, 2025]) { const c = cacheFor(yr); if (c) assert.equal((c.matches || []).length, 0, `${yr} has no fixture list`); }
  assert.ok((cacheFor(2026).matches || []).length > 0, "2026 does");
});

// ── 18–21. Best XI ──────────────────────────────────────────────────────────
test("each season's Best XI is drawn only from that season", () => {
  for (const yr of [2024, 2025, 2026]) {
    const ps = appPlayers(yr); if (!ps) continue;
    const xi = A.bestXI(ps);
    assert.equal(xi.length, 11, `${yr} fields a full XI`);
    const inSeason = new Set(ps.map(p => p.id + "|" + p.name + "|" + p.team));
    for (const s of xi) assert.ok(inSeason.has(s.p.id + "|" + s.p.name + "|" + s.p.team), `${yr}: ${s.p.name} is a ${yr} player`);
  }
  const names = (yr) => A.bestXI(appPlayers(yr)).map(s => s.p.name).join("|");
  assert.notEqual(names(2024), names(2026), "the archive XI is not the current one relabelled");
  assert.notEqual(names(2024), names(2025));
});
test("the Best XI keeps the shipped 4-3-3 and picks the top-graded player at each slot", () => {
  assert.deepEqual(A.BEST_XI_FORMATION.map(f => f.slot), ["LW", "ST", "RW", "LCM", "CM", "RCM", "LB", "LCB", "RCB", "RB", "GK"]);
  assert.deepEqual(A.BEST_XI_FORMATION.filter(f => f.group === "FW").length, 3);
  assert.deepEqual(A.BEST_XI_FORMATION.filter(f => f.group === "MF").length, 3);
  assert.deepEqual(A.BEST_XI_FORMATION.filter(f => f.group === "DF").length, 4);
  assert.deepEqual(A.BEST_XI_FORMATION.filter(f => f.group === "GK").length, 1);
  for (const yr of [2024, 2026]) {
    const ps = appPlayers(yr);
    const xi = A.bestXI(ps);
    for (const g of A.POS_GROUPS) {
      const slots = xi.filter(s => A.normalizeGroup(s.p.position) === g);
      const best = [...ps].filter(p => A.normalizeGroup(p.position) === g).sort((a, b) => b.overall - a.overall);
      assert.equal(slots.length, A.BEST_XI_FORMATION.filter(f => f.group === g).length, `${yr}: ${g} slot count`);
      assert.equal(Math.max(...slots.map(s => s.p.overall)), best[0].overall, `${yr}: the ${g} slot takes the top-graded ${g}`);
    }
  }
});
test("the Best XI invents nothing the archive lacks — it reads Overall and position, and nothing else", () => {
  // A player object stripped of every metric the archive is missing still produces the same XI.
  const ps = appPlayers(2024);
  const bare = ps.map(p => ({ id: p.id, name: p.name, team: p.team, position: p.position, overall: p.overall }));
  assert.deepEqual(A.bestXI(bare).map(s => s.p.name), A.bestXI(ps).map(s => s.p.name), "assists, minutes and the rest are not consulted");
  const src = fs.readFileSync(path.join(ROOT, "src/analytics/archive.mjs"), "utf8");
  const fn = src.slice(src.indexOf("export function bestXI"), src.indexOf("// ─── ARCHIVE-MODE AUXILIARY SCRUB"));
  for (const banned of ["assists", "goals", "mins", "matchLog"]) assert.ok(fn.indexOf(banned) < 0, `bestXI does not read ${banned}`);
});
test("src/app.jsx uses that one Best XI helper rather than keeping its own copy", () => {
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /const xi=bestXI\(players\);/, "the Leaders tab calls the helper");
  assert.doesNotMatch(s, /const fws=byPos\(/, "the inline formation block is gone");
});

// ── 22–25. Compare ──────────────────────────────────────────────────────────
test("archive Compare shows an unavailable metric as unavailable, with no bar", () => {
  const ps = appPlayers(2024);
  const two = [ps.find(p => p.mins > 900), ps.filter(p => p.mins > 900)[5]];
  for (const p of two) assert.equal(p.assists, null, `${p.name}: assists unavailable in 2024`);
  // the exact expression the compare bar uses to decide value and width
  const vals = two.map(p => (p.assists == null || p.assists === "" || isNaN(parseFloat(p.assists))) ? null : parseFloat(p.assists));
  assert.deepEqual(vals, [null, null]);
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /width:vals\[i\]==null\?0:/, "an unknown value draws no bar");
  assert.match(s, /vals\[i\]==null\?"\\u2014"/, "and prints an em dash, not 0");
});
test("a current-season Compare still shows real assist numbers", () => {
  const ps = appPlayers(2026);
  const scorer = ps.find(p => p.assists > 0);
  assert.equal(typeof scorer.assists, "number");
});
test("changing season clears an incompatible Compare selection instead of guessing an equivalent", () => {
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /if\(prevLoaded!=null&&prevLoaded!==season&&compareRef\.current\.length\)\{/, "a season change with players selected is detected");
  assert.match(s, /setComparePlayers\(\[\]\);/, "the selection is cleared");
  assert.match(s, /setCompareNotice\(/, "and the reason is stated");
  assert.match(s, /\{compareNotice&&<div role="status"/, "where the user can see it");
  // ids are positional within a season, so carrying them across would silently swap the player
  const a = appPlayers(2024), c = appPlayers(2026);
  const sameId = a.find(p => p.id === "p10"), otherId = c.find(p => p.id === "p10");
  assert.notEqual(sameId.name, otherId.name, "the same id is a different player in another season — why remapping by id is refused");
});
test("goalkeeper Compare uses keeper terminology only when every player is a keeper", () => {
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /const compKeepersOnly=cp\.length>0&&cp\.every\(p=>normalizeGroup\(p\.position\)==="GK"\);/, "all-keeper sets are detected");
  assert.match(s, /compSubLabel=\{attack:compKeepersOnly\?"Shot-Stop":"Attack"/, "and the row labels follow");
  assert.match(s, /compBar\(compSubLabel\.attack,"attack",99\)/, "the bars use those labels");
  assert.match(s, /compHasKeeper/, "a mixed set is disclosed rather than mislabelled");
  // every surface of the comparison agrees: cards, radar axes and bars
  assert.match(s, /normalizeGroup\(p\.position\)==="GK"\?\[\{l:"Overall",v:p\.overall\},\{l:"Shot-Stop"/, "the per-player card uses keeper names");
  assert.match(s, /\[compKeepersOnly\?"Shot-Stop":"Attack","attack"\]/, "so do the radar axes");
  assert.doesNotMatch(s.slice(s.indexOf("tab===\"compare\"")), /compBar\("Attack"/, "no outfield-only label survives in the compare bars");
});

// ── 26–29. Teams ────────────────────────────────────────────────────────────
test("historical Team Grade is computed from the selected season only", () => {
  const t24 = appTeams(2024), t26 = appTeams(2026);
  const byAbbr = (list) => Object.fromEntries(list.map(t => [t.abbr, t]));
  const a = byAbbr(t24), c = byAbbr(t26);
  const shared = Object.keys(a).filter(k => c[k]);
  assert.ok(shared.length > 20, "the clubs overlap");
  assert.ok(shared.some(k => a[k].overall !== c[k].overall), "and their grades differ by season");
  assert.ok(shared.some(k => a[k].totalGoals !== c[k].totalGoals), "so do their goal totals");
});
test("archive club assist totals stay unavailable, and current-season ones stay real", () => {
  for (const t of appTeams(2024)) if (t.count > 0) assert.equal(t.totalAssists, null, `${t.abbr}: unavailable, not 0`);
  for (const t of appTeams(2025)) if (t.count > 0) assert.equal(t.totalAssists, null, `${t.abbr}: unavailable, not 0`);
  const cur = appTeams(2026).filter(t => t.count > 0);
  assert.ok(cur.every(t => typeof t.totalAssists === "number"), "2026 clubs total normally");
  assert.ok(cur.some(t => t.totalAssists > 0));
});
test("club ranking by Team Grade stays inside one season and shares ranks on equal grades", () => {
  for (const yr of [2024, 2026]) {
    const teams = appTeams(yr);
    const { ranks, of, ordered } = A.teamGradeRanking(teams);
    const graded = teams.filter(t => t.count > 0);
    assert.equal(of, graded.length, `${yr}: the pool is that season's graded clubs`);
    assert.equal(ordered[0].overall, Math.max(...graded.map(t => t.overall)), `${yr}: #1 has the best Team Grade`);
    for (const t of graded) assert.ok(ranks[t.abbr].rank >= 1 && ranks[t.abbr].rank <= of, `${yr} ${t.abbr} ranked in range`);
    const seen = {};
    for (const t of ordered) { if (seen[ranks[t.abbr].rank] != null) assert.equal(seen[ranks[t.abbr].rank], t.overall, "shared rank means equal grade"); seen[ranks[t.abbr].rank] = t.overall; }
  }
  // and the two seasons are ranked independently
  const r24 = A.teamGradeRanking(appTeams(2024)).ranks, r26 = A.teamGradeRanking(appTeams(2026)).ranks;
  assert.ok(Object.keys(r24).some(k => r26[k] && r24[k].rank !== r26[k].rank), "club ranks move between seasons");
});
test("archive team views withhold current-season pipeline, freshness and movement", () => {
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /const isArchiveSeason=season!==CURRENT_SEASON;/, "one archive flag");
  assert.match(s, /current-season features \{"\\u2014"\} freshness, ranking movement and pipeline status/, "the Teams archive note explains what is withheld");
  assert.match(s, /isArchiveSeason\?\("Arrows: power rank vs the "\+season\+" points table/, "movement copy does not promise week-over-week in the archive");
});

// ── league-level season overview ────────────────────────────────────────────
test("Season at a Glance reports only what the stored season establishes", () => {
  const ov = A.seasonOverview(appPlayers(2024), appTeams(2024), cacheFor(2024).standings, { season: 2024 });
  assert.equal(ov.season, 2024);
  assert.ok(ov.gradedPlayers > 500 && ov.gradedPlayers <= appPlayers(2024).length);
  assert.ok(ov.clubs > 20);
  assert.equal(ov.topOverall.overall, Math.max(...appPlayers(2024).filter(A.isRankEligible).map(p => p.overall)));
  for (const g of A.POS_GROUPS) assert.equal(A.normalizeGroup(ov.byGroup[g].position), g, g + " leader is in that group");
  assert.ok(ov.pointsLeader && ov.pointsLeader.pts > 0, "a points leader is read from the stored table");
  assert.equal(ov.assistsKnown, false, "2024 assist coverage is reported as absent");
  const cur = A.seasonOverview(appPlayers(2026), appTeams(2026), cacheFor(2026).standings, { season: 2026 });
  assert.equal(cur.assistsKnown, true);
  // no championship is claimed anywhere
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /Points leader \(stored table\)/, "the table row is labelled as a points leader");
  assert.ok(!("champion" in ov) && !("winner" in ov) && !("title" in ov), "the overview exposes no championship field to render");
  assert.match(s, /no championship is claimed/, "and the copy says so explicitly");
});

// ── 33. 6B.1 polish: archive goalkeeper Peak Skill ──────────────────────────
test("a keeper's Peak Skill ignores archive seasons that carry no goalkeeper data", () => {
  const seasons = [
    { year: 2024, team: "ATX", overall: 59, attack: 0, passing: 88, defense: 96, creativity: 62, carrying: 0, mins: 3000 },
    { year: 2025, team: "ATX", overall: 60, attack: 0, passing: 78, defense: 99, creativity: 70, carrying: 0, mins: 3000 },
    { year: 2026, team: "ATX", overall: 94, attack: 99, passing: 61, defense: 68, creativity: 66, carrying: 96, mins: 2070 },
  ];
  const s = A.careerSummary(seasons, { isGK: true, gkCoverage: GK_COVERAGE });
  assert.equal(s.peakSub.year, 2026, "the peak comes from the only full-coverage keeper season");
  assert.equal(s.peakSub.label, "Shot-Stop");
  assert.equal(s.peakSub.value, 99);
  assert.deepEqual(s.peakSkippedYears, [2024, 2025], "and the excluded years are reported");
  // the specific regression: 2025's Command 99 must not be the headline
  assert.notEqual(s.peakSub.label + s.peakSub.year, "Command2025");
  // the other tiles are untouched by the gate
  assert.equal(s.bestOverall.value, 94);
  assert.equal(s.mostMins.value, 3000);
  assert.equal(s.seasons, 3);
});
test("a keeper with no full-coverage season reports no peak rather than quoting a disqualified one", () => {
  const s = A.careerSummary([{ year: 2024, team: "ATX", overall: 59, attack: 0, passing: 88, defense: 96, creativity: 62, carrying: 0, mins: 3000 }], { isGK: true, gkCoverage: GK_COVERAGE });
  assert.equal(s.peakSub, null);
  assert.equal(s.peakSubUnavailable, "no-gk-coverage");
  assert.equal(s.bestOverall.value, 59, "the rest of the summary still reports");
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /No full-coverage goalkeeper season in the record/, "and the tile says why");
});
test("outfield Peak Skill is unaffected by the goalkeeper gate", () => {
  const seasons = [
    { year: 2024, team: "FCD", overall: 71, attack: 55, passing: 66, defense: 74, creativity: 51, carrying: 60, mins: 2573 },
    { year: 2026, team: "LAFC", overall: 78, attack: 52, passing: 92, defense: 80, creativity: 47, carrying: 61, mins: 2040 },
  ];
  const withGate = A.careerSummary(seasons, { isGK: false, gkCoverage: GK_COVERAGE });
  const without = A.careerSummary(seasons, { isGK: false });
  assert.deepEqual(withGate.peakSub, without.peakSub);
  assert.equal(withGate.peakSub.label, "Passing");
  assert.deepEqual(withGate.peakSkippedYears, [], "nothing is skipped for an outfielder");
});

// ── 34. 6B.1 polish: chart emphasis follows the season being viewed ─────────
test("the career chart emphasises the season being viewed, not whichever season is newest", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /export function SeasonHistoryChart\(\{ series, currentSeason, viewingSeason \}\)/, "the chart takes both");
  assert.match(src, /isViewing = viewingSeason != null && s\.year === viewingSeason/, "emphasis is decided by viewingSeason");
  assert.match(src, /r=\{isViewing \? 6\.5 : 4\.5\}/, "and drives the point");
  assert.doesNotMatch(src, /isCur = s\.year === currentSeason/, "the old current-season emphasis is gone");
  // ARCHIVE labelling still keys off coverage, which is a fact about the season, not the reader
  assert.match(src, /s\.year !== currentSeason && <text[^>]*>ARCHIVE/, "archive labelling still follows currentSeason");
  assert.match(src, /viewingSeason=\{viewingSeason\}/, "and the panel passes it down");
});

// ── 30–32. the 6B.1 identity guarantees still hold under 6C ─────────────────
test("cross-season identity is still exact-name only, and Tiago is still ambiguous", () => {
  const idx2026 = A.buildNameIndex(appPlayers(2026).filter(A.isRankEligible), r => r.name);
  assert.equal(A.resolveExactName(idx2026.counts, "Tiago"), "ambiguous");
  assert.equal(A.canDrillThrough(idx2026.counts, "Tiago"), false);
  assert.equal(A.canDrillThrough(idx2026.counts, "Nkosi Tafari"), true);
  const idx2024 = A.buildNameIndex(appPlayers(2024).filter(A.isRankEligible), r => r.name);
  assert.equal(A.resolveExactName(idx2024.counts, "Adrian Gill"), "none");
  const s = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(s, /canDrillThrough\(idx\.counts,name\)/, "drill eligibility unchanged");
  // strip comments — several of them say, correctly, that fuzzy matching is NOT done
  const code = s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /levenshtein|soundex|\.includes\(name\)|toLowerCase\(\)===.*name/i, "no fuzzy or normalised identity join was introduced");
});
test("career history gaps are still gaps", () => {
  const s = A.historySeries([2024, 2025, 2026], [{ year: 2024, overall: 70 }, { year: 2026, overall: 80 }]);
  assert.deepEqual(s.points.map(p => p.recorded), [true, false, true]);
  assert.equal(s.segments.length, 0);
});
