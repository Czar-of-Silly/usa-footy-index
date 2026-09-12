// Fetch reliability — the shared get() helper and the paginated collector.
// Every dependency is injected, so none of this touches the network or a real clock.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const H = require("../src/data/http.js");
const ROOT = path.join(__dirname, "..");
const fetchData = () => fs.readFileSync(path.join(ROOT, "fetch-data.js"), "utf8");

// A fake fetch driven by a script of outcomes, one per attempt.
//   {json}            -> 200 with that body
//   {status}          -> that status
//   {hang: true}      -> never settles until aborted, so the deadline fires
//   {net: "message"}  -> a network-layer failure, the shape undici produces
function fakeFetch(script) {
  let i = 0;
  const calls = [];
  const f = (url, init) => {
    const step = script[Math.min(i, script.length - 1)];
    i++; calls.push({ url, signal: init && init.signal });
    if (step.hang) return new Promise((_, reject) => {
      const s = init && init.signal;
      if (!s) return;
      if (s.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      s.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    if (step.net) return Promise.reject(Object.assign(new TypeError(step.net), { cause: new Error("ECONNRESET") }));
    if (step.status && step.status >= 400) return Promise.resolve({ ok: false, status: step.status, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => step.json });
  };
  f.calls = calls;
  f.count = () => i;
  return f;
}

// A controllable clock: timers fire only when the test says so, and every create/clear is counted.
function fakeTimers() {
  let id = 0;
  const live = new Map();
  const t = {
    created: 0, cleared: 0,
    setTimeout: (fn, ms) => { t.created++; const k = ++id; live.set(k, { fn, ms }); return k; },
    clearTimeout: (k) => { if (live.has(k)) { t.cleared++; live.delete(k); } },
    fireAll: () => { for (const [k, v] of [...live]) { live.delete(k); v.fn(); } },
    live,
  };
  return t;
}

const quiet = () => { const lines = []; const fn = m => lines.push(m); fn.lines = lines; return fn; };
const noSleep = () => { const waits = []; const fn = async ms => { waits.push(ms); }; fn.waits = waits; return fn; };

// ── 1 ───────────────────────────────────────────────────────────────────────
test("a request that succeeds first time makes exactly one call and no retry", async () => {
  const f = fakeFetch([{ json: [{ id: 1 }] }]);
  const log = quiet(), sleep = noSleep();
  const get = H.createGet({ fetch: f, log, sleep });
  const out = await get("https://example.test/a");
  assert.deepEqual(out, [{ id: 1 }]);
  assert.equal(f.count(), 1);
  assert.equal(get.stats.requests, 1);
  assert.equal(get.stats.retries, 0);
  assert.equal(get.stats.failures, 0);
  assert.equal(log.lines.length, 0, "a clean call logs nothing");
  assert.deepEqual(sleep.waits, [], "and waits for nothing");
});

// ── 2 ───────────────────────────────────────────────────────────────────────
test("a timeout is retried, and the next attempt's result is returned", async () => {
  const f = fakeFetch([{ hang: true }, { json: { ok: true } }]);
  const timers = fakeTimers(), log = quiet(), sleep = noSleep();
  const get = H.createGet({ fetch: f, log, sleep, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, attemptTimeoutMs: 30000 });
  const p = get("https://example.test/slow");
  await new Promise(r => setImmediate(r));
  timers.fireAll();                       // the 30s deadline elapses on attempt 1
  const out = await p;
  assert.deepEqual(out, { ok: true });
  assert.equal(f.count(), 2);
  assert.equal(get.stats.retries, 1);
  assert.equal(get.stats.timeouts, 1);
  assert.match(log.lines[0], /attempt 1\/3 — timeout 30000ms — retrying in 1000ms/);
  assert.deepEqual(sleep.waits, [1000], "first backoff is ~1s");
});

// ── 3 ───────────────────────────────────────────────────────────────────────
test("a 500 is retried", async () => {
  const f = fakeFetch([{ status: 500 }, { json: [1, 2] }]);
  const log = quiet(), sleep = noSleep();
  const get = H.createGet({ fetch: f, log, sleep });
  assert.deepEqual(await get("https://example.test/b"), [1, 2]);
  assert.equal(f.count(), 2);
  assert.equal(get.stats.retries, 1);
  assert.match(log.lines[0], /HTTP 500 — retrying in 1000ms/);
  assert.equal(H.isRetryableStatus(500), true);
  assert.equal(H.isRetryableStatus(503), true);
});

// ── 4 ───────────────────────────────────────────────────────────────────────
test("a 429 is retried", async () => {
  const f = fakeFetch([{ status: 429 }, { status: 429 }, { json: "third time" }]);
  const log = quiet(), sleep = noSleep();
  const get = H.createGet({ fetch: f, log, sleep });
  assert.equal(await get("https://example.test/c"), "third time");
  assert.equal(f.count(), 3);
  assert.equal(get.stats.retries, 2);
  assert.deepEqual(sleep.waits, [1000, 3000], "backoff grows: ~1s then ~3s");
  assert.equal(H.isRetryableStatus(429), true);
});

// ── 5 ───────────────────────────────────────────────────────────────────────
test("an ordinary 4xx is not retried — asking again would not change the answer", async () => {
  for (const status of [400, 401, 403, 404, 410, 422]) {
    const f = fakeFetch([{ status }]);
    const log = quiet(), sleep = noSleep();
    const get = H.createGet({ fetch: f, log, sleep });
    await assert.rejects(() => get("https://example.test/d"), e => e.name === "HttpError" && e.status === status);
    assert.equal(f.count(), 1, status + " must be attempted once");
    assert.equal(get.stats.retries, 0);
    assert.deepEqual(sleep.waits, [], "and no time is spent waiting");
    assert.match(log.lines[0], new RegExp(`HTTP ${status} — giving up`));
    assert.equal(H.isRetryableStatus(status), false);
  }
});

// ── 6 ───────────────────────────────────────────────────────────────────────
test("exhausting every attempt throws, so an outage still fails the build", async () => {
  const f = fakeFetch([{ status: 503 }]);
  const log = quiet(), sleep = noSleep();
  const get = H.createGet({ fetch: f, log, sleep });
  await assert.rejects(() => get("https://example.test/e"), e => e.name === "HttpError" && e.status === 503);
  assert.equal(f.count(), 3, "exactly maxAttempts, not more");
  assert.equal(get.stats.retries, 2);
  assert.equal(get.stats.failures, 1);
  assert.match(log.lines[2], /attempt 3\/3 — HTTP 503 — giving up/);
  // a network failure behaves the same way
  const f2 = fakeFetch([{ net: "fetch failed" }]);
  const get2 = H.createGet({ fetch: f2, log: quiet(), sleep: noSleep() });
  await assert.rejects(() => get2("https://example.test/f"), /fetch failed/);
  assert.equal(f2.count(), 3);
});

// ── 7 ───────────────────────────────────────────────────────────────────────
test("every attempt clears its deadline — no timer outlives its request", async () => {
  // success path
  const timers = fakeTimers();
  const get = H.createGet({ fetch: fakeFetch([{ json: 1 }]), log: quiet(), sleep: noSleep(), setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  await get("https://example.test/g");
  assert.equal(timers.created, 1);
  assert.equal(timers.cleared, 1, "cleared on success too, not only on failure");
  assert.equal(timers.live.size, 0);

  // failure path, every attempt
  const t2 = fakeTimers();
  const get2 = H.createGet({ fetch: fakeFetch([{ status: 500 }]), log: quiet(), sleep: noSleep(), setTimeout: t2.setTimeout, clearTimeout: t2.clearTimeout });
  await assert.rejects(() => get2("https://example.test/h"));
  assert.equal(t2.created, 3);
  assert.equal(t2.cleared, 3);
  assert.equal(t2.live.size, 0, "nothing left pending to keep the process alive");
});

// ── 8 ───────────────────────────────────────────────────────────────────────
test("a provider that returns everything at offset 0 is walked correctly, and proves it with an empty page", async () => {
  // ASA's observed behaviour: offset skips N and returns the whole remainder.
  const all = Array.from({ length: 3588 }, (_, i) => ({ player_id: "p" + i }));
  const urls = [];
  const get = async (url) => { urls.push(url); const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]); return all.slice(off); };
  const r = await H.collectPaged(get, off => off === 0 ? "/players" : `/players?offset=${off}`, x => x.player_id, {});
  assert.equal(r.rows.length, 3588, "every row");
  assert.equal(r.requests, 2, "one for the data, one to see the empty page that proves it is complete");
  assert.match(r.stop, /empty response/);
  assert.deepEqual(urls, ["/players", "/players?offset=3588"], "the offset advanced by rows actually returned");
});

// ── 9 ───────────────────────────────────────────────────────────────────────
// The walk must not care what size the provider's pages are. Nothing is configured; every one of
// these is driven purely by "did this response add anything new".
test("fixed-size pagination works at any page size, with nothing configured", async () => {
  for (const size of [1, 7, 250, 500, 999, 1000, 1001, 1500, 4000]) {
    const all = Array.from({ length: 3588 }, (_, i) => ({ player_id: "p" + i }));
    const urls = [];
    const get = async (url) => { urls.push(url); const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]); return all.slice(off, off + size); };
    const r = await H.collectPaged(get, off => `/players?offset=${off}`, x => x.player_id, { maxPages: 5000 });
    assert.equal(r.rows.length, 3588, `page size ${size}: every row`);
    assert.equal(r.duplicates, 0, `page size ${size}: no duplicates`);
    assert.match(r.stop, /empty response/, `page size ${size}: terminates on the empty page`);
    assert.equal(r.requests, Math.ceil(3588 / size) + 1, `page size ${size}: ${Math.ceil(3588 / size)} pages plus the empty one`);
    // the ids came back in provider order, unbroken
    assert.deepEqual(r.rows.map(x => x.player_id).slice(0, 3), ["p0", "p1", "p2"], `page size ${size}: order`);
    assert.equal(r.rows[3587].player_id, "p3587", `page size ${size}: last row present`);
  }
});

// ── 9b ──────────────────────────────────────────────────────────────────────
test("the two page sizes that used to break it: 500 and 1500", async () => {
  // 500 would have looked like a short final page (500 < the old pageSize of 1000) and stopped after
  // one request. 1500 would have looked like a complete result set (1500 > 1000) and stopped too.
  for (const [size, label] of [[500, "half the old assumed page"], [1500, "more than the old assumed page"]]) {
    const all = Array.from({ length: 3588 }, (_, i) => ({ player_id: "p" + i }));
    const get = async (url) => { const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]); return all.slice(off, off + size); };
    const r = await H.collectPaged(get, off => `/players?offset=${off}`, x => x.player_id, { maxPages: 5000 });
    assert.equal(r.rows.length, 3588, `${size} (${label}): all 3588 rows, not ${size}`);
    assert.ok(r.requests > 1, `${size}: the walk did not stop after one page`);
    assert.match(r.stop, /empty response/);
  }
});

// ── 10 ──────────────────────────────────────────────────────────────────────
test("ids repeated across pages are stored once", async () => {
  const page = n => Array.from({ length: 1000 }, (_, i) => ({ player_id: "p" + ((n * 500) + i) }));  // 50% overlap
  let call = 0;
  const get = async () => (call < 3 ? page(call++) : []);
  const r = await H.collectPaged(get, off => `/p?offset=${off}`, x => x.player_id, {});
  const ids = r.rows.map(x => x.player_id);
  assert.equal(new Set(ids).size, ids.length, "no id appears twice");
  assert.equal(r.rows.length, 2000, "1000 + 500 new + 500 new");
  assert.ok(r.duplicates > 0, "and the overlap was counted, not silently dropped");
});

// ── 11 ──────────────────────────────────────────────────────────────────────
test("a page that adds no new ids ends the walk instead of looping forever", async () => {
  const same = Array.from({ length: 1000 }, (_, i) => ({ player_id: "p" + i }));
  let call = 0;
  const get = async () => { call++; return same; };     // the same page, forever
  const r = await H.collectPaged(get, off => `/p?offset=${off}`, x => x.player_id, {});
  assert.equal(r.rows.length, 1000);
  assert.equal(r.requests, 2, "one to learn, one to discover there is nothing new");
  assert.match(r.stop, /added no new ids/);
  assert.ok(call < 25, "and it did not run to the page bound");

  // a provider that never repeats but never ends is stopped by the safety bound
  let k = 0;
  const endless = async () => Array.from({ length: 1000 }, (_, i) => ({ player_id: "z" + (k++) }));
  const r2 = await H.collectPaged(endless, off => `/z?offset=${off}`, x => x.player_id, { maxPages: 5 });
  assert.equal(r2.pages, 5);
  assert.match(r2.stop, /page safety bound/);
  const r3 = await H.collectPaged(endless, off => `/z?offset=${off}`, x => x.player_id, { maxRows: 2500 });
  assert.ok(r3.rows.length >= 2500);
  assert.match(r3.stop, /row safety bound/);
});

// ── 12 ──────────────────────────────────────────────────────────────────────
test("the data-quality gates are unchanged, so an outage cannot publish a thin cache", () => {
  const s = fetchData();
  assert.match(s, /if \(withXG < 300\) issues\.push\(`Only \$\{withXG\} players with xG \(expected 400\+\) — ASA may have failed`\);/, "the ASA coverage gate is untouched");
  assert.match(s, /if \(totalPlayers < 600\) issues\.push/, "player-count gate untouched");
  assert.match(s, /if \(withMlsStats < 200\) issues\.push/, "Opta coverage gate untouched");
  assert.match(s, /if \(issues\.length > 0\) \{[\s\S]*?process\.exit\(1\);/, "and it still exits non-zero");
  assert.match(s, /if \(aer >= 200 && xg >= 50\) \{/, "the backup gate is untouched");
  // the helper is wired in, and the old unprotected one is gone
  assert.match(s, /const \{ createGet, collectPaged \} = require\("\.\/src\/data\/http\.js"\);/);
  assert.doesNotMatch(s, /async function get\(url, hdrs\) \{ const r = await fetch\(url/, "the bare no-timeout helper is gone");
  assert.match(s, /const dir = await collectPaged\(get,/, "the directory walk uses the collector");
  // Single-line anchors on purpose: a multi-line regex with a literal \n silently stops matching on
  // a CRLF checkout, and in a doesNotMatch that failure looks exactly like success.
  assert.doesNotMatch(s, /const p=await get\(url\);/, "the old hand-rolled directory loop is gone");
  assert.doesNotMatch(s, /if\(p\.length<1000\)break; \/\/ last page/, "and so is its page-size assumption");
  assert.match(s, /console\.log\(get\.report\(\)\);/, "and the run reports its request counts");
  // nothing about matching, identity or cache semantics moved in the reliability patch. The join
  // rule itself has since moved into src/data/roster-join.js, where a claimant is a roster identity
  // rather than a display name — assert the rule is wired in, not which file holds it.
  assert.match(s, /const \{ createFinder \} = require\("\.\/src\/data\/roster-join\.js"\);/, "the join rule is still enforced");
  assert.match(s, /find = createFinder\(mlsRoster,/, "and still built from the roster");
  assert.match(s, /if\(xg&&xg\.asaId\)o\.asa=xg\.asaId/, "and so is 6D identity capture");
});

// ═══════════════════════════════════════════════════════════════════════════
// ASA sibling endpoints on the shared pagination path
//
// The player directory was moved to collectPaged first; xgoals, goals-added and xpass kept the old
// "advance by 1000 until a short page" walk. That is harmless only while each stays under 1000 rows
// — which is true today (819 / 767 / 819) and guaranteed by nothing. These lock all four onto one
// tested implementation and prove the row semantics are unchanged.
// ═══════════════════════════════════════════════════════════════════════════

// Build a provider that behaves the way ASA actually does: `offset` skips N rows and returns
// EVERY remaining row, ignoring any page size.
const asaLike = (rows) => {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]);
    return rows.slice(off);
  };
  get.urls = urls;
  return get;
};
// ...and one that pages normally, for the "if ASA ever changes" case.
const pagingLike = (rows, size) => {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]);
    return rows.slice(off, off + size);
  };
  get.urls = urls;
  return get;
};

const ASA = "https://app.americansocceranalysis.com/api/v1/mls";
const URLS = {
  xgoals: (off) => `${ASA}/players/xgoals?season_name=2026&stage_name=Regular+Season${off ? `&offset=${off}` : ""}`,
  ga: (off) => `${ASA}/players/goals-added?season_name=2026&stage_name=Regular+Season${off ? `&offset=${off}` : ""}`,
  xpass: (off) => `${ASA}/players/xpass?season_name=2026&stage_name=Regular+Season${off ? `&offset=${off}` : ""}`,
};

// ── 13 ──────────────────────────────────────────────────────────────────────
test("all four ASA walks use the shared helper, and no page-size assumption survives", () => {
  const s = fetchData();
  assert.equal((s.match(/await collectPaged\(get,/g) || []).length, 4, "directory + xgoals + goals-added + xpass");
  for (const ep of ["/players/xgoals", "/players/goals-added", "/players/xpass"])
    assert.ok(new RegExp(`collectPaged\\(get,\\(off\\)=>\`\\$\\{ASA\\}${ep.replace(/\//g, "\\/")}`).test(s), ep + " goes through collectPaged");
  // the old walk is gone from every one of them
  assert.doesNotMatch(s, /if\(d\.length<1000\)break;/, "no short-page assumption");
  assert.doesNotMatch(s, /offset\+=1000;await sleep\(300\);/, "no fixed-stride advance");
  assert.doesNotMatch(s, /let offset=0;\s*\n\s*while\(true\)\{/, "no hand-rolled walk remains");
  // and the walk is no longer told what size a page is, because it no longer reasons about that
  assert.doesNotMatch(s, /pageSize/, "no call site configures a page size");
  const http = fs.readFileSync(path.join(ROOT, "src/data/http.js"), "utf8");
  assert.doesNotMatch(http, /rows\.length [<>] o\.pageSize/, "the helper does not compare a response length to an assumed page size");
  assert.match(http, /offset \+= rows\.length;/, "the offset advances by rows actually returned");
});

// ── 14 ──────────────────────────────────────────────────────────────────────
test("each endpoint is walked correctly under the provider's current behaviour", async () => {
  const sizes = { xgoals: 819, ga: 767, xpass: 819 };   // the real 2026 row counts
  for (const [key, count] of Object.entries(sizes)) {
    const rows = Array.from({ length: count }, (_, i) => ({ player_id: key + i }));
    const get = asaLike(rows);
    const r = await H.collectPaged(get, URLS[key], (x) => x.player_id, {});
    assert.equal(r.rows.length, count, key + " row count");
    assert.equal(r.requests, 2, key + ": the data, then the empty page that confirms it");
    assert.match(r.stop, /empty response/, key + " stops on evidence, not on an assumed page size");
    assert.ok(get.urls[0].indexOf("offset=") < 0, key + " asks for no offset on the first request");
    assert.ok(get.urls[1].indexOf("offset=" + count) > 0, key + " advances by the rows it actually got");
  }
});

// ── 15 ──────────────────────────────────────────────────────────────────────
test("each endpoint is correct past 1000 rows, which is the case the old loop got wrong", async () => {
  for (const key of ["xgoals", "ga", "xpass"]) {
    const rows = Array.from({ length: 2400 }, (_, i) => ({ player_id: key + i }));
    const get = asaLike(rows);
    const r = await H.collectPaged(get, URLS[key], (x) => x.player_id, {});
    assert.equal(r.rows.length, 2400, key + ": every row, not the first 1000");
    assert.equal(r.requests, 2, key + ": the lot, then the empty page");
    assert.deepEqual(r.rows.map((x) => x.player_id).slice(0, 3), [key + "0", key + "1", key + "2"], key + ": order preserved");
    // the OLD walk on the same provider: 1000-stride until a short page
    let old = 0, off = 0, oldRows = 0;
    while (true) { const d = rows.slice(off); old++; oldRows += d.length; if (d.length < 1000) break; off += 1000; }
    assert.ok(old > r.requests, `${key}: old walk needed ${old} requests and moved ${oldRows} rows for ${rows.length}`);
  }
});

// ── 16 ──────────────────────────────────────────────────────────────────────
test("each endpoint still works if ASA switches to fixed-size pagination, at any size", async () => {
  for (const key of ["xgoals", "ga", "xpass"]) {
    for (const size of [500, 1000, 1500]) {
      const rows = Array.from({ length: 2350 }, (_, i) => ({ player_id: key + i }));
      const r = await H.collectPaged(pagingLike(rows, size), URLS[key], (x) => x.player_id, {});
      assert.equal(r.rows.length, 2350, `${key} @ ${size}: all rows across pages`);
      assert.equal(r.requests, Math.ceil(2350 / size) + 1, `${key} @ ${size}: pages plus the empty one`);
      assert.match(r.stop, /empty response/);
    }
  }
});

// ── 16b ─────────────────────────────────────────────────────────────────────
// A provider-reported total is metadata, never a stop condition. It can be stale, cached, computed
// against a different filter, or simply wrong — and an under-reported one would silently truncate
// the walk, which is the class of quiet data loss this helper exists to prevent.
test("a provider-reported total is parsed and reported, and never terminates the walk", async () => {
  const N = 1200;
  const rows = Array.from({ length: N }, (_, i) => ({ player_id: "t" + i }));
  const paged = (claimed, size) => async (url) => {
    const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]);
    return { total: claimed, data: rows.slice(off, off + size) };
  };

  // ACCURATE total — still walks to the empty page; the total buys no shortcut
  const acc = await H.collectPaged(paged(N, 500), off => `/x?offset=${off}`, x => x.player_id, {});
  assert.equal(acc.rows.length, N, "all rows");
  assert.equal(acc.requests, 4, "500 + 500 + 200 + the empty page — an accurate total does not end it early");
  assert.match(acc.stop, /empty response/);
  assert.equal(acc.reportedTotal, N, "the total is reported");
  assert.equal(acc.totalMismatch, null, "and agrees, so nothing is flagged");

  // UNDER-reported total — the old rule stopped after one page. It must not.
  const under = await H.collectPaged(paged(10, 500), off => `/y?offset=${off}`, x => x.player_id, {});
  assert.equal(under.rows.length, N, "all 1200 rows, not the 10 the provider claimed");
  assert.equal(under.requests, 4, "the walk ignored the bad count entirely");
  assert.match(under.stop, /empty response/);
  assert.equal(under.reportedTotal, 10);
  assert.match(under.totalMismatch, /provider reported 10, walk collected 1200/, "the disagreement is surfaced, not acted on");

  // OVER-reported total — must not cause extra requests, a loop, or a bogus stop reason
  const over = await H.collectPaged(paged(999999, 500), off => `/z?offset=${off}`, x => x.player_id, {});
  assert.equal(over.rows.length, N, "all rows, and no attempt to reach a total that does not exist");
  assert.equal(over.requests, 4, "same request count as an accurate total");
  assert.match(over.stop, /empty response/);
  assert.match(over.totalMismatch, /provider reported 999999, walk collected 1200/);

  // the total is still parsed from every accepted shape, for logging
  for (const env of [{ total: N }, { meta: { total: N } }, { pagination: { count: N } }, { totalCount: N }, { total_count: N }]) {
    const g = async (url) => {
      const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]);
      return { ...env, items: rows.slice(off, off + 600) };
    };
    const rr = await H.collectPaged(g, off => `/e?offset=${off}`, x => x.player_id, {});
    assert.equal(rr.rows.length, N, JSON.stringify(env));
    assert.equal(rr.reportedTotal, N, JSON.stringify(env) + ": total parsed");
    assert.match(rr.stop, /empty response/, JSON.stringify(env) + ": still ends on evidence");
  }

  // and no stop reason anywhere can be a total
  const http = fs.readFileSync(path.join(ROOT, "src/data/http.js"), "utf8");
  assert.doesNotMatch(http, /stop = `provider-reported total/, "a total can never be the stop reason");
  assert.doesNotMatch(http, /seen\.size >= total/, "and is never compared against progress");
});

// ── 16c ─────────────────────────────────────────────────────────────────────
test("a conventional small page size completes under the DEFAULT safety bounds", async () => {
  // 25-row pages over the real directory size needs 144 requests. A low maxPages would itself
  // truncate a perfectly valid pagination scheme, so the default has to clear this comfortably.
  const N = 3588;
  const all = Array.from({ length: N }, (_, i) => ({ player_id: "d" + i }));
  const get = async (url) => { const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]); return all.slice(off, off + 25); };
  const r = await H.collectPaged(get, off => `/players?offset=${off}`, x => x.player_id, {});   // no options at all
  assert.equal(r.rows.length, N, "every row at 25 per page");
  assert.equal(r.requests, Math.ceil(N / 25) + 1, "144 pages plus the empty one");
  assert.match(r.stop, /empty response/, "ended on evidence, not on a bound");
  assert.doesNotMatch(r.stop, /safety bound/);
  assert.equal(r.rows[N - 1].player_id, "d" + (N - 1), "the last row is present");

  // 20-row pages too, the other end of your example
  const get20 = async (url) => { const off = Number((url.match(/offset=(\d+)/) || [, 0])[1]); return all.slice(off, off + 20); };
  const r20 = await H.collectPaged(get20, off => `/players?offset=${off}`, x => x.player_id, {});
  assert.equal(r20.rows.length, N);
  assert.match(r20.stop, /empty response/);

  // the bounds are still real, and still bounded
  assert.equal(H.DEFAULTS.attemptTimeoutMs, 30000, "unrelated defaults untouched");
  let k = 0;
  const endless = async () => Array.from({ length: 1000 }, () => ({ player_id: "z" + (k++) }));
  const capped = await H.collectPaged(endless, off => `/z?offset=${off}`, x => x.player_id, {});
  assert.match(capped.stop, /row safety bound \(200000\)/, "maxRows still stops an endless provider");
  const pageCapped = await H.collectPaged(async () => [{ player_id: "u" + (k++) }], off => `/u?offset=${off}`, x => x.player_id, { maxRows: Infinity });
  assert.match(pageCapped.stop, /page safety bound \(500\)/, "and maxPages is 500, not unbounded");
});

// ── 17 ──────────────────────────────────────────────────────────────────────
test("overlapping pages and a zero-new-id page cannot duplicate rows or loop", async () => {
  for (const key of ["xgoals", "ga", "xpass"]) {
    // 50% overlap between successive pages, then nothing new
    let call = 0;
    const overlap = async () => {
      if (call > 2) return [];
      const base = call++ * 500;
      return Array.from({ length: 1000 }, (_, i) => ({ player_id: key + (base + i) }));
    };
    const r = await H.collectPaged(overlap, URLS[key], (x) => x.player_id, {});
    const ids = r.rows.map((x) => x.player_id);
    assert.equal(new Set(ids).size, ids.length, key + ": no id stored twice");
    assert.ok(r.duplicates > 0, key + ": the overlap was counted");

    // a provider stuck on one page terminates on the second request
    const stuck = Array.from({ length: 1000 }, (_, i) => ({ player_id: key + i }));
    const r2 = await H.collectPaged(async () => stuck, URLS[key], (x) => x.player_id, {});
    assert.equal(r2.requests, 2, key + ": one to learn, one to discover there is nothing new");
    assert.match(r2.stop, /added no new ids/);
  }
});

// ── 18 ──────────────────────────────────────────────────────────────────────
test("row semantics are unchanged — the same rows produce the same maps as the old loop", async () => {
  const names = { a1: "Player A", b2: "Player B", c3: "Player C" };
  const xgRows = [
    { player_id: "a1", xgoals: 3.2, xassists: 1.1, shots: 20, shots_on_target: 9, goals: 4, primary_assists: 2, key_passes: 15, minutes_played: 1800, general_position: "AM" },
    { player_id: "b2", xgoals: 0, xassists: 0, shots: 0, shots_on_target: 0, goals: 0, primary_assists: 0, key_passes: 0, minutes_played: 90, general_position: "CB" },
  ];
  const gaRows = [
    { player_id: "a1", data: [{ action_type: "Shooting", goals_added_raw: 1.5 }, { action_type: "Passing", goals_added_raw: -0.2 }] },
    { player_id: "c3", data: [{ action_type: "Dribbling", goals_added_raw: 0.4 }] },
  ];
  const xpRows = [
    { player_id: "a1", pass_completion_percentage: 0.8123, xpass_completion_percentage: 0.7891, passes_completed_over_expected: 2.345, attempted_passes: 900 },
    { player_id: "b2", pass_completion_percentage: 0, xpass_completion_percentage: 0, passes_completed_over_expected: 0, attempted_passes: 0 },
  ];

  // the exact row bodies fetch-data.js runs, over collectPaged output
  const build = async (rows, urlFor, fn) => {
    const r = await H.collectPaged(asaLike(rows), urlFor, (x) => x.player_id, {});
    const out = {}; for (const p of r.rows) fn(out, p, names[p.player_id] || p.player_id);
    return out;
  };

  const xg = await build(xgRows, URLS.xgoals, (o, p, n) => {
    o[n] = { asaId: p.player_id, xg: p.xgoals || 0, xa: p.xassists || 0, shots: p.shots || 0, sot: p.shots_on_target || 0, goals: p.goals || 0, assists: p.primary_assists || 0, kp: p.key_passes || 0, mins: p.minutes_played || 0, pos: p.general_position || "" };
  });
  assert.deepEqual(xg["Player A"], { asaId: "a1", xg: 3.2, xa: 1.1, shots: 20, sot: 9, goals: 4, assists: 2, kp: 15, mins: 1800, pos: "AM" });
  assert.equal(xg["Player B"].xg, 0, "an observed zero stays a zero");
  assert.equal(xg["Player B"].mins, 90);

  const ga = await build(gaRows, URLS.ga, (o, p, n) => {
    if (!o[n]) o[n] = { dribbling: 0, fouling: 0, interrupting: 0, passing: 0, receiving: 0, shooting: 0, total: 0 };
    for (const a of (p.data || [])) { const k = a.action_type && a.action_type.toLowerCase(); if (k && o[n][k] !== undefined) o[n][k] = a.goals_added_raw || 0; }
    o[n].total = o[n].dribbling + o[n].fouling + o[n].interrupting + o[n].passing + o[n].receiving + o[n].shooting;
  });
  assert.equal(ga["Player A"].shooting, 1.5);
  assert.equal(ga["Player A"].passing, -0.2);
  assert.equal(+ga["Player A"].total.toFixed(2), 1.3, "total sums the six components, negatives included");
  assert.equal(ga["Player C"].dribbling, 0.4);
  assert.equal(ga["Player C"].shooting, 0, "components absent from data stay 0");

  const xp = await build(xpRows, URLS.xpass, (o, p, n) => {
    o[n] = { pp: p.pass_completion_percentage ? Math.round(p.pass_completion_percentage * 1000) / 10 : 0, xpp: p.xpass_completion_percentage ? Math.round(p.xpass_completion_percentage * 1000) / 10 : 0, poe: p.passes_completed_over_expected ? Math.round(p.passes_completed_over_expected * 100) / 100 : 0, att: p.attempted_passes || 0 };
  });
  assert.deepEqual(xp["Player A"], { pp: 81.2, xpp: 78.9, poe: 2.35, att: 900 }, "same rounding as before");
  assert.deepEqual(xp["Player B"], { pp: 0, xpp: 0, poe: 0, att: 0 });
});

// ── 19 ──────────────────────────────────────────────────────────────────────
test("successive requests are paced, and a single-request walk waits for nothing", async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  // one request: no delay at all
  const one = Array.from({ length: 500 }, (_, i) => ({ player_id: "x" + i }));
  await H.collectPaged(asaLike(one), URLS.xgoals, (x) => x.player_id, { delayMs: 300, sleep });
  assert.deepEqual(waits, [300], "the first request is immediate; only the confirming one is paced");
  // four requests: paced between them, never before the first
  waits.length = 0;
  const many = Array.from({ length: 2350 }, (_, i) => ({ player_id: "y" + i }));
  await H.collectPaged(pagingLike(many, 1000), URLS.xgoals, (x) => x.player_id, { delayMs: 300, sleep });
  assert.deepEqual(waits, [300, 300, 300], "three gaps for four requests");
  // and the default stays 0
  const waits2 = [];
  await H.collectPaged(pagingLike(many, 1000), URLS.xgoals, (x) => x.player_id, { sleep: async (ms) => waits2.push(ms) });
  assert.deepEqual(waits2, [], "no pacing unless asked for");
});
