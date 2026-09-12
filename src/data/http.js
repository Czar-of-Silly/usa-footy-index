// src/data/http.js — resilient HTTP for the Node fetch scripts.
//
// CommonJS and Node-only on purpose: this is required by fetch-data.js and its siblings, which run
// under `node` in GitHub Actions. It is never imported by src/app.jsx and never reaches the browser
// bundle. (Everything else under src/ is .mjs because esbuild bundles it; this one is not bundled.)
//
// WHY THIS EXISTS
// The shared helper in fetch-data.js was:
//
//     async function get(url, hdrs) { const r = await fetch(url, ...); if (!r.ok) throw ...; return r.json(); }
//
// No timeout, no retry, no backoff — for every ESPN and ASA request in the pipeline. A hung socket
// therefore blocked until the workflow's 20-minute step budget killed the job, which is exactly how
// the scheduled run failed. Measuring ASA while it was otherwise healthy caught a single 15.6-second
// response in a sample whose median was under a second, so the variance is real and recurring.
//
// WHAT THIS DOES NOT CHANGE
// Nothing about which row joins to which player, no grading, no cache semantics, and none of the
// data-quality gates. A genuine source outage must still fail the build: retries exist to survive a
// blip, never to paper over an outage and publish a thin cache.
"use strict";

const DEFAULTS = {
  attemptTimeoutMs: 30000,   // per attempt, not per call
  maxAttempts: 3,
  backoffMs: [1000, 3000],   // after attempt 1, then after attempt 2
};

class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status} ${url}`); this.name = "HttpError"; this.status = status; this.url = url; }
}
class TimeoutError extends Error {
  constructor(url, ms) { super(`timeout after ${ms}ms ${url}`); this.name = "TimeoutError"; this.url = url; this.timeoutMs = ms; }
}

// 429 means "slow down" and 5xx means "my fault" — both are worth asking again. Every other 4xx is a
// statement about the request itself, and repeating it just wastes the step budget.
const isRetryableStatus = s => s === 429 || (s >= 500 && s <= 599);

function isRetryableError(e) {
  if (!e) return false;
  if (e instanceof TimeoutError) return true;
  if (e instanceof HttpError) return isRetryableStatus(e.status);
  if (e.name === "AbortError") return true;
  if (e.name === "SyntaxError") return false;          // a malformed body will be malformed again
  if (e.name === "TypeError") return true;             // undici wraps network failures as TypeError
  return !!e.cause;                                    // and attaches the socket error as `cause`
}

function describe(e) {
  if (e instanceof TimeoutError) return `timeout ${e.timeoutMs}ms`;
  if (e instanceof HttpError) return `HTTP ${e.status}`;
  return `network: ${(e && e.message) || e}`;
}

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "?"; } }

// Build a `get(url, headers)` with a per-attempt deadline and bounded retries.
// Every dependency is injectable so the behaviour can be tested without a network or real clock.
function createGet(options) {
  const o = { ...DEFAULTS, ...(options || {}) };
  const fetchImpl = o.fetch || globalThis.fetch;
  const setTimeoutImpl = o.setTimeout || setTimeout;
  const clearTimeoutImpl = o.clearTimeout || clearTimeout;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const log = o.log || (m => console.warn(m));
  const labelOf = o.labelOf || hostOf;

  const stats = { requests: 0, retries: 0, timeouts: 0, failures: 0, startedAt: Date.now(), byLabel: Object.create(null) };
  const bucket = l => (stats.byLabel[l] = stats.byLabel[l] || { requests: 0, retries: 0, timeouts: 0, failures: 0 });

  async function attempt(url, hdrs) {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeoutImpl(() => { timedOut = true; ctl.abort(); }, o.attemptTimeoutMs);
    try {
      const init = { signal: ctl.signal };
      if (hdrs) init.headers = hdrs;
      const r = await fetchImpl(url, init);
      if (!r.ok) throw new HttpError(r.status, url);
      return await r.json();     // inside the deadline, so a stalled body counts as a timeout too
    } catch (e) {
      if (timedOut) throw new TimeoutError(url, o.attemptTimeoutMs);
      throw e;
    } finally {
      clearTimeoutImpl(timer);   // always, including on success — no timer outlives its request
    }
  }

  async function get(url, hdrs) {
    const label = labelOf(url);
    const b = bucket(label);
    let lastErr;
    for (let a = 1; a <= o.maxAttempts; a++) {
      stats.requests++; b.requests++;
      try { return await attempt(url, hdrs); }
      catch (e) {
        lastErr = e;
        if (e instanceof TimeoutError) { stats.timeouts++; b.timeouts++; }
        const willRetry = isRetryableError(e) && a < o.maxAttempts;
        const delay = o.backoffMs[Math.min(a - 1, o.backoffMs.length - 1)];
        log(`  [HTTP] ${label} attempt ${a}/${o.maxAttempts} — ${describe(e)}` + (willRetry ? ` — retrying in ${delay}ms` : ` — giving up`));
        if (!willRetry) break;
        stats.retries++; b.retries++;
        await sleep(delay);
      }
    }
    stats.failures++; b.failures++;
    throw lastErr;
  }

  get.stats = stats;
  get.report = () => {
    const secs = ((Date.now() - stats.startedAt) / 1000).toFixed(1);
    const lines = [`  [HTTP] ${stats.requests} requests · ${stats.retries} retries · ${stats.timeouts} timeouts · ${stats.failures} failed calls · ${secs}s`];
    for (const [l, v] of Object.entries(stats.byLabel))
      lines.push(`         ${l}: ${v.requests} req` + (v.retries ? `, ${v.retries} retried` : "") + (v.timeouts ? `, ${v.timeouts} timed out` : "") + (v.failures ? `, ${v.failures} failed` : ""));
    return lines.join("\n");
  };
  return get;
}

// ─── PAGINATION ──────────────────────────────────────────────────────────────
// ASA's `offset` skips N rows and returns EVERYTHING after them, rather than a fixed-size page:
//
//     offset 0 -> 3588 rows,  1000 -> 2588,  2000 -> 1588,  3000 -> 588
//
// The old loop assumed 1000-row pages and stopped only on a short page, so it made four requests
// that fetched 8,352 rows to obtain 3,588 — three of them pure duplication, each an extra chance to
// hang. This does not hard-code that behaviour: it tracks unique ids and forward progress, so it
// terminates correctly whether the provider returns everything at once, pages normally, repeats
// rows, or changes its mind later.
function totalOf(res) {
  if (!res || Array.isArray(res) || typeof res !== "object") return null;
  for (const k of ["total", "count", "totalCount", "total_count"]) {
    const v = res[k];
    if (typeof v === "number" && isFinite(v) && v >= 0) return v;
  }
  const m = res.meta || res.pagination;
  if (m) for (const k of ["total", "count", "totalCount", "total_count"]) {
    const v = m[k];
    if (typeof v === "number" && isFinite(v) && v >= 0) return v;
  }
  return null;
}
const rowsOf = res => Array.isArray(res) ? res : ((res && (res.data || res.items || res.results)) || []);

async function collectPaged(get, urlFor, idOf, options) {
  const o = { pageSize: 1000, maxPages: 25, maxRows: 200000, delayMs: 0, ...(options || {}) };
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const seen = new Map();
  let offset = 0, pages = 0, requests = 0, stop = null, duplicates = 0;

  while (pages < o.maxPages) {
    // `delayMs` paces SUBSEQUENT requests only — the first is immediate, so a walk that turns out to
    // need one request (the provider's current behaviour) costs nothing. It exists because these are
    // free public endpoints and a future paginating walk should not hammer them back to back.
    if (pages > 0 && o.delayMs > 0) await sleep(o.delayMs);
    const res = await get(urlFor(offset));
    pages++; requests++;
    const rows = rowsOf(res);
    const total = totalOf(res);

    if (!rows.length) { stop = "empty response"; break; }

    let added = 0;
    for (const r of rows) {
      const id = idOf(r);
      if (id === undefined || id === null || id === "") continue;
      if (seen.has(id)) { duplicates++; continue; }
      seen.set(id, r);
      added++;
    }

    // Forward progress is the real termination condition: a page that teaches us nothing new ends
    // the walk no matter what shape the provider's pagination takes.
    if (added === 0) { stop = "page added no new ids"; break; }
    if (seen.size >= o.maxRows) { stop = `row safety bound (${o.maxRows})`; break; }
    if (total != null && seen.size >= total) { stop = `provider-reported total (${total}) reached`; break; }
    // More rows than a page means the provider ignored our page size and handed back the whole
    // remainder — there is nothing after this.
    if (rows.length > o.pageSize) { stop = "provider returned the complete result set in one response"; break; }
    // A short page is the ordinary end of fixed-size pagination.
    if (rows.length < o.pageSize) { stop = "short page — end of results"; break; }

    offset += rows.length;
  }
  if (!stop) stop = `page safety bound (${o.maxPages})`;
  return { rows: [...seen.values()], pages, requests, duplicates, stop };
}

module.exports = { createGet, collectPaged, isRetryableStatus, isRetryableError, totalOf, rowsOf, HttpError, TimeoutError, DEFAULTS };
