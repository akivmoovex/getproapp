# ActiveClinic MF01–MF10 final consolidation / QA

**Verdict:** `ACTIVECLINIC_MF01_MF10_FINAL_QA_COMPLETE_WITH_GAPS`  
**Hosted auth addendum:** `ACTIVECLINIC_HOSTED_AUTH_QA_COMPLETE_WITH_GAPS` (2026-08-25)  
**Date:** 2026-08-21 (consolidation); hosted auth 2026-08-25  
**Branch:** `V7`  
**Stitch project:** `projects/10611909237747031838` (ActiveClinic Universal Authentication Interface)  
**Does not overwrite:** `ACTIVECLINIC_MF01_MF11_LIVE_AUDIT.md` or earlier parity audits.

This is the consolidation checkpoint for MF01–MF10. MF11 remains deferred.

---

## Runtime lock

```text
branch=V7
starting SHA=6ff321357015b52053832b208f2ff367fd17fd98
integration SHA=d1a1433e
deployment=moovex-platform-testing
environment=testing
database=moovex-platform-v7
hosted SHA at audit start=6ff321357015
hosted current at audit start=YES
schemaCompatible=true
```

```text
PRODUCTION TOUCHED: NO
MAIN MERGED: NO
```

---

## Stitch inventory re-lock

```text
updateTime: 2026-08-21T00:22:14.887432Z
total screens: 100
MF01: 5
MF02: 4
MF03: 8
MF04: 7
MF05: 4
MF06: 4
MF07: 2
MF08: 6
MF09: 2
MF10: 5
MF11: 4
new screens since previous lock: none
```

MF01–MF10 = 47. MF11 = 4 (`MF11_DEFERRED`). No `NEW_FAMILY`. Missing Stitch MF10 mobile 04/06/08 remains a Stitch gap (`STITCH_DESIGN_ONLY`).

---

## Fixes made during consolidation

1. Guest booking success now links to patient registration, with the guest token prefilling the existing register field.
2. My Booking detail uses the same “Pending clinic confirmation” copy as MF10 success and the patient dashboard (no raw `submitted pending confirmation` string).
3. Guest booking access tokens are URL-encoded on the success page.

No schema change. No OTP/SSO/EHR/MF11.

---

## End-to-end journeys

### Clinic admin

| From | Action | Destination | Result |
| ---- | ------ | ----------- | ------ |
| `/` | Register / Find clinics | `/register-clinic`, `/clinics` | PASS |
| `/register-clinic` | clinic → admin → review → confirm | `/register-clinic/success` | PASS (local) |
| success | Sign in | `/login` | PASS |
| `/login` | valid credentials | `/app` or selector | PASS (local) |
| `/app` anonymous | — | `/login` | PASS (hosted 303) |
| `/app` | Open setup | `/app/onboarding` | PASS (local) |
| onboarding | Website step | `/app/settings/website` | PASS (local) |
| onboarding | Invite staff | `/app/staff/invite` | PASS (local) |
| `/app` | Staff app | staff modules by RBAC | PASS (local) |

Hosted authenticated admin steps: `NOT TESTED — no safe hosted disposable identity/purge path`.

### Patient

| From | Action | Destination | Result |
| ---- | ------ | ----------- | ------ |
| `/clinics` | Open published clinic | `/clinics/activeclinic-demo` | PASS (hosted) |
| clinic website | Book | `/book` | PASS (hosted) |
| booking wizard | submit | request submitted, pending | PASS (local) |
| success | View my booking | `/my-booking?token=` | PASS (local) |
| success | Create portal account | `/patient/register?guestToken=` | PASS (local; added this pass) |
| register / login | portal home | `/patient` | PASS (local) |
| dashboard | booking detail | `/patient/bookings/:ref` | PASS (local) |
| anonymous `/patient` | — | `/patient/login` | PASS (hosted 303) |

---

## MF01–MF10 status matrix

| Family | Function | Visual | Mobile | Hosted | Remaining gap |
| ------ | -------- | ------ | ------ | ------ | ------------- |
| MF01 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (public GET) | No OTP/SSO (deferred) |
| MF02 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (single-membership login → /app; selector not extra-membership tested) | Multi-clinic selector still locally covered |
| MF03 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | HOSTED_QA_GAP (auth) | No License ID / maps |
| MF04 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (GET forgot-password) | OTP screens omitted |
| MF05 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_GAPS (auth; occasional 303 /login flake) | Completion remains derived |
| MF06 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (`MF06_390_OVERFLOW = PASS`) | COMPLETE (auth hub + pages + publish GET/POST) | Theme / staging URL omitted |
| MF07 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (auth invite + create; `EMAIL_INVITE_GATED`) | `EMAIL_INVITE_GATED` |
| MF08 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (390 Playwright) | COMPLETE (GET register) | MFA/SSO/insurance omitted |
| MF09 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (390 Playwright) | COMPLETE_WITH_GAPS (auth dashboard; foreign clinic bleed on SHA 662cf542; logout 500) | EHR widgets omitted |
| MF10 | COMPLETE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE_WITH_ACCEPTED_VARIANCE | COMPLETE (hosted booking → portal on disposable tenant) | No live slots/copay/insurance |

---

## Remaining gap register

| Gap | Family | Classification | Recommendation |
| --- | ------ | -------------- | -------------- |
| OTP / MFA | MF04, MF08 | DEFERRED_PRODUCT | Do not implement without a product/security decision |
| Google / Apple SSO | MF01, MF08 | DEFERRED_PRODUCT | Keep omitted |
| Theme / staging URL | MF06 | ACCEPTED_PRODUCT_VARIANCE | Keep unpublished CMS hub |
| Email invite in testing | MF07 | DEFERRED_INTEGRATION | `EMAIL_INVITE_GATED` / `NOT_PRODUCTION` |
| Live slot grid | MF10 | ACCEPTED_PRODUCT_VARIANCE | Preferred date/time remains honest |
| Copay / insurance | MF10, MF09 | DEFERRED_PRODUCT | Staff billing is not patient billing |
| Labs / meds / messages / telehealth / records | MF09, MF11 | DEFERRED_PRODUCT | CURRENT-DATA-ONLY |
| Missing Stitch MF10 mobile 04/06/08 | MF10 | STITCH_DESIGN_ONLY | V7 already responsive |
| ClinicBuilder / HealLink brand | MF08 | STITCH_DESIGN_ONLY | Keep ActiveClinic |
| Authenticated hosted QA | several | CLOSED_WITH_GAPS | Disposable `ac-hqa-*` tenant + scoped purge; see `docs/activeclinic/qa/ACTIVECLINIC_HOSTED_AUTH_QA.md` |
| `KNOWN_DISPOSABLE_MF10_BOOKING` | MF10 | HOSTED_QA_LIMITATION | Demo clinic pending request; no single-row purge. Prefer disposable `ac-hqa-*` for new booking QA |
| Patient session on foreign clinic URL | MF09 | PRODUCT_FIX_PENDING_DEPLOY | Hosted SHA 662cf542 returned MF09 chrome on `activeclinic-demo`; local `wrong_clinic_context` 403 not yet hosted |
| Patient portal logout 500 | MF09 | HOSTED_QA_LIMITATION | `POST /clinics/:key/patient/logout` 500 on hosted SHA 662cf542 |
| network_admin vs org_admin `website.publish` catalogue test | RBAC | TEST_DEFECT | Assertion updated; do not broaden `network_admin` |
| Public vs patient vs app CSS asset versions | chrome | ACCEPTED_PRODUCT_VARIANCE | Shared teal tokens; not a design-system rewrite |

---

## Authentication / session

```text
public → app: 303 /login
patient → app: denied (hosted 303)
staff → patient: 403
patient A → patient B booking: 404 / not found (local)
patient A → foreign clinic patient URL: FAIL on hosted SHA 662cf542 (MF09 chrome); local fix 403 pending deploy
clinic context isolation: org/HCO scoped; unpublished clinic 404
cookie names: moovex_platform_testing_sid / _csrf (not BlessBoard)
```

---

## Publication / privacy

```text
new website default: unpublished
public visibility: published demo clinic public; unknown clinic 404
patient portal: login required
clinical data: not in public/patient shells
MF11: not implemented
```

---

## QA data register

| Artifact | Tenant/clinic | Purpose | Safe to remove | Cleanup method |
| -------- | ------------- | ------- | -------------- | -------------- |
| `KNOWN_DISPOSABLE_MF10_BOOKING` | `activeclinic-demo` | MF10 hosted pending request | No (demo tenant) | None — org purge would destroy the demo clinic |
| Disposable hosted-auth clinics | `ac-hqa-*` | Staff + patient hosted auth QA | Yes | `npm run activeclinic:hosted-auth-qa:testing -- --confirm` (purge included) |

Org-level `purgeActiveClinicTestingOrganization` exists but is not safe for the shared demo clinic. Hosted authenticated QA uses prefix-scoped disposable tenants only. See `docs/activeclinic/qa/HOSTED_QA_FIXTURE.md`.

---

## Tests (this pass)

Targeted V7 ActiveClinic set:

```text
passed: 176
failed: 1
skipped: 0
```

Hosted-auth pass (2026-08-25): `activeclinic-hosted-auth-qa-safety` 7/7; `activeclinic-rbac-role-matrix` 9/9.

The old failure `network_admin mirrors organization_admin permissions` was a **TEST_DEFECT**. Catalogue grants `website.publish` / restore / rollback only to `activeclinic_organization_admin` (migration 095). Do not broaden `network_admin`.

Major suites that passed include MF identity/03/05/07/08/09/10, ACW08/09 (including 390 Website Hub), public root, directory, patient portal, booking linkage, public booking, a11y, schema compatibility, tenant isolation, staff invitation, website settings UX, navigation RBAC.

```text
MF06_390_OVERFLOW = PASS
schema compatible: YES
42703 recurrence: NO in this pass
EMAIL_INVITE_GATED: YES
```

---

## MF11

```text
MF11 IMPLEMENTED: NO
MF11 STATUS: DEFERRED_PRODUCT
```

Patient clinical-record / lab-result release needs a separate product, privacy, and RBAC decision. Staff `activeclinic.lab.result` must not be reused for the portal.

---

## Recommended next step

```text
ACTIVECLINIC V7 RELEASE READINESS
```

Hosted authenticated QA now uses disposable `ac-hqa-*` tenants with scoped purge. Remaining hosted gaps: patient foreign-clinic session bleed (fix committed, not yet hosted), patient logout 500, occasional staff GET 303/login flake. Details: `docs/activeclinic/qa/ACTIVECLINIC_HOSTED_AUTH_QA.md`.
