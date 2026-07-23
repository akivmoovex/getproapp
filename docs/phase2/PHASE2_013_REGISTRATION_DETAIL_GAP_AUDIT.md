# PHASE2_013 — Registration Detail Gap Audit

**Date:** 2026-07-23  
**Mode:** Documentation only — **no runtime code, tests, migrations, routes, views, CSS, JavaScript, or Stitch screens were modified**  
**Canonical route:** `GET /admin/registration-applications/:id`  
**View:** `views/blessboard/v5/platform-admin/registration-application-detail.ejs`  
**Service:** `getRegistrationApplicationDetail` in `src/blessboard/services/registrationApplicationsAdminService.js`  
**Presenter helpers:** `mapListRow` + `presentRegistrationOperatorView` (`registrationOperatorPresenter.js`) + Batch 2 status chips  
**Repository:** `getRegistrationApplicationById` (+ support contacts, subscription/publication summaries, platform admins, audit merge)  
**Stitch scope:** Phase2 screens **07**, **08**, **09** (desktop + mobile)

---

## Current detail capability matrix

| # | Capability | Status | What exists today |
|---|------------|--------|-------------------|
| 1 | **Application header** | **PARTIAL** | Breadcrumb + page title = `churchName`; lede = city/country + submitted time. No Stitch-style chip row (app #, plan, risk, status) in the header; no sticky action bar |
| 2 | **Application number** | **DERIVABLE** / **MISSING** in UI | Only UUID `id` stored. Shown buried under Technical details. No human `#APP-…` field; safe to **derive** a short display token from `id` for UI only |
| 3 | **Church name** | **COMPLETE** | `church_name` → `churchName` rendered as H1 and summary “Church” |
| 4 | **Applicant identity** | **PARTIAL** | `contact_name`, optional `role_in_church`. No separate legal/applicant vs admin split; no verification badges |
| 5 | **Applicant contact details** | **COMPLETE** | `contact_email`, `contact_phone`, optional normalized phone in Validation panel |
| 6 | **Requested plan** | **COMPLETE** | `selected_plan` / `selectedPlanLabel`; Network chip when applicable |
| 7 | **Application status** | **PARTIAL** | Operator **display** status prominent; raw `applicationStatus` chip mainly in Technical details (not header) |
| 8 | **Provisioning status** | **PARTIAL** | Loaded and chip-rendered in Technical details; not in primary overview header |
| 9 | **Assignment** | **COMPLETE** (ops panel) | Effective assignee from app or org onboarding; assign form when `supportAssignmentAvailable` |
| 10 | **Last activity** | **PARTIAL** | `last_activity_at` shown in Technical details **only when organization linked**; contact timestamps in Support ops |
| 11 | **Church details** | **PARTIAL** | Name + city/country + optional role/branch fields. **No** legal name, denomination, tax/RC, foundation date, mission |
| 12 | **Headquarters details** | **PARTIAL** / mostly **NOT STORED** | City + country only. No street, postal, HQ label |
| 13 | **First-branch details** | **PARTIAL** | `branch_name`, `branch_count` (stated) in Validation. Not framed as “first branch / HQ campus” |
| 14 | **Proposed administrator details** | **DERIVABLE** / **NOT STORED** as separate | No dedicated proposed-admin columns. Instant path uses contact as admin; UI does not label contact as “proposed primary admin” |
| 15 | **Website details** | **NOT STORED** | No website URL / domain fields on the application. Post-provision publication counts appear under Technical details when org linked — not a Website Setup workspace |
| 16 | **Terms and authority declarations** | **PARTIAL** | Single `consent_terms` boolean (“Terms / privacy accepted”). No multi-declaration text, signature, or policy version |
| 17 | **Internal notes** | **PARTIAL** | SQL loads `review_notes` on detail query but **service does not map** them onto `application`; UI never shows `review_notes`. Contact notes with `internal_note` method exist via support contacts |
| 18 | **Contact history** | **COMPLETE** (when ops available) | App-scoped or org-scoped support contacts listed; Add contact note form |
| 19 | **Risk or support indicators** | **PARTIAL** | `risk_decision`, reasons, decided-at in Validation; support-requested chip in summary. No Stitch “Risk: Low” header chip prominence; no invented verification % |
| 20 | **Duplicate review** | **PARTIAL** | Status may be `duplicate_review`; risk reason codes may imply uniqueness. **No** match list, merge UI, or duplicate workspace. Link-organization is separate secondary panel |
| 21 | **Documents** | **NOT STORED** | No registration document table / media FK. Stitch 09 **BACKEND_BLOCKED** |
| 22 | **Audit history** | **PARTIAL** | Merged `review_events` + org registration-category audits (capped). Shown as compact list under Activity — not a dedicated Audit tab / full log route |
| 23 | **Approval actions** | **COMPLETE** (gated) | Approve & provision / Network create / Mark validation complete / View organization — in “Recommended next action” panel when flags allow. Behavior unchanged |
| 24 | **Rejection actions** | **COMPLETE** (gated) | Reject form with required reason when `rejectActionsAvailable` |
| 25 | **Mobile layout** | **PARTIAL** | Single stacked panel page (same EJS). Reuses `.bb-pa-org-detail` / panel stack. No tab strip, no mobile action sticky bar, no card-section Stitch composition. Usable but not Stitch-aligned |

### Legend notes

- **OUT OF SCOPE FOR STITCH PROMPTS 1–7:** Dedicated Verification / Duplicate Checks / Website Setup / Communication Log product workspaces (Stitch tabs beyond Overview/Details/Documents); AI authenticity scores; Moovex branding; inventing missing org/legal fields.

---

## Data provenance (do not invent)

| Kind | Examples on this screen |
|------|-------------------------|
| **Applicant-provided** | `church_name`, `country`, `city`, `contact_*`, `role_in_church`, `branch_name`, `branch_count`, `selected_plan`, `message` / `registration_message`, `consent_terms` |
| **System-derived** | `id`, timestamps, `application_status`, `provisioning_status`, risk fields, normalized phone, operator display/queue/tone, subscription/publication summaries, onboarding summary, audit merge |
| **Administrator-entered** | Follow-up status, support assignment, support contact notes, rejection reason, optional org key on approve/link, network validation completion |

---

## Field matrix

Missing-data behavior: show **—** / omit section / honest empty-state. Never fabricate Stitch demo values.

| Phase2 field label | Source table / JSON | Repository property | Presenter / view property | Rendered | Safe to display | Missing-data behavior | Recommended action |
|--------------------|---------------------|---------------------|---------------------------|----------|-----------------|----------------------|--------------------|
| Church / public name | `platform_church_registration_applications.church_name` | `church_name` | `churchName` | yes | yes | — | Keep; use as identity until legal name collected |
| Legal entity name | — | — | — | no | n/a | omit / — | **NOT STORED** — omit or “—”; do not invent |
| Application number | `id` (UUID) | `id` | `id` | partial (tech) | yes (derived) | derive short display | **DERIVABLE** display token in header |
| Denomination | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| Tax ID / RC / EIN | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| Date of foundation | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| Mission statement | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| Registration type | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| City | `city` | `city` | `city` | yes | yes | — | Keep under location / HQ partial |
| Country | `country` | `country` | `country` | yes | yes | — | Keep |
| Street / postal HQ | — | — | — | no | n/a | omit | **NOT STORED** — omit |
| Branch name | `branch_name` | `branch_name` | `branchName` | yes (Validation) | yes | — | Promote into Details section |
| Branch count (stated) | `branch_count` | `branch_count` | `branchCount` | yes | yes | — | Label as applicant-stated |
| Applicant full name | `contact_name` | `contact_name` | `contactName` | yes | yes | — | Keep; optionally label “Applicant” |
| Applicant role / designation | `role_in_church` | `role_in_church` | `roleInChurch` | yes if set | yes | omit when null | Keep |
| Applicant email | `contact_email` | `contact_email` | `contactEmail` | yes | yes | — | Keep |
| Applicant phone | `contact_phone` | `contact_phone` | `contactPhone` | yes | yes | — | Keep |
| Phone normalized | `contact_phone_normalized` | `contact_phone_normalized` | `contactPhoneNormalized` | yes | yes | — | Keep (ops) |
| WhatsApp | — | — | — | no | n/a | omit | **NOT STORED** |
| Proposed admin name | — (same as contact for instant) | — | — | no | n/a | derive label only | **DERIVABLE** note: same as applicant until schema expands |
| Proposed admin email / username | — | — | — | no | n/a | omit | **NOT STORED** separate |
| Admin verification status | — | — | — | no | n/a | omit | **NOT STORED** — never invent “Verified” |
| Requested plan | `selected_plan` | `selected_plan` | `selectedPlan` / `selectedPlanLabel` | yes | yes | — | Promote to header chip |
| Application status | `application_status` | `application_status` | `applicationStatus` | partial | yes | — | Promote chip to overview |
| Provisioning status | `provisioning_status` | `provisioning_status` | `provisioningStatus` | partial | yes | — | Promote chip to overview |
| Operator display status | derived | — | `displayStatus` / `operatorView` | yes | yes | — | Keep as primary human status |
| Risk decision | `risk_decision` | `risk_decision` | `riskDecision` | yes | yes | — when null | Header chip only when present |
| Risk reason codes | `risk_reason_codes` | `risk_reason_codes` | `riskReasonLabels` | yes | yes | — | Keep; no fake % |
| Support requested | `support_requested` (effective) | `support_requested` | `supportRequested` | yes | yes | omit chip | Keep |
| Assigned support | assignee + users join | `assigned_support_user_id`, `support_display_name` | `assignedSupport*` | yes (ops) | yes | Unassigned | Keep in ops / overview meta |
| Follow-up status | effective follow-up | `follow_up_status` | `followUpStatus` | yes | yes | — | Keep |
| Submitted at | `created_at` | `created_at` | `createdAt` | yes | yes | — | Keep |
| Last activity | `organization_onboarding.last_activity_at` | `last_activity_at` | `lastActivityAt` | partial | yes | — if no org | Show when present |
| Last / first contacted | app or onboarding | `*_contacted_at` | `*ContactedAt` | yes (ops) | yes | — | Keep |
| Applicant message / notes | `message` | `registration_message` | `message` | yes (Validation) | yes | — | Relabel under Details |
| Consent terms accepted | `consent_terms` | `consent_terms` | `consentTerms` | yes | yes | No | Keep; do not invent other declarations |
| Extra consent / authority texts | — | — | — | no | n/a | omit | **NOT STORED** |
| Digital signature / IP | `source_ip`, `user_agent` (SQL only) | `source_ip`, `user_agent` | **not mapped** | no | masked | omit or mask | Optional later: map + **mask** IP; never show raw UA dump |
| Internal `review_notes` | `review_notes` | `review_notes` (row) | **not mapped** | no | yes | — | Map in service when exposing notes panel |
| Contact / internal notes history | `organization_support_contacts` / app contacts | contact rows | `contacts[]` | yes | yes | empty copy | Keep |
| Audit events | `review_events` + platform audit | merged | `auditEvents[]` | yes | yes | empty copy | Keep; deepen later |
| Linked organization | `organizations.*` | org joins | `organizationKey` etc. | yes (tech / action) | yes | — | Keep |
| Website URL | — | — | — | no | n/a | omit | **NOT STORED** |
| Publication counts | org pages summary | publication query | `publication` | yes (tech) | yes | 0/0 | Keep as system meta only |
| Documents | — | — | — | no | n/a | empty / blocked | **NOT STORED** — honest empty or omit |
| Verification score / AI % | — | — | — | no | no | omit | **Exclude** — invented in Stitch |
| Rejection reason | `rejection_reason` | `rejection_reason` | `rejectionReason` | yes if set | yes | omit | Keep |
| Provisioning errors | error code/detail | sanitized | `provisioningError*` | yes (tech) | yes (sanitized) | — | Keep sanitized only |

### Availability summary (Phase2 07–08 field set)

Counting distinct Phase2-oriented labels in the matrix above (**40** rows):

| Bucket | Count | Share |
|--------|------:|------:|
| Stored + already rendered (yes / partial) | 24 | 60% |
| Stored or loaded but not rendered / not mapped | 2 | 5% |
| Derivable without schema (`id` display #; contact-as-admin label) | 2 | 5% |
| Not stored / must omit | 12 | 30% |

**≈ 65%** of Phase2 Overview/Details field labels are **already available** from existing data (stored rendered + stored-unmapped + safely derivable).  
**≈ 30%** are **not stored** (largest group: legal/HQ/website/documents/multi-consent).  
Documents (09) are **0%** implementable without schema — **BACKEND_BLOCKED**.

---

## Route and loader review

| Question | Finding |
|----------|---------|
| **Canonical detail route sufficient?** | **Yes** for Overview + Details + Activity on one page. Separate routes planned later for verification / phone / email / duplicates (PHASE2_005) — **out of this audit’s implementation** |
| **Tabs: anchors vs query vs routes?** | Prefer **in-page anchors** (`#overview`, `#details`, `#activity`) for Batch 4/5. Use **future dedicated GETs** only for heavy workspaces (verification, documents when storage exists). Query `?tab=` optional but unnecessary if anchors work |
| **Related data load pattern** | **One** primary `getRegistrationApplicationById` (joins org + onboarding + assignee). Then: always `listActivePlatformAdministrators`; if org → **parallel** subscription + publication + org contacts, then audit list; else if support ops → app contacts. Route may add `getOrganizationOnboardingSummary` |
| **N+1?** | **No per-row N+1** (single application). Several sequential queries on one detail — acceptable. Admins list is global, not per-contact |
| **Missing related records** | Null org → skip org-only blocks; empty contacts/audits → muted empty copy; flags gate forms |
| **Identifier validation** | UUID regex in service; invalid → **400**; missing → **404** |
| **404 / 403 / repo errors in shell?** | Auth: apex + `requirePlatformAdmin` (unauth redirect / **403**) before data. Lookup **404/400/503** use `sendControlled` **standalone** HTML — **not** in-shell `error-state` (same class of gap list had before Prompt 012). Flash errors on successful GET render inside shell |

**Do not implement route changes in the next view-only batch.**

---

## Document support

| Question | Answer |
|----------|--------|
| Stored and linked to applications? | **No** |
| Stored but not linked? | **No** registration-specific files |
| Metadata only? | **No** document metadata columns |
| Not implemented? | **Yes** — confirmed by PHASE2_004 / Stitch 09 inventory |
| Reusable secure download pattern? | **Yes, elsewhere:** forms/requests private media (`sendPrivateMediaDownload` in `formsRequestsAdminRoutes.js` — nosniff, `Content-Disposition: attachment`, `Cache-Control: private, no-store`) + `blessboard.media_assets`. **Reusable only after** a registration↔media link exists |
| Upload support? | **Do not add** |

**Recommendation for 09:** product choice — omit Documents tab, or honest empty-state “Documents are not collected yet” with **no** fake files/AI %.

---

## Action review (placement only — behavior unchanged)

| Action | Exists today | Recommended placement |
|--------|--------------|----------------------|
| **Assign** | POST `…/assign-support` | **Dedicated review / Support ops panel** (unchanged); optional summary of assignee in header |
| **Contact applicant** | POST `…/contact` | **Dedicated panel** (not header mailto/call that implies outbound telephony product). Stitch Call/Mail are **OUT OF SCOPE** as new channels unless they only deep-link `tel:`/`mailto:` to existing contact fields |
| **Link organization** | POST `…/link-organization` | **Secondary panel** / overflow — keep away from primary approve path |
| **Approve** | POST `…/approve` (gated) | **Dedicated review panel** (current “Recommended next action”) — not inactive queue buttons; do **not** change gates |
| **Reject** | POST `…/reject` | Same panel as today (secondary to approve) |
| **Retry provisioning** | POST `…/retry-provision` | Same primary action panel when `retryProvisionAvailable` |
| **Reopen** | **Does not exist** | **Hidden until later** — no route/behavior today |
| **Add note** | Via contact form (`internal_note` method) | Stay in Support ops; surface `review_notes` only after mapped |
| **View audit history** | Inline Activity list | Keep on page; optional “Audit” anchor. Full log page **later** |
| **Mark validation complete** | POST `…/mark-validation-complete` | Remain in review panel (Network) |
| **Follow-up status** | POST `…/follow-up-status` | Support ops panel |

---

## Stitch comparison

### Phase2 - 07 - Registration Review Overview - Desktop

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 07 - Registration Review Overview - Desktop |
| **Stitch ID** | `fed982f2ebfa40e591e96a06d3ccea28` |
| **Closest existing view** | `registration-application-detail.ejs` |
| **Main visual gaps** | No chip header (APP # / plan / risk); no action bar; no tab nav; long single-scroll panels; Moovex chrome vs BlessBoard PA shell |
| **Main data gaps** | Legal name, denomination, tax ID, street address, website, social, campus photo — **not stored** |
| **Desktop gap** | Hub composition + tabs + action bar |
| **Mobile gap** | (see mobile ID below) |
| **Backend change required** | **None** for honest overview of stored fields |
| **View-only change possible** | **Yes** — header, anchors, promote status/plan/risk, restructure sections |

### Phase2 - 07 - Registration Review Overview - Mobile

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 07 - Registration Review Overview - Mobile |
| **Stitch ID** | `cd3b3c07058b4df19b56edd7190b69e9` |
| **Closest existing view** | Same EJS stacked panels |
| **Main visual gaps** | No mobile tab control / sticky actions; weaker hierarchy |
| **Main data gaps** | Same as desktop |
| **Desktop gap** | — |
| **Mobile gap** | Stacked anchors or select-nav; primary CTA near top |
| **Backend change required** | **None** |
| **View-only change possible** | **Yes** |

### Phase2 - 08 - Registration Details - Desktop

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 08 - Registration Details - Desktop |
| **Stitch ID** | `3d160b6e07734ddea7e626c98fa6540f` |
| **Closest existing view** | “Registration summary” + “Validation” + technical dl |
| **Main visual gaps** | No sectioned identity / HQ / applicant / admin / website / consent cards |
| **Main data gaps** | Legal/HQ/mission/tax/admin/website/docs/multi-consent — largely **NOT STORED** |
| **Desktop gap** | Structured sections from **available** fields only |
| **Mobile gap** | Section stack |
| **Backend change required** | **None** for available fields; schema for Stitch-complete parity |
| **View-only change possible** | **Yes** — regroup existing properties; omit missing |

### Phase2 - 08 - Registration Details - Mobile

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 08 - Registration Details - Mobile |
| **Stitch ID** | `111f7c95ce154d499f18e6a6f2eee996` |
| **Closest existing view** | Same |
| **Main visual gaps** | Same content gaps; mobile section stack |
| **Main data gaps** | Same |
| **Backend change required** | **None** for available fields |
| **View-only change possible** | **Yes** |

### Phase2 - 09 - Registration Documents - Desktop

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 09 - Registration Documents - Desktop |
| **Stitch ID** | `cec44c09e05146059ba1dc1b9810067b` |
| **Closest existing view** | **None** |
| **Main visual gaps** | Entire document workspace missing |
| **Main data gaps** | No files, validation states, AI %, completeness meter |
| **Desktop gap** | Full screen |
| **Mobile gap** | Full screen |
| **Backend change required** | **Yes** (child table / media FK) before real docs |
| **View-only change possible** | Honest empty / omit only — **no fake documents** |

### Phase2 - 09 - Registration Documents - Mobile

| Field | Value |
|-------|--------|
| **Exact Stitch name** | Phase2 - 09 - Registration Documents - Mobile |
| **Stitch ID** | `bd04a1df190d4d909b14a838731ddbec` |
| **Closest existing view** | **None** |
| **Main visual gaps** | Same |
| **Main data gaps** | Same |
| **Backend change required** | **Yes** for real docs |
| **View-only change possible** | Empty-state / omit only |

---

## Largest gaps (ranked)

1. **Not stored legal / HQ / website / multi-consent / documents** — blocks Stitch-complete Details + Documents.  
2. **Overview information architecture** — header chips, action bar, tab/anchor nav (view-only).  
3. **Details section grouping** — data exists but flattened across Summary / Validation / Technical.  
4. **In-shell detail error** — 404/503 still `sendControlled` (optional polish; not required for field parity).  
5. **Unmapped `review_notes` / `source_ip`** — tiny service map if notes/consent metadata desired.

---

## Recommended next implementation

**One smallest batch:** Phase2 **Batch 4+5 view-only** — **Registration detail overview + structured details** (Stitch 07 + 08 using **existing loader data only**).

### Status — **COMPLETE** (2026-07-23, Prompt 014)

Implemented:

- Overview header with canonical fields, status chips, assignee/follow-up/activity meta
- In-page section navigation (anchors)
- Structured cards: church, location/branch, applicant, proposed admin (contact-derived with honesty note), website/access (system-only when linked), declarations
- Documents honest empty-state (no upload/download/verification)
- Existing approve/reject/assign/contact/link/retry forms preserved
- Origin labels: Applicant-provided / System-derived / Administrator-entered
- Tests: `tests/blessboard-registration-detail-overview.test.js` (no Postgres)

Still deferred: verification/duplicates workspaces, document storage, schema fields (legal name, street, website URL, separate proposed admin), in-shell 404/503, approval rule changes.

### Exact files changed (Prompt 014)

- `views/blessboard/v5/platform-admin/registration-application-detail.ejs`
- `public/blessboard/v5/platform-admin.css` + shell `?v=35`
- `tests/blessboard-registration-detail-overview.test.js`
- Docs: PHASE2_006, PHASE2_008, PHASE2_013

### Explicit exclusions (unchanged)

- Document upload / download / AI validation  
- Verification workspaces and persistence  
- Duplicate match UI  
- New schema  
- Approval/rejection rule changes  
- Reopen action  
- Invented values  

---

## Runtime change confirmation

**Prompt 013:** docs only. **Prompt 014:** view-only detail overview/details/documents empty-state implemented as above (no loader/route/service/repository changes).
