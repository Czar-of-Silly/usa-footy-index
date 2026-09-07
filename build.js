#!/usr/bin/env node
// build.js — compiles src/app.jsx → public/app.js with esbuild (Phase 5.3).
//   node build.js            one-off production build
//   node build.js --watch    rebuild on change
//   node build.js --dev      watch + local express server (server.js) on :3000
// React, ReactDOM and Recharts remain CDN globals (window.React etc.), exactly as before the split.
const esbuild = require("esbuild");
const { spawn } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const args = process.argv.slice(2);
const watch = args.includes("--watch") || args.includes("--dev");
const opts = {
  entryPoints: ["src/app.jsx"],
  bundle: true,
  format: "iife",
  target: ["es2019"],
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  loader: { ".js": "jsx", ".jsx": "jsx", ".mjs": "js" },
  outfile: "public/app.js",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "/* USA Footy Index — compiled from src/ by build.js; do not edit by hand */" },
};
function stampHtml() {
  // cache-bust the script tag with a content hash so a new bundle is never served stale
  const p = "public/index.html"; if (!fs.existsSync(p) || !fs.existsSync(opts.outfile)) return;
  const hash = crypto.createHash("sha1").update(fs.readFileSync(opts.outfile)).digest("hex").slice(0, 10);
  const html = fs.readFileSync(p, "utf8"); const next = html.replace(/src="\/app\.js(\?v=[0-9a-f]+)?"/, 'src="/app.js?v=' + hash + '"');
  if (next !== html) fs.writeFileSync(p, next);
}
(async () => {
  if (!watch) { await esbuild.build(opts); stampHtml(); const kb = Math.round(fs.statSync(opts.outfile).size / 1024); console.log("✅ public/app.js " + kb + " KB"); return; }
  const ctx = await esbuild.context({ ...opts, plugins: [{ name: "stamp", setup(b) { b.onEnd(r => { if (!r.errors.length) { stampHtml(); console.log(new Date().toLocaleTimeString() + " rebuilt public/app.js"); } }); } }] });
  await ctx.watch(); console.log("watching src/ …");
  if (args.includes("--dev")) { const s = spawn(process.execPath, ["server.js"], { stdio: "inherit" }); process.on("exit", () => s.kill()); }
})().catch(e => { console.error(e); process.exit(1); });
