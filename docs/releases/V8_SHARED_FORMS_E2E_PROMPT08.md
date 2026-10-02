# V8 PROMPT 08 — Public forms and submission review (SH08–SH15)

**Branch:** `V8` only  
**Verdict:** `V8_SHARED_FORMS_END_TO_END_CODE_PASS`  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 07 (`V8_SHARED_FORM_BUILDER_CODE_PASS`)  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014  
**Hosts:** Code + local automated tests only (no deploy / no migration apply / no real notifications)

## Flows

1. **Public:** Ready form (SH08) → validation errors (SH09) → submit → confirmation (SH10)
2. **Admin:** Submissions list (SH11) → detail (SH12) → review / status change (SH13)
3. **Platform admin:** Cross-tenant overview (SH14); access denied (SH15)

## Implementation

| Area | Detail |
|------|--------|
| Migration (additive, not applied overnight) | `db/migrations/platform/040_shared_form_submission_review.sql` — review statuses, internal notes, idempotency, consent, branch/facility scope, rate-limit buckets |
| Public submit | Consent required by default; server-side schema validation; durable insert; idempotent retries via `idempotency_key`; IP-hashed rate limiting + express limiter; safe error copy |
| Review | Statuses `submitted → in_review → accepted\|rejected → closed` with enforced transitions; restricted internal notes (manage-only) |
| Isolation | Organization + product; optional branch/facility filters; cross-tenant denied for tenant admins |
| Platform | `/admin/forms` — `platform_admin` only (SH14) |
| Exclusions | No clinical-record collection; no real notifications |

### Stitch map (SH08–SH15)

| Screen | Desktop / Mobile IDs | View |
|--------|----------------------|------|
| SH08 Ready | `68c27d62…` / `e56e8d43…` | `public-form.ejs` |
| SH09 Validation | `c78a75e9…` / `95eaf5ae…` | `public-form.ejs` (error state) |
| SH10 Confirm | `334db8f3…` / `172093f0…` | `public-thanks.ejs` |
| SH11 List | `a3e586e9…` / `adda161a…` | `submissions.ejs` |
| SH12 Detail | `c70e79e6…` / `efea6ef9…` | `submission-detail.ejs` |
| SH13 Review | `a51f34cd…` / `5cee2be6…` | `submission-detail.ejs` (manage) |
| SH14 Platform | `f943c5f0…` / `81084beb…` | `platform-overview.ejs` |
| SH15 Denied | `63988d9e…` / `df0a248d…` | `access-denied.ejs` |

## Tests

- `tests/v8-shared-forms-e2e.test.js` — consent, invalid data, idempotency, review transitions, notes restriction, tenant isolation, platform RBAC, rate limit, AC HTTP flow, V7 schema compat
- `tests/v8-shared-form-builder.test.js` — Prompt 07 regression (consent wired)

## Non-goals

- Applying migrations 039/040 on hosted testing DB
- Email/SMS notifications of submissions
- Clinical intake categories

## Preserve V7

Shared `formSchema` re-export unchanged for BlessBoard member forms; new review tables are additive under `platform.*`.
