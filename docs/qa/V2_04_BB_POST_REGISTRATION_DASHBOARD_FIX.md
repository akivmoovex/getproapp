# V2.04 BB Post-Registration Auto-Login + Dashboard

**BUG_ID:** `BB-POST-REG-DASHBOARD-01`  
**Date:** 2026-10-02  
**Scope:** BlessBoard church registration only (ActiveClinic unchanged).

---

## Bug

After successful church registration, users landed on the website editor/success detour (`/register-church/success?ref=…&ready=1`) instead of the HQ dashboard.

## Required behavior

1. Provision church + canonical user identity + church administrator roles  
2. Establish authenticated session via shared platform session (`establishBlessBoardSession` + `issueAuthenticatedSessionCookie`)  
3. Redirect **303 → `/hq`** (no second login)  
4. Preserve identity reuse, multi-church admin, tenant isolation, rollback, validation  

## Fix

**Redirect-only.** Auto-login already existed.

| Path | Change |
|------|--------|
| `src/blessboard/http/apexMarketingRoutes.js` | After provision + session, `303` to `/hq` instead of `buildRegistrationSuccessRedirect` |
| Success page GET `/register-church/success` | Retained (receipt / Edit website CTA still available by stored `ref`) |
| ActiveClinic | Untouched |

## Tests

Focused suite: `tests/v2-04-bb-post-registration-dashboard.test.js`

| Case | Assertion |
|------|-----------|
| A | New user → session cookie → Location `/hq` → GET `/hq` 200 authenticated |
| B | Reused phone/email identity → session → `/hq` → new church context |
| C | Role/provision failure → no session cookie → no `/hq` redirect → no partial org |
| D | Unauthenticated GET `/hq` → `/login?next=/hq` |
| E | After redirect, HQ shell shows newly provisioned church name |

Helper: `tests/helpers/blessboardRegistrationSuccess.js` — `assertChurchReadyHqRedirect` (alias `assertChurchReadySuccessRedirect`).

## End report

```
BB_REGISTRATION_REDIRECT=/hq
AUTO_LOGIN=PASS
TENANT_CONTEXT=PASS
FOCUSED_TESTS=5/5
FINAL=V2_04_BB_POST_REGISTRATION_DASHBOARD_FIXED
```

**Follow-up (2026-10-02):** Session establish opacity / forced tenant IDs closed in `V2_04_BB_REGISTRATION_AUTO_LOGIN_FIX.md` (`FINAL=V2_04_BB_REGISTRATION_AUTO_LOGIN_FIXED`).
