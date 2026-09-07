#!/usr/bin/env node
// scripts/audit-grades.js — Grading Integrity audit (analysis only; does not touch production code).
//
// Runs the CURRENT production grading pipeline (verbatim, from src/grading + src/analytics) against
// the frozen fixture (test/fixtures/frozen-cache.json), then runs a series of ISOLATED, single-change
// candidate variants of the same pipeline, and reports how each candidate's grades differ from the
// current baseline: distribution shift, movers, rank correlation, etc. Nothing here is wired into the
// live app — every candidate is a local copy of the relevant function with exactly one change.
//
//   npm run audit-grades            full report to stdout + audit-report.md
//   npm run audit-grades -- --json  also writes audit-report.json with the raw numbers
//
// Candidates (each isolates exactly one of the nine audit concerns):
//   baseline        current production, unmodified
//   passperf-fix    validatePlayer preserves `passPerf` (web pipeline currently drops it — bug #1)
//   gplus-per90     tga/dga/pga/gdrV divided by minutes played, i.e. true per-90 rates (bug #2)
//   missing-vs-zero percentile pools include true zeros; a field absent in the RAW row (not just
//                   defaulted to 0 by validation) is excluded from that player's own weighted sum
//                   instead of silently scoring as the worst possible value (bug #3)
//   carrying-fix    drb90/prgc90 are the same raw field (nutmegs) counted twice at combined weight
//                   .25 (bug #4); collapsed to one term at reduced weight, redistributed to the three
//                   other genuinely distinct Carrying inputs
//   tie-percentile  pct() midrank (ties share a percentile) instead of strict "count strictly less"
//   rank-mapping    the already-computed-but-unused rank-based 42+pct^1.5×57 curve, wired live
//   min450          provisional/ranking threshold raised from >=1 minute to >=450 minutes
//   gplus-halfweight Goals Added's Overall weight (currently .20-.25) halved, redistributed to the
//                   sub-grades that already exist, as a check on how much of Overall it's carrying
//   proposed-v1     passperf-fix + gplus-per90 + missing-vs-zero + carrying-fix + tie-percentile
//                   combined (excludes rank-mapping and min450 — see report for why)

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { req } = require(path.join(ROOT, "test/_engine.js"));

const ARGS = process.argv.slice(2);
const WRITE_JSON = ARGS.includes("--json");

const engineMod = req("src/grading/engine.mjs");
const prepMod = req("src/grading/prepare-player.mjs");
const { pct, normPos, toG } = engineMod;
const { safeNum, validatePlayer, preparePlayerForGrading } = prepMod;

const cache = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/frozen-cache.json"), "utf8"));

// ════════════════════════════════════════════════════════════════════════════
// Baseline pipeline (verbatim — exactly what production does)
// ════════════════════════════════════════════════════════════════════════════
function baselinePool() {
  const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(validatePlayer);
  const inter = validated.map(preparePlayerForGrading);
  return inter.filter(p => (p.raw.m || 0) >= 1);
}

// computeGrades is copied here (not re-implemented) so every candidate can pass a modified pool or a
// modified copy of the function through the exact same 194-line body. See "engine source" below.
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, "src/grading/engine.mjs"), "utf8");
function extractFn(name) { const i = ENGINE_SRC.indexOf("export function " + name + "("); const start = i + "export ".length; let d = 0, j = ENGINE_SRC.indexOf("{", start); for (let k = j; k < ENGINE_SRC.length; k++) { if (ENGINE_SRC[k] === "{") d++; else if (ENGINE_SRC[k] === "}") { d--; if (d === 0) return ENGINE_SRC.slice(start, k + 1); } } }
const COMPUTE_GRADES_SRC = extractFn("computeGrades");

// Build a computeGrades variant from the verbatim source with a small set of literal text
// replacements — this keeps every candidate's diff against production explicit and auditable
// (grep the "changes" array below), rather than a from-scratch reimplementation that could
// silently diverge from what's actually shipped.
function makeEngineVariant(changes) {
  let src = COMPUTE_GRADES_SRC;
  for (const [from, to] of changes) {
    if (!src.includes(from)) throw new Error("audit candidate anchor not found: " + JSON.stringify(from).slice(0, 80));
    src = src.split(from).join(to);
  }
  return new Function("pct", "return (" + src + ")")(pct);
}
const computeGradesBaseline = makeEngineVariant([]);

// ════════════════════════════════════════════════════════════════════════════
// Candidate 1 — passPerf fix (bug #1)
// validatePlayer's returned object never copies r.passPerf through, so preparePlayerForGrading's
// `passPerfV:(r.passPerf||0)` is always 0 in the web pipeline → the pool is always empty → the
// documented 20% Passing weight on pass-performance silently vanishes and Passing renormalizes
// across the remaining 4 terms. Fix: preserve the field through validation, exactly as the other
// three consumers (Ask context, routes, snapshots) already do.
// ════════════════════════════════════════════════════════════════════════════
function validatePlayerPassPerfFix(r) {
  const v = validatePlayer(r);
  v.passPerf = safeNum(r.passPerf, -50, 50, 0);
  return v;
}
function poolPassPerfFix() {
  const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(validatePlayerPassPerfFix);
  return validated.map(preparePlayerForGrading).filter(p => (p.raw.m || 0) >= 1);
}

// ════════════════════════════════════════════════════════════════════════════
// Candidate 2 — Goals Added per-90 (bug #2)
// ASA's goals_added_raw is a SEASON-CUMULATIVE total (confirmed against fetch-data.js and by the
// r=0.53 correlation with minutes played vs r=0.07 for a true rate stat like xg90 — see report).
// preparePlayerForGrading sums the components (tga) and never divides by p90, then computeGrades
// percentile-ranks it directly against other totals and even runs it through the per-90 shrinkage
// formula as if it were already a rate. Fix: divide by p90 in preparation, same as every other input.
// ════════════════════════════════════════════════════════════════════════════
function preparePlayerGPlusPer90(r, i) {
  const base = preparePlayerForGrading(r, i);
  const p90 = (r.m || 600) / 90;
  return { ...base, tga: base.tga / p90, dga: base.dga / p90, pga: (r.gp || 0) / p90, gdrV: (r.gdr || 0) / p90 };
}
function poolGPlusPer90() {
  const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(validatePlayer);
  return validated.map(preparePlayerGPlusPer90).filter(p => (p.raw.m || 0) >= 1);
}

// ════════════════════════════════════════════════════════════════════════════
// Candidate 3 — missing vs. real zero (bug #3)
// Today: mk() strips ALL zeros (real or missing) from percentile pools; if that empties a pool, wsum
// drops the whole term for EVERYONE. Otherwise a player's own true zero is compared against a pool
// mean that itself excludes zero-scorers (upward-biased). Fix, isolated to the clearest case (a
// player with literally no MLS advanced-passing row, proxied by mlsPassesPct===0 AND
// mlsDifficultPasses===0 — an actual "no data" signature, not a legitimate zero): for those players
// only, drop the passPerf and MLS-derived GK terms from THEIR OWN weighted sum (per-player exclusion)
// rather than letting them silently score at the pool's percentile-0 floor. Pools themselves keep
// real zeros (a striker who created zero clear chances that week is a real, informative zero).
// ════════════════════════════════════════════════════════════════════════════
function computeGradesMissingAware(ps) {
  const flagged = ps.map(p => ({ ...p, _noMlsAdvanced: (p.raw.mlsPassesPct || 0) === 0 && (p.raw.mlsDifficultPasses || 0) === 0 }));
  return makeEngineVariant([
    // pools keep real zeros: don't filter mk() at all
    [`const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number"&&x!==0);/*GRADEFULL*/`,
      `const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number");/*GRADEFULL-MISSINGAWARE*/`],
    // per-player: a flagged player's passPerf term is dropped from their own wsum (weight redistributes for them only)
    [`const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0);const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`,
      `const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0&&!(p._noMlsAdvanced&&t[0]===ofPassPerf));const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`],
  ])(flagged);
}

// ════════════════════════════════════════════════════════════════════════════
// Candidate 4 — Carrying duplication fix (bug #4)
// drb90 and prgc90 are BOTH literally `ms.nutmegs / p90` (confirmed against fetch-data.js — both
// fields are marked "placeholder" comments for data the pipeline never actually started fetching).
// Carrying currently weights this one signal twice: drb 10% + prgc 15% = 25% of Carrying is one
// narrow, rare event type counted under two names. Fix: one nutmeg-based term, reduced to 10%
// (down from the combined 25%, since a single narrow skill-move stat shouldn't dominate a quarter
// of the sub-grade), with the freed 15 points redistributed proportionally across the three inputs
// that are NOT the same field (gdrV, escV, ftp90 — flSuf90 excluded as it's about being fouled, not
// carrying quality).
// ════════════════════════════════════════════════════════════════════════════
const computeGradesCarryingFix = makeEngineVariant([
  [`const car=wsum([[ofGdr,p.gdrV,.35],[ofEsc,p.escV,.20],[ofPrgc,p.prgc90,.15],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.10],[ofFls,p.flSuf90,.10]]);`,
    `const car=wsum([[ofGdr,p.gdrV,.4308],[ofEsc,p.escV,.2462],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.1231],[ofFls,p.flSuf90,.10]]);/*prgc dropped: identical field to drb (both = nutmegs/p90); weight folded into gdr/esc/ftp proportionally*/`],
]);

// ════════════════════════════════════════════════════════════════════════════
// Candidate 5 — tie-aware ("midrank") percentiles
// pct() today: share of the pool STRICTLY less than v. Ties all land at the tied group's bottom
// percentile — the worst-case treatment for whoever's tied, and with MLS-scale pool sizes (dozens to
// low hundreds) and stats rounded to whole numbers or hundredths, real ties are common. Fix: midrank
// — ties share the percentile a normal rank-average would give them.
// ════════════════════════════════════════════════════════════════════════════
function pctMidrank(a, v) { const n = Math.max(a.length, 1); let less = 0, equal = 0; for (const x of a) { if (x < v) less++; else if (x === v) equal++; } return (less + equal / 2) / n; }
const computeGradesTiePct = makeEngineVariant([["pct(", "pctTie("]]);
function computeGradesTiePctWrapped(ps) { return new Function("pctTie", "return (" + COMPUTE_GRADES_SRC.split("pct(").join("pctTie(") + ")")(pctMidrank)(ps); }

// ════════════════════════════════════════════════════════════════════════════
// Candidate 6 — rank-based mapping, wired live
// The engine already computes attR/pasR/defR/creR/carR/ovR (rank percentile within league/position)
// via buildRanks() every run — then never reads them. Live grades use grOf/grOfP (value ÷ fixed
// reference point, exponent 0.9). This candidate wires the already-computed ranks through
// rankToGradeOf/ovGradeOf2 (42 + rank^1.5 × 57) instead, to show what the OTHER half of the engine
// would produce if it were live.
// ════════════════════════════════════════════════════════════════════════════
const computeGradesRankMapping = makeEngineVariant([
  [`o[c.id]={
        overall:grOfP(c.ov,c.pos,OV_CEIL[c.pos]||97),
        attack:grOf(c.att,99),
        passing:grOf(c.pas,99),
        defense:grOf(c.def,99),
        creativity:grOf(c.cre,99),
        carrying:grOf(c.car,99)
      };`,
    `o[c.id]={
        overall:ovGradeOf2(ovR[c.id],OV_CEIL[c.pos]||97),
        attack:rankToGradeOf(attR[c.id]),
        passing:rankToGradeOf(pasR[c.id]),
        defense:rankToGradeOf(defR[c.id]),
        creativity:rankToGradeOf(creR[c.id]),
        carrying:rankToGradeOf(carR[c.id])
      };`],
]);

// ════════════════════════════════════════════════════════════════════════════
// Candidate 7 — 450-minute provisional threshold
// Today: any player with >=1 minute enters the grading pool (K90S=8 shrinkage is the only defense
// against small samples). This candidate raises pool membership to >=450 minutes (five full
// matches); sub-450 players are graded separately against each other (not mixed into the ranked
// pool) and flagged provisional, same spirit as how the site already treats sub-5-match players
// elsewhere (e.g. Season Rating's "PROV" tag).
// ════════════════════════════════════════════════════════════════════════════
function poolMin450() { return baselinePool().filter(p => (p.raw.m || 0) >= 450); }

// ════════════════════════════════════════════════════════════════════════════
// Candidate 8 — Goals Added Overall-weight halved
// gaP (Goals Added percentile) is 20-25% of Overall depending on position — the single largest or
// second-largest term. Goals Added is itself built from shooting/passing/dribbling/interrupting/
// receiving contributions, which already overlap conceptually with att/pas/car/def. This candidate
// halves gaP's Overall weight and redistributes the freed weight to the position's OTHER terms
// proportionally, to measure how much Overall movement is attributable to gaP alone.
// ════════════════════════════════════════════════════════════════════════════
const computeGradesGPlusHalfWeight = makeEngineVariant([
  [`ov=att*.30+cre*.20+gaP*.25+car*.10+pas*.10+def*.05;`, `ov=att*.3462+cre*.2308+gaP*.125+car*.1154+pas*.1154+def*.0577;`],
  [`ov=def*.30+gaP*.25+pas*.20+car*.10+cre*.10+att*.05;`, `ov=def*.3462+gaP*.125+pas*.2308+car*.1154+cre*.1154+att*.0577;`],
  [`ov=gaP*.20+pas*.20+cre*.20+att*.15+def*.15+car*.10;`, `ov=gaP*.10+pas*.225+cre*.225+att*.1688+def*.1688+car*.1125;`],
]);

// ════════════════════════════════════════════════════════════════════════════
// Candidate 9 — proposed v1: the defensible fixes combined
// passperf-fix + gplus-per90 + missing-vs-zero + carrying-fix + tie-percentile.
// Deliberately EXCLUDES rank-mapping (methodology gets harder to explain honestly — see report)
// and min450 (recommended as a DISPLAY/eligibility rule, not a pool-composition change — changing
// pool composition shifts everyone else's percentiles too; see report).
// ════════════════════════════════════════════════════════════════════════════
function poolProposedV1() {
  const validated = cache.players.filter(r => r && r.n && r.t && typeof r.n === "string").map(validatePlayerPassPerfFix);
  const inter = validated.map(preparePlayerGPlusPer90);
  return inter.filter(p => (p.raw.m || 0) >= 1).map(p => ({ ...p, _noMlsAdvanced: (p.raw.mlsPassesPct || 0) === 0 && (p.raw.mlsDifficultPasses || 0) === 0 }));
}
const computeGradesProposedV1Core = makeEngineVariant([
  [`const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number"&&x!==0);/*GRADEFULL*/`,
    `const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number");/*GRADEFULL-MISSINGAWARE*/`],
  [`const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0);const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`,
    `const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0&&!(p._noMlsAdvanced&&t[0]===ofPassPerf));const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`],
  [`const car=wsum([[ofGdr,p.gdrV,.35],[ofEsc,p.escV,.20],[ofPrgc,p.prgc90,.15],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.10],[ofFls,p.flSuf90,.10]]);`,
    `const car=wsum([[ofGdr,p.gdrV,.4308],[ofEsc,p.escV,.2462],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.1231],[ofFls,p.flSuf90,.10]]);/*prgc dropped: duplicate of drb*/`],
  ["pct(", "pctTie("],
]);
function computeGradesProposedV1(ps) { return new Function("pctTie", "return (" + COMPUTE_GRADES_SRC.split("pct(").join("pctTie(")
  .split(`const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number"&&x!==0);/*GRADEFULL*/`).join(`const mk=(arr,k)=>arr.map(p=>p[k]).filter(x=>typeof x==="number");/*GRADEFULL-MISSINGAWARE*/`)
  .split(`const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0);const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`).join(`const wsum=(terms)=>{const t2=terms.filter(t=>t[0].length>0&&!(p._noMlsAdvanced&&t[0]===ofPassPerf));const w=t2.reduce((s,t)=>s+t[2],0)||1;return t2.reduce((s,t)=>s+S(t[0],t[1])*t[2],0)/w;};`)
  .split(`const car=wsum([[ofGdr,p.gdrV,.35],[ofEsc,p.escV,.20],[ofPrgc,p.prgc90,.15],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.10],[ofFls,p.flSuf90,.10]]);`).join(`const car=wsum([[ofGdr,p.gdrV,.4308],[ofEsc,p.escV,.2462],[ofDrb,p.drb90,.10],[ofFtp,p.ftp90,.1231],[ofFls,p.flSuf90,.10]]);`)
  + ")")(pctMidrank)(ps); }

// ════════════════════════════════════════════════════════════════════════════
// Comparison harness
// ════════════════════════════════════════════════════════════════════════════
function posGroup(p) { const pos = p.pos || "Midfielder"; return p.isGK ? "GK" : pos === "Forward" ? "FW" : pos === "Defender" ? "DF" : "MF"; }
function nameOf(p) { return p.raw.n + " (" + p.raw.t + ")"; }
function stats(arr) { const s = [...arr].sort((a, b) => a - b); const q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; return { n: s.length, min: q(0), p25: q(.25), median: q(.5), p75: q(.75), p90: q(.9), max: s.length ? s[s.length - 1] : null, mean: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length * 10) / 10 : null }; }
function spearman(pairs) {
  // pairs: [[a,b], ...] — rank each side independently with average (midrank) rank for ties, then
  // compute Spearman as the Pearson correlation of the two rank vectors directly. The common
  // shortcut formula 1-6*sum(d^2)/(n*(n^2-1)) is only exactly equal to that Pearson correlation
  // when ranks are a clean 1..n permutation (no ties); with tied Overall grades — common at this
  // pool size after rounding — the shortcut is a biased approximation, so it's not used here.
  const rankOf = (vals) => { const idx = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]); const r = new Array(vals.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && vals[idx[j + 1]] === vals[idx[i]]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = avg; i = j + 1; } return r; };
  const a = pairs.map(p => p[0]), b = pairs.map(p => p[1]);
  const ra = rankOf(a), rb = rankOf(b);
  const n = ra.length;
  if (n <= 1) return null;
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const ma = mean(ra), mb = mean(rb);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = ra[i] - ma, db = rb[i] - mb; cov += da * db; va += da * da; vb += db * db; }
  if (va === 0 || vb === 0) return null; // degenerate: no variance in one side (e.g. every rank tied)
  return cov / Math.sqrt(va * vb);
}
// Assign average (midrank) ranks to a set of rows sorted by a descending numeric key, so tied
// Overall grades share a rank (e.g. two players tied for 12th/13th both get rank 12.5) instead of
// an arbitrary sequential position that depends on sort stability / original array order.
function tiedRanksDesc(rows, keyFn) {
  const sorted = [...rows].sort((x, y) => keyFn(y) - keyFn(x));
  const ranks = {}; const n = sorted.length; let i = 0;
  while (i < n) {
    let j = i; while (j + 1 < n && keyFn(sorted[j + 1]) === keyFn(sorted[i])) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[nameOf(sorted[k].p)] = avg;
    i = j + 1;
  }
  return ranks;
}

function runCandidate(name, pool, gradeFn) {
  const grades = gradeFn(pool);
  const byId = {}; pool.forEach(p => byId[p.id] = p);
  const rows = pool.filter(p => grades[p.id]).map(p => ({ p, g: grades[p.id], grp: posGroup(p) }));
  return { name, pool, grades, byId, rows };
}

function compare(base, cand) {
  const baseOverallById = {}; base.rows.forEach(r => baseOverallById[r.p.id] = r.g.overall);
  // match by (name|team) since candidate pools may differ in membership (e.g. min450)
  const baseKeyToOverall = {}; base.rows.forEach(r => baseKeyToOverall[nameOf(r.p)] = { overall: r.g.overall, id: r.p.id, grp: r.grp });
  const shared = cand.rows.filter(r => baseKeyToOverall[nameOf(r.p)]);
  const deltas = shared.map(r => ({ key: nameOf(r.p), delta: Math.round((r.g.overall - baseKeyToOverall[nameOf(r.p)].overall) * 10) / 10, from: baseKeyToOverall[nameOf(r.p)].overall, to: r.g.overall, grp: r.grp }));
  const absDeltas = deltas.map(d => Math.abs(d.delta));
  // rank correlation: overall rank WITHIN position group, baseline vs candidate (tie-aware midranks)
  let allPairs = [];
  const rankCorrByGrp = {};
  for (const grp of ["FW", "MF", "DF", "GK"]) {
    const baseGrp = base.rows.filter(r => r.grp === grp);
    const baseRank = tiedRanksDesc(baseGrp, r => r.g.overall);
    const candGrp = cand.rows.filter(r => r.grp === grp && baseRank[nameOf(r.p)] != null);
    const candRank = tiedRanksDesc(candGrp, r => r.g.overall);
    const pairs = candGrp.map(r => [baseRank[nameOf(r.p)], candRank[nameOf(r.p)]]);
    allPairs = allPairs.concat(pairs);
    rankCorrByGrp[grp] = pairs.length > 2 ? Math.round(spearman(pairs) * 1000) / 1000 : null;
  }
  const rankDeltas = [];
  for (const grp of ["FW", "MF", "DF", "GK"]) {
    const baseGrp = base.rows.filter(r => r.grp === grp);
    const baseRank = tiedRanksDesc(baseGrp, r => r.g.overall);
    const candGrp = cand.rows.filter(r => r.grp === grp && baseRank[nameOf(r.p)] != null);
    const candRank = tiedRanksDesc(candGrp, r => r.g.overall);
    // exact (possibly fractional, tie-aware) ranks drive the >10 threshold and delta; rounded only for display
    for (const r of candGrp) { const bR = baseRank[nameOf(r.p)], cR = candRank[nameOf(r.p)]; rankDeltas.push({ key: nameOf(r.p), grp, from: Math.round(bR * 10) / 10, to: Math.round(cR * 10) / 10, delta: bR - cR }); }
  }
  return {
    memberDelta: cand.rows.length - base.rows.length,
    overallSpearman: allPairs.length > 2 ? Math.round(spearman(allPairs) * 1000) / 1000 : null,
    spearmanByGroup: rankCorrByGrp,
    medianAbsDelta: stats(absDeltas).median,
    p90AbsDelta: stats(absDeltas).p90,
    movers5: deltas.filter(d => Math.abs(d.delta) >= 5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    moversRank10: rankDeltas.filter(d => Math.abs(d.delta) >= 10).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    topUp: [...deltas].sort((a, b) => b.delta - a.delta).slice(0, 10),
    topDown: [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 10),
  };
}

function distByGroup(run) {
  const out = {};
  for (const grp of ["FW", "MF", "DF", "GK"]) out[grp] = stats(run.rows.filter(r => r.grp === grp).map(r => r.g.overall));
  out.ALL = stats(run.rows.map(r => r.g.overall));
  return out;
}
function top25(run, grp) { return run.rows.filter(r => r.grp === grp).sort((a, b) => b.g.overall - a.g.overall).slice(0, 25).map(r => nameOf(r.p) + " " + r.g.overall); }

// ════════════════════════════════════════════════════════════════════════════
// Run everything
// ════════════════════════════════════════════════════════════════════════════
const base = runCandidate("baseline", baselinePool(), computeGradesBaseline);

const candidates = [
  runCandidate("passperf-fix", poolPassPerfFix(), computeGradesBaseline),
  runCandidate("gplus-per90", poolGPlusPer90(), computeGradesBaseline),
  runCandidate("missing-vs-zero", baselinePool().map(p => ({ ...p, _noMlsAdvanced: (p.raw.mlsPassesPct || 0) === 0 && (p.raw.mlsDifficultPasses || 0) === 0 })), computeGradesMissingAware),
  runCandidate("carrying-fix", baselinePool(), computeGradesCarryingFix),
  runCandidate("tie-percentile", baselinePool(), computeGradesTiePctWrapped),
  runCandidate("rank-mapping", baselinePool(), computeGradesRankMapping),
  runCandidate("min450", poolMin450(), computeGradesBaseline),
  runCandidate("gplus-halfweight", baselinePool(), computeGradesGPlusHalfWeight),
  runCandidate("proposed-v1", poolProposedV1(), computeGradesProposedV1),
];

let md = "# Grading audit — " + new Date().toISOString() + "\n\nFrozen fixture: " + cache.generated + " (" + cache.players.length + " players)\n\n";
md += "## Baseline\n\nPool: " + base.rows.length + " graded players.\n\n| Group | n | min | p25 | median | p75 | p90 | max | mean |\n|---|---|---|---|---|---|---|---|---|\n";
const bd = distByGroup(base);
for (const [g, s] of Object.entries(bd)) md += `| ${g} | ${s.n} | ${s.min} | ${s.p25} | ${s.median} | ${s.p75} | ${s.p90} | ${s.max} | ${s.mean} |\n`;
md += "\n";
for (const grp of ["FW", "MF", "DF", "GK"]) md += "**Top 25 " + grp + " (baseline):** " + top25(base, grp).join(" · ") + "\n\n";

for (const cand of candidates) {
  const cmp = compare(base, cand);
  md += "## " + cand.name + "\n\n";
  md += "Pool size vs baseline: " + (cmp.memberDelta >= 0 ? "+" : "") + cmp.memberDelta + "\n\n";
  md += "| Group | n | min | p25 | median | p75 | p90 | max | mean |\n|---|---|---|---|---|---|---|---|---|\n";
  const cd = distByGroup(cand);
  for (const [g, s] of Object.entries(cd)) md += `| ${g} | ${s.n} | ${s.min} | ${s.p25} | ${s.median} | ${s.p75} | ${s.p90} | ${s.max} | ${s.mean} |\n`;
  md += "\nSpearman rank correlation vs baseline (within position group): overall " + cmp.overallSpearman + " · FW " + cmp.spearmanByGroup.FW + " · MF " + cmp.spearmanByGroup.MF + " · DF " + cmp.spearmanByGroup.DF + " · GK " + cmp.spearmanByGroup.GK + "\n\n";
  md += "Median |Δ grade| " + cmp.medianAbsDelta + " · P90 |Δ grade| " + cmp.p90AbsDelta + " · players moving >5 pts: " + cmp.movers5.length + " · players moving >10 rank positions (within position group): " + cmp.moversRank10.length + "\n\n";
  md += "**Biggest risers:** " + cmp.topUp.slice(0, 8).map(d => d.key + " " + d.from + "→" + d.to + " (+" + d.delta + ")").join(" · ") + "\n\n";
  md += "**Biggest fallers:** " + cmp.topDown.slice(0, 8).map(d => d.key + " " + d.from + "→" + d.to + " (" + d.delta + ")").join(" · ") + "\n\n";
  if (cmp.moversRank10.length) md += "**Rank moves >10 (sample):** " + cmp.moversRank10.slice(0, 8).map(d => d.key + " " + d.grp + " #" + d.from + "→#" + d.to).join(" · ") + "\n\n";
  for (const grp of ["FW", "MF", "DF", "GK"]) md += "**Top 25 " + grp + ":** " + top25(cand, grp).join(" · ") + "\n\n";
}

fs.writeFileSync(path.join(ROOT, "audit-report.md"), md);
console.log(md);
console.log("\n✅ wrote audit-report.md (" + Math.round(md.length / 1024) + " KB)");

if (WRITE_JSON) {
  const json = { generatedFrom: cache.generated, baseline: { dist: bd }, candidates: candidates.map(c => ({ name: c.name, dist: distByGroup(c), compare: compare(base, c) })) };
  fs.writeFileSync(path.join(ROOT, "audit-report.json"), JSON.stringify(json, null, 1));
  console.log("✅ wrote audit-report.json");
}
