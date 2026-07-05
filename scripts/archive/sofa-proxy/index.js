const SOFA = "https://api.sofascore.com/api/v1";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- TEMPORARY DIAGNOSTIC: /debug shows whether SECRET is wired + length match ---
    if (url.pathname === "/debug") {
      const tok = url.searchParams.get("token") || "";
      return new Response(JSON.stringify({
        secret_is_set: typeof env.SECRET === "string" && env.SECRET.length > 0,
        secret_length: env.SECRET ? env.SECRET.length : 0,
        token_length: tok.length,
        lengths_match: (env.SECRET ? env.SECRET.length : 0) === tok.length,
        exact_match: env.SECRET === tok
      }, null, 2), { headers: { "content-type": "application/json" } });
    }
    // --- end diagnostic ---

    if (url.searchParams.get("token") !== env.SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const q = url.searchParams.get("q");
    if (!q) return new Response("missing q param", { status: 400 });

    let resp;
    try {
      resp = await fetch(SOFA + q, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Referer": "https://www.sofascore.com/",
          "Origin": "https://www.sofascore.com",
          "Sec-Ch-Ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": "\"Windows\"",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-site",
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ proxy_error: String(e) }), { status: 502 });
    }

    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        "content-type": "application/json",
        "x-sofa-status": String(resp.status),
        "access-control-allow-origin": "*"
      }
    });
  }
};
