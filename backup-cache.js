// backup-cache.js — creates a timestamped backup of the current cache
// Keeps last 10 backups, auto-prunes older ones
// Run: node backup-cache.js
const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, "data", "mls-cache.json");
const BACKUP_DIR = path.join(__dirname, "data", "backups");

if (!fs.existsSync(CACHE)) {
  console.log("❌ No cache to back up");
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const data = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const tk = data.players.filter(p => p.tk > 0).length;
const drb = data.players.filter(p => p.drb > 0).length;
const xg = data.players.filter(p => p.xg > 0).length;

// Don't back up if data quality is bad
if (tk < 100 || drb < 50 || xg < 50) {
  console.log(`⚠️  Skipping backup — data quality too low (tk:${tk} drb:${drb} xg:${xg})`);
  console.log("   This protects you from backing up a broken fetch.");
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const backupPath = path.join(BACKUP_DIR, `mls-cache-${ts}.json`);
fs.copyFileSync(CACHE, backupPath);
console.log(`✅ Backed up to: ${path.basename(backupPath)}`);
console.log(`   Quality: ${data.players.length} players · tk:${tk} drb:${drb} xg:${xg}`);

// Prune old backups, keep last 10
const backups = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith("mls-cache-") && f.endsWith(".json"))
  .sort()
  .reverse();
const toDelete = backups.slice(10);
for (const f of toDelete) {
  fs.unlinkSync(path.join(BACKUP_DIR, f));
  console.log(`   Pruned old backup: ${f}`);
}
console.log(`   Keeping ${Math.min(backups.length, 10)} backups`);
