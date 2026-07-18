# BlessBoard V5 — Authoritative routing prerequisites

**Date:** 2026-07-19
**Assessed mode:** `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` (analysis only)
**Constraint:** Do **not** enable authoritative routing. Do **not** deploy. Do **not** change application code or data.
**This document does not authorize a mode flip.**

**Companions**

- [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) — catalogue/code GO for shadow
- [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) — how to enable shadow (not executed by this analysis)
- [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) — demo data gaps
- [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) — post-authoritative smoke plan
- [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) — Steps 12–15, rollback §5, monitoring
- Routing tests: `tests/blessboard-tenant-routing.test.js` (+ mode tests)

**Demo pilot target (when later approved):** `diagnostic.blessboard.org` / `diagnostic-church` / `hq` / `blessboard-org-v5`

---

## Verdict

# NOT READY

Authoritative routing must remain **blocked**. Catalogue shape and automated routing tests are not enough. Required live shadow evidence, demo personas/content, and supervised smoke evidence are incomplete; production V4→V5 migration gates remain open for any estate-wide cutover.

| Scope | Status |
|-------|--------|
| Supervised authoritative **pilot** on `diagnostic-church` | **NOT READY** |
| Estate-wide / production authoritative cutover | **NOT READY** (pilot blockers + migration dependencies) |
| Did this analysis enable authoritative? | **No** |

---

## 1. Required successful shadow-mode evidence

Must be captured on **Hostinger V5** after executing [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) with mode **`shadow`** (not from local docs alone).

| Evidence | Pass criteria | Current status |
|----------|---------------|----------------|
| Mode actually `shadow` on all workers | Env + restart complete | **MISSING** — runbook exists; flip not performed in this program of work |
| Apex healthy under shadow | `/healthz` **200** V5; `/` + `/login` **200** | **UNVERIFIED** on live post-shadow |
| Demo Host still foundation HTML | `Host: diagnostic.blessboard.org` `/` **200** foundation; **no** tenant CMS chrome | **UNVERIFIED** post-shadow |
| Shadow log line | `blessboard_tenant_route_shadow` with keys below | **MISSING** live capture |
| Deployment comparison | `deploymentComparisonResult=match` | **MISSING** live capture |
| Unknown host | Foundation **200**; typed miss in logs | **MISSING** live capture |
| No secrets in shadow JSON | Pass | **MISSING** live capture |
| Shadow sign-off checklist | Runbook §7–§10 + §14 evidence pack filed | **MISSING** |

**Expected shadow log keys (demo):**

- `hostname=diagnostic.blessboard.org`
- `organizationKey=diagnostic-church`
- `churchKey=diagnostic-church`
- `primaryBranchKey=hq`
- `proposedReason=shadow_match`
- `proposedRouteOutcome=foundation`

Shadow readiness doc is **GO to enable**; that is **not** the same as successful shadow evidence.

---

## 2. Required demo tenant smoke-test evidence

After authoritative is later enabled under supervision, evidence must follow [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md). Prerequisites to **even start** that plan:

| Evidence / precondition | Pass criteria | Current status |
|-------------------------|---------------|----------------|
| Personas | Active PA, HQ, BA (`hq`), MEM + primary membership | **MISSING** ([demo readiness](../testing/V5_DEMO_TENANT_READINESS.md)) |
| Published Home / About | `public_pages` published (or explicit accepted-empty waiver) | **MISSING** |
| Operational samples | ≥1 safe row per module exercised | **MISSING** |
| Smoke execution | T06–T21, T27–T31 pass under authoritative (fixture-gated T22–T26 documented) | **NOT RUN** (blocked by mode + data) |
| Evidence pack | Screenshots, CSRF 403, wrong-role 403, cookie host-only, routing timestamp | **MISSING** |

Automated GUI regression readiness does **not** substitute for hosted authoritative smoke.

---

## 3. Domain-resolution checks

| Check | Pass criteria | Notes / status |
|-------|---------------|----------------|
| Canonical domain active | `diagnostic.blessboard.org` active, primary, canonical | Catalogue **READY** |
| Bound deployment | Domain → `blessboard-org-v5` | Catalogue **READY** |
| App deployment code | Hostinger `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` | Must match at flip time |
| DNS | Demo host reaches V5 app | Operator confirm |
| Authoritative render | Tenant Host `/` returns tenant public shell (church name / tenant markers; **no** UUIDs) | Requires mode=`authoritative` — **not enabled** |
| Automated coverage | Tenant-routing suite covers resolved host render | Tests exist; live Hostinger path unverified |

---

## 4. Organization / church / branch identity checks

| Check | Expected | Status |
|-------|----------|--------|
| Organization | `diagnostic-church` active / `testing` | **READY** |
| Enrolment | BlessBoard `active`, tenant key `diagnostic-church` | **READY** |
| Church | `diagnostic-church` active / `testing` | **READY** |
| HQ branch | `hq` / `branch_type=hq` / active | **READY** |
| Primary branch | `hq` `is_primary=true` | **READY** |
| Identity separation | DB identity `blessboard-platform-v5` ≠ deployment `blessboard-org-v5` | **READY** (documented + tests) |
| Public HTML | No org/church UUIDs required in pages | Enforce in smoke T29 |

---

## 5. Authentication-transfer checks

Required before calling a pilot “safe” under authoritative (smoke T08–T10, T14–T17):

| Check | Pass criteria | Status |
|-------|---------------|--------|
| Tenant `/login` | Redirects to Apex `/login?tr=…`; **no** tenant password form | **NOT PROVEN** on authoritative Hostinger |
| Transfer completion | Lands on `/member`, `/hq`, or `/branch-admin` per `next` | **NOT PROVEN** (no users) |
| Single-use transfer | Replay fails closed | **NOT PROVEN** live |
| Allowlisted `next` | No open redirect | Covered in automated/security intent; live smoke pending |
| Apex login | Controlled errors; no stack | Apex-only possible today; tenant transfer blocked by personas |

---

## 6. Session-cookie checks

| Check | Pass criteria | Status |
|-------|---------------|--------|
| Cookie name | Hostinger `SESSION_COOKIE_NAME` (e.g. `blessboard_org_v5_sid`) | Confirm at flip |
| Host-only | **No** `Domain=.blessboard.org` | Enforce in smoke T09 / security checklist |
| Store | `platform.deployment_sessions` — not `public.session` | Legacy table absent (**READY**) |
| No `GETPRO_DATABASE_URL` | Unset on V5 | Policy **READY**; Hostinger confirm at flip |
| Cross-host leak | Apex session must not grant other-tenant CMS via parent Domain | Blocker if violated → immediate rollback |

---

## 7. Wrong-host rejection checks

Under **authoritative** (cutover Step 12 + smoke T23/T30):

| Check | Pass criteria | Status |
|-------|---------------|--------|
| Unknown host | Controlled **404/503** (not another tenant’s CMS; not stack) | Automated coverage exists; **live authoritative not run** |
| Shadow vs authoritative | Shadow keeps unknown host as foundation **200**; authoritative must **not** silently show wrong CMS | Operators must not confuse modes |
| Cross-org Host | Staff of `diagnostic-church` must not see other org content | Needs second fixture or IDOR tests — smoke T23 |

---

## 8. Inactive / suspended tenant checks

| Check | Pass criteria | Status |
|-------|---------------|--------|
| Automated | Inactive domain/org/enrolment/church/HQ/primary fail closed (no tenant render) | Covered in `blessboard-tenant-routing` authoritative cases |
| Live disposable fixture | Controlled unavailable for inactive branch / suspended website | Smoke T24–T26 — **SKIP_FIXTURE** unless throwaway org approved |
| Shared demo safety | Do **not** inactivate `diagnostic-church` / primary `hq` without recovery plan | Policy |

Live negative proofs remain optional for a minimal pilot **only if** automated suite is green **and** waiver is written; preferred is a disposable fixture.

---

## 9. Rollback conditions

From [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) §5 and smoke rollback checklist. Authoritative enable starts the rollback clock.

**Immediate rollback triggers**

1. Apex `/` or `/login` **5xx** / auth broken
2. Wrong tenant CMS on a hostname / cross-tenant data
3. Parent-domain session cookie
4. Secret leakage in HTML/logs
5. Private media publicly readable
6. Sustained routing anomalies / mass 5xx
7. Transfer auth systematically failing

**Immediate action**

```bash
# Hostinger V5 + restart ALL workers
BLESSBOARD_TENANT_ROUTING_MODE=off
BLESSBOARD_JOBS_ENABLED=0
```

Then re-check apex `/healthz` + `/login`. DNS revert only if apex itself is broken. Preserve V5 DB; do not recreate `public.tenants` / `public.session`; keep `GETPRO_DATABASE_URL` unset.

**Rollback window (estate cutover):** default **≤ 4 hours** after authoritative enable. Pilot may use a shorter supervised window but must still pre-agree owners.

---

## 10. Monitoring period

After any future supervised authoritative enable ([cutover Step 14](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md)):

| Item | Requirement |
|------|-------------|
| Minimum watch | **60–120 minutes** continuous (extend for larger estates) |
| Watch signals | Hostinger 5xx / error rate; `blessboard_tenant_route*` anomalies; auth transfer failures; Supabase CPU/connections; support inbox |
| Pilot minimum | Supervised operator present for the full window; rollback owner reachable |
| Exit | Written go/hold/rollback; only then consider broader traffic or write reopen |

No monitoring period has started — authoritative is not enabled.

---

## 11. Manual approval gate

All must be signed before any authoritative env change:

| Gate | Approver role | ☐ |
|------|---------------|---|
| Shadow evidence pack accepted | App operator + Cutover lead | ☐ |
| Demo readiness users/content READY (or written waiver for empty CMS-only pilot) | Product / Cutover lead | ☐ |
| Smoke plan owners assigned | QA / App operator | ☐ |
| Rollback owner named + reachable | Rollback owner | ☐ |
| Monitoring window scheduled | Cutover lead | ☐ |
| Explicit written “go for authoritative” | Cutover lead + App operator | ☐ |
| Separate authoritative runbook/change ticket | Ops | ☐ |

[`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) §15 already forbids authorizing authoritative from the shadow runbook.

---

## 12. Production data migration dependency

| Dependency | When it applies | Status |
|------------|-----------------|--------|
| Local `migrate:v4-to-v5:rehearsal` PASS | Before production freeze/apply | Cutover preflight — **not certified here** |
| Hosted plan / dry-run / apply / verify | Before estate-wide authoritative | [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) Steps 4–7 — **not in scope of this analysis** |
| V4 freeze / dual-write avoidance | Production cutover | Open until cutover lead closes |
| Diagnostic-only pilot | May use already-provisioned `diagnostic-church` **without** V4 tenant migration **if** that org is V5-native | Catalogue exists; still blocked by §§1–2, 5–6, 11 |
| Dual system of record | Forbidden after authoritative estate cutover | Policy |

**Interpretation:** A V5-native diagnostic pilot does not wait on migrating every V4 church, but **production authoritative** for migrated tenants remains blocked until migration gates G1–G9 pass (cutover doc).

---

## 13. Reasons authoritative routing must remain blocked

1. **No live shadow evidence pack** — readiness GO ≠ executed shadow sign-off.
2. **No demo personas** — member / branch-admin / HQ-admin / platform-admin MISSING.
3. **No published Home/About** (and no operational samples) — cannot complete tenant CMS / portal smoke.
4. **Authoritative smoke not executable today** — plan ready; Hostinger mode + data are not.
5. **Transfer / cookie / wrong-host live proofs under authoritative** are incomplete.
6. **Manual approval gate** (§11) is unsigned.
7. **Production migration / cutover gates** remain open for estate-wide traffic.
8. Enabling now would expose tenant Hostnames to CMS/portals without supervised users, rollback rehearsal evidence, or monitoring window.

**Non-blockers for a future pilot (once above close):** GUI regression “demo-ready chrome”; automated tenant-routing/authorization tests; catalogue identity for `diagnostic-church`.

---

## Prerequisite rollup

| # | Area | Blocker? |
|---|------|----------|
| 1 | Successful shadow evidence | **YES** |
| 2 | Demo smoke prerequisites + evidence | **YES** |
| 3 | Domain resolution (catalogue) | No (READY) — live authoritative render still pending |
| 4 | Org/church/branch identity | No (READY) |
| 5 | Auth transfer live checks | **YES** (personas + mode) |
| 6 | Session cookie live checks | **YES** (prove at flip; policy ready) |
| 7 | Wrong-host rejection live | **YES** until authoritative supervised proof |
| 8 | Inactive/suspended | Soft — automate green; live fixture preferred |
| 9 | Rollback conditions understood | Doc READY — rehearsal recommended |
| 10 | Monitoring period | Not started — must schedule before flip |
| 11 | Manual approval | **YES** (unsigned) |
| 12 | Production migration | **YES** for estate cutover; conditional for V5-native pilot |
| 13 | Overall | **NOT READY** |

---

## Path to READY FOR SUPERVISED AUTHORITATIVE PILOT

Ordered; do not skip:

1. Execute [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md); file shadow evidence (§1).
2. Close demo readiness gaps: users/roles + Home/About (+ samples for modules to click).
3. Schedule monitoring window + name rollback owner (§10–§11).
4. Under supervision only: set `authoritative`, restart all workers, record timestamp (rollback clock).
5. Run [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) core journeys; prove transfer, cookies, wrong-host, CSRF, authz.
6. Hold for 60–120 minutes; then decide go/hold/rollback.
7. Estate-wide production: additionally complete V4→V5 cutover gates before expanding beyond the pilot hostname.

Until steps 1–3 are done, keep:

```bash
BLESSBOARD_TENANT_ROUTING_MODE=off
# or shadow — never authoritative
```

---

## Suggested commit message (docs only)

```
Document V5 authoritative routing prerequisites and NOT READY blockers.
```
