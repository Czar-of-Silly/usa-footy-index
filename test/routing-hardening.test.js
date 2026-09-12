// Phase 6C.1 — Routing and archive-copy hardening.
//   • a season change with Compare selections must be one history entry, and must never publish a
//     URL pairing one season with another season's player slugs;
//   • a URL naming a season we do not hold must be rewritten in place, not left lying;
//   • Methodology and Movers must describe the archive as it actually is.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { req } = require("./_engine");
const A = req("src/analytics/archive.mjs");
const R = req("src/routing/routes.mjs");
const ROOT = path.join(__dirname, "..");
const app = () => fs.readFileSync(path.join(ROOT, "src/app.jsx"), "utf8");
const methodology = () => fs.readFileSync(path.join(ROOT, "src/pages/methodology.jsx"), "utf8");

// The body of one function in src/app.jsx, so an assertion about ordering is about THAT function
// rather than about the file happening to contain two strings somewhere.
function fnBody(src, startMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i >= 0, "marker not found: " + startMarker);
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error("unterminated: " + startMarker);
}

// The router's state→URL step, using the real serialiser the app calls. Given what the app holds
// after a commit, this is the URL the address bar ends up with.
function urlFor(state) {
  const base = (state.compareSlugs && state.compareSlugs.length)
    ? "/compare?players=" + state.compareSlugs.join(",")
    : R.ROUTE_PATHS.compare;
  return A.withSeason(base, state.season, { current: A.CURRENT_SEASON });
}

// Replays a season change under both orderings and reports every distinct URL the sync would write.
// `clearEarly:false` is the pre-6C.1 behaviour (destination loader clears Compare); `true` is now.
function seasonChangeUrls(clearEarly) {
  const start = { season: 2026, compareSlugs: ["messi", "bouanga"] };
  const plan = A.planSeasonChange({ season: start.season, target: 2024, compareCount: start.compareSlugs.length });
  const commits = [];
  if (clearEarly) {
    commits.push({ season: plan.year, compareSlugs: [] });                    // one commit: clear + switch
  } else {
    commits.push({ season: plan.year, compareSlugs: start.compareSlugs });    // season moved, list stale
    commits.push({ season: plan.year, compareSlugs: [] });                    // loader clears later
  }
  const urls = [];
  let last = urlFor(start);
  for (const c of commits) { const u = urlFor(c); if (u !== last) { urls.push(u); last = u; } }
  return urls;
}

// ── 1. the clear happens with the season change, not after it ───────────────
test("a season change with Compare selections plans the clear as part of the switch", () => {
  const withSel = A.planSeasonChange({ season: 2026, target: 2024, compareCount: 2 });
  assert.equal(withSel.kind, "switch");
  assert.equal(withSel.year, 2024);
  assert.equal(withSel.from, 2026, "the origin season is carried so the notice can name it");
  assert.equal(withSel.clearCompare, true);
});
test("changeSeason clears Compare BEFORE it changes the season", () => {
  // Ordering inside a React handler cannot be unit-tested without a renderer, so this asserts the
  // order inside the extracted handler itself — the specific thing that went wrong.
  const body = fnBody(app(), "const changeSeason=(yr)=>{");
  const clearAt = body.indexOf("setComparePlayers([])");
  const seasonAt = body.indexOf("setSeason(plan.year)");
  assert.ok(clearAt > 0, "changeSeason clears Compare");
  assert.ok(seasonAt > 0, "changeSeason sets the season");
  assert.ok(clearAt < seasonAt, "the clear is dispatched before the season change, so they land in one commit");
  assert.match(body, /compareClearedNotice\(plan\.from,plan\.year\)/, "and states why, naming both seasons");
  assert.match(body, /planSeasonChange\(\{season,target:yr/, "the decision comes from the pure planner");
});

// ── 2–4. no URL ever pairs one season with another season's players ────────
test("the destination URL carries the season and no stale player slugs", () => {
  const urls = seasonChangeUrls(true);
  assert.deepEqual(urls, ["/compare?season=2024"], "exactly one URL, with no players in it");
  assert.ok(!/messi|bouanga/.test(urls[0]), "no 2026 slug survives into the 2024 URL");
});
test("one season change produces one history entry, not two", () => {
  assert.equal(seasonChangeUrls(true).length, 1, "6C.1: a single URL");
  // the regression it replaces: the late clear wrote an intermediate URL first
  const before = seasonChangeUrls(false);
  assert.equal(before.length, 2, "the old ordering wrote two");
  assert.equal(before[0], "/compare?players=messi,bouanga&season=2024", "and the first one mixed seasons");
});
test("no intermediate URL exists for Back to land on, so no cross-season slug lookup can happen", () => {
  // The danger was this exact URL: on Back, season state is already 2024, so `crossSeason` is false
  // and the router would resolve 2026 slugs against the 2024 index — the guess the design refuses.
  const dangerous = "/compare?players=messi,bouanga&season=2024";
  assert.ok(!seasonChangeUrls(true).includes(dangerous), "6C.1 never writes it");
  assert.ok(seasonChangeUrls(false).includes(dangerous), "the old ordering did");
  // and the router's own guard is still in place for any other route into that state
  assert.match(app(), /if\(raw&&!crossSeason\)/, "compare slugs are never resolved across seasons");
  assert.match(app(), /const crossSeason=wantSeason!==season;/, "cross-season navigation is still detected");
});

// ── 5. stale selections are never looked up in the destination season ──────
test("nothing remaps a Compare selection across seasons — it is cleared, never translated", () => {
  const body = fnBody(app(), "const changeSeason=(yr)=>{");
  for (const banned of ["fromSlug", "byName", "find(", "resolveExactName"]) {
    assert.ok(body.indexOf(banned) < 0, `changeSeason does not ${banned} its way to a destination player`);
  }
  assert.match(app(), /setComparePlayers\(\[\]\);\s*setCompareNotice\(compareClearedNotice/, "the clear and the explanation travel together");
});

// ── 6. a season change with nothing selected is unchanged ─────────────────
test("changing season with no Compare selections behaves exactly as before", () => {
  const p = A.planSeasonChange({ season: 2026, target: 2024, compareCount: 0 });
  assert.equal(p.kind, "switch");
  assert.equal(p.clearCompare, false, "nothing to clear, nothing announced");
  const urls = seasonChangeUrls.call(null, true);
  assert.equal(urls.length, 1);
  // the other no-op paths are untouched
  assert.equal(A.planSeasonChange({ season: 2026, target: 2026, compareCount: 2 }).kind, "ignore", "same season");
  assert.equal(A.planSeasonChange({ season: 2026, target: 2031, compareCount: 0 }).kind, "ignore", "unavailable season");
  assert.equal(A.planSeasonChange({ season: 2026, target: "abc", compareCount: 0 }).kind, "ignore", "junk");
});

// ── 7. the career drill-through is untouched, and is still one entry ───────
test("a career drill-through still takes the drill path and writes exactly one entry", () => {
  const canDrill = (yr, name) => name === "Nkosi Tafari";
  const p = A.planSeasonChange({ season: 2026, target: 2024, playerName: "Nkosi Tafari", canDrill, compareCount: 2 });
  assert.equal(p.kind, "drill", "an open, uniquely-resolvable player still drills");
  assert.equal(p.name, "Nkosi Tafari");
  // an ambiguous name falls back to a plain switch rather than guessing
  assert.equal(A.planSeasonChange({ season: 2026, target: 2024, playerName: "Tiago", canDrill: () => false, compareCount: 0 }).kind, "switch");
  const s = app();
  assert.match(s, /const dest=withSeason\("\/players\/"\+slugify\(name\),yr,\{current:CURRENT_SEASON\}\);/, "one destination URL");
  assert.match(s, /window\.history\.pushState\(\{u:dest\},"",dest\)/, "pushed once");
  assert.match(s, /if\(drillPending\.current\)return;/, "and the sync writes nothing while the load is in flight");
  const body = fnBody(s, "const drillToSeason=(yr,name)=>{");
  assert.equal((body.match(/pushState/g) || []).length, 1, "exactly one push in the drill path");
});

// ── invalid season URLs are rewritten in place ─────────────────────────────
test("the parser distinguishes a missing season from a lying one", () => {
  assert.equal(A.classifySeasonParam("?players=a,b").status, "missing", "a clean URL");
  assert.equal(A.classifySeasonParam("").status, "missing", "no query at all");
  assert.equal(A.classifySeasonParam("?season=2024").status, "valid");
  assert.equal(A.classifySeasonParam("?season=2026").status, "valid");
  for (const bad of ["?season=2031", "?season=abc", "?season=", "?season=2023", "?season=2024.5"]) {
    const c = A.classifySeasonParam(bad);
    assert.equal(c.status, "invalid", bad);
    assert.equal(c.season, A.CURRENT_SEASON, bad + " still loads a season we hold");
  }
  // one parser: the number accessor is the classifier
  assert.equal(A.parseSeasonParam("?season=2031"), A.classifySeasonParam("?season=2031").season);
  assert.equal(A.parseSeasonParam("?season=2024"), 2024);
});
test("a lying season URL normalises to the canonical URL for the season that actually loaded", () => {
  const canon = (url) => {
    const q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";
    return A.withSeason(url, A.classifySeasonParam(q).season, { current: A.CURRENT_SEASON });
  };
  assert.equal(canon("/players?season=2031"), "/players");
  assert.equal(canon("/players?season=abc"), "/players");
  assert.equal(canon("/players?season="), "/players");
  assert.equal(canon("/players?season=2026"), "/players", "the current season stays implicit");
  assert.equal(canon("/players?season=2024"), "/players?season=2024", "a real archive season is preserved exactly");
  assert.equal(canon("/players"), "/players", "a clean URL is left alone");
});
test("unrelated query parameters survive normalisation", () => {
  const canon = (url) => {
    const q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";
    return A.withSeason(url, A.classifySeasonParam(q).season, { current: A.CURRENT_SEASON });
  };
  assert.equal(canon("/compare?players=a,b&season=2031"), "/compare?players=a,b", "not /compare");
  assert.equal(canon("/compare?players=a,b&season=abc"), "/compare?players=a,b");
  assert.equal(canon("/compare?players=a,b&season=2024"), "/compare?players=a,b&season=2024");
});
test("normalisation is a fixed point — no replace loop", () => {
  const canon = (url) => {
    const q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";
    return A.withSeason(url, A.classifySeasonParam(q).season, { current: A.CURRENT_SEASON });
  };
  for (const url of ["/players?season=2031", "/compare?players=a,b&season=abc", "/players?season=2024", "/"]) {
    const once = canon(url), twice = canon(once);
    assert.equal(twice, once, url + " settles after one pass");
    assert.equal(canon(twice), once, "and stays settled");
  }
});
test("the normalised URL round-trips into the same season state it loaded", () => {
  for (const [url, expected] of [["/players?season=2031", 2026], ["/players?season=abc", 2026], ["/players?season=2024", 2024], ["/players?season=2025", 2025], ["/players", 2026]]) {
    const q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";
    const season = A.classifySeasonParam(q).season;
    assert.equal(season, expected, url);
    const canon = A.withSeason(url, season, { current: A.CURRENT_SEASON });
    const cq = canon.indexOf("?") >= 0 ? canon.slice(canon.indexOf("?")) : "";
    assert.equal(A.parseSeasonParam(cq), season, canon + " reloads the same season");
  }
});
test("the router rewrites in place and never pushes for a bad season", () => {
  const s = app();
  const i = s.indexOf('if(seasonParam.status==="invalid")');
  assert.ok(i > 0, "normalisation is gated on an invalid param, not on every route");
  const branch = s.slice(i, i + 500);
  assert.match(branch, /window\.history\.replaceState/, "replaceState");
  assert.ok(branch.indexOf("pushState") < 0, "never pushState — Back must not be polluted");
  assert.match(branch, /const canonical=withSeason\(here,wantSeason/, "canonical form comes from the one serialiser");
  assert.match(branch, /if\(canonical!==here\)/, "and writes nothing when the URL is already canonical");
  assert.match(s, /const seasonParam=classifySeasonParam\(loc\.search\|\|""/, "the router uses the classifying parser");
});

// ── Methodology describes the basis the archive actually uses ──────────────
// Line endings: these read the file as checked out, and Git hands Windows CRLF. Anchoring on a
// literal "\n" therefore matched nothing there — the same trap Phase 6C hit in
// historical-integrity.test.js. \r?\n keeps the assertion honest on both.
const POWER_RANK_BRANCH = /isArchive\r?\n\s*\? P\(<><b>Power rank<\/b>/;
const powerRankTernary = (src) => {
  const m = src.match(POWER_RANK_BRANCH);
  assert.ok(m, "the power-rank paragraph branches on isArchive");
  return src.slice(m.index, src.indexOf("{H(", m.index));
};

test("Methodology states the current-season Power Rank formula for the current season", () => {
  const src = methodology();
  const ternary = powerRankTernary(src);
  const [, archiveBranch, currentBranch] = ternary.match(/\? (P\(<>[\s\S]*?)\r?\n\s*: (P\(<>[\s\S]*)/);
  assert.match(currentBranch, /50% points share \+ 30% team grade \+ 20% last-five form/, "current formula unchanged");
  assert.match(currentBranch, /right now/, "and still describes the present");
  assert.ok(archiveBranch.indexOf("50% points share") < 0, "the archive branch does not quote the current formula");
});
test("archive Methodology states the reduced basis and claims no recent form", () => {
  const src = methodology();
  const ternary = powerRankTernary(src);
  const archiveBranch = ternary.match(/\? (P\(<>[\s\S]*?)\r?\n\s*: P\(<>/)[1];
  assert.match(archiveBranch, /62\.5% points share \+ 37\.5% team grade/, "the reduced basis is stated");
  assert.ok(archiveBranch.indexOf("last-five form") < 0, "no claim that last-five form is an input");
  assert.ok(archiveBranch.indexOf("20%") < 0, "no form weight at all");
  assert.ok(archiveBranch.indexOf("right now") < 0, "an archive is not 'right now'");
  assert.match(archiveBranch, /omitted rather than filled with a neutral estimate/, "and says why the term is absent");
});
test("the Methodology copy matches the formula the app actually computes", () => {
  const full = A.powerScore({ normPts: 80, normGrade: 70, formScore: 60 });
  assert.equal(full.value, Math.round(80 * .50 + 70 * .30 + 60 * .20), "50/30/20 as the current copy says");
  const reduced = A.powerScore({ normPts: 80, normGrade: 70, formScore: null });
  assert.ok(Math.abs(reduced.weights.points - 0.625) < 1e-9, "62.5% points, as the archive copy says");
  assert.ok(Math.abs(reduced.weights.grade - 0.375) < 1e-9, "37.5% team grade");
  assert.equal(reduced.weights.form, 0);
  assert.equal(reduced.value, Math.round(80 * .625 + 70 * .375));
});
test("archive Methodology does not promise week-over-week movement that can never arrive", () => {
  const src = methodology();
  const i = src.indexOf("Movement arrows on the Table");
  const around = src.slice(Math.max(0, i - 200), i + 420);
  assert.match(around, /isArchive\?/, "the arrows sentence branches on isArchive");
  const archiveHalf = around.slice(around.indexOf("isArchive?"), around.indexOf(":<>"));
  assert.ok(archiveHalf.indexOf("once a genuine prior snapshot exists") < 0, "no 'once history accrues' promise");
  assert.match(archiveHalf, /current-season measure/, "it says what the measure belongs to");
});

// ── Movers is honest about what the archive does not contain ───────────────
test("archive Movers says the data is not there, not that it is coming", () => {
  const s = app();
  const i = s.indexOf("/*6C-MOVERS*/");
  assert.ok(i > 0, "the archive Movers branch exists");
  const branch = s.slice(s.lastIndexOf("if(isArchiveSeason)return", i), i);
  assert.match(branch, /carries no per-match box scores/, "states the archive lacks the required data");
  assert.match(branch, /current-season measure/, "and that Movers belongs to the current season");
  for (const temporary of ["check back", "5+ games", "yet —", "will appear once"]) {
    assert.ok(branch.indexOf(temporary) < 0, `archive copy avoids "${temporary}" — nothing is pending`);
  }
});
test("the archive branch returns before any 'not enough data yet' message can render", () => {
  const s = app();
  const guard = s.indexOf("if(isArchiveSeason)return", s.indexOf('leadersView==="movers"'));
  const notEnough = s.indexOf("Not enough match data yet", guard);
  const checkBack = s.indexOf("No significant movers yet", guard);
  assert.ok(guard > 0 && notEnough > guard && checkBack > guard,
    "the archive early-return precedes both future-looking messages, so an archive season cannot reach them");
});
test("the current season keeps its existing future-looking empty states", () => {
  const s = app();
  assert.match(s, /Not enough match data yet — movers will appear once players have 5\+ games\./, "unchanged for the current season");
  assert.match(s, /No significant movers yet — check back after more matchweeks\./, "unchanged for the current season");
});
test("Team of the Week and Movers apply the same standard", () => {
  const s = app();
  for (const marker of ["/*6C-MOVERS*/", "Team of the Week is built from per-match box scores"]) {
    assert.ok(s.indexOf(marker) > 0, marker + " present");
  }
  assert.match(s, /Team of the Week is built from per-match box scores, and the \{season\} archive does not carry them/, "TOTW states the same limitation");
});
