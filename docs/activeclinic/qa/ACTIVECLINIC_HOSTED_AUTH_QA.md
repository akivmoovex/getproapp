# ActiveClinic hosted authenticated QA

**Date:** 2026-08-25  
**Branch:** `V7`  
**Hosted:** `https://activeclinic.pronline.org`  
**Verdict:** `ACTIVECLINIC_HOSTED_AUTH_QA_COMPLETE_WITH_GAPS`

Does not document passwords, cookies, or tokens.

## Runtime

```text
branch=V7
origin/V7=662cf542a8a9e12a4f1f695ed9cffa1a8b01c9a8
hosted SHA (QA execution)=662cf542a8a9
hosted current at QA execution=YES
environment=testing
database=moovex-platform-v7
deployment=moovex-platform-testing
```

QA infrastructure and the patient clinic-context isolation fix were committed after these hosted runs. Re-check foreign-clinic denial and patient logout after the next testing deployment.

```text
PRODUCTION TOUCHED: NO
MAIN MERGED: NO
```

## Strategy

```text
DISPOSABLE_QA_TENANT
```

Existing `purgeActiveClinicTestingOrganization` is scoped, testing-gated, and refuses reserved demo keys. Option A (permanent QA clinic) was not required. Option C (demo clinic + disposable identities) was rejected because cleanup of demo bookings/users is ambiguous.

Fixture workflow: `docs/activeclinic/qa/HOSTED_QA_FIXTURE.md`.

## Staff authenticated QA (hosted)

```text
login: PASS (GET /login 200, POST /login 303 /app)
clinic selector: N/A (single membership → /app)
dashboard: PASS (/app 200)
onboarding: PASS with flake (MF05 200; one run 303 /login)
website hub: PASS
CMS sub-route: PASS (/app/settings/website/pages and /publish)
staff invite: PASS (GET + create 200 invitation-created; EMAIL_INVITE_GATED)
logout: PASS (staff 303, session cookie cleared)
```

Website CMS POST `/clinics/:key/website/publish` returned 303 to the publish page after a fresh CSRF fetch. Fixture-side publish (same product services) made the clinic public so patient/booking QA could run.

## Patient authenticated QA (hosted)

```text
registration: PASS (guest-token register 303 to login)
login: PASS (303 to patient dashboard)
dashboard: PASS (MF09, Welcome, pending booking, Book/Profile CTAs)
profile: PASS
booking linkage: PASS (guest token from MF10 success)
booking detail: PASS (Pending clinic confirmation)
logout: FAIL (POST /patient/logout 500 on hosted SHA 662cf542)
```

Deferred widget copy on MF09 names labs/medications as unavailable. Widget/CTA patterns for labs, medications, telehealth, and MF11 were absent.

## Hosted mobile QA (390×844 Playwright)

```text
MF05: PASS (no horizontal overflow)
MF06: PASS
MF07: PASS
MF09: PASS
```

## Session / security boundaries

```text
patient → /app: PASS (303)
staff → patient: PASS (403)
foreign booking / wrong clinic: FAIL on hosted SHA 662cf542
  GET /clinics/activeclinic-demo/patient with disposable patient session
  returned 200 with MF09 dashboard chrome (session not bound to URL clinic).
  Local fix: wrong_clinic_context → 403 in loadActiveClinicPatientAuth.
  Hosted evidence of the fix requires the next testing deploy.
logout: staff PASS; patient 500 on current hosted SHA
cookie/session context: PASS
  moovex_platform_testing_sid HttpOnly+Secure+SameSite=Lax
  moovex_platform_testing_csrf Secure+SameSite=Lax (not HttpOnly)
  not BlessBoard cookie names
```

## Booking-to-portal continuity (hosted, disposable tenant)

```text
hosted full flow: PASS
pending copy consistent: PASS (MF10 success, dashboard, booking detail)
guest linkage: PASS
dashboard visibility: PASS
```

Cleanup purged booking requests, guest tokens, patients, and identities.

## Repeatability

```text
fixture/setup repeatable: YES
cleanup repeatable: YES (reason=purged; leftover ac-hqa/hosted-qa orgs=0)
second run: YES (run2 required checks passed in the last two --repeat executions)
```

Run1 can flake on an authenticated GET 303 to `/login` immediately after a successful dashboard. Retry is in the runner. Cleanup still ran.

## RBAC catalogue

```text
RBAC_CATALOGUE_ASSERTION: TEST_DEFECT
```

Migration `095_website_org_admin_publish.sql` grants `website.publish` / `restore` / `rollback` only to `activeclinic_organization_admin`. `network_admin` keeps view/edit/submit from `093`. The old “mirrors organization_admin” assertion was stale. Do not broaden `network_admin`. User-facing `network_admin` copy describes view/edit/submit only and must not claim the same powers as Organization administrator.

## Deferred feature absence

```text
OTP exposed: NO
SSO exposed: NO
Theme exposed: NO
patient labs exposed: NO
patient medications exposed: NO
telehealth exposed: NO
MF11 exposed: NO
EMAIL_INVITE_GATED: YES
```
