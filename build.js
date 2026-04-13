#!/usr/bin/env node
/**
 * USA Footy Index — Build Script
 * Pre-compiles JSX so the browser doesn't need Babel at runtime.
 * Cuts ~2-3 seconds off every page load.
 * 
 * Usage: node build.js
 * Input:  public/index.html (with <script type="text/babel">)
 * Output: public/index.html (with pre-compiled <script>)
 * Backup: public/index.dev.html (original with Babel)
 */

const fs = require("fs");
const path = require("path");
const { transformSync } = require("@babel/core");

const SRC = path.join(__dirname, "public", "index.html");
const BACKUP = path.join(__dirname, "public", "index.dev.html");
const OUT = SRC; // overwrite in place

console.log("\n⚡ USA Footy Index — Build\n");

if (!fs.existsSync(SRC)) {
  console.error("❌ public/index.html not found");
  process.exit(1);
}

const html = fs.readFileSync(SRC, "utf8");

// Extract the JSX script block
const match = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!match) {
  console.log("⚠️  No <script type=\"text/babel\"> found — already compiled?");
  process.exit(0);
}

const jsx = match[1];
console.log(`  📄 Extracted ${jsx.split("\n").length} lines of JSX`);

// Compile JSX → JS
let compiled;
try {
  const result = transformSync(jsx, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "app.jsx",
  });
  compiled = result.code;
  console.log(`  ✅ Babel compiled (${(compiled.length / 1024).toFixed(0)} KB)`);
} catch (e) {
  console.error("  ❌ Babel error:", e.message);
  process.exit(1);
}

// Save backup of dev version
fs.copyFileSync(SRC, BACKUP);
console.log(`  💾 Backup saved to index.dev.html`);

// Remove Babel script tag from head, replace script block with compiled JS
let output = html;

// Remove the Babel CDN script
output = output.replace(
  /\s*<script crossorigin src="[^"]*babel[^"]*"><\/script>\s*/,
  "\n"
);

// Remove the preload for Babel if present
output = output.replace(
  /\s*<link rel="preload"[^>]*babel[^>]*>\s*/g,
  "\n"
);

// Replace <script type="text/babel" ...>...</script> with <script>compiled</script>
output = output.replace(
  /<script type="text\/babel"[^>]*>[\s\S]*?<\/script>/,
  `<script>${compiled}</script>`
);

// Add build timestamp
output = output.replace(
  "</head>",
  `<!-- built: ${new Date().toISOString()} -->\n</head>`
);

fs.writeFileSync(OUT, output);
const savings = ((html.length - output.length) / 1024).toFixed(0);
const babelSize = "~800KB";
console.log(`  📦 Output: ${(output.length / 1024).toFixed(0)} KB`);
console.log(`  🚀 Eliminated Babel runtime (${babelSize} download + parse time)`);
console.log(`  💡 To edit: work on index.dev.html, then run 'node build.js' again\n`);
