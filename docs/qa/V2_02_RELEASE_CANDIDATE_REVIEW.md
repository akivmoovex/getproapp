# V2.02 Release Candidate Review

**Task:** `V2_02_RELEASE_CANDIDATE_REVIEW`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Mode:** Read-only synthesis of V2.02 QA reports — **no promote**, **production DO NOT TOUCH**

**Candidate scope:** BlessBoard + ActiveClinic on V9 (product Version **2.02**), including shared platform RBAC consolidation completed on this branch.

---

## Verdict

### **`V2_02_RC_READY`**

V2.02 product functionality for BB + AC is **release-candidate ready** on V9 subject to the packaging prerequisites in §6. Shared RBAC is **converged** locally; About / Release Notes show **2.02**; editor P1 fixes inherited from the V8 tip remain green in local regression; security regression is green after P0 auth fixes.

**This is not a production go.** Do **not** promote. Hosted V9 smoke and commit of the uncommitted V2.02 tree remain required before any non-prod deploy or production cutover discussion.

---

## Confirmation checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| About = 2.02 | **YES** | `VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.02` · `V2_02_VERSION_RELEASE_NOTES_QA` |
| Release Notes = 2.02 | **YES** | Catalog version `2.02` for BB + AC · same QA |
| Shared platform RBAC | **YES** | `V2_02_PLATFORM_RBAC_FOUNDATION_PASS` · Final regression **CONVERGED** |
| BB catalogue-only RBAC | **YES** | `V2_02_BB_CATALOGUE_ONLY_RBAC_PASS` |
| AC RBAC alignment | **YES** | `V2_02_AC_RBAC_ALIGNMENT_PASS` |
| `patient.create` policy | **YES** | Owner families + migration `115` · AC alignment QA |
| Platform admin migration | **YES** | `V2_02_PLATFORM_ADMIN_RBAC_PASS` (catalogue `platform_administrator` only) |
| Zero runtime legacy-role **auth** dependencies | **YES** | `V2_02_LEGACY_RBAC_REMOVED` · static auth-surface guard |
| Editor P1 fixes retained | **YES** | Inherited V8 tip (`RC-MEDIA-PLACE`, `BB-THEME-503` cleared on testing 34/0/0) · local themes/media/editor/publish rerun PASS |
| Security regression green | **YES** | Final regression: cross-org/product, forged IDs, publish deny, self-elevation, revoke/expire — **PASS**; P0 auth bugs fixed in-pass |

### Exact refs

| Ref | Value |
| --- | --- |
| Committed `V9` HEAD | `b186991d7db5334bfaa235f8a0ecf37428ea4a5a` |
| Working-tree fingerprint (RC evidence) | `33a5353988884e7e7ecd6d1564ab2dd0b00fdc4e` |
| Production (untouched) | `moovex-platform-production` · prior RC lineage (`03a89106e2fe` class) — **not** this candidate |

> **Important:** Converged RBAC lives in **HEAD + uncommitted V2.02 work**. Bare HEAD alone is **not** the RC runtime. See §6.

---

## QA wave rollup

| Task | Verdict |
| --- | --- |
| `V9_BRANCH_BOOTSTRAP` | **PASS** |
| `V2_02_VERSION_AND_RELEASE_NOTES` | **PASS** |
| `V2_02_SHARED_RBAC_CONSOLIDATION_AUDIT` | **READY_TO_IMPLEMENT** (plan) |
| `V2_02_PLATFORM_RBAC_FOUNDATION` | **PASS** |
| `V2_02_BB_LEGACY_ROLE_REMOVAL` (catalogue-only) | **PASS** |
| `V2_02_PLATFORM_ADMIN_RBAC_CONVERGENCE` | **PASS** |
| `V2_02_AC_RBAC_ALIGNMENT` | **PASS** |
| `V2_02_LEGACY_RBAC_REMOVAL` | **REMOVED** (auth) |
| `V2_02_SHARED_RBAC_FINAL_REGRESSION` | **CONVERGED** |

Sources: `docs/qa/V2_02_*.md`, `docs/qa/V9_BRANCH_BOOTSTRAP.md`.

---

## 1. Completed V2.02 functionality

### Product / version surface

- About pages BB + AC: **Version 2.02** (build SHA separate).
- Shared Release Notes Center: **2.02** entries for BB + AC (verified V8-inherited editor claims).
- SafeDraft reminder badge / hub copy aligned to 2.02 line.

### Shared editor line (retained from V8 → V9)

- Shared editor parity (SP-T1–T7, U1-A–D), SP-VIS.
- Universal Image Editor / Adjust Picture; **RC-MEDIA-PLACE** fixed on testing tip and retained.
- Theme gallery + alternate theme switching; **BB-THEME-503** fixed on testing tip and retained.
- BB HQ/branch website scope cards; AC single-clinic website card.
- Publish authorization, shared security, AC booking **FIXED_PASS** (inherited claims; local rerun green).

### Shared RBAC foundation (V9 work)

- Platform-owned catalogue primitives (`src/platform/rbac/*`) over shared `blessboard.roles` / `permissions` / `role_permissions` (Phase F physical relocate deferred).
- BB login + authorize + invites: **catalogue `user_role_assignments` only**.
- Platform admin `/admin`: catalogue **`platform_administrator`** + `platform.*` only (legacy `platform_admin` fallthrough removed).
- AC: shared catalogue + `staff_role_assignments`; org/facility isolation; self-elevation deny.
- `activeclinic.patient.create` catalogue alignment (migration `115`).
- Legacy auth removal: empty compat stub; migration `116` freezes `user_roles` INSERT; auth surfaces **ZERO** legacy SQL gates.
- Final local matrix: core **112/112**; shared surfaces **61/61**; AC extra **29/29**.

### Security fixes closed during final regression

- `expires_at` (not `ends_at`) on URA reads (website scope 503 / PA miss).
- Platform-scope assignments visible across orgs in effective-permission lookup.
- Dual-role fixture pattern corrected (editor must not also hold HQ catalogue admin).

---

## 2. Remaining P0 / P1 blockers

### Against this V9 / V2.02 candidate (product)

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| Open allow-when-deny auth regressions | P0 | **None known** | Final regression green after fixes |
| RC-MEDIA-PLACE / BB-THEME-503 (product) | P1 | **Cleared on tip** | Retained; local themes/media PASS. **Production** still on older tip until promote |
| Branch chrome `301` vs `200` | P2 test | Open | Not permission elevation; URL redirect expectation |

### Parallel / production-line (not introduced by V2.02; still block **production** promote)

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| **HOST-PKG-A** | P0 ops | Open | Hostinger www/worker mapping — ops, not product RBAC |
| **Prod RC tip lag** | P1 ops | Open | Production still lacks placement/theme fixes until cutover |
| **BACKUP-PROD-VERIFY** | P0/P1 ops | Unknown | Restore evidence |
| **V8-001** email delivery | P1 ops | Open | Initiation ≠ delivery |
| **V2-MEDIA-01** redesign | P1 design | Open / gated | Not a smoke failure |
| **VQ-FIX-*** | P1 fixture | Open | Visual re-score only |

**None of the parallel ops/design items invalidate `V2_02_RC_READY` for the V9 candidate,** but they remain production cutover blockers (see §6).

---

## 3. Deferred P2 / P3 features

| Item | Why deferred |
| --- | --- |
| Phase F: physical `platform.roles` / `platform.permissions` tables | Explicit non-goal; catalogue stays on `blessboard.*` until soak |
| Drop `blessboard.user_roles` table | Display/directory dual-read soak; INSERT frozen only |
| Display / directory / access-health cutover off `user_roles` | MIGRATE soak backlog (non-auth) |
| HQ role-admin UI catalogue labels | Still shows legacy assignable names |
| BB-WEBSITES-503 class / chrome redirect follow | P2 UX/test |
| Extra theme packs beyond current alternate CSS packs | Explicit non-claim |
| AC facility websites | Explicit non-claim |
| Merging BB + AC into one assignment table | Architecture non-goal |
| Naked `platform.identities` as clinic employment principal | Non-goal |

---

## 4. Owner decisions (recorded)

| Decision | Outcome | Where |
| --- | --- | --- |
| V9 branch | Exact copy of V8 tip; continue V2.02 work here | `V9_BRANCH_BOOTSTRAP` |
| Production during V2.02 sequence | **DO NOT TOUCH** | All V2.02 QA |
| Shared RBAC consolidate on V9 | Implement waves B–E; Phase F later | Consolidation plan + foundation QA |
| `patient.create` families | Reception + clinical records + clinic manager + **org/network admin**; not nurse/clinician create; not facility admin / finance / website / bare staff | Owner update → `V2_02_AC_RBAC_ALIGNMENT` (supersedes earlier “no org_admin” audit note) |
| Platform admin | Catalogue `platform_administrator` only; no legacy fallthrough | PA convergence QA |
| Legacy `user_roles` | Freeze INSERT; remove from **authorization**; retain table for soak | Legacy removal QA |
| Promote now | **No** | This review |

---

## 5. Infrastructure items explicitly skipped

| Item | Status |
| --- | --- |
| Production deploy / migrate / seed | **SKIPPED** (forbidden) |
| Hosted V9 / Hostinger testing deploy for V2.02 RBAC | **SKIPPED** (local regression only) |
| HOST-PKG-A remapping / hPanel www unbind | **SKIPPED** (ops track) |
| Backup restore drill | **SKIPPED** |
| Physical catalogue relocate migrations (`platform.roles`…) | **SKIPPED** (Phase F) |
| Dropping `user_roles` | **SKIPPED** |

---

## 6. Production prerequisites

Before any **non-prod hosted** claim of V2.02 RBAC, and before any **production** promote discussion:

1. **Commit** the uncommitted V2.02 RBAC + regression tree on `V9` (fingerprint `33a53539…` class). Do not ship bare `b186991d` as “RBAC converged.”
2. **Update Release Notes 2.02 architecture section** — catalog still says shared RBAC consolidation is “under development / NOT claimed complete”; after this RC that wording is stale and must state **catalogue-only / converged** (with soak caveats) before customer-facing promote.
3. Apply migrations **`114`**, **`115`**, **`116`** on the target non-prod DB; seed/backfill operators to catalogue `platform_administrator` / BB URA / AC grants as needed.
4. **Hosted smoke** on testing: PA, BB personas (incl. website editor publish deny), AC `patient.create` matrix, publish/media/themes/booking, cross-org/product deny.
5. Confirm disposable QA accounts use **catalogue-only** assignments (no dual HQ+editor elevation pattern).
6. Separate go/no-go on **HOST-PKG-A**, **BACKUP-PROD-VERIFY**, **V8-001**, and production tip cutover for placement/themes (inherited P1 ops).
7. Explicit owner **promote** decision — this review does **not** authorize it.

---

## Release-notes honesty note

`V2_02_VERSION_RELEASE_NOTES_QA` correctly refused to claim RBAC complete **at that time**. Final regression later recorded **`V2_02_SHARED_RBAC_CONVERGED`**. Until the architecture section is revised (§6.2), do not treat public 2.02 notes as the RBAC completion certificate.

---

## Return token

```
V2_02_RC_READY
branch=V9
about=2.02
release_notes=2.02
shared_rbac=CONVERGED
bb_catalogue_only=PASS
ac_rbac_alignment=PASS
patient_create=owner_policy_enforced
platform_admin=catalogue_only
legacy_auth_runtime=ZERO
editor_p1_retained=YES
security_regression=GREEN
promote=NO
prod_untouched=YES
head=b186991d7db5334bfaa235f8a0ecf37428ea4a5a
working_tree=33a5353988884e7e7ecd6d1564ab2dd0b00fdc4e
```
