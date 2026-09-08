// Phase 6B.1 — Career history. Behaviour tests for the cross-season panel: within-season positional
// ranks, the career summary, goalkeeper labelling, the gap-preserving chart series, exact-name
// drill-through safety, and the archive-mode scrub the Methodology page relies on.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { load, req } = require("./_engine");
const E = load();
const A = req("src/analytics/archive.mjs");
const ROOT = path.join(__dirname, "..");

const CACHES = { 2024: "public/data/mls-cache-2024.json", 2025: "public/data/mls-cache-2025.json", 2026: "public/data/mls-cache.json" };
const SEASON_ASSISTS_OK = { 2026: true, 2025: false, 2024: false };
function rawFor(yr) { const p = path.join(ROOT, CACHES[yr]); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")).players : null; }

// The history loader from src/app.jsx, reproduced through the same canonical functions it calls.
function seasonIndex(yr) {
  const raw = rawFor(yr); if (!raw) return null;
  const validated = raw.filter(r => r && r.n && r.t && typeof r.n === "string").map(E.validatePlayer);
  const inter = validated.map(E.preparePlayerForGrading);
  const grades = E.computeGrades(inter.filter(p => (p.raw.m || 0) >= 1));
  const rankRows = inter.filter(p => grades[p.id]).map(p => ({ key: p.id, pos: A.posGroupKey(p), ov: grades[p.id].overall }));
  const { ranks, totals } = A.positionalRanks(rankRows);
  const rows = [];
  inter.forEach(p => {
    const r = p.raw, g = grades[p.id]; if (!g) return;
    const rk = ranks[p.id] || null;
    rows.push({
      id: p.id, name: r.n, overall: g.overall, attack: g.attack, passing: g.passing, defense: g.defense,
      creativity: g.creativity, carrying: g.carrying, isGK: !!g.isGK, goals: r.g,
      assists: SEASON_ASSISTS_OK[yr] === false ? null : r.as, mins: r.m, team: r.t,
      posRank: rk ? rk.rank : null, posGroup: rk ? rk.pos : null, posOf: rk ? rk.of : null,
      prov: (r.m || 0) < 450,
    });
  });
  const { counts, byName } = A.buildNameIndex(rows, r => r.name);
  const byId = {}; rows.forEach(r => { byId[r.id] = r; });
  return { rows, counts, byName, byId, totals, prepared: inter, grades };
}

// ── 1. rank uses only the requested season ───────────────────────────────────
test("a season's positional rank is computed inside that season only", () => {
  const a = seasonIndex(2024), b = seasonIndex(2025);
  assert.ok(a && b, "both archive caches present");
  for (const grp of ["FW", "MF", "DF", "GK"]) {
    const inSeason = a.rows.filter(r => r.posGroup === grp).length;
    assert.equal(a.totals[grp], inSeason, `2024 ${grp} pool is the 2024 rows`);
    // and it is emphatically not the two seasons pooled together
    assert.notEqual(a.totals[grp], a.totals[grp] + b.totals[grp], `2024 ${grp} is not 2024+2025`);
    for (const r of a.rows.filter(r => r.posGroup === grp)) {
      assert.equal(r.posOf, inSeason, `${r.name}: "of N" is that season's group size`);
      assert.ok(r.posRank >= 1 && r.posRank <= inSeason, `${r.name}: rank inside the group`);
    }
  }
  // the same player really can hold different ranks in different seasons
  const shared = a.rows.filter(r => b.counts[r.name] === 1 && a.counts[r.name] === 1);
  assert.ok(shared.length > 50, "a real overlap of players exists");
  assert.ok(shared.some(r => b.byName[r.name].posRank !== r.posRank), "ranks are per-season, not carried across");
});

// ── 2. normalized positional group ───────────────────────────────────────────
test("rank groups come from the engine's own normalised GK/FW/DF/MF split", () => {
  for (const yr of [2024, 2025, 2026]) {
    const idx = seasonIndex(yr); if (!idx) continue;
    const byId = {}; idx.rows.forEach(r => { byId[r.id] = r; });
    for (const p of idx.prepared) {
      const row = byId[p.id]; if (!row) continue;
      assert.equal(row.posGroup, A.posGroupKey(p), `${yr} ${row.name}: group matches posGroupKey`);
      if (p.isGK) assert.equal(row.posGroup, "GK", `${yr} ${row.name}: a keeper ranks in the keeper pool`);
      else assert.notEqual(row.posGroup, "GK", `${yr} ${row.name}: an outfielder never ranks among keepers`);
    }
    const gkCount = idx.rows.filter(r => r.posGroup === "GK").length;
    assert.ok(gkCount > 10, `${yr} has a real keeper pool (${gkCount})`);
  }
});
test("a raw position string is normalised before it picks a rank group", () => {
  // The caches use "defense"/"midfield"/"goalkeeper" in 2026 and "Defender"/"GK" in 2024.
  const mk = (pos) => A.posGroupKey(E.preparePlayerForGrading(E.validatePlayer({ n: "x", t: "T", m: 900, p: pos }), 0));
  assert.equal(mk("defense"), "DF");
  assert.equal(mk("Defender"), "DF");
  assert.equal(mk("midfield"), "MF");
  assert.equal(mk("goalkeeper"), "GK");
  assert.equal(mk("GK"), "GK");
  assert.equal(mk("forward"), "FW");
});

// ── 3. tied grades get tied ranks, deterministically ─────────────────────────
test("tied Overall grades share a rank and do not depend on array order", () => {
  const rows = [
    { key: "a", pos: "MF", ov: 90 },
    { key: "b", pos: "MF", ov: 80 },
    { key: "c", pos: "MF", ov: 80 },
    { key: "d", pos: "MF", ov: 70 },
  ];
  const r1 = A.positionalRanks(rows).ranks;
  assert.equal(r1.a.rank, 1);
  assert.equal(r1.b.rank, 2);
  assert.equal(r1.c.rank, 2, "standard competition ranking: the tie shares a rank");
  assert.equal(r1.d.rank, 4, "and the next rank skips");
  const r2 = A.positionalRanks([rows[3], rows[2], rows[1], rows[0]]).ranks;
  for (const k of ["a", "b", "c", "d"]) assert.equal(r2[k].rank, r1[k].rank, k + ": order-independent");
});
test("real seasons contain tied ranks, and every tie is a genuine grade tie", () => {
  const idx = seasonIndex(2026);
  assert.ok(idx, "2026 cache present");
  const byGroup = {};
  idx.rows.forEach(r => { (byGroup[r.posGroup] = byGroup[r.posGroup] || []).push(r); });
  let ties = 0;
  for (const g of Object.keys(byGroup)) {
    const seen = {};
    for (const r of byGroup[g]) {
      if (seen[r.posRank] != null) { ties++; assert.equal(seen[r.posRank], r.overall, `${r.name}: shares a rank only with an equal grade`); }
      seen[r.posRank] = r.overall;
    }
  }
  assert.ok(ties > 0, `real tied ranks exist (${ties})`);
});

// ── 4. PROV does not change rank eligibility ─────────────────────────────────
test("a provisional (<450 minute) player is ranked like anyone else; only >0 minutes gates eligibility", () => {
  const idx = seasonIndex(2026);
  assert.ok(idx, "2026 cache present");
  const provs = idx.rows.filter(r => r.prov);
  assert.ok(provs.length > 10, `real PROV players exist (${provs.length})`);
  for (const r of provs) assert.ok(r.posRank >= 1, `${r.name}: PROV player still holds a rank`);
  // and PROV players are counted in the group size everyone else is measured against
  const grp = provs[0].posGroup;
  assert.equal(idx.totals[grp], idx.rows.filter(r => r.posGroup === grp).length, "PROV players are in the pool");
  // zero-minute players are the only ones excluded — that is the grading pool gate, unchanged
  const raw = rawFor(2026);
  const zeroMin = raw.filter(r => r && r.n && r.t && (r.m || 0) === 0);
  if (zeroMin.length) assert.ok(!idx.rows.some(r => r.name === zeroMin[0].n && r.mins === 0), "0-minute rows are not ranked");
});

// ── 14–17. career summary ────────────────────────────────────────────────────
const CAREER = [
  { year: 2024, team: "FCD", overall: 71, attack: 55, passing: 66, defense: 74, creativity: 51, carrying: 60, mins: 2573, posRank: 22, posGroup: "DF", posOf: 180 },
  { year: 2025, team: "LAFC", overall: 81, attack: 58, passing: 70, defense: 88, creativity: 49, carrying: 63, mins: 2074, posRank: 7, posGroup: "DF", posOf: 190 },
  { year: 2026, team: "LAFC", overall: 78, attack: 52, passing: 92, defense: 80, creativity: 47, carrying: 61, mins: 2040, posRank: 12, posGroup: "DF", posOf: 200 },
];
test("career summary reports the best RECORDED Overall grade and the season it came from", () => {
  const s = A.careerSummary(CAREER, { isGK: false });
  assert.equal(s.bestOverall.value, 81);
  assert.equal(s.bestOverall.year, 2025);
  assert.equal(s.seasons, 3);
  assert.equal(s.latestClub, "LAFC");
  assert.equal(s.latestYear, 2026, "latest is the most recent recorded season, not the highest grade");
});
test("career summary reports the best positional rank (lowest number), not the latest one", () => {
  const s = A.careerSummary(CAREER, { isGK: false });
  assert.equal(s.bestRank.rank, 7);
  assert.equal(s.bestRank.year, 2025);
  assert.equal(s.bestRank.group, "DF");
  assert.equal(s.bestRank.of, 190);
});
test("career summary reports the most minutes in a single recorded season", () => {
  const s = A.careerSummary(CAREER, { isGK: false });
  assert.equal(s.mostMins.value, 2573);
  assert.equal(s.mostMins.year, 2024, "a single season's total, not a career sum");
  assert.notEqual(s.mostMins.value, CAREER.reduce((t, r) => t + r.mins, 0), "not summed across seasons");
});
test("career summary reports the peak sub-grade with its category name and season", () => {
  const s = A.careerSummary(CAREER, { isGK: false });
  assert.equal(s.peakSub.value, 92);
  assert.equal(s.peakSub.label, "Passing");
  assert.equal(s.peakSub.key, "passing");
  assert.equal(s.peakSub.year, 2026);
});
test("career summary skips ambiguous and ungraded seasons, and is null with nothing to report", () => {
  const s = A.careerSummary([{ year: 2024, ambiguous: true }, CAREER[1]], { isGK: false });
  assert.equal(s.seasons, 1);
  assert.equal(s.bestOverall.year, 2025);
  assert.equal(A.careerSummary([], {}), null);
  assert.equal(A.careerSummary([{ year: 2024, ambiguous: true }], {}), null);
});
test("career summary ties keep the earliest season, so the panel is deterministic", () => {
  const tied = [{ year: 2024, overall: 80, attack: 80, mins: 900 }, { year: 2025, overall: 80, attack: 80, mins: 900 }];
  const s = A.careerSummary(tied, { isGK: false });
  assert.equal(s.bestOverall.year, 2024);
  assert.equal(s.mostMins.year, 2024);
  assert.equal(s.peakSub.year, 2024);
});

// ── 18. goalkeeper labelling ─────────────────────────────────────────────────
test("a goalkeeper's career sub-grades are labelled with keeper terminology, over the same fields", () => {
  const gk = A.careerSubgradeLabels(true), of = A.careerSubgradeLabels(false);
  assert.deepEqual(gk.map(s => s[2]), ["Shot-Stop", "Distribution", "Command", "Sweeping", "Handling"]);
  assert.deepEqual(of.map(s => s[2]), ["Attack", "Passing", "Defense", "Creativity", "Carrying"]);
  // the underlying field mapping must be identical — only the wording changes
  assert.deepEqual(gk.map(s => s[1]), of.map(s => s[1]));
  for (const s of gk) assert.ok(!["Attack", "Passing", "Defense", "Creativity", "Carrying"].includes(s[2]), s[2] + " is not an outfield name");
});
test("a keeper's peak career skill is named with a keeper category", () => {
  const keeper = [{ year: 2025, team: "ATX", overall: 84, attack: 91, passing: 60, defense: 70, creativity: 55, carrying: 66, mins: 3443, isGK: true }];
  const s = A.careerSummary(keeper, { isGK: true });
  assert.equal(s.peakSub.label, "Shot-Stop");
  assert.notEqual(s.peakSub.label, "Attack");
});
test("the career panel picks keeper labels from the player, not from a hard-coded outfield list", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /careerSubgradeLabels\(isGK\)/, "labels are chosen by isGK");
  assert.doesNotMatch(src, /\[\["ATT","attack"\]/, "no inlined outfield-only label table remains");
});

// ── 19–21. exact-name drill-through safety ───────────────────────────────────
test("a unique exact name permits drill-through", () => {
  const idx = A.buildNameIndex([{ name: "Nkosi Tafari" }, { name: "Brad Stuver" }]);
  assert.equal(A.resolveExactName(idx.counts, "Nkosi Tafari"), "unique");
  assert.equal(A.canDrillThrough(idx.counts, "Nkosi Tafari"), true);
});
test("a missing exact name refuses drill-through", () => {
  const idx = A.buildNameIndex([{ name: "Brad Stuver" }]);
  assert.equal(A.resolveExactName(idx.counts, "Nkosi Tafari"), "none");
  assert.equal(A.canDrillThrough(idx.counts, "Nkosi Tafari"), false);
  assert.equal(A.canDrillThrough(idx.counts, "brad stuver"), false, "matching is exact, never case-insensitive or fuzzy");
  assert.equal(A.canDrillThrough(idx.counts, "Brad Stuver "), false, "and never trimmed into a match");
});
test("a duplicated exact name refuses drill-through rather than joining to one of them", () => {
  const idx = A.buildNameIndex([{ name: "Tiago", team: "NE" }, { name: "Tiago", team: "ORL" }]);
  assert.equal(idx.counts["Tiago"], 2, "the duplicate is counted, not overwritten");
  assert.equal(A.resolveExactName(idx.counts, "Tiago"), "ambiguous");
  assert.equal(A.canDrillThrough(idx.counts, "Tiago"), false);
});
test("the real 2026 cache contains a duplicate exact name, and it is refused", () => {
  const idx = seasonIndex(2026);
  assert.ok(idx, "2026 cache present");
  const dupes = Object.keys(idx.counts).filter(n => idx.counts[n] > 1);
  assert.ok(dupes.length > 0, `the cache really does contain a duplicate exact name (${dupes.join(", ")})`);
  for (const n of dupes) assert.equal(A.canDrillThrough(idx.counts, n), false, n + ": ambiguous, so no drill-through");
  assert.equal(A.canDrillThrough(idx.counts, "Nkosi Tafari"), true, "an unambiguous player is still drillable");
});
test("known regression anchors resolve the way the QA cases expect", () => {
  const y24 = seasonIndex(2024), y25 = seasonIndex(2025), y26 = seasonIndex(2026);
  assert.ok(y24 && y25 && y26);
  for (const n of ["Nkosi Tafari", "Brad Stuver"]) {
    for (const [yr, idx] of [[2024, y24], [2025, y25], [2026, y26]]) {
      assert.equal(A.resolveExactName(idx.counts, n), "unique", `${n} is unique in ${yr}`);
    }
  }
  // a single-season player: present in 2026, absent from both archive seasons
  assert.equal(A.resolveExactName(y26.counts, "Adrian Gill"), "unique");
  assert.equal(A.resolveExactName(y24.counts, "Adrian Gill"), "none");
  assert.equal(A.resolveExactName(y25.counts, "Adrian Gill"), "none");
  // and Nkosi Tafari really did change clubs, which is what the club-change row renders
  assert.notEqual(y24.byName["Nkosi Tafari"].team, y25.byName["Nkosi Tafari"].team);
});
test("src/app.jsx refuses a drill-through unless the exact name is unique in the destination season", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /canDrillThrough\(idx\.counts,name\)/, "drill eligibility is the unique-exact-name check");
  assert.match(app, /const hits=final\.filter\(x=>x\.name===pend\.name\);/, "the landing re-checks by exact name");
  assert.match(app, /setSel\(hits\.length===1\?hits\[0\]:null\);/, "and selects only on exactly one match");
  assert.doesNotMatch(app, /byName\[r\.n\]=\{overall/, "the overwrite-prone name map is gone");
});

// ── 22. chart preserves a missing-season gap ─────────────────────────────────
test("the history chart keeps a missing season as a visible gap and never interpolates across it", () => {
  const s = A.historySeries([2024, 2025, 2026], [
    { year: 2024, overall: 70 },
    { year: 2026, overall: 80 },
  ]);
  assert.deepEqual(s.years, [2024, 2025, 2026], "every season stays on the axis");
  assert.deepEqual(s.points.map(p => p.recorded), [true, false, true], "the middle season is marked as a gap");
  assert.equal(s.segments.length, 0, "no line is drawn across the gap");
});
test("consecutive recorded seasons are connected; a leading gap does not start a line", () => {
  const s = A.historySeries([2024, 2025, 2026], [{ year: 2025, overall: 70 }, { year: 2026, overall: 80 }]);
  assert.deepEqual(s.points.map(p => p.recorded), [false, true, true]);
  assert.equal(s.segments.length, 1, "the two adjacent seasons form one run");
  assert.deepEqual(s.segments[0].map(p => p.year), [2025, 2026]);
});
test("a single recorded season draws points but no line, and still shows both gaps", () => {
  const s = A.historySeries([2024, 2025, 2026], [{ year: 2026, overall: 80 }]);
  assert.equal(s.segments.length, 0);
  assert.equal(s.points.filter(p => !p.recorded).length, 2, "2024 and 2025 are explicit gaps");
});
test("an ambiguous season is a gap in the chart, not a plotted point", () => {
  const s = A.historySeries([2024, 2025, 2026], [{ year: 2024, ambiguous: true }, { year: 2026, overall: 80 }]);
  assert.equal(s.points[0].recorded, false);
  assert.equal(s.segments.length, 0);
});
test("each point carries the club and minutes needed for its tooltip and description", () => {
  const d = A.seasonDescription({ year: 2025, team: "LAFC", overall: 81, posRank: 18, posOf: 190, posGroup: "DF", mins: 2103 });
  assert.match(d, /2025/); assert.match(d, /LAFC/); assert.match(d, /Grade 81/);
  assert.match(d, /#18 of 190 defenders/); assert.match(d, /2,103 minutes/);
});

// ── 23. the comparability warning stays put ──────────────────────────────────
test("an archive season in the career panel produces a cross-season comparability warning", () => {
  const w = A.comparabilityWarning([2024, 2025], 2026);
  assert.match(w.headline, /not directly comparable/i);
  assert.match(w.detail, /2024 and 2025/);
  assert.match(w.detail, /archive seasons/);
  assert.match(w.detail, /different measurement basis/);
  assert.match(w.identity, /exact player name/);
  const one = A.comparabilityWarning([2025], 2026);
  assert.match(one.detail, /is an archive season/, "singular wording for one archive season");
  assert.equal(A.comparabilityWarning([], 2026), null, "no archive season, no warning");
});
test("the career panel renders the warning next to the history chart", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /comparabilityWarning\(archiveYears,\s*currentSeason\)/, "the panel computes the warning");
  assert.match(src, /\{warn\.headline\}/, "and renders it");
  assert.match(src, /IDENTITY_NOTE/, "the name-matching limitation is stated too");
  assert.ok(src.indexOf("SeasonHistoryChart") < src.indexOf("warn.headline"), "the chart sits above the warning");
});

// ── 24. archive Methodology gets no current-season pipeline or rank snapshot ─
test("archive mode withholds the current season's pipeline status and ranking snapshots", () => {
  const aux = { pipeStatus: { steps: { fetch: "ok" } }, rankHistory: [{ date: "2026-08-01" }] };
  const archive = A.archiveAuxiliary(2024, 2026, aux);
  assert.equal(archive.isArchive, true);
  assert.equal(archive.pipeStatus, null, "pipeline health describes the current cache only");
  assert.equal(archive.rankHistory, null, "ranking snapshots describe the current cache only");
  const current = A.archiveAuxiliary(2026, 2026, aux);
  assert.equal(current.isArchive, false);
  assert.deepEqual(current.pipeStatus, aux.pipeStatus, "the current season still gets them");
  assert.deepEqual(current.rankHistory, aux.rankHistory);
});
test("the Methodology page routes its auxiliary data through that scrub", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/pages/methodology.jsx"), "utf8");
  assert.match(src, /archiveAuxiliary\(season,currentSeason,\{pipeStatus,rankHistory\}\)/);
  assert.match(src, /pipeStatus=_aux\.pipeStatus;rankHistory=_aux\.rankHistory;/);
});
test("src/app.jsx does not even fetch current-season auxiliary data under an archive season", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
  assert.match(app, /\}else\{setRankHistory\(null\);setPipeStatus\(null\);\}/, "archive seasons clear rank history and pipeline status");
});

// ── 8 (career UI). the panel's own display conventions ───────────────────────
test("the career table's missing-season row spans every column except the season cell", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /const GAP_COLSPAN\s*=\s*HEADS\.length\s*-\s*1;/, "colspan is derived from the header count");
  assert.match(src, /colSpan=\{GAP_COLSPAN\}/, "and the gap rows use it");
  assert.doesNotMatch(src, /colSpan=\{9\}/, "the hard-coded 9-column span is gone");
  // 7 fixed columns + 5 sub-grades = 12 headers, so a gap row spans 11
  assert.equal(A.careerSubgradeLabels(false).length + 7, 12);
});
test("an unavailable career assist renders through the site's em-dash helper, not the string n/a", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  assert.match(src, /\{sv\(s\.assists\)\}/, "assists go through sv()");
  // strip comments — the design note above the component still *mentions* the old "n/a" it replaced
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ""), /"n\/a"/, "no literal n/a is ever rendered");
  const fmt = fs.readFileSync(path.join(ROOT, "src/util/format.mjs"), "utf8");
  assert.match(fmt, /export const sv = v => v==null\?"—":v;/, "sv() maps null to an em dash");
});
test("the career panel no longer takes props it does not use", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/career.jsx"), "utf8");
  const sig = src.match(/export function CareerAtAGlance\(\{([^}]*)\}\)/)[1];
  for (const dead of ["seasonCoverage", "isMobile"]) assert.ok(!sig.includes(dead), dead + " is no longer a prop");
  for (const used of ["player", "history", "allSeasons", "currentSeason", "onDrill"]) assert.ok(sig.includes(used), used + " is still needed");
});
test("the smoothing sparkline that drew a line through missing seasons is gone", () => {
  const ui = fs.readFileSync(path.join(ROOT, "src/components/ui.jsx"), "utf8");
  assert.doesNotMatch(ui, /export function SeasonSparkline/, "SeasonSparkline removed");
  const modal = fs.readFileSync(path.join(ROOT, "src/components/player-modal.jsx"), "utf8");
  assert.doesNotMatch(modal, /SeasonSparkline/, "and the modal no longer imports it");
});
