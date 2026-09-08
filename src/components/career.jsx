// components/career.jsx — Phase 6B.1. The player modal's cross-season panel: a compact career
// summary, a gap-preserving history chart, the season table, and safe season drill-through.
//
// Design rules, all deliberate:
//   • A season with no row is an explicit gap ("not in the record"), never a zero.
//   • Assists the source never had render as the site's em dash, never as 0 and never as "n/a".
//   • Archive-season grades carry a coverage caveat — they are NOT presented as directly
//     comparable to the current season, because the inputs differ.
//   • Summary figures are "best RECORDED" values; nothing here implies improvement or decline.
//   • Positional rank is within that season and that position group only.
//   • Seasons are joined by exact player name. Zero matches or more than one exact match means no
//     join and no drill-through — an ambiguous row is preferred to a wrong one.
//   • Goalkeepers get keeper category names; the underlying field mapping is unchanged.
import { careerSubgradeLabels, careerSummary, comparabilityWarning, historySeries, IDENTITY_NOTE, POS_GROUP_LABEL, seasonDescription } from "../analytics/archive.mjs";
import { T, gc } from "../theme.mjs";
import { sv } from "../util/format.mjs";

const head = (t) => <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textMute, marginBottom: 8 }}>{t}</div>;

// ─── HISTORY CHART ───────────────────────────────────────────────────────────
// Lightweight inline SVG: three seasons do not justify a charting library. No fixed pixel width —
// the viewBox scales to the container, so it stays readable on a phone. Points are individual and
// a missing season breaks the line rather than being interpolated across.
export function SeasonHistoryChart({ series, currentSeason }) {
  const { years, points, segments } = series;
  if (!years.length) return null;
  const recorded = points.filter(p => p.recorded);
  if (!recorded.length) return null;

  // No fixed pixel width: the viewBox is what scales. A narrower viewBox on a phone means the same
  // labels come out proportionally larger once the SVG is scaled down to the container.
  const narrow = typeof window !== "undefined" && window.innerWidth < 600;
  const W = narrow ? 320 : 560, H = narrow ? 168 : 150;
  const padL = narrow ? 28 : 34, padR = narrow ? 12 : 18, padT = 26, padB = narrow ? 52 : 46;
  const vals = recorded.map(p => p.season.overall);
  const rawMn = Math.min(...vals), rawMx = Math.max(...vals);
  const mid = (rawMn + rawMx) / 2, span = Math.max(rawMx - rawMn, 12);
  const mn = Math.max(0, mid - span / 2 - 4), mx = Math.min(99, mid + span / 2 + 4);
  const range = Math.max(mx - mn, 1);
  const n = years.length;
  const x = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : i * ((W - padL - padR) / (n - 1)));
  const y = (v) => padT + (1 - (v - mn) / range) * (H - padT - padB);
  const idxOf = (yr) => years.indexOf(yr);
  const ticks = [mn, (mn + mx) / 2, mx].map(v => Math.round(v)).filter((v, i, a) => a.indexOf(v) === i);
  const label = recorded.map(p => seasonDescription(p.season)).join("; ");
  const gaps = points.filter(p => !p.recorded);

  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={"Index Overall grade by season. " + label + (gaps.length ? ". Not in the record: " + gaps.map(g => g.year).join(", ") + "." : "")}
      style={{ display: "block", width: "100%", height: "auto", fontFamily: T.sans, overflow: "visible" }}>
      {ticks.map(v => <g key={v}>
        <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={T.borderLt} strokeWidth="1" />
        <text x={padL - 6} y={y(v) + 3.5} fontSize="10.5" fill={T.textMute} textAnchor="end" fontFamily="JetBrains Mono,monospace">{v}</text>
      </g>)}
      {/* connected runs only — a missing season is a break in the line, not a straight-line guess */}
      {segments.map((seg, si) => <path key={si} fill="none" stroke={T.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        d={"M" + seg.map(p => `${x(idxOf(p.year)).toFixed(1)},${y(p.season.overall).toFixed(1)}`).join("L")} />)}
      {points.map((p, i) => {
        const px = x(idxOf(p.year));
        if (!p.recorded) {
          return <g key={p.year}>
            <line x1={px} x2={px} y1={padT - 6} y2={H - padB + 6} stroke={T.borderLt} strokeWidth="1" strokeDasharray="2 4" />
            <text x={px} y={H - padB - 6} fontSize={narrow ? 9 : 10} fill={T.textMute} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontStyle="italic" fontFamily={T.serif}>{narrow ? "no row" : "not in the record"}</text>
            <text x={px} y={H - padB + 20} fontSize="12" fontWeight="700" fill={T.textMute} textAnchor="middle" fontFamily="JetBrains Mono,monospace">{p.year}</text>
          </g>;
        }
        const s = p.season, py = y(s.overall), isCur = s.year === currentSeason;
        return <g key={p.year}>
          <title>{seasonDescription(s)}</title>
          <circle cx={px} cy={py} r={isCur ? 6 : 5} fill={gc(s.overall)} stroke={T.bg} strokeWidth="2" />
          <text x={px} y={py - 12} fontSize="13" fontWeight="700" fill={T.ink} textAnchor="middle" fontFamily="JetBrains Mono,monospace">{s.overall}</text>
          <text x={px} y={H - padB + 20} fontSize="12" fontWeight="700" fill={T.ink} textAnchor="middle" fontFamily="JetBrains Mono,monospace">{s.year}</text>
          {s.posRank != null && <text x={px} y={H - padB + 34} fontSize="10" fill={T.textDim} textAnchor="middle" fontFamily="JetBrains Mono,monospace">#{s.posRank} {s.posGroup || ""}</text>}
          {s.year !== currentSeason && <text x={px} y={padT - 12} fontSize="9" fill={T.textMute} textAnchor="middle" letterSpacing="1">ARCHIVE</text>}
        </g>;
      })}
    </svg>
    <div style={{ fontFamily: T.sans, fontSize: 11, color: T.textMute, marginTop: 4 }}>
      Overall grade per recorded season. Points are individual seasons; a season the Index has no row for leaves a gap rather than a line drawn through it. Club and minutes are in each point's tooltip and in the chart description.
    </div>
  </div>;
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
function SummaryTile({ label, value, sub }) {
  return <div style={{ border: `1px solid ${T.borderLt}`, background: T.card, padding: "8px 10px", minWidth: 0 }}>
    <div style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: T.textMute }}>{label}</div>
    <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 20, color: T.ink, lineHeight: 1.15, marginTop: 3, wordBreak: "break-word" }}>{value}</div>
    {sub && <div style={{ fontFamily: T.sans, fontSize: 10.5, color: T.textDim, marginTop: 2 }}>{sub}</div>}
  </div>;
}

export function CareerSummary({ summary }) {
  if (!summary) return null;
  const { seasons, latestClub, latestYear, bestOverall, bestRank, mostMins, peakSub } = summary;
  return <div style={{ marginBottom: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(122px,1fr))", gap: 8 }}>
      <SummaryTile label="Seasons in Index" value={seasons} sub={seasons === 1 ? "one recorded season" : "recorded seasons"} />
      <SummaryTile label="Latest club" value={latestClub || "—"} sub={latestYear != null ? String(latestYear) : null} />
      <SummaryTile label="Best grade" value={bestOverall ? bestOverall.value : "—"} sub={bestOverall ? bestOverall.year + " · best recorded" : null} />
      <SummaryTile label="Best rank" value={bestRank ? "#" + bestRank.rank : "—"} sub={bestRank ? `${bestRank.year} · ${bestRank.of != null ? "of " + bestRank.of + " " : ""}${POS_GROUP_LABEL[bestRank.group] || ""}`.trim() : null} />
      <SummaryTile label="Peak skill" value={peakSub ? peakSub.value : "—"} sub={peakSub ? peakSub.label + " · " + peakSub.year : null} />
      <SummaryTile label="Most minutes" value={mostMins ? mostMins.value.toLocaleString() : "—"} sub={mostMins ? mostMins.year + " · in one season" : null} />
    </div>
    <div style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
      These are the best <b>recorded</b> values across the seasons the Index holds. Coverage differs between the archive and the current season, so they are not evidence that a player improved or declined.
    </div>
  </div>;
}

// ─── CAREER AT A GLANCE ──────────────────────────────────────────────────────
export function CareerAtAGlance({ player, history, allSeasons, currentSeason, viewingSeason, onDrill, canDrill }) {
  const seasons = Array.isArray(history) ? history : [];
  if (!seasons.length) return null;
  const byYear = {}; seasons.forEach(s => { byYear[s.year] = s; });
  const years = (allSeasons && allSeasons.length ? allSeasons : seasons.map(s => s.year)).slice().sort((a, b) => a - b);
  const rows = seasons.filter(s => !s.ambiguous && s.overall != null);
  const tracked = years.filter(y => byYear[y] && !byYear[y].ambiguous && byYear[y].overall != null);
  const archiveYears = tracked.filter(y => y !== currentSeason);
  const clubs = tracked.map(y => byYear[y].team).filter(Boolean);
  const movedClub = clubs.length > 1 && new Set(clubs).size > 1;

  const isGK = !!(player && (player.position === "GK" || player.position === "Goalkeeper")) || rows.some(s => s.isGK);
  const SUBS = careerSubgradeLabels(isGK);
  const summary = careerSummary(rows, { isGK });
  const series = historySeries(years, rows);
  const warn = comparabilityWarning(archiveYears, currentSeason);

  const HEADS = ["Season", "Club", "Grade", "Rank in position", "Min", "G", "A", ...SUBS.map(s => s[0])];
  const GAP_COLSPAN = HEADS.length - 1; // everything except the Season cell — keeps the row aligned

  const cell = { padding: "7px 8px", borderBottom: `1px dotted ${T.borderLt}` };

  return <div className="resp-pad" style={{ padding: "16px 32px", borderBottom: `1px solid ${T.borderLt}` }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {head("Career at a glance")}
      <div style={{ fontFamily: T.sans, fontSize: 11.5, color: T.textMute }}>{tracked.length} season{tracked.length === 1 ? "" : "s"} in the record</div>
    </div>

    <CareerSummary summary={summary} />

    <div style={{ margin: "6px 0 14px" }}><SeasonHistoryChart series={series} currentSeason={currentSeason} /></div>

    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: T.mono, fontSize: 12 }}>
        <thead><tr>
          {HEADS.map((h, i) => {
            const full = i >= 7 ? SUBS[i - 7][2] : null;
            return <th key={h} title={full || undefined} style={{ textAlign: h === "Season" || h === "Club" || h === "Rank in position" ? "left" : "right", padding: "6px 8px", borderBottom: `2px solid ${T.ink}`, fontWeight: 700, fontSize: 10, letterSpacing: 1, color: T.textDim, whiteSpace: "nowrap" }}>{h}</th>;
          })}
        </tr></thead>
        <tbody>
          {years.map(y => {
            const s = byYear[y];
            if (!s || (s.overall == null && !s.ambiguous)) {
              // Explicit gap: this season exists in the record but this player does not appear in it.
              return <tr key={y}>
                <td style={{ ...cell, fontWeight: 700, color: T.textMute }}>{y}</td>
                <td colSpan={GAP_COLSPAN} style={{ ...cell, color: T.textMute, fontFamily: T.serif, fontStyle: "italic", fontSize: 12.5 }}>Not in the record for this season</td>
              </tr>;
            }
            if (s.ambiguous) {
              // More than one player carries this exact name in that season. Joining on it would be a
              // guess, so the row states that rather than showing someone else's numbers.
              return <tr key={y}>
                <td style={{ ...cell, fontWeight: 700, color: T.textMute }}>{y}</td>
                <td colSpan={GAP_COLSPAN} style={{ ...cell, color: T.textMute, fontFamily: T.serif, fontStyle: "italic", fontSize: 12.5 }}>More than one player in {y} carries this exact name — not matched, because the join would be a guess</td>
              </tr>;
            }
            const isArchive = y !== currentSeason;
            const isViewing = viewingSeason != null && y === viewingSeason;
            const drillable = !isViewing && typeof onDrill === "function" && (typeof canDrill !== "function" || canDrill(y, player && player.name));
            const rowProps = drillable
              // Keyboard activation comes from the app's delegated .rh / role=button handler, the
              // same path every other clickable row in the site uses.
              ? { className: "rh", role: "button", tabIndex: 0, onClick: () => onDrill(y), style: { cursor: "pointer" }, title: `Open ${player && player.name ? player.name : "this player"} in the ${y} season`, "aria-label": `Switch to the ${y} season and open ${player && player.name ? player.name : "this player"}` }
              : { "aria-disabled": isViewing ? undefined : "true" };
            return <tr key={y} {...rowProps}>
              <td style={{ ...cell, fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}>
                {y}
                {isArchive && <span title="Archive season — different metric coverage" style={{ marginLeft: 6, fontSize: 9, fontFamily: T.sans, fontWeight: 700, color: T.textMute, background: `${T.textMute}15`, padding: "1px 4px", letterSpacing: .5 }}>ARCHIVE</span>}
                {s.prov && <span title="Provisional — under 450 minutes" style={{ marginLeft: 4, fontSize: 9, fontFamily: T.sans, fontWeight: 700, color: T.textMute, background: `${T.textMute}15`, padding: "1px 4px", letterSpacing: .5 }}>PROV</span>}
                {isViewing
                  ? <span style={{ marginLeft: 6, fontSize: 9, fontFamily: T.sans, fontWeight: 700, color: T.accent, letterSpacing: .5 }}>VIEWING</span>
                  : drillable
                    ? <span aria-hidden="true" style={{ marginLeft: 6, fontSize: 10, fontFamily: T.sans, fontWeight: 700, color: T.accent }}>{"→"}</span>
                    : <span title="No unique exact-name match in that season, so this row does not link" style={{ marginLeft: 6, fontSize: 9, fontFamily: T.sans, color: T.textMute, letterSpacing: .5 }}>NO LINK</span>}
              </td>
              <td style={{ ...cell, color: T.textDim, whiteSpace: "nowrap" }}>{s.team || "—"}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: gc(s.overall) }}>{s.overall}</td>
              <td style={{ ...cell, color: T.textDim, whiteSpace: "nowrap" }}>
                {s.posRank ? `#${s.posRank} of ${s.posOf} ${POS_GROUP_LABEL[s.posGroup] || ""}` : "—"}
              </td>
              <td style={{ ...cell, textAlign: "right", color: T.textDim }}>{sv(s.mins)}</td>
              <td style={{ ...cell, textAlign: "right", color: T.textDim }}>{sv(s.goals)}</td>
              <td title={s.assists != null ? undefined : "This season's source did not carry real assist counts, so the value is unavailable rather than zero"} style={{ ...cell, textAlign: "right", color: s.assists != null ? T.textDim : T.textMute }}>{sv(s.assists)}</td>
              {SUBS.map(([short, key, full]) => <td key={short} title={full} style={{ ...cell, textAlign: "right", color: gc(s[key]) }}>{s[key]}</td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {movedClub && <div style={{ fontFamily: T.serif, fontSize: 13, color: T.text, marginTop: 10 }}>
      Club across tracked seasons: {tracked.map((y, i) => <span key={y}>{i > 0 && <span style={{ color: T.textMute }}> {"→"} </span>}<b>{byYear[y].team}</b> <span style={{ color: T.textMute, fontSize: 12 }}>({y})</span></span>)}
    </div>}

    <div style={{ marginTop: 10, padding: "10px 12px", border: `1px dashed ${T.border}`, fontFamily: T.sans, fontSize: 12, color: T.textDim, lineHeight: 1.55 }}>
      {warn && <div style={{ marginBottom: 6 }}><b>{warn.headline}</b> {warn.detail}</div>}
      <div>{IDENTITY_NOTE}</div>
    </div>
  </div>;
}
