// src/data/source-join.mjs — Phase 6D. How an importer attaches a provider's rows to a roster.
//
// THE BUG THIS REPLACES
// Both importers matched a roster player to a source row like this:
//
//     const last = stripAccents(parts[parts.length - 1]);
//     const fi   = stripAccents(parts[0][0] || "");
//     ... if (surname matches && first initial matches) return v;   // first hit wins
//
// Surname plus one letter is not an identity. It put Cade Cowell's season onto Chance Cowell's card,
// Neil Pierre's onto Nelson Pierre's, and Santiago Rodríguez's onto Sebastián Rodríguez's — all three
// live on the production site, all three with byte-identical stat lines. A second, quieter version of
// the same bug lived in the source maps themselves: `bySomething[name] = row` silently kept whichever
// of two same-named players was written last.
//
// THE RULE HERE
// A source row reaches a roster player only when the evidence names that player and no one else:
//   1. a provider id both sides carry               — the only real identity
//   2. an exact display name, unique on both sides  — documented fallback, no accent folding
//   3. otherwise: unresolved, and the fields stay unknown
// And a source row may be claimed by at most one roster player. If two claim it, both are refused —
// letting the first win is precisely how the contamination happened.

export const JOIN_KIND = {
  ID: "provider-id",
  NAME: "exact-name",
  AMBIGUOUS: "ambiguous",
  UNRESOLVED: "unresolved",
};

// Index source rows. `nameOf`/`idOf` pull the display name and (optional) provider id off a row.
// Names held by more than one row are recorded, never collapsed.
export function indexSource(rows, nameOf, idOf) {
  const gname = typeof nameOf === "function" ? nameOf : (r => r && r.name);
  const gid = typeof idOf === "function" ? idOf : (r => r && r.id);
  const byId = Object.create(null);
  const byName = Object.create(null);      // name -> array of rows, collisions preserved
  const idConflicts = [];
  for (const r of rows || []) {
    const id = gid(r);
    if (id !== undefined && id !== null && id !== "") {
      if (String(id) in byId) idConflicts.push(String(id));
      else byId[String(id)] = r;
    }
    const n = gname(r);
    if (n == null || n === "") continue;
    (byName[n] = byName[n] || []).push(r);
  }
  return { byId, byName, idConflicts };
}

// Resolve one roster player against an indexed source.
// `player` may carry `ids: {asa, opta, ...}`; `provider` names which id to try.
export function resolveOne(player, index, provider) {
  if (!player || !index) return { kind: JOIN_KIND.UNRESOLVED, row: null, reason: "no input" };

  const pid = provider && player.ids ? player.ids[provider] : null;
  if (pid !== undefined && pid !== null && pid !== "") {
    const hit = index.byId[String(pid)];
    if (hit) return { kind: JOIN_KIND.ID, row: hit, reason: `${provider}:${pid}` };
    return { kind: JOIN_KIND.UNRESOLVED, row: null, reason: `${provider}:${pid} not present in this source` };
  }

  const n = player.name != null ? player.name : player.n;
  if (n == null || n === "") return { kind: JOIN_KIND.UNRESOLVED, row: null, reason: "player has no name" };
  const hits = index.byName[n] || [];
  if (hits.length === 1) return { kind: JOIN_KIND.NAME, row: hits[0], reason: `exactly one source row named "${n}"` };
  if (hits.length === 0) return { kind: JOIN_KIND.UNRESOLVED, row: null, reason: `no source row named "${n}"` };
  return { kind: JOIN_KIND.AMBIGUOUS, row: null, reason: `${hits.length} source rows named "${n}"` };
}

// Resolve a whole roster, then enforce one-row-one-player.
export function joinRoster(players, index, provider) {
  const res = (players || []).map(p => resolveOne(p, index, provider));

  const claims = new Map();
  res.forEach((r, i) => { if (r.row) { const a = claims.get(r.row) || []; a.push(i); claims.set(r.row, a); } });
  for (const [row, idxs] of claims) {
    if (idxs.length < 2) continue;
    const who = idxs.map(i => (players[i] && (players[i].name || players[i].n)) || "?").join(", ");
    for (const i of idxs)
      res[i] = { kind: JOIN_KIND.AMBIGUOUS, row: null, reason: `this source row was claimed by ${idxs.length} roster players (${who}) — refused for all of them` };
  }
  return res;
}

export function joinStats(res) {
  const s = { [JOIN_KIND.ID]: 0, [JOIN_KIND.NAME]: 0, [JOIN_KIND.AMBIGUOUS]: 0, [JOIN_KIND.UNRESOLVED]: 0 };
  for (const r of res || []) if (r && r.kind in s) s[r.kind]++;
  return s;
}

// A missing measurement is UNKNOWN. `|| 0` turns "we do not know" into "it happened zero times",
// which then reads as a real observation everywhere downstream.
export function known(v) { return v === null || v === undefined || (typeof v === "number" && !isFinite(v)) ? null : v; }

// Minutes decide every per-90 and the PROV threshold, so a fabricated default is not a safe
// convenience — it invents a season. `mins(...)` returns null when no source reported any.
export function mins(...candidates) {
  for (const c of candidates) { const n = Number(c); if (isFinite(n) && n > 0) return n; }
  return null;
}
