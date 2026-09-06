// functions/[[path]].js — serves the SPA shell for every page URL and rewrites the <head>
// per route (title, description, canonical, Open Graph, Twitter, JSON-LD) so link previews
// and crawlers see real player/team metadata. Static assets never reach this function
// (see public/_routes.json). /api/* is handled by the more specific functions/api/*.js.
const SITE = "https://usfootyindex.com";
const SITE_NAME = "USA Footy Index";
const DEFAULT_IMG = SITE + "/og-image.png";
const SECTIONS = {
  "/": null,
  "/players": ["Player Grades \u2014 MLS", "PFF-style composite grades for every MLS player, ranked. Position-weighted, minutes-adjusted, updated after every matchweek."],
  "/teams": ["Team Grades \u2014 MLS", "Minutes-weighted composite grades for all 30 MLS clubs, with full roster breakdowns."],
  "/power-rankings": ["MLS Power Rankings & Table", "Composite power rankings (points, team grade, recent form) alongside the official MLS standings."],
  "/table": "/power-rankings", "/standings": "/power-rankings",
  "/leaders": ["MLS Stat Leaders, Team of the Week & Best XI", "Golden Boot race, assists, Goals Added, xG, save quality, and the highest-graded XI of the week."],
  "/values": ["MLS Market Values & Value Efficiency", "Market values for MLS players and who delivers the most grade per dollar."],
  "/valuations": "/values",
  "/positions": ["MLS Positional Rankings", "The best MLS players at every position, graded and ranked."],
  "/compare": ["Compare MLS Players", "Head-to-head radar comparison of up to three MLS players across attack, passing, defense, creativity and carrying."],
  "/trade-machine": ["MLS Trade Machine", "Build a trade between MLS clubs and see how the Index grades it."],
  "/trade": "/trade-machine",
  "/ask": ["Ask USFI \u2014 MLS questions, answered from the Index", "Ask questions about MLS players, grades, races and the table, answered strictly from the Index record."],
  "/season-ratings": ["MLS Season Ratings", "Full-season composite ratings with form curves and consistency for every MLS player."],
  "/season": "/season-ratings",
  "/defense": ["MLS Defensive Grades", "Defensive grades, tackles, aerials, pressures and clearances for every MLS player."],
  "/passing": ["MLS Passing Grades", "Passing grades, completion vs expected, progressive and final-third passing for every MLS player."],
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const shellReq = new Request(new URL("/", url.origin), { headers: request.headers, method: "GET" });
  const shell = await env.ASSETS.fetch(shellReq);
  if (!shell.ok) return shell;

  let meta = null, status = 200;
  let sec = SECTIONS[path], canonPath = path;
  if (typeof sec === "string") { canonPath = sec; sec = SECTIONS[sec]; }
  const seg = path.split("/").filter(Boolean);

  if ((seg[0] === "players" || seg[0] === "teams") && seg[1]) {
    let routes = null;
    try { const r = await env.ASSETS.fetch(new URL("/data/routes.json", url.origin)); if (r.ok) routes = await r.json(); } catch (e) { routes = null; }
    const slug = decodeURIComponent(seg[1]);
    if (routes && seg[0] === "players" && routes.players && routes.players[slug]) {
      const p = routes.players[slug];
      const grade = p.g != null ? " \u00b7 Grade " + p.g : "";
      const stats = [p.gl != null ? p.gl + " G" : null, p.as != null ? p.as + " A" : null, p.m != null ? p.m + " min" : null].filter(Boolean).join(", ");
      meta = {
        title: p.n + " \u2014 " + p.pos + ", " + (p.tn || p.t) + grade + " | " + SITE_NAME,
        desc: p.n + " (" + p.pos + ", " + (p.tn || p.t) + "): USA Footy Index grade " + (p.g != null ? p.g : "not yet rated") + (stats ? " \u00b7 " + stats : "") + " in the " + routes.season + " MLS season. Grades, per-90 production, match log and comparisons.",
        url: SITE + "/players/" + slug,
        image: p.h ? SITE + "/" + p.h.replace(/^\.?\//, "") : DEFAULT_IMG,
        card: p.h ? "summary" : "summary_large_image",
        jsonld: { "@context": "https://schema.org", "@type": "Person", name: p.n, url: SITE + "/players/" + slug, jobTitle: "Soccer player (" + p.pos + ")", affiliation: { "@type": "SportsTeam", name: p.tn || p.t, sport: "Soccer" }, ...(p.h ? { image: SITE + "/" + p.h.replace(/^\.?\//, "") } : {}) },
      };
    } else if (routes && seg[0] === "teams" && routes.teams && routes.teams[slug]) {
      const t = routes.teams[slug];
      meta = {
        title: t.name + " \u2014 Team Grade" + (t.g != null ? " " + t.g : "") + " & Roster | " + SITE_NAME,
        desc: t.name + " (" + t.conf + " Conference): USA Footy Index team grade " + (t.g != null ? t.g : "\u2014") + (t.pts != null ? ", " + t.pts + " points" : "") + (t.rank != null ? ", #" + t.rank + " in the composite rankings" : "") + ". Graded roster, best players and squad value.",
        url: SITE + "/teams/" + slug,
        image: t.logo || DEFAULT_IMG,
        card: t.logo ? "summary" : "summary_large_image",
        jsonld: { "@context": "https://schema.org", "@type": "SportsTeam", name: t.name, sport: "Soccer", url: SITE + "/teams/" + slug, memberOf: { "@type": "SportsOrganization", name: "Major League Soccer" }, ...(t.logo ? { logo: t.logo } : {}) },
      };
    } else {
      status = 404;
      meta = { title: "Not found | " + SITE_NAME, desc: "That page does not exist in the Index.", url: SITE + path, image: DEFAULT_IMG, card: "summary_large_image", noindex: true };
    }
  } else if (Array.isArray(sec)) {
    meta = { title: sec[0] + " | " + SITE_NAME, desc: sec[1], url: SITE + canonPath, image: DEFAULT_IMG, card: "summary_large_image" };
  } else if (path !== "/") {
    status = 404;
    meta = { title: "Not found | " + SITE_NAME, desc: "That page does not exist in the Index.", url: SITE + path, image: DEFAULT_IMG, card: "summary_large_image", noindex: true };
  }

  const headers = new Headers(shell.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
  if (!meta) return new Response(shell.body, { status: 200, headers });

  const set = (attr, val) => ({ element(e) { e.setAttribute(attr, val); } });
  const rw = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(meta.title); } })
    .on('meta[name="description"]', set("content", meta.desc))
    .on('link[rel="canonical"]', set("href", meta.url))
    .on('meta[property="og:title"]', set("content", meta.title))
    .on('meta[property="og:description"]', set("content", meta.desc))
    .on('meta[property="og:url"]', set("content", meta.url))
    .on('meta[property="og:image"]', set("content", meta.image))
    .on('meta[property="og:type"]', set("content", meta.jsonld && meta.jsonld["@type"] === "Person" ? "profile" : "website"))
    .on('meta[name="twitter:card"]', set("content", meta.card))
    .on('meta[name="twitter:title"]', set("content", meta.title))
    .on('meta[name="twitter:description"]', set("content", meta.desc))
    .on('meta[name="twitter:image"]', set("content", meta.image))
    .on('meta[name="robots"]', set("content", meta.noindex ? "noindex, nofollow" : "index, follow"))
    .on("head", { element(e) {
      if (meta.jsonld) e.append('<script type="application/ld+json">' + JSON.stringify(meta.jsonld).replace(/</g, "\\u003c") + "</script>", { html: true });
    } });
  if (meta.image !== DEFAULT_IMG) {
    rw.on('meta[property="og:image:width"]', { element(e) { e.remove(); } }).on('meta[property="og:image:height"]', { element(e) { e.remove(); } });
  }
  return rw.transform(new Response(shell.body, { status, headers }));
}
