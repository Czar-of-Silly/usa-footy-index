const fs = require("fs");
for (const y of [2024, 2025, 2026]) {
  const file = y === 2026 ? "public/data/mls-cache.json" : `public/data/mls-cache-${y}.json`;
  if (!fs.existsSync(file)) { console.log(y + ": FILE NOT FOUND"); continue; }
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const p = d.players;
  console.log(`${y}: ${p.length} players, ${p.filter(x=>x.headshot).length} headshots, ${p.filter(x=>x.a).length} ages, ${p.filter(x=>x.ht).length} heights, ${p.filter(x=>x.totalGA!==0&&x.totalGA!=="0.00").length} G+, ${p.filter(x=>x.mv>0).length} values`);
}
