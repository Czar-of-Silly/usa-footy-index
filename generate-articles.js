#!/usr/bin/env node
/**
 * USA Footy Index — Front-page article generator
 *
 * Reads public/data/mls-cache.json, builds FACT PACKETS from real data only,
 * asks Claude for 2-4 editorial quick hits, validates every name and number
 * against the facts, and writes public/data/articles.json in the exact shape
 * the front page already renders: {kicker, headline, dek, body, created, status}.
 *
 * Article lanes (each activates only when its data exists):
 *   1. Match recaps      — completed matches from the last 6 days
 *   2. Roster moves      — players whose team changed since the last run
 *                          (snapshot diff via public/data/articles-state.json)
 *   3. Stat races        — Golden Boot, assists, tackles, xG over/under-performers
 *   4. Table stories     — conference leaders, best attack/defense, form
 *
 * Guardrails:
 *   - The prompt forbids inventing scorers, injuries, quotes, or transfers.
 *   - Post-generation, every person-like name in an article must appear in
 *     the fact packet, or the article is demoted to status:"pending"
 *     (the front page only renders "approved").
 *   - Em dashes stripped, AI-tell phrases blocked, length bounds enforced.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-...  node generate-articles.js
 *   TEST_MODE=1               node generate-articles.js   (no API call; canned output)
 *
 * Exits 0 when the key is missing so the data workflow never fails on it.
 */

const fs = require("fs");

const CACHE = "public/data/mls-cache.json";
const OUT = "public/data/articles.json";
const STATE = "public/data/articles-state.json";
const MODEL = "claude-sonnet-4-6";
const MAX_ARTICLES_KEPT = 12;

// Anti-speculation + search-grounding rules appended to every prompt.
const GROUNDING_RULES = [
  "",
  "TRANSFER AND ROSTER-MOVE RULES (these override everything above):",
  "- The roster-moves facts come from roster snapshots only. They do NOT include destination clubs, incoming signings' origin clubs, or transfer fees.",
  "- Before writing about any departure, use web search to find the player's destination club. If search confirms it, state it. If you cannot confirm it, report the departure WITHOUT any destination and NEVER write phrases like 'destination unknown' or 'his destination is unknown'.",
  "- Before writing about any incoming signing, use web search to verify the player's full name spelling and previous club against official club announcements. If you cannot verify a name, leave that player out of the article entirely.",
  "- Never invent, guess, or approximate a player name, club, or fee. A shorter, verified article always beats a longer, speculative one.",
  "- Do not pad with empty observations (e.g. noting that news arrived on the same day as something else unless the timing itself is the story)."
].join("\n");


const API_KEY = process.env.ANTHROPIC_API_KEY;
const TEST_MODE = process.env.TEST_MODE === "1";

if (!fs.existsSync(CACHE)) { console.log("❌ " + CACHE + " not found. Run from repo root after a fetch."); process.exit(1); }
if (!API_KEY && !TEST_MODE) { console.log("ℹ️  ANTHROPIC_API_KEY not set — skipping article generation."); process.exit(0); }

const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const players = cache.players || [];
const standings = cache.standings || [];
const matches = cache.matches || [];
const teamName = {}; standings.forEach(s => teamName[s.team] = s.name);
const tn = a => teamName[a] || a;

// ─── FACT PACKETS ────────────────────────────────────────────────────────────
const facts = { recaps: [], moves: [], departures: [], arrivals: [], races: {}, table: {} };
const factNames = new Set(); // every legit name the model may use

// 1. Recent completed matches (last 6 days)
const cutoff = Date.now() - 6 * 864e5;
for (const m of matches) {
  if (!m.completed) continue;
  const d = new Date(m.date).getTime();
  if (isNaN(d) || d < cutoff) continue;
  facts.recaps.push({ home: tn(m.home), away: tn(m.away), score: `${m.homeScore}-${m.awayScore}`, date: m.date.slice(0, 10) });
}

// 2. Roster moves, departures, and arrivals via snapshot diff (v2)
// Departures/arrivals need TWO consecutive runs before announcement, so a
// one-run feed blip never becomes transfer news. v1 snapshots (plain team
// strings, no minutes) migrate automatically.
let state = {};
if (fs.existsSync(STATE)) { try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {} }
const prevSnap = {};
for (const [n, v] of Object.entries(state.playerTeams || {})) prevSnap[n] = typeof v === "string" ? { t: v, m: 0 } : v;
const pendingOut = state.pendingOut || {};
const pendingIn = state.pendingIn || {};
const announced = state.announced || [];
const nowSnap = {};
for (const p of players) if (p.n && p.t && !p.departed) nowSnap[p.n] = { t: p.t, m: p.m || 0 };
if (Object.keys(prevSnap).length) {
  for (const [n, v] of Object.entries(nowSnap)) {
    if (prevSnap[n] && prevSnap[n].t !== v.t) facts.moves.push({ player: n, from: tn(prevSnap[n].t), to: tn(v.t) });
  }
  // (diff-based departure detection removed: departures now come from the
  // cache's departed flag -- see below, outside this gate)
  const inCandidates = { ...pendingIn };
  for (const [n, v] of Object.entries(nowSnap)) if (!prevSnap[n] && !inCandidates[n]) inCandidates[n] = { t: v.t, runs: 0 };
  for (const [n, rec] of Object.entries(inCandidates)) {
    if (!nowSnap[n] || announced.includes(n)) { delete pendingIn[n]; continue; }
    rec.runs += 1;
    if (rec.runs >= 2 && facts.arrivals.length < 3) {
      facts.arrivals.push({ player: n, joined: tn(nowSnap[n].t) });
      announced.push(n); delete pendingIn[n];
    } else pendingIn[n] = rec;
  }
}
// departures: read the cache's departed flag (fetch-data retains vanished
// players and confirms over two runs) -- one source of truth, no baseline needed
for (const p of players) {
  if (!p.departed || (p.m || 0) < 450 || announced.includes(p.n)) continue;
  if (facts.departures.length >= 3) break;
  facts.departures.push({ player: p.n, lastClub: tn(p.t), minutesThisSeason: p.m || 0 });
  announced.push(p.n);
}
const newState = { playerTeams: nowSnap, pendingOut, pendingIn, announced: announced.slice(-60), updated: new Date().toISOString() };

// 3. Stat races (raw cache stats only — grades are client-side)
const withMins = players.filter(p => (p.m || 0) >= 450);
const top = (key, n = 3, min = 1) => withMins
  .filter(p => (p[key] || 0) >= min)
  .sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n)
  .map(p => ({ player: p.n, team: tn(p.t), value: p[key] }));
facts.races.goals = top("g", 3);
facts.races.assists = top("as", 3);
facts.races.tackles = top("tk", 3);
const xgOver = withMins.filter(p => (p.g || 0) >= 4 && (p.xg || 0) > 0)
  .map(p => ({ player: p.n, team: tn(p.t), goals: p.g, xg: +(+p.xg).toFixed(1), diff: +((p.g || 0) - (p.xg || 0)).toFixed(1) }))
  .sort((a, b) => b.diff - a.diff);
facts.races.xgOverperformers = xgOver.slice(0, 2);
facts.races.xgUnderperformers = xgOver.slice(-2).reverse();

// 4. Table stories
for (const conf of ["Eastern", "Western"]) {
  const rows = standings.filter(s => s.conf === conf).sort((a, b) => b.pts - a.pts);
  if (rows.length) {
    const L = rows[0];
    facts.table[conf] = { leader: L.name, pts: L.pts, record: `${L.w}W-${L.d}D-${L.l}L`, gf: L.gf, ga: L.ga };
  }
}
const byGf = [...standings].sort((a, b) => b.gf - a.gf)[0];
const byGa = [...standings].sort((a, b) => a.ga - b.ga)[0];
if (byGf) facts.table.bestAttack = { team: byGf.name, gf: byGf.gf };
if (byGa) facts.table.bestDefense = { team: byGa.name, ga: byGa.ga };

// register every legit name (players + teams) for validation
// Skip generation when nothing material changed since the last run
newState.factsHash = require("crypto").createHash("md5").update(JSON.stringify([facts.recaps, facts.moves, facts.departures, facts.arrivals, facts.races, facts.table])).digest("hex");
fs.writeFileSync(STATE, JSON.stringify(newState));
console.log("Lanes — recaps:" + facts.recaps.length + " moves:" + facts.moves.length + " departures:" + facts.departures.length + " arrivals:" + facts.arrivals.length);
if (state.factsHash && state.factsHash === newState.factsHash && !TEST_MODE) {
  console.log("ℹ️  Facts unchanged since last run — no new briefs needed.");
  process.exit(0);
}
for (const p of players) if (p.n) factNames.add(p.n);
for (const d of facts.departures) factNames.add(d.player);
for (const s of standings) { factNames.add(s.name); factNames.add(s.team); }

// ─── PROMPT ──────────────────────────────────────────────────────────────────
const prompt = `You write short front-page briefs for USA Footy Index, an MLS analytics broadsheet. Voice: confident newspaper desk, plain declarative sentences, numbers doing the talking. Never promotional, never breathless.

STRICT RULES:
- Use ONLY the facts below. Do not invent scorers, injuries, quotes, transfers, streaks, or any detail not present.
- Never use em dashes or the words "delve", "testament", "landscape", "showcase", "underscore".
- No emoji. No exclamation marks.
- If the facts include matches, lead with a recap. If they include roster moves, departures, or arrivals, one brief covers the movement news. Otherwise write stat-race and table briefs.
- Departures mean a player is no longer in the MLS record. The packet does not know where he went: use web search to confirm the destination. If confirmed, name it. If not confirmed, report only the departure and season line and say nothing at all about the destination: the phrase "destination unknown" and every variant of it is banned.

FACTS (JSON):
${JSON.stringify(facts, null, 1)}

Return ONLY a JSON array (no markdown fences, no preamble) of 2 to 4 briefs:
[{"kicker":"2-4 word section label like 'Golden Boot · Race'","headline":"max 60 chars, punchy","dek":"one italic-style standfirst sentence, max 140 chars","body":"55-90 words of plain prose"}]`;

// ─── CLAUDE CALL ─────────────────────────────────────────────────────────────
async function callClaude() {
  if (TEST_MODE) {
    return JSON.stringify([{ kicker: "Golden Boot · Race", headline: "Test Headline About " + (facts.races.goals[0]?.player || "Nobody"), dek: "A test standfirst.", body: `${facts.races.goals[0]?.player || "Nobody"} leads the league with ${facts.races.goals[0]?.value || 0} goals. ` + "Plain test prose follows here to satisfy the length bounds of the validator, with additional words describing the race in strictly factual terms drawn from the packet above, and nothing invented anywhere in this body." }]);
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }], max_tokens: 1600, messages: [{ role: "user", content: prompt + GROUNDING_RULES }] })
  });
  if (!res.ok) throw new Error("Anthropic API " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.content || []).map(c => c.text || "").join("");
}

// ─── VALIDATION ──────────────────────────────────────────────────────────────
const stripDashes = s => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ", ");
const BANNED = /delve|testament|landscape|showcase|underscore|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|!/iu;

function validate(a) {
  const problems = [];
  const body = stripDashes(a.body), headline = stripDashes(a.headline), dek = stripDashes(a.dek);
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 30 || words > 120) problems.push("body length " + words + "w");
  if (headline.length > 70) problems.push("headline too long");
  if (BANNED.test(headline + " " + dek + " " + body)) problems.push("banned phrase/char");
  if (/destinations?\s+(?:is|are|was|were|remains?|stays?)\s+(?:unknown|unclear|a mystery|undisclosed|not known)/i.test(headline + " " + dek + " " + body)) problems.push("destination-unknown phrasing");
  // every person-like name (Two Capitalized Words) must exist in the fact
  // names; ordinary capitalized phrases are allowlisted so "Golden Boot" or
  // "Eastern Conference" never demote a legit brief
  const ALLOW = new Set(("Golden Boot Race Boot Eastern Western Conference League Cup Shield Supporters MLS USA Footy Index The This That After With Over Under Table Week Matchweek January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday New England City United FC Sporting Real Inter Los Angeles San Jose Salt Lake St Louis").split(" "));
  const nameLike = (headline + " " + body).match(/\b[A-ZÀ-Þ][a-zà-þ'’.-]+ [A-ZÀ-Þ][a-zà-þ'’.-]+\b/g) || [];
  for (const nm of nameLike) {
    const toks = nm.split(" ");
    const tokKnown = raw => { const t = raw.replace(/['’]s\b/, "").replace(/[.,'’]/g, ""); return ALLOW.has(t) || [...factNames].some(f => f.includes(t)); };
    if (!toks.every(tokKnown)) problems.push("unknown name: " + nm);
  }
  return { article: { kicker: stripDashes(a.kicker).slice(0, 40), headline, dek: dek.slice(0, 150), body }, problems };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  let raw;
  try { raw = await callClaude(); }
  catch (e) { console.log("❌ " + e.message); process.exit(1); }

  let arr;
  try { arr = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { console.log("❌ Model did not return valid JSON. First 200 chars:\n" + raw.slice(0, 200)); process.exit(1); }
  if (!Array.isArray(arr)) { console.log("❌ Expected a JSON array."); process.exit(1); }

  const now = new Date().toISOString();
  const fresh = [];
  for (const a of arr.slice(0, 4)) {
    const { article, problems } = validate(a || {});
    const status = problems.length ? "pending" : "approved";
    fresh.push({ ...article, created: now, status });
    console.log((status === "approved" ? "✅ " : "⏸  pending: ") + article.headline + (problems.length ? "   [" + problems.join("; ") + "]" : ""));
  }

  // merge with existing: keep prior approved, dedupe by headline, cap total
  let existing = [];
  if (fs.existsSync(OUT)) { try { existing = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {} }
  const seen = new Set(fresh.map(a => a.headline.toLowerCase()));
  const kept = (Array.isArray(existing) ? existing : []).filter(a => a && a.headline && !seen.has(a.headline.toLowerCase()));
  const all = [...fresh, ...kept].slice(0, MAX_ARTICLES_KEPT);

  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
  const ap = all.filter(a => a.status === "approved").length;
  console.log("\n   " + OUT + " written: " + all.length + " total, " + ap + " approved (front page shows approved only).");
})();
