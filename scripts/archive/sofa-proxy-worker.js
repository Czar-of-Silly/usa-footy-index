// sofa-proxy-worker.js  —  Cloudflare Worker
// Proxies Sofascore API requests out through Cloudflare's network (not a flagged
// datacenter IP). Deploy in the Cloudflare dashboard, then point fetch-data.js at it.
//
// DEPLOY (no CLI needed):
//   1. dash.cloudflare.com  →  Workers & Pages  →  Create  →  Workers  →  Create Worker
//   2. Name it e.g. "sofa-proxy", click Deploy, then "Edit code"
//   3. Delete the starter code, paste THIS whole file, set SECRET below, click Deploy
//   4. Your URL will be like  https://sofa-proxy.<your-subdomain>.workers.dev
//
// Then test it (replace URL + token):
//   curl "https://sofa-proxy.<your-subdomain>.workers.dev/?token=YOUR_SECRET&q=%2Funique-tournament%2F242%2Fseasons"
//   -> 200 + JSON means Cloudflare's egress gets past Sofascore. Paste result to Claude.

const SECRET = "CHANGE_ME_to_a_long_random_string";   // <-- set this; must match what the fetcher sends
const SOFA   = "https://api.sofascore.com/api/v1";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // simple abuse guard so this public URL isn't an open proxy
    if (url.searchParams.get("token") !== SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    // q = the Sofascore path (incl. its own query), URL-encoded by the caller
    const q = url.searchParams.get("q");
    if (!q) return new Response("missing q param", { status: 400 });

    let resp;
    try {
      resp = await fetch(SOFA + q, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.sofascore.com/",
          "Origin": "https://www.sofascore.com",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ proxy_error: String(e) }), { status: 502 });
    }

    const body = await resp.text();
    return new Response(body, {
      status: resp.status,                       // pass Sofascore's real status through
      headers: {
        "content-type": "application/json",
        "x-sofa-status": String(resp.status),    // so we can see what Sofascore actually returned
        "access-control-allow-origin": "*",
      },
    });
  },
};
