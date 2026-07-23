# PHASE2_007 — Permission Audit

**Date:** 2026-07-23  
**Mode:** Documentation only — **permissions not modified**  
**Scope:** BlessBoard V5 Platform Admin

---

## Current model

| Layer | Reality |
|-------|---------|
| Host | Apex only (`requireApex`) |
| AuthN | V5 session (`req.v5Session`) |
| AuthZ | Single role: `blessboard.user_roles.role_key = 'platform_admin'` AND status active |
| Middleware | Inline `requirePlatformAdmin` in `platformAdminRoutes.js` |
| CSRF | Required on all PA mutations via `validateCsrf` |
| Fine-grained permissions | **None** — no capability matrix, no `can_*` flags |
| Other roles | `church_hq_admin`, `branch_admin` — **cannot** access `/admin/*` |

**Implication:** Every Platform Admin who can open `/admin` can today approve, reject, assign, contact, link, and provision. Stitch screens imply more sensitive actions (manual email verify, overrides, view sensitive documents) that currently share the same gate.

---

## Access rules for Phase2 actions

Reuse `requireApex` + `requirePlatformAdmin` for all rows unless a future migration introduces capability flags. Document intended **logical** permissions for when splitting is needed.

| Action | Logical permission | Today | Reuse |
|--------|-------------------|-------|-------|
| **View applications** | `pa.registration.view` | Allowed for all `platform_admin` | `requirePlatformAdmin` on list/detail |
| **View sensitive details** | `pa.registration.view_sensitive` | Same as view (no split) | Same middleware; **do not** invent docs masking until documents exist |
| **Assign reviewer** | `pa.registration.assign` | Allowed | Existing `POST …/assign-support` |
| **Add internal note** | `pa.registration.note` | Allowed | Existing `POST …/contact` (`internal_note`) |
| **Run checks** | `pa.registration.run_checks` | N/A (new) | Same middleware when added |
| **Record phone call** | `pa.registration.phone_log` | Allowed via contact | Existing contact POST |
| **Verify phone** | `pa.registration.phone_verify` | Missing feature | Same middleware; treat as sensitive — require confirm + audit event |
| **Resend verification email** | `pa.registration.email_resend` | Missing | Same; rate-limit in service |
| **Change applicant email** | `pa.registration.email_change` | Missing | Same; confirm + audit; invalidates prior tokens |
| **Manually verify email** | `pa.registration.email_manual_verify` | Missing | Same; **highest sensitivity** among email actions — still only `platform_admin` today |
| **Review duplicate matches** | `pa.registration.duplicates` | Partial (risk only) | Same on new duplicate GETs |
| **Override warnings** | `pa.registration.override` | Missing | Same; **must** write `review_events`; consider future role split |
| **View audit history** | `pa.registration.audit_view` | Allowed on detail | Existing detail audit merge |

---

## Recommended reuse pattern

```text
requireApex → requirePlatformAdmin → (GET render | POST validateCsrf → service)
```

Do **not** introduce GetPro CRM roles or V4 church admin CSRF for these routes.

### Future split (out of scope to implement now)

If product needs dual control:

1. Keep `platform_admin` for view + notes + assign + phone log.  
2. Add capability flags or a second role only after product approval (e.g. `platform_admin` + `registration_approver`).  
3. Until then, gate sensitive POSTs with **explicit confirmation fields** + **audit events**, not new roles.

---

## Mapping to existing tests

| Concern | Test touchpoints |
|---------|------------------|
| Unauthenticated / non-admin blocked | `blessboard-platform-admin-shell.test.js`, login diagnosis |
| CSRF on mutations | `blessboard-v5-csrf-action-audit.test.js`, `blessboard-admin-registration-ops.test.js` |
| Registration ops auth | `blessboard-admin-registration-applications.test.js` |

---

## Risks

1. Stitch “View Sensitive” implies redaction — **no** document store or field-level ACL exists.  
2. Manual email verify + override are powerful under a single role — mitigate with confirmations and audit, not silent UI.  
3. Do not grant HQ/branch admins Platform Admin registration access.

---

## Runtime change confirmation

No permission middleware, roles, or checks were modified.
