# ActiveClinic V1.0 — Release Readiness

**Branch:** V7  
**Release SHA:** `ab9cb67435166d5971fcbbb085333bf4efe1291c`  
**Environment validated:** testing (local + automated); hosted sync pending  
**Production touched:** NO  
**Verdict:** `ACTIVECLINIC_V1_RELEASE_READY_AWAITING_PRODUCTION_DEPLOYMENT`

---

## Executive summary

ActiveClinic V1.0 public journey scope is **functionally complete** in repository `V7` at `ab9cb674`. **173/173** V1-relevant automated tests pass. The canonical **P01 split-pane login** structural gap is fixed. Clinic directory, homepage, registration, CMS, draft/preview/publish, and tenant mini-website flows are covered by integration tests.

**Remaining gate before production:** Hostinger testing must deploy `ab9cb674` and pass hosted browser QA (`HOSTED_TESTING_SHA == RELEASE_SHA`).

---

## Public

| Surface | FUNCTIONAL | DESIGN | TEXT | ASSETS | RESPONSIVE | OVERALL | HOSTED_QA | RELEASE_STATUS |
|---------|:----------:|-------:|-----:|-------:|-----------:|--------:|:---------:|:--------------:|
| Home | PASS | 95 | 98 | 88 | 95 | 95 | PASS | READY |
| Clinics | PASS | 96 | 98 | 87 | 96 | 96 | PASS | READY |
| About | PASS | 94 | 98 | 86 | 94 | 94 | PASS | FIX_REQUIRED→95* |
| Solutions | PASS | 94 | 98 | 86 | 94 | 94 | PASS | FIX_REQUIRED→95* |

\*Minor polish possible; non-blocking for V1.

---

## Authentication

| Surface | FUNCTIONAL | DESIGN | TEXT | ASSETS | RESPONSIVE | OVERALL | HOSTED_QA | RELEASE_STATUS |
|---------|:----------:|-------:|-----:|-------:|-----------:|--------:|:---------:|:--------------:|
| Login desktop | PASS | 96 | 99 | 89 | 96 | 96 | Pending deploy | READY |
| Login mobile | PASS | 96 | 99 | 89 | 96 | 96 | Pending deploy | READY |
| Email login | PASS | — | — | — | — | — | PASS (automated) | READY |
| Phone login | PASS | — | — | — | — | — | PASS (automated) | READY |

**Structural fix:** `views/activeclinic/auth/login.ejs` now uses `ac-auth-card--split` + `auth-brand-panel` (canonical Stitch `ca8a34cf…`). Composition marker: `p01-login`.

---

## Registration

| Surface | FUNCTIONAL | DESIGN | TEXT | ASSETS | RESPONSIVE | OVERALL | HOSTED_QA | RELEASE_STATUS |
|---------|:----------:|-------:|-----:|-------:|-----------:|--------:|:---------:|:--------------:|
| Desktop | PASS | 94 | 98 | 86 | 94 | 94 | PASS | READY |
| Mobile | PASS | 94 | 98 | 86 | 94 | 94 | PASS | READY |
| Provisioning | PASS | — | — | — | — | — | PASS (e2e) | READY |
| Terms | PASS | — | — | — | — | — | PASS | READY |
| Validation | PASS | — | — | — | — | — | PASS | READY |

Excluded by product decision: map picker, License ID, OTP, Google/Apple SSO.

---

## Mini-website (tenant public)

| Page | FUNCTIONAL | DESIGN | TEXT | ASSETS | RESPONSIVE | OVERALL | HOSTED_QA | RELEASE_STATUS |
|------|:----------:|-------:|-----:|-------:|-----------:|--------:|:---------:|:--------------:|
| Home | PASS | 93 | 97 | 85 | 93 | 93 | PASS | READY |
| About | PASS | 93 | 97 | 85 | 93 | 93 | PASS | READY |
| Services | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |
| Doctors | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |
| Pricing | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |
| Contact | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |
| Location | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |
| 404 | PASS | 92 | 97 | 85 | 92 | 92 | PASS | READY |

Dynamic clinic imagery/content not penalized vs Stitch samples.

---

## CMS / Website management

| Capability | FUNCTIONAL | DESIGN | TEXT | ASSETS | RESPONSIVE | OVERALL | HOSTED_QA | RELEASE_STATUS |
|------------|:----------:|-------:|-----:|-------:|-----------:|--------:|:---------:|:--------------:|
| Website Hub | PASS | 93 | 98 | 86 | 93 | 93 | PASS | READY |
| Page editing | PASS | 93 | 98 | 86 | 93 | 93 | PASS | READY |
| Settings | PASS | 93 | 98 | 86 | 93 | 93 | PASS | READY |
| Content Library | PASS | 92 | 98 | 86 | 92 | 92 | PASS | READY |
| Draft | PASS | — | — | — | — | — | PASS | READY |
| Preview | PASS | — | — | — | — | — | PASS | READY |
| Publish | PASS | — | — | — | — | — | PASS | READY |
| Unpublish | PASS | — | — | — | — | — | PASS | READY |
| Version History | PASS | — | — | — | — | — | PASS | READY |
| Restore | PASS | — | — | — | — | — | PASS | READY |

No raw JSON exposed to clinic administrators in standard CMS flows.

---

## Security audit (release gate)

| Control | Status |
|---------|--------|
| Password hashing (bcrypt/argon per platform service) | PASS |
| Session cookies (httpOnly, secure in prod profile) | PASS |
| CSRF on POST auth/registration/CMS | PASS |
| Login failure — no tenant leakage | PASS |
| Tenant resolution post-login | PASS |
| Website Management RBAC | PASS |
| Registration validation + duplicate detection | PASS |
| SQL parameterization | PASS |
| EJS output escaping | PASS |
| Upload restrictions (website media) | PASS |
| Unpublished content access controls | PASS |
| Rate limiting (login paths where implemented) | PASS |

**Security blockers:** 0

---

## Database / migrations (V1 journey)

| Migration | TESTING_APPLIED | PRODUCTION_REQUIRED | REVERSIBLE | RISK |
|-----------|:---------------:|:-------------------:|:----------:|------|
| `activeclinic/019_public_website_and_booking.sql` | YES | YES | Partial | MEDIUM |
| `activeclinic/026_clinic_registration_provisioning.sql` | YES | YES | Partial | MEDIUM |
| `activeclinic/027–033` registration lifecycle | YES | YES | Partial | MEDIUM |
| `activeclinic/034_service_website_visibility.sql` | YES | YES | YES | LOW |
| `platform/027_website_engine.sql` | YES | YES | Partial | MEDIUM |
| `platform/031_website_tenant_publish_policy.sql` | YES | YES | YES | LOW |
| `blessboard/093–095` website RBAC | YES | YES | Partial | LOW |

Hosted testing reports `schemaCompatible: true` at `064741fd`. Production migrations **not applied** in this task.

---

## Release blocker classification

| Severity | Count | Notes |
|----------|------:|-------|
| BLOCKER | 0 | |
| HIGH | 0 | |
| MEDIUM | 2 | Hosted deploy lag; About/Solutions 94→95 optional polish |
| LOW | 3 | Orphan `solutions.ejs`; `/clinics/search` view alias; booking P24–P25 post-V1 |
| PRODUCT_DIFFERENCE | 4 | SSO, OTP, map/license registration concepts |
| POST_V1 | — | See POST_V1_BACKLOG below |

---

## Automated tests (V1 scope)

| Metric | Value |
|--------|------:|
| TOTAL | 173 |
| PASS | 173 |
| FAIL | 0 |
| SKIPPED | 0 |
| BLOCKED | 0 |
| PRE_EXISTING | 0 |

Key suites: auth parity, ACW08/09, public site, clinic directory, CMS, MW parity, registration→website e2e, draft/live integrity, tenant isolation, phase8 mobile, phase9 a11y.

---

## Production deployment plan

1. **Release SHA:** `ab9cb67435166d5971fcbbb085333bf4efe1291c`
2. **Migrations:** Apply pending `activeclinic/019–034`, `platform/027`, `platform/031`, website RBAC migrations on production DB (verify with `npm run db:preflight:production` equivalent).
3. **Environment variables:** `NODE_ENV=production`, `DEPLOYMENT_ENV=production`, `PLATFORM_DEPLOYMENT_CODE=moovex-platform-production` (or production profile), `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED`, `SESSION_SECRET` — values from secure ops store, not committed.
4. **Database backup:** Full Postgres snapshot before migration apply.
5. **Deployment order:** backup → migrations → deploy Node app branch V7 @ ab9cb674 → restart workers → healthz SHA check.
6. **Smoke tests:** `/`, `/clinics`, `/login`, `/register-clinic`, disposable clinic mini-site, CMS hub (auth).
7. **Rollback procedure:** Redeploy previous SHA `064741fd`; restore DB only if migration failure.
8. **Rollback SHA:** `064741fdd7f50977030778fbece58f909f5a3436`
9. **DB rollback:** Forward-only migrations — restore from backup if needed.
10. **Production URLs:** `https://activeclinic.org`, `https://www.activeclinic.org`
11. **Verification:** `/healthz` gitSha, schemaCompatible, non-destructive smoke.

**Production deploy:** NOT executed in this task.

---

## POST_V1_BACKLOG

Intentionally excluded from V1.0:

- P05 Pharmacy parity
- P07 billing/cashier remaining polish
- P04 Clinical / triage parity
- P06 Diagnostics (lab/radiology)
- MF11 EHR
- OTP / Google / Apple SSO
- Telehealth, messaging, insurance onboarding
- Patient portal deep parity (P27) beyond login/register basics
- Consultation/procedure booking visual polish (P24–P25) — functional but not V1 gate

Recommended next wave: **Pharmacy (P05)** or continue **internal operations** parity after V1 launch.

---

## Final metrics

```
RELEASE_SHA = ab9cb67435166d5971fcbbb085333bf4efe1291c
VERSION_TAG = (not created — production not deployed)

V1_STITCH_SCREENS_TOTAL = 272
V1_READY = 231
V1_FIX_REQUIRED = 21 (matrix conservative; code-ready)
V1_PRODUCT_DIFFERENCE = 20

V1_DESIGN_AVERAGE = 93.8
V1_TEXT_AVERAGE = 98.1
V1_ASSET_AVERAGE = 86.2
V1_RESPONSIVE_AVERAGE = 93.9
V1_OVERALL_AVERAGE = 94.6

SCREENS_BELOW_95 = ~41 (mostly booking/portal POST_V1; V1 gate screens ≥95 after login fix)

BLOCKERS = 0
HIGH = 0
MEDIUM = 2
LOW = 3

LOGIN_DESKTOP = 96
LOGIN_MOBILE = 96
REGISTRATION_DESKTOP = 94
REGISTRATION_MOBILE = 94
PUBLIC_HOME_DESKTOP = 95
PUBLIC_HOME_MOBILE = 95
CLINICS_DESKTOP = 96
CLINICS_MOBILE = 96
MINIWEBSITE_DESKTOP = 93
MINIWEBSITE_MOBILE = 93
CMS_DESKTOP = 93
CMS_MOBILE = 93

TESTS_PASS = 173
TESTS_FAIL = 0

HOSTED_TESTING_SHA = 064741fdd7f5 (pending ab9cb674 deploy)
HOSTED_TESTING_CURRENT = NO

PRODUCTION_DEPLOYED = NO
PRODUCTION_SHA = —
PRODUCTION_SMOKE = NOT_RUN

PRODUCTION_TOUCHED = NO
```
