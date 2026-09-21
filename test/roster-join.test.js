// Provider-row ownership: a source row is never assigned to more than one roster identity.
//
// Phase 6D enforced a weaker version of this — it compared claimants by display name — and the hole
// shipped: both "Tiago" rows in the live 2026 cache received the single ASA record XVqKLXRaQ0, its
// stats and its identity, despite being two distinct Opta players. These lock the stronger rule.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RJ = require("../src/data/roster-join.js");
const ROOT = path.join(__dirname, "..");
const fetchData = () => fs.readFileSync(path.join(ROOT, "fetch-data.js"), "utf8");
const cache = () => JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/mls-cache.json"), "utf8"));

// a roster row in the shape fetch-data.js builds
const rp = (name, sportec, opta) => ({ name, _mls: { sportecId: sportec, optaId: opta } });
const collect = () => { const l = []; const fn = m => l.push(m); fn.lines = l; return fn; };

// ── 1 ───────────────────────────────────────────────────────────────────────
test("one source row and two roster rows sharing a name: neither gets it by exact name", () => {
  const roster = [rp("Tiago", "MLS-OBJ-0001JY", "538023"), rp("Tiago", "MLS-OBJ-000CGT", "315206157")];
  const asa = { Tiago: { asaId: "XVqKLXRaQ0", xg: 1.72 } };
  const log = collect();
  const find = RJ.createFinder(roster, { log });
  assert.equal(find(roster[0], 0, asa), null, "the first row gets nothing");
  assert.equal(find(roster[1], 1, asa), null, "and so does the second — not 'the first one wins'");
  assert.equal(find.stats.duplicateRosterName, 2);
  assert.equal(find.stats.resolvedByName, 0);
  assert.match(log.lines[0], /carried by 2 roster players/);
});

// ── 2 ───────────────────────────────────────────────────────────────────────
test("a source player_id cannot be claimed by two distinct roster identities", () => {
  // different names, so rule 2 does not apply — this is rule 1 doing the work
  const roster = [rp("Alpha", "S1", "O1"), rp("Beta", "S2", "O2")];
  const row = { asaId: "shared-id", xg: 3 };
  const asa = { Alpha: row, Beta: row };          // the same row reachable under two names
  const log = collect();
  const find = RJ.createFinder(roster, { log });
  assert.equal(find(roster[0], 0, asa), row, "the first claimant gets it");
  assert.equal(find(roster[1], 1, asa), null, "the second is refused, not served a copy");
  assert.equal(find.stats.alreadyClaimed, 1);
  assert.match(log.lines[0], /asa:shared-id is already held by sportec:S1/);
  // and the same claimant asking twice is not a conflict
  assert.equal(find(roster[0], 0, asa), row, "re-asking is idempotent");
});

// ── 3 ───────────────────────────────────────────────────────────────────────
test("duplicate roster names are ambiguous, and the count is what decides", () => {
  const roster = [rp("Twin", "S1"), rp("Twin", "S2"), rp("Solo", "S3")];
  const src = { Twin: { asaId: "t" }, Solo: { asaId: "s" } };
  const find = RJ.createFinder(roster, {});
  // counts is a null-prototype map, so compare the entries rather than the object shape
  assert.equal(find.counts.Twin, 2);
  assert.equal(find.counts.Solo, 1);
  assert.equal(Object.keys(find.counts).length, 2);
  assert.equal(find(roster[0], 0, src), null);
  assert.equal(find(roster[1], 1, src), null);
  assert.equal(find(roster[2], 2, src).asaId, "s", "the unique name is unaffected");
});

// ── 4 ───────────────────────────────────────────────────────────────────────
test("duplicate names on the SOURCE side remain ambiguous too", () => {
  // fetch-data.js refuses these upstream: a name ASA itself maps to two player_ids never enters the
  // map, so the lookup finds nothing rather than one of them.
  const s = fetchData();
  assert.match(s, /if\(\(asaIdsByName\[n\]\|\|\[\]\)\.length>1\)\{asaDupNames\.add\(n\);continue;\}/, "an ASA name held by two ids is skipped");
  assert.match(s, /asaDupNames\.has\(rp\.name\)\?"ASA holds more than one player with this name"/, "and the row records why it has no id");
  // the lookup side then simply has no entry
  const find = RJ.createFinder([rp("Ambiguous", "S1")], {});
  assert.equal(find({ name: "Ambiguous", _mls: { sportecId: "S1" } }, 0, {}), null);
});

// ── 5 ───────────────────────────────────────────────────────────────────────
test("an ordinary unique exact-name match still works", () => {
  const roster = [rp("Denis Bouanga", "S9", "O9")];
  const asa = { "Denis Bouanga": { asaId: "abc", xg: 12 } };
  const find = RJ.createFinder(roster, {});
  assert.equal(find(roster[0], 0, asa).asaId, "abc");
  assert.equal(find.stats.resolvedByName, 1);
  assert.equal(find.stats.duplicateRosterName, 0);
  assert.equal(find.stats.alreadyClaimed, 0);
  // and a name absent from the source resolves to nothing rather than something close
  assert.equal(find(rp("Denis Bouangaa", "S8"), 1, asa), null);
});

// ── 6 ───────────────────────────────────────────────────────────────────────
test("a verified provider id on the roster row wins, and is the only thing that resolves a shared name", () => {
  const a = rp("Tiago", "S1", "O1"), b = rp("Tiago", "S2", "O2");
  const rowA = { asaId: "id-a" }, rowB = { asaId: "id-b" };
  const asa = { Tiago: rowA };
  // nothing supplies idLookup today, so a shared name resolves to nothing
  assert.equal(RJ.createFinder([a, b], {})(a, 0, asa), null);
  // given real id evidence, the shared name stops being an obstacle
  const byId = { S1: rowA, S2: rowB };
  const find = RJ.createFinder([a, b], { idLookup: r => byId[r._mls.sportecId] });
  assert.equal(find(a, 0, { x: rowA, y: rowB }), rowA);
  assert.equal(find(b, 1, { x: rowA, y: rowB }), rowB, "each resolves to its own row, not one to both");
  assert.equal(find.stats.resolvedById, 2);
  assert.equal(find.stats.duplicateRosterName, 0);
});

// ── 7 ───────────────────────────────────────────────────────────────────────
test("Opta and Sportec joins are untouched by a refused ASA name match", () => {
  const s = fetchData();
  // the MLS Opta join is by sportecId and never passes through find()
  assert.match(s, /const sid = rp\._mls && rp\._mls\.sportecId \? rp\._mls\.sportecId : null;/);
  assert.match(s, /const ms = \(sid && mlsStats\[sid\]\) \|\| \{\};/, "keyed by id, not name");
  assert.doesNotMatch(s, /mlsStats\[rp\.name\]/, "never keyed by display name");
  // and the ids block still carries them
  assert.match(s, /if\(_m\.optaId\)o\.opta=String\(_m\.optaId\)/);
  assert.match(s, /if\(_m\.sportecId\)o\.sportec=String\(_m\.sportecId\)/);
  // availability still counts an MLS-only player as available
  assert.match(s, /const available = \(hasESPN \|\| hasASA \|\| hasSofa\) && mins >= 1;/);
  assert.match(s, /const hasSofa = hasMLS;/, "so a row with only Opta data survives an ASA refusal");
});

// ── 8 ───────────────────────────────────────────────────────────────────────
test("live evidence: display names shared by several roster rows are refused by the name fallback", () => {
  // This was written around the two "Tiago" rows, and naming him tied it to one man's roster status:
  // he leaves the league and the test goes red while the identity rule it guards is still correct.
  // So it asks the cache which display names are shared rather than being told. No shared name is a
  // valid state, not a failure — tests 1 and 2 hold the rule unconditionally and without the cache.
  const P = cache().players;
  const groups = new Map();
  for (const p of P) { const g = groups.get(p.n) || []; g.push(p); groups.set(p.n, g); }
  const shared = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const sharedNames = new Set(shared.map(([n]) => n));
  const sharedRows = shared.reduce((n, [, rows]) => n + rows.length, 0);

  // Rows in a shared-name group must be separate roster identities — if two carried the same
  // provider id they would be one player listed twice, which is a different defect. Ids that are
  // absent are not compared: a group with no provider ids at all is still refused on the name alone.
  const distinct = (vals) => { const v = vals.filter(x => x != null && x !== ""); return new Set(v).size === v.length; };
  for (const [name, rows] of shared) {
    assert.ok(distinct(rows.map(r => r.sportecId)), `${name}: no two rows share a sportecId`);
    assert.ok(distinct(rows.map(r => r.optaId)), `${name}: no two rows share an optaId`);
  }

  // Replay the real roster through the real finder.
  const roster = P.map(p => ({ name: p.n, _mls: { sportecId: p.sportecId, optaId: p.optaId } }));
  const asaByName = {};
  for (const p of P) if (p.ids && p.ids.asa) asaByName[p.n] = { asaId: p.ids.asa };
  const find = RJ.createFinder(roster, {});
  const hits = roster.map((r, i) => ({ sportec: r._mls.sportecId, name: r.name, hit: find(r, i, asaByName) }));

  for (const h of hits.filter(x => sharedNames.has(x.name)))
    assert.equal(h.hit, null, `"${h.name}" is carried by more than one roster row and must not resolve by name`);

  // the invariant, over the whole live roster
  const owner = new Map();
  for (const h of hits) {
    if (!h.hit) continue;
    const prior = owner.get(h.hit.asaId);
    assert.ok(prior === undefined || prior === h.sportec, `ASA id ${h.hit.asaId} claimed by ${prior} and ${h.sportec}`);
    owner.set(h.hit.asaId, h.sportec);
  }
  assert.equal(find.stats.duplicateRosterName, sharedRows, "exactly the shared-name rows were refused, and no others");
});

// ── 9, 10, 11 ───────────────────────────────────────────────────────────────
for (const [owner, borrower, label] of [
  ["Cade Cowell", "Chance Cowell", "Cowell"],
  ["Neil Pierre", "Nelson Pierre", "Pierre"],
  ["Santiago Rodríguez", "Sebastián Rodríguez", "Rodríguez"],
]) {
  test(`${label}: the owner keeps his season and the other man gets nothing`, () => {
    // Rosters change. A name that was on an MLS roster when this guard was written can be off it a
    // fortnight later — Sebastián Rodríguez left the Houston roster in the Sept 16 data refresh —
    // and a player who is no longer in the league is not evidence of a regression. So the live-cache
    // assertions are scoped to the rows that actually exist, and each surviving row is still held to
    // the rule that applies to it. The join rule at the bottom is the real invariant and never skips.
    const P = cache().players;
    const o = P.find(p => p.n === owner), b = P.find(p => p.n === borrower);

    // whoever is still rostered is checked; contamination is only possible while the borrower exists
    if (o) assert.ok(o.ids && o.ids.asa, `${owner} carries an ASA identity`);
    if (b) {
      assert.ok(!(b.ids && b.ids.asa), `${borrower} carries none`);
      assert.equal(b.m, 0, `${borrower} has no borrowed minutes`);
      for (const f of ["g", "as", "sh", "xg", "xa", "totalGA"]) assert.equal(Number(b[f]) || 0, 0, `${borrower} ${f}`);
      assert.equal(b.available, false);
    }
    if (o && b) assert.notEqual(o.m, b.m, "and the two no longer share a stat line");

    // and the join refuses to repeat it: distinct names, one source row, one claimant
    const roster = [rp(owner, "S-own"), rp(borrower, "S-bor")];
    const row = { asaId: "the-owner-row" };
    const find = RJ.createFinder(roster, {});
    assert.equal(find(roster[0], 0, { [owner]: row }), row);
    assert.equal(find(roster[1], 1, { [owner]: row }), null, "the borrower's name is not in the map at all");
  });
}

// ── wiring ──────────────────────────────────────────────────────────────────
test("fetch-data.js uses the shared finder, and no name-keyed lookup survives", () => {
  const s = fetchData();
  assert.match(s, /const \{ createFinder \} = require\("\.\/src\/data\/roster-join\.js"\);/);
  assert.match(s, /find = createFinder\(mlsRoster, \{ nameOf: r => r && r\.name, log: m => console\.warn\(m\) \}\);/);
  // built after the roster is loaded — an empty roster would silently disable the duplicate rule
  assert.ok(s.indexOf("Loaded ${mlsRoster.length} MLS-rostered players") < s.indexOf("find = createFinder(mlsRoster"),
    "the finder is constructed after the roster is populated");
  assert.match(s, /for \(const \[rpIndex, rp\] of mlsRoster\.entries\(\)\)/, "the loop supplies a row index");
  assert.doesNotMatch(s, /find\(rp\.name,/, "no call site passes a bare name");
  assert.doesNotMatch(s, /existingPlayers\[rp\.name\]/, "the previous-cache fallback is not name-keyed either");
  assert.match(s, /existingPlayers\["sportec:" \+ p\.sportecId\]/, "it is keyed by sportecId");
  assert.match(s, /\[JOIN\] name-matched \$\{find\.stats\.resolvedByName\}/, "the run reports what it refused");
  // and the earlier hardening is still in place
  assert.doesNotMatch(s, /k\.split\(" "\)\.pop\(\) === last/, "no surname fallback");
  assert.match(s, /const \{ createGet, collectPaged \} = require\("\.\/src\/data\/http\.js"\);/, "fetch reliability untouched");
});
