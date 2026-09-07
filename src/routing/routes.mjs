// routing/routes.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// ─── ROUTES (Phase 3) ─────────────────────────────────────────────────
// slugify must stay identical to build-routes.js (server-side) so /players/<slug> resolves the same player.
export function slugify(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}

export const ROUTE_PATHS={front:"/",ask:"/ask",players:"/players",season:"/season-ratings",defense:"/defense",passing:"/passing",teams:"/teams",rankings:"/power-rankings",leaders:"/leaders",valuations:"/values",positions:"/positions",compare:"/compare",trade:"/trade-machine",matchup:"/matchup",matchups:"/matchups",methodology:"/methodology"};

export const PATH_TABS=Object.fromEntries(Object.entries(ROUTE_PATHS).map(([k,v])=>[v,k]));

PATH_TABS["/table"]="rankings";

PATH_TABS["/standings"]="rankings";

PATH_TABS["/valuations"]="valuations";

PATH_TABS["/trade"]="trade";

PATH_TABS["/season"]="season";

PATH_TABS["/data-status"]="methodology";

PATH_TABS["/about-the-index"]="methodology";

export const SITE_TITLE="USA Footy Index \u2014 MLS Player Analytics & Grades for Every Player";

