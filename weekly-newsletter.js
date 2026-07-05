#!/usr/bin/env node
/**
 * USA Footy Index — Weekly Newsletter Generator (season-stats rebuild)
 *
 * The previous version was built entirely on matchLog (TOTW, movers) and
 * completed matches (recent results). The pipeline no longer produces either,
 * so this rebuild leads with the data that IS populated: the table and season
 * stat leaders. It degrades UP automatically: if matchLog reappears in the
 * cache, the Team of the Week block is added back on top.
 *
 * Sends nothing. Writes public/data/newsletter-latest.html for you to paste
 * into Beehiiv (or wire to Beehiiv's API later).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node weekly-newsletter.js
 *   ARTICLES_MOCK=1 node weekly-newsletter.js   (offline test, skips API)
 */

const fs = require("fs");
const path = require("path");

const CACHE_1 = path.join(__dirname, "public", "data", "mls-cache.json");
const CACHE_2 = path.join(__dirname, "data", "mls-cache.json");
const CACHE_PATH = fs.existsSync(CACHE_1) ? CACHE_1 : CACHE_2;
const OUT_PATH = path.join(__dirname, "public", "data", "newsletter-latest.html");
const MODEL = "claude-sonnet-4-6";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MOCK = !!process.env.ARTICLES_MOCK;

// ── HELPERS ─────────────────────────────────────────────────────────────
const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function stripDashes(t) {
  return t ? t.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").replace(/\s+([.,;:])/g, "$1").trim() : t;
}
function gc(g) { return g >= 85 ? "#B68D40" : g >= 75 ? "#2D6A4F" : g >= 65 ? "#264653" : g >= 55 ? "#6B6560" : "#9B2226"; }
function posCode(p) {
  const z = String(p || "").toLowerCase();
  if (z.startsWith("goal")) return "GK";
  if (z.startsWith("def")) return "DEF";
  if (z.startsWith("mid")) return "MID";
  return "FWD";
}
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

async function callClaude(prompt) {
  if (MOCK) return null;
  if (!API_KEY) { console.log("  ⚠ No ANTHROPIC_API_KEY, skipping AI narrative"); return null; }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (data.error) { console.log("  ⚠ API error:", data.error.message); return null; }
    return data.content?.[0]?.text || null;
  } catch (e) { console.log("  ⚠ API request failed:", e.message); return null; }
}

// ── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📰 USA Footy Index, Weekly Newsletter (season-stats build)\n");
  if (!fs.existsSync(CACHE_PATH)) { console.log("❌ No cache at", CACHE_PATH); process.exit(1); }

  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  const played = (cache.players || []).filter((p) => num(p.m) > 0);
  const standings = cache.standings || [];
  const matches = cache.matches || [];
  console.log(`  ${played.length} players w/ minutes, ${standings.length} teams, ${matches.length} fixtures`);

  // Leaders
  const byG = [...played].sort((a, b) => num(b.g) - num(a.g)).slice(0, 5);
  const byA = [...played].sort((a, b) => num(b.as) - num(a.as)).slice(0, 5);
  const byXG = [...played].sort((a, b) => num(b.xg) - num(a.xg)).slice(0, 5);
  const gks = played.filter((p) => posCode(p.p) === "GK").sort((a, b) => num(b.sv) - num(a.sv)).slice(0, 3);

  // xG performers (season form proxy), min 600 mins
  const finPool = played.filter((p) => num(p.m) >= 600 && num(p.xg) >= 2).map((p) => ({ p, d: num(p.g) - num(p.xg) }));
  const over = [...finPool].sort((a, b) => b.d - a.d).slice(0, 3);
  const under = [...finPool].sort((a, b) => a.d - b.d).slice(0, 3);

  // Power rankings (standings + season production proxy)
  const teamStats = {};
  played.forEach((p) => {
    (teamStats[p.t] = teamStats[p.t] || { s: 0, n: 0 });
    teamStats[p.t].s += num(p.g) * 2 + num(p.as) * 1.5 + num(p.tk) * 0.5;
    teamStats[p.t].n += 1;
  });
  const maxPts = Math.max(...standings.map((s) => num(s.pts)), 1);
  const power = standings.map((s) => {
    const avg = teamStats[s.team] ? teamStats[s.team].s / teamStats[s.team].n : 0;
    return { ...s, power: Math.round((num(s.pts) / maxPts) * 100 * 0.6 + avg * 0.4) };
  }).sort((a, b) => b.power - a.power).map((t, i) => ({ ...t, rank: i + 1 }));

  // Conference leaders for the narrative
  const conf = {};
  standings.forEach((t) => (conf[t.conf] = conf[t.conf] || []).push(t));
  const confLead = Object.keys(conf).map((c) => [...conf[c]].sort((a, b) => num(b.pts) - num(a.pts))[0]).filter(Boolean);

  // Optional: Team of the Week if matchLog ever returns
  const hasLogs = (cache.players || []).some((p) => Array.isArray(p.matchLog) && p.matchLog.length);

  // Upcoming fixtures
  const fixtures = [...matches].filter((m) => !m.completed).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 8);

  // ── AI NARRATIVE ──
  console.log("\n✍️  Generating narrative...");
  const prompt = `You write the intro for "USA Footy Index Weekly", a 2026 MLS analytics newsletter.

Write two short paragraphs (about 110 words total) from these facts:
- Conference leaders: ${confLead.map((t) => `${t.name} (${t.conf}, ${t.pts}pts, ${t.w}-${t.d}-${t.l})`).join("; ")}.
- Golden Boot lead: ${byG[0] ? `${byG[0].n} (${byG[0].t}) ${num(byG[0].g)} goals` : "n/a"}.
- xG leader: ${byXG[0] ? `${byXG[0].n} (${byXG[0].t}) ${num(byXG[0].xg).toFixed(1)} xG` : "n/a"}.
- Hottest finisher vs xG: ${over[0] ? `${over[0].p.n} (${over[0].p.t}) +${over[0].d.toFixed(1)} over expected` : "n/a"}.

House style, follow exactly: no em-dashes or en-dashes, use commas or periods. No rhetorical questions. No hedging adverbs. Lead with the fact then the context. Plain text only, no headers, no markdown.`;
  let narrative = await callClaude(prompt);
  narrative = narrative ? stripDashes(narrative) : null;

  // ── BUILD HTML ──
  console.log("📝 Building HTML...");
  const season = cache.season || new Date().getFullYear();
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const leaderRows = (arr, val, fmt) => arr.map((p, i) => `<tr style="border-bottom:1px solid #EDE9E0;">
        <td style="padding:5px 0;color:#A09A90;width:20px;">${i + 1}</td>
        <td style="padding:5px 0;font-weight:bold;color:#1A1A1A;">${esc(p.n)}</td>
        <td style="padding:5px 0;color:#6B6560;">${esc(p.t)}</td>
        <td style="padding:5px 0;text-align:right;font-weight:bold;color:#1A1A1A;">${fmt ? fmt(val(p)) : val(p)}</td>
      </tr>`).join("\n      ");

  const leaderBlock = (title, arr, val, fmt) => `<div style="margin-bottom:18px;">
      <div style="font-size:11px;color:#2D6A4F;font-weight:bold;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${title}</div>
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
      ${leaderRows(arr, val, fmt)}
      </table>
    </div>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>USA Footy Index Weekly</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:Georgia,'Times New Roman',serif;">
<div style="max-width:600px;margin:0 auto;background:#FFFFFF;">

  <div style="padding:24px 32px;border-bottom:3px solid #1A1A1A;text-align:center;">
    <div style="font-size:11px;color:#A09A90;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">USA FOOTY INDEX</div>
    <div style="font-size:28px;font-weight:bold;color:#1A1A1A;margin-top:8px;">Weekly Report</div>
    <div style="font-size:13px;color:#6B6560;font-family:Arial,sans-serif;margin-top:4px;">${today} · ${season} MLS Season</div>
  </div>

  ${narrative ? `<div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:14px;color:#1A1A1A;line-height:1.7;white-space:pre-wrap;">${esc(narrative)}</div>
  </div>` : ""}

  <div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:14px;">SEASON LEADERS</div>
    ${leaderBlock("Goals", byG, (p) => num(p.g))}
    ${leaderBlock("Assists", byA, (p) => num(p.as))}
    ${leaderBlock("Expected Goals (xG)", byXG, (p) => num(p.xg), (v) => v.toFixed(1))}
    ${leaderBlock("Goalkeeper Saves", gks, (p) => num(p.sv))}
  </div>

  <div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">POWER RANKINGS, TOP 10</div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
      ${power.slice(0, 10).map((t) => `<tr style="border-bottom:1px solid #EDE9E0;">
        <td style="padding:5px 0;font-weight:900;font-size:16px;color:${t.rank <= 3 ? "#B68D40" : "#6B6560"};width:24px;">${t.rank}</td>
        <td style="padding:5px 0;font-weight:bold;color:#1A1A1A;">${esc(t.name || t.team)}</td>
        <td style="padding:5px 0;color:#6B6560;">${t.w}-${t.d}-${t.l}</td>
        <td style="padding:5px 0;color:#6B6560;">${t.pts} pts</td>
        <td style="padding:5px 0;text-align:right;font-weight:bold;color:${gc(t.power)};">${t.power}</td>
      </tr>`).join("\n      ")}
    </table>
  </div>

  ${over.length ? `<div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">FINISHING vs xG</div>
    <div style="font-size:11px;color:#2D6A4F;font-weight:bold;font-family:Arial,sans-serif;margin-bottom:6px;">OVERPERFORMING</div>
    ${over.map((o) => `<div style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;"><strong>${esc(o.p.n)}</strong> (${esc(o.p.t)}) <span style="color:#2D6A4F;font-weight:bold;">+${o.d.toFixed(1)}</span> · ${num(o.p.g)}G from ${num(o.p.xg).toFixed(1)} xG</div>`).join("\n    ")}
    <div style="font-size:11px;color:#9B2226;font-weight:bold;font-family:Arial,sans-serif;margin:12px 0 6px;">UNDERPERFORMING</div>
    ${under.map((o) => `<div style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;"><strong>${esc(o.p.n)}</strong> (${esc(o.p.t)}) <span style="color:#9B2226;font-weight:bold;">${o.d.toFixed(1)}</span> · ${num(o.p.g)}G from ${num(o.p.xg).toFixed(1)} xG</div>`).join("\n    ")}
  </div>` : ""}

  ${fixtures.length ? `<div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">UPCOMING FIXTURES</div>
    ${fixtures.map((m) => `<div style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#1A1A1A;">
        <span style="color:#A09A90;font-size:11px;display:inline-block;width:52px;">${fmtDate(m.date)}</span>
        <strong>${esc(m.home)}</strong> <span style="color:#A09A90;">vs</span> <strong>${esc(m.away)}</strong>
      </div>`).join("\n    ")}
  </div>` : ""}

  <div style="padding:24px 32px;text-align:center;">
    <div style="margin-bottom:16px;">
      <a href="https://usfootyindex.com" style="display:inline-block;background:#1A1A1A;color:#F4F1EA;padding:10px 28px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;border-radius:4px;">Explore Full Stats →</a>
    </div>
    <div style="font-size:10px;color:#A09A90;font-family:Arial,sans-serif;line-height:1.6;">
      USA Footy Index · usfootyindex.com<br>
      Data from ESPN, American Soccer Analysis, official MLS (Opta)<br>
      <a href="https://usfootyindex.beehiiv.com" style="color:#6B6560;">Manage subscription</a>
    </div>
  </div>

</div>
</body>
</html>`;

  fs.writeFileSync(OUT_PATH, html);
  console.log(`\n✅ Newsletter saved to ${OUT_PATH} (${html.length} bytes)`);
  console.log(`   leaders: ${byG[0]?.n || "?"} (G), ${byA[0]?.n || "?"} (A) · power top: ${power[0]?.name || power[0]?.team || "?"}`);
  if (hasLogs) console.log("   (matchLog detected, a TOTW block can be re-enabled, ping me)");
  console.log("\n📋 Next: open the HTML to preview, then paste into Beehiiv's editor. No auto-send.");
}

main().catch((e) => { console.error(e); process.exit(1); });
