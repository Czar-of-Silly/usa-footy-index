// functions/api/ask.js
// Cloudflare Pages Function — Ask USFI chatbot endpoint
// Endpoint: POST /api/ask with JSON { question: "who is the best defender?" }
// Returns:  { answer: "..." }
//
// The ANTHROPIC_API_KEY is set as a Cloudflare Pages environment variable
// (dashboard -> the Pages project -> Settings -> Environment variables).
// It is never exposed to browsers.
//
// Context strategy: always include standings + leaders (small), and full stat
// rows only for players whose names appear in the question — so a typical
// call costs a fraction of a cent on Haiku.

const MODEL = "claude-haiku-4-5";
const MAX_QUESTION = 300;
const MAX_ANSWER_TOKENS = 450;

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Ask USFI isn't configured yet." }, 500);

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "").trim().slice(0, MAX_QUESTION);
    if (question.length < 3) return json({ error: "Ask a real question." }, 400);

    // very light per-IP throttle via Cloudflare cache (best-effort, not a wall)
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const throttleKey = new Request("https://throttle.usfi/" + ip + "/" + Math.floor(Date.now() / 60000));
    const cacheHit = await caches.default.match(throttleKey);
    const count = cacheHit ? parseInt(await cacheHit.text(), 10) : 0;
    if (count >= 12) return json({ error: "Easy on the desk — try again in a minute." }, 429);
    await caches.default.put(throttleKey, new Response(String(count + 1), { headers: { "Cache-Control": "max-age=60" } }));

    // load the compact context the data pipeline builds
    const ctxRes = await env.ASSETS.fetch(new URL("/data/ask-context.json", request.url));
    if (!ctxRes.ok) return json({ error: "The record is being rebuilt — try again shortly." }, 503);
    const ctx = await ctxRes.json();

    // question-aware packing: leaders + standings always; full rows for named players
    const qTokens = question.toLowerCase().match(/[a-zà-þ'’-]{4,}/g) || [];
    const matched = [];
    for (const row of ctx.players || []) {
      const name = String(row[0]).toLowerCase();
      if (qTokens.some(t => name.includes(t))) { matched.push(row); if (matched.length >= 12) break; }
    }
    // team-aware packing: if the question names a team, include its roster rows
    const qWords = new Set(question.toLowerCase().replace(/./g, "").match(/[a-zà-þ'’-]+/g) || []);
    const GENERIC = new Set(["united", "city", "club", "football", "fc", "sc", "cf"]);
    const teamHits = [];
    for (const s of ctx.standings || []) {
      const abbr = String(s.team || "").toLowerCase();
      const nameToks = (String(s.name || "").toLowerCase().replace(/./g, "").match(/[a-zà-þ'’-]{2,}/g) || []).filter(t => !GENERIC.has(t));
      if ((abbr && qWords.has(abbr)) || nameToks.some(t => qWords.has(t))) {
        teamHits.push(s.team);
        if (teamHits.length >= 3) break;
      }
    }
    const teamRows = {};
    for (const row of ctx.players || []) {
      if (!teamHits.includes(row[1])) continue;
      (teamRows[row[1]] = teamRows[row[1]] || []).push(row);
    }
    for (const t of Object.keys(teamRows)) {
      teamRows[t] = teamRows[t].sort((a, b) => (b[7] || 0) - (a[7] || 0)).slice(0, 30);
    }

    const packed = {
      note: ctx.note, season: ctx.season, dataAsOf: ctx.generated,
      standings: ctx.standings,
      topRatedByPosition: ctx.topRatedByPosition,
      topScorers: ctx.topScorers, topAssists: ctx.topAssists, topTacklers: ctx.topTacklers,
      playersMentionedInQuestion: matched,
      teamsMentionedInQuestion: teamRows
    };

    const prompt = `You are the desk assistant for USA Footy Index, an MLS analytics broadsheet. Answer the reader's question using ONLY the data record below. Voice: plain, confident newspaper desk. Two to five sentences, no lists, no em dashes, no exclamation marks, no emoji.

If the record doesn't contain what's needed, say so plainly and suggest what the Index does track. Never invent stats, transfers, injuries, or players. Grades are on the Index's 42-99 scale.

DATA RECORD:
${JSON.stringify(packed)}

READER'S QUESTION: ${question}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_ANSWER_TOKENS, messages: [{ role: "user", content: prompt }] })
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 120);
      return json({ error: "The desk is briefly unavailable.", detail }, 502);
    }
    const data = await res.json();
    let answer = (data.content || []).map(c => c.text || "").join("").trim();
    answer = answer.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ", ");
    if (!answer) return json({ error: "No answer came back — try rephrasing." }, 502);

    return json({ answer });
  } catch (e) {
    return json({ error: "Something went sideways at the desk." }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
