// src/analytics/identity.mjs — Phase 6D. Cross-season player identity.
//
// WHY THIS EXISTS
// Until 6D the only way to say "the 2024 Nkosi Tafari and the 2026 Nkosi Tafari are one person" was
// to compare display names. That is wrong in two directions at once: it splits a player who changes
// how his name is written, and it merges two players who happen to share one. Phase 6B.1 made the
// name join ambiguity-safe, which stopped it from lying; it could not make it correct.
//
// WHAT CHANGED
// The 2024/2025 caches now carry `ids.asa`, and ASA's player_id was measured — not assumed — to be
// stable across seasons:
//   • 390 ids appear in all three seasons
//   • 124 players changed club between 2024 and 2025 and kept the same id
//   • 7 display names in the ASA directory belong to two different ids, and the id separates them
// So a verified provider id is the identity, and the name is only a documented fallback.
//
// WHAT THIS DELIBERATELY WILL NOT DO
// No fuzzy matching, no accent folding, no surname+initial, no name+club key, no birth-date guessing.
// When the evidence does not single out one player, the answer is "unresolved" — which is a result,
// not a failure to be worked around. Opta and Sportec ids identify a player *within* 2026 but exist
// in no other season, so they are never a cross-season identity.

// Providers ranked by how much they can be trusted to mean the same person in two different seasons.
// Only `asa` has been shown to; the rest are recorded so a row can still carry them.
export const IDENTITY_PROVIDERS = ["asa"];
export const WITHIN_SEASON_PROVIDERS = ["opta", "sportec"];

export const JOIN = {
  PROVIDER: "provider-id",   // matched on a verified, cross-season-stable id
  NAME: "exact-name",        // no id available; exactly one row on each side carries this exact name
  AMBIGUOUS: "ambiguous",    // the name or id maps to more than one candidate
  UNRESOLVED: "unresolved",  // nothing matched at all
};

// The canonical key for a row, or null when the row carries no cross-season-stable id.
// A row that only has `opta`/`sportec` returns null on purpose: those cannot cross a season boundary.
export function identityKey(row) {
  if (!row) return null;
  const ids = row.ids || {};
  for (const p of IDENTITY_PROVIDERS) {
    const v = ids[p];
    if (v !== undefined && v !== null && v !== "") return `${p}:${v}`;
  }
  return null;
}

// Within-season disambiguators. Useful for telling two same-named 2026 rows apart in the UI; never
// used to join across seasons.
export function localKeys(row) {
  const ids = (row && row.ids) || {};
  const out = {};
  for (const p of WITHIN_SEASON_PROVIDERS) if (ids[p] !== undefined && ids[p] !== null && ids[p] !== "") out[p] = String(ids[p]);
  return out;
}

// Index one season for lookup. Identity keys claimed by more than one row are recorded as conflicts
// and are refused by resolve() — a duplicated id is evidence of a bad join, not a reason to pick one.
export function buildIdentityIndex(rows) {
  const byIdentity = Object.create(null);
  const conflicts = Object.create(null);
  const nameCounts = Object.create(null);
  const byName = Object.create(null);
  for (const r of rows || []) {
    const n = r && r.n;
    if (n != null && n !== "") {
      nameCounts[n] = (nameCounts[n] || 0) + 1;
      if (!(n in byName)) byName[n] = r;
    }
    const k = identityKey(r);
    if (!k) continue;
    if (k in byIdentity) { conflicts[k] = (conflicts[k] || 1) + 1; }
    else byIdentity[k] = r;
  }
  for (const k of Object.keys(conflicts)) delete byIdentity[k];
  return { byIdentity, byName, nameCounts, conflicts };
}

// Resolve `row` (from any season) against an indexed season.
// Order: verified provider id, then exact unique name, then unresolved. Never anything else.
export function resolve(row, index) {
  if (!row || !index) return { join: JOIN.UNRESOLVED, row: null, key: null, reason: "no input" };

  const k = identityKey(row);
  if (k) {
    if (k in index.conflicts)
      return { join: JOIN.AMBIGUOUS, row: null, key: k, reason: `identity ${k} is claimed by ${index.conflicts[k]} rows in the target season` };
    const hit = index.byIdentity[k];
    if (hit) return { join: JOIN.PROVIDER, row: hit, key: k, reason: `matched on ${k}` };
    // The id is not in the target season. That is usually because the target row carries no id at all
    // — 303 of the 1008 2026 rows are reserve and academy players ASA never covers — rather than
    // because the player is absent. Dropping the link here would silently remove ~50 working career
    // histories, so the exact-unique-name fallback below still runs. What it may NOT do is match onto
    // a row that holds a DIFFERENT verified identity: that would be asserting two proven-distinct
    // people are one, which is the failure this whole layer exists to prevent.
  }

  const n = row.n;
  if (n == null || n === "") return { join: JOIN.UNRESOLVED, row: null, key: null, reason: "row has no name" };
  const c = index.nameCounts[n] || 0;
  if (c === 1) {
    const hit = index.byName[n];
    const hitKey = identityKey(hit);
    // The target row has a verified identity of its own. If it is not this row's identity, these are
    // two people the sources can tell apart, and the shared spelling is not evidence of anything.
    if (hitKey && hitKey !== k) return { join: JOIN.AMBIGUOUS, row: null, key: k, reason: `"${n}" in the target season is ${hitKey}, which is not ${k || "this row"}` };
    if (hitKey && hitKey === k) return { join: JOIN.PROVIDER, row: hit, key: k, reason: `matched on ${k}` };
    return { join: JOIN.NAME, row: hit, key: k, reason: k
      ? `exactly one row named "${n}" and it carries no id of its own, so the name is the only evidence available`
      : `exactly one row named "${n}", and neither side carries an id` };
  }
  if (c === 0) return { join: JOIN.UNRESOLVED, row: null, key: k || null, reason: `no row named "${n}"` };
  return { join: JOIN.AMBIGUOUS, row: null, key: k || null, reason: `${c} rows share the name "${n}"` };
}

// A player's career: one entry per season, each carrying how it was joined.
// `anchor` is the row the user is looking at; `seasons` is { year: rows[] }.
export function careerJoin(anchor, seasons) {
  const out = [];
  for (const year of Object.keys(seasons || {}).map(Number).sort((a, b) => a - b)) {
    const rows = seasons[year];
    const index = buildIdentityIndex(rows);
    const r = resolve(anchor, index);
    out.push({ year, join: r.join, row: r.row, reason: r.reason, resolved: !!r.row });
  }
  return out;
}

// Join provenance, summarised for disclosure in the UI.
export function joinSummary(entries) {
  const s = { [JOIN.PROVIDER]: 0, [JOIN.NAME]: 0, [JOIN.AMBIGUOUS]: 0, [JOIN.UNRESOLVED]: 0 };
  for (const e of entries || []) if (e && e.join in s) s[e.join]++;
  return s;
}

// ─── CROSS-SEASON COMPARE (§10) ──────────────────────────────────────────────
// Deliberately narrow: the SAME player across seasons he chooses. Two different players from two
// different seasons is not offered, because nothing here makes that comparison safe yet.

export const COMPARE_REFUSED = {
  NO_IDENTITY: "no-stable-identity",
  DIFFERENT_PLAYERS: "different-identities",
  NOT_IN_SEASON: "not-in-season",
};

// Build a same-player, multi-season comparison. Returns { ok, rows, refused, coverage }.
export function samePlayerAcrossSeasons(anchor, years, seasons, coverageOf) {
  const key = identityKey(anchor);
  if (!key) return { ok: false, refused: COMPARE_REFUSED.NO_IDENTITY, rows: [], coverage: [],
    reason: "This player has no verified cross-season identity, so the Index cannot prove which row in another season is the same person." };

  const rows = [], coverage = [];
  for (const year of (years || []).slice().sort((a, b) => a - b)) {
    const index = buildIdentityIndex(seasons[year] || []);
    const r = resolve(anchor, index);
    if (r.join !== JOIN.PROVIDER) { rows.push({ year, row: null, join: r.join, reason: r.reason }); }
    else rows.push({ year, row: r.row, join: r.join, reason: r.reason });
    coverage.push({ year, ...(typeof coverageOf === "function" ? coverageOf(year) : {}) });
  }
  return { ok: rows.some(r => r.row), refused: null, rows, coverage, key };
}

// Two selections may only be compared across seasons when they are provably the same person.
export function canCompareAcrossSeasons(a, b) {
  const ka = identityKey(a), kb = identityKey(b);
  if (!ka || !kb) return { ok: false, refused: COMPARE_REFUSED.NO_IDENTITY };
  if (ka !== kb) return { ok: false, refused: COMPARE_REFUSED.DIFFERENT_PLAYERS };
  return { ok: true, key: ka };
}

// A season-over-season grade gap is a RECORDED DIFFERENCE, not a verdict. Coverage differs between
// seasons — the archive has no goalkeeper metrics and no fixture data — so calling a lower number a
// decline would attribute to the player what is actually a difference in what was measured.
export function gradeDifference(a, b) {
  if (a == null || b == null || !isFinite(a) || !isFinite(b)) return { known: false, delta: null, label: "—" };
  const d = +(b - a).toFixed(1);
  return { known: true, delta: d, label: `recorded grade difference ${d > 0 ? "+" : ""}${d}`, direction: d === 0 ? "level" : (d > 0 ? "higher" : "lower") };
}

// True when two seasons were measured with different instruments, so any comparison needs a warning.
export function coverageDiffers(a, b) {
  if (!a || !b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!!a[k] !== !!b[k]) return true;
  return false;
}

export function coverageWarning(years, coverage) {
  const gaps = [];
  for (const c of coverage || []) {
    const missing = Object.entries(c).filter(([k, v]) => k !== "year" && v === false).map(([k]) => k);
    if (missing.length) gaps.push(`${c.year} has no ${missing.join(", ")}`);
  }
  if (!gaps.length) return null;
  return `These seasons were not measured the same way: ${gaps.join("; ")}. Numbers that exist in one season and not another are shown as —, and a difference between grades is a recorded difference, not an improvement or a decline.`;
}
