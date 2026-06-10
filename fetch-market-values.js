// fetch-market-values.js
// Market values for the Trade Machine, sourced from the community-maintained
// Transfermarkt dataset (dcaribou/transfermarkt-datasets, published on Kaggle,
// refreshed ~weekly by THEIR CI — no scraping, no auth, no IP blocks).
//
// What it does:
//   1. Downloads players.csv (public, unauthenticated) — skipped if the local
//      market-values-cache.json is fresher than MAX_AGE_DAYS.
//   2. Filters to MLS clubs, converts EUR -> USD.
//   3. Fuzzy-matches names into public/data/mls-cache.json and writes `mv`
//      (plus `contractExpiry`) onto each matched player.
//   4. Writes public/data/market-values-cache.json (the standalone store, so
//      daily fetch-data rebuilds can re-apply without re-downloading).
//
// Run AFTER fetch-data.js (daily is fine — download only happens when stale).
// Usage: node fetch-market-values.js [--force]   (--force re-downloads)

const fs = require("fs");
const path = require("path");
const https = require("https");

const CSV_URL = "https://www.kaggle.com/api/v1/datasets/download/davidcariboo/player-scores/players.csv";
const EUR_TO_USD = 1.10;        // update quarterly-ish
const MAX_AGE_DAYS = 6;         // re-download when the local store is older
const MLS_COMP = "MLS1";

const DATA_DIR = path.join(__dirname, "public", "data");
const MV_CACHE = path.join(DATA_DIR, "market-values-cache.json");
const MLS_CACHE = path.join(DATA_DIR, "mls-cache.json");

// ── tiny CSV parser (handles quoted fields with commas/newlines) ────────────
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
      else if (ch !== "\r") field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── name normalization + matcher (same philosophy as the salary matcher) ────
const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip diacritics
  .toLowerCase()
  .replace(/['’.]/g, "")
  .replace(/-/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function buildMatcher(entries) {
  const byFull = new Map(), byLastFI = new Map(), byLast = new Map();
  for (const e of entries) {
    const n = norm(e.name); if (!n) continue;
    if (!byFull.has(n)) byFull.set(n, e);
    const parts = n.split(" ");
    if (parts.length >= 2) {
      const k = parts[parts.length - 1] + "|" + parts[0][0];
      byLastFI.set(k, byLastFI.has(k) ? null : e);          // null = ambiguous
      const L = parts[parts.length - 1];
      byLast.set(L, byLast.has(L) ? null : e);
    } else {
      byLast.set(n, byLast.has(n) ? null : e);              // mononyms live here
    }
  }
  return (cacheName) => {
    const n = norm(cacheName); if (!n) return null;
    if (byFull.has(n)) return { e: byFull.get(n), pass: 1 };
    const parts = n.split(" ");
    if (parts.length >= 2) {
      const k = parts[parts.length - 1] + "|" + parts[0][0];
      const hit = byLastFI.get(k); if (hit) return { e: hit, pass: 2 };
    }
    const L = parts[parts.length - 1];
    const hit2 = byLast.get(L); if (hit2) return { e: hit2, pass: 3 };
    return null;
  };
}

// ── download with redirect-following ─────────────────────────────────────────
function download(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error("too many redirects"));
    https.get(url, { headers: { "User-Agent": "usfootyindex/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(download(res.headers.location, depth + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const force = process.argv.includes("--force");
  let store = null;

  // 1. fresh local store? skip the download
  if (!force && fs.existsSync(MV_CACHE)) {
    const ageDays = (Date.now() - fs.statSync(MV_CACHE).mtimeMs) / 86400000;
    if (ageDays < MAX_AGE_DAYS) {
      store = JSON.parse(fs.readFileSync(MV_CACHE, "utf8"));
      console.log(`ℹ market-values-cache.json is ${ageDays.toFixed(1)} days old (<${MAX_AGE_DAYS}) — skipping download, re-applying`);
    }
  }

  // 2. download + parse + filter
  if (!store) {
    console.log("⬇ Downloading players.csv (community Transfermarkt dataset)...");
    let buf;
    try { buf = await download(CSV_URL); }
    catch (e) {
      console.error("✗ download failed: " + e.message);
      if (fs.existsSync(MV_CACHE)) {
        console.log("  Falling back to existing market-values-cache.json");
        store = JSON.parse(fs.readFileSync(MV_CACHE, "utf8"));
      } else process.exit(1);
    }
    if (!store) {
      const rows = parseCSV(buf.toString("utf8"));
      const head = rows[0];
      const col = (name) => head.indexOf(name);
      const iName = col("name"), iComp = col("current_club_domestic_competition_id"),
            iMv = col("market_value_in_eur"), iClub = col("current_club_name"),
            iX = col("contract_expiration_date"), iSeason = col("last_season");
      if ([iName, iComp, iMv].some(i => i < 0)) { console.error("✗ CSV schema changed — expected columns missing. Aborting."); process.exit(1); }
      const entries = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row[iComp] !== MLS_COMP) continue;
        const eur = parseFloat(row[iMv]);
        if (!eur || eur <= 0) continue;
        entries.push({
          name: row[iName],
          club: row[iClub] || "",
          mvEur: eur,
          mvUsd: Math.round(eur * EUR_TO_USD),
          contractExpiry: (row[iX] || "").slice(0, 10) || null,
          lastSeason: row[iSeason] || null,
        });
      }
      store = { asOf: new Date().toISOString().slice(0, 10), source: "dcaribou/transfermarkt-datasets (Kaggle)", eurToUsd: EUR_TO_USD, count: entries.length, entries };
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MV_CACHE, JSON.stringify(store, null, 1));
      console.log(`✓ ${entries.length} MLS players with market values → market-values-cache.json`);
    }
  }

  // 3. apply to mls-cache.json
  if (!fs.existsSync(MLS_CACHE)) { console.error("✗ mls-cache.json not found — run fetch-data first. (Store saved; nothing applied.)"); process.exit(1); }
  const cache = JSON.parse(fs.readFileSync(MLS_CACHE, "utf8"));
  const players = cache.players || cache;
  const match = buildMatcher(store.entries);
  let matched = 0, passes = { 1: 0, 2: 0, 3: 0 };
  for (const p of players) {
    const hit = match(p.n);
    if (hit) { p.mv = hit.e.mvUsd; p.contractExpiry = hit.e.contractExpiry; matched++; passes[hit.pass]++; }
  }
  fs.writeFileSync(MLS_CACHE, JSON.stringify(cache));
  const top = [...store.entries].sort((a, b) => b.mvUsd - a.mvUsd)[0];
  console.log(`✓ Applied market values to ${matched}/${store.entries.length} dataset players matched in cache`);
  console.log(`  (pass1 exact: ${passes[1]}, pass2 last+initial: ${passes[2]}, pass3 last/mononym: ${passes[3]})`);
  console.log(`  Top value: ${top.name} $${(top.mvUsd / 1e6).toFixed(1)}M  | as of ${store.asOf}, EUR→USD ${store.eurToUsd}`);
  console.log("  mls-cache.json updated in place — the app reads `mv` on next load.");
})();
