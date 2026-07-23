# PHASE2_006 — Screen-to-Code Map

**Date:** 2026-07-23  
**Mode:** Documentation only — no code changes  
**Classifications:** `REUSE` · `EXTEND` · `NEW_VIEW` · `UI_ONLY` · `BACKEND_BLOCKED`  
**Layout baseline:** `platform-admin-shell-start.ejs` / `platform-admin-shell-end.ejs`  
**CSS baseline:** `public/blessboard/v5/platform-admin.css` + design-system  
**Permission baseline:** `platform_admin` (see 007)

---

## Prompt 1

### Phase2 - 01 - Platform Admin Shell - Desktop

| Field | Value |
|-------|--------|
| **Stitch ID** | `3e2fc0e792b84e4197b995101d5b57bb` |
| **Route** | Shell for all `/admin/*` (esp. `/admin`) |
| **View** | Existing shell partials + `dashboard.ejs` |
| **Layout** | PA shell |
| **Partials** | `platform-admin-shell-*`, `powered-by-getpro`, `head-design-system` |
| **CSS/JS** | `platform-admin.css`, `shell-nav.js` |
| **Backend data** | Dashboard stats (existing) |
| **Actions** | Nav only for Phase2 focus |
| **Permission** | `platform_admin` |
| **Mobile** | Pair with mobile shell |
| **Classification** | **REUSE** (Batch 1 COMPLETE — Registration Applications already in `PLATFORM_ADMIN_NAV` after Organizations; active via `activeNav === "registration-applications"`) |
| **Batch 1 status** | **COMPLETE** (2026-07-23) — no duplicate nav item; shell fallback also includes the link |

### Phase2 - 01 - Platform Admin Shell - Mobile

| Field | Value |
|-------|--------|
| **Stitch ID** | `abd6ce56c5c349c2a6cc71e7e0847116` |
| **Route** | Same |
| **View** | Shell + mobile drawer (canonical mobile nav; bottom tabs remain disabled) |
| **Classification** | **REUSE** / **EXTEND** — drawer uses same `navItems`; `PLATFORM_ADMIN_MOBILE_TABS` includes `registration-applications` after Organizations |
| **Batch 1 status** | **COMPLETE** (2026-07-23) — Registration Applications visible in mobile drawer; active on list + detail |

---

## Prompt 2

### Phase2 - 02 - Registration Shared Components

| Field | Value |
|-------|--------|
| **Stitch ID** | `5c6a5d243d204ee580902fb1c3a93fdf` |
| **Route** | None (design board) |
| **View** | `views/blessboard/v5/partials/pa-registration-status-chip.ejs` |
| **Helper** | `src/blessboard/services/registrationStatusPresentation.js` |
| **CSS** | Existing `bb-pa-chip` / `--ok` / `--warn` / `--danger` / `--muted` |
| **Classification** | **REUSE** / **EXTEND** |
| **Batch 2 status** | **COMPLETE** (2026-07-23) — application, provisioning, verification, duplicate-risk presentation helpers + shared chip partial |

### Phase2 - 03 - Registration Status and Verification States

| Field | Value |
|-------|--------|
| **Stitch ID** | `1ef3bd4fa32d463aa2759bb43be0ea69` |
| **Route** | None (state board) |
| **Maps to** | Canonical stored application/provisioning labels; display-only verification + duplicate-risk vocabularies (not persisted) |
| **Backend** | No new persistence; operator presenter unchanged |
| **Classification** | **UI_ONLY** / **REUSE** |
| **Batch 2 status** | **COMPLETE** (2026-07-23) for shared status components only |
| **Batch 8 recommendation** | **COMPLETE** service (019) + detail loader (020) + read-only UI (021): `#reg-recommendation` advisory panel — approval gate unchanged |

---

## Prompt 3

### Phase2 - 04 - Registration Applications - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `edbec80688324e80aeae2c80a9c605a3` | `8c042d7eef2d4755884c81757ca7cdd9` |
| **Route** | `GET /admin/registration-applications` | same |
| **View** | Existing `registration-applications.ejs` | same (table + `bb-pa-orgs-cards`) |
| **Layout** | PA shell |
| **Partials** | pagination, empty-state, status chips |
| **Backend** | `listRegistrationApplicationsAdmin` |
| **Actions** | Existing filters; open/review only on queue |
| **Classification** | **EXTEND** |
| **Batch 3 status** | **COMPLETE** (2026-07-23) — queue view parity (Prompt 012) |

### Phase2 - 05 - Empty - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `4aa72e3fc2cc4e99bfd27bdc7a0b4ee7` | `1a9e631970da498094a336f19bd4ebcb` |
| **Route** | Same list | |
| **View** | Branch in list view + `empty-state.ejs` (true-empty vs no-results) |
| **Classification** | **EXTEND** / **UI_ONLY** |
| **Note** | Skip Stitch “Manual Invite”; no create-application CTA from Platform Admin |
| **Batch 3 status** | **COMPLETE** (2026-07-23) |

### Phase2 - 06 - Error - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `cf84867684754bcf92c6cb2c87187395` | `0ab863f5c111477486207b1b42a10a82` |
| **Route** | Same list (error render path) |
| **View** | `error-state.ejs` inside PA shell; Retry → canonical list |
| **Classification** | **EXTEND** |
| **Batch 3 status** | **COMPLETE** (2026-07-23) |

---

## Prompt 4

### Phase2 - 07 - Registration Review Overview - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `fed982f2ebfa40e591e96a06d3ccea28` | `cd3b3c07058b4df19b56edd7190b69e9` |
| **Route** | `GET /admin/registration-applications/:id` |
| **View** | `registration-application-detail.ejs` (overview header + anchor nav + review actions) |
| **Partials** | status chips; empty-state (documents); audit/contact lists |
| **Backend** | Existing `getRegistrationApplicationDetail` (unchanged) |
| **Actions** | Existing assign/contact/reject/approve/link/retry (behavior unchanged) |
| **Classification** | **EXTEND** |
| **Mobile** | Horizontal-scroll section nav; stacked cards |
| **Batch 4 status** | **COMPLETE** (2026-07-23, Prompt 014) |

---

## Prompt 5

### Phase2 - 08 - Registration Details - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `3d160b6e07734ddea7e626c98fa6540f` | `111f7c95ce154d499f18e6a6f2eee996` |
| **Route** | Same detail URL `#reg-details` / section anchors |
| **View** | Structured cards within detail (**EXTEND**) |
| **Backend data** | Existing fields only; schema-missing fields omitted |
| **Classification** | **EXTEND** (UI) + **BACKEND_BLOCKED** for Stitch-only fields until form/schema |
| **Batch 5 status** | **COMPLETE** (2026-07-23, Prompt 014) — available fields only |

### Phase2 - 09 - Registration Documents - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `cec44c09e05146059ba1dc1b9810067b` | `bd04a1df190d4d909b14a838731ddbec` |
| **Route** | Same detail `#reg-documents` |
| **View** | Honest empty-state section on detail |
| **Classification** | **BACKEND_BLOCKED** for real docs; **UI_ONLY** empty-state shipped |
| **Empty-state status** | **COMPLETE** (2026-07-23, Prompt 014) — no upload/preview/download |

---

## Prompt 6

### Phase2 - 10 - Registration Verification - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `8d5c641aa91642edb4c56971e3979a13` | `f12f1db130644e9a8be20362cfd6cdfa` |
| **Route** | Existing detail GET `#reg-verification` (dedicated verification route still deferred) |
| **View** | **EXTEND** `registration-application-detail.ejs` — read-only Verification section |
| **Backend** | **COMPLETE** read-only `registrationVerificationFacts.js` (Prompt 016); loaded on detail via `getRegistrationApplicationDetail` → `verification` (Prompt 017); structured phone evidence wired (Prompt 032) |
| **Actions** | Run again; override; continue — **not implemented** (omitted in UI) |
| **Classification** | Service + loader + read-only UI **COMPLETE** |
| **Batch 7 status** | **COMPLETE** for facts service (016), detail loader (017), and Verification UI (018) |
| **Phone evidence integration** | **COMPLETE** (Prompt 032) — `applicant_contacted_by_phone`, `applicant_identity_confirmed`, `applicant_authority_confirmed` from `phoneVerification.summary` (no support-contact fallback) |
| **Batch 8 recommendation** | **COMPLETE** service (019) + loader (020) + UI (021): `#reg-recommendation` on detail — approval gate unchanged |

### Phase2 - 11 - Approval Requirements Checklist - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `3f33fc25e51b459dabec4f68d14a50f3` | `454da5192ce54c0da779df62126ed697` |
| **Route** | Detail section **or** checklist on overview |
| **View** | **EXTEND** detail; reuse/generalize `network_validation_checklist` |
| **Backend** | **COMPLETE** derivation (022) + detail loader (023) + read-only UI (024): `#reg-approval-checklist` |
| **Actions** | Gate Approve; Reject; save note — **not implemented** (approval gate unchanged) |
| **Classification** | Service + loader + UI **COMPLETE** (022–024); approve gating still deferred |
| **Batch 9 status** | **COMPLETE** for checklist service (022), loader (023), and UI (024); see `PHASE2_022_APPROVAL_CHECKLIST_RULES.md` |

---

## Prompt 7

### Phase2 - 12 - Phone Verification - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `a87b0223c25b451ca596ecc95c096820` | `16f868dd262f4f6d94b03f9ecf561936` |
| **Route** | `GET …/:id/phone-verification` — **not implemented** |
| **View** | **NEW_VIEW** — **not implemented** |
| **Partials** | contact log list; call form — **not implemented** |
| **Backend storage** | **COMPLETE** (Prompt 026) — `blessboard.registration_phone_verification_attempts` + `createPhoneVerificationAttempt` / `listPhoneVerificationAttempts` |
| **Backend service** | **COMPLETE** (Prompt 027) — `registrationPhoneVerificationService` record / history / summary |
| **Detail loader** | **COMPLETE** (Prompt 028) — `phoneVerification = { attempts, summary }` on `getRegistrationApplicationDetail` (safe unavailable fallback) |
| **Read-only UI** | **COMPLETE** (Prompt 029) — `#reg-phone-verification` contact/status summary + call history on registration detail |
| **Record attempt POST** | **COMPLETE** (Prompt 030) — `POST …/phone-verification/attempts` → service insert; CSRF + platform_admin; redirect to `#reg-phone-verification` |
| **Record call attempt form** | **COMPLETE** (Prompt 031) — expandable “Record call attempt” form on registration detail → existing POST; CSRF; conservative defaults; allowlisted flash notices |
| **Verification facts wiring** | **COMPLETE** (Prompt 032) — contacted / identity / authority from `phoneVerification.summary`; uniqueness remains separate |
| **Backend UI wiring** | Detail form + facts wiring complete; dedicated phone workspace (Stitch 12) still deferred; CRM support contacts remain separate |
| **Actions** | Record attempt form + API ready; mark verified/failed discrete routes still deferred; CRM contact POST unchanged |
| **Classification** | Detail read-only UI + record-attempt POST + form + facts integration complete; dedicated Stitch workspace still open |

### Phase2 - 13 - Email Verification - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `ce16f55cab184ff6825ef682438afbbb` | `931394ae5b4848b7a96043b896d23ea2` |
| **Route** | `GET …/:id/email-verification` |
| **View** | **NEW_VIEW** |
| **Classification** | **BACKEND_BLOCKED** for resend/delivery history; **NEW_VIEW** shell + manual verify if columns added |

### Phase2 - 14 - Duplicate Church Matches - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `9a6e893e3118498a8616391ee1ad9239` | `a7207de205f949f69e3b2ded82f350da` |
| **Route** | `GET …/:id/duplicates` |
| **View** | **NEW_VIEW** |
| **Backend** | Derive matches from risk + repo finders |
| **Classification** | **NEW_VIEW** (matching logic **EXTEND**; persistence optional) |

### Phase2 - 15 - Duplicate Church Comparison - Desktop / Mobile

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Stitch ID** | `367f917d6afd4ba1828a7ba75cdbddfe` | `43cc53fd69ea4fa5a03f4a971a67ddad` |
| **Route** | `GET …/:id/duplicates/:matchId` |
| **View** | **NEW_VIEW** |
| **Actions** | Different / Link (**REUSE** `link-organization`) / Fraud (reject or note) |
| **Classification** | **NEW_VIEW** |

---

## Summary counts (Prompts 1–7)

| Classification | Approx. screens |
|----------------|----------------:|
| REUSE | Shell/list/detail cores |
| EXTEND | 01, 04–08, 11, chips/states |
| NEW_VIEW | 10, 12–15 (+ 09 later) |
| UI_ONLY | 02, 03, empty/error chrome |
| BACKEND_BLOCKED | 09 documents; 13 email delivery; parts of 12 verify & 08 extra fields |

---

## Runtime change confirmation

No code was modified for this map.
