# PHASE2_033 — Email Verification Architecture Audit

**Date:** 2026-07-24  
**Mode (audit):** Documentation only at creation  
**Token-storage implementation status:** **COMPLETE** (Prompt 034, 2026-07-24) — migration `037_registration_email_verification_tokens.sql` + repository methods + `registrationEmailVerificationService` (create/consume/status; hash-only; 24h expiry; 60s resend cooldown).

**Message builder status:** **COMPLETE** (Prompt 037) — `registrationEmailVerificationMessage.js` builds recipient/subject/plain-text/HTML/verification URL for approved path `/register/email-verification/:token`. No send, persist, or token logging.

**Delivery adapter status:** **SAFE STUB** (Prompt 038) — audit confirmed **no** nodemailer/SES/SendGrid/Postmark/Resend/Mailgun dependency. `sendRegistrationVerificationEmail` uses the 037 builder + unavailable adapter: `accepted_for_processing: false`, does not claim delivery, does not log plaintext tokens, does not add a third-party provider.

**Admin resend route status:** **COMPLETE** (Prompt 039) — `POST /admin/registration-applications/:id/email-verification/resend` with `requireApex` + `requirePlatformAdmin` + CSRF; application id from route; administrator id from session; `createVerificationToken` + message builder + sender; cooldown enforced; redirects to `?notice=email_verification_sent#reg-email-verification` on accepted delivery, or safe errors (`cooldown`, `invalid_email`, `email_sending_unavailable`, `email_verification_failed`). Never exposes plaintext token in HTML/redirects/logs. Does **not** change approval state.

**Resend UI status:** **COMPLETE** (Prompt 040) — detail `#reg-email-verification` form posts to the 039 route with CSRF only; visible recipient; 60-second cooldown guidance; omitted when email missing; no token / hidden admin id / hidden application id; no change-email or manual-verify controls; no delivery claims; allowlisted flash notices only.

**Public verify route status:** **COMPLETE** (Prompt 041) — `GET /register/email-verification/:token` (apex only, no auth, rate-limited) consumes once via `consumeVerificationToken`, then `303` to tokenless `/register/email-verification/result`. Generic invalid page for invalid/expired/replaced/already-used. No admin redirect, no raw errors, no token logging, no approval changes.

**Ownership → verification facts status:** **COMPLETE** (Prompt 042) — `applicant_email_verified` mapped from canonical email status (`verified`→passed; `sent`/`not_sent`/`replaced`→not_checked; `expired`/`unavailable`→warning); uniqueness separate; detail loader phone → email → facts → recommendation → checklist; token status loaded once; recommendation/checklist consume corrected fact only; **approval gate unchanged**.

**Production limitation (exact):** Outbound transactional email is **not configured** in BlessBoard V5. Admin resend creates a hash-only token, builds a message, then the unavailable adapter returns `accepted_for_processing: false` → redirect `error=email_sending_unavailable`. Operators must not treat token `sent` status as ESP-delivered, and must not invent Delivered/Bounced/Opened without a real provider event pipeline.
**Canonical detail route (today):** `GET /admin/registration-applications/:id`  
**Planned email workspace (PHASE2_005, not implemented):** `GET /admin/registration-applications/:applicationId/email-verification`  
**Stitch screens:** Phase2 - 13 Email Verification (Desktop / Mobile)  
**Stitch project:** `projects/17124191473876947591`  
**Desktop screen ID:** `ce16f55cab184ff6825ef682438afbbb`  
**Mobile screen ID:** `931394ae5b4848b7a96043b896d23ea2`

---

## Purpose

Determine the smallest secure architecture needed to support **ownership verification** of the registration applicant’s email address (`contact_email`).

This audit does **not** implement email verification.

---

## Current email flow (inspected)

### 1. Where `contact_email` is stored

| Item | Finding |
|------|---------|
| **Table** | `blessboard.platform_church_registration_applications` |
| **Column** | `contact_email TEXT NOT NULL` (length 3–254) |
| **Migration** | `db/migrations/blessboard/026_create_platform_church_registration_applications.sql` |
| **Index** | `platform_church_reg_apps_email_created_idx` on `(lower(contact_email), created_at DESC)` |
| **Write path** | `platformChurchRegistrationRepository.insertApplicationRow` / `createApplication` / `createApplicationIdempotent` |
| **Post-submit UPDATE** | **None found** — applicant email is immutable after insert today |

### 2. Current email normalization

| Path | File | Behavior |
|------|------|----------|
| Registration | `src/blessboard/services/platformChurchRegistrationValidation.js` → `validateEmail` | `trim` + `.toLowerCase()`; regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| Platform users | `src/blessboard/services/createBlessBoardUser.js` → `normalizeEmail` | `trim` + `.toLowerCase()`; stricter `EMAIL_RE` `/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/` |
| DB users | `db/migrations/blessboard/004_create_users.sql` trigger `blessboard.normalize_user_email` | Enforces `lower(trim(email_normalized))` |

**Gap:** registration validation is looser than platform-user validation. An address can pass registration and later fail invite/user-create checks. Future verification should normalize to the **user-grade** rule before issuing tokens.

### 3. Existing duplicate-email checks

| Mechanism | File / function | Scope |
|-----------|-----------------|-------|
| Risk code `duplicate_email` | `registrationRiskDecision.evaluateRegistrationRisk` via `authRepo.findUserByEmail` | Platform **users** only → review, not hard reject |
| Provision block | `provisionRegisteredBlessBoardChurch` → `STATUS.DUPLICATE_EMAIL_REVIEW` | Blocks provision when email already a user (unless invite path) |
| Verification fact | `registrationVerificationFacts` → `email_unique_platform_users_only` | Live lookup or risk snapshot; limited scope |
| Soft idempotency | `findRecentRegistrationDuplicate` | Recent same email (+ church/phone) — not uniqueness |

**Not present:** unique constraint on application `contact_email`; first-class uniqueness across all pending applications.

**Critical separation:** duplicate-email / uniqueness ≠ ownership verification.

### 4. Existing registration email messages

| Function | File | Behavior |
|----------|------|----------|
| `maybeSendRegistrationAcknowledgementEmail` | `platformChurchRegistrationService.js` | **Stub** — returns `{ sent: false, reason: "registration_email_not_configured" }`; never throws |

No other registration transactional emails found. Staff invite is **copy-once raw token in admin UI**, not emailed.

### 5. Existing user-account email verification

| Finding | Detail |
|---------|--------|
| `blessboard.users` | Has `email_normalized` / `email_display` — **no** `email_verified` / `verified_at` |
| Fact `applicant_email_verified` | `unsupported: true` in `registrationVerificationFacts.js` |
| Checklist item | Always `not_available` today (`PHASE2_022`) |

### 6–7. Secure-token / password-reset / invitation patterns

| Component | Exact files | Purpose | Pattern |
|-----------|-------------|---------|---------|
| Session token helpers | `src/platform/session/sessionToken.js` | Generate + hash tokens | `crypto.randomBytes(32)` → base64url; **SHA-256 hex** stored; `timingSafeEqualHex` |
| Deployment sessions | `createV5Session.js`; `db/migrations/platform/010_create_deployment_sessions.sql` | Login sessions | Hash-only; TTL 12h |
| Staff invitations | `inviteBlessBoardStaff.js`; `userInvitationRepository.js`; `032_create_user_invitations.sql` | Staff invite accept | Hash-only; unique `token_hash` (64 hex); TTL **7 days**; statuses pending/accepted/revoked/expired; one-time accept |
| Auth transfers | `authTransferService.js`; `011_create_auth_transfers.sql` | Tenant login transfer | Same helpers; TTL **5 min**; `consumed_at` one-time |
| Ops password reset | `resetBlessBoardUserPassword.js` | Direct password set | **Not** emailed token reset |
| Church password-reset requests | `passwordResetRateLimitService.js` + request repos | Manual ticket + rate limits | **Not** emailed one-time tokens |

**No** registration email-verification / magic-link token exists today.

### 8. Email provider and sending service

| Finding | Detail |
|---------|--------|
| Node dependencies | **No** nodemailer, SES SDK, SendGrid, Postmark, Resend, or Mailgun in BlessBoard V5 path |
| Product note | Invite UI states email delivery is not available yet |
| Hosted mailbox decision | `docs/product/NETWORK_MAILBOX_SERVICE_DECISION.md` — deferred; provider choice **UNCONFIRMED** |

**Status:** outbound transactional email is **absent** (stub only). Prompt 038 ships `sendRegistrationVerificationEmail` with an unavailable adapter (`accepted_for_processing: false`); it does **not** claim delivery.

### 9–10. Delivery-status / bounce-status support

**None** for registration or platform-user auth mail.

Church notification “deliveries” are quota/test records without SMTP — **not** bounce or ESP webhook tracking.

**Implication:** Stitch “Delivered / opened / clicked / bounce metrics” are **aspirational / provider-dependent**. Do **not** invent delivery tracking without a real ESP event pipeline.

### 11. Existing email-event or audit storage

| Store | Purpose | Fit for email verification |
|-------|---------|----------------------------|
| Application `review_events` JSONB | Operator approve/reject/risk trail | Partial — high-level admin actions only |
| `recordBlessBoardAudit` / org audit events | General platform audit | Partial — when org linked |
| Phone verification attempts table (`036`) | Append-only phone evidence | **Best shape** to mirror for email token/events |
| Church notification deliveries | Broadcast/test | No |

### 12. Current registration approval behavior involving email

| Behavior | Detail |
|----------|--------|
| Required | Non-empty `contact_email` for approve/provision (`administrator_email_required`) |
| Collision | Existing platform user → `duplicate_email_review` path |
| Ownership | **Not required** — approve may proceed without email verified |
| Checklist | `applicant_email_verified` = `not_available`; advisory only; **not** an approval gate |

### 13. Current applicant-email change behavior

| Finding | Detail |
|---------|--------|
| Admin route | **None** (PHASE2_005 plans `POST …/email-verification/change-email`) |
| Repository UPDATE | **None** for `contact_email` after insert |
| Conclusion | Applicant email is **immutable after submit** in current code |

---

## Reusable components matrix

| Component | Exact file(s) | Current purpose | Suitable for registration email verification | Security limitations | Recommended reuse |
|-----------|---------------|-----------------|----------------------------------------------|----------------------|-------------------|
| `maybeSendRegistrationAcknowledgementEmail` | `platformChurchRegistrationService.js` | Post-submit acknowledgement hook (stub) | **partial** | No send, no token, no send audit | Keep as **send boundary** once a mailer exists; do **not** treat acknowledgement as ownership proof |
| `validateEmail` / `normalizeEmail` | validation + `createBlessBoardUser.js` | Normalize/validate | **partial** | Two regexes diverge | Unify to **user-grade** normalize before tokens; store normalized email on token rows |
| `findUserByEmail` + `duplicate_email` risk | `blessBoardAuthRepository.js`, `registrationRiskDecision.js` | Collision / review | **no** (uniqueness ≠ ownership) | Does not prove inbox control | Keep as separate uniqueness fact only |
| Invite token stack | `inviteBlessBoardStaff.js`, `userInvitationRepository.js`, `032_*.sql` | Staff invite, hash-only, TTL, one-time | **yes** (best token **pattern**) | Org/church scoped; 7d TTL long for email verify; no mailer | Reuse `generateSessionToken` / `hashSessionToken` / status machine; **new table** bound to application + email |
| Session / auth-transfer helpers | `sessionToken.js`, `authTransferService.js` | Session + short-lived transfer | **partial** | Different purpose | Reuse crypto primitives only; new purpose-specific table |
| Phone verification ledger | `036_*.sql`, `registrationPhoneVerificationService.js` | Operator call evidence | **partial** | Manual PA evidence, not email crypto | Mirror **append-only event / summary** discipline for email send/verify/manual actions |
| `applicant_email_verified` fact + checklist | `registrationVerificationFacts.js`, `registrationApprovalChecklist.js` | Unsupported placeholders | **yes** (presentation hooks) | Must not invent `passed` | Wire later from real verification status |
| `review_events` JSONB | registration repository | Admin action audit | **partial** | Not a dedicated mail ledger | Optional breadcrumb; prefer dedicated verification table for tokens |
| Church password-reset rate limit | `passwordResetRateLimitService.js` | Reset-request throttles | **partial** | Different product domain | Pattern inspiration for resend throttles only |
| Outbound mailer / templates | — | Missing | **no** | N/A | Greenfield later; provider **UNCONFIRMED** |
| `resetBlessBoardUserPassword` | ops CLI | Direct password set | **no** | Privileged; not inbox proof | Do not reuse |
| CSRF | apex/admin shells | Form CSRF | **no** | Not ownership proof | Keep separate |

---

## Verification meaning (non-interchangeable)

| Concept | Meaning | Proven today? |
|---------|---------|---------------|
| **Email present** | Application has non-empty `contact_email` | **Yes** |
| **Email syntactically valid** | Passes allowlisted normalize/validate rules | **Partial** (registration regex looser than users) |
| **Email unique** | Not colliding in a defined scope (today: platform users) | **Partial** (users only) |
| **Verification message sent** | System accepted a send request and recorded a send attempt | **No** |
| **Message delivered** | ESP reports accepted/delivered to mailbox provider | **No** (no ESP) |
| **Verification link opened** | Public verify route received a valid token presentation | **No** |
| **Email ownership verified** | Applicant proved control of the inbox (token consume while email still current) | **No** |
| **Token expired** | Token past `expires_at` without successful verify | **N/A** (no tokens) |
| **Email replaced** | Administrator (or policy) changed applicant email; prior tokens invalidated | **N/A** (no change path) |
| **Manually verified** | Platform admin recorded an override with reason — **not** cryptographic ownership | **No** |
| **Message bounced** | ESP bounce/complaint event for a send | **No** |

Do **not** treat uniqueness, acknowledgement stubs, invite copy-once tokens, or admin notes as ownership verification.

---

## Token architecture options

Design must support:

- Application ID  
- Email address being verified (normalized)  
- Secure random token (raw only in email / one-time display)  
- **Stored token hash, never plaintext**  
- Sent / expiry / verified / invalidated timestamps  
- Resend count or event history  
- Created-by source (`system` | `platform_admin` | later `applicant`)  
- Optional manual-verification evidence (reason, admin id, timestamp) — preferably as status + audit, not a fake token  

### Option A — Token fields on the application row

| Criterion | Assessment |
|-----------|------------|
| **Security** | Weak for multi-resend; tempt to overwrite plaintext; hard to retain history |
| **Multiple resends** | Poor — single column set |
| **Token invalidation** | Overwrite only |
| **Email replacement** | Awkward dual columns |
| **Auditability** | Weak |
| **Queryability** | Limited |
| **Migration complexity** | Low |
| **Compatibility** | Tempting but fights phone-attempt precedent |

### Option B — JSONB verification metadata on the application

| Criterion | Assessment |
|-----------|------------|
| **Security** | Risk of accidental plaintext in JSON; harder constraints |
| **Multiple resends** | Possible but unstructured |
| **Token invalidation** | Soft / error-prone |
| **Email replacement** | Possible |
| **Auditability** | Weak vs typed rows |
| **Queryability** | Poor |
| **Migration complexity** | Low |
| **Compatibility** | Conflicts with allowlisted JSONB discipline elsewhere |

### Option C — One normalized registration email-verification table

| Criterion | Assessment |
|-----------|------------|
| **Security** | Strong — hash-only rows; append/invalidate |
| **Multiple resends** | Strong — one row per send attempt |
| **Token invalidation** | Strong — status + timestamps |
| **Email replacement** | Strong — invalidate by application + old email |
| **Auditability** | Strong |
| **Queryability** | Strong |
| **Migration complexity** | Moderate (one table + indexes) |
| **Compatibility** | Aligns with invite table + phone attempt ledger patterns |

### Option D — Reuse an existing secure token table

| Candidate | Fit |
|-----------|-----|
| `blessboard.user_invitations` | **No** — requires `organization_id` / `church_id`; staff roles; different lifecycle |
| `platform.auth_transfers` | **No** — tenant login transfer purpose |
| `platform.deployment_sessions` | **No** — session auth |

Reuse **crypto helpers** from D; do **not** overload those tables.

### Recommendation

**Recommend exactly one option: C — create one normalized registration email-verification table.**

Working name (implementation-time):  
`blessboard.registration_email_verification_tokens`  
(or `…_attempts` if product prefers event-ledger naming analogous to phone).

Suggested core columns (design only):

| Column | Notes |
|--------|-------|
| `id` | UUID PK |
| `application_id` | FK → registration applications |
| `email_normalized` | Verified address at send time |
| `email_display` | Optional display form |
| `token_hash` | SHA-256 hex (64), unique |
| `status` | Canonical state (below) |
| `sent_at` | When send recorded |
| `expires_at` | Absolute expiry |
| `verified_at` | When ownership proven |
| `invalidated_at` | Replaced / revoked / superseded |
| `created_by_source` | `system` / `platform_admin` / … |
| `created_by_user_id` | Nullable admin id |
| `resend_of_token_id` | Optional link to prior row |
| `manual_reason` | Nullable; only for manual override rows **or** keep manual on application rollup + audit only |

Optional application rollup columns (later, not required for first storage batch):  
`email_verification_status`, `email_verified_at` — denormalized for fast facts UI.

Do **not** store plaintext tokens in DB, admin pages, logs, or audit metadata.

---

## Recommended verification states

Canonical server-side states:

| State | Meaning |
|-------|---------|
| `not_sent` | No verification token/send recorded for current email |
| `sent` | Active token issued; awaiting ownership proof |
| `verified` | Ownership proven via token consume for current email |
| `expired` | Latest relevant token expired without verify |
| `replaced` | Email changed or prior tokens invalidated for a newer address/send |
| `manually_verified` | Admin override with reason — **administrative**, not cryptographic ownership |

**Do not include `delivered` or `bounced` as first-class states** until an ESP supplies reliable webhooks. If/when added later, store as **send-event attributes**, not as substitutes for `verified`.

Stitch “opened/clicked” maps to **public verify route hit** (token presentation), which should update toward `verified` on success — not a separate durable marketing state unless product later requires it.

---

## Token and expiry rules

| Rule | Recommendation |
|------|----------------|
| **Entropy / generator** | Reuse `generateSessionToken()` from `sessionToken.js` (`crypto.randomBytes(32)` → base64url) |
| **Hashing** | Reuse `hashSessionToken()` — SHA-256 hex, length 64 |
| **Comparison** | Hash submitted raw token; lookup by hash; use `timingSafeEqualHex` only if comparing hashes in memory |
| **Expiry** | **24 hours** absolute from `sent_at` (shorter than staff invite 7d; longer than auth-transfer 5m). Product may tune — mark alternate TTLs **UNCONFIRMED** |
| **One-time use** | Successful verify → mark row `verified`, set `verified_at`; reject reuse |
| **Resend throttling** | Min interval **60 seconds** per application; daily cap **UNCONFIRMED** (suggest ≤10/day/application) |
| **Maximum active tokens** | At most **one** `sent` (active) token per application+email; issuing a new one invalidates prior active rows (`replaced` / `invalidated_at`) |
| **Previous-token invalidation** | On resend, email change, verify success of newer token, approve/provision policy (below) |
| **Email change** | Invalidate all active tokens for application; set status `not_sent` for new email; optionally auto-send |
| **After approve/provision** | Prefer **invalidate outstanding tokens**; do not silently rewrite a provisioned user’s email. Further email changes on provisioned orgs are out of registration-verify scope |
| **Plaintext prohibition** | Never log raw token; never put raw token in `review_events` / audit JSON; never show on admin UI |

---

## Public verification route

| Field | Recommendation |
|-------|----------------|
| **Method** | `GET` (link-friendly) with optional confirming `POST` later if CSRF-hardening desired |
| **Path** | `/register/email-verification/:token` |
| **Host** | Apex BlessBoard host only |
| **Auth** | **Not required** (ownership proof is the token) |
| **Rate limiting** | Per-IP limiter on verify path (express-rate-limit; same public pattern as registration forms) |
| **Token lookup** | Hash raw path token → find row by `token_hash` |
| **Expiry check** | Reject if `now > expires_at` or status `expired` |
| **One-time-use** | Reject if already `verified` / `replaced` / `invalidated` |
| **Cross-application** | Token row binds `application_id`; no client-supplied application id trusted |
| **Success** | Mark verified; redirect to tokenless result page (“Email verified. You may close this window.”) |
| **Invalid** | Generic failure page — **no** enumeration of whether token existed (covers invalid/expired/replaced/already-used) |
| **Redirect** | `303` → `/register/email-verification/result?outcome=…` — **no** Platform Admin redirect; token never kept in links |
| **Status** | **COMPLETE** (Prompt 041) |

Do **not** invent ESP delivery states from this route.

---

## Admin routes (design only)

Align with PHASE2_005 / PHASE2_007 logical permissions. Today all gate on `platform_admin`.

### GET workspace (optional UI later)

| Field | Value |
|-------|--------|
| **Path** | `GET /admin/registration-applications/:id/email-verification` |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | `platform_admin` (logical `pa.registration.view`) |
| **Service** | Present status + send history (no plaintext tokens) |
| **View** | New EJS or detail `#reg-email-verification` section |

### Resend verification email

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/email-verification/resend` |
| **Middleware** | Apex + platform admin |
| **Permission** | Logical `pa.registration.email_resend` (today: `platform_admin`) |
| **CSRF** | Required |
| **Validation** | Application exists; email present; throttle (60s cooldown) |
| **Service** | `resendRegistrationVerificationEmail` — invalidate prior active token → create hash row → build message → call send adapter |
| **Audit** | Deferred (must never include raw token when added) |
| **Redirect** | 303 → `/admin/registration-applications/:id?notice=email_verification_sent#reg-email-verification` on accepted delivery |
| **Safe errors** | `cooldown`, `invalid_email`, `email_sending_unavailable`, `email_verification_failed` (+ `csrf` / `not_found`) |
| **Status** | **COMPLETE** (Prompt 039) for route + orchestration; real SMTP still unavailable |

**BACKEND_BLOCKED** for real send until a mailer exists; resend currently records a token then returns `email_sending_unavailable` via the Prompt 038 stub.

### Change applicant email

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/email-verification/change-email` |
| **Middleware** | Apex + platform admin |
| **Permission** | Logical `pa.registration.email_change` |
| **CSRF** | Required |
| **Validation** | Format + user-grade normalize; uniqueness scopes currently supported (platform users; document pending-app scope as future) |
| **Service** | Dedicated update only — invalidate old tokens; update `contact_email`; mark unverified; optional auto-resend |
| **Audit** | `registration.applicant_email_changed` with old/new normalized emails (no tokens) |
| **Redirect** | Detail/email workspace with notice |
| **Provisioned apps** | **Refuse silent change** of already-provisioned user email — require explicit out-of-band user/admin flow |

### Manual verification

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/email-verification/manual-verify` |
| **Middleware** | Apex + platform admin |
| **Permission** | Logical `pa.registration.email_manual_verify` (highest sensitivity among email actions) |
| **CSRF** | Required |
| **Validation** | Confirm checkbox + **required reason**; application eligible |
| **Service** | Set `manually_verified` + timestamp + admin id; **do not** invent a token consume event |
| **Audit** | `registration.email_manually_verified` |
| **Redirect** | Detail/email workspace |

**Meaning:** Manual verification is an **administrative override**, not cryptographic proof of inbox ownership. UI and facts must say so.

---

## Change-email safe behavior

When an administrator changes the applicant email:

1. Validate and normalize (user-grade rules).  
2. Check current supported uniqueness scopes (platform users today; pending-app uniqueness **UNCONFIRMED** / future).  
3. Invalidate active tokens for the old email.  
4. Update the application **only** through a dedicated service method.  
5. Mark the new email unverified (`not_sent` / clear `email_verified_at`).  
6. Send a new verification message when a mailer exists and policy allows.  
7. Audit old and new values safely (normalized emails only).  
8. Never silently change an already provisioned user’s login email.

**Deferral:** Change-email + resend + public verify belong **after** the storage/token batch. They are **not** part of Prompts 1–7 completion criteria. Treat as Batch 11 follow-on prompts (storage first, then routes/mailer/UI).

---

## Manual verification — include now?

**Recommend: support later in admin UI, after storage exists — but not in the first token-storage batch.**

Justification:

- Stitch explicitly includes “Mark Manually Verified”.  
- Operators may confirm ownership via phone/out-of-band channels.  
- Must remain clearly labeled as **override**, with reason + admin identity + timestamp + audit.  
- Must **not** create a fake token-verified event.

First implementation batch should still allow a **status enum** that includes `manually_verified` so later routes do not need a second migration — without shipping the route yet.

---

## Email message (reuse guidance only)

| Item | Finding |
|------|---------|
| Existing BlessBoard mail templates | **None** found |
| Closest hook | `maybeSendRegistrationAcknowledgementEmail` stub |
| Closest token UX | Staff invite copy-once (not emailed) |

Minimum verification email content (when mailer exists):

- Church or application name  
- Clear verification action (button/link)  
- Expiry information  
- Security notice (ignore if unexpected)  
- Support contact  
- **No** password  
- **No** sensitive application details beyond what is needed to recognize the request  

**Prompt 037:** pure builder `registrationEmailVerificationMessage.js` implements the above for path `/register/email-verification/:token` (HTML escaped; no send/persist/log).

---

## Rate limiting and abuse

| Threat | Control |
|--------|---------|
| Repeated resend | Per-application cooldown + daily cap; CSRF; platform_admin only |
| Token guessing | 256-bit entropy; hash-at-rest; generic errors; per-IP verify rate limit |
| Email enumeration | Public verify responses must not reveal whether an email/application exists beyond the token outcome |
| Repeated invalid submits | Shared IP rate limit; optional progressive delay |
| Cross-application use | Token row binds `application_id`; ignore client application ids |
| Reuse expired/verified | Status checks; one-time consume; invalidate on supersede |

---

## Future audit events

| Event key (suggested) | When | Payload must exclude |
|-----------------------|------|----------------------|
| `registration.email_verification_sent` | First send | Raw token |
| `registration.email_verification_resent` | Resend | Raw token |
| `registration.email_verified_by_token` | Public consume success | Raw token |
| `registration.email_verification_token_expired` | Expiry transition (lazy or job) | Raw token |
| `registration.email_verification_token_replaced` | Invalidate on resend/change | Raw token |
| `registration.applicant_email_changed` | Admin change | Raw token |
| `registration.email_manually_verified` | Manual override | Raw token |

Prefer application `review_events` breadcrumb **plus** platform audit when `organization_id` exists (same pattern as contacts / phone). Exact persistence target **UNCONFIRMED** until audit wiring prompt.

---

## Verification-fact integration (Prompt 042 — COMPLETE)

| Fact / surface | Behavior |
|----------------|----------|
| `applicant_email_verified` | **Supported**; `passed` only when status is `verified`; `not_checked` for `sent` / `not_sent` / `replaced`; `warning` for `expired` / `unavailable` |
| `email_unique_platform_users_only` | **Unchanged purpose** — uniqueness only; never set from ownership verify |
| Advisory recommendation | Consumes updated ownership fact; no longer treats email ownership as unsupported |
| Approval checklist `applicant_email_verified` | `complete` / `incomplete` / `warning` from fact — **still not an approval gate** |

Detail loader order: phone verification → email verification → facts → recommendation → checklist. Email token status is not reloaded inside facts.

---

## Stitch comparison — Phase2 - 13 Email Verification

| Field | Desktop | Mobile |
|-------|---------|--------|
| **Exact name** | Phase2 - 13 - Email Verification - Desktop | Phase2 - 13 - Email Verification - Mobile |
| **Stitch ID** | `ce16f55cab184ff6825ef682438afbbb` | `931394ae5b4848b7a96043b896d23ea2` |
| **Purpose** | Email verification status, resend, change email, manual verify | Same |
| **Main sections** | Current email/status; delivery event history; policy notice | Same (stacked) |
| **Main actions** | Mark Manually Verified; Resend Verification Email; Change Email | Same |
| **States (Stitch)** | Delivered / opened / clicked; never validated; bounce metrics (aspirational) | Same |
| **Responsive** | History table | History → cards |

| Category | Fields / behaviors |
|----------|-------------------|
| **Supportable now (read-only honesty)** | Current `contact_email`; “not verified”; uniqueness warning from existing facts; policy notice that ownership is unverified |
| **Requires proposed model** | Verification status (`not_sent`/`sent`/`verified`/…); resend history; token lifecycle; manual verify evidence; change-email |
| **Provider-dependent** | Delivered, bounce metrics, ESP open tracking |
| **Unsupported without mailer** | Actual resend delivery; acknowledgement/verification email content |
| **Desktop behavior** | Table-style event history; side actions |
| **Mobile behavior** | Card stack history; same actions |
| **Actions expected later** | Resend; Change Email; Mark Manually Verified; (public link verify outside admin) |

Live Stitch pixel inspection via MCP was **UNCONFIRMED** this session (tool fetch failed); field list relies on `PHASE2_002_STITCH_SCREEN_INVENTORY.md`.

---

## Permission notes (PHASE2_007)

Today every Platform Admin who can open `/admin` can perform all registration actions. Logical keys for future fine-grained auth:

- `pa.registration.email_resend`  
- `pa.registration.email_change`  
- `pa.registration.email_manual_verify`  

Until roles split, mitigate with CSRF, confirmations, rate limits, and audit — not silent UI.

---

## Recommended next implementation

**Status — token storage COMPLETE (Prompt 034, 2026-07-24)**

Shipped:

1. Migration `db/migrations/blessboard/037_registration_email_verification_tokens.sql`
2. Repository methods on `platformChurchRegistrationRepository.js`
3. Pure service `src/blessboard/services/registrationEmailVerificationService.js` (`createVerificationToken`, `consumeVerificationToken`, `getVerificationStatus`)
4. Stub service tests + Postgres-gated storage tests

**Status — message builder COMPLETE (Prompt 037)**

5. `src/blessboard/services/registrationEmailVerificationMessage.js` — pure builder for approved public URL `/register/email-verification/:token`

**Status — delivery adapter SAFE STUB (Prompt 038)**

6. `src/blessboard/services/registrationEmailVerificationDelivery.js` — `sendRegistrationVerificationEmail` + unavailable adapter (`accepted_for_processing: false`; no token logging; no third-party provider)

**Status — admin resend COMPLETE (Prompt 039)**

7. `POST /admin/registration-applications/:id/email-verification/resend` in `platformAdminRoutes.js`
8. `resendRegistrationVerificationEmail` orchestration (token → message → sender; no approval mutation; no plaintext token in redirects/logs)

**Status — resend UI COMPLETE (Prompt 040)**

9. Detail `#reg-email-verification` resend form (CSRF; visible recipient; cooldown guidance; omit if email missing; no change-email/manual-verify)

**Status — public verify COMPLETE (Prompt 041)**

10. `GET /register/email-verification/:token` in `apexMarketingRoutes.js` (apex only; no auth; rate-limited; `consumeVerificationToken`)
11. Tokenless result page `apex/email-verification-result.ejs` via `/register/email-verification/result`
12. Generic invalid outcome for invalid/expired/replaced/already-used; no admin redirect; no approval mutation; token never logged or kept in page links

**Status — ownership facts COMPLETE (Prompt 042)**

13. `applicant_email_verified` in `registrationVerificationFacts.js` from canonical `emailVerification` status
14. Detail loader passes `emailVerification` once into facts; recommendation + checklist consume the corrected fact
15. Email uniqueness remains separate; approval eligibility / approve routes unchanged

**Exact production limitation:** There is still **no** real outbound mail adapter in BlessBoard V5. Admin resend records a hash token and returns `error=email_sending_unavailable` — it does **not** deliver mail and must not be reported as Delivered/Bounced/Opened. Public verify can still consume a token when a link is presented out-of-band. Ownership facts treat `sent` as not verified.

**Next smallest batch after 042:** change-email / manual-verify **or** real SMTP/ESP adapter (still **BACKEND_BLOCKED** for real delivery until a mailer exists).

### Still excluded until later prompts

- Dedicated admin email-verification workspace (Stitch 13 shell)
- Real email sending / third-party mailer integration
- Approval-gate changes
- Applicant email change / manual verify routes
- Fake delivery/bounce timelines

---

## Explicit non-goals of this audit

- No runtime code changes  
- No migrations applied  
- No routes  
- No EJS/CSS  
- No email sending  
- No token creation in production  
- No applicant-email changes  
- No manual verification  
- No approval-gate changes  
- No V4 changes  
- No additional documents beyond this file  
