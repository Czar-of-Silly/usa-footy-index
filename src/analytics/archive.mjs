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
export function careerSummary(seasons, opts) {
  const isGK = !!(opts && opts.isGK);
  const rows = (seasons || []).filter(s => s && s.year != null && !s.ambiguous && s.overall != null);
  if (!rows.length) return null;
  const ordered = [...rows].sort((a, b) => a.year - b.year);
  const latest = ordered[ordered.length - 1];
  let bestOverall = null, bestRank = null, mostMins = null, peakSub = null;
  for (const s of ordered) {
    if (s.overall != null && (bestOverall == null || s.overall > bestOverall.value)) bestOverall = { value: s.overall, year: s.year };
    if (s.posRank != null && (bestRank == null || s.posRank < bestRank.rank)) bestRank = { rank: s.posRank, group: s.posGroup || null, of: s.posOf != null ? s.posOf : null, year: s.year };
    if (isKnown(s.mins) && (mostMins == null || Number(s.mins) > mostMins.value)) mostMins = { value: Number(s.mins), year: s.year };
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
