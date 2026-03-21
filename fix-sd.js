const fs = require("fs");
const file = "public/data/mls-cache-2024.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const beforeP = data.players.length;
const beforeS = data.standings.length;

data.players = data.players.filter(p => p.t !== "SD");
data.standings = data.standings.filter(s => s.team !== "SD");

console.log(`  Players: ${beforeP} → ${data.players.length} (removed ${beforeP - data.players.length})`);
console.log(`  Standings: ${beforeS} → ${data.standings.length} (removed ${beforeS - data.standings.length})`);

fs.writeFileSync(file, JSON.stringify(data));
console.log("  ✅ San Diego removed from 2024");
