#!/usr/bin/env node
/**
 * USA Footy Index — Weekly Newsletter Generator
 * Reads mls-cache.json, computes TOTW/movers/rankings,
 * calls Claude API for narrative blurbs, outputs newsletter HTML.
 * 
 * Usage: ANTHROPIC_API_KEY=sk-... node weekly-newsletter.js
 * Or set the key in GitHub Actions secrets.
 */

const fs = require("fs");
const path = require("path");

// ── CONFIG ──────────────────────────────────────────────────────────────
const CACHE_PATH_1 = path.join(__dirname, "public", "data", "mls-cache.json");
const CACHE_PATH_2 = path.join(__dirname, "data", "mls-cache.json");
const CACHE_PATH = fs.existsSync(CACHE_PATH_1) ? CACHE_PATH_1 : CACHE_PATH_2;
const OUTPUT_PATH = path.join(__dirname, "public", "data", "newsletter-latest.html");
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── HELPERS ─────────────────────────────────────────────────────────────
function rateGame(m) {
  let r = 55;
  r += (m.g || 0) * 12;
  r += (m.a || 0) * 8;
  r += (m.sot || 0) * 2;
  r += (m.sh || 0) * 0.5;
  r -= (m.fl || 0) * 1;
  r -= (m.yc || 0) * 3;
  r -= (m.rc || 0) * 10;
  r += (m.mins || 0) >= 80 ? 3 : (m.mins || 0) >= 45 ? 2 : 1;
  return Math.max(42, Math.min(99, Math.round(r)));
}

function gc(g) {
  if (g >= 85) return "#B68D40";
  if (g >= 75) return "#2D6A4F";
  if (g >= 65) return "#264653";
  if (g >= 55) return "#6B6560";
  return "#9B2226";
}

function gl(g) {
  if (g >= 85) return "ELITE";
  if (g >= 75) return "GREAT";
  if (g >= 65) return "ABOVE AVG";
  if (g >= 55) return "AVG";
  return "BELOW AVG";
}

async function callClaude(prompt) {
  if (!API_KEY) {
    console.log("  ⚠ No ANTHROPIC_API_KEY — skipping AI narrative");
    return null;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (e) {
    console.log("  ⚠ Claude API error:", e.message);
    return null;
  }
}

// ── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📰 USA Footy Index — Weekly Newsletter Generator\n");

  if (!fs.existsSync(CACHE_PATH)) {
    console.log("❌ No cache file found at", CACHE_PATH);
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  const players = cache.players || [];
  const standings = cache.standings || [];
  const matches = cache.matches || [];

  console.log(`  ${players.length} players, ${standings.length} teams, ${matches.length} matches`);

  // ── TEAM OF THE WEEK ──────────────────────────────────────────────
  console.log("\n⚽ Computing Team of the Week...");
  const allLogs = [];
  players.forEach((pl) => {
    (pl.matchLog || []).forEach((m) => {
      if (!m.date) return;
      const dateKey = m.date.slice(0, 10);
      const rating = rateGame(m);
      allLogs.push({ player: pl, dateKey, rating, ...m });
    });
  });

  // Group into matchweeks
  const byDate = {};
  allLogs.forEach((l) => {
    if (!byDate[l.dateKey]) byDate[l.dateKey] = [];
    byDate[l.dateKey].push(l);
  });
  const dateKeys = Object.keys(byDate).sort();
  const weeks = [];
  let current = [];
  dateKeys.forEach((dk, i) => {
    current.push(dk);
    const next = dateKeys[i + 1];
    if (!next || new Date(next) - new Date(dk) > 3 * 86400000) {
      weeks.push({ dates: [...current], logs: current.flatMap((d) => byDate[d]) });
      current = [];
    }
  });

  const latestWeek = weeks[weeks.length - 1];
  const weekNum = weeks.length;

  // Best at each position
  const bestAt = (positions) => {
    const eligible = latestWeek.logs.filter((l) => positions.includes(l.player.p));
    eligible.sort((a, b) => b.rating - a.rating);
    const seen = new Set();
    return eligible.filter((l) => {
      if (seen.has(l.player.n)) return false;
      seen.add(l.player.n);
      return true;
    });
  };

  const fwLogs = bestAt(["Forward", "FW"]);
  const mfLogs = bestAt(["Midfielder", "MF"]);
  const dfLogs = bestAt(["Defender", "DF", "DEF"]);
  const gkLogs = bestAt(["GK", "Goalkeeper"]);

  const totwXi = [
    fwLogs[0], fwLogs[1], fwLogs[2],
    mfLogs[0], mfLogs[1], mfLogs[2],
    dfLogs[0], dfLogs[1], dfLogs[2], dfLogs[3],
    gkLogs[0],
  ].filter(Boolean);

  const topPerf = [...latestWeek.logs]
    .sort((a, b) => b.rating - a.rating)
    .filter((l, i, arr) => arr.findIndex((x) => x.player.n === l.player.n) === i)
    .slice(0, 5);

  const starOfWeek = topPerf[0];
  console.log(`  MW${weekNum}: ${totwXi.length} players, star: ${starOfWeek?.player?.n} (${starOfWeek?.rating})`);

  // ── POWER RANKINGS ────────────────────────────────────────────────
  console.log("\n📊 Computing Power Rankings...");
  // Simple: points + goals added proxy
  const teamStats = {};
  players.forEach((p) => {
    if (!teamStats[p.t]) teamStats[p.t] = { grades: [], count: 0 };
    // Use a simple overall proxy: goals + assists weighted
    teamStats[p.t].grades.push((p.g || 0) * 2 + (p.as || 0) * 1.5 + (p.tk || 0) * 0.5);
    teamStats[p.t].count++;
  });

  const stMap = {};
  standings.forEach((s) => (stMap[s.team] = s));
  const maxPts = Math.max(...standings.map((s) => s.pts || 0), 1);

  const powerRanked = standings
    .map((s) => {
      const avgGrade = teamStats[s.team]
        ? teamStats[s.team].grades.reduce((a, b) => a + b, 0) / teamStats[s.team].count
        : 0;
      const normPts = ((s.pts || 0) / maxPts) * 100;
      const power = Math.round(normPts * 0.6 + avgGrade * 0.4);
      return { ...s, power, gd: (s.gf || 0) - (s.ga || 0) };
    })
    .sort((a, b) => b.power - a.power)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  console.log(`  Top 3: ${powerRanked.slice(0, 3).map((t) => t.team).join(", ")}`);

  // ── MOVERS ────────────────────────────────────────────────────────
  console.log("\n🔥 Computing Movers...");
  const movers = players
    .filter((p) => p.matchLog && p.matchLog.length >= 5)
    .map((p) => {
      const ratings = p.matchLog.map(rateGame);
      const last5 = ratings.slice(-5);
      const seasonAvg = Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length);
      const formAvg = Math.round(last5.reduce((s, v) => s + v, 0) / last5.length);
      return { ...p, formAvg, seasonAvg, delta: formAvg - seasonAvg };
    });

  const heating = movers.filter((p) => p.delta >= 3).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const cooling = movers.filter((p) => p.delta <= -3).sort((a, b) => a.delta - b.delta).slice(0, 3);
  console.log(`  Heating: ${heating.map((p) => p.n).join(", ") || "none yet"}`);
  console.log(`  Cooling: ${cooling.map((p) => p.n).join(", ") || "none yet"}`);

  // ── RECENT RESULTS ────────────────────────────────────────────────
  const recentMatches = [...matches]
    .filter((m) => m.completed)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 8);

  // ── CLAUDE NARRATIVE ──────────────────────────────────────────────
  console.log("\n✍️  Generating narrative...");
  const narrativePrompt = `You are writing a brief MLS analytics newsletter called "USA Footy Index Weekly" for Matchweek ${weekNum} of the 2026 MLS season.

Write these 4 sections in a punchy, data-driven, slightly opinionated sports writing style. Keep it tight — no fluff.

1. STAR OF THE WEEK (2-3 sentences): ${starOfWeek?.player?.n} (${starOfWeek?.player?.t}) earned a ${starOfWeek?.rating} match rating. They had ${starOfWeek?.g || 0} goals, ${starOfWeek?.a || 0} assists, ${starOfWeek?.sh || 0} shots in ${starOfWeek?.mins || 0} minutes vs ${starOfWeek?.opp || "?"} (${starOfWeek?.ha || "?"}).

2. POWER RANKINGS BLURB (2-3 sentences): Top 3 are ${powerRanked.slice(0, 3).map((t) => `${t.team} (${t.pts}pts, ${t.w}-${t.d}-${t.l})`).join(", ")}. Comment on what separates them.

3. HEATING UP (1 sentence each for up to 3 players): ${heating.length ? heating.map((p) => `${p.n} (${p.t}, ${p.p}) — form ${p.formAvg} vs season ${p.seasonAvg}, delta +${p.delta}`).join("; ") : "No significant movers this week."}

4. ONE THING TO WATCH (1 paragraph): Pick an interesting storyline from this data for next week.

Write in plain text with section headers. No markdown formatting. Keep total length under 300 words.`;

  const narrative = await callClaude(narrativePrompt);

  // ── BUILD HTML ────────────────────────────────────────────────────
  console.log("\n📝 Building newsletter HTML...");

  const weekDates = latestWeek ? (() => {
    const d1 = new Date(latestWeek.dates[0] + "T12:00:00Z");
    const d2 = latestWeek.dates.length > 1 ? new Date(latestWeek.dates[latestWeek.dates.length - 1] + "T12:00:00Z") : d1;
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return latestWeek.dates.length > 1 ? `${fmt(d1)} – ${fmt(d2)}` : fmt(d1);
  })() : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>USA Footy Index Weekly — MW${weekNum}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:Georgia,'Times New Roman',serif;">
<div style="max-width:600px;margin:0 auto;background:#FFFFFF;">

  <!-- Header -->
  <div style="padding:24px 32px;border-bottom:3px solid #1A1A1A;text-align:center;">
    <div style="font-size:11px;color:#A09A90;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">USA FOOTY INDEX</div>
    <div style="font-size:28px;font-weight:bold;color:#1A1A1A;margin-top:8px;">Weekly Report</div>
    <div style="font-size:13px;color:#6B6560;font-family:Arial,sans-serif;margin-top:4px;">Matchweek ${weekNum} · ${weekDates} · 2026 MLS Season</div>
  </div>

  <!-- TOTW -->
  <div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">TEAM OF THE WEEK — MW${weekNum}</div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
      <tr style="border-bottom:1px solid #D6D0C4;">
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;">POS</td>
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;">PLAYER</td>
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;">TEAM</td>
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;text-align:center;">RTG</td>
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;text-align:center;">G</td>
        <td style="padding:6px 0;font-weight:bold;color:#A09A90;font-size:10px;text-align:center;">A</td>
      </tr>
      ${totwXi.map((l) => `<tr style="border-bottom:1px solid #EDE9E0;">
        <td style="padding:6px 0;color:#6B6560;font-size:11px;">${l.player.p}</td>
        <td style="padding:6px 0;font-weight:bold;color:#1A1A1A;">${l.player.n}</td>
        <td style="padding:6px 0;color:#6B6560;">${l.player.t}</td>
        <td style="padding:6px 0;text-align:center;font-weight:bold;color:${gc(l.rating)};">${l.rating}</td>
        <td style="padding:6px 0;text-align:center;color:${l.g > 0 ? "#2D6A4F" : "#A09A90"};">${l.g || 0}</td>
        <td style="padding:6px 0;text-align:center;color:${l.a > 0 ? "#264653" : "#A09A90"};">${l.a || 0}</td>
      </tr>`).join("\n      ")}
    </table>
  </div>

  <!-- AI Narrative -->
  ${narrative ? `<div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:14px;color:#1A1A1A;line-height:1.7;white-space:pre-wrap;">${narrative.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>` : ""}

  <!-- Power Rankings -->
  <div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">POWER RANKINGS — TOP 10</div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
      ${powerRanked.slice(0, 10).map((t) => `<tr style="border-bottom:1px solid #EDE9E0;">
        <td style="padding:5px 0;font-weight:900;font-size:16px;color:${t.rank <= 3 ? "#B68D40" : "#6B6560"};width:24px;">${t.rank}</td>
        <td style="padding:5px 0;font-weight:bold;color:#1A1A1A;">${t.team}</td>
        <td style="padding:5px 0;color:#6B6560;">${t.w}-${t.d}-${t.l}</td>
        <td style="padding:5px 0;color:#6B6560;">${t.pts} pts</td>
        <td style="padding:5px 0;text-align:right;font-weight:bold;color:${gc(t.power)};">${t.power}</td>
      </tr>`).join("\n      ")}
    </table>
  </div>

  <!-- Movers -->
  ${heating.length || cooling.length ? `<div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">MOVERS</div>
    ${heating.length ? `<div style="margin-bottom:16px;">
      <div style="font-size:11px;color:#2D6A4F;font-weight:bold;font-family:Arial,sans-serif;margin-bottom:8px;">🔥 HEATING UP</div>
      ${heating.map((p) => `<div style="padding:6px 0;border-bottom:1px solid #EDE9E0;font-family:Arial,sans-serif;font-size:13px;">
        <strong>${p.n}</strong> (${p.t}) — <span style="color:#2D6A4F;font-weight:bold;">↑${p.delta}</span> · Form: ${p.formAvg} · Season: ${p.seasonAvg}
      </div>`).join("\n      ")}
    </div>` : ""}
    ${cooling.length ? `<div>
      <div style="font-size:11px;color:#9B2226;font-weight:bold;font-family:Arial,sans-serif;margin-bottom:8px;">❄️ COOLING DOWN</div>
      ${cooling.map((p) => `<div style="padding:6px 0;border-bottom:1px solid #EDE9E0;font-family:Arial,sans-serif;font-size:13px;">
        <strong>${p.n}</strong> (${p.t}) — <span style="color:#9B2226;font-weight:bold;">↓${Math.abs(p.delta)}</span> · Form: ${p.formAvg} · Season: ${p.seasonAvg}
      </div>`).join("\n      ")}
    </div>` : ""}
  </div>` : ""}

  <!-- Recent Results -->
  <div style="padding:24px 32px;border-bottom:1px solid #D6D0C4;">
    <div style="font-size:10px;color:#A09A90;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;margin-bottom:12px;">RECENT RESULTS</div>
    ${recentMatches.map((m) => {
      const hs = +(m.homeScore || 0), as = +(m.awayScore || 0);
      return `<div style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;">
        <span style="font-weight:${hs > as ? "bold" : "normal"};color:${hs > as ? "#1A1A1A" : "#6B6560"};">${m.home}</span>
        <span style="font-weight:bold;margin:0 8px;">${hs}–${as}</span>
        <span style="font-weight:${as > hs ? "bold" : "normal"};color:${as > hs ? "#1A1A1A" : "#6B6560"};">${m.away}</span>
      </div>`;
    }).join("\n    ")}
  </div>

  <!-- Footer -->
  <div style="padding:24px 32px;text-align:center;">
    <div style="margin-bottom:16px;">
      <a href="https://usfootyindex.com" style="display:inline-block;background:#1A1A1A;color:#F4F1EA;padding:10px 28px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;border-radius:4px;">Explore Full Stats →</a>
    </div>
    <div style="font-size:10px;color:#A09A90;font-family:Arial,sans-serif;line-height:1.6;">
      USA Footy Index · usfootyindex.com<br>
      Data from ESPN, American Soccer Analysis, Sofascore<br>
      <a href="https://usfootyindex.beehiiv.com" style="color:#6B6560;">Manage subscription</a>
    </div>
  </div>

</div>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(`\n✅ Newsletter saved to ${OUTPUT_PATH}`);
  console.log(`   ${html.length} bytes · MW${weekNum}`);
  console.log("\n📋 Next steps:");
  console.log("   1. Open the HTML file in a browser to preview");
  console.log("   2. Copy the content into Beehiiv's editor");
  console.log("   3. Or use Beehiiv's API to send programmatically\n");
}

main().catch(console.error);
