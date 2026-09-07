const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path"); const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
function run(env, arts, genStatus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usfi-ps-")); fs.mkdirSync(path.join(dir, "public/data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "public/data/mls-cache.json"), JSON.stringify({ generated: new Date().toISOString(), players: [{ n: "a" }], dataSources: ["ESPN"] }));
  fs.writeFileSync(path.join(dir, "public/data/articles.json"), JSON.stringify(arts));
  if (genStatus) fs.writeFileSync(path.join(dir, "public/data/article-gen-status.json"), JSON.stringify(genStatus));
  const r = spawnSync(process.execPath, [path.join(ROOT, "write-pipeline-status.js")], { cwd: dir, env: { ...process.env, ...env }, encoding: "utf8" });
  return JSON.parse(fs.readFileSync(path.join(dir, "public/data/pipeline-status.json"), "utf8"));
}
const fresh = [{ status: "approved", created: new Date().toISOString() }];
const stale = [{ status: "approved", created: "2026-07-15T00:00:00Z" }];
test("all steps ok with fresh articles", () => { const s = run({ MV_OUTCOME: "success", ASKCTX_OUTCOME: "success", ARTICLES_OUTCOME: "success" }, fresh, { reason: "wrote" }); assert.deepEqual(s.steps, { marketValues: "ok", askContext: "ok", articles: "ok" }); assert.equal(s.articleReasonLabel, "generated normally"); });
test("step outcomes map: failure→failed, skipped→skipped", () => { const s = run({ MV_OUTCOME: "failure", ASKCTX_OUTCOME: "skipped", ARTICLES_OUTCOME: "success" }, fresh, null); assert.equal(s.steps.marketValues, "failed"); assert.equal(s.steps.askContext, "skipped"); });
test("articles: success but nothing fresh → stale", () => { const s = run({ ARTICLES_OUTCOME: "success" }, stale, null); assert.equal(s.steps.articles, "stale"); });
test("articles: explicit generator reason overrides (no-key, api-error)", () => {
  assert.equal(run({ ARTICLES_OUTCOME: "success" }, stale, { reason: "no-key" }).steps.articles, "no-key");
  const s = run({ ARTICLES_OUTCOME: "failure" }, stale, { reason: "api-error", message: "401" }); assert.equal(s.steps.articles, "api-error"); assert.match(s.articleReasonLabel, /API call failed/);
});
