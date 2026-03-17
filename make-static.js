// Run with: node make-static.js
const fs = require("fs");
const path = require("path");

console.log("  Making USA Footy Index static-ready...\n");

// 1. Copy data file into public folder
if (!fs.existsSync("public/data")) {
  fs.mkdirSync("public/data", { recursive: true });
}
if (fs.existsSync("data/mls-cache.json")) {
  fs.copyFileSync("data/mls-cache.json", "public/data/mls-cache.json");
  const size = (fs.statSync("public/data/mls-cache.json").size / 1024).toFixed(0);
  console.log(`  ✅ Copied mls-cache.json to public/data/ (${size}KB)`);
} else {
  console.log("  ❌ data/mls-cache.json not found! Run npm run fetch first.");
  process.exit(1);
}

// 2. Update index.html to load from JSON file instead of API
let html = fs.readFileSync("public/index.html", "utf8");

// Replace API endpoint with static JSON path
const oldUrl = 'const DATA_URL = "/api/data";';
const newUrl = 'const DATA_URL = "./data/mls-cache.json";';
if (html.includes(oldUrl)) {
  html = html.replace(oldUrl, newUrl);
  console.log("  ✅ Changed data source from /api/data to ./data/mls-cache.json");
} else if (html.includes('"/api/data"')) {
  html = html.replace('"/api/data"', '"./data/mls-cache.json"');
  console.log("  ✅ Changed data source (alt pattern)");
} else if (html.includes("'/api/data'")) {
  html = html.replace("'/api/data'", "'./data/mls-cache.json'");
  console.log("  ✅ Changed data source (single quotes)");
} else {
  console.log("  ⚠️  Could not find API URL pattern — checking...");
  const apiIdx = html.indexOf("/api/data");
  if (apiIdx > -1) {
    console.log("  Found at:", apiIdx, "context:", html.slice(apiIdx - 20, apiIdx + 30));
  }
}

// Also fix any other /api/data references (e.g. the standings fetch)
html = html.replace(/fetch\("\/api\/data"\)/g, 'fetch("./data/mls-cache.json")');
html = html.replace(/fetch\('\/api\/data'\)/g, "fetch('./data/mls-cache.json')");

fs.writeFileSync("public/index.html", html);
console.log("  ✅ index.html updated");

// 3. Create .gitignore
const gitignore = `node_modules/
data/
*.log
.DS_Store
`;
fs.writeFileSync(".gitignore", gitignore);
console.log("  ✅ .gitignore created");

// 4. Verify public folder structure
console.log("\n  📁 public/ folder structure:");
const walk = (dir, indent = "    ") => {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      console.log(indent + "📁 " + f + "/");
      walk(full, indent + "  ");
    } else {
      const kb = (stat.size / 1024).toFixed(0);
      console.log(indent + "📄 " + f + ` (${kb}KB)`);
    }
  });
};
walk("public");

console.log("\n  ✅ Ready for deployment!");
console.log("  The 'public' folder is your entire site.\n");
