// Run with: node check-sofa.js
const HDR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://www.sofascore.com/"
};

(async () => {
  console.log("Step 1: Fetching seasons...");
  const seasonRes = await fetch("https://api.sofascore.com/api/v1/unique-tournament/242/seasons", { headers: HDR });
  console.log("  Status:", seasonRes.status);
  const seasonText = await seasonRes.text();
  console.log("  Response (first 500 chars):", seasonText.substring(0, 500));
  
  let seasonData;
  try { seasonData = JSON.parse(seasonText); }
  catch(e) { console.log("  Not valid JSON. Sofascore is blocking us."); return; }
  
  if (!seasonData.seasons || !seasonData.seasons.length) {
    console.log("  No seasons. Full response:", seasonText.substring(0, 2000));
    return;
  }
  
  console.log("\nAvailable seasons:");
  seasonData.seasons.slice(0, 5).forEach(s => console.log("  " + (s.year || "?") + " -> ID: " + s.id));
  
  const season = seasonData.seasons.find(s => s.year && s.year.includes("2026")) || seasonData.seasons[0];
  console.log("\nUsing season:", season.year, "ID:", season.id);

  console.log("\nStep 2: Testing statistics endpoint...");
  const fields = "tackles,successfulDribbles,bigChancesCreated,keyPasses,accuratePasses,goals";
  const url = "https://api.sofascore.com/api/v1/unique-tournament/242/season/" + season.id + "/statistics?limit=3&offset=0&order=-tackles&accumulation=total&fields=" + fields;
  
  console.log("  URL:", url);
  const res = await fetch(url, { headers: HDR });
  console.log("  Status:", res.status);
  const text = await res.text();
  console.log("  Response (first 1500 chars):", text.substring(0, 1500));

  let data;
  try { data = JSON.parse(text); }
  catch(e) { console.log("  Not valid JSON"); return; }
  
  if (data.results && data.results[0]) {
    console.log("\nFIELDS in first player:");
    Object.keys(data.results[0]).forEach(k => {
      const val = data.results[0][k];
      if (typeof val !== "object") console.log("    " + k + ": " + val);
      else if (val && val.name) console.log("    " + k + ": { name: \"" + val.name + "\" }");
    });
    
    console.log("\nLooking for missing fields:");
    console.log("  successfulDribbles:", data.results[0].successfulDribbles === undefined ? "MISSING" : data.results[0].successfulDribbles);
    console.log("  bigChancesCreated:", data.results[0].bigChancesCreated === undefined ? "MISSING" : data.results[0].bigChancesCreated);
  } else {
    console.log("\nNo results in response.");
  }
})().catch(e => console.error("ERROR:", e.message));
