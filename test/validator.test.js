const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path"); const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const now = Date.now();
const iso = (d) => new Date(d).toISOString();
function cache(over = {}) {
  const teams = "ATL ATX CLT CHI CIN COL CLB DAL DC HOU LA LAFC MIA MIN MTL NSH NE NYC RBNY ORL PHI POR RSL SD SJ SEA SKC STL TOR VAN".split(" ");
  const standings = teams.map((t, i) => ({ team: t, name: t + " FC", conf: i < 15 ? "Eastern" : "Western", w: 10, d: 5, l: 5, pts: 35, gf: 30, ga: 25 }));
  const players = Array.from({ length: 720 }, (_, i) => ({ n: "Player " + i, t: teams[i % 30], p: "Midfielder", m: 900 }));
  const matches = [{ id: "1", date: iso(now - 5 * 864e5), status: "Full Time", completed: true, home: "ATL", away: "ORL", homeScore: "1", awayScore: "0" },
    { id: "2", date: iso(now + 2 * 864e5), status: "Scheduled", completed: false, home: "SEA", away: "LA", homeScore: "0", awayScore: "0" }];
  return { generated: iso(now - 3600e3), season: 2026, dataSources: ["ESPN", "ASA", "MLS Official (Opta)"], players, standings, matches, ...over };
}
function run(c) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "usfi-")), "cache.json"); fs.writeFileSync(f, JSON.stringify(c));
  const r = spawnSync(process.execPath, [path.join(ROOT, "validate-cache.js"), f], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}
test("a healthy cache passes", () => { const r = run(cache()); assert.equal(r.code, 0, r.out); });
test("a postponed fixture with a past kickoff passes", () => {
  const c = cache(); c.matches.push({ id: "3", date: iso(now - 2 * 864e5), status: "Postponed", completed: false, home: "CIN", away: "DC", homeScore: "0", awayScore: "0" });
  assert.equal(run(c).code, 0);
});
test("a fixture still 'Scheduled' long after kickoff fails", () => {
  const c = cache(); c.matches.push({ id: "4", date: iso(now - 2 * 864e5), status: "Scheduled", completed: false, home: "CIN", away: "DC", homeScore: "0", awayScore: "0" });
  const r = run(c); assert.equal(r.code, 1); assert.match(r.out, /marked upcoming/);
});
test("duplicate player, literal 'null', bad points and a future 'completed' match all fail", () => {
  let c = cache(); c.players.push({ ...c.players[0] }); assert.equal(run(c).code, 1);
  c = cache(); c.players[0].xg = "null"; assert.equal(run(c).code, 1);
  c = cache(); c.standings[0].pts = 99; assert.match(run(c).out, /3W\+D/);
  c = cache(); c.matches[0].date = iso(now + 864e5); assert.match(run(c).out, /kicks off in the future/);
});
test("missing sources or too few players fail", () => {
  let c = cache({ dataSources: [] }); assert.equal(run(c).code, 1);
  c = cache(); c.players = c.players.slice(0, 100); assert.equal(run(c).code, 1);
});
