# V2.04 BB Registration Auto-Login — Root Cause + Minimal Fix

**BUG_ID:** `BB-REG-AUTO-LOGIN-01`  
**Date:** 2026-10-02  
**Scope:** BlessBoard post-registration session establishment only. Hostinger process config untouched.

---

## Root cause

Registration auto-login called `establishBlessBoardSession` with **forced** `organizationId` / `churchId` / `branchId` from provision records.

Normal `/login` calls the same helper with only `userId` + `deploymentCode` (+ optional `requireOrganizationId`) and derives org/church/branch from **catalogue preferred role**.

`establishBlessBoardSession` previously preferred forced IDs over catalogue (`input.churchId || preferred.church_id`). Failures were remapped through an empty `catch` to opaque `transaction_error`, so Hostinger logs could not show the underlying fault.

Identity, roles, tenant provision, and session store were already healthy (proven by subsequent `/login` success).

**ROOT_CAUSE**=registration forced org/church/branch into establishBlessBoardSession while login derives tenant from catalogue preferred role; errors swallowed as transaction_error

---

## Minimal fix

| Change | File |
|--------|------|
| Session tenant ids always from `preferCatalogueSessionRole` / member scope via `sessionTenantContextFromPreferred` | `src/blessboard/services/establishBlessBoardSession.js` |
| Ignore forced `organizationId`/`churchId`/`branchId` overrides on create | same |
| Classify thrown errors (`failureCode`, scrubbed `message`, `pgCode`, `constraint`) — no tokens | same |
| Preserve create-session failure codes (`session_create_failed`) | same |
| Registration passes `requireOrganizationId: records.organizationId` only (multi-church pin) | `src/blessboard/http/apexMarketingRoutes.js` |
| Failure logs include classified cause fields | same |

Normal `/login` unchanged (already used `requireOrganizationId` only).

---

## Required behavior (verified)

- Session created after successful church registration  
- Correct church context (esp. multi-church → newly created org)  
- Administrator catalogue roles available  
- Set-Cookie issued  
- Redirect `303` → `/hq`  
- Failed session create: provision remains committed; no auth cookie  

---

## Tests

`tests/v2-04-bb-registration-auto-login.test.js` — 8/8 PASS

Also green: `tests/v2-04-bb-post-registration-dashboard.test.js`, `tests/v2-02-bb-catalogue-only-rbac.test.js` (focused run).

---

## End report

```
ROOT_CAUSE=registration forced org/church/branch into establishBlessBoardSession; login derives catalogue preferred role; errors swallowed as transaction_error
SHARED_TENANT_CONTEXT=PASS
AUTO_SESSION=PASS
POST_REG_REDIRECT=/hq
MULTI_CHURCH=PASS
TENANT_ISOLATION=PASS
FOCUSED_TESTS=8/8
FINAL=V2_04_BB_REGISTRATION_AUTO_LOGIN_FIXED
```
