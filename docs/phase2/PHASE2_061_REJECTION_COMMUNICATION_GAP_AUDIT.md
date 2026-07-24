# PHASE2_061 — Rejection and Communication Gap Audit (Prompt 8 planning)

**Date:** 2026-07-24  
**Mode:** Documentation only — **no** runtime code, migrations, routes, views, CSS, JS, tests, or Stitch edits  
**Scope:** BlessBoard V5 Platform Admin church-registration workflow — planning for Stitch **Prompt 8**  
**Stitch project:** `projects/17124191473876947591`  
**Sources:** `PHASE2_002`–`008`, `PHASE2_060`, live Stitch `list_screens` / `get_screen`, routes/services/repos/migrations/views  

---

## 0. Stitch source-of-truth naming (critical)

The planning prompt referred to aspirational titles. **Live Stitch titles and IDs differ.** Exact completed screens:

| Prompt intent (planning brief) | **Exact Stitch name (source of truth)** | Stitch ID | Device |
|--------------------------------|-------------------------------------------|-----------|--------|
| “Request Additional Information” | **No separate completed screen with this title** | — | — |
| “Reject Registration” | **Phase2 - 16 - Rejection Workspace - Desktop** | `b83ae131078e4e4d9b0ec5aa11614cbb` | Desktop |
| | **Phase2 - 16 - Rejection Workspace - Mobile** | `fe71b34e971f4952a061ba46c396bdc2` | Mobile |
| “Applicant Communication History” | **Phase2 - 17 - Communication Log - Desktop** | `d9cf49daeacf48e480fa6749d3a2ac1f` | Desktop |
| | **Phase2 - 17 - Communication Log - Mobile** | `d98993353b744820a708390b6340395b` | Mobile |
| (Not Prompt 8 rejection/comms) | Phase2 - 18 - Environment Provisioning - Desktop/Mobile | `350aba2208414c3d…` / `27ae3c9d967d…` | **Defer to Prompt 9** |

**Implication:** Prompt 8 Stitch surface is **Rejection Workspace (16)** + **Communication Log (17)**. “Request additional information” is a **capability** to plan under Communication Log compose / follow-up status — not a distinct Stitch screen ID in this project.

### Stitch 16 — Rejection Workspace (observed)

- Reason-for-rejection multi-select / category UI  
- Applicant-facing **Rejection Message** with template / rich text  
- **Confirm Rejection**, **Save as Draft**, **Email Preview**  
- Status copy “Pending Rejection”  
- No reopen control observed on this board  

### Stitch 17 — Communication Log (observed)

- Communication History table (date, subject, sender, status, actions)  
- **Send New Message** / Compose  
- Message preview / metadata / **Email (SMTP)** status theater  
- Fake metric tiles (Total Sent, Automated, …) — **do not implement as fake KPIs**  

---

## 1. Current workflow capability matrix

| Capability | Mark | Notes |
|------------|------|-------|
| Reject application | **COMPLETE** | `POST …/reject` → `rejectRegistrationApplication` |
| Rejection reason | **COMPLETE** (storage) / **PRESENT_BUT_AMBIGUOUS** (audience) | Single `rejection_reason` TEXT (1–500); used as operator form “Reject with reason” |
| Rejection category | **MISSING** | No allowlisted category column or enum |
| Applicant-facing rejection message | **MISSING** | No separate field; reason may or may not be shown to applicant (no send path today) |
| Internal review notes | **PARTIAL** | `review_notes` column exists; detail presenter historically weak; support `internal_note` contacts work |
| Contact applicant | **PARTIAL** | `POST …/contact` CRM log; **does not send** email/SMS |
| Support contacts | **COMPLETE** (CRM) | `organization_support_contacts` app- or org-scoped |
| Follow-up status | **COMPLETE** | Including `awaiting_customer` (usable as “waiting on applicant”) |
| Communication channel | **PARTIAL** | Contact methods phone/email/message/meeting/internal_note — not full Stitch channels |
| Communication direction | **MISSING** | No inbound/outbound field |
| Email messages (outbound ledger) | **MISSING** | Verification tokens are ownership-only; not a general mail log |
| Phone contact logs | **PARTIAL** | CRM contacts + structured phone-verification attempts (separate purpose) |
| Applicant response | **MISSING** | No applicant portal reply capture for registration review |
| Request-information state | **PARTIAL** | Prefer `follow_up_status=awaiting_customer`; no dedicated request payload |
| Reopen rejected application | **COMPLETE (071)** | `POST …/reopen` → `submitted`; preserves rejection history/metadata/comms; review event; no email |
| Audit events | **PARTIAL** | Reject → `review_events` only (no org platform audit); reopen → `review_events`; contacts → review_events + org audit when org-linked |
| Notification sending | **MISSING** / stub pattern elsewhere | Reject may record notice with honest unavailable status; reopen does not notify; email verification uses safe unavailable stub |

---

## 2. Existing rejection flow (trace — do not change)

| Step | Detail |
|------|--------|
| **Route** | `POST /admin/registration-applications/:id/reject` |
| **Middleware** | `requireApex`, `requirePlatformAdmin` |
| **CSRF** | `validateCsrf` → redirect `?error=csrf` |
| **Handler** | `platformAdminRoutes.js` → `rejectRegistrationApplication` |
| **Service** | `registrationApplicationsAdminService.rejectRegistrationApplication` |
| **Repository** | `updateApplicationRiskReviewState` (status, risk, `rejection_reason`, `review_events` append) |
| **Status transition** | `submitted` \| `duplicate_review` → `rejected` (idempotent if already rejected) |
| **Stored reason** | `rejection_reason` (trimmed, max 500, min length 3) |
| **Stored category** | None |
| **Eligibility** | Not if provisioned / has `organization_id`; not if status outside submitted/duplicate_review |
| **Applicant notification** | **None** |
| **Audit** | Application `review_events` entry `{ action: "reject", actor_user_id, reason_codes, note_len }` — **no** full reason text in event; **no** platform org audit |
| **Risk** | Sets `risk_decision=reject`, appends `admin_rejected` reason code |
| **Redirect** | `303` → detail `?notice=application_rejected#reg-rejection` (**069**; formerly `notice=rejected`) |
| **Reopen** | **COMPLETE (071)** — `POST …/reopen`; reason required; rejected → submitted; preserve history; `notice=application_reopened` |
| **UI** | **COMPLETE (070–071)** — `#reg-rejection` Rejection workspace (form + completed state + reopen form) |
| **Tests** | Risk-review HTTP CSRF/success; **069** reject route; **071** reopen service/route; service unit/PG (068) |

### Rejection reason audience

| Question | Answer |
|----------|--------|
| Internal only? | **Effectively yes today** (admin UI + DB; never sent) |
| Applicant facing? | **No send path** |
| Used for both? | **Not today** |
| Classification | **PRESENT_BUT_AMBIGUOUS** — treat as **internal decision notes** until an explicit applicant-facing field/message type exists. **Do not change** current write semantics in early Prompt 8 batches without a deliberate split. |

---

## 3. Communication storage candidates

### A. `blessboard.platform_church_registration_applications.review_notes`

| Field | Value |
|-------|--------|
| Columns | `review_notes` TEXT (1–5000) |
| Repo | Loaded on detail SQL; risk-review updater can patch |
| Append-only? | **No** — overwrite |
| Actor / timestamp | Weak (no per-note actor) |
| Channel / direction / applicant message | No |
| Internal note | Coarse single blob |
| Attachments | No |
| Canonical history? | **No** |
| Class | **UNSAFE_OR_AMBIGUOUS** as history; optional summary only |

### B. `blessboard.organization_support_contacts`

| Field | Value |
|-------|--------|
| Columns | `id`, `organization_id` (nullable), `registration_application_id`, `created_by_user_id`, `contact_method`, `outcome`, `note`, `contacted_at`, `next_follow_up_at`, `created_at` |
| Repo | `createOrganizationSupportContact`, list on detail |
| Append-only? | **Yes** (insert-only practice) |
| Actor / timestamp | Yes |
| Channel | Via `contact_method` |
| Direction | **No** |
| Applicant-facing message | Ambiguous — `note` is free text; method `email`/`message` ≠ sent email |
| Internal note | `internal_note` method |
| Attachments | No |
| Canonical Stitch Communication Log? | **Unsafe alone** — no subject, delivery status, audience, or SMTP honesty |
| Class | **REUSE_DIRECTLY** for CRM/phone/meeting/internal ops notes; **UNSAFE_OR_AMBIGUOUS** as sole Stitch mail history |

### C. Application follow-up fields (`follow_up_status`, `first_contacted_at`, `last_contacted_at`, `next_follow_up_at`, `assigned_support_user_id`)

| Class | **REUSE_DIRECTLY** for workflow state (“awaiting applicant”); **NOT_APPLICABLE** as message body store |

### D. `review_events` JSONB

| Class | **REUSE_DIRECTLY** for compact audit breadcrumbs (`action`, `actor`, `note_len`); **UNSAFE_OR_AMBIGUOUS** for full message bodies |

### E. Platform audit (`recordAuditEvent` / org audit)

| Class | **REUSE_DIRECTLY** for org-scoped action keys when `organization_id` exists; metadata should stay short (no full sensitive message dump) |

### F. Email verification tokens (`037`)

| Class | **NOT_APPLICABLE** for general communications (ownership hashes only) |

### G. Phone verification attempts (`036`)

| Class | **NOT_APPLICABLE** as general communication history (verification evidence only); may appear as related timeline later with clear labeling |

### Recommended canonical storage

**Preferred (smallest queryable Prompt 8 design):**

1. **New append-only table** `blessboard.registration_application_communications` (one table, typed rows — **not** one table per type).  
2. **Keep** `rejection_reason` unchanged (internal).  
3. **Add nullable application columns** only where query/filter needs them:  
   - `rejection_category` (allowlisted TEXT NULL)  
   - `rejection_applicant_message` TEXT NULL (or store solely as `rejection_notice` communication row — prefer **communication row** + optional denorm later)  
   - `rejection_notification_status` TEXT NULL  
   - `reapplication_allowed` BOOLEAN NULL  
4. **Reuse** `follow_up_status='awaiting_customer'` for information-requested workflow without new `application_status`.  
5. **Keep** support contacts for CRM; optionally mirror “phone-contact note” into communications or link by ID.

**Migration required:** **YES** (communications ledger + selective rejection columns). Extending only support contacts is **insufficient** for Stitch email subject/status honesty without awkward CHECK/constraint growth.

**Storage implementation status (Prompt 062):** **COMPLETE** — migration `039_registration_application_communications.sql`; repository create/list/findLatest + `updateRegistrationRejectionMetadata`; Postgres-gated tests.  

**Service implementation status (Prompt 063):** **COMPLETE** — `registrationApplicationCommunicationService.js`.  

**Information-request route status (Prompt 064):** **COMPLETE** — `POST /admin/registration-applications/:id/request-information`.  

**Request-information form status (Prompt 065):** **COMPLETE** — `#reg-communications` on registration detail; section nav Communication; allowlisted notices; no delivery claims.  

**Communication history loader status (Prompt 066):** **COMPLETE** — `loadRegistrationCommunicationsForDetail` on detail (`communications = { items, summary, unavailable }`).  

**Communication history UI status (Prompt 067):** **COMPLETE** — summary + cards in `#reg-communications`; empty/unavailable; honest delivery labels; no edit/delete.  

**Rejection service status (Prompt 068):** **COMPLETE** — `rejectRegistrationApplication` + `recordRejectionNotice`; category/metadata/notice/honest notify; one transaction.  

**Reject route status (Prompt 069):** **COMPLETE** — `POST …/reject` accepts upgraded fields; CSRF; session admin; `notice=application_rejected#reg-rejection`; legacy `rejection_reason` compat.  

**Rejection Workspace UI status (Prompt 070):** **COMPLETE** — `#reg-rejection` form + completed rejected state; confirmation checkbox; Approve kept separate.  

**Reopen status (Prompt 071):** **COMPLETE** — controlled reopen POST + completed-state form; preserves rejection history/metadata/comms; no automatic email. Real ESP remains deferred.

---

## 4. Minimum canonical message / event types

Single table `message_type` allowlist (illustrative):

| Type | Purpose |
|------|---------|
| `internal_note` | Admin-only |
| `information_request` | Applicant-facing request for fields/docs |
| `applicant_response` | Captured reply (manual paste or future portal) |
| `rejection_notice` | Applicant-facing rejection explanation |
| `general_applicant_message` | Other outbound applicant message |
| `phone_contact_note` | Optional structured pointer/summary (CRM remains source for attempts) |
| `verification_message` | Optional link to email-verify resend events (reference only) |
| `system_event` | Non-message timeline crumbs if needed |

Do **not** create one physical table per type.

Suggested row fields (minimal): `id`, `application_id`, `message_type`, `direction` (`outbound`/`inbound`/`internal`), `channel` (`email`/`phone`/`in_app`/`none`), `subject`, `body`, `visibility` (`internal`/`applicant`), `delivery_status`, `created_by_user_id`, `created_at`, optional `related_support_contact_id`, optional structured JSONB `payload` (requested fields, deadline) — keep payload small and allowlisted.

---

## 5. Request additional information (capability)

| Stitch / product need | Backend now | Implement now without mailer? |
|-----------------------|-------------|-------------------------------|
| Request category | Missing | Yes — allowlist on communication `payload` |
| Recipient | Contact email on application | Yes — display only |
| Subject | Missing | Yes — store on communication row |
| Applicant-facing message | Missing | Yes — store body |
| Requested fields / documents | Missing | Yes — allowlisted keys in JSONB; docs remain blocked if no storage |
| Response deadline | Missing | Yes — timestamptz on row / payload |
| Internal note | Partial (contacts) | Yes — separate `internal_note` row or payload field |
| Save draft | Missing | Optional — `delivery_status=draft` |
| Send request | Missing | Record + attempt stub adapter |
| Application-status transition | Prefer **no** new status | Set `follow_up_status=awaiting_customer` |
| Follow-up creation | Existing | Reuse follow-up update |

**Honest send behavior (no provider):**

- Persist communication as **recorded** / **queued** only if product wants a queue; default: **`sending_unavailable`** after record when adapter returns unavailable (same honesty as email verification).  
- UI: “Request saved. Email sending is unavailable in this environment.”  
- **Never** claim Delivered / Sent / Opened.

---

## 6. Rejection data model vs Stitch 16

| Field | Already stored? | Recommendation |
|-------|-----------------|----------------|
| Rejection category | No | **Add nullable** allowlisted `rejection_category` |
| Internal decision notes | `rejection_reason` (ambiguous) | **Reuse** as internal; clarify in UI copy later without changing writes in batch 1 |
| Applicant-facing explanation | No | **Reuse communication record** type `rejection_notice` (+ optional column denorm) |
| Reapplication allowed | No | **Add nullable** boolean **or** derive from category; prefer column if filterable |
| Rejected by | `review_events.actor_user_id` on reject | **Derive** from latest reject event |
| Rejected at | `risk_decided_at` / event `at` | **Derive** |
| Notification status | No | **Add nullable** `rejection_notification_status` **or** derive from latest `rejection_notice` delivery_status |

Draft reject (Stitch “Save as Draft”): **Defer** or store draft communication only — do **not** set `application_status=rejected` until Confirm.

---

## 7. Status model

| Need | Recommendation |
|------|----------------|
| Information requested | **`follow_up_status = awaiting_customer`** (exists) — **no** new `application_status` |
| Rejected | **`application_status = rejected`** (exists) |
| Reopened | **COMPLETE (071)** — POST reopen → `submitted` + review_event `reopen`; preserves rejection fields |
| Applicant responded | Prefer follow-up → `contacted` / clear awaiting + communication `applicant_response`; **no** new application_status |

Canonical application statuses remain: `submitted`, `duplicate_review`, `rejected`, `cancelled`, `closed`.

---

## 8. Email / notification status vocabulary

| Status | Meaning | When to use |
|--------|---------|-------------|
| `recorded` | Stored on ledger; no send attempted | Draft / internal-only / explicit record |
| `queued` | Accepted into outbox for later worker | Only if a real queue exists |
| `sending_unavailable` | Adapter reports no provider | **Default** for BlessBoard V5 today |
| `sent` | Provider **accepted** message for processing | **Only** with real adapter acceptance |
| `delivery_unknown` | Accepted by provider; no delivery events | After real send without webhooks |
| `failed` | Provider/adapter error | Real failure |

**Do not use `sent` for the current safe stub.**

---

## 9. Audit requirements

| Event | Mechanism |
|-------|-----------|
| Information request recorded | `review_events` + optional org audit if linked |
| Applicant-facing message created | Same; metadata: type, delivery_status, body_len — **not** full body |
| Internal note added | Existing contact pattern and/or communications |
| Rejection drafted | review_event only if draft feature ships |
| Application rejected | Existing reject review_event; consider platform audit when org exists (today often none) |
| Notification attempted / unavailable / failed | review_event or audit metadata from delivery_status |
| Rejected application reopened | New review_event `reopen` if feature ships |

Canonical message bodies live on the **communications** (or contact) row — not duplicated into generic audit JSON.

---

## 10. Permissions (platform_admin only for now)

| Action | Gate |
|--------|------|
| View communication history | Existing detail access (`platform_admin` + apex) |
| Add internal note | Same + CSRF POST |
| Request information | Same + CSRF POST |
| Reject application | Existing reject POST |
| Reopen application | Same if implemented |
| Retry notification | Same if implemented |

No fine-grained permission matrix in Prompt 8.

---

## 11. Stitch screen map (Prompt 8)

### Phase2 - 16 - Rejection Workspace - Desktop

| Field | Value |
|-------|--------|
| **Exact name** | Phase2 - 16 - Rejection Workspace - Desktop |
| **Stitch ID** | `b83ae131078e4e4d9b0ec5aa11614cbb` |
| **Route** | Prefer **EXTEND** detail `#reg-reject` **or** `GET …/:id/reject` NEW_VIEW later |
| **View** | Extend `registration-application-detail.ejs` first; optional `registration-application-reject.ejs` |
| **Reuse** | PA shell, status chips, CSRF forms, existing reject POST |
| **Backend data** | Application identity, current `rejection_reason`, category options, draft notice, notification status |
| **Writes** | Confirm reject (existing + extensions); draft notice (new); optional notify attempt |
| **Desktop** | Category + internal notes + applicant message + preview |
| **Mobile** | Stacked form (see mobile ID below) |
| **Empty/error** | Ineligible / already rejected / CSRF / validation |
| **Email limitation** | Preview allowed; send → `sending_unavailable` honesty |

### Phase2 - 16 - Rejection Workspace - Mobile

| Field | Value |
|-------|--------|
| **Exact name** | Phase2 - 16 - Rejection Workspace - Mobile |
| **Stitch ID** | `fe71b34e971f4952a061ba46c396bdc2` |
| **Route / view** | Same as desktop responsive |

### Phase2 - 17 - Communication Log - Desktop

| Field | Value |
|-------|--------|
| **Exact name** | Phase2 - 17 - Communication Log - Desktop |
| **Stitch ID** | `d9cf49daeacf48e480fa6749d3a2ac1f` |
| **Route** | Detail `#reg-communication` **or** `GET …/:id/communications` |
| **View** | New section/EJS under PA shell |
| **Reuse** | Contact history list patterns; empty-state partial |
| **Backend data** | Communications ledger (+ optional CRM contacts labeled separately) |
| **Writes** | Compose internal note / information request / general message |
| **Desktop** | Table + preview pane (simplify Stitch chrome) |
| **Mobile** | Card list |
| **Empty/error** | No messages yet; load failure |
| **Email limitation** | Status column shows honest `sending_unavailable` / `recorded`; omit fake “100% delivery” KPIs |

### Phase2 - 17 - Communication Log - Mobile

| Field | Value |
|-------|--------|
| **Exact name** | Phase2 - 17 - Communication Log - Mobile |
| **Stitch ID** | `d98993353b744820a708390b6340395b` |
| **Route / view** | Same responsive surface |

### Request Additional Information (capability — no Stitch screen ID)

Map to Communication Log compose (`information_request`) + `awaiting_customer`. Optional deep-link `#reg-request-info`.

---

## 12. Largest Stitch mismatch

**Stitch Rejection Workspace + Communication Log assume a full outbound messaging product** (templates, live email preview, SMTP delivery statuses, compose inbox, fake volume metrics).  

**BlessBoard today** has: a single ambiguous `rejection_reason`, CRM support contacts without delivery semantics, no applicant message ledger, no reopen, and a **safe email stub**.  

That gap — **applicant-facing messaging + honest delivery state** — is larger than layout polish and drives the migration recommendation.

---

## 13. Recommended implementation batches (≤8)

### Batch 1 — Communication / rejection storage

| Item | Detail |
|------|--------|
| **Scope** | Migration: communications ledger + nullable rejection category / notification status / reapplication_allowed; keep `rejection_reason` semantics unchanged |
| **Files** | `db/migrations/blessboard/039_….sql` (name TBD), repository methods |
| **Migration** | **Required** |
| **Routes** | None |
| **Services** | None (repo only) |
| **Exclusions** | UI, send, reopen, changing reject reason meaning |
| **Done when** | Tables/columns migrate; repo create/list tested on foundation DB |
| **Status** | **COMPLETE (062)** — `039_registration_application_communications.sql` + repository methods + storage tests |

### Batch 2 — Communication service

| Item | Detail |
|------|--------|
| **Scope** | `recordRegistrationCommunication`, list-by-application, delivery_status transitions for stub adapter |
| **Files** | New service under `src/blessboard/services/` |
| **Migration** | No |
| **Routes** | None |
| **Exclusions** | HTTP, EJS, auto email claims |
| **Done when** | Unit tests for types, visibility, stub statuses |
| **Status** | **COMPLETE (063)** — `registrationApplicationCommunicationService.js` (`addInternalNote`, `recordInformationRequest`, `recordApplicantMessage`, `getCommunicationHistory`); stubbed unit tests; no routes/UI/status changes |

### Batch 3 — Information-request POST route

| Item | Detail |
|------|--------|
| **Scope** | `POST …/:id/communications` or `…/request-information`; CSRF; platform_admin; set `awaiting_customer`; record `information_request` |
| **Files** | `platformAdminRoutes.js`, service |
| **Migration** | No (uses Batch 1) |
| **Exclusions** | Real SMTP; applicant portal; document upload |
| **Done when** | Route tests: CSRF, auth, unavailable send honesty |
| **Status** | **COMPLETE (064)** — `POST …/request-information`; follow-up via `updateApplicationSupportFollowUp`; review event `information_requested`; redirect `?notice=information_requested#reg-communications`; **no** `application_status` change |

### Batch 4 — Request-information UI

| Item | Detail |
|------|--------|
| **Scope** | Detail (or log) form: category, subject, message, deadline, internal note; flash notices |
| **Files** | Detail/communications EJS, `platform-admin.css` |
| **Exclusions** | Fake delivery KPIs; Stitch Moovex chrome |
| **Done when** | Desktop/mobile usable; rendering tests |
| **Status** | **COMPLETE (065)** — `#reg-communications` form on detail; CSRF; recipient prefill; channel default email; applicant vs internal separation; `platform-admin.css?v=47`; rendering tests |

### Batch 5 — Communication-history loader and UI

| Item | Detail |
|------|--------|
| **Scope** | Loader on detail GET; Stitch 17 list/cards; empty/error; separate CRM contacts label if shown |
| **Files** | Admin service loader, EJS section, CSS |
| **Exclusions** | Export log; fake metrics |
| **Done when** | History renders recorded messages with honest statuses |
| **Status** | **COMPLETE (066–067)** — loader + Communication Log UI (summary, cards, empty/unavailable, honest delivery). Rejection Workspace UI still deferred |

### Batch 6 — Rejection service and POST route

| Item | Detail |
|------|--------|
| **Scope** | Extend reject path: optional category, applicant message → `rejection_notice` row, notification_status via stub; **preserve** existing `rejection_reason` write; still no silent approve changes |
| **Files** | `rejectRegistrationApplication`, route body fields, repo |
| **Exclusions** | Redesigning approve/provision; claiming email sent |
| **Done when** | Service/HTTP tests for category + notice record + unavailable notify |
| **Status** | **COMPLETE (068–071)** — service + POST route + Rejection Workspace UI + controlled reopen. Real ESP deferred |


### Batch 7 — Rejection UI and completed state

| Item | Detail |
|------|--------|
| **Scope** | Stitch 16 workspace section: category, internal reason, applicant message, confirm; show completed rejected state + notification honesty |
| **Files** | Detail/reject EJS, CSS |
| **Exclusions** | Rich-text editor productization; draft-reject status theater unless Batch explicitly adds draft |
| **Done when** | Desktop/mobile parity acceptable; ineligible states clear |
| **Status** | **COMPLETE (070–071)** — `#reg-rejection`; confirmation checkbox; **Reject and record decision**; completed state; reopen form; `platform-admin.css?v=50`; rendering tests |

### Batch 8 — Tests and closure

| Item | Detail |
|------|--------|
| **Scope** | Migration/repo/route/UI/security tests; docs update (`005`/`006`/`008`); reopen **COMPLETE (071)** |
| **Files** | `tests/blessboard-registration-*`, phase2 docs |
| **Exclusions** | Prompt 9 provisioning screens; real ESP wiring |
| **Done when** | Focused suites pass on foundation Postgres; audit note PASS_WITH_GAPS for mailer |

**Optional later (not in 8):** real mail adapter; merge communications timeline with phone attempts; Prompt 18 provisioning.

---

## 14. Explicit non-goals (this audit)

- Runtime implementation  
- Changing current `rejection_reason` writes  
- Fine-grained RBAC  
- Real SMTP/ESP  
- Document upload for requested docs  
- Implementing Phase2 - 18 Environment Provisioning  
- Inventing Stitch “Request Additional Information” screen IDs that do not exist  

---

## 15. Related documents

- `PHASE2_003_REGISTRATION_FLOW_AUDIT.md` — reject IMPLEMENTED; communications PARTIAL  
- `PHASE2_004_DATA_MODEL_GAPS.md` — reuse support contacts guidance (superseded for mail history by this audit’s ledger recommendation)  
- `PHASE2_005_ROUTE_MAP.md` / `PHASE2_006_SCREEN_TO_CODE_MAP.md`  
- `PHASE2_060_COMPLETION_AUDIT.md` — Prompts 1–7 closed PASS_WITH_GAPS  

---

## Conclusion

Prompt 8 should implement **Rejection Workspace (16)** and **Communication Log (17)** against a **new append-only communications ledger**, reuse **`awaiting_customer`** for information requests, extend reject with **category + applicant notice + honest notification status**, and leave **`rejection_reason` unchanged** until an explicit internal/applicant split is product-approved. **Migration is required.** Email remains a **safe stub**. Reopen and Prompt 18 provisioning stay deferred unless explicitly scheduled.
