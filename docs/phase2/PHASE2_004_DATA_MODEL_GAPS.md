# PHASE2_004 — Data Model Gap Audit

**Date:** 2026-07-23  
**Mode:** Documentation only — **no migrations created**  
**Primary table:** `blessboard.platform_church_registration_applications`  
**Related:** `blessboard.organization_onboarding`, `blessboard.organization_support_contacts`, JSONB `review_events`, `network_validation_checklist`

### Recommendation legend

Derive from existing data · Add nullable column · Add JSONB metadata · Add normalized child table · Reuse audit log · Reuse support contacts · Defer · Exclude

---

## Gap matrix

| Capability | Current support | Gap | Recommendation |
|------------|-----------------|-----|----------------|
| **Application number** | UUID `id` only | No human `#APP-…` | **Derive from existing data** (formatted short id) for UI; add nullable `application_number` only if uniqueness/search required |
| **Church legal name** | Single `church_name` | No legal vs public split | **Add nullable column** `church_legal_name` (or **Derive**: treat `church_name` as public until collected) |
| **Church public name** | `church_name` | Acts as both | **Derive from existing data** (`church_name` = public) |
| **Denomination** | Absent | Missing | **Add nullable column** `denomination` **or** **Defer** if not collected on public form yet |
| **Registration number** | Absent (Tax ID / RC) | Missing | **Defer** until public form collects it; then nullable column |
| **Applicant details** | `contact_name`, `role_in_church` | No structured applicant vs admin | **Derive** contact as applicant; add nullable proposed-admin columns when form expands |
| **Applicant phone** | `contact_phone`, `contact_phone_normalized` | Present | **Derive from existing data** |
| **Applicant WhatsApp** | Absent | Missing | **Add nullable column** `contact_whatsapp` **or** **Derive** same as phone if product treats them equal |
| **Applicant email** | `contact_email` | Present | **Derive from existing data** |
| **Proposed administrator** | Same as contact for instant path; no separate fields | Missing dedicated admin identity | **Add nullable columns** (`proposed_admin_name`, `proposed_admin_email`) **or** **Derive** contact as admin for Foundation/Growth |
| **Address and location** | `city`, `country` only | No street/postal | **Add nullable columns** or **JSONB metadata** `address` when form expands; **Defer** street until collected |
| **Requested plan** | `selected_plan` | Present | **Derive from existing data** |
| **Requested URL key** | Not stored on application row; collected on instant submit for provision | Partial — may live only in provision input | **Add nullable column** `requested_organization_key` for review visibility |
| **Documents** | Absent | No file linkage | **Add normalized child table** `registration_application_documents` (or reuse `media_assets` with FK) — **Defer** until upload product exists |
| **Consent and authority declarations** | `consent_terms` boolean | No authority letter / declaration text | **Add JSONB metadata** `consent_declarations` for additional flags; keep `consent_terms` |
| **Email verification** | Absent | No status/timestamps/tokens | **Add nullable columns** (`email_verified_at`, `email_verification_status`) + token store **or** **Defer** if Phase2 is admin-manual-only first |
| **Phone verification** | Absent (uniqueness only) | No verified flag | **Add nullable columns** (`phone_verified_at`, `phone_verification_status`) |
| **Call attempts** | Support contacts with `contact_method='phone'` | No dedicated attempt schema | **Reuse support contacts** (extend outcomes if needed) |
| **Duplicate results** | Risk codes + `duplicate_review` status | No persisted match rows | **Add JSONB metadata** `duplicate_check_results` for snapshot **or** **Add normalized child table** if decisions must be durable/queryable |
| **Duplicate review decisions** | Link-organization + reject only | No per-match decision | **Add JSONB** / child table `duplicate_review_decisions`; link action already exists |
| **Reviewer assignment** | `assigned_support_user_id` | Present | **Derive from existing data** |
| **Notes** | `review_notes` + support contacts `internal_note` | Present but coarse | **Reuse support contacts** for threaded notes; keep `review_notes` for summary |
| **Communications** | `organization_support_contacts` | Present | **Reuse support contacts** |
| **Overrides** | Absent as first-class | Missing | **Add JSONB metadata** into `review_events` (**Reuse audit log**) with allowlisted override codes |
| **Approval checklist** | `network_validation_checklist` JSONB (Network-oriented) | Not general Phase2 checklist | **Extend JSONB** `approval_checklist` (or generalize network column) — prefer **Add JSONB metadata** |
| **Recommendation** | `risk_decision` + reason codes | Present as risk, not “recommendation” UX | **Derive from existing data** (`risk_decision`) |
| **Audit events** | `review_events` JSONB + platform audit when org linked | Present | **Reuse audit log** (`review_events` + `auditEventService`) |

---

## Migration history (registration-relevant)

| Migration | Contribution |
|-----------|--------------|
| `026_create_platform_church_registration_applications.sql` | Base table |
| `027_foundation_schema_and_status.sql` | Status axes, org link, onboarding, support contacts |
| `028_registration_contact_phone_normalized.sql` | Phone normalize + uniqueness |
| `030_registration_application_support_contact.sql` | App-level support flags / follow-up |
| `031_registration_risk_review.sql` | Risk + `review_events` |
| `033_registration_support_follow_up_ops.sql` | Assignee, contact dates, app-scoped contacts |
| `034_network_validation_follow_up_statuses.sql` | Validation statuses + checklist JSONB |

---

## Suggested sequencing (no migrations in this audit)

1. **UI-only / derive:** application display number, public name, plan, risk recommendation, reviewer, notes/comms via existing tables.  
2. **Small nullable columns** when forms collect data: org key, WhatsApp, legal name, email/phone verified_at.  
3. **JSONB** for checklist, duplicate snapshot, overrides, consent extras.  
4. **Child tables** only for documents and durable duplicate matches.  
5. **Exclude:** Stitch AI confidence scores, fabricated SMTP geolocation telemetry.

---

## Runtime change confirmation

No migrations or runtime code were created or modified.
