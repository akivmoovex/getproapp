# Foundation Admin Registration Applications Implementation (Phase 5)

**Date:** 2026-07-19  
**Canonical queue:** `/admin/registration-applications`  
**Canonical tenants:** `/admin/organizations` (unchanged)

---

## 1. Route inventory

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/registration-applications` | Paginated list + filters |
| GET | `/admin/registration-applications/:id` | Detail + follow-up UI |
| POST | `/admin/registration-applications/:id/follow-up-status` | Update onboarding follow-up |
| POST | `/admin/registration-applications/:id/assign-support` | Assign/unassign platform admin |
| POST | `/admin/registration-applications/:id/contact` | Append support contact note |

All routes: apex host + `platform_admin` + `Cache-Control: no-store`.

---

## 2. Repository methods

Extended **same** repository: `platformChurchRegistrationRepository.js`

Added:

- `listRegistrationApplications` / `countRegistrationApplications`
- `getRegistrationApplicationById`
- `updateOrganizationOnboarding`
- `ensureOrganizationOnboardingRow`
- `createOrganizationSupportContact` / `listOrganizationSupportContacts`
- `listActivePlatformAdministrators`
- `getOrganizationPublicationSummary` / `getOrganizationCurrentPlanKey`
- `findApplicationIdForOrganization` / `findApplicationIdForOrganizationKey`

Service: `registrationApplicationsAdminService.js`

---

## 3. List page

View: `views/blessboard/v5/platform-admin/registration-applications.ejs`

Desktop table + mobile cards. Columns: church, contact, plan, submitted, application/provisioning status, linked org, follow-up, support.

---

## 4. Filters and search

Allowlisted:

- `application_status`, `provisioning_status`, `follow_up_status`
- `linked` = all | linked | unlinked
- `from` / `to` (YYYY-MM-DD)
- `q` search across church name, contact name, email, phone, organization key
- pagination `page` / `limit`

Invalid date filters → 400. Unknown status values ignored (fall back to all).

---

## 5. Detail page

View: `registration-application-detail.ejs`

Sections: registration info, lifecycle (incl. sanitized failure), linked organization, follow-up actions, contact history, compact registration audit.

Application status editing is **read-only** in Foundation (preferred Phase 5 choice).

---

## 6. Linked organization behavior

When `organization_id` is set:

- Link to `/admin/organizations/:organizationKey`
- Show plan, onboarding, publication draft/published counts
- Organization detail shows a small “Registration application” backlink when linked

---

## 7. Follow-up status updates

POST updates `blessboard.organization_onboarding.follow_up_status` only when the application is **provisioned** and linked.

- Does not change application status, provisioning status, or organization status
- Creates onboarding row if missing for a provisioned org
- Audits `registration.follow_up_status_updated` with `from_status` / `to_status`

Unprovisioned applications: UI explains follow-up is unavailable; POST returns `?error=not_provisioned`.

---

## 8. Support assignment

POST assigns `assigned_support_user_id` only to users with active `platform_admin` role.

- Empty value unassigns
- Non-platform-admin IDs rejected
- Audits `registration.support_assigned`

---

## 9. Contact history

Append-only `organization_support_contacts` rows:

- Allowlisted method + outcome
- Note length 1–2000
- `created_by_user_id` from session (never from body)
- Updates first/last contacted timestamps
- Optional explicit follow-up status on the same form
- Audit `registration.support_contact_added` **without** note text

Guidance copy forbids pastoral/member/confidential notes.

---

## 10. Audit behavior

Uses `recordAuditEventSafe` / `listOrganizationAuditEvents` with category `registration`. Metadata allowlist only.

---

## 11. Navigation

One item near Organizations: **Registration Applications** (`/admin/registration-applications`).

Desktop sidebar + mobile drawer (same `navItems`). No “Churches”, no separate Onboarding/Follow-up nav. No badge count.

---

## 12. Dashboard boundary

**None.** No new dashboard cards or queue summaries.

---

## 13. Security

- Platform-admin only
- CSRF on every POST
- Parameterized SQL; allowlisted filters/sort/statuses
- Notes escaped via EJS `<%= %>`
- Provisioning errors sanitized before display
- No passwords, no retry button, no impersonation

---

## 14. Tests

`tests/blessboard-admin-registration-applications.test.js`

Covers auth, list/detail, filters, follow-up, assignment, contacts, nav/canonical org boundary.

---

## 15. Deployment

1. Deploy code (no migration).
2. Restart.
3. Sign in as V5 platform admin.
4. Open `/admin/registration-applications`.
5. Confirm existing applications appear read-only for live rows; use disposable fixtures for write smoke.

---

## 16. Manual verification

Pending deployment. Do not mutate the three existing live applications during automated tests. Disposable contact notes only on test orgs.

---

## 17. Deferred work

| Phase | Work |
|-------|------|
| **6** | (as planned) further admin polish / onboarding tooling |
| **7** | `/portal/:organizationKey`, `/c/:organizationKey` |
| Later | Provisioning retry UI, dashboard metric cards |

---

## 18. Scope confirmation

- `/admin/organizations` remains canonical tenant list
- No `/admin/churches`
- No second application repository
- Public `/register-church` and orchestrator unchanged
- No retry, portal, public church route, dashboard cards, migration, payment, or V4 changes
