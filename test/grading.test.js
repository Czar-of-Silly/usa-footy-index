const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./_engine");
const E = load();

const base = (over = {}) => ({ id: "p", n: "X", t: "T", m: 1800, departed: false, pos: "Forward", isGK: false,
  tk90: 1, tkwPct: .5, blk90: .2, xg90: .3, xa90: .2, pc: 80, pga: .5, tga: 1, dga: .2, kp90: 1, sca90: 1, prgp90: 3, ftp90: 2,
  prs90: 10, intc90: .5, arl90: 1, drb90: 1, prgc90: 2, oxg90: .3, chc90: .5, clr90: 1, flSuf90: 1, arlPctV: 50, n90s: 20,
  gdrV: .2, escV: .2, presRV: .2, passPerfV: 0, sv90: 0, csRate: 0, gaCon90: 0, gkEff90: 0, svMls90: 0, mlsPrs90: 10, dpas90: 2,
  passPerf90: 0, dpasPct: 30, passesPctMls: 80, claim90: 0, sweep90: 0, aerWonRate: .5, ...over });
const pool = (n, over) => Array.from({ length: n }, (_, i) => base({ id: "p" + i, xg90: .1 + i * .02, oxg90: .12 + i * .019, chc90: .2 + i * .03, xa90: .05 + i * .01, kp90: .5 + i * .05, sca90: .4 + i * .06, tk90: 3 - i * .1, intc90: 1.5 - i * .04, clr90: 4 - i * .1, prs90: 8 + i * .3, pc: 70 + i * .5, ftp90: 1 + i * .1, tga: -.5 + i * .08, dga: -.3 + i * .03, gdrV: .1 + i * .02, drb90: .3 + i * .05, prgc90: 1 + i * .1, ...over }));

test("percentiles: pct is 0..1 and monotonic", () => {
  const vals = [1, 2, 3, 4, 5];
  const p = vals.map(v => E.pct(vals, v));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1]);
  assert.ok(p[0] >= 0 && p[p.length - 1] <= 1);
});

test("normPos maps loose position strings", () => {
  assert.equal(E.normPos("gk"), "Goalkeeper");
  assert.equal(E.normPos("Goalkeeper"), "Goalkeeper");
  assert.ok(/def|Def/.test(E.normPos("defense")) || E.normPos("defense") === "Defender");
});

test("top of scale: the best composite in a position can reach 99", () => {
  const ps = pool(30);
  const g = E.computeGrades(ps);
  assert.ok(Math.max(...ps.map(p => g[p.id].attack)) >= 90, "league-wide best attack near the ceiling");
});

test("grades stay within 0..99 (live scale: value-based, this season 39–99) and never NaN across a mixed pool", () => {
  const ps = pool(40);
  ps.push(base({ id: "gk", pos: "Goalkeeper", isGK: true, sv90: 3, csRate: .4, gkEff90: .2 }));
  const g = E.computeGrades(ps);
  for (const p of ps) {
    const x = g[p.id]; assert.ok(x, "grade for " + p.id);
    for (const k of ["overall", "attack", "passing", "defense"]) { assert.ok(Number.isFinite(x[k]), k + " finite for " + p.id); assert.ok(x[k] >= 0 && x[k] <= 99, k + " in range: " + x[k]); }
  }
});

test("more attacking production → higher attack sub-grade (monotonic within a pool)", () => {
  const ps = pool(30);
  const g = E.computeGrades(ps);
  const att = ps.map(p => g[p.id].attack);
  assert.ok(att[att.length - 1] > att[0], "best xG player outgrades worst");
});

test("position weighting: elite defender beats elite attacker on Overall among defenders", () => {
  const ps = pool(30, { pos: "Defender" });
  // same Goals Added (25% of a defender's Overall) so only the role-specific weights differ
  const def = base({ id: "def", pos: "Defender", tk90: 6, intc90: 3, clr90: 8, blk90: 1.5, arlPctV: 70, dga: 2, tga: 1 });
  const att = base({ id: "att", pos: "Defender", xg90: 1.2, oxg90: 1.1, chc90: 1.5, xa90: .8, tga: 1 });
  const g = E.computeGrades([...ps, def, att]);
  assert.ok(g.def.defense > g.att.defense);
  assert.ok(g.att.attack > g.def.attack);
  assert.ok(g.def.overall > g.att.overall, "defender weighting (def .30 vs att .05) favours the defensive profile: " + g.def.overall + " vs " + g.att.overall);
  // and the same two profiles labelled Forward flip the other way
  const g2 = E.computeGrades([...pool(30), { ...def, id: "def2", pos: "Forward" }, { ...att, id: "att2", pos: "Forward" }]);
  assert.ok(g2.att2.overall > g2.def2.overall, "forward weighting (att .30) favours the attacking profile");
});

test("shrinkage: tiny sample with extreme rate lands nearer the pool than a full-season equivalent", () => {
  const ps = pool(30);
  // same above-average rates; the one-game sample is pulled toward the league mean, the full season is not
  const tiny = base({ id: "tiny", xg90: .6, oxg90: .6, chc90: .9, xa90: .3, n90s: 1, m: 90 });
  const full = base({ id: "full", xg90: .6, oxg90: .6, chc90: .9, xa90: .3, n90s: 25, m: 2250 });
  const g = E.computeGrades([...ps, tiny, full]);
  assert.ok(g.full.attack > g.tiny.attack, "full season " + g.full.attack + " should outgrade the one-game sample " + g.tiny.attack);
});

test("null / missing stats do not produce NaN grades", () => {
  const ps = pool(20);
  const holes = base({ id: "holes" }); for (const k of Object.keys(holes)) if (typeof holes[k] === "number" && k !== "m" && k !== "n90s") holes[k] = null;
  const g = E.computeGrades([...ps, holes]);
  assert.ok(Number.isFinite(g.holes.overall), "overall finite with nulls: " + g.holes.overall);
});

test("goalkeepers are graded in their own pool", () => {
  const ps = pool(20);
  const gks = [1, 2, 3].map(i => base({ id: "gk" + i, pos: "Goalkeeper", isGK: true, sv90: i, csRate: i * .1, gkEff90: i * .05 }));
  const g = E.computeGrades([...ps, ...gks]);
  assert.ok(g.gk3.overall >= g.gk1.overall, "better keeper grades higher");
});
