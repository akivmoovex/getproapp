# Foundation / Growth — final implementation handover

**Prepared:** 2026-07-19 07:56 Asia/Jerusalem (IDT)  
**Branch:** `V5` (tracks `origin/V5`)  
**HEAD (committed):** `de660d3` — *New screens implementation* (2026-07-19 06:57 +0300)  
**Working tree:** **dirty** — Foundation/Growth retained hardening, commercial matrix, Stitch audit, and deferred gate-stop docs are **uncommitted** (see §15)  
**Mode:** Non-destructive regression + documentation only  
**Constraint:** No deploy · no hosted data writes · **no further implementation after this handover**

**Companions:**  
[`FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md) ·  
[`GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md) ·  
[`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) ·  
[`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](../product/COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md) ·  
[`FOUNDATION_GROWTH_FINAL_STITCH_AUDIT.md`](../gui/FOUNDATION_GROWTH_FINAL_STITCH_AUDIT.md) ·  
[`FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md`](../product/FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md)

---

## Executive status

| Package | Local product | Hosted demo | Cutover |
|---------|---------------|-------------|---------|
| **Foundation** | **READY WITH MANUAL CHECK** | Needs B02–B04 | **BLOCKED** (B01, B05–B10, B12) |
| **Growth** (implemented scope) | **READY WITH MANUAL CHECK** | Needs B02–B04 | Same |
| Catalogue aspirational Growth | **DEFERRED** — do not sell as live | — | — |
| Network | **NOT_IN_SCOPE** for this program | Separate workstream | — |

**Local automated gate:** `npm run test:blessboard:v5:regression` → **PASSED** (22/22 suites, **603** tests, **0** fail, **0** skipped) in **90.6s**.

---

## 1. Features implemented (retained Foundation / Growth)

### Foundation (USD 0 · plan_key `free`)

- Apex marketing: home, features, for-churches, directory, pricing (+ FAQ), register-church (enquiry)
- Apex / tenant auth: login, transfer, sessions, CSRF (no forgot-password)
- Tenant public CMS pages (home, about, leadership, ministries, events, sermons, giving info, contact)
- Member registration + branch verification queue; registration submitted state
- Member portal: dashboard, profile, announcements, events, ministries, resources, forms, requests, giving info
- Branch admin: dashboard, registrations, members, CMS (pages/sections/entities/media), announcements, attendance, giving aggregates, forms, resources, requests, account, settings
- HQ: dashboard, branch registry (max 1 active branch including HQ), members, registrations, content, announcements, participation, attendance/giving manage, forms, resources, requests, settings, account, audit
- HQ reports hub (`basic_reports`) — live aggregates only
- HQ **Staff permissions** `/hq/roles` — assign/revoke fixed `church_hq_admin` / `branch_admin` only
- `max_branches = 1` enforced on create / activate / provision insert / Foundation downgrade
- Soft `max_staff_accounts` (10) on role assign; soft `max_users` (250) on seat paths
- Foundation denial of Growth advanced report detail (honest empty-state; no aggregate leak)
- Commercial public matrix scrubbed to implemented claims only

### Growth (USD 14.99 / active branch · plan_key `growth`)

- All Foundation-retained surfaces
- Unlimited active branches (`max_branches` null)
- Cross-branch HQ oversight (`/hq/*`, `/b/:branchKey`, church-scoped lists)
- `advanced_reports`: HQ attendance + giving **detail** reports
- Soft unlimited staff seats on role assign
- Hub cards link to advanced detail when entitled; Foundation shows non-link / Growth-required chrome

### Visual / honesty (this program)

- Stitch wiring for retained screens (MATCHED not claimed)
- Features page layout fix (`bb-apex-features-page`, `apex.css?v=8`)
- Navigation honesty (Permissions in HQ nav; no pretend deferred modules)

---

## 2. Features deferred

| Item | Notes |
|------|-------|
| Waiting-verification member session | `/register/submitted` is honest end state |
| Forgot password | Product undecided; login omits link |
| Dedicated `/member/prayer-request` | Use Requests `category=prayer`; CTA disabled |
| Branch / HQ monthly report workflow | Nav disabled / no V5 port |
| Departments, duty roster | No schema/routes |
| Scheduled communications / scheduled reports | No V5 scheduler |
| Surveys, appointments, volunteer scheduling/opportunities | Catalogue only |
| Offline attendance | Catalogue only |
| Advanced pastoral-care workflows beyond requests | Decision: DEFER |
| Self-serve checkout / subscription collection | Pricing display only |
| HQ create-branch **GUI** | Create service/CLI exists; UI intentionally absent |
| Create-organization **GUI** | CLI/`provisionBlessBoardChurch` only |
| Stitch MATCHED pixel claim | Residual polish only |

Gate-stop batch docs live under `docs/gui/BATCH_FG_*.md` (deferred — **not** implemented).

---

## 3. Features removed from scope (this program)

| Item | Disposition |
|------|-------------|
| Network custom domain / hosted mailboxes / API / webhooks / managed services | **NOT_IN_SCOPE** (`custom_domain` / `custom_email` = false on Growth) |
| Leader portal / Leader role | **NOT_IN_SCOPE** (no V5 leader role) |
| Banking / QR / mobile-money giving settings UI | Intentionally **OMITTED** |
| Events calendar Stitch UI | Product = list model |
| Tenant password login UI | Apex transfer only |
| Payment gateway / donor checkout | Not in V5 |
| Fabricated analytics / forecasts / compliance scores | Forbidden |

---

## 4. Migrations created but not hosted

**No new BlessBoard SQL migrations were introduced solely for this Foundation/Growth retained-feature wave.** HQ roles reuse `blessboard.user_roles`; branch capacity uses existing plan features / entitlement services.

| Asset | Repo status | Hosted status |
|-------|-------------|---------------|
| `db/migrations/blessboard/001`–`025` (25 files) | Present in repo | Apply to hosted only via approved cutover — **not done in this prompt** |
| Platform / identity migrations (existing V5 foundation set) | Present | Hosted V4→V5 apply = release blocker **B06** |
| Plan-key rename (`free`→foundation display vs immutable keys) | Analysis only | **B12** — not approved |
| Media blob copy | Deferred strategy | **B08** |

This handover **did not** run hosted migrate apply, dry-run against production, or seed hosted rows.

---

## 5. Routes added (or newly wired in this wave)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/hq/roles` | Staff permissions UI |
| POST | `/hq/roles/assign` | Fixed roles only + CSRF |
| POST | `/hq/roles/:roleId/revoke` | CSRF + confirm |
| GET | `/hq/reports/giving` | Soft `advanced_reports` gate (mirrored attendance) |
| GET | `/hq/reports/attendance` | Existing; Growth gate retained |

Apex marketing routes (`/features`, `/for-churches`, `/pricing`, `/directory`, `/register-church`) were completed earlier in the FG queue and remain live.

**Unchanged:** No new checkout, scheduler, or Network self-serve routes.

---

## 6. Entitlements added or reused

| Key / capacity | Foundation | Growth | Network | Notes |
|----------------|:----------:|:------:|:-------:|-------|
| `max_branches` | **1** (hard on write paths) | Unlimited | Unlimited | Reused; enforcement hardened |
| `max_users` | 250 soft | Unlimited | Unlimited | Soft on register path |
| `max_staff_accounts` | 10 soft | Unlimited | Unlimited | Soft on HQ/CLI assign |
| `basic_reports` | Yes | Yes | Yes | HQ hub |
| `advanced_reports` | No | **Yes** | Yes | Attendance + giving detail |
| `custom_domain` / `custom_email` | No | No | Yes | Network-only |
| Catalogue aspirational flags (scheduling, surveys, …) | Declared | Declared | Declared | **Not** sold as live; no V5 routes |

Persisted plan keys remain `free` / `growth` / `professional` (display Foundation / Growth / Network).

---

## 7. Tests and totals

### Primary gate (this handover)

| Command | Suites | Result | Duration |
|---------|-------:|--------|----------|
| `npm run test:blessboard:v5:regression` | **22** | **PASSED** | **90.6s** |

**TAP aggregate across regression child runs:** **603** tests · **603** pass · **0** fail · **0** skipped.

### Suites included (all passed)

1. Static pre-commit (fixtures, design system, apex-auth GUI, a11y, responsive, frontend assets, server-query, route-link, CSRF action, I/O safety, tenant-routing-mode)  
2. Admin shells (branch / HQ / platform)  
3. Apex (auth GUI, home, marketing)  
4. Auth schema  
5. Auth HTTP  
6. Tenant host auth  
7. Platform V5 sessions  
8. Authorization matrix  
9. Member suite  
10. Admin modules (attendance, giving, forms-requests, reports-audit, content-admin)  
11. Media  
12. Tenant public pages  
13. Public content schema  
14. Settings  
15. Branch list  
16. Tenant routing (mode + evaluate)  
17. Catalogue schema + lookup  
18. Catalogue HTTP context  
19. Church provisioning  
20. Platform entitlements  
21. Migration mapping (unit)  
22. Migration tooling (local fixtures only)

### Supplemental (outside regression runner; also green)

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-hq-roles.test.js` | **10/10** |
| `npm run test:platform:entitlements` | **13/13** (also inside regression) |
| Pricing + commercial catalogue + public FAQ | **32/32** |

---

## 8. Failed / skipped tests

| Category | Count |
|----------|------:|
| Failed | **0** |
| Skipped | **0** |
| Cancelled | **0** |

Regression is fail-fast; all 22 suites completed.

---

## 9. Foundation readiness

| Verdict | **READY WITH MANUAL CHECK** |
|---------|------------------------------|
| Local automated product | **READY** |
| Hosted public demo | Manual: personas + CMS (B02–B04) |
| Authoritative routing / production cutover | **BLOCKED** |

Sell as: USD 0 · max 1 active branch (including HQ) · basic reports · no Growth advanced detail.  
Do **not** claim waiting-verification, monthly BA reports, departments, or dedicated prayer route.

Detail: [`FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md).

---

## 10. Growth readiness

| Verdict | **READY WITH MANUAL CHECK** (implemented scope) |
|---------|--------------------------------------------------|
| Multi-branch + cross-branch HQ + `advanced_reports` | **READY** (local) |
| Catalogue scheduling / surveys / volunteers / offline | **DEFERRED** — do not demo as live |
| Network domain/email/API as Growth | **NOT_IN_SCOPE** |

Sell as: USD 14.99 / active branch · unlimited branches · advanced attendance & giving reports · Foundation retained.  
Do **not** sell scheduled workflows or Network features as Growth.

Detail: [`GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md).

---

## 11. Remaining Network work

Out of Foundation/Growth program. Typical remaining when Network is scheduled:

- Assisted custom organization domain (not self-service DNS today)
- Hosted mailboxes (capacity per catalogue)
- API / webhooks / integrations **by arrangement**
- Advanced roles assisted / by arrangement
- Executive exports by arrangement
- Priority support / assisted onboarding
- Ensure Growth cannot assert Network flags
- Separate Network readiness audit + commercial honesty pass

Platform admin domains/settings UI exists as ops chrome; Network package activation remains assisted.

---

## 12. Required hosted migration steps

**Do not execute without signed cutover approval.** Order of concern:

1. Confirm hosted identity (`blessboard-platform-v5`) and forbidden legacy tables absent (`public.tenants`, `public.session`).  
2. Capture shadow-routing evidence pack (**B01**) before any authoritative flip.  
3. Hosted V4→V5 migration dry-run → apply → reconcile (**B06**); close mapping decisions/waivers (**B07**).  
4. Decide media blob strategy or waive (**B08**).  
5. Plan-key migration only if Product approves insert/repoint (**B12**) — never in-place rename of immutable keys.  
6. Signed go/no-go for authoritative (**B09**) then supervised mode enable + smoke (**B05**).  
7. Production cutover checklist (**B10** + cutover docs) — not part of this handover execution.

References: [`V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md).

---

## 13. Required demo-data steps

Target (per demo readiness): `diagnostic-church` / `diagnostic.blessboard.org` — catalogue shape OK; **users/roles/CMS/samples missing**.

1. Provision platform admin, HQ admin, branch admin, and active member + membership via **approved** scripts/UI — **never** `church:seed-demos` (legacy).  
2. Publish Home + About (`public_pages`) for the demo church (**B03**).  
3. Add safe operational samples: announcements, events, ministries, sermons, resources, forms, requests, giving methods, attendance (**B04**).  
4. For Growth demo: assign `growth` plan and ensure ≥2 active branches via approved create/CLI (no invent UI).  
5. Run hosted smoke only after B02–B04 (+ routing gates as required).

Reference: [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md).

---

## 14. Exact next five supervised actions

1. **Commit or explicitly stash** the dirty Foundation/Growth working tree on `V5` (or split PRs) so HEAD matches demo/regression reality — currently **~88** dirty paths uncommitted.  
2. **Provision hosted demo personas** (PA / HQ / BA / member) on `diagnostic-church` using approved scripts only (**B02**).  
3. **Publish Home + About** and minimal module samples on the demo tenant (**B03–B04**).  
4. **Execute shadow-routing evidence pack** per runbook and file results (**B01**) — still no authoritative flip.  
5. **Product go/no-go meeting:** either schedule Network readiness **or** approve plan-key migration analysis (**B12**) / create-org GUI unlock — do **not** start deferred catalogue features without elevation.

---

## 15. Git status and latest commits

### Branch

```
* V5  de660d3 [origin/V5] New screens implementation
```

Local `V5` matches `origin/V5` at HEAD; **ahead by 0 commits**. Working tree has **uncommitted** Foundation/Growth work.

### Latest commits (oneline)

```
de660d3 New screens implementation
e778961 New screens implementation
a1503ab New screens implementation
9efb92d New screens implementation
7ee6e5f New screens implementation
083424e New screens implementation
8286ad1 New screens implementation
5e6b9ff New screens implementation
d29d6a7 New screens implementation
60bfc05 New screens implementation
1946012 New screens implementation
70b3ed9 New screens implementation
```

### Working tree (snapshot at handover)

| Kind | Count (approx.) |
|------|----------------:|
| Modified (`M`) | 45 |
| Untracked (`??`) | 43 |
| **Total dirty paths** | **~88** |

Notable untracked deliverables from this program:

- `docs/handover/FOUNDATION_GROWTH_FINAL_IMPLEMENTATION_HANDOVER.md` (this file)
- `docs/release/FOUNDATION_FINAL_READINESS.md` · `GROWTH_FINAL_READINESS.md`
- `docs/gui/FOUNDATION_GROWTH_FINAL_STITCH_AUDIT.md` · nav/a11y/queue audits · `BATCH_FG_*` gate-stops
- `docs/product/COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md` · entitlement/max-branches audits
- `src/blessboard/http/hqRoleAdminRoutes.js` · `hqRoleManagementService.js` · `activateBlessBoardBranch.js`
- `views/blessboard/v5/hq/roles.ejs` · `tests/blessboard-hq-roles.test.js`

Notable modified areas: HQ reports gates, nav, entitlements, commercial FAQ/pricing/SEO, apex Features CSS, Stitch map, readiness-adjacent coverage docs.

**This handover does not create a git commit** (commit only on explicit user request).

---

## Stop

Foundation/Growth implementation program **stops here**.  
No further feature work, deferred-screen builds, hosted migration apply, or routing flips from this prompt.
