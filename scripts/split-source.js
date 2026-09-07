#!/usr/bin/env node
// scripts/split-source.js — Phase 5.3 one-off migration tool.
// Reads the inline <script type="text/babel"> app out of public/index.html, assigns every top-level
// declaration to a module under src/ by name, computes real cross-module dependencies with Babel
// scope analysis, and writes ESM files with explicit imports/exports. The statements themselves are
// copied verbatim (source slices), so behaviour cannot drift; only module boundaries are added.
//
// Usage:  node scripts/split-source.js [--from public/index.html] [--dry]
// Re-runnable: it overwrites src/ from the given HTML. Kept in the repo so the split is reproducible
// and easy to audit/revert.

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const args = process.argv.slice(2);
const FROM = args.includes("--from") ? args[args.indexOf("--from") + 1] : "public/index.html";
const DRY = args.includes("--dry");
const EMIT = args.includes("--emit-src") ? args[args.indexOf("--emit-src") + 1] : null;

const html = fs.readFileSync(FROM, "utf8");
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error("no text/babel script in " + FROM); process.exit(1); }
let SRC = m[1];

// ─── pre-rewrites (behaviour-preserving) ─────────────────────────────────────
// 1) Canonical player preparation: lift the main loader's validate + prepare code, verbatim, into
//    three top-level declarations, and make the loader call them. Text is sliced from the source
//    itself so the transformation is identical by construction.
{
  const safe = SRC.match(/const safe=\(v,min,max,def\)=>[^\n]*;/);
  const vm = SRC.match(/const validated=allRaw\.filter\(r=>r&&r\.n&&r\.t&&typeof r\.n==="string"\)\.map\(r=>\((\{[\s\S]*?\n\s*\})\)\);/);
  const im = SRC.match(/const inter=validated\.map\(\((r,i)\)=>(\{const id="p"\+i[\s\S]*?raw:r\};)\}\);/);
  if (!safe || !vm || !im) { console.error("pre-rewrite anchors for player preparation not found"); process.exit(1); }
  const decl = [
    "// ─── CANONICAL PLAYER PREPARATION (Phase 5.3) ─────────────────────────",
    "// Lifted verbatim from the main loader. validatePlayer clamps/normalises a raw cache row; preparePlayerForGrading",
    "// turns it into the engine's per-90 input. NOTE (Grading Integrity): build-ask-context.js, snapshot-rankings.js",
    "// and build-routes.js still use their own un-clamped mapping, and the in-app history loader uses a reduced one.",
    "const safeNum=" + safe[0].slice("const safe=".length),
    "function validatePlayer(r){const safe=safeNum;return (" + vm[1] + ");}",
    "function preparePlayerForGrading(r,i)" + im[2].replace(/\}$/, "}") + "}",
    "",
  ].join("\n");
  SRC = SRC.replace(vm[0], 'const validated=allRaw.filter(r=>r&&r.n&&r.t&&typeof r.n==="string").map(validatePlayer);');
  SRC = SRC.replace(im[0], "const inter=validated.map(preparePlayerForGrading);");
  // insert right after computeGrades
  const cgEnd = (() => { const i = SRC.indexOf("function computeGrades("); let d = 0, j = SRC.indexOf("{", i); for (let k = j; k < SRC.length; k++) { if (SRC[k] === "{") d++; else if (SRC[k] === "}") { d--; if (d === 0) return k + 1; } } })();
  SRC = SRC.slice(0, cgEnd) + "\n\n" + decl + SRC.slice(cgEnd);
}
// 2) Matchup projection: lift the exact formula into indexLean(gd, pg); MatchupView calls it.
{
  const pj = SRC.match(/  let proj=null;\n  if\(gd!=null\|\|pg!=null\)(\{[^\n]*)\n/);
  if (!pj) { console.error("pre-rewrite anchor for projection not found"); process.exit(1); }
  const fn = "// The Index Lean — lifted verbatim from MatchupView (Phase 5.3). A projection, not a measurement.\nfunction indexLean(gd,pg){let proj=null;if(gd!=null||pg!=null)" + pj[1] + "return proj;}\n";
  SRC = SRC.replace(pj[0], "  const proj=indexLean(gd,pg);\n");
  SRC = SRC.replace("function MatchupView(", fn + "function MatchupView(");
}

// ─── module map: declared name → module file (relative to src/) ─────────────
// .mjs = pure, Node-safe (no JSX, no browser globals at import time). .jsx = browser-only.
const MAP = {
  // runtime globals (browser only)
  "ui/runtime.jsx": ["useState", "useEffect", "useMemo", "useRef", "_RC", "BarChart", "ResponsiveContainer", "Cell", "LineChart", "Line", "AreaChart", "Area", "XAxis", "YAxis", "RTooltip", "RBar"],
  // formatting + small helpers
  "util/format.mjs": ["ET", "dv", "fmtET", "fmtETTime", "pickWeekAgo", "fv", "sv", "hm", "nextRefreshUTC"],
  // routing
  "routing/routes.mjs": ["slugify", "ROUTE_PATHS", "PATH_TABS", "SITE_TITLE"],
  // teams + theme
  "data/teams.mjs": ["MLS_TEAMS", "tcm"],
  "theme.mjs": ["FONTS", "LIGHT", "DARK", "T", "gc", "gb", "gl", "vc"],
  // grading (canonical)
  "grading/engine.mjs": ["pct", "normPos", "toG", "computeGrades"],
  "grading/prepare-player.mjs": ["safeNum", "validatePlayer", "preparePlayerForGrading"],
  // analytics
  "analytics/form.mjs": ["matchRating", "computeForm"],
  "analytics/matchup.mjs": ["posGroupOf", "indexLean"],
  "analytics/power-rank.mjs": ["powerRankFor"],
  // trade machine rules (pure)
  "trade/trade-rules.mjs": ["TM_RULES", "TM_GAM", "tmNum", "tmCounts", "tmSenior", "tmCharge", "tmSummarize", "tmCheck", "tmEvaluate", "tmPos", "tmScoreSet", "tmSuggestReturns"],
  // UI
  "components/ui.jsx": ["TeamBadge", "Badge", "StatChip", "Select", "Rule", "NavIcon", "BottomSheet", "MobileSortBar", "MobileStatCard", "MobilePlayerCard", "TableWrap", "ColHead", "Logo", "PctBadge", "PosGlyph", "CardButton", "MiniSparkline", "SeasonSparkline", "MiniSpark", "TopCards", "PlayerSearch"],
  "components/charts.jsx": ["RadarChart", "FormSparkline", "FormTrend"],
  "components/player-modal.jsx": ["PlayerModal"],
  "cards/share-cards.jsx": ["DATA_GENERATED", "setDataGenerated", "CARD_W", "CARD_H", "F_DISPLAY", "F_SERIF", "F_MONO", "F_FELL", "cardLoadImg", "cardFonts", "cardSpaced", "cardTrunc", "cardBadge", "cardStamp", "cardPill", "cardFrame", "cardDownload", "makeCard", "cardFile", "cardResult", "drawFormPills", "cardPlayer", "cardTOTW", "cardPowerRankings", "cardMovers", "cardMatchPreview"],
  "pages/ask.jsx": ["AskDesk"],
  "pages/matchup.jsx": ["MatchupView"],
  "pages/matchups.jsx": ["MatchupsView"],
  "pages/methodology.jsx": ["GradeFlow", "MethodologyView"],
  "pages/my-club.jsx": ["MYCLUB_KEY", "readMyClub", "writeMyClub", "MyClubPicker", "FollowClubCTA", "MyClubDesk"],
};
const APP = "app.jsx";
const nameToModule = {};
for (const [mod, names] of Object.entries(MAP)) for (const n of names) nameToModule[n] = mod;

// Layer order (lower may not import higher). Used only to report cycles / misplacements.
const ORDER = ["ui/runtime.jsx", "util/format.mjs", "routing/routes.mjs", "data/teams.mjs", "theme.mjs", "grading/engine.mjs", "grading/prepare-player.mjs", "analytics/form.mjs", "analytics/matchup.mjs", "analytics/power-rank.mjs", "trade/trade-rules.mjs", "components/ui.jsx", "components/charts.jsx", "cards/share-cards.jsx", "components/player-modal.jsx", "pages/ask.jsx", "pages/matchup.jsx", "pages/matchups.jsx", "pages/methodology.jsx", "pages/my-club.jsx", APP];

if (EMIT) { fs.writeFileSync(EMIT, SRC); console.log("wrote pre-rewritten source to " + EMIT); }

// ─── parse ───────────────────────────────────────────────────────────────────
const ast = parser.parse(SRC, { sourceType: "module", plugins: ["jsx"], attachComment: true });
const program = ast.program;

function declaredNames(st) {
  const out = [];
  const collect = (id) => { if (!id) return; if (id.type === "Identifier") out.push(id.name); else if (id.type === "ObjectPattern") id.properties.forEach(p => collect(p.type === "RestElement" ? p.argument : p.value)); else if (id.type === "ArrayPattern") id.elements.forEach(e => e && collect(e.type === "RestElement" ? e.argument : e)); else if (id.type === "AssignmentPattern") collect(id.left); };
  if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") collect(st.id);
  else if (st.type === "VariableDeclaration") st.declarations.forEach(d => collect(d.id));
  return out;
}

// statement records
const stmts = program.body.map((st, i) => {
  const names = declaredNames(st);
  // include leading comments in the slice
  let start = st.start;
  if (st.leadingComments && st.leadingComments.length) start = Math.min(start, st.leadingComments[0].start);
  return { i, node: st, names, start, end: st.end, text: SRC.slice(start, st.end), refs: new Set(), hasJSX: false, assignsTo: new Set() };
});

// program-level bindings → statement index
let programScope = null;
const bindingOwner = {};
traverse(ast, {
  Program(p) { programScope = p.scope; },
});
for (const s of stmts) for (const n of s.names) bindingOwner[n] = s.i;

// references per statement
traverse(ast, {
  enter(p) {
    // find top-level statement index for this node
    let top = p; while (top.parentPath && top.parentPath.node !== program) top = top.parentPath;
    const idx = program.body.indexOf(top.node); if (idx < 0) return;
    const s = stmts[idx];
    if (p.isJSXElement() || p.isJSXFragment()) s.hasJSX = true;
    if (p.isIdentifier() && p.isReferencedIdentifier() || p.isJSXIdentifier() && p.parentPath.isJSXOpeningElement() && /^[A-Z]/.test(p.node.name)) {
      const name = p.node.name;
      const b = p.scope.getBinding(name);
      if (b && b.scope === programScope && bindingOwner[name] !== idx) s.refs.add(name);
      else if (!b && bindingOwner[name] != null && bindingOwner[name] !== idx) s.refs.add(name); // JSX identifiers aren't bindings
    }
    if (p.isAssignmentExpression() && p.node.left.type === "Identifier") {
      const name = p.node.left.name; const b = p.scope.getBinding(name);
      if (b && b.scope === programScope && bindingOwner[name] !== idx) s.assignsTo.add(name);
    }
  },
});

// ─── assign statements to modules ────────────────────────────────────────────
function moduleOf(s) {
  if (s.names.length) { const mods = new Set(s.names.map(n => nameToModule[n] || APP)); if (mods.size > 1) throw new Error("statement declares names mapped to different modules: " + s.names.join(",")); return [...mods][0]; }
  // expression statement: attach to the module of the first top-level binding it touches (e.g. PATH_TABS["/x"]=..., MLS_TEAMS.forEach(...))
  const t = s.text.trim();
  const mm = t.match(/^([A-Za-z_$][\w$]*)/);
  if (mm && nameToModule[mm[1]]) return nameToModule[mm[1]];
  return APP;
}
const byModule = {};
for (const s of stmts) { const mod = moduleOf(s); s.module = mod; (byModule[mod] ||= []).push(s); }

// ─── special rewrites (behaviour-preserving) ─────────────────────────────────
// DATA_GENERATED is a top-level `let` reassigned from the app; ESM import bindings are read-only.
// Provide a setter in the cards module and rewrite the assignments to call it.
const dg = stmts.find(s => s.names.includes("DATA_GENERATED"));
if (dg) {
  dg.text = dg.text + "\nexport function setDataGenerated(v){DATA_GENERATED=v;}";
  dg.names.push("setDataGenerated");
  nameToModule.setDataGenerated = dg.module;
  for (const s of stmts) if (s !== dg && /\bDATA_GENERATED=/.test(s.text)) { s.text = s.text.replace(/\bDATA_GENERATED=([^;]+);/g, "setDataGenerated($1);"); s.refs.delete("DATA_GENERATED"); s.refs.add("setDataGenerated"); s.assignsTo.delete("DATA_GENERATED"); }
}
// cross-module reassignment of any other binding is a hard error
for (const s of stmts) for (const n of s.assignsTo) if (nameToModule[n] && nameToModule[n] !== s.module) { console.error("✗ " + s.module + " reassigns " + n + " owned by " + nameToModule[n]); process.exit(1); }

// ─── emit ───────────────────────────────────────────────────────────────────
const relImport = (from, to) => { let r = path.posix.relative(path.posix.dirname(from), to); if (!r.startsWith(".")) r = "./" + r; return r; };
const files = {};
const graph = {};
for (const [mod, list] of Object.entries(byModule)) {
  const imports = {};
  for (const s of list) for (const n of s.refs) { const src = nameToModule[n] || APP; if (src === mod) continue; (imports[src] ||= new Set()).add(n); }
  graph[mod] = Object.keys(imports);
  const hasJSX = list.some(s => s.hasJSX);
  if (hasJSX && mod.endsWith(".mjs")) { console.error("✗ " + mod + " contains JSX but is mapped as .mjs"); process.exit(1); }
  let out = "";
  if (mod === APP) out += "// src/app.jsx — application root (Phase 5.3 source split). Built to public/app.js by `npm run build`.\n";
  else out += "// " + mod + " — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.\n";
  for (const [src, names] of Object.entries(imports).sort()) out += `import { ${[...names].sort().join(", ")} } from "${relImport(mod, src)}";\n`;
  if (Object.keys(imports).length) out += "\n";
  for (const s of list) {
    // export declarations (not side-effect statements)
    const decl = s.node.type === "FunctionDeclaration" || s.node.type === "ClassDeclaration" || s.node.type === "VariableDeclaration";
    if (decl && mod !== APP) {
      // keep leading comments before `export`
      const commentEnd = s.node.start - s.start;
      out += s.text.slice(0, commentEnd) + "export " + s.text.slice(commentEnd) + "\n\n";
    } else out += s.text + "\n\n";
  }
  files[mod] = out;
}

// layer/cycle report
let bad = 0;
for (const [mod, deps] of Object.entries(graph)) for (const d of deps) if (ORDER.indexOf(d) > ORDER.indexOf(mod)) { console.warn("⚠ layer violation: " + mod + " → " + d); bad++; }
function hasCycle() { const st = {}; const dfs = (n, stack) => { if (st[n] === 1) { console.error("✗ cycle: " + [...stack, n].join(" → ")); return true; } if (st[n] === 2) return false; st[n] = 1; for (const d of graph[n] || []) if (dfs(d, [...stack, n])) return true; st[n] = 2; return false; }; return Object.keys(graph).some(n => dfs(n, [])); }
if (hasCycle()) process.exit(1);

// report
console.log("statements:", stmts.length);
for (const mod of ORDER) if (files[mod]) console.log("  " + mod.padEnd(32) + String(byModule[mod].length).padStart(4) + " stmts " + String(files[mod].length).padStart(8) + " chars  ← " + (graph[mod] || []).join(", "));
const unmapped = stmts.filter(s => s.module === APP && s.names.some(n => !/^(MLSAnalytics|root|DATA_URL_BASE|CY)$/.test(n))).map(s => s.names.join(","));
if (unmapped.length) console.log("  (in app.jsx by default: " + unmapped.join(", ") + ")");
if (bad) console.log("  " + bad + " layer warning(s) above are informational; cycles would have aborted.");

if (DRY) { console.log("dry run — nothing written"); process.exit(0); }
for (const [mod, text] of Object.entries(files)) { const p = path.join("src", mod); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
console.log("✅ wrote " + Object.keys(files).length + " files under src/");
