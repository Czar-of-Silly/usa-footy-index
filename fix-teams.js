const fs = require("fs");
for (const year of [2024, 2025]) {
  const file = `public/data/mls-cache-${year}.json`;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const st = data.standings.map(s => s.team);
  let fixed = 0;
  for (const p of data.players) {
    if (p.t === "FCD") { p.t = "DAL"; fixed++; }
    if (p.t === "KC") { p.t = "SKC"; fixed++; }
  }
  fs.writeFileSync(file, JSON.stringify(data));
  const bad = [...new Set(data.players.map(p=>p.t))].filter(t=>!st.includes(t));
  console.log(`${year}: fixed ${fixed}, remaining mismatches: ${bad.join(",")||"none"}`);
}
