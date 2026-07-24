# PHASE2_043 — Duplicate Data and Normalization Audit

**Date:** 2026-07-24  
**Mode (audit):** Documentation only at creation  
**Normalization helpers status:** **COMPLETE** (Prompt 044, 2026-07-24) — `registrationDuplicateNormalization.js` + unit tests; no DB queries; no scoring; originals preserved.  
**Duplicate scoring status:** **COMPLETE** (Prompt 046) — `registrationDuplicateScoring.js` + `PHASE2_046_DUPLICATE_SCORING_RULES.md`.  
**Duplicate match storage status:** **COMPLETE** (Prompt 047, 2026-07-24) — `038_registration_duplicate_matches.sql` + repository replace/list/get/decision; JSONB evidence only; no routes/UI.  
**Duplicate match query service status:** **COMPLETE** (Prompt 048, 2026-07-24) — `registrationDuplicateMatchQueryService.js` with batched candidate loads, scoring, persistence, list/compare methods; no routes/UI.  
**Canonical risk service:** `src/blessboard/services/registrationRiskDecision.js`  
**Canonical phone normalizer:** `src/blessboard/services/normalizeRegistrationPhone.js`  
**Planned duplicate UI (PHASE2_005 / Batch 12–13, not implemented):**  
`GET /admin/registration-applications/:applicationId/duplicates` (+ compare)  
**Stitch screens:** Phase2 - 14 Duplicate Church Matches; Phase2 - 15 Duplicate Church Comparison

---

## Purpose

Inventory the **exact tables, fields, and normalization rules** already available for church-registration duplicate detection, so Batch 12 can list **exact-match signals** without inventing fuzzy scores, ESP data, or registration numbers that do not exist.

This audit does **not** implement duplicate matching.

---

## Executive summary

| Area | Status today |
|------|----------------|
| Pending-registration duplicates | **Strongest** — phone occupancy (E.164 + partial unique index); exact church name + city + country; prior rejection by email/phone; IP velocity |
| Platform users | Email uniqueness only (`blessboard.users.email_normalized`) — **not** ownership proof |
| Live organizations / churches | Keys + display/legal names exist; **no** city/country/phone on `platform.organizations`; risk does **not** query live orgs for name/phone |
| Domains | Hostname registry with DB normalization; **not** used in registration risk |
| Registration numbers | **None** on registration applications or org/church tables |
| Fuzzy / ML similarity | **None** — name “similar” is exact `lower(trim)` triple match only |

---

## 1. Exact tables and fields used (or usable) for duplicate checks

### 1.1 Pending / in-flight registrations (primary)

**Table:** `blessboard.platform_church_registration_applications`

| Field | Role in duplicate / risk |
|-------|--------------------------|
| `id` | Match identity; exclude self on re-check |
| `church_name` | Exact name match (with city/country) |
| `city` | Part of name triple |
| `country` | Part of name triple; calling-code mismatch vs phone |
| `contact_email` | User-email duplicate; prior rejection; soft idempotency; admin search |
| `contact_phone` | Display only |
| `contact_phone_normalized` | Phone occupancy + prior rejection + soft idempotency |
| `application_status` | Occupancy / prior-rejection filters (`submitted`, `duplicate_review`, `rejected`, …) |
| `provisioning_status` | Occupancy (`provisioning`, `provisioned`, `provisioning_failed`) |
| `organization_id` | Link to live org after provision |
| `risk_decision` | Snapshot: `allow` \| `review_required` \| `reject` |
| `risk_reason_codes` | Allowlisted codes (see §7) |
| `risk_decided_at` | When snapshot was written |
| `rejection_reason` | Admin/public reject text (length-capped) |
| `review_events` | JSONB admin action breadcrumb (not a match ledger) |
| `source_ip` | IP velocity only (public IPs) |
| `user_agent` | Stored; **not** used for risk scoring |
| `created_at` | Ordering / windows |

**Not present (cannot invent):** registration/application number, legal name, denomination, website URL, domain hostname, WhatsApp, verified flags on the application row.

**Related helpers (same table):**

| Function | File | Match |
|----------|------|--------|
| `findOccupyingPhoneMatch` | `registrationRiskDecision.js` | `contact_phone_normalized` + occupancy predicate |
| `findSimilarOrganizationMatch` | `registrationRiskDecision.js` | `lower(church_name/city/country)` + occupancy |
| `findPriorRejectedMatch` | `registrationRiskDecision.js` | `rejected` + email **or** phone |
| `countRecentApplicationsByIp` | `registrationRiskDecision.js` | `source_ip` window |
| `findActiveRegistrationByPhone` | `platformChurchRegistrationRepository.js` | Same occupancy as risk |
| `findRecentRegistrationDuplicate` | repository | Soft twin: same email + church name (15m) |
| `findRecentPhoneIdempotentDuplicate` | repository | Soft twin: same email + phone (15m) |

---

### 1.2 Platform organizations (live tenants)

**Table:** `platform.organizations`

| Field | Duplicate usefulness |
|-------|----------------------|
| `id` | Link / compare target |
| `organization_key` | Exact unique slug (immutable); reserved-key risk |
| `display_name` | Exact name candidate (**no** city/country columns) |
| `legal_name` | Optional exact name candidate |
| `status` | Filter active/inactive/retired |
| `data_environment` | Isolate demo/testing if product requires |

**Today:** registration risk does **not** query this table for name/phone duplicates. Admin list may `ILIKE` `organization_key` when searching applications.

---

### 1.3 BlessBoard churches

**Table:** `blessboard.churches`

| Field | Duplicate usefulness |
|-------|----------------------|
| `id` / `organization_id` | One church per org (`UNIQUE organization_id`) |
| `church_key` | Unique slug (usually equals org key at provision) |
| `display_name` / `legal_name` | Exact name candidates |
| `status` / `data_environment` | Scope filters |

**No** phone, email, city, country, or domain columns on this table.

---

### 1.4 Branches

**Table:** `blessboard.branches`

| Field | Duplicate usefulness |
|-------|----------------------|
| `church_id`, `branch_key` | Unique per church |
| `display_name` | User-facing |
| `display_name_normalized` | Generated: `lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'))` |
| `country_code` | Optional ISO-2 on branch — **not** registration city/country |

Uniqueness of branch names is **within church only** (migration 029). Not a cross-tenant church-registration duplicate signal.

---

### 1.5 Domains

**Table:** `platform.domains`

| Field | Duplicate usefulness |
|-------|----------------------|
| `hostname` | Globally unique after normalization |
| `organization_id` | Tenant link (nullable) |
| `domain_type` | `canonical` \| `custom` \| `alias` \| `apex` |
| `status` | active/inactive/retired |
| `verified_at` | Hostname verification timestamp (routing), **not** applicant email ownership |

**Today:** not consulted by `evaluateRegistrationRisk`. Registration applications do not store a requested hostname/website URL.

---

### 1.6 Users (platform login identity)

**Table:** `blessboard.users`

| Field | Duplicate usefulness |
|-------|----------------------|
| `email_normalized` | **Global unique**; risk `duplicate_email` via `findUserByEmail` |
| `email_display` | Display |
| `status` | active/inactive/suspended/invited |

Does **not** prove applicant email ownership (that is token verification — Prompt 041–042). Does **not** store phone.

---

### 1.7 Church settings / contact channels (weak / optional later)

| Table | Fields | Notes |
|-------|--------|-------|
| `blessboard.church_settings` | `public_name`, `primary_email`, `primary_phone` | Free-text phone/email; **not** E.164-normalized; **not** populated from public registration contact today (028 header) |
| `blessboard.contact_channels` | `channel_type`, `value` | Free-text website content; no duplicate indexes |

Unsafe to treat as reliable cross-tenant duplicate sources without new normalization + product policy.

---

### 1.8 Out of scope for church-registration duplicates (same product, different problem)

| Table | Why |
|-------|-----|
| `blessboard.members` / `member_registrations` | Church-scoped member identity; own email/phone uniqueness per `church_id` |
| `blessboard.user_invitations` | Invite tokens; email_normalized scoped to invite flow |
| `blessboard.registration_email_verification_tokens` | Ownership tokens for an **application**, not org identity matching |
| `blessboard.registration_phone_verification_attempts` | Call evidence; not org duplicate matching |

---

## 2. Phone normalization

| Item | Detail |
|------|--------|
| **Canonical helper** | `normalizeRegistrationPhone(phone, country)` in `normalizeRegistrationPhone.js` |
| **Stored column** | `platform_church_registration_applications.contact_phone_normalized` |
| **Display column** | `contact_phone` (as submitted, trimmed) |
| **Format** | E.164: `^\+[1-9]\d{6,14}$` (JS `PHONE_E164_RE`; DB check length 8–16) |
| **Rules** | Strip non-digits except leading `+`; `00…` → `+…`; national numbers require known country calling code; leading `0` stripped from national; unknown country without `+` → reject |
| **Calling codes** | Modest map in `COUNTRY_CALLING_CODES` (ISO-2 + English names) — not exhaustive; diaspora mismatch → review, not reject |
| **Occupancy predicate** | `application_status IN ('submitted','duplicate_review') OR provisioning_status IN ('provisioning','provisioned','provisioning_failed')` |
| **Soft idempotency** | Same email + same normalized phone within window is **not** `duplicate_phone` |
| **DB enforcement** | Partial unique index `platform_church_reg_apps_phone_normalized_active_uidx` (migration 028) |
| **Not checked** | Users, orgs, churches, church_settings, members |

---

## 3. Email normalization

| Context | Normalization | Storage / uniqueness |
|---------|---------------|----------------------|
| Public registration | `validateEmail` → `trim` + `toLowerCase` + regex | `contact_email` (lowercased value); **no** unique constraint across apps |
| Platform users | `normalizeEmail` in `createBlessBoardUser.js` → `trim` + `toLowerCase`; DB trigger re-applies | `users.email_normalized` **UNIQUE** |
| Risk duplicate | `lower(trim(contact_email))` then `authRepo.findUserByEmail` | Against **users only** |
| Soft twin | `lower(contact_email)` + church name / phone | Short time window |
| Email verify tokens | `normalizeEmail` → `email_normalized` on token rows | Per application token ledger |

**Gaps:** no pending-application email uniqueness; no org/church/branch contact scan; no plus-alias or Gmail-dot canonicalization beyond lower/trim.

---

## 4. Church-name normalization

| Context | What happens |
|---------|----------------|
| Registration storage | Trim + length only (`church_name` 1–200); **case preserved** |
| Risk “similar organization” | `lower(trim(church_name))` + `lower(trim(city))` + `lower(trim(country))` — **exact** equality |
| Soft twin | `lower(church_name)` with same email |
| Branch names (different problem) | `normalizeBranchDisplayName`: trim, collapse whitespace, lower; punctuation kept |
| Org/church display names | Stored as entered; **no** generated normalized column for org/church display_name |

**Explicit product rule today:** name similarity alone never auto-rejects; exact triple match → `similar_organization` → **review_required**. Fuzzy/Levenshtein/phonetic matching is **not** implemented.

---

## 5. Domain normalization

| Item | Detail |
|------|--------|
| **Table** | `platform.domains.hostname` |
| **Trigger** | `platform.normalize_domain_hostname()` — reject protocol/path/port/whitespace; `lower(btrim)`; strip trailing dots |
| **Constraints** | No `://`, `/`, `:`, whitespace, trailing `.`; hostname regex; **UNIQUE(hostname)** |
| **Registration link** | **None** — applications do not store domain/URL |
| **Risk** | Unused |

For Batch 12, domain matches are only viable if product later captures a requested hostname or compares against an applicant-supplied website field (does not exist today).

---

## 6. Registration-number support

| Question | Finding |
|----------|---------|
| Application / case number on registration row? | **No** |
| Legal / company / PACRA / tax ID on org or church? | **No** |
| Stitch “application number” | Aspirational / absent (PHASE2_003 / 004) |
| Safe Phase2 behavior | Do **not** invent registration numbers; omit from match UI or show “not collected” |

---

## 7. Current risk-decision data

### Stored snapshot (migration 031)

| Column | Values / shape |
|--------|----------------|
| `risk_decision` | `allow` \| `review_required` \| `reject` \| NULL |
| `risk_reason_codes` | `TEXT[]` allowlisted codes (empty when allow) |
| `risk_decided_at` | timestamptz |
| `rejection_reason` | optional text ≤ 500 |
| `review_events` | JSONB array of admin actions (not match decisions) |

### Allowlisted reason codes (`RISK_REASON_CODES`)

| Code | Typical decision | Duplicate-related? |
|------|------------------|--------------------|
| `duplicate_phone` | **reject** | Yes — occupying phone |
| `duplicate_email` | **review** | Yes — existing platform user |
| `similar_organization` | **review** | Yes — exact name+city+country |
| `prior_rejection` | **review** | Yes — prior rejected email/phone |
| `reserved_organization_key` | **reject** | Key collision / reserved |
| `country_phone_mismatch` | **review** | Weak signal |
| `ip_velocity` / `ip_velocity_blocked` | review / reject | Abuse, not org identity |
| `honeypot` / `invalid_input` / `admin_rejected` | reject | Non-duplicate |

### Live re-check vs snapshot

Verification facts may re-run phone/name/email lookups on detail load. Snapshot codes remain evidence of **what was decided at submit**. Do not invent new codes in UI without extending the allowlist.

---

## 8. Privacy limits

| Concern | Current practice / limit |
|---------|--------------------------|
| **Who can see PII** | Platform Admin apex (`requireApex` + `requirePlatformAdmin`); no field-level ACL (PHASE2_007) |
| **source_ip** | Stored; used for velocity; private/RFC1918 IPs ignored for scoring; detail UI historically unmapped / mask recommended (PHASE2_013) |
| **user_agent** | Stored; **not** scored; do not dump full UA in duplicate UI |
| **Passwords / tokens** | Never in risk or duplicate payloads; registration trace log forbids emails/phones/tokens |
| **Provisioning errors** | Sanitized before admin display |
| **Public reject messages** | Generic; duplicate phone may use dedicated public phone message |
| **Member / org contact dumps** | Out of scope — do not join members into registration duplicate lists without an explicit privacy prompt |
| **Demo/testing orgs** | Prefer filtering `data_environment` when matching live orgs so pilot data does not pollute production review |
| **Audit** | Prefer allowlisted reason codes + application ids; avoid logging full match payloads with unnecessary PII |

**Duplicate UI recommendation:** show match **type**, application/org id, church name, city/country, and masked email/phone patterns only as needed; never expose password hashes, tokens, or raw SQL errors.

---

## 9. Useful indexes (existing)

| Index | Table | Supports |
|-------|-------|----------|
| `platform_church_reg_apps_phone_normalized_active_uidx` | applications | Occupying phone uniqueness |
| `platform_church_reg_apps_phone_normalized_idx` | applications | Phone lookups |
| `platform_church_reg_apps_email_created_idx` | applications | `(lower(contact_email), created_at DESC)` |
| `platform_church_reg_apps_application_status_created_idx` | applications | Status queues |
| `platform_church_reg_apps_provisioning_status_created_idx` | applications | Provisioning filters |
| `platform_church_reg_apps_risk_decision_created_idx` | applications | Risk queues |
| `platform_church_reg_apps_source_ip_created_idx` | applications | IP velocity |
| `platform_church_reg_apps_organization_id_idx` | applications | Linked apps |
| `users_email_normalized_unique` | users | Email identity |
| `organizations_organization_key_unique` | organizations | Key exact match |
| `domains_hostname_unique` | domains | Hostname exact match |
| `churches_church_key_unique` / `churches_organization_id_unique` | churches | Key / 1:1 org |
| `branches_church_display_name_normalized_live_uidx` | branches | Within-church name only |

**Missing for Batch 12 (optional later, not required for derive-only):**

- Expression index on `(lower(church_name), lower(city), lower(country))` for faster exact triple scans  
- Normalized org/church display_name column + index if live-org exact name matching is added  
- Pending-app email uniqueness index **only if** product requires it (would change registration behavior)

---

## 10. Signal matrix (what Batch 12 can honestly list)

| Signal key | Source | Strength | Already computed? |
|------------|--------|----------|-------------------|
| `exact_phone_occupying_application` | apps.`contact_phone_normalized` | Strong | Yes (`findOccupyingPhoneMatch`) |
| `exact_name_city_country_application` | apps name triple | Medium (uncertain duplicate) | Yes (`findSimilarOrganizationMatch`) |
| `platform_user_email` | users.`email_normalized` | Medium (account collision, not ownership) | Yes (`findUserByEmail`) |
| `prior_rejected_email_or_phone` | rejected apps | Medium | Yes (`findPriorRejectedMatch`) |
| `reserved_or_taken_organization_key` | org key + reserved list | Strong for key | Partial (reserved + provision uniqueness) |
| `exact_organization_key` | `platform.organizations` | Strong | Lookup by key exists; not in risk name path |
| `exact_org_or_church_display_name` | org/church display/legal | Weak–medium (no geo) | **Not** in risk today |
| `exact_domain_hostname` | `platform.domains` | Strong if URL captured | Unused; no applicant hostname field |
| `registration_number` | — | — | **Unavailable** |
| Fuzzy name score | — | — | **Do not invent** |

---

## 11. Gaps vs Stitch Batch 12 expectations

| Stitch / plan expectation | Reality |
|---------------------------|---------|
| List of potential matches with reasons | **Missing UI/route**; helpers exist for several reasons |
| Compare workspace + decisions | **Missing**; no match child table |
| Website domain check | Domain table exists; registration has no domain field |
| Registration number | **Not collected** |
| Live org phone match | No reliable normalized org phone |
| Fuzzy “similar church” | Exact triple only |

---

## Smallest implementation recommendation

### Goal

One derive-only batch that powers a future duplicates list from **normalization helpers + exact-match signals** — no fuzzy ML, no new ESP, no fake registration numbers, no approval-gate changes.

### A. Normalization helpers — **COMPLETE** (Prompt 044)

Shipped: `src/blessboard/services/registrationDuplicateNormalization.js` (pure; no DB; no scoring).

| Helper | Behavior |
|--------|----------|
| Phone | Wraps `normalizeRegistrationPhone` → E.164; preserves original; `normalized: null` if unusable |
| Email | Wraps `normalizeEmail` + format check; preserves original |
| Church name | Trim, collapse whitespace, lower; **no** NFKD / punctuation strip; preserves original |
| Name triple | `normalizeChurchNameCityCountryForDuplicate` → `{ original, normalized, key }` |
| Website domain | Hostname extract from URL/host; lower/trim/trailing dots; optional `www.` strip on compare key; aligns with `platform.domains` spirit |
| Registration number | Compact upper alphanumerics + limited separators; **does not invent** values when absent; ready if a column is added later |
| Address | Safe city/country (+ optional line/postal) exact keys only; no geocoding |

Tests: `tests/blessboard-registration-duplicate-normalization.test.js`.

### B. Exact-match signal finder (read-only service)

Smallest service (e.g. `listRegistrationDuplicateExactMatches(applicationId)`):

1. Load the subject application (exclude self).  
2. Emit zero or more matches with `{ signal, strength, targetType, targetId, explanation }` using **only**:
   - occupying phone applications  
   - exact name+city+country applications (occupancy scope aligned with risk)  
   - platform user email hit (target = user id; explain “platform account”, not ownership)  
   - prior rejected application by email or phone  
   - optional: exact `organization_key` / reserved key if present on subject  
   - optional later: exact `lower(trim(display_name))` on `platform.organizations` / `blessboard.churches` with `data_environment` filter — **label as name-only, no city**  
3. Cap results; order by strength then recency.  
4. Never invent scores, domains, or registration numbers.

Reuse `findOccupyingPhoneMatch`, `findSimilarOrganizationMatch`, `findPriorRejectedMatch`, `findUserByEmail` — prefer returning **lists** (LIMIT N) instead of LIMIT 1 for the UI batch.

### C. Explicit non-goals for that batch

- No fuzzy similarity  
- No writes / match-decision table  
- No routes/EJS unless a follow-on prompt  
- No changes to approve/reject gates  
- No querying members or raw `contact_channels` as “proof”

### D. Done when

Unit tests prove: same phone → phone signal; same name+city+country → name signal; existing user email → email signal; missing registration number → omitted; no false “domain match” without hostname data.

---

## Explicit non-goals of this audit

- No migrations at audit time  
- No duplicate routes or EJS (still deferred after 044)  
- No fuzzy matching design beyond stating it is out of scope  
- No approval-checklist or verification-fact changes  

**Follow-on (044):** normalization helpers implemented.  
**Follow-on (046):** deterministic scoring implemented (`registrationDuplicateScoring.js`, `PHASE2_046_DUPLICATE_SCORING_RULES.md`).  
**Follow-on (047):** normalized match ledger `blessboard.registration_duplicate_matches` + repository methods.  
**Follow-on (048):** query service `runDuplicateCheck` / `listDuplicateMatches` / `getDuplicateComparison`.  
**Follow-on (049–053):** routes, matches UI, comparison UI, decision POST + form.  
**Follow-on (054):** verification facts + recommendation + checklist consume canonical matches/decisions (`church_name_exact_match`, `strong_duplicate_identifier`, `duplicate_review_evidence`, `risk_decision_present`); name alone → warning; strong identifiers → failed/warning; `different_church` completes review while preserving evidence; `confirmed_duplicate` / `impersonation_concern` → high-risk; **no** auto approve/reject.

### Match storage (047)

| Item | Detail |
|------|--------|
| **Table** | `blessboard.registration_duplicate_matches` |
| **Normalized columns** | `application_id`, `matched_record_type`, `matched_record_id`, `score`, `risk_level`, `review_decision`, `review_reason`, `reviewed_by_user_id`, `reviewed_at`, `created_at`, `updated_at` |
| **JSONB only** | `evidence_snapshot` (object) |
| **Record types** | `application`, `organization`, `user`, `church`, `branch`, `domain` |
| **Decisions** | `different_church`, `link_existing_church`, `additional_branch_request`, `clarification_required`, `senior_review`, `impersonation_concern`, `confirmed_duplicate` |
| **Repo** | `replaceRegistrationDuplicateMatches`, `listRegistrationDuplicateMatches`, `getRegistrationDuplicateMatchById`, `recordRegistrationDuplicateMatchDecision` |

### Query service (048)

| Method | Behavior |
|--------|----------|
| `runDuplicateCheck` | Batched candidate load → score → persist → ordered matches |
| `listDuplicateMatches` | Read ledger + batched safe summaries |
| `getDuplicateComparison` | Subject vs one candidate (no unrelated user PII) |

Candidate scopes: occupying/rejected applications; production/pilot orgs & churches by name; branches by `display_name_normalized`; domains by hostname; platform user by email (id/status only in responses). Subject application always excluded. Ordering: risk → score desc → matched record id.

---

## Related documents

- `PHASE2_003_REGISTRATION_FLOW_AUDIT.md` — end-to-end registration + duplicate PARTIAL  
- `PHASE2_005_ROUTE_MAP.md` — planned duplicates / compare routes  
- `PHASE2_006_SCREEN_TO_CODE_MAP.md` — Stitch 14 status through query service  
- `PHASE2_008_IMPLEMENTATION_PLAN.md` — Batch 12–13  
- `PHASE2_015_VERIFICATION_FACTS_GAP_AUDIT.md` — fact honesty for phone/email uniqueness; duplicate evidence wired in Prompt 054  
- `PHASE2_019_RECOMMENDATION_RULES.md` — advisory recommendation consumes strong-identifier + match decisions (054)  
- `PHASE2_022_APPROVAL_CHECKLIST_RULES.md` — duplicate checklist item from canonical decisions (054)  
- `PHASE2_046_DUPLICATE_SCORING_RULES.md` — scoring levels and signal weights  
