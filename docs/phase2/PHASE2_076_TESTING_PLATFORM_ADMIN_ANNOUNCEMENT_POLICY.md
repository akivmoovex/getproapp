# PHASE2_076 — Testing-only Platform Admin announcement publishing

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 announcement admin write policy for Platform Admin  
**Constraint:** Production permissions must not be widened

---

## Policy

Central helper: `src/blessboard/services/announcementProductPolicy.js` → `resolveAnnouncementProductPolicy(env)`.

| Gate | Rule |
|------|------|
| Allow Platform Admin publish | `DEPLOYMENT_ENV=testing` **or** existing `BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH=1` |
| Not used alone | `NODE_ENV` |
| Not used | Query params, cookies, form fields |

`evaluateAnnouncementCapability(..., "publish")` continues to require `allowPlatformAdminPublish` for `platform_admin`. HQ / branch_admin paths unchanged.

Routes obtain policy once via `resolveAnnouncementProductPolicy(env)` in `announcementAdminRoutes.js` (HQ + branch-admin mounts).

---

## Routes covered

| Action | Path pattern |
|--------|----------------|
| List / inspect | `GET /hq/announcements`, `GET /branch-admin/announcements`, detail |
| Create | `GET|POST …/announcements/new` / `POST …/announcements` |
| Edit | `GET|POST …/announcements/:id/edit`, `POST …/announcements/:id` |
| Confirm publish | `GET …/announcements/:id/publish` |
| Publish | `POST …/announcements/:id/publish` |
| Archive (soft end; no draft-unpublish) | `POST …/announcements/:id/archive` |

Hard-delete is not supported (soft archive only).

---

## Testing behavior (`DEPLOYMENT_ENV=testing`)

- Platform Admin may create, edit, publish, and archive within the **currently resolved tenant organization** (host / session tenant scope + church checks).
- CSRF remains required on all POSTs.
- Cross-organization writes remain blocked (`church` / scope mismatches).
- UI shows: **“Testing mode: Platform Admin publishing enabled”** (`data-bb-announcement-testing-platform-admin-publish="1"`) for Platform Admin sessions.

---

## Production behavior

- Platform Admin may still inspect (read) and use the legacy draft write path when policy is off.
- Publish remains denied with:  
  `Platform admins may inspect announcements but cannot publish unless product policy allows it.`
- Explicit opt-in flag `BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH=1` still works (unchanged escape hatch).
- HQ / branch roles unchanged.

---

## Audit behavior

Successful create / update writes append `platform.audit_events` via `recordBlessBoardAudit`:

| Transition | `action_key` |
|------------|--------------|
| Create | `announcement_created` (+ `announcement_published` if created published) |
| Edit (no status change) | `announcement_updated` |
| Publish | `announcement_published` |
| Archive | `announcement_archived` |

Metadata is allowlisted only (`status`, `from_status`, `to_status`, `title_len`, `actor_type`, `source`). No applicant body/PII.

---

## Tests

`tests/blessboard-announcement-platform-admin-testing-policy.test.js`

- Policy resolution (testing / production / NODE_ENV / explicit flag)
- Capability matrix for platform vs non-platform
- Service: testing create/edit/publish/archive + audit rows
- Service: production publish denied
- Service: HQ still works; cross-org blocked
- HTTP: testing banner + CSRF + publish; production HTTP deny; branch admin no banner

Also re-run existing `tests/blessboard-announcements.test.js` for regression.
