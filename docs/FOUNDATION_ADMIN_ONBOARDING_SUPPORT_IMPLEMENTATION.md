# Foundation Admin Onboarding & Support Implementation (Phase 6)

**Date:** 2026-07-19  
**Canonical tenants:** `/admin/organizations`  
**Canonical registration queue:** `/admin/registration-applications` (unchanged)

---

## 1. Checklist data sources

| Key | Source table(s) | Fields / rule | Derived/stored | Admin override of boolean? |
|-----|-----------------|---------------|----------------|----------------------------|
| `organization_details` | `platform.organizations`, `blessboard.churches` | Non-empty org + church `display_name` | Derived | No |
| `first_branch` | `blessboard.branches` | ≥1 row with `status='active'` for the church | Derived | No |
| `contact_details` | `church_settings`, `branch_settings` | Email/phone on church settings, or email/phone/address on any branch settings | Derived | No |
| `service_times` | `page_sections` (+ `public_pages`) | Section key/type in `service_times`/`services`/`worship_times` with heading or body | Derived | No |
| `logo` | _(none in V5)_ | No dedicated branding/logo field; never inferred from generic `media_assets` | Derived (always incomplete until schema exists) | No |
| `preview` | `organization_onboarding` | `preview_acknowledged` | Stored | Via future portal; not inventing routes here |
| `publish` | `public_pages` | ≥1 row with `status='published'` | Derived | No |

Unavailable optional content remains **incomplete**, not an error. Suspended org/church does not erase checklist progress.

---

## 2. Summary-service design

**File:** `src/blessboard/services/organizationOnboardingSummaryService.js`

**Facts loader:** `platformChurchRegistrationRepository.loadOrganizationOnboardingFacts` (single query, no N+1).

Returns: onboarding/follow-up/support fields, derived checklist, `completedCount` / `totalCount` / `percentage` (query-time only), publication aggregate, last activity, linked application id.

Used by:

- `/admin/organizations/:organizationKey`
- `/admin/registration-applications/:id` (compact checklist when linked)

---

## 3. Organization-detail changes

Existing route only. New section `#pa-org-onboarding`:

- Status, derived progress, checklist, publication, support assignee, follow-up, support-requested, contact timestamps, next follow-up, linked application, recent contacts
- CSRF forms: follow-up, assign support, support-requested, next follow-up, onboarding status override

Non-BlessBoard organizations (no church row) omit the section.

---

## 4. Filters

Same route `/admin/organizations` query allowlist:

| Param | Values |
|-------|--------|
| `product` | `blessboard` |
| `onboarding` | `incomplete` |
| `follow_up` | follow-up enum |
| `support_requested` | `true` |
| `publication` | `unpublished` |
| `plan` | `free` / `growth` / `network` |
| `q` / `page` / `limit` | existing |

Applications are never listed here.

---

## 5. Follow-up scheduling

`POST /admin/organizations/:organizationKey/next-follow-up`

- Stores/clears `organization_onboarding.next_follow_up_at`
- Future datetime required when setting
- Audits old/new; no reminders/email
- Does not change follow-up status unless a separate form is submitted
- Overdue values highlighted in UI

---

## 6. Support-request behavior

`POST …/support-requested` toggles `support_requested`.

- Does not gate access or auto-change follow-up
- Audited
- Church-facing submission deferred to Phase 8

---

## 7. Publication summary

Derived only: `unpublished` | `partially_published` | `published` from draft/published page counts. Operational suspension shown separately.

---

## 8. Last activity

1. Max `users.last_login_at` among active `church_hq_admin` / `branch_admin` on the org  
2. Else `organization_onboarding.last_activity_at`  

No new activity column; no public-page visits.

---

## 9. Audit behavior

| Action | `action_key` |
|--------|----------------|
| Support requested | `onboarding.support_requested_updated` |
| Next follow-up | `onboarding.next_follow_up_updated` |
| Follow-up status | `onboarding.follow_up_status_updated` |
| Support assignment | `onboarding.support_assigned` |
| Onboarding override | `onboarding.status_overridden` |

No checklist-read audits. Contact note text never copied into audit metadata.

---

## 10. Security

Platform-admin + apex only; CSRF on POSTs; org resolved by `organization_key`; assignee must be active `platform_admin`; escaped notes; no passwords/tokens; controlled errors; no suspension/impersonation controls here.

---

## 11. Tests

`tests/blessboard-admin-onboarding-support.test.js` — summary, detail, filters, actions, canonical-list boundary.

---

## 12. Manual verification

Pending deployment. Use only the disposable Free church from Phase 4 verification. Do not mutate live production onboarding rows.

---

## 13. Deferred portal work

| Phase | Work |
|-------|------|
| **7** | `/portal/:organizationKey`, `/c/:organizationKey`, preview acknowledgement path |
| **8** | Church-facing support request submission |
| Later | Provisioning retry UI, dashboard metric cards, dedicated logo field |

---

## 14. Scope confirmation

- `/admin/organizations` remains canonical  
- No `/admin/churches`  
- No second onboarding/support queue or note store  
- Public registration, provisioning, portal/public church routes, dashboard cards, migrations, payments, domains, V4 untouched  
- Runtime DDL remains disabled; `GETPRO_DATABASE_URL` remains disabled  
