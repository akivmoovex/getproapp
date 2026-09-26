# ActiveClinic V2.03 Batch 3 — Preparation Mode

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH3_PREPARATION_MODE` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Mode** | Documentation / analysis only — **no implementation** |
| **Frozen B1+B2 RC SHA** | `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` |
| **RC commit subject** | `V2.03 ActiveClinic Batch 2 pre-freeze regression and QA.` |
| **Companion analysis** | [`ACTIVECLINIC_BATCH3_PREIMPLEMENTATION_ANALYSIS.md`](./ACTIVECLINIC_BATCH3_PREIMPLEMENTATION_ANALYSIS.md) |
| **Stitch (Batch 3)** | `projects/3741389873539108242` (Clinical Interface Expansion) |
| **Verdict** | `V2_03_AC_BATCH3_PREPARATION_MODE_ACTIVE` — **wait for B1+B2 hosted QA/freeze complete before coding** |

---

## 1. Hard constraints (this mode)

Until Batch 1 + Batch 2 hosted QA / freeze completes and product authorizes Batch 3 implementation:

| Forbidden | Reason |
|-----------|--------|
| Application code changes | RC under hosted QA |
| Shared CSS (`ac-app.css`, `gp-ops-shared.css`, portal CSS packs) | Freeze visual foundation |
| Token edits (`ac-app-tokens.css`, staff `:root`) | Canonical ODS palette locked |
| Staff shell / navigation / bottom nav | B2 ownership |
| Routes / services / repositories | Preserve RC domain engines |
| Migrations / commits / pushes / deploys | Release process |

**Allowed now:** read-only analysis, documentation updates under `docs/`, Stitch inventory review, collision planning.

---

## 2. Frozen shared infrastructure (must reuse — never recreate)

Treat SHA `6fb754eb…` as the **source of truth** for shared chrome and platform helpers.

### 2.1 Authenticated staff visual foundation

| Asset | Path at RC | Batch 3 rule |
|-------|------------|--------------|
| Staff tokens | `public/activeclinic/ac-app-tokens.css` | **Only** staff brand file (`#2563EB` / `#1D4ED8` / `#EFF6FF`, neutrals `#111827` / `#6B7280` / `#E5E7EB`). Do not fork a Batch 3 palette. |
| Public/portal tokens | `public/activeclinic/ac-tokens.css` | Keep `--acp-*` for portal; do not overwrite with staff blues in portal chrome without product decision. |
| Ops primitives CSS | `public/platform/gp-ops-shared.css` | Consume; override via AC tokens only if already patterned. |
| Staff CSS monolith | `public/activeclinic/ac-app.css` | Prefer **leaf screen packs** + existing `.ac-ops-queue*`; no new dual desktop/mobile frameworks. |
| Staff shell | `views/activeclinic/layouts/app-shell.ejs` | Load order locked: `gp-ops-shared` → `ac-tokens` → **`ac-app-tokens`** → `ac-app`. |
| Shell VM | `buildActiveClinicShellViewModel.js` | RC asset stamp `SHELL_ASSET_VERSION = v2-03-b2-shared-reg-01` — do not thrash until B3 kickoff policy set. |
| Navigation | `activeClinicNavigation.js` + sidebar / bottom-nav partials | Reuse keys; **do not** invent parallel nav trees for ACN17–20 / ACN27. |

### 2.2 Platform / AC shared primitives

| Primitive | Path | Batch 3 use |
|-----------|------|-------------|
| `gp-ops-*` partials | `views/platform/partials/gp-ops-*.ejs` (incl. `status-tabs`) | Lists, filters, tables, badges, empty, pagination, timeline |
| `.ac-ops-queue` | Selectors in `ac-app.css` (pharmacy / diagnostics / billing / facilities packs) | Referral worklists, document lists, locations lists — **extend composition**, do not invent `__desktop/__mobile` clones |
| `listQuery` | `src/platform/http/listQuery.js` | Portal/staff list loaders |
| Money | `src/platform/money/formatMoney.js` | AC-P06 patient invoice/receipt display |
| Status history | `src/platform/history/` | Referral / document / booking trails |
| Data jobs | `src/platform/jobs/` | Only if ACN18 import/export-like jobs appear later — prefer existing adapters |
| RBAC / audit / validation / CSRF / session | `src/platform/*` + AC facades | Unchanged contracts |

### 2.3 Domain engines (consume, do not rewrite)

| Domain | RC owners (examples) | Batch 3 screens |
|--------|----------------------|-----------------|
| Clinical | `activeClinicClinicalRoutes.js`, `activeClinicClinicalService.js`, ACN14–16 follow-up | ACN17, ACN19, ACN20 (partial) |
| Pharmacy handoff | `clinical_orders` → `pharmacy_prescriptions` | ACN19 |
| Billing / cashier | billing + cashier services (ACN21–23 / B2-09) | AC-P06 projection only |
| Facilities | facility routes/services (AC-B2-10) | ACN27 |
| Patient portal | `activeClinicPatientPortalRoutes.js` + booking/profile services | AC-P03–07 |

---

## 3. Batch 1 / Batch 2 collision matrix (before recommending implementation)

Status legend: **BLOCK** = do not start until freeze clear + ownership agreed · **WAIT** = coordinate after hosted QA · **SAFE-LEAF** = leaf view likely OK once freeze lifts · **NEW** = greenfield after freeze.

| Batch 3 screen | Collides with B1/B2 surface | Shared files at risk | Collision severity | Prep recommendation |
|----------------|-----------------------------|----------------------|--------------------|----------------------|
| **ACN17** Vitals | ACN15 / AC-B2-06 encounter workspace | `vital-signs-entry-content.ejs`, clinical encounter links, `ac-app.css` clinical pack | **MEDIUM** | **SAFE-LEAF** after freeze — UI on existing `/vitals` route; do not change encounter shell |
| **ACN18** Clinical Documents | None existing; media CMS is **not** EHR | Would touch new routes + possibly platform media — **not** website CMS | **LOW** code conflict / **HIGH** product | **NEW** after freeze — plan schema + RBAC; no shell/token edits required for spike design |
| **ACN19** Prescription Editor | ACN15 order links; AC-B2-07 pharmacy queue contract | `create-prescription-content.ejs`, clinical order POST shape | **MEDIUM** | **SAFE-LEAF** — preserve `clinical_order.create` payload; no CDS |
| **ACN20** Referral Mgmt | ACN16 follow-up (`pending_referral`); ACN15 `referral_text` | follow-up views/service, consultation fields | **HIGH** | **WAIT** — decide follow-up extension vs new entity before any code; prefer `.ac-ops-queue` + existing follow-up |
| **AC-P03** My Appointments | Legacy P27 portal; **not** staff ACN06/B2-04 | `patient/bookings.ejs`, portal CSS (`ac-tokens` `--acp-*`) | **LOW** staff / **MEDIUM** portal | **SAFE-LEAF** on portal — do not merge staff appointment calendar |
| **AC-P04** Detail & Reschedule | Staff ACN08/B2-05 status vocabulary; guest `my-booking` | portal booking-detail + public reschedule | **MEDIUM** | **SAFE-LEAF** — keep request-based reschedule; no staff appointment rewrite |
| **AC-P05** Visit Summaries | ACN15 signed notes / privacy | Would add portal routes; clinical release rules | **HIGH** (privacy) | **NEW** — blocked on product release policy; no staff shell changes |
| **AC-P06** Invoices & Receipts | ACN21–23 / AC-B2-09 ledger | billing services (read projection only) | **HIGH** if staff EJS reused | **WAIT** — read-only portal projection after billing freeze; **never** mount staff billing EJS in portal |
| **AC-P07** Profile | ACN11 staff consent (separate) | `patient/profile.ejs`, phone locals | **LOW** | **SAFE-LEAF** — do not merge clinical consent ledger into portal |
| **ACN27** Locations | **AC-B2-10** Facilities & Departments | `facilities-*-content.ejs`, facilities workspace CSS, `.ac-ops-queue` facilities pack, nav `facilities` | **CRITICAL** | **BLOCK** until B2 hosted QA signs facilities pack; Batch 3 = Stitch rename/IA on **same routes**, not a second locations module |

### 3.1 Cross-cutting frozen assets (global BLOCK during QA)

| Asset | Why Batch 3 must not touch during hosted QA |
|-------|-----------------------------------------------|
| `ac-app-tokens.css` | Single staff brand; B1/B2 reconciliation complete |
| `app-shell.ejs` / sidebar / bottom nav | Canonical B2 chrome |
| `activeClinicNavigation.js` | Module visibility / RBAC gating under isolation tests |
| `gp-ops-shared.css` | Shared regression suite |
| `.ac-ops-queue` base selectors | Shared by pharmacy, diagnostics, billing, facilities |
| Billing / clinical / facility **engines** | 65/65 local RC regression pack |

### 3.2 Intentional non-collisions (do not invent)

- Portal teal (`--acp-*`) vs staff blue — **keep separate**.
- Staff `appointments` vs portal `public_booking_requests` — different sources until product unifies.
- Website CMS media ≠ clinical documents (ACN18).
- BlessBoard `bb-ds-*` / Sacred Modernity — never import into AC Batch 3.

---

## 4. Implementation readiness (advisory — not authorization)

| Tier | Screens | When freeze lifts |
|------|---------|-------------------|
| **A — UI leaf first** | ACN17, ACN19, AC-P03, AC-P07 | Reuse routes; Stitch parity on leaf EJS + portal CSS only; no shell/nav |
| **B — Coordinate with B2 owners** | ACN27, ACN20, AC-P04, AC-P06 | Facilities pack ownership; follow-up vs referral; billing read API |
| **C — Schema / privacy gated** | ACN18, AC-P05 | Migrations + RBAC + release policy after product answers |

**Do not recommend starting Tier B/C while hosted QA is in progress.**

---

## 5. Required reuse checklist (for future Batch 3 kickoff)

When implementation is authorized, every Batch 3 PR must affirm:

1. [ ] Based on (or rebased to) frozen B1+B2 RC lineage descended from `6fb754eb…` (or successor freeze SHA if QA amends).
2. [ ] No edits to `ac-app-tokens.css` unless product issues a token change ticket.
3. [ ] No staff shell / nav structure changes for visual parity alone.
4. [ ] List/queue screens prefer `gp-ops-*` + `.ac-ops-queue` over new chrome.
5. [ ] Loaders use `listQuery` / money / history helpers where applicable.
6. [ ] Domain logic changes are minimal and covered by existing + new focused tests (incl. RBAC isolation patterns from B2).
7. [ ] ACN27 does not fork `/app/facilities`.
8. [ ] AC-P06 does not fork staff billing views.
9. [ ] CDS / drug interaction / auto-prescribe remain blocked (`ACTIVECLINIC_PRODUCT_GAPS.md`).

---

## 6. Open product questions (unchanged blockers)

1. ACN20 = follow-up of `pending_referral` **or** first-class referral cases?
2. Portal appointments = bookings only **or** linked staff appointments too?
3. Who releases visit summaries to patients?
4. ACN18 storage = platform media adapter **or** dedicated clinical blob store?
5. ACN27 vs AC-B2-10 = locations-only Stitch **or** combined facilities+departments IA?

---

## 7. Related RC documentation

| Doc | Role |
|-----|------|
| `docs/qa/V2_03_BATCH2_ENGINEERING_FREEZE.md` | Local RC freeze record |
| `docs/qa/V2_03_BATCH1_BATCH2_SHARED_RECONCILIATION.md` | Token/shell ownership |
| `docs/qa/V2_03_BATCH1_BATCH2_PLATFORM_EFFICIENCY_AUDIT.md` | `ac-ops-queue` / gp-ops guidance for Batch 3 |
| `docs/qa/V2_03_BATCH2_PRONLINE_HOSTED_QA.md` | Hosted QA status (may lag SHA) |
| `docs/v2.03/PLATFORM_SHARED_FOUNDATION.md` | Platform jobs/history/list/timeline |

---

## 8. Status markers

```
BATCH_3_PREPARATION_MODE_ACTIVE
FROZEN_B1_B2_RC_SHA: 6fb754ebef4c1bc652f1868b68b90ac96fbd8711
IMPLEMENTATION_AUTHORIZED: NO
HOSTED_QA_GATE: PENDING
APPLICATION_CODE_MODIFIED: NO
```
