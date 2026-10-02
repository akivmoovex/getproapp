# V2.03 QA — Hosted Critical Verification (QA13B)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_HOSTED_CRITICAL_VERIFICATION` |
| **Date** | 2026-09-27 |
| **Mode** | TESTING / `*.pronline.org` only |
| **Production** | **UNTOUCHED** |
| **Prerequisite** | `V203_HOSTED_SHA_ALIGNMENT_PASS` |
| **Verdict** | **`V203_HOSTED_CRITICAL_VERIFICATION_PASS`** |
| **Evidence** | `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.json` |

---

## Preflight (re-verified)

| Check | Expected | Observed | Result |
|-------|----------|----------|--------|
| Hosted SHA (AC + BB) | `039ad22193c9` (`039ad22193c97759ce9bd5ca73fe56b0e38886ab`) | AC `039ad22193c9` · BB `039ad22193c9` | PASS |
| Deployment | `moovex-platform-testing` | both hosts | PASS |
| Environment | `testing` | both hosts | PASS |
| DB identity | `moovex-platform-v7` / `testing` | both hosts | PASS |
| Schema compatible | `true` | both hosts | PASS |
| Migration ceiling | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** | match (+ seeds/**009**) | PASS |
| Production abort | distinct from testing | `moovex-platform-production` / `03a89106e2fe` | UNTOUCHED |

---

## Fixture note (testing only)

Post-PL10 testing DB lacked reserved demo tenants. Non-destructive testing seeds applied against `moovex-platform-v7` / `testing` only:

- `activeclinic:seed-demo-clinics` + `activeclinic:seed-qa-role-users`
- `blessboard:test-users:seed` (creates `demo-church`) + partial `blessboard:seed-qa-role-users` (HQ/branch QA emails login-ready)

Production was not contacted for writes.

---

## Verification summary

| Area | Result |
|------|--------|
| Platform health/startup | PASS |
| Session/login (AC + BB QA users) | PASS |
| Product host routing | PASS |
| Static assets (home CSS/JS) | PASS |
| CSRF basics (login cookie + `_csrf`) | PASS |
| Tenant resolution (clinic/church public) | PASS |
| BlessBoard home / login / register-church / HQ portal / website editor / CMS / media / publish review / public | PASS |
| ActiveClinic home / clinics / login / register-clinic / staff app / booking / patient login / Batch 1–3 critical routes / website | PASS |
| No 500 on critical routes | PASS |
| No unexpected redirect loop | PASS |
| No cross-product chrome leakage | PASS |
| No schema-lag / 42703 / missing relation | PASS |

**Counts:** 79 PASS / 0 FAIL.

### Isolation note

`GET https://blessboard.pronline.org/clinics/activeclinic-demo` returns BlessBoard V5 unimplemented stub (`503`, body “not yet available…”) with **no** ActiveClinic chrome. Counted as isolation OK (not host leakage); not a claimed BB product route.

---

## Required block

```text
V203_HOSTED_CRITICAL_VERIFICATION_PASS

EXPECTED_SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
HOSTED_BB_SHA: 039ad22193c9
HOSTED_AC_SHA: 039ad22193c9
DEPLOYMENT: moovex-platform-testing / testing
DB_IDENTITY: moovex-platform-v7 / testing
DB_CEILING: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
PRODUCTION: UNTOUCHED
FAILURES: none
```
