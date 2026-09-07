STEP 1 of 2 — Grading Integrity audit artifacts.
No grading math changes. Safe to commit and push on its own.

Files (map directly to your repo root):
  test/fixtures/frozen-cache.json           (new — permanent versioned data snapshot)
  test/fixtures/characterization.json       (new — the approved 2026-09-07 baseline grades,
                                              generated from frozen-cache.json BEFORE the
                                              Grading Integrity patch)
  scripts/audit-grades.js                    (new)
  scripts/make-characterization-fixture.js   (replaces existing file)
  test/characterization.test.js              (replaces existing file)
  package.json                               (replaces existing file — adds "audit-grades"
                                               and "make-fixture" scripts)

After extracting into the repo root:
  npm test          <- should show 35/35 passing (characterization tests included)
  git add -A
  git commit -m "Grading Integrity audit: frozen fixture, audit tooling, corrected methodology copy — no grading changes"
  git pull origin main --no-rebase
  git push

Then proceed to Step 2: node patch-phase6-grading-integrity.js
(Step 2 will regenerate characterization.json again at the end, against the NEW patched
engine — that's expected and correct; it locks in the shipped behavior as the new baseline.)
