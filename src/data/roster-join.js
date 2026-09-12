// src/data/roster-join.js — how a roster player claims a provider's source row.
//
// CommonJS and Node-only, like src/data/http.js: required by fetch-data.js, never bundled.
//
// THE INVARIANT
//   A provider source row is never assigned to more than one distinct roster identity.
//
// Phase 6D enforced a weaker version of this and shipped a hole. The claim map compared claimants by
// DISPLAY NAME, so two roster players who share a name were treated as the same claimant and both
// received the row. In the live 2026 cache that gave both "Tiago" entries — two distinct Opta
// players — the single ASA record XVqKLXRaQ0, its stats and its identity. Assigning one provider
// identity to two people is precisely the false join the phase existed to remove.
//
// TWO RULES, BOTH NECESSARY
//   1. A claimant is identified by a stable within-season roster id (sportecId, else optaId), never
//      by its display name. Two rows that share a name are two claimants.
//   2. A display name held by more than one ROSTER row cannot be used for an exact-name lookup at
//      all — the name does not name one person, so it cannot fetch one person's data. (The mirror of
//      the existing rule for names held by more than one SOURCE row.)
//
// Rule 2 alone would fix Tiago; rule 1 alone would not. Together they also close the case where two
// differently-named roster rows reach the same source row by any future path.
//
// WHAT IS STILL REFUSED: fuzzy matching, accent folding, surname heuristics, team-based inference,
// birth-date inference, and name+club synthetic identity keys. Where identity cannot be proven the
// fields stay unavailable — which is an answer, not a gap to fill.
"use strict";

// A claimant key identifies a ROW, and is not a claim about who that row is. sportecId and optaId
// are the provider's own within-season ids (present on 1010 of 1010 current rows); the positional
// fallback exists only so a row with neither still cannot be confused with its neighbour.
function claimantKey(rp, index) {
  const m = (rp && rp._mls) || {};
  if (m.sportecId) return "sportec:" + m.sportecId;
  if (m.optaId) return "opta:" + m.optaId;
  return "#" + index;
}

// ASA rows carry their own player_id, so ownership is keyed by it rather than by the map entry that
// happened to reach it. Other sources have no id; the value itself identifies the row.
function sourceKey(v) {
  if (v && typeof v === "object" && v.asaId) return "asa:" + v.asaId;
  return v;
}

function nameCounts(roster, nameOf) {
  const get = typeof nameOf === "function" ? nameOf : (r => r && r.name);
  const c = Object.create(null);
  for (const r of roster || []) { const n = get(r); if (n != null && n !== "") c[n] = (c[n] || 0) + 1; }
  return c;
}

// Build the lookup used throughout one import run.
//   find(rp, index, ...maps) -> the source row, or null
// `opts.idLookup(rp)` may return a source row matched on a verified provider id the roster row
// already carries. That is the only thing allowed to resolve a duplicate display name, because it
// is the only evidence that distinguishes the two people. Nothing supplies it yet — the ASA id is
// currently discovered BY this lookup — so today a duplicate name simply resolves to nothing.
function createFinder(roster, opts) {
  const o = opts || {};
  const getName = o.nameOf || (r => r && r.name);
  const log = o.log || (() => {});
  const counts = nameCounts(roster, getName);
  const claims = new Map();                 // sourceMap -> Map<sourceKey, claimantKey>
  const stats = { duplicateRosterName: 0, alreadyClaimed: 0, resolvedById: 0, resolvedByName: 0 };

  function find(rp, index, ...maps) {
    const name = getName(rp);
    const claimant = claimantKey(rp, index);

    // 1. a verified id the roster row already carries beats everything, and is the only way past a
    //    duplicate display name
    if (typeof o.idLookup === "function") {
      const hit = o.idLookup(rp);
      if (hit !== undefined && hit !== null) {
        for (const m of maps) if (m && Object.values(m).indexOf(hit) >= 0) { stats.resolvedById++; return hit; }
      }
    }

    if (name == null || name === "") return null;

    // 2. a name shared by two roster rows names neither of them
    if (counts[name] > 1) {
      stats.duplicateRosterName++;
      log(`  [JOIN] "${name}" is carried by ${counts[name]} roster players and no provider id distinguishes them — no name-matched source data for ${claimant}`);
      return null;
    }

    for (const m of maps) {
      if (!m) continue;
      if (!Object.prototype.hasOwnProperty.call(m, name)) continue;
      const v = m[name];
      if (v === undefined || v === null) continue;

      // 3. one source row, one roster identity
      const k = sourceKey(v);
      let seen = claims.get(m);
      if (!seen) { seen = new Map(); claims.set(m, seen); }
      const prior = seen.get(k);
      if (prior !== undefined && prior !== claimant) {
        stats.alreadyClaimed++;
        log(`  [JOIN] refused: source row ${typeof k === "string" ? k : "(unkeyed)"} is already held by ${prior}, also requested by ${claimant} ("${name}")`);
        return null;
      }
      seen.set(k, claimant);
      stats.resolvedByName++;
      return v;
    }
    return null;
  }

  find.stats = stats;
  find.counts = counts;
  find.claimantKey = claimantKey;
  return find;
}

module.exports = { createFinder, claimantKey, sourceKey, nameCounts };
