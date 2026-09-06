// write-pipeline-status.js — writes public/data/pipeline-status.json from CI step outcomes
// Env: ARTICLES_OUTCOME, ASKCTX_OUTCOME, MV_OUTCOME (GitHub steps.<id>.outcome: success|failure|skipped)
const fs = require("fs");
const OUT = "public/data/pipeline-status.json";
const cache = JSON.parse(fs.readFileSync("public/data/mls-cache.json", "utf8"));
const gen = Date.parse(cache.generated || 0);
const outcome = (v) => v === "failure" ? "failed" : v === "skipped" ? "skipped" : "ok";
const steps = {
  marketValues: outcome(process.env.MV_OUTCOME),
  askContext: outcome(process.env.ASKCTX_OUTCOME),
  articles: outcome(process.env.ARTICLES_OUTCOME),
};
// "success" from generate-articles can still mean nothing fresh was written (facts unchanged, no key, all demoted)
let articleReason = null;
try {
  const arts = JSON.parse(fs.readFileSync("public/data/articles.json", "utf8"));
  const fresh = arts.some(a => a.status === "approved" && a.created && gen - Date.parse(a.created) <= 7 * 864e5);
  if (steps.articles === "ok" && !fresh) steps.articles = "stale";
} catch { steps.articles = "failed"; }
try {
  const gs = JSON.parse(fs.readFileSync("public/data/article-gen-status.json", "utf8"));
  articleReason = gs.reason;
  // "no-key" and "api-error" are real problems even if a step "succeeded" by exit code
  if (gs.reason === "no-key" || gs.reason === "api-error" || gs.reason === "bad-json" || gs.reason === "not-array") steps.articles = gs.reason;
} catch {}
const REASON_LABEL = { "no-key": "ANTHROPIC_API_KEY secret missing or empty", "api-error": "Anthropic API call failed", "bad-json": "model returned non-JSON", "not-array": "model returned wrong shape", "unchanged": "facts unchanged since last run", "wrote": "generated normally" };
const status = { generated: cache.generated, writtenAt: new Date().toISOString(), players: (cache.players || []).length, sources: cache.dataSources || [], steps, articleReason, articleReasonLabel: articleReason ? (REASON_LABEL[articleReason] || articleReason) : null };
fs.writeFileSync(OUT, JSON.stringify(status));
const bad = Object.entries(steps).filter(([, v]) => v !== "ok");
for (const [k, v] of bad) console.log("::warning title=Pipeline step " + k + "::" + k + " " + v + " — the site will show a warning strip until this is fixed.");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Pipeline status\n" + Object.entries(steps).map(([k, v]) => "- " + (v === "ok" ? "✅" : "⚠️") + " " + k + ": " + v).join("\n") + "\n");
console.log((bad.length ? "⚠️  " : "✅ ") + "pipeline-status: " + JSON.stringify(steps));
