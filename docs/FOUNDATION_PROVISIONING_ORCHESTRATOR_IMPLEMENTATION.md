# Foundation Provisioning Orchestrator Implementation (Phase 3)

**Date:** 2026-07-19  
**Service:** `provisionRegisteredBlessBoardChurch`  
**Scope:** Shared orchestrator only — not wired to `/register-church`.

---

## 1. Orchestrator contract

**File:** `src/blessboard/services/provisionRegisteredBlessBoardChurch.js`  
**Export:** `provisionRegisteredBlessBoardChurch(db, input, options?)`

```js
input = {
  applicationId,              // required UUID
  administratorPassword,      // required plaintext; hashed before TX
  requestedOrganizationKey?,  // optional override; else slugified church_name
  requestId?,
  actorContext?: { type?, source?, dataEnvironment?, deploymentCode? }
}

options = {
  allowRetry?: boolean        // default false
}
```

Canonical application payload is **reloaded and locked** inside the transaction. Browser duplicates of church name/email/plan are not trusted as write authority.

---

## 2. Application locking

`platformChurchRegistrationRepository.lockApplicationById(client, id)`  
→ `SELECT … FOR UPDATE` on `blessboard.platform_church_registration_applications`.

---

## 3. Eligibility and retry rules

| State | Behavior |
|-------|----------|
| `provisioned` + `organization_id` | Return existing records, `alreadyProvisioned: true` |
| `provisioning` | `PROVISIONING_IN_PROGRESS` |
| `duplicate_review` | `DUPLICATE_EMAIL_REVIEW` (no provision) |
| `rejected` / `cancelled` | `APPLICATION_NOT_ELIGIBLE` |
| `closed` without provisioned | `APPLICATION_NOT_ELIGIBLE` |
| `provisioning_failed` + `allowRetry: false` | `RETRY_NOT_ALLOWED` |
| `provisioning_failed` + `allowRetry: true` | Retry after re-validation |
| `submitted` + `not_started` | Proceed |

---

## 4. Password-hashing boundary

- Validate password length (10–200) **before** TX.  
- `bcrypt.hash` **before** TX (`BCRYPT_ROUNDS` from user service).  
- Pass `passwordHash` into `createBlessBoardUser` (plaintext never logged / never stored on application).  
- Existing-email path does **not** compare or overwrite passwords.

---

## 5. Product and plan validation

- Product `blessboard`, plan `free` (maps public `foundation`/`basic` → `free`).  
- Plan must be active and belong to BlessBoard.  
- Entitlements: `max_branches = 1`, `custom_domain` / `custom_email` not true.  
- Assignment via existing `provisionPlatformTenant` → `assignOrganizationPlan(..., free)`.

---

## 6. Organization-key policy

Helper: `src/blessboard/services/organizationKey.js`

- NFKD + ASCII slugify, must match `^[a-z][a-z0-9_-]{0,63}$`  
- Reserved-key reject (admin, login, c, portal, …)  
- Exact unique check; **no silent suffix** → `SLUG_UNAVAILABLE`

---

## 7. Duplicate-email handling

If `blessboard.users.email_normalized` exists:

1. Outer TX rolls back (no tenant writes).  
2. Short TX sets `application_status=duplicate_review`, `provisioning_status=not_started`.  
3. Return `DUPLICATE_EMAIL_REVIEW`.

---

## 8. Atomic creation sequence

```text
BEGIN
  lock application
  eligibility + plan + slug + email checks
  mark provisioning
  provisionPlatformTenant(skipDomain:true, manageTransaction:false)
  provisionBlessBoardChurch(manageTransaction:false)
  createBlessBoardUser(passwordHash, manageTransaction:false)
  assignBlessBoardRole hq + branch_admin
  ensure draft public_pages (unpublished)
  insert organization_onboarding (follow_up=new)
  link application; closed + provisioned
  success audit
COMMIT
```

On failure: ROLLBACK → short TX `provisioning_failed` + safe error fields.

---

## 9. Domain behavior

`provisionPlatformTenant` accepts `skipDomain: true` (CLI default unchanged). Orchestrator always passes `skipDomain: true`. Zero `platform.domains` rows.

---

## 10–12. Starter pages / onboarding / success state

- Draft shells for all `PUBLIC_PAGE_KEYS` via `ensureDraftPage` (status `draft`, no fabricated content).  
- `blessboard.organization_onboarding` 1:1 with `follow_up_status=new`.  
- Success: `application_status=closed`, `provisioning_status=provisioned`, `organization_id`, `provisioned_at`.

---

## 13–14. Failure state

- Tenant rows removed by outer rollback.  
- Application: `provisioning_status=provisioning_failed`, timestamps + sanitized code/detail.  
- `application_status` stays `submitted` (except duplicate_review path).

---

## 15–17. Idempotency / concurrency / tests

- Same `applicationId` after success → existing org, no duplicates.  
- Concurrent calls share `FOR UPDATE`; one provision, both succeed with same org.  
- Suite: `tests/blessboard-provision-registered-orchestrator.test.js` (8 cases).  
- Regressions: CLI provision, TX composability, register-church, schema 027 — green.

---

## 18. Compatibility

- `/register-church` unchanged (enquiry insert only).  
- CLI still uses standalone `manageTransaction: true`.  
- No migrations in this phase.

---

## 19. Deferred Phase 4

- Wire POST `/register-church` to collect password + call orchestrator.  
- Session regenerate + auto-login.  
- Feature flag for instant provision.  
- Admin applications UI.

---

## 20. Scope confirmation

No route wiring, no portal/admin/dashboard, no migrations, no permanent live tenants from this phase, no V4 changes, no custom domains for Free orchestrator path.
