# PHASE2_002 — Stitch Phase2 Screen Inventory

**Date:** 2026-07-23  
**Stitch project:** `projects/17124191473876947591` — GetPro Church Platform  
**Mode:** Inspect only — **no Stitch screens renamed or edited**  
**Scope:** Screens produced from **Stitch Prompts 1–7** (Phase2 screens **01–15**)

### Prompt → screen grouping (inferred from titles)

| Stitch Prompt | Screens |
|---------------|---------|
| 1 | 01 Platform Admin Shell |
| 2 | 02 Shared Components; 03 Status and Verification States |
| 3 | 04 Applications; 05 Empty; 06 Error |
| 4 | 07 Registration Review Overview |
| 5 | 08 Registration Details; 09 Registration Documents |
| 6 | 10 Registration Verification; 11 Approval Requirements Checklist |
| 7 | 12 Phone Verification; 13 Email Verification; 14 Duplicate Matches; 15 Duplicate Comparison |

### Excluded from this inventory

| Screen | Reason |
|--------|--------|
| Phase2 - 00 - Existing Admin Screen Audit | Pre-prompt audit board |
| Phase2 - 16…19 | Later prompts (rejection, communication, provisioning) |

Closest existing BlessBoard surfaces referenced below: V5 Platform Admin under `/admin/*`.

---

## Prompt 1 — Shell

### Phase2 - 01 - Platform Admin Shell - Desktop

| Field | Value |
|-------|--------|
| **Screen ID** | `3e2fc0e792b84e4197b995101d5b57bb` |
| **Device** | Desktop |
| **Purpose** | Canonical Platform Admin chrome: sidebar, top bar, dashboard content frame |
| **Main sections** | Left nav (Dashboard, Organizations, Registration Applications, Tenants, Plans, Support); header search/notifications/account; system overview metrics; recent activity; top organizations table |
| **Main actions** | Navigate sections; Export Report; New Organization; View Audit Log |
| **States** | Populated dashboard (no dedicated empty/error board on this screen) |
| **Responsive** | Desktop sidebar; pair with mobile variant |
| **Closest existing** | `platform-admin-shell-start.ejs` + `/admin` dashboard |

### Phase2 - 01 - Platform Admin Shell - Mobile

| Field | Value |
|-------|--------|
| **Screen ID** | `abd6ce56c5c349c2a6cc71e7e0847116` |
| **Device** | Mobile |
| **Purpose** | Mobile PA shell with bottom tabs and stacked overview |
| **Main sections** | Top app bar; overview cards; recent activity; bottom nav (Home, Orgs, Health, Registration Apps, More) |
| **Main actions** | New Tenant; Audit Logs; tab navigation |
| **States** | Populated |
| **Responsive** | Bottom tab bar; hamburger/more overflow |
| **Closest existing** | Same shell + `PLATFORM_ADMIN_MOBILE_TABS` (registration currently **not** a tab) |

---

## Prompt 2 — Shared components & states

### Phase2 - 02 - Registration Shared Components

| Field | Value |
|-------|--------|
| **Screen ID** | `5c6a5d243d204ee580902fb1c3a93fdf` |
| **Device** | Desktop (component board) |
| **Purpose** | Visual identity reference for chips, notes, applicant card patterns |
| **Main sections** | Application status chips; verification state chips; duplicate-risk chips; internal admin note; applicant details card; sample document row |
| **Main actions** | Edit details; View (document) — illustrative |
| **States** | Catalog of status/verification/duplicate visuals (not a product route) |
| **Responsive** | Reference board — apply tokens to desktop + mobile product screens |
| **Closest existing** | `bb-pa-chip*` in `platform-admin.css`; flash/empty/error partials |

### Phase2 - 03 - Registration Status and Verification States

| Field | Value |
|-------|--------|
| **Screen ID** | `1ef3bd4fa32d463aa2759bb43be0ea69` |
| **Device** | Desktop (state board) |
| **Purpose** | Lifecycle statuses, recommendation banners, verification checklist patterns, audit timeline sample |
| **Main sections** | Application statuses; decision intelligence (approve / manual review); verification checklists; state transition timeline |
| **Main actions** | Execute Approval; Defer Decision; Request Clarification; Compare Records |
| **States** | Pending, In Processing, Approved, Rejected; recommendation warn/success |
| **Responsive** | Reference board |
| **Closest existing** | `registrationOperatorPresenter.js` display status/queues; detail status chips |

---

## Prompt 3 — Registration queue

### Phase2 - 04 - Registration Applications - Desktop

| Field | Value |
|-------|--------|
| **Screen ID** | `edbec80688324e80aeae2c80a9c605a3` |
| **Device** | Desktop |
| **Purpose** | Operator queue of church registration applications |
| **Main sections** | Page header; summary counters; filters (status, risk, plan, assignee); results table; pagination |
| **Main actions** | Refresh; Export; View Review Guidelines; Filters/Reset; row View / Approve / Assign / more |
| **States** | Populated list; approval gated messaging (“until phone verification…”) |
| **Responsive** | Wide table → mobile card list |
| **Closest existing** | `/admin/registration-applications` → `registration-applications.ejs` |

### Phase2 - 04 - Registration Applications - Mobile

| Field | Value |
|-------|--------|
| **Screen ID** | `8c042d7eef2d4755884c81757ca7cdd9` |
| **Device** | Mobile |
| **Purpose** | Same queue as cards with progress/risk |
| **Main sections** | Counter chips; search/filters; application cards; bottom nav |
| **Main actions** | Filters; Review |
| **States** | Populated |
| **Responsive** | Card stack; sticky filters |
| **Closest existing** | Same list view (needs mobile card treatment) |

### Phase2 - 05 - Registration Applications Empty - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `4aa72e3fc2cc4e99bfd27bdc7a0b4ee7` | `1a9e631970da498094a336f19bd4ebcb` |

| Field | Value |
|-------|--------|
| **Purpose** | Empty queue / no filter matches |
| **Main sections** | Filters/tabs; empty illustration; helper CTAs (clear filters, refresh, manual invite hints) |
| **Main actions** | Clear All Filters; Refresh Dashboard; Manual Invite (Stitch — may be OUT_OF_SCOPE in product) |
| **States** | **Empty** (primary) |
| **Closest existing** | List view when `applications.length === 0`; shared `empty-state.ejs` |

### Phase2 - 06 - Registration Applications Error - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `cf84867684754bcf92c6cb2c87187395` | `0ab863f5c111477486207b1b42a10a82` |

| Field | Value |
|-------|--------|
| **Purpose** | Failed load of registration queue |
| **Main sections** | Error panel; retry; status page link; degraded system hint |
| **Main actions** | Retry Connection; View Status Page |
| **States** | **Error** |
| **Closest existing** | `error-state.ejs`; list route currently has limited dedicated error chrome |

---

## Prompt 4 — Review overview

### Phase2 - 07 - Registration Review Overview - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `fed982f2ebfa40e591e96a06d3ccea28` | `cd3b3c07058b4df19b56edd7190b69e9` |

| Field | Value |
|-------|--------|
| **Purpose** | Application hub: identity summary, tabs into sub-workspaces, audit snippet, decision CTAs |
| **Main sections** | Header (church, status, app #, plan, risk); action bar; tab nav (Overview, Details, Verification, Duplicates, Website Setup, Communication, Audit); registered identity; location; digital footprint; audit history; verification check summary |
| **Main actions** | Call; Mail; Request Info; Approve & Provision; Reject; Save Private Note; tab navigation |
| **States** | Under review; risk low/high; verification pass/fail snippets |
| **Responsive** | Tabs collapse / stack on mobile |
| **Closest existing** | `/admin/registration-applications/:id` → `registration-application-detail.ejs` (single long page, weaker tab model) |

---

## Prompt 5 — Details & documents

### Phase2 - 08 - Registration Details - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `3d160b6e07734ddea7e626c98fa6540f` | `111f7c95ce154d499f18e6a6f2eee996` |

| Field | Value |
|-------|--------|
| **Purpose** | Full registration facts: church identity, applicant/admin, digital presence, consent, metadata |
| **Main sections** | Church identity; applicant & proposed admin; headquarters; website; uploaded docs summary; consent & legal; system metadata |
| **Main actions** | Reject; Approve; section anchors |
| **States** | Populated; verification badges on admin |
| **Responsive** | Section stack on mobile |
| **Closest existing** | Detail view “Registration summary” + fields — **missing** many Stitch fields (legal name, denomination, docs, etc.) |

### Phase2 - 09 - Registration Documents - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `cec44c09e05146059ba1dc1b9810067b` | `bd04a1df190d4d909b14a838731ddbec` |

| Field | Value |
|-------|--------|
| **Purpose** | Review uploaded compliance documents |
| **Main sections** | Document cards; AI/validation hints; reviewer notes; completeness meter |
| **Main actions** | Request Resubmission; Approve All; Download; Verify/Reject document; Add Comment; View Sensitive |
| **States** | Verified / expiring / in progress / restricted |
| **Responsive** | Card list on mobile |
| **Closest existing** | **None** — no registration document store in V5 |

---

## Prompt 6 — Verification & checklist

### Phase2 - 10 - Registration Verification - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `8d5c641aa91642edb4c56971e3979a13` | `f12f1db130644e9a8be20362cfd6cdfa` |

| Field | Value |
|-------|--------|
| **Purpose** | Aggregated verification facts and recommendation |
| **Main sections** | Check rows (name duplicate, phone uniqueness, email uniqueness, email verification, website domain, applicant authority); overall recommendation; compliance reminder |
| **Main actions** | Run Again; Override; View History; Request Info; Continue to Decision |
| **States** | Passed / Warning / Failed / Checking |
| **Responsive** | Stacked check rows |
| **Closest existing** | Risk reason codes on detail (`risk_decision`, `risk_reason_codes`) — **partial**; no dedicated verification route |

### Phase2 - 11 - Approval Requirements Checklist - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `3f33fc25e51b459dabec4f68d14a50f3` | `454da5192ce54c0da779df62126ed697` |

| Field | Value |
|-------|--------|
| **Purpose** | Gate approval until mandatory checks pass |
| **Main sections** | Checklist items; final reviewer note; decision terminal |
| **Main actions** | Approve and Provision (gated); Reject; Save Draft & Return |
| **States** | Incomplete verification warning; item pending/failed/complete |
| **Responsive** | Sticky decision terminal on mobile |
| **Closest existing** | Approve form on detail + Network `network_validation_checklist` JSONB — **partial / different vocabulary** |

---

## Prompt 7 — Phone, email, duplicates

### Phase2 - 12 - Phone Verification - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `a87b0223c25b451ca596ecc95c096820` | `16f868dd262f4f6d94b03f9ecf561936` |

| Field | Value |
|-------|--------|
| **Purpose** | Call-based phone verification workspace |
| **Main sections** | Contact facts (phone, WhatsApp, local time); call history; call record form; mandatory checks |
| **Main actions** | Start Verification Call; Record Call Attempt; Open WhatsApp; Mark Phone Verified / Failed |
| **States** | Empty call history possible; outcome select |
| **Responsive** | Form stack |
| **Closest existing** | Support contact log (`organization_support_contacts` with method `phone`) — **PARTIAL**; no verify flag |

### Phase2 - 13 - Email Verification - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `ce16f55cab184ff6825ef682438afbbb` | `931394ae5b4848b7a96043b896d23ea2` |

| Field | Value |
|-------|--------|
| **Purpose** | Email verification status, resend, change email, manual verify |
| **Main sections** | Current email/status; delivery event history; policy notice |
| **Main actions** | Mark Manually Verified; Resend Verification Email; Change Email |
| **States** | Delivered/opened/clicked; never validated; bounce metrics (Stitch aspirational) |
| **Responsive** | History table → cards |
| **Closest existing** | Acknowledgement email stub only — **MISSING** verification flow |

### Phase2 - 14 - Duplicate Church Matches - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `9a6e893e3118498a8616391ee1ad9239` | `a7207de205f949f69e3b2ded82f350da` |

| Field | Value |
|-------|--------|
| **Purpose** | List potential duplicate orgs/applications |
| **Main sections** | Match cards with confidence; match reasons; authorize-as-new CTA |
| **Main actions** | Compare; Mark Different; Create New Ministry Record |
| **States** | Multiple matches; no-match CTA |
| **Responsive** | Card stack |
| **Closest existing** | Risk codes `duplicate_phone` / `similar_organization` / status `duplicate_review` — **PARTIAL**; no match list UI |

### Phase2 - 15 - Duplicate Church Comparison - Desktop / Mobile

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `367f917d6afd4ba1828a7ba75cdbddfe` | `43cc53fd69ea4fa5a03f4a971a67ddad` |

| Field | Value |
|-------|--------|
| **Purpose** | Side-by-side application vs existing organization |
| **Main sections** | Submitted vs existing fields; conflict highlights; decision reasons |
| **Main actions** | Different Church; Existing Church (Link); Fraud Concern; Request Clarification |
| **States** | Match score warning |
| **Responsive** | Stacked columns on mobile |
| **Closest existing** | `POST …/link-organization` — **PARTIAL** (link only; no comparison UI) |

---

## Inventory counts (Prompts 1–7)

| Metric | Count |
|--------|------:|
| Unique Phase2 screens in inventory | 28 |
| Desktop product screens | 13 |
| Mobile product screens | 13 |
| Component/state boards (desktop only) | 2 (02, 03) |
| Excluded later Phase2 screens (16–19) | 8 (+ 00 audit) |

**Stitch screens were not renamed or edited.**
