// check-blocks.js - test which sources are accessible
const TESTS = [
  ["ESPN MLS API", "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard"],
  ["ASA Players", "https://app.americansocceranalysis.com/api/v1/mls/players?minimum_minutes=0"],
  ["Sofascore Seasons", "https://api.sofascore.com/api/v1/unique-tournament/242/seasons"],
  ["FBref Homepage", "https://fbref.com/en/"],
  ["FBref MLS Stats", "https://fbref.com/en/comps/22/stats/Major-League-Soccer-Stats"],
  ["Understat.com", "https://understat.com/league/MLS"],
];

const HDR_BROWSER = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

(async () => {
  console.log("\nTesting access from your IP:\n");
  for (const [name, url] of TESTS) {
    try {
      const res = await fetch(url, { headers: HDR_BROWSER });
      const status = res.status;
      const blocked = status === 403 || status === 429;
      const icon = blocked ? "❌ BLOCKED" : status >= 200 && status < 400 ? "✅ OK" : `⚠️  ${status}`;
      console.log(`  ${icon}  ${name.padEnd(25)} (${status})`);
    } catch(e) {
      console.log(`  ❌ ERROR  ${name.padEnd(25)} (${e.message})`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log();
})();
