# V8 Development Policy

**Status:** Active  
**Branch:** `V8`  
**V7 baseline SHA:** `03a89106e2fef8a93e31015d160acf73ab59fd40`  
**Recorded:** 2026-09-20

## Purpose

V8 is the development line for GetPro **V2.0** product work (BlessBoard + ActiveClinic). It starts from the verified V7 baseline and evolves independently of production V7 traffic.

## Rules

1. **All V2 code goes to V8.** Features, fixes, and docs for the V2.0 line land on `V8` (and PRs targeting `V8`). Do not land V2 work on `V7`, `main`, or production-only branches.
2. **V7 and production remain untouched.** Do not merge V8 into V7, force-push V7, or change production V7 release process as a side effect of V8 work.
3. **Prefer shared platform code** for cross-product functionality (auth, identity, sessions, invitations, website engine, tenancy). Product-specific UI and domain logic stay in BlessBoard / ActiveClinic scopes.
4. **All database changes must be V7-compatible.** Migrations and schema edits must not break V7 runtime or require V7 to adopt V8-only shape. Prefer additive, reversible changes; no destructive production-facing cuts without an explicit, separate V7 plan. See [`docs/database/V8_DB_COMPATIBILITY_BASELINE.md`](../database/V8_DB_COMPATIBILITY_BASELINE.md).
5. **Every new feature requires automated tests.** No V8 feature merges without tests that cover the new behavior (unit and/or integration as appropriate to the area).
6. **V8 deploys separately to neuniversity.org.** V8 hosted validation and releases use the neuniversity.org deployment path only. See [`V8_HOSTINGER_TESTING_ENV.md`](./V8_HOSTINGER_TESTING_ENV.md).
7. **V7 continues on pronline.org.** Existing V7 hosted environments on pronline.org stay on the V7 line.
8. **No automatic migrations or deployments to production.** V8 work must not auto-migrate production databases or auto-deploy to production. Production changes require explicit operator approval and a documented release procedure.
9. **Use the V8 regression gate.** Before merge, run `npm run test:v8:regression` (add `--with-coverage` / `test:v8:regression:coverage` when shared-platform modules change). See [`docs/testing/V8_TEST_INFRASTRUCTURE.md`](../testing/V8_TEST_INFRASTRUCTURE.md). Tests must use disposable fixtures and must never delete hosted V7 data.
10. **Shared auth password policy.** Registration, invitations, recovery, and password changes must use `src/platform/auth/sharedPasswordPolicy.js`. See [`docs/security/V8_SHARED_AUTH_PASSWORD_SECURITY.md`](../security/V8_SHARED_AUTH_PASSWORD_SECURITY.md).
11. **Shared email/phone verification.** Use `src/platform/verification/sharedVerificationService.js`. Legacy null verification timestamps must not lock users out of login. See [`docs/security/V8_SHARED_VERIFICATION.md`](../security/V8_SHARED_VERIFICATION.md).
12. **Shared session & logout security.** Use `src/platform/session/sharedSessionSecurity.js`. V7/V8 must use distinct cookie names and prefer distinct signing secrets; logout and revoke must stay deployment-scoped. See [`docs/security/V8_SHARED_SESSION_SECURITY.md`](../security/V8_SHARED_SESSION_SECURITY.md).
13. **Shared RBAC & tenant isolation.** Use `src/platform/rbac/` for forged-ID rejection, decision mapping, and platform-admin least privilege. Keep product-owned permission catalogues. See [`docs/security/V8_SHARED_RBAC_TENANT_ISOLATION.md`](../security/V8_SHARED_RBAC_TENANT_ISOLATION.md).
14. **Shared website section management.** Use `src/platform/website/sections/` for validation, ordering, and lifecycle; keep BB/AC storage adapters. See [`docs/platform/V8_SHARED_WEBSITE_SECTIONS.md`](./V8_SHARED_WEBSITE_SECTIONS.md).
15. **Shared website publish & media persistence.** Draft/publish/restore and Hostinger media must stay V7-compatible: V8 writes `testing-v8/`, may read V7 `testing/` keys, never deletes shared media while referenced, and must not publish V8-only section shapes into shared snapshots. See [`docs/platform/V8_SHARED_WEBSITE_LIFECYCLE.md`](./V8_SHARED_WEBSITE_LIFECYCLE.md).
16. **Shared validation & error handling.** Use `src/platform/validation/` and `src/platform/http/sharedApiError.js` for reusable field checks and safe API errors with correlation IDs. Keep product business rules separate; preserve V7 `ok`/`code`/`reason` contracts. See [`docs/platform/V8_SHARED_VALIDATION.md`](./V8_SHARED_VALIDATION.md).
17. **Shared platform audit logging.** Use `src/platform/audit/` with `platform.audit_events`. Redact secrets/OTPs/patient PII; gate reads; critical security mutations must not ignore audit write failures. See [`docs/platform/V8_SHARED_AUDIT_LOGGING.md`](./V8_SHARED_AUDIT_LOGGING.md).

## Branch model (summary)

| Line | Branch | Hosted surface | Role |
|------|--------|----------------|------|
| V7 | `V7` | pronline.org | Current production / freeze baseline |
| V8 | `V8` | neuniversity.org | V2.0 development |

## Out of scope for this policy

This document does not authorize product feature implementation, schema rollout, or environment provisioning by itself. Those require separate V8 prompts and reviews.
