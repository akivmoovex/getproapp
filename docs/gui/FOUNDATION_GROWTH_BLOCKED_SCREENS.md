# Foundation & Growth — backend-blocked screens

**Date:** 2026-07-19 (refresh)
**Companion:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md)
**Scope:** Screens and catalogue capabilities that **cannot** be completed as GUI-only batches.
**Constraint:** Documentation only.

Statuses covered here: **`MISSING_BACKEND`** primarily; **`DEFERRED`** catalogue claims that look like product features but have no V5 blessboard implementation.

---

## MISSING_BACKEND (exact dependency)

| # | Package | Screen / workflow | Stitch IDs (D / M) | Intended route | Missing dependency (exact) | Workaround today |
|---|---------|-------------------|--------------------|----------------|----------------------------|------------------|
| 1 | Foundation | Waiting verification (member pending) | `239beae5140e44aeb34ba7034260cd5b` / `8e6e504fcfa6452f9f3a719da33527fe` | undecided | **No V5 pending-member session model, route, or service** that can render a waiting state after registration without inventing auth | Registration submitted page only (`/register/submitted`) |
| 2 | Foundation | Dedicated prayer request | `57edf48979d04b6d8647474961b48acb` / `1dd180a3c5c5463988cb96dde2b44d37` | `/member/prayer-request` | **No dedicated route, controller, or prayer-specific table**; dashboard CTA intentionally disabled | `/member/requests/new` with supported `category=prayer` (product must accept link-or-hide before GUI batch FG-Q07) |
| 3 | Foundation | Departments directory | `7ee4d401f26d45b8ae18f26fe9b391ec` / `3794bd0c398b42cbb3987964807b27c3` | — | **No V5 departments schema, repository, or routes** | — |
| 4 | Foundation | Duty roster | `37bdc9ea66db4ca2b4375d37605bdbb2` / `51d3e5bfce8641f0837a1556d659b6b7` | — | **No V5 duty-roster schema, repository, or routes** | — |
| 5 | Foundation | Branch monthly reports (dashboard / submit / history / detail) | `d7bdddc0…` / `45a88626…` / `5b6ec354…` / `48955e5a…` (+ mobiles) | `/branch-admin/reports*` (not registered) | **V4 monthly-report workflow not ported**; **no V5 blessboard monthly-report tables/routes**; branch nav Reports disabled | HQ aggregate `/hq/reports*` only (not branch monthly submit/review) |
| 6 | Growth / Foundation | HQ monthly reports review (+ detail) | `4404007361f54173a1a9e37ab6285aa5` / `b53425f344804e4681eefb59f3d6cfdd`; detail `aa7cdf0f…` / `d03fc656…` | — | **Depends on #5** — no V5 monthly-report review service or HQ approve/reject workflow | — |
| 7 | Growth | HQ permission / role management | `12f5be535eeb49f1a1c5822ae7586504` / `de3e82ef3ad54065a516b042459fdc19` | — | **No V5 HQ role-management UI, assignment API, or role-matrix schema beyond fixed session roles** | Fixed `hq_admin` / `branch_admin` / `member` gates |
| 8 | Growth | HQ organization templates / standards | `df111bee19304663b356561a114c78bc` / `801584edfae5462c829f232ff5c99a4b` | — | **No V5 org-template / standards schema or HQ template applicator**; HQ content reuses website-editor 34 | `/hq/content` page/section CMS only |

### Capacity / entitlement wiring (not a Stitch screen, blocks package honesty)

| # | Package | Capability | Missing dependency (exact) | Notes |
|---|---------|------------|----------------------------|-------|
| 9 | Foundation | `max_branches = 1` hard enforcement on create | **`assertCanCreateBranch` exists in `entitlementService` but is not wired into all provision / branch-create CLIs and UI paths** | Soft capacity gap; not a GUI polish batch |

---

## DEFERRED (catalogue / product; no V5 backend)

These appear on Growth (or auth) marketing/catalogue language but **must not** be queued as Foundation/Growth GUI until schema + services exist.

| # | Package | Capability | Catalogue / Stitch signal | Missing dependency (exact) |
|---|---------|------------|---------------------------|----------------------------|
| D1 | Foundation | Forgot password | Stitch `61a6861b…` / `f4bb9457…` | **No V5 password-reset route, token store, or mailer product decision** (apex login intentionally omits link) |
| D2 | Growth | Scheduled broadcasts / communications | `broadcasts.scheduled` in `blessBoardPackageCatalogue`; Stitch broadcast chrome implies schedule | **No V5 announcement scheduler, job runner, or SMS channel** — publish-now only |
| D3 | Growth | Scheduled reports | `reports.scheduled` / `scheduled_monthly` in catalogue | **No V5 blessboard report scheduler or export job queue** |
| D4 | Growth | Offline attendance | `attendance.offline: true` on Growth catalogue | **No V5 offline attendance sync queue / client protocol** |
| D5 | Growth | Surveys | `surveys.custom` | **No V5 survey schema or routes** |
| D6 | Growth | Appointments calendar | `appointments.calendar` | **No V5 appointments schema or routes** |
| D7 | Growth | Volunteer scheduling | `volunteers.scheduling` | **No V5 volunteer-scheduling schema or routes** |
| D8 | Growth | Advanced pastoral care automation | `care.automation: advanced` | **Beyond request categories** — no care-workflow engine |

---

## Explicitly not blocked (do not confuse)

| Item | Why not listed here |
|------|---------------------|
| HQ advanced attendance report | **COMPLETE** after FG-08a — soft `advanced_reports` gate works |
| HQ advanced giving report | **PARTIAL** GUI (FG-Q12) — backend aggregates + soft entitlement exist |
| Media library | **MISSING_STITCH** — backend upload/archive works (Batch 22) |
| Create organization UI | **MISSING_GUI** — CLI backend exists; queued as FG-Q06 |
| Network custom domain / mailboxes / API | **NOT_IN_SCOPE** for Foundation/Growth |
| Leader portal | **NOT_IN_SCOPE** — no leader role |
| Banking / QR giving settings | **NOT_IN_SCOPE** — intentionally omitted |

---

## Unblock order (if product later funds backend)

1. Decide prayer CTA vs dedicated route (#2 / FG-Q07).
2. Wire `max_branches` into provision paths (#9).
3. Pending-member waiting session (#1) — only with auth product design.
4. Monthly reports schema + BA submit + HQ review (#5–#6) — large program.
5. Departments / duty roster (#3–#4) — new domains.
6. HQ roles / org templates (#7–#8).
7. DEFERRED catalogue items (D2–D8) — each is its own schema program.

Until then: **do not** invent GUI for rows in this file.
