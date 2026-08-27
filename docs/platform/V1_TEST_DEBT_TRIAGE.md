# V1 test debt triage

Every known failing assertion classified for V1 relevance. Measured on branch
`V7`, testing environment, local Postgres foundation fixture, each suite run
**in isolation** unless stated otherwise.

Companion to `docs/platform/KNOWN_TEST_DEBT.md`, which records the raw counts.
This document records *why* each one fails and whether V1 should care.

## Headline

The documented baseline was 49 combined / 45 isolated. Re-measuring found three
corrections:

1. **Two failures were not product debt at all.** The `demo:v5` dataset suite
   fails only because `PLATFORM_DEPLOYMENT_CODE` leaks from the developer shell
   into the spawned CLI, which then refuses to write to the ephemeral test
   database. With that variable unset the suite passes 9/9. The CLI safety gate
   was working correctly the whole time.
2. **The isolated baseline was understated.** Two suites fail in isolation and
   were recorded only as cross-suite interference:
   `blessboard-branch-mini-website-pages` (1) and
   `blessboard-branch-service-times` (2). True isolated baseline is **46**, not 45.
3. **37 of the 40 "accessibility" failures were not accessibility failures.**
   They were pinned CSS cache-buster numbers (`hq-admin.css?v=75` and friends).
   Accessibility structure — skip links, landmarks, `for=` labels,
   `aria-describedby`, `aria-invalid`, `role="alert"` — is intact throughout.

After the one trivial test-only correction described below, **12** assertions
remain failing. Of those, **exactly one root cause is a real product bug**.

| | Count |
|---|---|
| Isolated failures before triage (clean env) | 46 |
| Cleared by trivial version-pin correction | 34 |
| **Remaining** | **12** |
| …of which real product defects | 3 assertions / 1 root cause |
| …of which stale assertions | 7 |
| …of which test fixture gaps | 2 |

## The one real product bug

**Branch-scoped content authorization uses the church's catalogue primary
branch instead of the signed-in admin's assigned branch.**

`src/blessboard/http/contentAdminRoutes.js` resolves the authorization resource
context for the branch variant from `tenant.primaryBranch`:

```
branchId: variant === "hq" ? null : tenant.primaryBranch && tenant.primaryBranch.id ...
```

A Branch Admin assigned to a non-primary branch holds branch-scoped
`website.*` grants on *their* branch, so the check compares their grant against
a different branch and denies with 403 “You do not have access to the website
editor.”

What makes this conclusive rather than a fixture guess: the **single-site**
branch admin tests pass and the **multi-site** ones fail. In a single-site
church the assigned branch *is* the primary branch, so the defect is invisible.
It only appears once a church has more than one branch — and three independent
suites assert 200 here.

User impact: in any multi-branch church, a Branch Admin cannot open their own
branch content editor, mini-website pages, or service times editor. That is a
V1 blocker for multi-branch churches, and it is squarely in the “branch admin
editor” area flagged for attention.

Not fixed here: changing authorization scope resolution is a product change,
not a trivial test correction. Recommended fix is to resolve `branchId` from the
actor's assigned branch (falling back to primary only when the actor has no
branch assignment), then re-run the three suites below.

## Per-assertion records

### 1. Stale CSS cache-buster pins — 34 assertions (FIXED, trivial)

TEST: `tests/blessboard-v5-a11y-structure.test.js` (34 subtests across HQ,
platform-admin and branch-admin templates)
ASSERTION: `assert.match(shell, /hq-admin.css\?v=75/)` and equivalents for
`platform-admin.css?v=57`, `branch-admin.css?v=44`
CURRENT_FAILURE: input did not match the regular expression
ROOT_CAUSE: shells are at `v=76`, `v=62`, `v=45`. The assertion pinned an exact
build number, so every legitimate CSS bump broke 34 tests at once. The intent —
"the admin stylesheet is linked with a cache-busting version" — was never
version-specific.
V1_RELEVANT: NO
REAL_PRODUCT_BUG: NO
STALE_TEST: YES
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **STALE_ASSERTION** — corrected in this pass (see “Change made”)

### 2. Branch shell `/Support/i` over-broad regex — 1 assertion

TEST: `blessboard-v5-a11y-structure` › `branch shell has skip link, main landmark, and drawer wiring`
ASSERTION: `assert.doesNotMatch(start, /Support/i)`
CURRENT_FAILURE: input was expected to not match `/Support/i`
ROOT_CAUSE: the test reads **template source**, not rendered HTML, and the
branch shell now contains `include('./support-mode-banner')`. The support-mode
banner is an intended feature (it warns when a platform support session is
active). The assertion's real intent — no platform *Support nav item* leaking
into the branch shell — is still valid but the regex is too broad to express it.
V1_RELEVANT: NO (assertion defect, not behaviour)
REAL_PRODUCT_BUG: NO
STALE_TEST: YES
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **STALE_ASSERTION** — tighten to the nav item (e.g. `data-bb-nav-key`
or `>Support<`) rather than deleting; do not loosen to nothing.

### 3. Platform-admin deployments surface moved — 4 assertions

TEST: `blessboard-v5-a11y-structure` › `platform admin dashboard…`,
`platform admin settings…`, `platform admin deployments directory…`,
`platform admin deployment detail…`
ASSERTION: `/\/admin\/deployments/`, `/data-bb-pa-settings-deployment="1"/`,
`/href="\/admin\/deployments\/<%= encodeURIComponent\(d\.deploymentCode\) %>"/`,
`/href="\/admin\/deployments"/`
CURRENT_FAILURE: input did not match the regular expression
ROOT_CAUSE: the deployments surface was moved under `/admin/system/deployments`
and the settings hook renamed to `data-bb-pa-settings-deploy-link`. Templates use
the new canonical paths; `/admin/deployments` is retained as a 302 redirect
(`platformAdminRoutes.js:2900-2905`). Navigation works — only the pinned literals
are stale.
V1_RELEVANT: NO (internal platform-admin ops surface)
REAL_PRODUCT_BUG: NO
STALE_TEST: YES
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **POST_V1** (classification: STALE_ASSERTION)

### 4. Auth template copy drift — 1 assertion

TEST: `blessboard-v5-a11y-structure` › `tenant auth templates preserve CSRF fields and omit unsupported auth chrome`
ASSERTION: `assert.match(register, /Email Address/)` (and `/Phone Number/` behind it)
CURRENT_FAILURE: input did not match `/Email Address/`
ROOT_CAUSE: copy changed with a real product decision — email became optional
and phone required: `<label for="email">Email address, optional</label>`,
`<label for="phone">Mobile phone number *</label>`. The assertion is
case-sensitive and pins the old wording.
V1_RELEVANT: NO for the assertion. The **accessibility substance it was guarding
is intact**: both inputs keep `<label for=…>`, `aria-describedby`,
`aria-invalid` and `role="status"` error regions, verified by reading the
template.
REAL_PRODUCT_BUG: NO
STALE_TEST: YES
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **V1_FIX** (test-only) — re-point at the current labels so the auth
form's accessible-labelling guard keeps working; this is the one stale
assertion whose *purpose* is genuinely accessibility.

### 5. HQ navigation blocked by the onboarding gate — 2 assertions

TEST: `blessboard-website-mode-admin-nav` › `single-site HQ navigation shows Website only`,
`multi-site HQ navigation shows HQ Website, Branch Websites, and active branches only`
ASSERTION: `assert.equal(res.status, 200)` on `GET /hq`
CURRENT_FAILURE: `303 !== 200`, `Location: /hq/onboarding`
ROOT_CAUSE: the guided onboarding gate (`hqAdminRoutes.js:352`,
`onboardingRequired`) was added after these tests. A freshly provisioned church
legitimately requires onboarding, so `/hq` redirects. The fixture never
completes or skips onboarding.
V1_RELEVANT: **YES** — the redirect is correct behaviour, but it means the
website admin navigation assertions (single-site “Website” vs multi-site “HQ
Website / Branch Websites”) **no longer execute at all**. This is a silent
coverage loss in a flagged V1 area, which is worse than a visible failure.
REAL_PRODUCT_BUG: NO
STALE_TEST: YES (fixture predates the gate)
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **V1_FIX** (test-only) — complete or skip onboarding in the fixture,
or assert against the post-onboarding dashboard, to restore nav coverage.

### 6. Branch Admin denied on assigned branch — 3 assertions

TEST: `blessboard-website-mode-admin-nav` › `multi-site Branch Admin sees My Branch Website only for assigned branch`;
`blessboard-branch-mini-website-pages` › `9. Branch Admin edits only the assigned branch`;
`blessboard-branch-service-times` › `3. Branch Admin edits only the assigned branch`
ASSERTION: `assert.equal(res.status, 200)` for a branch admin on their own branch
CURRENT_FAILURE: `403 !== 200` — “You do not have access to the website editor.”
ROOT_CAUSE: see [The one real product bug](#the-one-real-product-bug) —
authorization resolves the branch from the catalogue primary branch, not the
actor's assignment.
V1_RELEVANT: **YES**
REAL_PRODUCT_BUG: **YES**
STALE_TEST: NO — the tests assert correct intended behaviour
CROSS_SUITE_INTERFERENCE: NO — reproduced in isolation in all three suites
PRIORITY: **V1_BLOCKER**

### 7. Service-times empty-state sentinel — 1 assertion

TEST: `blessboard-branch-service-times` › `10. No real church receives demo times`
ASSERTION: `assert.equal(resolved.source, null)`
CURRENT_FAILURE: `'missing' !== null`
ROOT_CAUSE: the resolver now returns an explicit sentinel
`SOURCE.MISSING` (`resolveBranchWebsiteSettings.js:597`) instead of `null` when
nothing is configured. The behaviour the test actually guards is correct and
still verified by its neighbours: `entries.length === 0` and no
`"Sunday Gathering"` demo fill. Only the sentinel representation changed.
V1_RELEVANT: NO — **no demo data leaks into real churches**; this is not a demo
contamination bug despite the test name
REAL_PRODUCT_BUG: NO
STALE_TEST: YES
CROSS_SUITE_INTERFERENCE: NO
PRIORITY: **STALE_ASSERTION** — accept `null` or `"missing"` for “nothing
configured”.

### 8. Demo dataset CLI blocked by leaked env var — 2 assertions (now passing)

TEST: `blessboard-demo-v5-dataset` › `CLI dry-run (plan) succeeds with matched identity`,
`CLI apply with --confirm writes idempotently`
ASSERTION: `assert.equal(exitCode, 0)`
CURRENT_FAILURE: exit `2`, `status=blocked`, `message: deployment_code_mismatch`
ROOT_CAUSE: the test spawns the CLI with `env: { ...process.env }`, inheriting
`PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing` from the developer shell.
`provisionCliSafety.js:174-184` compares that against the ephemeral test
database's deployment code and correctly refuses to write. **Verified**: with
`env -u PLATFORM_DEPLOYMENT_CODE` the suite passes 9/9.
V1_RELEVANT: NO
REAL_PRODUCT_BUG: NO — the safety gate behaved exactly as designed
STALE_TEST: NO
CROSS_SUITE_INTERFERENCE: YES (environment leakage, not database sharing)
PRIORITY: **TEST_ISOLATION_BUG** — the suite should pin
`PLATFORM_DEPLOYMENT_CODE` to the fixture's own deployment code rather than
inherit the ambient shell.

### 9. Cross-suite database interference — 3 assertions

TEST: `blessboard church website preview and publish` (2),
`ActiveClinic website hardening` (1)
ASSERTION: various status/state assertions
CURRENT_FAILURE: only when run in one `node --test` invocation with the suites above
ROOT_CAUSE: suites share a single foundation database and reset it
independently. **Verified**: both suites pass 5/5 in isolation.
V1_RELEVANT: NO for the product; YES for trustworthy CI signal
REAL_PRODUCT_BUG: NO
STALE_TEST: NO
CROSS_SUITE_INTERFERENCE: YES
PRIORITY: **TEST_ISOLATION_BUG**

Note: the combined-run interference set is **not stable**. A combined run of the
seven suites here produced 48 failures with a different interference set than
the documented 49 (the two suites above passed, while the branch suites failed).
Only the isolated count is a reliable baseline; combined counts should not be
used as a regression gate without per-suite database isolation.

## Areas flagged for attention

| Area | Finding |
|---|---|
| Accessibility | **Clean.** 37 of 40 “a11y” failures were CSS version pins and path renames. Landmarks, skip links, `for=` labels and ARIA error wiring verified present. One genuinely a11y-adjacent assertion (auth labels) needs re-pointing. |
| Website admin navigation | **Coverage lost, not broken.** HQ nav assertions stop at the onboarding redirect and never run. Fixture fix restores them. |
| Demo dataset | **Not a product defect.** Failures came from a leaked shell variable; the CLI safety gate worked. Passes 9/9 clean. |
| Church website publish | **Passes in isolation.** Failures are database interference only. |
| Branch admin editor | **Real V1 blocker.** Branch admins in multi-branch churches are denied their own branch editor. |
| ActiveClinic website hardening | **Passes in isolation.** Interference only. |

## Resolution status (Overnight 5)

Items 1–5 of the fix order below are **done**. Items 6–7 remain open as
documented post-V1 debt.

| Item | Priority | Status |
|---|---|---|
| Branch-scoped authorization uses the assigned branch (record 6) | V1_BLOCKER | Fixed in product code |
| Onboarding-aware admin-nav fixture (record 5) | V1_FIX | Fixed in fixture |
| `PLATFORM_DEPLOYMENT_CODE` leak into demo CLI (record 8) | TEST_ISOLATION_BUG | Fixed; suite now hermetic |
| Auth label assertions (record 4) | V1_FIX | Re-pointed at label bindings |
| Service-times sentinel + branch shell `Support` regex (records 7, 2) | STALE_ASSERTION | Both corrected |
| Per-suite database isolation (record 9) | TEST_ISOLATION_BUG | **Open** — post-V1 |
| Platform-admin deployments literals (record 3) | POST_V1 | **Open** — post-V1 |

V1_BLOCKER = 0, V1_HIGH = 0, V1_FIX = 0.

The blocker turned out to have **four** call sites, not one. Fixing the two
permission gates named in record 6 exposed two more instances of the same
`tenant.primaryBranch` assumption:

- `branchAdminShellLocals` evaluated **navigation permission flags** against the
  primary branch, so a multi-branch branch admin's Website and Content links
  were filtered out of their own sidebar entirely.
- the same file rendered `branchDisplayName` from the primary branch, so the
  shell chrome labelled a Campus East admin as being in "HQ A".

All four now resolve the actor's assigned branch through one shared helper,
`src/blessboard/http/resolveAssignedBranchContext.js`, so the assumption cannot
drift back in independently. Church-scoped actors keep the previous
primary-branch fallback, and cross-branch/cross-church denial is unchanged.

One further stale assertion surfaced during verification.
`blessboard-website-scope` test 7 asserted that a campus-only admin **could
not** enter `/branch-admin/content` on the church host, commenting that "the
branch shell binds to host primary branch". That encoded the bug as intent, and
it directly contradicted test 5 in the same file — "Branch Admin scope does not
silently become the primary branch" — plus test 7's own later assertion that a
*primary*-branch admin gets 200 on that exact route. It now asserts the correct
behaviour with a stronger check: the campus admin's editor opens, shows Campus
East, and must not leak "HQ A".

## Recommended fix order

1. **V1_BLOCKER** — branch-scoped authorization resolves the actor's assigned
   branch (record 6). Unblocks 3 assertions across 3 suites and a real
   multi-branch user journey.
2. **V1_FIX** — onboarding-aware fixture in the admin-nav suite (record 5), to
   restore website navigation coverage rather than leave it silently dead.
3. **TEST_ISOLATION_BUG** — pin `PLATFORM_DEPLOYMENT_CODE` in the demo suite
   (record 8); cheap and removes a machine-dependent failure.
4. **V1_FIX** — re-point the auth label assertions at current copy (record 4),
   preserving the accessible-labelling guard.
5. **STALE_ASSERTION** — service-times sentinel (record 7) and the branch shell
   `Support` regex tightening (record 2).
6. **TEST_ISOLATION_BUG** — per-suite database isolation so combined runs are a
   usable regression gate (record 9).
7. **POST_V1** — platform-admin deployments literals (record 3).

## Change made in the triage pass

Only the trivial, mechanical, test-only correction: 45 pinned CSS
cache-buster literals in `tests/blessboard-v5-a11y-structure.test.js` became
`\?v=\d+`, clearing 34 failures and removing a trap that broke 34 tests on every
stylesheet bump. No product code, migration, view, or route was touched.

## Changes made in the fix pass (Overnight 5)

Product code:

- `src/blessboard/http/resolveAssignedBranchContext.js` (new) — shared resolver
  for the assigned-branch authorization context.
- `src/blessboard/http/contentAdminRoutes.js` — branch website shell gate.
- `src/blessboard/http/websiteServiceTimesAdminRoutes.js` — branch surface gate.
- `src/blessboard/http/branchAdminShellLocals.js` — navigation permission flags
  and branch display name.

Tests (no test deleted, no expectation weakened):

- `tests/blessboard-website-mode-admin-nav.test.js` — complete onboarding in the
  fixture so the navigation assertions are reachable.
- `tests/blessboard-v5-a11y-structure.test.js` — assert `<label for=...>`
  bindings instead of marketing copy; scope the `Support` guard to a rendered
  nav label.
- `tests/blessboard-branch-service-times.test.js` — accept the `missing`
  sentinel for "nothing configured".
- `tests/blessboard-website-scope.test.js` — test 7 now asserts correct
  assigned-branch scoping instead of the old denial.
- `tests/blessboard-demo-v5-dataset.test.js` — drop the ambient
  `PLATFORM_DEPLOYMENT_CODE` from the spawned CLI's environment.

Verified with the 128-suite combined website/CMS run against a baseline worktree
at the parent commit: **0 new failures, 9 assertions newly passing**
(997 pass/53 fail → 1003 pass/47 fail).

## Reproducing

```
# True isolated baseline; the env var must be unset or the demo suite fails
# for reasons unrelated to the product.
env -u PLATFORM_DEPLOYMENT_CODE node --test \
  tests/blessboard-v5-a11y-structure.test.js \
  tests/blessboard-website-mode-admin-nav.test.js \
  tests/blessboard-demo-v5-dataset.test.js \
  tests/blessboard-branch-mini-website-pages.test.js \
  tests/blessboard-branch-service-times.test.js
```
