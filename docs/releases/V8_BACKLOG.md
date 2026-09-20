# V8 Product Backlog

**Branch:** `V8` only  
**Canonical file:** `docs/releases/V8_BACKLOG.md`  
**Scope:** Open product/engineering issues deferred to the V8 line.  
**Do not** implement fixes from this file until a dedicated V8 work prompt authorizes them.  
**Do not** modify `V7` or `V7-first-production` for backlog documentation.

| ID | Title | Product | Severity | Status |
|----|-------|---------|----------|--------|
| V8-001 | Transactional email delivery | Shared (BlessBoard + ActiveClinic) | P2 | OPEN |
| V8-002 | ActiveClinic organization administrator patient creation | ActiveClinic | P3 | OPEN |
| V8-003 | BlessBoard catalogue-only role login | BlessBoard | P3 | OPEN |

Source notes: production functional QA (2026-09-21) recorded `PASSWORD-EMAIL-DELIVERY` (P2), `AC-ORG-ADMIN-NO-PATIENT-CREATE` (P3), and `BB-CATALOGUE-ROLE-LOGIN` (P3).

---

## V8-001 — Transactional email delivery

| Field | Value |
|-------|-------|
| **ID** | V8-001 |
| **Title** | Transactional email delivery |
| **Severity** | P2 |
| **Status** | OPEN |
| **Product** | Shared (BlessBoard + ActiveClinic) |

### Current behavior

Outbound transactional email (including password-reset delivery) is not configured for real end-user SMTP delivery. Production QA completed reset flows via controlled token capture; live email delivery remains blocked by the unavailable/stub adapter.

### Required work

1. Configure and verify production-capable transactional email transport for shared auth flows (password reset minimum).
2. Preserve existing capture/test adapters for disposable QA.
3. Do not send mail to unrelated recipients during verification.
4. Document operator runbook and failure modes (`email_sending_unavailable` and equivalents).
5. Confirm BlessBoard and ActiveClinic password-reset request → deliver → complete paths on hosted V8 QA.
6. Keep SMS/WhatsApp/marketing out of scope unless separately authorized.

### Acceptance

Transactional password-reset email delivers on hosted V8 QA for authorized test identities, with automated coverage for adapter success and unavailable paths. Production cutover remains an explicit ops step (not auto-deployed by this backlog entry alone).

### Unresolved product decisions

- Accept P2 and document support-mediated reset temporarily, or require email delivery before declaring full production READY.

---

## V8-002 — ActiveClinic organization administrator patient creation

| Field | Value |
|-------|-------|
| **ID** | V8-002 |
| **Title** | ActiveClinic organization administrator patient creation |
| **Severity** | P3 |
| **Status** | OPEN |
| **Product** | ActiveClinic |

### Current behavior

The ActiveClinic `org_admin` role does not automatically have `patient.create` permission.

A production QA test required assigning `activeclinic_receptionist` to create a synthetic patient.

### Required work

1. Review the intended `org_admin` permission model.
2. Decide whether `org_admin` should inherit `patient.create` or require an additional operational role.
3. Document the approved permission matrix.
4. Implement the approved behavior.
5. Verify UI and API authorization.
6. Confirm tenant isolation and audit logging.
7. Preserve existing receptionist and clinical staff permissions.

**Do not** automatically grant `patient.create` before the product policy is approved.

### Acceptance

The approved permission model is implemented and passes automated and hosted V8 QA.

### Unresolved product decisions

- Should `org_admin` inherit `patient.create`, or must operational patient creation require an explicit role (e.g. receptionist)?

---

## V8-003 — BlessBoard catalogue-only role login

| Field | Value |
|-------|-------|
| **ID** | V8-003 |
| **Title** | BlessBoard catalogue-only role login |
| **Severity** | P3 |
| **Status** | OPEN |
| **Product** | BlessBoard |

### Current behavior

Users assigned only catalogue roles such as `website_editor` or `website_publisher` cannot establish a login session.

Login returns `no_active_role` unless an appropriate legacy role is also assigned.

### Required work

1. Investigate authentication and role resolution.
2. Allow valid active catalogue-only organization memberships to establish sessions.
3. Preserve existing legacy role compatibility.
4. Enforce the exact catalogue permissions.
5. Do not grant broad legacy admin roles automatically.
6. Verify `website_editor` can edit but cannot publish.
7. Verify `website_publisher` can publish only where explicitly authorized.
8. Reject suspended memberships and cross-tenant access.
9. Test email login, phone login, session creation, and direct API authorization.

### Acceptance

Catalogue-only users can authenticate and perform only their assigned actions, with hosted V8 QA evidence.

### Unresolved product decisions

- Confirm catalogue-only BlessBoard roles are login-eligible without a companion legacy `user_roles` assignment (product policy).
