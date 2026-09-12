// Phase 6D — provider identity, authoritative assists, re-import integrity, career joins and the
// scoped cross-season comparison. These exercise the real modules; the few source assertions only
// prove the app is wired to them.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { req } = require("./_engine");
const I = req("src/analytics/identity.mjs");
const SJ = req("src/data/source-join.mjs");
const prep = req("src/grading/prepare-player.mjs");
const engine = req("src/grading/engine.mjs");
const ROOT = path.join(__dirname, "..");
const app = () => fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
const importer = f => fs.readFileSync(path.join(ROOT, f), "utf8");

const row = (n, t, ids, extra) => ({ n, t, ids: ids || {}, ...(extra || {}) });

// ═══════════════════════════ IDENTITY ═══════════════════════════

// 1
test("a stable provider id joins the same player across seasons", () => {
  const s2024 = [row("Nkosi Tafari", "FCD", { asa: "0Oq63P32Q6" })];
  const s2026 = [row("Nkosi Tafari", "LAFC", { asa: "0Oq63P32Q6" })];
  const r = I.resolve(s2024[0], I.buildIdentityIndex(s2026));
  assert.equal(r.join, I.JOIN.PROVIDER);
  assert.equal(r.row.t, "LAFC");
  assert.equal(I.identityKey(s2024[0]), "asa:0Oq63P32Q6");
});

// 2
test("a transfer does not break identity — the club changes, the id does not", () => {
  // The real 2024->2025 data contains 124 of these. Tafari FCD -> LAFC is one.
  const before = row("Nkosi Tafari", "FCD", { asa: "0Oq63P32Q6" });
  const after = row("Nkosi Tafari", "LAFC", { asa: "0Oq63P32Q6" });
  assert.equal(I.identityKey(before), I.identityKey(after));
  const r = I.resolve(before, I.buildIdentityIndex([after, row("Someone Else", "FCD", { asa: "zzz" })]));
  assert.equal(r.join, I.JOIN.PROVIDER, "matched on the id, not the club");
  assert.equal(r.row.t, "LAFC");
});

// 3
test("a change of spelling does not break identity when the id matches", () => {
  const a = row("Dénis Bouanga", "LAFC", { asa: "abc123" });
  const b = row("Denis Bouanga", "LAFC", { asa: "abc123" });
  const r = I.resolve(a, I.buildIdentityIndex([b]));
  assert.equal(r.join, I.JOIN.PROVIDER, "the id carries the join, the accent is irrelevant");
  // and the reverse: same spelling, different ids, must NOT join
  const c = row("Denis Bouanga", "LAFC", { asa: "different" });
  assert.equal(I.resolve(a, I.buildIdentityIndex([c])).join, I.JOIN.UNRESOLVED);
});

// 4
test("two players who share a display name stay separate", () => {
  const target = [row("David Martínez", "LAFC", { asa: "eVq3jmnV5W" }), row("David Martínez", "NYC", { asa: "eVq3y6KGMW" })];
  const idx = I.buildIdentityIndex(target);
  const a = I.resolve(row("David Martínez", "LAFC", { asa: "eVq3jmnV5W" }), idx);
  assert.equal(a.join, I.JOIN.PROVIDER);
  assert.equal(a.row.t, "LAFC", "resolved to his own row, not the other man's");
  // and a row with NO id may not name-match onto either of them
  const bare = I.resolve(row("David Martínez", "SEA"), idx);
  assert.equal(bare.join, I.JOIN.AMBIGUOUS);
});

// 5
test("a provider identity claimed by two rows is refused, not arbitrated", () => {
  const idx = I.buildIdentityIndex([row("A", "X", { asa: "dup" }), row("B", "Y", { asa: "dup" })]);
  assert.equal(idx.byIdentity["asa:dup"], undefined, "a conflicted id resolves to nothing");
  assert.equal(idx.conflicts["asa:dup"], 2);
  assert.equal(I.resolve(row("A", "X", { asa: "dup" }), idx).join, I.JOIN.AMBIGUOUS);
});

// 6
test("a row with no provider identity may use the exact unique-name fallback", () => {
  const idx = I.buildIdentityIndex([row("Solo Name", "POR")]);
  const r = I.resolve(row("Solo Name", "SEA"), idx);
  assert.equal(r.join, I.JOIN.NAME);
  assert.equal(r.row.t, "POR");
});

// 7
test("an ambiguous exact-name fallback stays unresolved", () => {
  const idx = I.buildIdentityIndex([row("Twin", "A"), row("Twin", "B")]);
  assert.equal(I.resolve(row("Twin", "C"), idx).join, I.JOIN.AMBIGUOUS);
  assert.equal(I.resolve(row("Nobody", "C"), idx).join, I.JOIN.UNRESOLVED);
});

// 8
test("Tiago matches the actual provider evidence: two Opta players, one ASA record, no join", () => {
  // Opta/Sportec separate the two 2026 rows; ASA holds a single "Tiago". Nothing links the ASA
  // record to one specific Opta player, so neither row earns a cross-season identity.
  const ne = row("Tiago", "NE", { opta: "538023", sportec: "MLS-OBJ-0001JY" });
  const orl = row("Tiago", "ORL", { opta: "315206157", sportec: "MLS-OBJ-000CGT" });
  assert.equal(I.identityKey(ne), null, "an Opta id is not a cross-season identity");
  assert.equal(I.identityKey(orl), null);
  assert.deepEqual(I.localKeys(ne), { opta: "538023", sportec: "MLS-OBJ-0001JY" }, "but it does separate them within 2026");
  assert.notDeepEqual(I.localKeys(ne), I.localKeys(orl));
  // and they cannot be joined to any other season
  const idx = I.buildIdentityIndex([row("Tiago", "ORL", { asa: "XVqKLXRaQ0" })]);
  assert.equal(I.resolve(ne, idx).join, I.JOIN.AMBIGUOUS, "two same-named rows, no id: refused");
});

// ═══════════════════════════ ASSISTS ═══════════════════════════

// 9
test("the old rounded-xA synthesized assists are not reused", () => {
  const h = importer("fetch-history-v2.js");
  assert.doesNotMatch(h, /as:\s*Math\.round\(\s*xg\.xa/, "no rounded expected assists");
  assert.match(h, /as:\s*\(typeof xg\.as === "number" \? xg\.as : null\)/, "authoritative value or UNKNOWN");
  assert.match(h, /assistSrc:/, "and the row records where the number came from");
});

// 10
test("an authoritative zero stays a numeric zero, not an unknown", () => {
  const known = { as: 0, assistSrc: "asa:primary_assists" };
  assert.equal(known.as, 0);
  assert.notEqual(known.as, null);
  // and validatePlayer keeps it a zero rather than defaulting it away
  const v = prep.validatePlayer({ n: "x", t: "y", p: "Forward", m: 900, as: 0 });
  assert.equal(v.as, 0);
});

// 11
test("an unknown assist stays null on the row", () => {
  const unknown = { as: null, assistSrc: "unknown" };
  assert.equal(unknown.as, null);
  const s = app();
  assert.match(s, /const rowAssistsKnown=\(r,yr\)=>\{/, "the app asks the row, not just the season");
  assert.match(s, /return r\.assistSrc!=="unknown"&&r\.as!==null&&r\.as!==undefined;/, "and an unknown source means unknown");
});

// 12
test("assist coverage statistics are computed from per-row provenance", () => {
  const rows = [{ as: 3, assistSrc: "asa:primary_assists" }, { as: null, assistSrc: "unknown" }, { as: 0, assistSrc: "asa:primary_assists" }];
  const known = rows.filter(r => r.assistSrc !== "unknown" && r.as !== null).length;
  assert.equal(known, 2);
  assert.equal(+(100 * known / rows.length).toFixed(1), 66.7);
});

// 13
test("season-wide 'assists available' is not flipped on partial coverage", () => {
  const s = app();
  // 2024/2025 stay false at the season level; the row-level rule is what grants a value.
  assert.match(s, /const SEASON_ASSISTS_OK=\{2026:true,2025:false,2024:false\};/, "the season flag is unchanged");
  assert.match(s, /if\(r&&typeof r\.assistSrc==="string"\)/, "per-row provenance takes precedence when present");
  assert.match(s, /return SEASON_ASSISTS_OK\[yr\]!==false;/, "and a pre-6D row still falls back to the season flag");
});

// ═══════════════════════════ RE-IMPORT ═══════════════════════════

// 14
test("a candidate cache goes through the canonical validate -> prepare -> compute path", () => {
  const s = app();
  assert.match(s, /const validated=srcRows\.map\(validatePlayer\);/, "same validate");
  assert.match(s, /const inter=validated\.map\(preparePlayerForGrading\);/, "same prepare");
  assert.match(s, /const grades=computeGrades\(inter\.filter\(p=>\(p\.raw\.m\|\|0\)>=1\)\);/, "same compute, same >=1 minute gate");
  assert.equal((s.match(/computeGrades\(/g) || []).length, 2, "exactly two call sites: current season and history — no historical variant");
});

// 15
test("the grading engine files are untouched by this phase", () => {
  const eng = fs.readFileSync(path.join(ROOT, "src/grading/engine.mjs"), "utf8");
  const pp = fs.readFileSync(path.join(ROOT, "src/grading/prepare-player.mjs"), "utf8");
  assert.doesNotMatch(eng, /6D/, "no 6D edit reached the engine");
  assert.doesNotMatch(pp, /6D/, "nor prepare-player");
  assert.match(eng, /export function toG\(p\)\{return Math\.round\(42\+Math\.max\(0,Math\.min\(1,p\)\)\*57\);\}/, "grade scale unchanged");
  assert.equal(typeof engine.computeGrades, "function");
});

// 16
test("assists and xpp are not grading inputs, so correcting them cannot move a grade", () => {
  const base = { n: "x", t: "y", p: "Forward", m: 900, as: 0, xpp: 0, xg: 3, xa: 2, kp: 10 };
  const bumped = { ...base, as: 25, xpp: 88 };
  const a = prep.preparePlayerForGrading(prep.validatePlayer(base), 0);
  const b = prep.preparePlayerForGrading(prep.validatePlayer(bumped), 0);
  const strip = o => { const c = { ...o }; delete c.raw; return c; };
  assert.deepEqual(strip(a), strip(b), "the prepared engine input is identical either way");
  const ga = engine.computeGrades([a]), gb = engine.computeGrades([b]);
  assert.deepEqual(ga[a.id], gb[b.id], "and so is the grade");
});

// 17
test("provider ids survive serialization", () => {
  const r = row("X", "Y", { asa: "abc", opta: "123" });
  const back = JSON.parse(JSON.stringify(r));
  assert.deepEqual(back.ids, { asa: "abc", opta: "123" });
  assert.equal(I.identityKey(back), "asa:abc");
  const h = importer("fetch-history-v2.js"), d = importer("fetch-data.js");
  assert.match(h, /ids: \(function\(\)\{ const o = \{\}; if \(xg && xg\.asaId\) o\.asa = xg\.asaId; return o; \}\)\(\)/, "history importer writes the id");
  assert.match(d, /if\(xg&&xg\.asaId\)o\.asa=xg\.asaId/, "current importer writes it too");
});

// ═══════════════════════════ IMPORTER HARDENING ═══════════════════════════

// 18
test("the surname + first-initial matcher is gone from both importers", () => {
  for (const f of ["fetch-history-v2.js", "fetch-data.js"]) {
    const src = importer(f);
    assert.doesNotMatch(src, /k\.split\(" "\)\.pop\(\) === last/, f + " has no surname fallback");
    assert.doesNotMatch(src, /stripAccents\(kp\[kp\.length - 1\]/, f + " has no accent-folded surname fallback");
  }
});

// 19
test("a source row cannot be handed to two different roster players", () => {
  const src = [{ id: null, name: "Cade Cowell" }];
  const index = SJ.indexSource(src, r => r.name, r => r.id);
  const res = SJ.joinRoster([{ name: "Cade Cowell" }, { name: "Chance Cowell" }], index);
  assert.equal(res[0].kind, SJ.JOIN_KIND.NAME, "the exact name still resolves");
  assert.equal(res[1].kind, SJ.JOIN_KIND.UNRESOLVED, "and the other man gets nothing rather than his data");
  assert.equal(res[1].row, null);
  // the importers enforce it too
  for (const f of ["fetch-history-v2.js", "fetch-data.js"]) assert.match(importer(f), /_claim(ed|s)/, f + " tracks claims");
});

// 20
test("an exact-name source map does not silently overwrite duplicate names", () => {
  const index = SJ.indexSource([{ name: "Twin", v: 1 }, { name: "Twin", v: 2 }], r => r.name);
  assert.equal(index.byName["Twin"].length, 2, "both rows are kept");
  assert.equal(SJ.resolveOne({ name: "Twin" }, index).kind, SJ.JOIN_KIND.AMBIGUOUS, "so neither wins");
  for (const f of ["fetch-history-v2.js", "fetch-data.js"])
    assert.match(importer(f), /asaIdsByName/, f + " records every id a name maps to");
});

// 21
test("minutes are never fabricated, and the xpass field name is the real one", () => {
  const h = importer("fetch-history-v2.js");
  assert.doesNotMatch(h, /const mins = xg\.m \|\| 600;/, "the 600-minute default is gone");
  assert.match(h, /const mins = Number\(xg\.m\) > 0 \? Number\(xg\.m\) : null;/);
  assert.match(h, /skippedNoMinutes\+\+; continue;/, "a row with no minutes is skipped, not invented");
  assert.doesNotMatch(h, /pass_completion_percentage_expected/, "the field that does not exist is gone");
  assert.match(h, /p\.xpass_completion_percentage/, "and the real one is read");
  assert.equal(SJ.mins(null, undefined, 0, ""), null, "the helper refuses to invent a value");
  assert.equal(SJ.mins(null, 900), 900);
  assert.equal(SJ.known(undefined), null);
  assert.equal(SJ.known(0), 0, "an observed zero is not an unknown");
});

// ═══════════════════════════ CAREER ═══════════════════════════

// 22
test("the career join prefers provider identity over the name", () => {
  const s = app();
  assert.match(s, /if\(idx\.idIndex&&identityKey\(p\)\)\{\/\*6D-CAREERJOIN\*\//, "identity is tried first");
  assert.match(s, /if\(r\.join===JOIN\.PROVIDER\)\{seasons\.push\(\{year:yr,\.\.\.r\.row,join:"provider-id"\}\);return;\}/);
});

// 23
test("the exact-name fallback is a documented fallback, and never overrides contrary id evidence", () => {
  const s = app();
  const i = s.indexOf("/*6D-CAREERJOIN*/"), j = s.indexOf("/*6B.1-JOIN*/");
  assert.ok(i > 0 && j > i, "the identity branch precedes the name branch");
  assert.match(s, /const status=resolveExactName\(idx\.counts,p\.name\);/, "the name path survives for id-less rows");

  // A row with an id, looking into a season whose matching row has NO id (303 of the 1008 2026 rows
  // are reserve/academy players ASA never covers). The name is the only evidence there is, so the
  // link is kept — and labelled as a name join, not dressed up as a provider match.
  const noId = I.resolve(row("Same Name", "A", { asa: "not-in-target" }), I.buildIdentityIndex([row("Same Name", "B")]));
  assert.equal(noId.join, I.JOIN.NAME);
  assert.equal(noId.row.t, "B");
  assert.match(noId.reason, /carries no id of its own/);

  // But when the target row DOES carry a different verified identity, these are two people the
  // sources can tell apart, and a shared spelling proves nothing.
  const contrary = I.resolve(row("Same Name", "A", { asa: "mine" }), I.buildIdentityIndex([row("Same Name", "B", { asa: "theirs" })]));
  assert.equal(contrary.join, I.JOIN.AMBIGUOUS, "contrary id evidence beats a matching name");
  assert.equal(contrary.row, null);

  // And a name that matches nothing stays unresolved rather than reaching for something close.
  assert.equal(I.resolve(row("Nobody Here", "A", { asa: "x" }), I.buildIdentityIndex([row("Someone Else", "B")])).join, I.JOIN.UNRESOLVED);
});

// 24
test("a duplicate-name collision is impossible once identity is present", () => {
  const target = [row("Twin", "A", { asa: "1" }), row("Twin", "B", { asa: "2" })];
  const idx = I.buildIdentityIndex(target);
  assert.equal(I.resolve(row("Twin", "X", { asa: "1" }), idx).row.t, "A");
  assert.equal(I.resolve(row("Twin", "X", { asa: "2" }), idx).row.t, "B");
  assert.equal(I.resolve(row("Twin", "X"), idx).join, I.JOIN.AMBIGUOUS);
});

// 25
test("a drill-through opens the destination season's own row for that identity", () => {
  const s2026 = [row("Player One", "LAFC", { asa: "id1" }, { overall: 88 })];
  const s2024 = [row("Player One", "FCD", { asa: "id1" }, { overall: 71 })];
  const hit = I.resolve(s2026[0], I.buildIdentityIndex(s2024));
  assert.equal(hit.join, I.JOIN.PROVIDER);
  assert.equal(hit.row.overall, 71, "the archive season's numbers, not the current ones");
  assert.equal(hit.row.t, "FCD");
});

// ═══════════════════════════ CROSS-SEASON COMPARE ═══════════════════════════

// 26
test("the same canonical identity can be compared across several seasons", () => {
  const anchor = row("Nkosi Tafari", "LAFC", { asa: "0Oq63P32Q6" }, { overall: 80 });
  const seasons = {
    2024: [row("Nkosi Tafari", "FCD", { asa: "0Oq63P32Q6" }, { overall: 72 })],
    2025: [row("Nkosi Tafari", "LAFC", { asa: "0Oq63P32Q6" }, { overall: 77 })],
    2026: [anchor],
  };
  const r = I.samePlayerAcrossSeasons(anchor, [2024, 2025, 2026], seasons, () => ({ gk: false }));
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map(x => x.row && x.row.overall), [72, 77, 80]);
  assert.ok(r.rows.every(x => x.join === I.JOIN.PROVIDER), "every season joined on the id");
});

// 27
test("two different identities are refused for cross-season comparison", () => {
  const a = row("A", "X", { asa: "1" }), b = row("B", "Y", { asa: "2" });
  assert.equal(I.canCompareAcrossSeasons(a, b).ok, false);
  assert.equal(I.canCompareAcrossSeasons(a, b).refused, I.COMPARE_REFUSED.DIFFERENT_PLAYERS);
  assert.equal(I.canCompareAcrossSeasons(a, a).ok, true);
  // and a player with no stable identity cannot be compared at all
  assert.equal(I.canCompareAcrossSeasons(row("C", "Z"), row("C", "Z")).refused, I.COMPARE_REFUSED.NO_IDENTITY);
  assert.equal(I.samePlayerAcrossSeasons(row("C", "Z"), [2024], {}).refused, I.COMPARE_REFUSED.NO_IDENTITY);
});

// 28
test("a metric the archive never measured stays unavailable rather than becoming zero", () => {
  const anchor = row("K", "X", { asa: "k1" }, { overall: 60 });
  const seasons = { 2024: [row("K", "X", { asa: "k1" }, { overall: 55, sv: null })], 2026: [anchor] };
  const r = I.samePlayerAcrossSeasons(anchor, [2024, 2026], seasons, y => ({ gk: y !== 2024 }));
  assert.equal(r.rows[0].row.sv, null, "no substituted zero");
  assert.equal(r.coverage[0].gk, false);
  assert.equal(r.coverage[1].gk, true);
  assert.equal(I.coverageDiffers(r.coverage[0], r.coverage[1]), true);
});

// 29
test("a coverage warning is produced whenever the seasons were measured differently", () => {
  const w = I.coverageWarning([2024, 2026], [{ year: 2024, gk: false, assists: false }, { year: 2026, gk: true, assists: true }]);
  assert.ok(w && w.length > 0);
  assert.match(w, /2024 has no gk, assists/);
  assert.match(w, /recorded difference, not an improvement or a decline/);
  assert.equal(I.coverageWarning([2026], [{ year: 2026, gk: true }]), null, "no warning when nothing is missing");
});

// 30
test("a grade gap is reported as a recorded difference, never as improvement or decline", () => {
  const up = I.gradeDifference(70, 80), down = I.gradeDifference(80, 70), same = I.gradeDifference(75, 75);
  assert.equal(up.label, "recorded grade difference +10");
  assert.equal(down.label, "recorded grade difference -10");
  assert.equal(same.label, "recorded grade difference 0");
  for (const r of [up, down, same]) {
    assert.doesNotMatch(r.label, /improv|declin|better|worse|regress|progress/i);
  }
  assert.equal(I.gradeDifference(null, 80).known, false);
  assert.equal(I.gradeDifference(null, 80).label, "—", "unknown renders as an em dash");
  const s = app();
  assert.match(s, /const recordedGradeDifference=gradeDifference;/, "the app uses the same neutral wording");
});
