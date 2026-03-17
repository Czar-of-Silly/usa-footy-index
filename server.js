const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Serve cached data
app.get("/api/data", (req, res) => {
  const file = path.join(DATA_DIR, "mls-cache.json");
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "No data cache found. Run: npm run fetch" });
  }
  const stat = fs.statSync(file);
  const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
  res.setHeader("X-Cache-Age-Hours", Math.round(ageHours));
  res.sendFile(file);
});

// Health check
app.get("/api/health", (req, res) => {
  const file = path.join(DATA_DIR, "mls-cache.json");
  const hasData = fs.existsSync(file);
  res.json({
    status: "ok",
    hasData,
    dataAge: hasData ? `${Math.round((Date.now() - fs.statSync(file).mtimeMs) / 3600000)}h` : null,
    uptime: `${Math.round(process.uptime())}s`,
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  USA Footy Index`);
  console.log(`  ──────────────────`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  Health:     http://localhost:${PORT}/api/health`);
  console.log(`  Data API:   http://localhost:${PORT}/api/data\n`);
  const file = path.join(DATA_DIR, "mls-cache.json");
  if (!fs.existsSync(file)) {
    console.log(`  ⚠️  No data cache found!`);
    console.log(`  Run: npm run fetch\n`);
  } else {
    const age = Math.round((Date.now() - fs.statSync(file).mtimeMs) / 3600000);
    console.log(`  ✅ Data cache loaded (${age}h old)\n`);
  }
});
