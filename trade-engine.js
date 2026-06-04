// trade-engine.js
// MLS Trade Machine — rules engine (Path A: budget-charge compliance).
//
// Pure functions, no UI. Evaluate a proposed trade against MLS 2026 roster
// rules and report resulting slot counts, salary-budget charge, fairness, and
// any violations/warnings.
//
// HONESTY NOTES baked in:
//  - Slot counts (DP / U22 / International) come from the MLS roster feed and
//    are authoritative.
//  - Salary data is INCOMPLETE for some big DPs (missing in the MLSPA guide),
//    so the dollar-budget check is flagged approximate when salaries are 0.
//  - Some clubs show 4 DPs in the source (a known MLS-API quirk; max is 3); a
//    pre-existing over-count is reported as a data anomaly, not blamed on the trade.
//  - GAM/TAM balances are not in our data, so we report "needs $X allocation
//    money to be legal" rather than asserting a club has it (that's Path B).

// ─── 2026 CONSTANTS ──────────────────────────────────────────────────────────
// Verified from MLS sources (Feb 2026). UPDATE EACH FEBRUARY when the league
// publishes new figures. [V]=verified this cycle, [C]=configurable/verify.
const MLS_2026 = {
  MAX_SALARY_BUDGET_CHARGE: 803125,   // [V] DP threshold; DP charges only this to budget
  MIDSEASON_DP_CHARGE: 401563,        // [V] half-season DP charge (secondary window)
  TAM_CEILING: 1803125,               // [V] Max Target Allocation Money amount
  SENIOR_SALARY_BUDGET: 5950000,      // [C] 2025 figure; confirm 2026 on mlssoccer.com
  GAM_ALLOTMENT: 3280000,             // [V] per-club GAM allotment 2026
  DISCRETIONARY_TAM: 2125000,         // [V] per-club discretionary TAM 2026
  MAX_DP: 3,                          // [V] up to three Designated Players
  MAX_U22: 3,                         // [C] DP-model: up to 3 U22 Initiative slots
  MAX_INTERNATIONAL: 8,               // [C] intl slots (tradeable) — verify count
  SENIOR_ROSTER_MAX: 20,              // [C] senior roster spots (verify)
  TOTAL_ROSTER_MAX: 30,               // [C] senior + supplemental (verify)
};

const num = v => (typeof v === "number" && isFinite(v) ? v : 0);

// Does this player occupy a roster slot? Senior + Supplemental count; loaned-out
// and off-roster (no category — SEI, not registered) do NOT.
function countsToRoster(p) {
  if (p.isLoanedOut) return false;
  const c = p.rosterCategory || "";
  return c === "Senior" || c.indexOf("Supplemental") === 0;
}
// Senior-roster players carry the salary budget + DP charges.
function isSenior(p) { return !p.isLoanedOut && (p.rosterCategory || "") === "Senior"; }

// Budget charge for one player. DPs charge only the max budget charge; everyone
// else charges their salary (TAM/GAM buy-downs would lower this — Path B).
function budgetCharge(p, K) {
  if (p.isDP) return K.MAX_SALARY_BUDGET_CHARGE;
  return num(p.salary || p.sal);
}

// Summarize a roster (array of player objects) against the rules. Counts only
// roster-occupying players; budget is computed over the senior roster.
function summarize(roster, K = MLS_2026) {
  const counting = roster.filter(countsToRoster);
  const senior = roster.filter(isSenior);
  const s = {
    size: counting.length,
    seniorSize: senior.length,
    offRoster: roster.length - counting.length,
    dp: 0, u22: 0, intl: 0, hg: 0,
    budgetCharge: 0,
    missingSalary: 0,
    totalGrade: 0, gradedCount: 0,
  };
  for (const p of counting) {
    if (p.isDP) s.dp++;
    if (p.isU22) s.u22++;
    if (p.isInternational) s.intl++;
    if (p.isHomegrown) s.hg++;
    if (typeof p.overall === "number") { s.totalGrade += p.overall; s.gradedCount++; }
  }
  for (const p of senior) {
    const sal = num(p.salary || p.sal);
    if (!p.isDP && sal === 0) s.missingSalary++;
    s.budgetCharge += budgetCharge(p, K);
  }
  s.avgGrade = s.gradedCount ? +(s.totalGrade / s.gradedCount).toFixed(1) : 0;
  return s;
}

// Compliance check for a resulting roster. Returns {violations, warnings}.
// `prev` = the team's summary BEFORE the trade, used to distinguish a trade
// that *creates* a violation from one that merely inherits a data anomaly.
function checkCompliance(after, prev, K = MLS_2026) {
  const violations = [], warnings = [];

  // DP slots — authoritative (isDP from MLS roster feed)
  if (after.dp > K.MAX_DP) {
    if (prev.dp > K.MAX_DP && after.dp >= prev.dp) {
      warnings.push(`Already shows ${prev.dp} DPs in source data (MLS max is ${K.MAX_DP}; likely a roster-feed anomaly). Trade doesn't reduce it.`);
    } else {
      violations.push(`${after.dp} Designated Players — exceeds max of ${K.MAX_DP}. Buy one down with GAM/TAM or include them in the trade.`);
    }
  }

  // U22 slots
  if (after.u22 > K.MAX_U22) warnings.push(`${after.u22} U22 Initiative players (typical max ${K.MAX_U22} in DP model) — verify against club's declared model.`);

  // International slots (tradeable, so a warning not a hard block)
  if (after.intl > K.MAX_INTERNATIONAL) warnings.push(`${after.intl} international players — exceeds ${K.MAX_INTERNATIONAL} slots. Club needs extra international spots (tradeable) to be legal.`);

  // Roster size
  if (after.size > K.TOTAL_ROSTER_MAX) violations.push(`${after.size} players — exceeds roster limit of ${K.TOTAL_ROSTER_MAX}.`);

  // Salary budget (approximate — flag missing data)
  const over = after.budgetCharge - K.SENIOR_SALARY_BUDGET;
  if (after.missingSalary > 0) {
    warnings.push(`Budget is approximate: ${after.missingSalary} player(s) missing salary data. Dollar legality can't be fully confirmed.`);
  }
  if (over > 0) {
    const allocAvail = K.GAM_ALLOTMENT + K.DISCRETIONARY_TAM;
    if (over > allocAvail) {
      violations.push(`Budget charge $${(after.budgetCharge/1e6).toFixed(2)}M is $${(over/1e6).toFixed(2)}M over the $${(K.SENIOR_SALARY_BUDGET/1e6).toFixed(2)}M budget — beyond even full GAM+TAM ($${(allocAvail/1e6).toFixed(2)}M).`);
    } else {
      warnings.push(`Budget charge is $${(over/1e6).toFixed(2)}M over budget — legal only if the club has that much GAM/TAM available (we don't track live balances).`);
    }
  }

  return { violations, warnings };
}

// Evaluate a full proposed trade.
//   rosterA / rosterB : full arrays of each club's players
//   outA / outB       : arrays of players leaving A (to B) / leaving B (to A)
// Returns structured before/after for both clubs + fairness + verdict.
function evaluateTrade({ rosterA, rosterB, outA, outB, K = MLS_2026 }) {
  const idOf = p => p.sportecId || p.id || p.n;
  const outAids = new Set(outA.map(idOf)), outBids = new Set(outB.map(idOf));

  const afterA = rosterA.filter(p => !outAids.has(idOf(p))).concat(outB);
  const afterB = rosterB.filter(p => !outBids.has(idOf(p))).concat(outA);

  const beforeA = summarize(rosterA, K), aA = summarize(afterA, K);
  const beforeB = summarize(rosterB, K), aB = summarize(afterB, K);

  const compA = checkCompliance(aA, beforeA, K);
  const compB = checkCompliance(aB, beforeB, K);

  // Fairness: grade + salary moving each way
  const sum = (arr, f) => arr.reduce((t, p) => t + f(p), 0);
  const gradeOut = sum(outA, p => num(p.overall)), gradeIn = sum(outB, p => num(p.overall));
  const salOutA = sum(outA, p => num(p.salary || p.sal)), salOutB = sum(outB, p => num(p.salary || p.sal));
  const fairness = {
    teamAGivesGrade: gradeOut, teamAGetsGrade: gradeIn,
    gradeDelta: +(gradeIn - gradeOut).toFixed(1),     // + = A gains grade
    teamAGivesSalary: salOutA, teamAGetsSalary: salOutB,
    salaryDelta: salOutB - salOutA,                    // + = A takes on salary
    verdict: Math.abs(gradeIn - gradeOut) <= 8 ? "balanced" : (gradeIn > gradeOut ? "favors Team A" : "favors Team B"),
  };

  const legal = compA.violations.length === 0 && compB.violations.length === 0;
  return {
    legal,
    teamA: { before: beforeA, after: aA, ...compA },
    teamB: { before: beforeB, after: aB, ...compB },
    fairness,
    constants: K,
  };
}

if (typeof module !== "undefined") module.exports = { MLS_2026, summarize, checkCompliance, evaluateTrade, budgetCharge };
