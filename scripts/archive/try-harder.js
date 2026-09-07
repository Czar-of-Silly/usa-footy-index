// try-harder.js - test if we can bypass with different TLS approach
const https = require("https");

function fetch2(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
      },
      // Loosen TLS to look more like browser
      rejectUnauthorized: true,
      ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  const tests = [
    ["FBref", "https://fbref.com/en/comps/22/stats/Major-League-Soccer-Stats"],
    ["Sofascore", "https://api.sofascore.com/api/v1/unique-tournament/242/seasons"],
  ];
  for (const [name, url] of tests) {
    try {
      const r = await fetch2(url);
      console.log(`${name}: status ${r.status}`);
      if (r.status === 403) {
        console.log(`  Body preview: ${r.body.substring(0, 200)}`);
      } else if (r.status === 200) {
        console.log(`  ✅ Got ${r.body.length} bytes`);
      }
    } catch(e) {
      console.log(`${name}: error ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
})();
