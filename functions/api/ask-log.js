// GET /api/ask-log?token=YOUR_TOKEN
// Returns the most recent Ask USFI questions (up to 200, newest last).
// Requires: ASK_LOGS KV binding + ASK_LOG_TOKEN env var in the Pages dashboard.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.ASK_LOG_TOKEN || url.searchParams.get("token") !== env.ASK_LOG_TOKEN)
    return new Response("Not found", { status: 404 });
  if (!env.ASK_LOGS)
    return new Response(JSON.stringify({ error: "ASK_LOGS KV binding not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const list = await env.ASK_LOGS.list({ prefix: "q:", limit: 1000 });
  const keys = list.keys.map(k => k.name).sort().slice(-200); // keys embed timestamp → sorted = chronological
  const rows = [];
  for (const k of keys) {
    const v = await env.ASK_LOGS.get(k);
    if (v) { try { rows.push(JSON.parse(v)); } catch (e) {} }
  }
  return new Response(JSON.stringify({ count: rows.length, totalKeys: list.keys.length, truncated: !list.list_complete, questions: rows }, null, 2),
    { headers: { "Content-Type": "application/json" } });
}
