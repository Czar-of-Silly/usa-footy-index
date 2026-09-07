const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./_engine");
const E = load();
const M = (o = {}) => ({ g: 0, a: 0, sh: 0, sot: 0, fl: 0, yc: 0, rc: 0, mins: 90, ha: "H", hs: 0, as: 0, opp: "X", ...o });

test("matchRating clamps to 42..99 and handles an empty row", () => {
  assert.equal(E.matchRating({}, "Forward"), 56);
  assert.equal(E.matchRating(M({ g: 5, a: 5, sot: 9 }), "Forward"), 99);
  assert.equal(E.matchRating(M({ rc: 2, fl: 9, yc: 3 }), "Forward"), 42);
});
test("attackers are unchanged by clean sheets; defenders/keepers are credited", () => {
  const cs = M({ ha: "H", hs: 1, as: 0, mins: 90 }), leak = M({ ha: "H", hs: 1, as: 3, mins: 90 });
  assert.equal(E.matchRating(cs, "Forward"), E.matchRating(leak, "Forward"));
  assert.ok(E.matchRating(cs, "Defender") > E.matchRating(leak, "Defender"));
  assert.ok(E.matchRating(cs, "Goalkeeper") > E.matchRating(cs, "Defender"), "GK gets the extra clean-sheet point");
  const away = M({ ha: "A", hs: 0, as: 2, mins: 90 }); // away side conceded 0 (home scored 0)
  assert.equal(E.matchRating(away, "Defender"), E.matchRating(M({ ha: "H", hs: 2, as: 0 }), "Defender"), "venue-aware conceded goals");
});
test("sub appearances get less minutes credit", () => {
  assert.ok(E.matchRating(M({ mins: 90 }), "Midfielder") > E.matchRating(M({ mins: 20 }), "Midfielder"));
});
test("computeForm: null on empty, 'season' basis under 8 games, 'prev' basis at 10", () => {
  assert.equal(E.computeForm([], "Forward"), null);
  const five = Array.from({ length: 5 }, () => M({ g: 1 }));
  assert.equal(E.computeForm(five, "Forward").basis, "season");
  const ten = [...Array.from({ length: 5 }, () => M({ g: 0 })), ...Array.from({ length: 5 }, () => M({ g: 1 }))];
  const f = E.computeForm(ten, "Forward");
  assert.equal(f.basis, "prev");
  assert.ok(f.delta > 0, "improving run has positive movement");
  assert.equal(f.res.length, 5); assert.equal(f.count, 10);
});
test("computeForm W-D-L and last-five sums", () => {
  const log = [M({ ha: "H", hs: 2, as: 1, g: 1 }), M({ ha: "A", hs: 1, as: 1 }), M({ ha: "A", hs: 3, as: 0, a: 1 })];
  const f = E.computeForm(log, "Midfielder");
  assert.deepEqual([f.w, f.d, f.l], [1, 1, 1]); assert.equal(f.g, 1); assert.equal(f.a, 1); assert.equal(f.mins, 270);
});
