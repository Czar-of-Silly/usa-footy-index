// analytics/archive.mjs — Phase 6B.1.
//
// One place for "unknown is not zero" semantics and for the cross-season career logic that used to
// live inline in src/app.jsx and src/components/player-modal.jsx. Everything here is pure so it can
// be tested as behaviour rather than asserted against source text.
//
// The rule the whole file exists to enforce: in the 2024/2025 archive caches `assists` is null,
// which means UNKNOWN. It must never be coerced to 0, and it must never be replaced by a
// manufactured proxy. Where a derived number cannot be computed honestly, it is either reported as
// unavailable or reported as a clearly-labelled reduced-input version.

export const UNAVAILABLE = "—"; // the site-wide "no value" glyph (em dash)

// ─── SEASONS: ONE SOURCE OF TRUTH (Phase 6C) ─────────────────────────────────
// Every season list in the app derives from this array — the selector, the router, the career
// panel's axis and the loaders. Nothing reads the wall-clock year: `new Date().getFullYear()` used
// to seed the season, which meant that on 1 January the app would request a cache that does not
// exist. Data seasons are a property of the committed caches, not of today's date.
export const AVAILABLE_SEASONS = [2026, 2025, 2024]; // newest first — display order
export const CURRENT_SEASON = AVAILABLE_SEASONS[0];
export const SEASONS_OLDEST_FIRST = [...AVAILABLE_SEASONS].sort((a, b) => a - b);

export function isAvailableSeason(v, available) {
  const list = available || AVAILABLE_SEASONS;
  const n = Number(v);
  return Number.isInteger(n) && list.indexOf(n) >= 0;
}

// One parser. `classifySeasonParam` is the whole implementation; `parseSeasonParam` is a thin
// accessor over it, so there is never a second, subtly different way to read the season.
//
// 6C.1: the caller sometimes needs to know WHY it got the current season back. "No season in the
// URL" is a clean URL that should be left alone; "?season=2031" is a URL that lied and has to be
// rewritten in place. Collapsing both to a number made those indistinguishable.
//   missing → the param is absent entirely
//   valid   → the param names a season we hold a cache for
//   invalid → the param is present but unusable (unknown year, empty, junk)
export function classifySeasonParam(input, opts) {
  const available = (opts && opts.available) || AVAILABLE_SEASONS;
  const fallback = (opts && opts.fallback !== undefined) ? opts.fallback : CURRENT_SEASON;
  let raw;
  if (input && typeof input === "object" && typeof input.get === "function") {
    const got = input.get("season");
    raw = got === null ? undefined : got;
  } else if (typeof input === "string" && (input.indexOf("=") >= 0 || input.charAt(0) === "?")) {
    const q = input.charAt(0) === "?" ? input.slice(1) : input;
    for (const part of q.split("&")) {
      const eq = part.indexOf("=");
      const key = eq < 0 ? part : part.slice(0, eq);
      if (decodeURIComponent(key) === "season") raw = eq < 0 ? "" : decodeURIComponent(part.slice(eq + 1));
    }
  } else if (input === "" ) {
    raw = undefined; // no query string at all — that is a clean URL, not a malformed one
  } else {
    raw = input;
  }
  if (raw === undefined || raw === null) return { status: "missing", raw: null, season: fallback };
  if (isAvailableSeason(raw, available)) return { status: "valid", raw: String(raw), season: Number(raw) };
  return { status: "invalid", raw: String(raw), season: fallback };
}

// Anything unrecognised — a future year, a typo, an empty param — falls back to the current season
// rather than throwing or requesting a cache that is not there.
export function parseSeasonParam(input, opts) {
  return classifySeasonParam(input, opts).season;
}

// The current season is the default, so its URLs stay clean (`/players` not `/players?season=2026`)
// and existing links keep working. Any other season is pinned in the query so the page survives a
// refresh, a share and Back/Forward. Other query params are preserved in place, unencoded, so the
// compare URL keeps its readable `?players=a,b` form.
export function withSeason(path, season, opts) {
  const current = (opts && opts.current !== undefined) ? opts.current : CURRENT_SEASON;
  const p = String(path || "/");
  const i = p.indexOf("?");
  const base = i < 0 ? p : p.slice(0, i);
  const parts = i < 0 ? [] : p.slice(i + 1).split("&").filter(x => x && x.slice(0, 7) !== "season=");
  if (isAvailableSeason(season) && Number(season) !== current) parts.push("season=" + Number(season));
  return parts.length ? base + "?" + parts.join("&") : base;
}

// ─── SEASON CHANGE (Phase 6C.1) ──────────────────────────────────────────────
// What a click on the season selector should do, decided in one pure place so the outcome can be
// tested rather than inferred from the router.
//
// The bug this closes: the Compare list used to be cleared by the DESTINATION loader, i.e. after
// the new cache arrived. Between the click and that moment the app still held the previous season's
// selections while already reporting the new season, so the state→URL sync could publish an
// intermediate URL pairing one season with another season's player slugs
// (`/compare?players=<2026 slugs>&season=2024`). That cost a second history entry, and pressing Back
// onto it landed on a URL the router no longer saw as cross-season — so it would try to resolve
// 2026 slugs against the 2024 index, which is exactly the cross-season guess the whole design
// refuses to make. Clearing has to happen in the same commit as the season change.
export function planSeasonChange(state) {
  const available = (state && state.available) || AVAILABLE_SEASONS;
  const from = state && state.season;
  const target = Number(state && state.target);
  if (!isAvailableSeason(target, available) || target === from) return { kind: "ignore" };
  const name = state && state.playerName;
  const canDrill = state && typeof state.canDrill === "function" ? state.canDrill : null;
  if (name && canDrill && canDrill(target, name)) return { kind: "drill", year: target, name };
  return { kind: "switch", year: target, from, clearCompare: !!(state && state.compareCount > 0) };
}

// One string for both paths that can clear Compare, so the explanation cannot drift.
export function compareClearedNotice(from, to) {
  return `Compare was cleared: those players were from the ${from} season. Add ${to} players to compare within one season — cross-season comparison needs stable player identities, which is a later phase.`;
}

// ─── UNKNOWN-VS-ZERO PRIMITIVES ──────────────────────────────────────────────

// A value is "known" only if it is an actual finite number. null / undefined / NaN are UNKNOWN.
export function isKnown(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n);
}

// Sum that refuses to invent a total. If ANY contributing row is unknown for that key the whole
// aggregate is unknown, because a partial sum presented as a total is a fabricated number.
// (This is the fix for team "Total Assists: 0" on archive seasons.)
export function sumStrict(rows, key) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let total = 0;
  for (const r of rows) {
    const v = r ? r[key] : null;
    if (!isKnown(v)) return null;
    total += Number(v);
  }
  return total;
}

// Sum that keeps the existing lenient behaviour for metrics that are genuinely always present.
export function sumLenient(rows, key) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s, r) => s + (parseFloat(r && r[key]) || 0), 0);
}

// Comparator that keeps unknown values out of the ordering rather than treating them as 0.
// Unknowns always sort last, in both directions, so a column of "—" never wins a sort.
export function compareUnknownLast(a, b, dir) {
  const ka = isKnown(a), kb = isKnown(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return (dir < 0 ? -1 : 1) * (Number(a) - Number(b));
}

// ─── PERCENTILES ─────────────────────────────────────────────────────────────

// Percentile ranks per player, per metric.
//   • the pool for a metric contains only players whose value is known — padding it with
//     synthetic zeros both fakes the missing player's rank and depresses everyone else's;
//   • a player with an unknown value gets null for that metric, not 0.
// The rank formula itself is unchanged for valid metrics.
export function buildPercentiles(players, keys) {
  const out = {};
  if (!Array.isArray(players) || !players.length) return out;
  const pools = {};
  for (const k of keys) {
    pools[k] = players.map(p => (isKnown(p[k]) ? Number(p[k]) : null)).filter(v => v !== null).sort((a, b) => a - b);
  }
  const rank = (arr, v) => (arr.length ? Math.round((arr.filter(x => x < v).length / Math.max(arr.length - 1, 1)) * 100) : null);
  for (const p of players) {
    const r = {};
    for (const k of keys) r[k] = isKnown(p[k]) ? rank(pools[k], Number(p[k])) : null;
    out[p.id] = r;
  }
  return out;
}

// ─── SIMILAR PLAYERS ─────────────────────────────────────────────────────────

// Euclidean distance across percentile profiles, computed only over metrics BOTH players have.
// The sum of squares is rescaled to the full dimensionality so a pair compared on fewer metrics is
// not automatically "more similar" than a pair compared on all of them.
export function profileSimilarity(src, dst, keys) {
  if (!src || !dst || !Array.isArray(keys) || !keys.length) return null;
  let sumSq = 0, used = 0;
  const missing = [];
  for (const k of keys) {
    const a = src[k], b = dst[k];
    if (a == null || b == null) { missing.push(k); continue; }
    sumSq += (Number(a) - Number(b)) ** 2;
    used++;
  }
  if (!used) return null;
  const dist = Math.sqrt(sumSq * (keys.length / used));
  return { similarity: Math.round(Math.max(0, 100 - (dist / keys.length) * 1.5)), used, of: keys.length, missing };
}

// ─── SEASON RATING INPUTS ────────────────────────────────────────────────────

// Goal-involvement contribution to the Season Rating.
// When assists are unknown the assist term is simply absent — there is no compensating multiplier,
// because inventing one would preserve the numeric ceiling by fabricating production.
export function goalContribution(goals, assists) {
  const known = assists != null;
  const raw = ((Number(goals) || 0) + (known ? Number(assists) || 0 : 0)) * 0.25;
  return { value: Math.min(4, raw), reduced: !known };
}

// The five terms Impact/90 is defined over. Any term the season does not carry is dropped and
// reported, so the result can be labelled as a reduced-input figure instead of quietly meaning
// something different under the same name.
export const IMPACT_TERMS = [
  ["goals", "goals"],
  ["assists", "assists"],
  ["tackles", "tackles"],
  ["keyPasses", "key passes"],
  ["interceptions", "interceptions"],
];

export function impactPerGame(p, gamesPlayed) {
  const included = [], missing = [];
  if (!(gamesPlayed > 0)) return { value: null, reduced: false, included, missing };
  let total = 0;
  for (const [k, label] of IMPACT_TERMS) {
    const v = p ? p[k] : null;
    if (!isKnown(v)) { missing.push(label); continue; }
    total += Number(v);
    included.push(label);
  }
  return { value: total / gamesPlayed, reduced: missing.length > 0, included, missing };
}

// ─── AWARD RACES ─────────────────────────────────────────────────────────────

// True only when every candidate has a known assist count. A mixed pool is treated as unavailable
// so the race is scored on one consistent basis for everyone rather than penalising the rows whose
// source happens to be missing.
export function assistsCoverageComplete(list) {
  return Array.isArray(list) && list.length > 0 && list.every(p => p && p.assists != null);
}

// MVP score. With assists unavailable the assist term is removed from the basis for the whole
// field; callers must disclose that the archive race uses reduced inputs.
export function mvpScore(p, opts) {
  const useAssists = !!(opts && opts.useAssists);
  const minFactor = Math.min((p.mins || 0) / 450, 1);
  const ga = parseFloat(p.totalGA) || 0;
  const production = ((p.goals || 0) * 3 + (useAssists ? (p.assists || 0) * 2 : 0)) * 2;
  return Math.round(((p.overall || 0) * 0.4 + production + (ga >= 0 ? ga * 8 : ga * 4)) * minFactor * 10) / 10;
}

// Golden Boot ordering. Assists are used as the tiebreak only when assist coverage exists;
// otherwise equal-goal players are ordered by a non-performance identifier (name), which is
// deterministic and makes no claim about who is ahead.
export function goldenBootOrder(list, opts) {
  const useAssists = !!(opts && opts.useAssists);
  return [...(list || [])].sort((a, b) =>
    (b.goals || 0) - (a.goals || 0) ||
    (useAssists ? (b.assists || 0) - (a.assists || 0) : 0) ||
    String(a.name || "").localeCompare(String(b.name || "")));
}

// ─── POSITIONAL RANKS (within one season, within one position group) ─────────

export const POS_GROUPS = ["FW", "MF", "DF", "GK"];

// Mirrors the grading engine's own GK/FW/DF/MF split so ranks line up with how grades were computed.
export function posGroupKey(p) {
  if (p && p.isGK) return "GK";
  const pos = (p && p.pos) || "Midfielder";
  return pos === "Forward" ? "FW" : pos === "Defender" ? "DF" : "MF";
}

// rows: [{key, pos, ov}] — `key` is a stable per-row identifier (never a name, so duplicate names
// cannot collide). Standard competition ranking (1,2,2,4): tied Overall grades share a rank instead
// of depending on array order.
export function positionalRanks(rows) {
  const ranks = {}, totals = {};
  for (const grp of POS_GROUPS) {
    const sub = (rows || []).filter(r => r && r.pos === grp).sort((a, b) => b.ov - a.ov);
    totals[grp] = sub.length;
    let lastOv = null, lastRank = 0;
    sub.forEach((r, i) => {
      const rank = (lastOv !== null && r.ov === lastOv) ? lastRank : i + 1;
      ranks[r.key] = { rank, pos: grp, of: sub.length };
      lastOv = r.ov; lastRank = rank;
    });
  }
  return { ranks, totals };
}

// ─── EXACT-NAME IDENTITY (Phase 6D will replace this with provider IDs) ──────

// Counts every occurrence of a name AND keeps the first row for it. The count is the point: a
// plain `byName[name] = row` map silently drops duplicates and produces false joins.
export function buildNameIndex(rows, nameOf) {
  const get = typeof nameOf === "function" ? nameOf : (r => r && r.name);
  const counts = Object.create(null), byName = Object.create(null);
  for (const r of rows || []) {
    const n = get(r);
    if (n == null || n === "") continue;
    counts[n] = (counts[n] || 0) + 1;
    if (!(n in byName)) byName[n] = r;
  }
  return { counts, byName };
}

// "unique" | "none" | "ambiguous". No fuzzy matching, no team-based disambiguation.
export function resolveExactName(counts, name) {
  if (!counts || name == null) return "none";
  const c = counts instanceof Map ? (counts.get(name) || 0) : (counts[name] || 0);
  if (c === 1) return "unique";
  if (c === 0) return "none";
  return "ambiguous";
}

export function canDrillThrough(counts, name) {
  return resolveExactName(counts, name) === "unique";
}

// ─── CAREER SUMMARY ──────────────────────────────────────────────────────────

// [shortLabel, gradeKey, fullLabel]. The underlying field mapping is identical for keepers — only
// the wording changes, because for a goalkeeper those five grades mean something else.
export const OUTFIELD_SUBS = [
  ["ATT", "attack", "Attack"],
  ["PAS", "passing", "Passing"],
  ["DEF", "defense", "Defense"],
  ["CRE", "creativity", "Creativity"],
  ["CAR", "carrying", "Carrying"],
];
export const KEEPER_SUBS = [
  ["STOP", "attack", "Shot-Stop"],
  ["DIST", "passing", "Distribution"],
  ["CMD", "defense", "Command"],
  ["SWEEP", "creativity", "Sweeping"],
  ["HAND", "carrying", "Handling"],
];

export function careerSubgradeLabels(isGK) { return isGK ? KEEPER_SUBS : OUTFIELD_SUBS; }

export const POS_GROUP_LABEL = { FW: "forwards", MF: "midfielders", DF: "defenders", GK: "goalkeepers" };

// Best RECORDED values across the seasons the Index actually holds. Deliberately not a trend:
// coverage differs between the archive and the current season, so "best recorded" is the strongest
// claim the data supports. Ties keep the earliest season, so the summary is deterministic.
// `gkCoverage(year) => boolean` is optional. For a GOALKEEPER it gates the Peak Skill claim only:
// 2024/2025 carry no goalkeeper-specific source metrics at all, so "Command 99 · 2025" would be a
// claim about a number the same panel warns has no keeper data behind it. Those years are excluded
// from the peak-skill search; if that leaves nothing, the tile reports no full-coverage season
// rather than falling back to a figure it just disqualified. Grades themselves are untouched, the
// other summary tiles are untouched, and outfield behaviour is unchanged.
export function careerSummary(seasons, opts) {
  const isGK = !!(opts && opts.isGK);
  const gkCoverage = opts && typeof opts.gkCoverage === "function" ? opts.gkCoverage : null;
  const rows = (seasons || []).filter(s => s && s.year != null && !s.ambiguous && s.overall != null);
  if (!rows.length) return null;
  const ordered = [...rows].sort((a, b) => a.year - b.year);
  const latest = ordered[ordered.length - 1];
  const peakEligible = (s) => !isGK || !gkCoverage || gkCoverage(s.year) !== false;
  let bestOverall = null, bestRank = null, mostMins = null, peakSub = null;
  const peakSkipped = [];
  for (const s of ordered) {
    if (s.overall != null && (bestOverall == null || s.overall > bestOverall.value)) bestOverall = { value: s.overall, year: s.year };
    if (s.posRank != null && (bestRank == null || s.posRank < bestRank.rank)) bestRank = { rank: s.posRank, group: s.posGroup || null, of: s.posOf != null ? s.posOf : null, year: s.year };
    if (isKnown(s.mins) && (mostMins == null || Number(s.mins) > mostMins.value)) mostMins = { value: Number(s.mins), year: s.year };
    if (!peakEligible(s)) { peakSkipped.push(s.year); continue; }
    for (const [, key, full] of careerSubgradeLabels(isGK)) {
      const v = s[key];
      if (v == null) continue;
      if (peakSub == null || Number(v) > peakSub.value) peakSub = { value: Number(v), key, label: full, year: s.year };
    }
  }
  return {
    seasons: ordered.length,
    latestYear: latest.year,
    latestClub: latest.team || null,
    bestOverall, bestRank, mostMins, peakSub,
    peakSkippedYears: peakSkipped,
    peakSubUnavailable: (peakSub == null && peakSkipped.length > 0) ? "no-gk-coverage" : null,
  };
}

// ─── HISTORY SERIES (chart geometry, gap-preserving) ─────────────────────────

// Returns every season on the x-axis plus the connected runs. A season with no row breaks the line
// instead of being interpolated across, because a straight segment through a missing year draws
// data that does not exist.
export function historySeries(allSeasons, seasons) {
  const rows = (seasons || []).filter(s => s && s.year != null && !s.ambiguous && s.overall != null);
  const years = (Array.isArray(allSeasons) && allSeasons.length ? allSeasons.slice() : rows.map(s => s.year))
    .filter((y, i, a) => a.indexOf(y) === i).sort((a, b) => a - b);
  const byYear = Object.create(null);
  rows.forEach(s => { byYear[s.year] = s; });
  const points = years.map(y => ({ year: y, recorded: !!byYear[y], season: byYear[y] || null }));
  const segments = [];
  let run = [];
  for (const p of points) {
    if (p.recorded) run.push(p);
    else { if (run.length > 1) segments.push(run); run = []; }
  }
  if (run.length > 1) segments.push(run);
  return { years, points, segments };
}

// "2025 · LAFC · Grade 81 · #18 of 74 defenders · 2,103 minutes"
export function seasonDescription(s) {
  if (!s) return "";
  const bits = [String(s.year)];
  if (s.team) bits.push(s.team);
  if (s.overall != null) bits.push("Grade " + s.overall);
  if (s.posRank != null) bits.push("#" + s.posRank + (s.posOf != null ? " of " + s.posOf : "") + " " + (POS_GROUP_LABEL[s.posGroup] || ""));
  if (isKnown(s.mins)) bits.push(Number(s.mins).toLocaleString() + " minutes");
  return bits.join(" · ").replace(/\s+/g, " ").trim();
}

// ─── CROSS-SEASON COMPARABILITY WARNING ──────────────────────────────────────

export const IDENTITY_NOTE = "Seasons are matched by exact player name. A name that is spelled differently between sources, or shared by two players in the same season, is left unmatched rather than joined to the wrong player.";

export function comparabilityWarning(archiveYears, currentSeason) {
  const ys = (archiveYears || []).slice().sort((a, b) => a - b);
  if (!ys.length) return null;
  return {
    headline: "Grades are not directly comparable across seasons.",
    detail: `${ys.join(" and ")} ${ys.length === 1 ? "is an archive season" : "are archive seasons"} built from a smaller set of inputs than ${currentSeason} — no Opta advanced metrics and no goalkeeper metrics — so a grade there reflects a different measurement basis, not simply a different level of play.`,
    identity: IDENTITY_NOTE,
  };
}

// ─── SEASON LEADERBOARDS (Phase 6C) ──────────────────────────────────────────
// Built from the canonical grades the selected season already produced. There is no second
// historical grading path here and no recomputation — these functions only order and label what
// computeGrades already returned for that season.

// Loose position string → ranking group. The engine's normPos has usually run already, but the
// caches spell positions differently between seasons ("Defender" in 2024, "defense" in 2026), so
// this stays permissive.
export function normalizeGroup(position) {
  const t = String(position || "").toLowerCase().trim();
  if (t === "gk" || t === "g" || t.indexOf("goal") >= 0 || t.indexOf("keep") >= 0) return "GK";
  if (t === "df" || t === "d" || t === "def" || t.indexOf("defen") >= 0 || t.indexOf("back") >= 0) return "DF";
  if (t === "fw" || t === "f" || t === "st" || t.indexOf("forw") >= 0 || t.indexOf("atta") >= 0 || t.indexOf("strik") >= 0 || t.indexOf("wing") >= 0 || t.indexOf("off") >= 0) return "FW";
  return "MF";
}

export const GROUP_LABEL = { ALL: "Overall", FW: "Forwards", MF: "Midfielders", DF: "Defenders", GK: "Goalkeepers" };
export const GROUP_SINGULAR = { FW: "forward", MF: "midfielder", DF: "defender", GK: "goalkeeper" };

// Eligibility mirrors the grading pool exactly: >= 1 minute, and actually graded. PROV (<450
// minutes) stays in — it is a display label, never a pool gate. Zero-minute players stay out.
export function isRankEligible(p) {
  return !!p && p.rated !== false && (p.mins || 0) >= 1 && p.overall != null;
}

// Standard competition ranking (1,2,2,4) on Overall, with a deterministic name tiebreak for the
// order tied players appear in. Two players on the same grade share a rank; neither is claimed to
// be ahead of the other.
export function seasonLeaderboard(players, opts) {
  const group = (opts && opts.group) || "ALL";
  const limit = opts && opts.limit !== undefined ? opts.limit : 25;
  const pool = (players || []).filter(p => isRankEligible(p) && (group === "ALL" || normalizeGroup(p.position) === group));
  const sorted = [...pool].sort((a, b) => (b.overall - a.overall) || String(a.name || "").localeCompare(String(b.name || "")));
  let lastOv = null, lastRank = 0;
  const rows = sorted.map((p, i) => {
    const rank = (lastOv !== null && p.overall === lastOv) ? lastRank : i + 1;
    lastOv = p.overall; lastRank = rank;
    return { ...p, rank, group: normalizeGroup(p.position), prov: (p.mins || 0) < 450, poolSize: sorted.length };
  });
  return limit ? rows.slice(0, limit) : rows;
}

// The player's own best sub-grade, named in the vocabulary that fits the position. For a keeper
// that is Shot-Stop / Distribution / Command / Sweeping / Handling — never the outfield names,
// which mean something else over the same fields.
export function strongestSubgrade(p, isGK) {
  const keeper = isGK === undefined ? normalizeGroup(p && p.position) === "GK" : !!isGK;
  let best = null;
  for (const [short, key, full] of careerSubgradeLabels(keeper)) {
    const v = p ? p[key] : null;
    if (v == null) continue;
    if (best == null || Number(v) > best.value) best = { value: Number(v), key, short, label: full };
  }
  return best;
}

// Clubs ordered by Team Grade within one season, tied grades sharing a rank.
export function teamGradeRanking(teams) {
  const pool = (teams || []).filter(t => t && (t.count || 0) > 0 && t.overall != null);
  const sorted = [...pool].sort((a, b) => (b.overall - a.overall) || String(a.abbr || "").localeCompare(String(b.abbr || "")));
  const ranks = {};
  let lastOv = null, lastRank = 0;
  sorted.forEach((t, i) => {
    const rank = (lastOv !== null && t.overall === lastOv) ? lastRank : i + 1;
    ranks[t.abbr] = { rank, of: sorted.length };
    lastOv = t.overall; lastRank = rank;
  });
  return { ranks, of: sorted.length, ordered: sorted };
}

// Power Rankings blend points, team grade and recent form. The archive caches carry no fixture
// list at all, so there is no form to read. Rather than feeding the blend a neutral 50 — a number
// nobody measured, worth 20% of the published score — the form term is dropped and the remaining
// weights are renormalised, and the caller is told to say so.
export const POWER_WEIGHTS = { points: 0.50, grade: 0.30, form: 0.20 };
export function powerScore(inputs) {
  const pts = Number(inputs && inputs.normPts) || 0;
  const grade = Number(inputs && inputs.normGrade) || 0;
  const hasForm = inputs && inputs.formScore != null && isKnown(inputs.formScore);
  if (hasForm) {
    return { value: Math.round(pts * POWER_WEIGHTS.points + grade * POWER_WEIGHTS.grade + Number(inputs.formScore) * POWER_WEIGHTS.form), reduced: false, weights: POWER_WEIGHTS };
  }
  const denom = POWER_WEIGHTS.points + POWER_WEIGHTS.grade;
  const weights = { points: POWER_WEIGHTS.points / denom, grade: POWER_WEIGHTS.grade / denom, form: 0 };
  return { value: Math.round(pts * weights.points + grade * weights.grade), reduced: true, weights };
}

// A compact league-level summary for an archive season. Everything here is read off structures the
// season already produced; nothing is inferred. The stored standings are reported as a points
// leader, never as a champion — the cache does not establish that these are final standings.
export function seasonOverview(players, teams, standings, opts) {
  const season = opts && opts.season;
  const graded = (players || []).filter(isRankEligible);
  const top = seasonLeaderboard(graded, { group: "ALL", limit: 1 })[0] || null;
  const byGroup = {};
  for (const g of POS_GROUPS) byGroup[g] = seasonLeaderboard(graded, { group: g, limit: 1 })[0] || null;
  const { ordered } = teamGradeRanking(teams);
  const gradeLeader = ordered[0] || null;
  const table = (standings || []).filter(s => s && s.team);
  const pointsLeader = table.length
    ? [...table].sort((a, b) => ((b.pts || 0) - (a.pts || 0)) || (((b.gf || 0) - (b.ga || 0)) - ((a.gf || 0) - (a.ga || 0))) || ((b.gf || 0) - (a.gf || 0)))[0]
    : null;
  return {
    season,
    gradedPlayers: graded.length,
    clubs: ordered.length,
    topOverall: top,
    byGroup,
    gradeLeader,
    pointsLeader,
    assistsKnown: graded.length ? graded.every(p => p.assists != null) : false,
  };
}

// ─── BEST XI (Phase 6C) ──────────────────────────────────────────────────────
// Lifted out of the Leaders JSX unchanged so it can be tested rather than re-implemented in a test.
// The rule is exactly what the site already shipped: highest Overall at each slot of a 4-3-3, no
// second quality formula, no assist term, no metric the archive lacks. Because `players` is already
// the selected season's array, running it under 2024 yields a 2024 XI with nothing else to change.
// Ties are left to fall back to cache order, exactly as before — deliberately not "improved" here,
// since that would silently alter a shipped XI.
export const BEST_XI_FORMATION = [
  { slot: "LW", group: "FW", pick: 0, x: 15, y: 18 }, { slot: "ST", group: "FW", pick: 1, x: 50, y: 10 }, { slot: "RW", group: "FW", pick: 2, x: 85, y: 18 },
  { slot: "LCM", group: "MF", pick: 0, x: 25, y: 42 }, { slot: "CM", group: "MF", pick: 1, x: 50, y: 36 }, { slot: "RCM", group: "MF", pick: 2, x: 75, y: 42 },
  { slot: "LB", group: "DF", pick: 0, x: 12, y: 65 }, { slot: "LCB", group: "DF", pick: 1, x: 35, y: 68 }, { slot: "RCB", group: "DF", pick: 2, x: 65, y: 68 }, { slot: "RB", group: "DF", pick: 3, x: 88, y: 65 },
  { slot: "GK", group: "GK", pick: 0, x: 50, y: 90 },
];

export function bestXI(players) {
  const by = {};
  for (const g of POS_GROUPS) by[g] = (players || []).filter(p => normalizeGroup(p.position) === g).sort((a, b) => b.overall - a.overall);
  return BEST_XI_FORMATION
    .map(f => ({ slot: f.slot, x: f.x, y: f.y, p: by[f.group][f.pick] || by[f.group][0] }))
    .filter(s => s.p);
}

// ─── ARCHIVE-MODE AUXILIARY SCRUB ────────────────────────────────────────────

// Pipeline health and ranking snapshots describe the CURRENT cache. Under an archive season they
// are not merely stale — they are about a different season entirely, so they are withheld.
export function archiveAuxiliary(season, currentSeason, aux) {
  const isArchive = season != null && currentSeason != null && season !== currentSeason;
  if (isArchive) return { isArchive: true, pipeStatus: null, rankHistory: null };
  return {
    isArchive: false,
    pipeStatus: aux && aux.pipeStatus !== undefined ? aux.pipeStatus : null,
    rankHistory: aux && aux.rankHistory !== undefined ? aux.rankHistory : null,
  };
}
