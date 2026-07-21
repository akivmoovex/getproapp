# Foundation Instant Free Registration Implementation (Phase 4)

**Date:** 2026-07-19  
**Route:** `GET|POST /register-church`  
**Orchestrator:** `provisionRegisteredBlessBoardChurch` (unchanged; sole provisioning path)

---

## 1. Previous flow

Public registration collected enquiry fields, inserted one row into
`blessboard.platform_church_registration_applications` with legacy `status=pending`,
and redirected to `?submitted=1`. No tenant, user, subscription, or session was created.

---

## 2. Configuration switch

| Item | Value |
|------|--------|
| Env key | `BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED` |
| Module | `src/blessboard/config/instantFreeProvisioningEnabled.js` |
| Default | **on** when unset (`default_enabled`) |
| Disable tokens | `0` / `false` / `no` / `off` (emergency enquiry-only) |
| Enable tokens | unset / `1` / `true` / `yes` / `on` |
| Unsupported | fail-closed **disabled** |
| Startup log | Same pattern as media uploads |

Query parameters and form fields **cannot** override the server flag.

Only canonical Foundation (`foundation` / `free` / `basic`) and Growth use automatic provisioning when enabled. Network remains enquiry / support-contact only (never auto-provisions a tenant or subscription).

The env key retains the historical `INSTANT_FREE` name; it also gates Growth trial auto-provision.

---

## 3. Form changes

When the flag is on, the form additionally collects:

- `organization_key` (requested path key)
- `password` / `password_confirm` (never repopulated on error)

Copy clarifies:

- administrator portal available immediately for Foundation and Growth
- Growth includes a 30-day trial (`trialing`)
- Network remains a support-contact request (no tenant)
- public site stays unpublished
- future public path preview `/c/<organization-key>`
- BlessBoard may offer optional onboarding help (callback not required for access)

CSRF hidden field, `Cache-Control: no-store`, same-origin relative `action="/register-church"`, and non-JS submission are preserved.

---

## 4. Validation

- Reuses existing field rules for name, location, contact, phone, plan, Terms.
- Instant Free adds organization-key normalization via `organizationKey.js` (reserved/invalid rejected; no silent suffix).
- Password policy matches V5 user create / orchestrator: length 10–200; confirmation must match.
- Passwords are never stored on the application, logged, audited, flashed, or echoed into form locals.

---

## 5. Application creation

`createApplicationIdempotent` inserts exactly one application per email+church within a 15-minute window using `pg_advisory_xact_lock(hashtext(...))` (no migration).

New rows explicitly set:

- `application_status = submitted`
- `provisioning_status = not_started`
- legacy `status = pending` (compatibility only)

---

## 6. Orchestrator handoff

After insert, the route calls **only** `provisionRegisteredBlessBoardChurch` with:

- application ID
- administrator password
- requested organization key
- request ID
- `actorContext: { type: public_self_registration, source: register_church, … }`

Public plan `foundation` maps to catalogue plan `free` inside the orchestrator. No payment, domains, or email sends in the provisioning transaction.

---

## 7. Legacy-status compatibility

| Event | Canonical | Legacy `status` |
|-------|-----------|-----------------|
| Insert | submitted / not_started | pending |
| Instant success | closed / provisioned | **closed** (synced) |
| Duplicate email review | duplicate_review / not_started | pending (unchanged) |

Canonical fields are authoritative. `countPending` prefers `application_status`.  
**Later cutover (post Phase 5):** stop writing/reading legacy `status`, then drop the column in a dedicated migration.

---

## 8. Auto-login

After a successful **committed** provision:

1. `establishBlessBoardSession` (shared helper also used after password verification in `authenticateBlessBoardUser`)
2. Set HttpOnly / SameSite=Lax / Secure-in-production cookie (new opaque token replaces any prior session cookie value)
3. Redirect `303` to `/account`

V5 does not use Express `session.regenerate`; issuing a new `platform.deployment_sessions` token replaces the prior opaque cookie.

---

## 9. Interim post-provision destination

| Outcome | Destination |
|---------|-------------|
| Session OK | `/account` (existing authorized V5 page) |
| Session fail | `/register-church?ready=1&login=1&key=<orgKey>&next=%2Faccount` success page with Sign-in CTA |

**Phase 7 replacement:** `/portal/:organizationKey` path portal resolver. Do not redirect to `/admin`, `/c/:key`, or platform-admin org detail from this flow.

---

## 10. Error mapping

| Orchestrator status | UX |
|---------------------|-----|
| `SLUG_UNAVAILABLE` | Rerender; field error on organization key |
| `DUPLICATE_EMAIL_REVIEW` | `303 ?review=1` neutral assistance copy |
| `PROVISIONING_IN_PROGRESS` | Safe in-progress message |
| Already provisioned | Treat as success → auto-login / ready page |
| `INVALID_PLAN` / `PLAN_CONFIGURATION_ERROR` | Temporary-unavailable (ops defect) |
| `PROVISIONING_FAILED` / DB unavailable | Safe retry message; no SQL/stack to browser |

---

## 11. Submission idempotency

Advisory-lock + recent email+church lookup prevents double-application inserts.  
Application ID remains the orchestrator idempotency key for concurrent / retried provision calls.

Passwords are never stored in the idempotency record.

---

## 12. Rate limiting

Existing register POST limiter retained; key is a hash of IP + normalized email (when present) so shared office IPs are less bluntly blocked. Friendly 429 HTML. Does not reveal email existence.

---

## 13. Security

- CSRF validate-before-rotate unchanged
- No plan/role/org-status chosen by public form beyond allowlisted plan codes
- Flag not overridable from client
- Secure / SameSite session + CSRF cookies unchanged
- No second provisioning implementation

---

## 14. Tests

Primary suite: `tests/blessboard-instant-free-registration.test.js`  
Also rely on existing orchestrator, transaction-composability, schema-status, register-church, and auth-http suites.

---

## 15. Rollout steps

1. Deploy with flag **off**; restart; smoke enquiry registration.
2. Confirm migration 027 applied; Free plan active; `max_branches=1`.
3. Enable flag in **testing** only; restart.
4. Register one disposable Free church; verify DB + login + no domain.
5. Do **not** enable for production users before manual verification.

---

## 16. Manual verification

Incognito on `https://blessboard.org/register-church` (testing host as applicable) with a uniquely named Free church. Checklist: one application closed/provisioned, one org/church/branch/user, Free subscription, onboarding row, unpublished pages, no domain, session or login fallback, no secrets in logs.

---

## 17. Deferred work

| Phase | Work |
|-------|------|
| **5** | `/admin/registration-applications`, follow-up screens, dashboard cards |
| **7** | `/portal/:organizationKey` resolver, `/c/:organizationKey` public path |

---

## 18. Scope confirmation

- No second provisioning path
- No admin application screen / dashboard item
- No path-based public church route or full portal resolver
- No custom domain, payment, email-verification subsystem
- No migration created or executed in this phase
- CSRF/session protections not weakened; runtime DDL disabled; `GETPRO_DATABASE_URL` unused; V4 unchanged
