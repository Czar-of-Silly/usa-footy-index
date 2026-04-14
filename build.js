#!/usr/bin/env node
/**
 * USA Footy Index — Build Script
 * Pre-compiles JSX so the browser doesn't need Babel at runtime.
 * 
 * Workflow:
 *   1. Edit public/index.dev.html (your JSX source)
 *   2. Run: node build.js
 *   3. Push: git add . && git commit && git push
 * 
 * Input:  public/index.dev.html (JSX + Babel)
 * Output: public/index.html (pre-compiled, no Babel needed)
 */

const fs = require("fs");
const path = require("path");
const { transformSync } = require("@babel/core");

const DEV = path.join(__dirname, "public", "index.dev.html");
const OUT = path.join(__dirname, "public", "index.html");

console.log("\n⚡ USA Footy Index — Build\n");

// Determine source file
let srcPath = DEV;
if (!fs.existsSync(DEV)) {
  if (fs.existsSync(OUT)) {
    const html = fs.readFileSync(OUT, "utf8");
    if (html.includes('type="text/babel"')) {
      fs.copyFileSync(OUT, DEV);
      console.log("  📋 Created index.dev.html from index.html");
      srcPath = DEV;
    } else {
      console.error("  ❌ No JSX source found. Need index.dev.html with <script type=\"text/babel\">");
      process.exit(1);
    }
  } else {
    console.error("  ❌ No source files found");
    process.exit(1);
  }
}

const html = fs.readFileSync(srcPath, "utf8");

if (!html.includes('type="text/babel"')) {
  console.error("  ❌ index.dev.html doesn't contain JSX");
  process.exit(1);
}

const match = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!match) {
  console.error("  ❌ Could not extract JSX block");
  process.exit(1);
}

const jsx = match[1];
console.log(`  📄 Source: ${path.basename(srcPath)} (${jsx.split("\n").length} lines)`);

// Compile
let compiled;
try {
  const result = transformSync(jsx, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "app.jsx",
  });
  compiled = result.code;
  console.log(`  ✅ Compiled (${(compiled.length / 1024).toFixed(0)} KB)`);
} catch (e) {
  const loc = e.loc ? ` at line ${e.loc.line}` : "";
  console.error(`  ❌ Babel error${loc}:`, e.message.split("\n")[0]);
  process.exit(1);
}

// Validate
const checks = ["React.createElement", "PlayerModal", "MLSAnalytics", "TableWrap", "matchesData", "standingsData"];
for (const c of checks) {
  if (!compiled.includes(c)) {
    console.error(`  ❌ Missing in output: ${c}`);
    process.exit(1);
  }
}
console.log("  ✅ Validation passed");

// Build output
let output = html;
output = output.replace(/\s*<script crossorigin src="[^"]*babel[^"]*"><\/script>\s*/, "\n");
output = output.replace(/\s*<link rel="preload"[^>]*babel[^>]*>\s*/g, "\n");
output = output.replace(/<script type="text\/babel"[^>]*>[\s\S]*?<\/script>/, `<script>${compiled}</script>`);
output = output.replace("</head>", `<!-- built: ${new Date().toISOString().slice(0,19)} -->\n</head>`);

fs.writeFileSync(OUT, output);
console.log(`\n  📦 index.html: ${(output.length / 1024).toFixed(0)} KB (no Babel)`);
console.log(`  📝 Edit: index.dev.html → run build.js → push`);
console.log(`  🚀 ~800KB Babel download eliminated\n`);
